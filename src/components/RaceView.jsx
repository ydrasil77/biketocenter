// ============================================================
// RaceView — Google Navigation-style rider view
// ============================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import NavMap from './NavMap';
import Dashboard from './Dashboard';
import TrafficLight from './TrafficLight';
import Leaderboard, { PLAYER_DOT_COLORS } from './Leaderboard';
import StravaUpload from './StravaUpload';
import { usePhysics } from '../hooks/usePhysics';
import { useBots } from '../hooks/useBots';
import { CITIES, haversine, calcStartPositions } from '../utils/cities';
import { fetchStreetRoute, sampleRoutePositions } from '../utils/routing';

// ── Per-route traffic lights (client-side) ───────────────────
function useMapTrafficLights(routeWaypoints, count = 5) {
    const [lights, setLights] = useState([]);
    const timersRef = useRef([]);

    useEffect(() => {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        const STATES = ['GREEN', 'YELLOW', 'RED', 'YELLOW'];
        if (!routeWaypoints || routeWaypoints.length < 2) return;
        const positions = sampleRoutePositions(routeWaypoints, count);
        if (positions.length === 0) return;

        const initial = positions.map((pos, i) => ({
            id: `tl_${i}`, position: pos,
            stateIdx: (i + Math.floor(Math.random() * 3)) % 4,
            // GREEN: 45-90s   YELLOW: 3s   RED: 15-25s
            durations: [
                45000 + Math.random() * 45000,  // GREEN
                3000,                            // YELLOW→RED
                15000 + Math.random() * 10000,  // RED
                3000,                            // YELLOW→GREEN
            ],
        }));
        setLights(initial.map(l => ({ id: l.id, position: l.position, state: STATES[l.stateIdx] })));

        timersRef.current = initial.map(light => {
            let idx = light.stateIdx;
            function tick() {
                idx = (idx + 1) % 4;
                setLights(prev => prev.map(l => l.id === light.id ? { ...l, state: STATES[idx] } : l));
                const t = setTimeout(tick, light.durations[idx]);
                timersRef.current.push(t);
                return t;
            }
            return setTimeout(tick, light.durations[idx]);
        });
        return () => timersRef.current.forEach(clearTimeout);
    }, [routeWaypoints, count]); // eslint-disable-line

    return lights;
}

export default function RaceView({ config, bluetooth, socket, onLeave }) {
    const { name, weight, gender, city, ftp, roomCode, radiusKm = 2, botCount = 0 } = config;
    const cityData = CITIES[city];
    const targetPos = cityData.center;

    const [isSimulating, setIsSimulating] = useState(botCount > 0);
    const [isPaused, setIsPaused] = useState(false);
    const [showStrava, setShowStrava] = useState(false);
    const [simWatts, setSimWatts] = useState(0);
    const [simHr, setSimHr] = useState(0);
    const [simCadence, setSimCadence] = useState(0);
    const [policeSec, setPoliceSec] = useState(0);
    const [altRoutes, setAltRoutes] = useState([]);    // [{waypoints,steps,distKm,durationMin}]
    const [activeRouteIdx, setActiveRouteIdx] = useState(0);
    const [heading, setHeading] = useState(0);
    const simRef = useRef(null);
    const policeRef = useRef(null);

    // Active route + steps = altRoutes[activeRouteIdx]
    const activeRoute = altRoutes[activeRouteIdx] ?? null;
    const routeWaypoints = activeRoute?.waypoints ?? null;
    const routeSteps = activeRoute?.steps ?? [];

    const {
        trafficState, players: serverPlayers, myStartPos, countdown, raceStarted,
        policeCheckpoints, policeStop, joinRoom, updatePosition,
    } = socket;

    // ── Start position ─────────────────────────────────────────
    const localFallbackStart = calcStartPositions(cityData.center, 1, radiusKm)[0];
    const startPos = myStartPos ?? localFallbackStart;

    // ── Fetch OSRM route + alternatives at start ───────────────
    useEffect(() => {
        fetchStreetRoute(startPos, targetPos, { alternatives: true })
            .then(routes => {
                // routes is an array of {waypoints,steps,distKm,durationMin}
                const arr = Array.isArray(routes) ? routes : [routes];
                setAltRoutes(arr);
                setActiveRouteIdx(0);
            })
            .catch(() => setAltRoutes([]));
    }, [startPos[0], startPos[1], targetPos[0], targetPos[1]]); // eslint-disable-line

    // ── Route recalculation from NavMap off-route detection ────
    const handleRouteChange = useCallback((input) => {
        if (typeof input === 'number') {
            // User picked an alternative by index
            setActiveRouteIdx(input);
        } else if (Array.isArray(input)) {
            // NavMap returned fresh alternatives from reroute
            setAltRoutes(input);
            setActiveRouteIdx(0);
        }
    }, []);

    // ── Bots (each with own route + traffic lights) ────────────
    const { bots: botPlayers, routes: botRoutes, botLights } = useBots({
        count: botCount, targetPos, radiusKm, trafficState,
    });

    // ── Traffic lights: player route + all bot lights ──────────
    const playerRouteLights = useMapTrafficLights(routeWaypoints, 5);
    const allBotLights = Object.values(botLights).flat();
    const mapTrafficLights = [...playerRouteLights, ...allBotLights];
    // Player only stopped when within 40 m of a red light they are riding toward
    const playerPosition = physics.position;
    const playerAtRed = playerRouteLights.some(l => {
        if (l.state !== 'RED') return false;
        if (!playerPosition || !l.position) return false;
        return haversine(playerPosition, l.position) < 0.04; // 40 m radius
    });

    // ── Join room ──────────────────────────────────────────────
    useEffect(() => {
        joinRoom(roomCode, { name, city, role: 'rider', ftp, radiusKm, botCount: 0 });
    }, []); // eslint-disable-line

    // ── Police stop countdown ──────────────────────────────────
    useEffect(() => {
        if (!policeStop || policeStop.playerId !== socket.socketId) return;
        const remaining = Math.ceil((policeStop.until - Date.now()) / 1000);
        if (remaining <= 0) return;
        setPoliceSec(remaining);
        policeRef.current = setInterval(() => {
            const r = Math.ceil((policeStop.until - Date.now()) / 1000);
            if (r <= 0) { clearInterval(policeRef.current); setPoliceSec(0); }
            else setPoliceSec(r);
        }, 500);
        return () => clearInterval(policeRef.current);
    }, [policeStop, socket.socketId]);

    // ── Simulator ─────────────────────────────────────────────
    useEffect(() => {
        if (isSimulating) {
            simRef.current = setInterval(() => {
                const t = Date.now() / 1000;
                setSimWatts(240 + 30 * Math.sin(t * 0.3) + 15 * Math.sin(t * 0.7));
                setSimHr(155 + 8 * Math.sin(t * 0.15));
                setSimCadence(88 + 5 * Math.sin(t * 0.2));
            }, 200);
        } else {
            clearInterval(simRef.current);
            setSimWatts(0); setSimHr(0); setSimCadence(0);
        }
        return () => clearInterval(simRef.current);
    }, [isSimulating]);

    const activeWatts = isSimulating ? simWatts : bluetooth.watts;
    const activeHr = isSimulating ? simHr : bluetooth.hr;
    const activeCadence = isSimulating ? simCadence : bluetooth.cadence;
    const isPoliceStop = policeSec > 0;

    const physics = usePhysics({
        watts: activeWatts, cadence: activeCadence, hr: activeHr,
        weightKg: weight, gender, ftp,
        trafficState: (isPoliceStop || playerAtRed) ? 'RED' : 'GREEN',
        startPosition: startPos, targetPosition: targetPos,
        routeWaypoints, headingOffset: heading,
        active: isSimulating || raceStarted,
        paused: isPaused,
    });

    const raceDistKm = haversine(startPos, targetPos);
    const progress = Math.min(physics.totalDistKm / raceDistKm, 1);
    const distLeft = Math.max(raceDistKm - physics.totalDistKm, 0);

    // ── Broadcast position ─────────────────────────────────────
    useEffect(() => {
        const iv = setInterval(() => {
            if (physics.position && socket.socketId) {
                updatePosition({
                    id: socket.socketId, name, position: physics.position,
                    distKm: physics.totalDistKm, speed: physics.speed,
                    hr: activeHr, watts: activeWatts, zone: physics.zone?.id,
                });
            }
        }, 500);
        return () => clearInterval(iv);
    }, [physics.position, physics.totalDistKm, physics.speed, activeHr, activeWatts, physics.zone, name, updatePosition, socket.socketId]);

    useEffect(() => { if (physics.arrived) setShowStrava(true); }, [physics.arrived]);

    // ── Players list ───────────────────────────────────────────
    const serverOthers = serverPlayers
        .filter(p => p.id !== socket.socketId)
        .map((p, i) => ({ ...p, color: PLAYER_DOT_COLORS[i % PLAYER_DOT_COLORS.length] }));
    const allOtherPlayers = [...serverOthers, ...botPlayers];

    // Sorted leaderboard — includes me
    const myEntry = {
        id: socket.socketId ?? 'me',
        name, distKm: physics.totalDistKm, speed: physics.speed, color: '#3b82f6',
    };
    const allPlayers = [myEntry, ...allOtherPlayers]
        .sort((a, b) => (b.distKm ?? 0) - (a.distKm ?? 0));
    const myRank = allPlayers.findIndex(p => p.id === myEntry.id) + 1;
    const wkg = activeWatts > 0 && weight > 0 ? (activeWatts / weight).toFixed(2) : '—';

    // ── Direction controls ─────────────────────────────────────
    const turnLeft = useCallback(() => setHeading(h => Math.max(h - 30, -90)), []);
    const turnRight = useCallback(() => setHeading(h => Math.min(h + 30, 90)), []);
    const resetDir = useCallback(() => setHeading(0), []);
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'ArrowLeft') turnLeft();
            if (e.key === 'ArrowRight') turnRight();
            if (e.key === 'ArrowUp') resetDir();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [turnLeft, turnRight, resetDir]);

    return (
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>

            {/* ── NAVIGATION MAP (full screen) ─────────────────── */}
            <NavMap
                position={physics.position}
                route={routeWaypoints}
                steps={routeSteps}
                wpIndex={physics.wpIndex}
                altRoutes={altRoutes}
                activeRouteIdx={activeRouteIdx}
                onRouteChange={handleRouteChange}
                otherPlayers={allOtherPlayers}
                targetPosition={targetPos}
                targetName={cityData.target}
                trafficLights={mapTrafficLights}
                speed={isPoliceStop ? 0 : physics.speed}
                distLeftKm={distLeft}
            />


            {/* ── TOP PROGRESS BAR — full width, compact ────── */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 300,
                background: 'linear-gradient(180deg,rgba(4,4,7,0.92) 0%,transparent 100%)',
                padding: '8px 16px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
            }}>
                {/* Room code pill */}
                <div style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid #1e1e2e',
                    borderRadius: 99, padding: '3px 10px', flexShrink: 0,
                    fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#52526a', fontFamily: 'Inter,sans-serif',
                }}>#{roomCode}</div>

                {/* Progress bar */}
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#52526a', fontFamily: 'Inter,sans-serif', marginBottom: 3 }}>
                        <span>{physics.totalDistKm.toFixed(2)} km</span>
                        <span>{cityData.target} · {distLeft.toFixed(2)} km left {routeWaypoints ? '📍' : '⏳'}</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(progress * 100).toFixed(1)}%`, background: 'linear-gradient(90deg,#3b82f6,#22c55e)', borderRadius: 99, transition: 'width 0.5s' }} />
                    </div>
                </div>

                {/* Leaderboard rank pill */}
                <div style={{
                    background: myRank === 1 ? 'linear-gradient(135deg,#eab308,#f59e0b)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${myRank === 1 ? '#eab308' : '#1e1e2e'}`,
                    borderRadius: 99, padding: '3px 10px', flexShrink: 0,
                    fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                    fontSize: 13, fontWeight: 900, color: myRank === 1 ? '#000' : '#e2e2f0',
                }}>
                    {myRank === 1 ? '🏆' : `#${myRank}`}/{allPlayers.length}
                </div>
            </div>


            {/* ── RIGHT LEADERBOARD PANEL ──────────────────────── */}
            <div style={{
                position: 'absolute', top: 56, right: 16, zIndex: 300,
                display: 'flex', flexDirection: 'column',
                pointerEvents: 'none',
            }}>
                <div style={{ pointerEvents: 'auto' }}>
                    <Leaderboard players={allPlayers} myId={myEntry.id} />
                </div>
            </div>

            {/* ── WAITING SCREEN (Pre-Race) ────────────────────────── */}
            {!raceStarted && countdown === null && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 350,
                    background: 'rgba(4,4,7,0.85)', backdropFilter: 'blur(8px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#0d0d14', border: '1px solid #1e1e2e',
                        borderRadius: 20, padding: 40, textAlign: 'center',
                        maxWidth: 400, width: '90%',
                        boxShadow: '0 0 60px rgba(59,130,246,0.1)',
                        pointerEvents: 'auto',
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                        <h2 style={{
                            fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                            fontSize: 32, fontWeight: 900, color: '#fff', marginBottom: 8,
                        }}>WAITING FOR INSTRUCTOR</h2>
                        <p style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'Inter,sans-serif', lineHeight: 1.5, marginBottom: 24 }}>
                            The instructor is setting up the session. The race will begin automatically when they start the countdown.
                        </p>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            background: 'rgba(255,255,255,0.05)', borderRadius: 99, padding: '6px 16px',
                        }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', animation: 'btSpin 1s linear infinite' }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e2f0', letterSpacing: 1 }}>ROOM {roomCode}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── COUNTDOWN overlay ────────────────────────────── */}
            {countdown !== null && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'rgba(0,0,0,0.25)' }}>
                    <div className="countdown-pop" style={{
                        fontFamily: "'Barlow Condensed',sans-serif", fontSize: 180, fontWeight: 900, fontStyle: 'italic',
                        color: countdown === 0 ? '#22c55e' : '#fff',
                        textShadow: countdown === 0 ? '0 0 80px #22c55e' : '0 0 40px rgba(255,255,255,0.3)',
                    }}>{countdown === 0 ? 'GO!' : countdown}</div>
                </div>
            )}

            {/* ── POLICE STOP ──────────────────────────────────── */}
            {isPoliceStop && (
                <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 450, textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ background: 'rgba(239,68,68,0.18)', border: '2px solid #ef4444', borderRadius: 20, padding: '20px 36px', backdropFilter: 'blur(12px)', boxShadow: '0 0 60px rgba(239,68,68,0.35)' }}>
                        <div style={{ fontSize: 40, marginBottom: 6 }}>🚔</div>
                        <p style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontSize: 28, fontWeight: 900, color: '#ef4444' }}>POLICE CONTROL</p>
                        <p style={{ fontSize: 48, fontWeight: 900, fontFamily: "'Barlow Condensed',sans-serif", color: '#fff', lineHeight: 1 }}>{policeSec}s</p>
                    </div>
                </div>
            )}

            {/* ── RED LIGHT BANNER ─────────────────────────────── */}
            {playerAtRed && !isPoliceStop && (
                <div style={{ position: 'absolute', bottom: 130, left: '50%', transform: 'translateX(-50%)', zIndex: 400, pointerEvents: 'none' }}>
                    <div style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 12, padding: '8px 24px', backdropFilter: 'blur(8px)' }}>
                        <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: '#ef4444', fontFamily: 'Inter,sans-serif' }}>🚦 RED LIGHT — STOPPED</p>
                    </div>
                </div>
            )}

            {/* ── NAVIGATION BOTTOM HUD ────────────────────────── */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 300,
                background: 'linear-gradient(180deg,transparent 0%,rgba(4,4,7,0.97) 35%)',
                paddingTop: 36, paddingBottom: 16, paddingLeft: 16, paddingRight: 16,
            }}>
                {/* Rank badge */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                    <div style={{
                        background: myRank === 1 ? 'linear-gradient(135deg,#eab308,#f59e0b)' : 'rgba(255,255,255,0.07)',
                        border: `1px solid ${myRank === 1 ? '#eab308' : '#1e1e2e'}`,
                        borderRadius: 99, padding: '4px 18px',
                        fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                        fontSize: 16, fontWeight: 900, color: myRank === 1 ? '#000' : '#e2e2f0',
                        letterSpacing: 1,
                    }}>
                        {myRank === 1 ? '🏆' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : `#${myRank}`} of {allPlayers.length}
                    </div>
                </div>

                {/* Main metrics row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                    {[
                        { label: 'SPEED', value: `${Math.round(isPoliceStop ? 0 : physics.speed)}`, unit: 'km/h', color: '#22c55e', big: true },
                        { label: 'POWER', value: `${Math.round(activeWatts)}`, unit: 'W', color: '#f97316', big: false },
                        { label: 'W/KG', value: wkg, unit: 'w/kg', color: '#a855f7', big: false },
                        { label: 'HR', value: activeHr > 0 ? Math.round(activeHr) : '—', unit: 'bpm', color: '#ef4444', big: false },
                    ].map(m => (
                        <div key={m.label} style={{
                            background: 'rgba(255,255,255,0.04)', border: '1px solid #1e1e2e',
                            borderRadius: 14, padding: '10px 6px', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#52526a', marginBottom: 4, fontFamily: 'Inter,sans-serif' }}>{m.label}</div>
                            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontSize: m.big ? 38 : 28, fontWeight: 900, color: m.color, lineHeight: 1 }}>{m.value}</div>
                            <div style={{ fontSize: 9, color: '#52526a', fontFamily: 'Inter,sans-serif', marginTop: 2 }}>{m.unit}</div>
                        </div>
                    ))}
                </div>

                {/* Second row: dist, elapsed, cadence + BT status + controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                        {[
                            { label: 'DIST', value: `${physics.totalDistKm.toFixed(2)} km` },
                            { label: 'ELAPSED', value: (() => { const s = physics.elapsedSec; return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; })() },
                            { label: 'CADENCE', value: activeCadence > 0 ? `${Math.round(activeCadence)} rpm` : '— rpm' },
                        ].map(m => (
                            <div key={m.label} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid #1e1e2e', borderRadius: 10, padding: '6px 8px', textAlign: 'center' }}>
                                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#52526a', fontFamily: 'Inter,sans-serif' }}>{m.label}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e2f0', fontFamily: 'Inter,sans-serif' }}>{m.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* BT status pill */}
                    <div style={{
                        background: bluetooth.bikeConnected ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${bluetooth.bikeConnected ? 'rgba(34,197,94,0.35)' : '#1e1e2e'}`,
                        borderRadius: 10, padding: '6px 10px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0,
                    }}>
                        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#52526a', fontFamily: 'Inter,sans-serif' }}>BT</div>
                        <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: bluetooth.bikeConnected ? '#22c55e' : bluetooth.hrConnected ? '#ef4444' : '#2a2a3a',
                            boxShadow: bluetooth.bikeConnected ? '0 0 6px #22c55e' : 'none',
                        }} />
                    </div>

                    {/* Controls */}
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setIsSimulating(s => !s)} style={ctrlBtn(isSimulating, '#22c55e')}>
                            {isSimulating ? '⏸ SIM' : '▶ SIM'}
                        </button>
                        <button onClick={() => setIsPaused(p => !p)} style={ctrlBtn(isPaused, '#eab308')}>
                            {isPaused ? '▶' : '⏸'}
                        </button>
                        <button onClick={onLeave} style={ctrlBtn(false, '#ef4444')}>✕</button>
                    </div>
                </div>
            </div>

            {/* ── STRAVA MODAL ─────────────────────────────────── */}
            {showStrava && (
                <StravaUpload track={physics.track} riderName={name} onClose={() => { setShowStrava(false); onLeave(); }} />
            )}
        </div>
    );
}

function ctrlBtn(active, color) {
    return {
        height: 40, minWidth: 52, borderRadius: 10, fontSize: 11, cursor: 'pointer',
        fontWeight: 700, fontFamily: 'Inter,sans-serif', letterSpacing: 1,
        background: active ? `rgba(${color === '#22c55e' ? '34,197,94' : color === '#eab308' ? '234,179,8' : '239,68,68'},0.18)` : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? color : '#1e1e2e'}`,
        color: active ? color : '#52526a',
        padding: '0 12px',
    };
}
