// ============================================================
// NavMap — Top-Down Navigation Map (mobile-first)
// Features:
//   • Top-down view — no 3D tilt
//   • Map rotates so current heading always points UP
//   • Real OSRM street names on turn card
//   • Current street name banner at bottom of map
//   • Alternative route selector panel
//   • Off-route detection → auto-reroute
//   • CartoDB dark-matter + label overlay tiles
//   • Bright green trail behind, cyan route ahead
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { haversine } from '../utils/cities';
import { fetchStreetRoute, findNextStep, maneuverDisplay } from '../utils/routing';

function bearing([lat1, lon1], [lat2, lon2]) {
    const d = Math.PI / 180;
    const y = Math.sin((lon2 - lon1) * d) * Math.cos(lat2 * d);
    const x = Math.cos(lat1 * d) * Math.sin(lat2 * d) - Math.sin(lat1 * d) * Math.cos(lat2 * d) * Math.cos((lon2 - lon1) * d);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function distLabel(m) {
    return m > 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function nearestWpDist(route, pos) {
    let bestD = Infinity;
    for (const wp of route) { const d = haversine(pos, wp); if (d < bestD) bestD = d; }
    return bestD;
}

export default function NavMap({
    position,
    route,
    steps,
    wpIndex = 0,
    altRoutes = [],
    onRouteChange,
    activeRouteIdx = 0,
    otherPlayers = [],
    targetPosition,
    targetName,
    trafficLights = [],
    speed = 0,
    distLeftKm = 0,
}) {
    const mapRef = useRef(null);
    const leafRef = useRef(null);
    const wrapRef = useRef(null);     // outer div that gets CSS rotation
    const myDotRef = useRef(null);
    const trailGlowRef = useRef(null);
    const trailLineRef = useRef(null);
    const aheadRef = useRef(null);
    const altLineRefs = useRef({});
    const otherRefs = useRef({});
    const tlRefs = useRef({});
    const headRef = useRef(0);
    const trailCoords = useRef([]);
    const rerouting = useRef(false);

    const [navStep, setNavStep] = useState(null);
    const [currentStreet, setCurrentStreet] = useState('');
    const [offRoute, setOffRoute] = useState(false);
    const [showAltPanel, setShowAltPanel] = useState(false);

    // ── Init Leaflet map ──────────────────────────────────────
    useEffect(() => {
        if (leafRef.current) return;
        const startPos = position ?? [55.68, 12.57];
        const map = L.map(mapRef.current, {
            zoomControl: false, attributionControl: false,
            dragging: false, scrollWheelZoom: false,
            doubleClickZoom: false, keyboard: false,
        }).setView(startPos, 17);

        // Dark base with street labels overlay
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}{r}.png', {
            maxZoom: 19, subdomains: 'abcd',
        }).addTo(map);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
            maxZoom: 19, subdomains: 'abcd', opacity: 0.82,
        }).addTo(map);

        trailGlowRef.current = L.polyline([], { color: '#22c55e', weight: 10, opacity: 0.18 }).addTo(map);
        trailLineRef.current = L.polyline([], { color: '#4ade80', weight: 4, opacity: 0.95 }).addTo(map);
        aheadRef.current = L.polyline([], { color: '#06b6d4', weight: 5, opacity: 0.85 }).addTo(map);

        if (targetPosition) {
            L.marker(targetPosition, {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="width:20px;height:20px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 0 0 5px rgba(34,197,94,0.3),0 0 20px #22c55e;"></div>`,
                    iconSize: [20, 20], iconAnchor: [10, 10],
                }),
            }).addTo(map).bindTooltip(targetName ?? 'Finish', {
                permanent: true, className: 'target-tooltip', offset: [14, 0],
            });
        }

        myDotRef.current = L.marker(startPos, {
            icon: L.divIcon({
                className: '',
                html: `<div style="
                    width:18px;height:18px;border-radius:50%;
                    background:#22c55e;border:3px solid #fff;
                    box-shadow:0 0 0 4px rgba(34,197,94,0.35),0 0 16px rgba(34,197,94,0.9);
                "></div>`,
                iconSize: [18, 18], iconAnchor: [9, 9],
            }),
            zIndexOffset: 2000,
        }).addTo(map);

        leafRef.current = map;
        return () => { map.remove(); leafRef.current = null; };
    }, []); // eslint-disable-line

    // ── Alt route lines ───────────────────────────────────────
    useEffect(() => {
        const map = leafRef.current;
        if (!map) return;
        Object.values(altLineRefs.current).forEach(l => l.remove());
        altLineRefs.current = {};
        altRoutes.forEach((r, idx) => {
            if (idx === activeRouteIdx || !r.waypoints?.length) return;
            altLineRefs.current[idx] = L.polyline(r.waypoints, {
                color: '#94a3b8', weight: 3, opacity: 0.4, dashArray: '8 5',
            }).addTo(map);
            altLineRefs.current[idx].bringToBack();
        });
    }, [altRoutes, activeRouteIdx]); // eslint-disable-line

    // ── Reroute when off-course ───────────────────────────────
    const reroute = useCallback(async (fromPos) => {
        if (rerouting.current || !targetPosition) return;
        rerouting.current = true;
        setOffRoute(true);
        try {
            const result = await fetchStreetRoute(fromPos, targetPosition, { alternatives: true });
            if (result?.length && onRouteChange) onRouteChange(result);
        } catch (_) { /* silent */ }
        setTimeout(() => { rerouting.current = false; setOffRoute(false); }, 5000);
    }, [targetPosition, onRouteChange]);

    // ── Position update ───────────────────────────────────────
    useEffect(() => {
        const map = leafRef.current;
        if (!map || !position) return;

        // Smooth heading from consecutive positions
        if (trailCoords.current.length >= 1) {
            const prev = trailCoords.current[trailCoords.current.length - 1];
            if (haversine(prev, position) > 0.003) {
                const raw = bearing(prev, position);
                const diff = ((raw - headRef.current + 540) % 360) - 180;
                headRef.current = (headRef.current + diff * 0.22 + 360) % 360;
            }
        }

        const hdg = headRef.current;

        // TOP-DOWN rotation only — no perspective/tilt
        // The outer wrapper rotates the whole map div so heading faces UP
        if (wrapRef.current) {
            wrapRef.current.style.transform = `rotate(${-hdg}deg)`;
        }

        // Keep player in lower-centre of the (unrotated) viewport
        // Nudge the map center slightly forward in travel direction
        const rad = hdg * Math.PI / 180;
        const fwd = 0.0004;
        map.setView([
            position[0] + fwd * Math.cos(rad),
            position[1] + fwd * Math.sin(rad),
        ], 17, { animate: false });

        myDotRef.current?.setLatLng(position);

        // Trail
        trailCoords.current.push([...position]);
        if (trailCoords.current.length > 1200) trailCoords.current.shift();
        trailGlowRef.current?.setLatLngs(trailCoords.current);
        trailLineRef.current?.setLatLngs(trailCoords.current);

        // Route ahead
        if (route?.length) {
            aheadRef.current?.setLatLngs(route.slice(Math.max(0, wpIndex - 1)));
        }

        // Nav step (street name)
        if (steps?.length) {
            const next = findNextStep(steps, position);
            setNavStep(next);
            const nearest = steps.reduce((best, s) => {
                if (!s.location) return best;
                const d = haversine(position, s.location);
                return d < best.d ? { s, d } : best;
            }, { s: null, d: Infinity });
            if (nearest.s?.streetName) setCurrentStreet(nearest.s.streetName);
        }

        // Off-route detection
        if (route?.length && speed > 2) {
            const offKm = nearestWpDist(route, position);
            if (offKm > 0.08) reroute(position);
        }
    }, [position, route, steps, wpIndex, speed]); // eslint-disable-line

    // ── Other players ─────────────────────────────────────────
    useEffect(() => {
        const map = leafRef.current;
        if (!map) return;
        const refs = otherRefs.current;
        otherPlayers.forEach(({ id, position: pos, color = '#f97316', name, distKm = 0 }) => {
            if (!pos) return;
            const icon = L.divIcon({
                className: '',
                html: `<div style="display:flex;align-items:center;gap:4px;pointer-events:none;">
                    <div style="width:11px;height:11px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 7px ${color};flex-shrink:0;"></div>
                    <div style="background:rgba(0,0,0,0.85);border:1px solid ${color};border-radius:4px;padding:1px 5px;font-size:9px;color:#fff;white-space:nowrap;font-family:Inter,sans-serif;">
                        <b>${name ?? ''}</b> ${distKm.toFixed(2)} km
                    </div>
                </div>`,
                iconSize: [120, 16], iconAnchor: [6, 5],
            });
            if (refs[id]) { refs[id].setLatLng(pos); refs[id].setIcon(icon); }
            else refs[id] = L.marker(pos, { icon, zIndexOffset: 50 }).addTo(map);
        });
        Object.keys(refs).forEach(id => {
            if (!otherPlayers.find(p => p.id === id)) { refs[id].remove(); delete refs[id]; }
        });
    }, [otherPlayers]);

    // ── Traffic lights ────────────────────────────────────────
    useEffect(() => {
        const map = leafRef.current;
        if (!map) return;
        trafficLights.forEach(({ id, position: pos, state }) => {
            const color = state === 'RED' ? '#ef4444' : state === 'GREEN' ? '#22c55e' : '#eab308';
            const icon = L.divIcon({
                className: '',
                html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:1.5px solid rgba(255,255,255,0.4);box-shadow:0 0 7px ${color};"></div>`,
                iconSize: [10, 10], iconAnchor: [5, 5],
            });
            if (tlRefs.current[id]) tlRefs.current[id].setIcon(icon);
            else tlRefs.current[id] = L.marker(pos, { icon, interactive: false, zIndexOffset: 200 }).addTo(map);
        });
    }, [trafficLights]);

    const { arrow, label } = navStep
        ? maneuverDisplay(navStep.maneuverType, navStep.maneuverModifier)
        : { arrow: '↑', label: 'CONTINUE' };
    const turnDist = navStep ? distLabel(navStep.distM ?? 0) : '';
    const nextStreet = navStep?.streetName ?? '';

    return (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>

            {/* Top-down rotating map wrapper — oversized to hide edges on rotation */}
            <div ref={wrapRef} style={{
                position: 'absolute',
                inset: '-30%',           // 30% extra on all sides, enough for rotation
                transformOrigin: 'center center',
                transition: 'transform 0.35s linear',
                willChange: 'transform',
            }}>
                <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            </div>

            {/* ── TURN CARD — placed below the top safe area ── */}
            {route && route.length > 2 && (
                <div style={{
                    position: 'absolute', top: 16, left: 16, zIndex: 900,
                    background: 'rgba(6,8,16,0.95)',
                    border: '1px solid rgba(6,182,212,0.4)',
                    borderRadius: 18, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    backdropFilter: 'blur(16px)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
                    maxWidth: 'calc(100vw - 32px)',
                }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                        background: 'linear-gradient(135deg,#0e7490,#06b6d4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, boxShadow: '0 3px 12px rgba(6,182,212,0.45)',
                    }}>{arrow}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                            fontSize: 26, fontWeight: 900, color: '#fff', lineHeight: 1,
                        }}>{turnDist}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#06b6d4', fontFamily: 'Inter,sans-serif', textTransform: 'uppercase', marginTop: 1 }}>
                            {label}
                        </div>
                        {nextStreet && (
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e2f0', fontFamily: 'Inter,sans-serif', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {nextStreet}
                            </div>
                        )}
                    </div>
                    {/* Alt routes button — inside turn card on mobile */}
                    {altRoutes.length > 1 && (
                        <button onClick={() => setShowAltPanel(v => !v)} style={{
                            background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
                            borderRadius: 8, padding: '5px 8px', color: '#06b6d4',
                            fontWeight: 700, fontSize: 10, cursor: 'pointer',
                            fontFamily: 'Inter,sans-serif', letterSpacing: 1, flexShrink: 0,
                        }}>🗺</button>
                    )}
                </div>
            )}

            {/* Alt route panel */}
            {showAltPanel && (
                <div style={{
                    position: 'absolute', top: 90, left: 16, zIndex: 900,
                    background: 'rgba(6,8,16,0.96)', border: '1px solid #1e1e2e',
                    borderRadius: 16, padding: 12, width: 'calc(100vw - 32px)', maxWidth: 340,
                    backdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                    {altRoutes.map((r, i) => (
                        <button key={i} onClick={() => { onRouteChange?.(i); setShowAltPanel(false); }} style={{
                            background: activeRouteIdx === i ? 'rgba(6,182,212,0.14)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${activeRouteIdx === i ? '#06b6d4' : '#1e1e2e'}`,
                            borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                            fontFamily: 'Inter,sans-serif', textAlign: 'left',
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: activeRouteIdx === i ? '#06b6d4' : '#e2e2f0' }}>
                                Route {i + 1}{i === 0 ? ' · Fastest' : i === 1 ? ' · Alternate' : ' · Scenic'}
                            </div>
                            <div style={{ fontSize: 10, color: '#52526a', marginTop: 2 }}>
                                {r.distKm?.toFixed(1)} km · ~{Math.round(r.durationMin)} min
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Rerouting banner */}
            {offRoute && (
                <div style={{
                    position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%)',
                    zIndex: 950, pointerEvents: 'none',
                    background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.5)',
                    borderRadius: 14, padding: '10px 28px', backdropFilter: 'blur(8px)',
                    fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13,
                    color: '#eab308', letterSpacing: 2,
                }}>
                    🔄 RECALCULATING…
                </div>
            )}

            {/* Current street banner — above the bottom HUD */}
            <div style={{
                position: 'absolute', bottom: 112, left: 0, right: 0, zIndex: 900,
                display: 'flex', justifyContent: 'center', pointerEvents: 'none',
            }}>
                {currentStreet && (
                    <div style={{
                        background: 'rgba(6,8,16,0.88)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 99, padding: '6px 18px',
                        fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600,
                        color: '#e2e2f0', letterSpacing: 0.3, backdropFilter: 'blur(8px)',
                        maxWidth: 'calc(100vw - 32px)', textAlign: 'center',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        📍 {currentStreet}
                    </div>
                )}
            </div>

            {/* Speed badge — bottom-right */}
            <div style={{
                position: 'absolute', bottom: 120, right: 16, zIndex: 900,
                background: 'rgba(6,8,16,0.94)', border: '1px solid #1e1e2e',
                borderRadius: 14, padding: '8px 14px', textAlign: 'center',
                backdropFilter: 'blur(12px)', minWidth: 64,
            }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontSize: 36, fontWeight: 900, color: '#22c55e', lineHeight: 1 }}>
                    {Math.round(speed)}
                </div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: '#52526a', fontFamily: 'Inter,sans-serif' }}>KM/H</div>
                {distLeftKm > 0 && (
                    <div style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'Inter,sans-serif', marginTop: 3 }}>
                        {distLeftKm.toFixed(2)} km
                    </div>
                )}
            </div>
        </div>
    );
}
