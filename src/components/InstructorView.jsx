// ============================================================
// InstructorView — Full-screen map for class instructor
// New: "Simulate Race with Bots" button + bots on map
// ============================================================
import { useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import MapView from './MapView';
import MountainProfile from './MountainProfile';
import TrafficLight from './TrafficLight';
import Leaderboard, { PLAYER_DOT_COLORS } from './Leaderboard';
import { CITIES } from '../utils/cities';
import { useBots } from '../hooks/useBots';
import { fetchStreetRoute, sampleRoutePositions } from '../utils/routing';

// Independent traffic lights for the instructor map
function useInstructorTrafficLights(routeWaypoints, count = 5) {
    const [lights, setLights] = useState([]);
    const timersRef = useRef([]);

    useEffect(() => {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        if (!routeWaypoints || routeWaypoints.length < 2) return;

        const STATES = ['GREEN', 'YELLOW', 'RED', 'YELLOW'];
        const positions = sampleRoutePositions(routeWaypoints, count);
        const initial = positions.map((pos, i) => ({
            id: `tl_${i}`, position: pos,
            stateIdx: (i + Math.floor(Math.random() * 3)) % 4,
            // GREEN: 45-90s   YELLOW: 3s   RED: 15-25s — realistic timing
            durations: [
                45000 + Math.random() * 45000,  // GREEN
                3000,                            // YELLOW→RED
                15000 + Math.random() * 10000,  // RED
                3000,                            // YELLOW→GREEN
            ],
        }));

        setLights(initial.map(l => ({ id: l.id, position: l.position, state: STATES[l.stateIdx] })));

        initial.forEach(light => {
            let idx = light.stateIdx;
            function tick() {
                idx = (idx + 1) % 4;
                setLights(prev => prev.map(l => l.id === light.id ? { ...l, state: STATES[idx] } : l));
                const t = setTimeout(tick, light.durations[idx]);
                timersRef.current.push(t);
            }
            const t = setTimeout(tick, light.durations[idx]);
            timersRef.current.push(t);
        });

        return () => timersRef.current.forEach(clearTimeout);
    }, [routeWaypoints, count]); // eslint-disable-line

    return lights;
}

export default function InstructorView({ config, socket, onLeave }) {
    const { city, roomCode, radiusKm = 2, playMode = 'solo', mountainId } = config;
    const cityData = CITIES[city];
    const targetPos = cityData.center;

    const { trafficState, players, countdown, raceStarted, joinRoom, triggerStart, removeBots } = socket;

    const [countdownStarted, setCountdownStarted] = useState(false);
    const [simBotCount, setSimBotCount] = useState(8);
    const [simActive, setSimActive] = useState(false);
    const [routeWaypoints, setRouteWaypoints] = useState(null);

    useEffect(() => {
        joinRoom(roomCode, { name: 'Instructor', city, role: 'instructor', radiusKm, playMode, mountainId });
    }, []); // eslint-disable-line

    // Fetch route for map + bots
    useEffect(() => {
        const center = cityData.center;
        const startLat = center[0] + radiusKm / 111.32;
        fetchStreetRoute([startLat, center[1]], center)
            .then(result => {
                // fetchStreetRoute now returns {waypoints, steps, distKm}
                const wp = Array.isArray(result) ? result : result?.waypoints ?? null;
                setRouteWaypoints(wp);
            })
            .catch(() => { });
    }, [city, radiusKm]); // eslint-disable-line

    // Client-side bots — each gets its own unique OSRM route + traffic lights
    const { bots: botPlayers, routes: botRoutes, botLights } = useBots({
        count: simActive ? simBotCount : 0,
        targetPos,
        radiusKm,
        trafficState,
    });
    // Per-rider route cache: fetch a fresh OSRM route for each rider on first sight
    const riderRoutesRef = useRef({});
    const [riderRoutes, setRiderRoutes] = useState({});

    useEffect(() => {
        const riderPlayers = players.filter(p => p.role !== 'instructor');
        for (const p of riderPlayers) {
            if (riderRoutesRef.current[p.id] || !p.position) continue;
            riderRoutesRef.current[p.id] = 'pending'; // mark so we don't double-fetch
            const startPos = [...p.position];
            fetchStreetRoute(startPos, targetPos)
                .then(result => {
                    const wp = Array.isArray(result) ? result : result?.waypoints ?? null;
                    if (wp && wp.length > 1) {
                        riderRoutesRef.current[p.id] = wp;
                        setRiderRoutes(prev => ({ ...prev, [p.id]: wp }));
                    } else {
                        delete riderRoutesRef.current[p.id]; // retry next render
                    }
                })
                .catch(() => { delete riderRoutesRef.current[p.id]; });
        }
    }, [players, targetPos]); // eslint-disable-line

    // Clean up routes for disconnected riders
    useEffect(() => {
        const currentIds = new Set(players.map(p => p.id));
        const stale = Object.keys(riderRoutesRef.current).filter(id => !currentIds.has(id));
        if (stale.length > 0) {
            stale.forEach(id => delete riderRoutesRef.current[id]);
            setRiderRoutes(prev => {
                const next = { ...prev };
                stale.forEach(id => delete next[id]);
                return next;
            });
        }
    }, [players]);

    // Combine: bot routes + per-rider OSRM routes (no shared instructor route fallback)
    const playerRoutes = { ...botRoutes, ...riderRoutes };

    // Traffic lights: shared reference lights + all per-bot route lights
    const sharedLights = useInstructorTrafficLights(routeWaypoints, 3);
    const allBotLights = Object.values(botLights).flat();
    const mapTrafficLights = [...sharedLights, ...allBotLights];
    const joinUrl = `${window.location.origin}?room=${roomCode}`;

    const allPlayers = [
        ...players
            .filter(p => p.role !== 'instructor')
            .map((p, i) => ({ ...p, color: PLAYER_DOT_COLORS[i % PLAYER_DOT_COLORS.length] })),
        ...botPlayers,
    ];
    const riderCount = allPlayers.filter(p => !p.isBot).length + botPlayers.filter(p => p.isBot).length;

    function handleStart() {
        setCountdownStarted(true);
        triggerStart(roomCode);
        if (!simActive && simBotCount > 0) setSimActive(true);
    }

    function handleToggleBots() {
        if (simActive) {
            // Stop: remove client-side bots and server-side bots both
            setSimActive(false);
            removeBots(roomCode);
        } else {
            setSimActive(true);
        }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
            {/* Full-screen map or Mountain Profile */}
            {playMode === 'mountain' ? (
                <MountainProfile mountainId={mountainId} players={allPlayers} roomCode={roomCode} joinUrl={joinUrl} />
            ) : (
                <MapView
                    center={cityData.center}
                    zoom={cityData.zoom}
                    targetPosition={targetPos}
                    targetName={cityData.target}
                    players={allPlayers}
                    myId={null}
                    trafficState={trafficState}
                    mapTrafficLights={mapTrafficLights}
                    routeWaypoints={routeWaypoints}
                    playerRoutes={playerRoutes}
                    autoFit={true}
                />
            )}

            {/* ── TOP BAR ──────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 8,
                padding: 'clamp(6px, 1.2vh, 16px) clamp(10px, 2vw, 24px)',
                background: 'rgba(4,4,7,0.95)',
                backdropFilter: 'blur(16px)',
                borderBottom: '1px solid #1e1e2e',
            }}>
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <h1 style={{
                        fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                        fontSize: 'clamp(16px, 2.5vw, 28px)', fontWeight: 900, margin: 0,
                        background: 'linear-gradient(135deg,#fff 30%,#3b82f6 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        whiteSpace: 'nowrap',
                    }}>DARK VELOCITY</h1>
                    <span style={{ fontSize: 'clamp(8px, 1vw, 12px)', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, padding: '2px 8px', color: '#3b82f6', fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap' }}>INSTRUCTOR</span>
                    <span style={{ fontSize: 'clamp(9px, 1.2vw, 13px)', color: '#52526a', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{playMode === 'mountain' ? `⛰ ${mountainId}` : `${cityData.name} → ${cityData.target}`}</span>
                </div>

                {/* Controls — scrollable on very small screens */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <TrafficLight state={trafficState} />

                    {/* Bot simulation panel */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 10, padding: '5px 10px' }}>
                        <span style={{ fontSize: 12, color: '#a855f7', fontWeight: 700 }}>🤖</span>
                        <input
                            type="number" min={0} max={15} value={simBotCount}
                            onChange={e => setSimBotCount(Math.min(15, Math.max(0, Number(e.target.value))))}
                            style={{ width: 36, background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 6, color: '#e2e2f0', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 700, padding: '2px 4px', textAlign: 'center', outline: 'none' }}
                        />
                        <button onClick={handleToggleBots} style={{
                            background: simActive ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${simActive ? '#a855f7' : '#1e1e2e'}`,
                            borderRadius: 7, padding: '4px 10px',
                            color: simActive ? '#a855f7' : '#e2e2f0', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}>{simActive ? '⏹ STOP' : '▶ SIM'}</button>
                    </div>

                    {!countdownStarted ? (
                        <button onClick={handleStart} style={{
                            background: 'linear-gradient(135deg,#15803d,#22c55e)', border: 'none',
                            borderRadius: 10, padding: 'clamp(6px,1.2vh,10px) clamp(12px,1.5vw,20px)', color: '#fff',
                            fontWeight: 700, fontSize: 'clamp(11px, 1.4vw, 15px)', letterSpacing: 1, cursor: 'pointer',
                            boxShadow: '0 4px 20px rgba(34,197,94,0.4)', whiteSpace: 'nowrap',
                        }}>🏁 START</button>
                    ) : (
                        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 10, padding: 'clamp(6px,1.2vh,10px) clamp(12px,1.5vw,20px)', color: '#22c55e', fontWeight: 700, fontSize: 'clamp(11px, 1.4vw, 14px)', whiteSpace: 'nowrap' }}>
                            {raceStarted ? '🚀 LIVE' : countdown !== null ? `${countdown}…` : '✅ GO'}
                        </div>
                    )}

                    <button onClick={onLeave} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 'clamp(6px,1.2vh,10px) clamp(10px,1.2vw,16px)', color: '#ef4444', fontWeight: 700, fontSize: 'clamp(11px, 1.2vw, 13px)', cursor: 'pointer', whiteSpace: 'nowrap' }}>✕ END</button>
                </div>
            </div>

            {/* ── BOTTOM LEFT: QR + count (not shown in mountain mode — QR is in the side panel) */}
            {playMode !== 'mountain' && (
                <div style={{ position: 'absolute', bottom: 'clamp(10px, 2vh, 24px)', left: 'clamp(10px, 2vw, 24px)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 'clamp(6px, 1vh, 12px)' }}>
                    <div className="glass" style={{ borderRadius: 'clamp(10px, 1.5vw, 16px)', padding: 'clamp(8px, 1.5vw, 18px)', textAlign: 'center' }}>
                        <div style={{ background: '#fff', borderRadius: 8, padding: 'clamp(3px, 0.5vw, 8px)', display: 'inline-block', marginBottom: 6 }}>
                            <QRCodeSVG value={joinUrl} size={80} style={{ width: 'clamp(60px, 10vw, 120px)', height: 'clamp(60px, 10vw, 120px)', display: 'block' }} level="M" />
                        </div>
                        <p style={{ fontSize: 'clamp(9px, 1.2vw, 14px)', fontWeight: 800, letterSpacing: 2, margin: 0 }}>ROOM · {roomCode}</p>
                        <p style={{ fontSize: 'clamp(8px, 0.9vw, 11px)', color: '#52526a', letterSpacing: 1, margin: 0 }}>SCAN TO JOIN</p>
                    </div>
                    <div className="glass" style={{ borderRadius: 'clamp(8px, 1.2vw, 14px)', padding: 'clamp(6px, 1vw, 14px)', textAlign: 'center' }}>
                        <p style={{ fontSize: 'clamp(20px, 3.5vw, 36px)', fontWeight: 900, fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', margin: 0 }}>{riderCount}</p>
                        <p style={{ fontSize: 'clamp(8px, 0.9vw, 12px)', color: '#52526a', letterSpacing: 2, fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>Riders on Map</p>
                    </div>
                </div>
            )}

            {/* ── BOTTOM RIGHT: Leaderboard (not shown in mountain mode — side panel handles it) */}
            {playMode !== 'mountain' && (
                <div style={{ position: 'absolute', bottom: 'clamp(16px, 3vh, 32px)', right: 'clamp(16px, 3vw, 32px)', zIndex: 100 }}>
                    <Leaderboard players={allPlayers.filter(p => p.role !== 'instructor')} myId={null} />
                </div>
            )}

            {/* ── COUNTDOWN ─────────────────────────────────────────── */}
            {countdown !== null && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: countdown === 0 ? 'transparent' : 'rgba(0,0,0,0.2)' }}>
                    <div className="countdown-pop" style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 'clamp(120px, 30vw, 360px)', fontWeight: 900, fontStyle: 'italic', color: countdown === 0 ? '#22c55e' : '#fff', textShadow: countdown === 0 ? '0 0 80px #22c55e' : '0 0 60px rgba(255,255,255,0.4)', lineHeight: 1 }}>
                        {countdown === 0 ? 'GO!' : countdown}
                    </div>
                </div>
            )}
        </div>
    );
}
