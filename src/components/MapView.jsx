// ============================================================
// MapView — Leaflet map with:
//  • Player dots + labels (name, speed, HR)
//  • Per-player trail polylines
//  • Route polyline (the street course, fetched from OSRM)
//  • Multiple INDEPENDENT traffic lights on the map
//  • Police checkpoint markers
// ============================================================
import { useEffect, useRef } from 'react';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: '', shadowUrl: '' });

// ── Player label HTML ────────────────────────────────────────
function playerLabelHtml(name, speed, hr, color, isMe, isFlame, scale = 1) {
    const speedStr = speed > 0 ? `${speed.toFixed(1)}<span style="font-size:${Math.round(10 * scale)}px;opacity:0.7">km/h</span>` : '';
    const hrStr = hr > 0 ? `❤ ${Math.round(hr)}` : '';
    const badge = [speedStr, hrStr].filter(Boolean).join(' · ');

    const bikeSize = Math.round((isMe ? 52 : 40) * scale);
    const fontSize = Math.round(14 * scale);
    const badgeSize = Math.round(11 * scale);
    const padding = scale < 0.7 ? '2px 6px' : '3px 10px';
    const borderW = scale < 0.7 ? '1.5px' : '2px';

    const bikeFilter = isFlame
        ? `drop-shadow(0 -4px 10px rgba(255, 69, 0, 0.9)) drop-shadow(0 0 6px rgba(255, 140, 0, 0.8))`
        : `drop-shadow(0 0 ${isMe ? 5 : 3}px ${color})`;

    return `
    <div style="display:flex;flex-direction:column;align-items:flex-start;pointer-events:none;white-space:nowrap;">
      <div style="position:relative;width:${bikeSize}px;height:${bikeSize}px;margin-bottom:2px;">
        ${isMe ? `<div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.28;" class="marker-ping"></div>` : ''}
        <img class="${isFlame ? 'flame-flicker' : ''}" src="/phantom-bike.png" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;filter:${bikeFilter};transition:filter 0.3s;" />
      </div>
      <div style="background:rgba(4,4,7,0.88);border:${borderW} solid ${color};border-radius:5px;padding:${padding};font-family:'Inter',sans-serif;font-size:${fontSize}px;font-weight:800;color:#e2e2f0;line-height:1.35;backdrop-filter:blur(4px);max-width:${Math.round(130 * scale)}px;overflow:hidden;text-overflow:ellipsis;">
        ${isMe ? '⚡ ' : ''}${name}
        ${badge ? `<br><span style="font-size:${badgeSize}px;color:${color}">${badge}</span>` : ''}
      </div>
    </div>`;
}

// ── Traffic light marker HTML (small, with 3 bulbs) ─────────
function trafficLightHtml(state) {
    return `
    <div style="background:#0d0d14;border:1.5px solid #2a2a38;border-radius:7px;padding:5px 4px;display:flex;flex-direction:column;gap:4px;box-shadow:0 2px 12px rgba(0,0,0,0.7);">
      <div style="width:12px;height:12px;border-radius:50%;background:${state === 'RED' ? '#ff4d4d' : '#1a1a24'};box-shadow:${state === 'RED' ? '0 0 8px #ff4d4d' : 'none'};"></div>
      <div style="width:12px;height:12px;border-radius:50%;background:${state === 'YELLOW' ? '#facc15' : '#1a1a24'};box-shadow:${state === 'YELLOW' ? '0 0 8px #facc15' : 'none'};"></div>
      <div style="width:12px;height:12px;border-radius:50%;background:${state === 'GREEN' ? '#22c55e' : '#1a1a24'};box-shadow:${state === 'GREEN' ? '0 0 8px #22c55e' : 'none'};"></div>
    </div>`;
}

export default function MapView({
    center,
    zoom = 14,
    myPosition,
    myName = 'You',
    mySpeed = 0,
    myHr = 0,
    targetPosition,
    targetName,
    players = [],
    myId,
    trafficState = 'GREEN',   // overall/master state
    mapTrafficLights = [],
    routeWaypoints = null,
    playerRoutes = {},
    policeCheckpoints = [],
    mini = false,
    autoFit = false,    // instructor: auto-zoom to fit all players
}) {
    const mapRef = useRef(null);
    const leafletRef = useRef(null);
    const myMarkerRef = useRef(null);
    const myTrailRef = useRef(null);
    const myTrailCoords = useRef([]);
    const playerMarkersRef = useRef({});
    const tlMarkersRef = useRef({});
    const policeMarkersRef = useRef({});
    const routeLineRef = useRef(null);
    const botRouteLinesRef = useRef({}); // botId → L.polyline

    // ── Init map ──────────────────────────────────────────────
    useEffect(() => {
        if (leafletRef.current) return;
        const map = L.map(mapRef.current, {
            zoomControl: !mini,
            attributionControl: false,
            dragging: !mini,
            scrollWheelZoom: !mini,
            doubleClickZoom: false,
            keyboard: false,
        }).setView(center, zoom);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19, subdomains: 'abcd',
        }).addTo(map);
        leafletRef.current = map;

        // Target marker — large, always-visible destination flag
        if (targetPosition) {
            const targetHtml = `
                <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
                    <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#22c55e,#15803d);border:3px solid #fff;box-shadow:0 0 24px #22c55e,0 0 8px rgba(34,197,94,0.8);display:flex;align-items:center;justify-content:center;font-size:16px;" class="marker-ping">🏁</div>
                    <div style="background:rgba(34,197,94,0.95);color:#000;font-size:11px;font-weight:900;letter-spacing:1.5px;padding:3px 10px;border-radius:20px;margin-top:4px;font-family:'Barlow Condensed',sans-serif;white-space:nowrap;box-shadow:0 2px 12px rgba(34,197,94,0.5);">${targetName ?? 'DESTINATION'}</div>
                </div>`;
            L.marker(targetPosition, {
                icon: L.divIcon({
                    className: '',
                    html: targetHtml,
                    iconSize: [120, 60], iconAnchor: [15, 15],
                }),
                zIndexOffset: 800,
            }).addTo(map);
        }



        return () => { map.remove(); leafletRef.current = null; };
    }, []); // eslint-disable-line

    // ── Player's own route — white dashed ─────────────────────
    useEffect(() => {
        const map = leafletRef.current;
        if (!map || !routeWaypoints || routeWaypoints.length < 2) return;
        if (routeLineRef.current) routeLineRef.current.remove();
        routeLineRef.current = L.polyline(routeWaypoints, {
            color: '#ffffff', weight: 2.5, opacity: 0.22, dashArray: '6 8',
        }).addTo(map);
        routeLineRef.current.bringToBack();
    }, [routeWaypoints]);

    // ── Per-bot colored route lines ───────────────────────────
    useEffect(() => {
        const map = leafletRef.current;
        if (!map || mini) return;
        const lines = botRouteLinesRef.current;
        Object.entries(playerRoutes).forEach(([pid, waypoints]) => {
            if (!waypoints || waypoints.length < 2) return;
            const pdata = players.find(p => p.id === pid);
            const color = pdata?.color ?? '#3b82f6';
            if (lines[pid]) {
                lines[pid].setLatLngs(waypoints);
            } else {
                lines[pid] = L.polyline(waypoints, {
                    color, weight: 2, opacity: 0.28, dashArray: '4 7',
                }).addTo(map);
                lines[pid].bringToBack();
            }
        });
    }, [playerRoutes, players, mini]);


    // ── Traffic light markers on map ─────────────────────────
    useEffect(() => {
        const map = leafletRef.current;
        if (!map || mini) return;
        const tls = tlMarkersRef.current;

        mapTrafficLights.forEach(({ id, position, state }) => {
            const icon = L.divIcon({
                className: '',
                html: trafficLightHtml(state),
                iconSize: [20, 54], iconAnchor: [10, 27],
            });
            if (tls[id]) {
                tls[id].setIcon(icon);
            } else {
                // zIndexOffset: 50 — renders below player markers (600)
                tls[id] = L.marker(position, { icon, zIndexOffset: 50, interactive: false }).addTo(map);
            }
        });
    }, [mapTrafficLights, mini]);

    // ── Police markers ────────────────────────────────────────
    useEffect(() => {
        const map = leafletRef.current;
        if (!map || mini) return;
        const existing = policeMarkersRef.current;
        policeCheckpoints.forEach(({ id, position }) => {
            if (existing[id]) return;
            const icon = L.divIcon({
                className: '',
                html: `<div style="text-align:center;pointer-events:none;">
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(239,68,68,0.15);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 0 12px rgba(239,68,68,0.5);" class="marker-ping">🚔</div>
          <div style="background:rgba(239,68,68,0.9);color:#fff;font-size:8px;font-weight:800;letter-spacing:1px;padding:1px 5px;border-radius:4px;margin-top:2px;font-family:Inter,sans-serif;white-space:nowrap;">POLICE</div>
        </div>`,
                iconSize: [40, 44], iconAnchor: [20, 14],
            });
            existing[id] = L.marker(position, { icon, zIndexOffset: 300, interactive: false }).addTo(map);
        });
    }, [policeCheckpoints, mini]);

    // ── Own position + label ──────────────────────────────────
    useEffect(() => {
        const map = leafletRef.current;
        if (!map || !myPosition) return;
        const [lat, lng] = myPosition;
        // Scale label based on player count
        const scale = Math.max(0.6, 1 - players.length * 0.03);
        const myPlayerData = players.find(p => p.id === myId);
        // Flame on: watts exceed 110% of FTP
        const myFlame = myPlayerData?.watts && myPlayerData?.ftp ? myPlayerData.watts > myPlayerData.ftp * 1.1 : false;

        const icon = L.divIcon({
            className: '',
            html: playerLabelHtml(myName, mySpeed, myHr, '#3b82f6', true, myFlame, scale),
            iconSize: [Math.round(130 * scale), Math.round(65 * scale)],
            iconAnchor: [8, 8],
        });
        if (!myMarkerRef.current) {
            myMarkerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
        } else {
            myMarkerRef.current.setLatLng([lat, lng]);
            myMarkerRef.current.setIcon(icon);
        }

        if (!mini) map.panTo([lat, lng], { animate: true, duration: 0.6 });
    }, [myPosition, mySpeed, myHr, myName, mini, players]);

    // ── Other players + their trails ─────────────────────────
    useEffect(() => {
        const map = leafletRef.current;
        if (!map) return;
        const existing = playerMarkersRef.current;
        // Scale factor: more players → smaller labels to reduce overlap
        const scale = Math.max(0.55, 1 - players.length * 0.04);
        const iconW = Math.round(120 * scale);
        const iconH = Math.round(60 * scale);

        players.forEach(({ id, name, position, color = '#f97316', speed = 0, hr = 0, watts = 0, ftp = 0 }) => {
            if (id === myId || !position) return;
            // Flame on: watts exceed 110% of FTP
            const isFlame = ftp > 0 && watts > ftp * 1.1;
            const icon = L.divIcon({
                className: '',
                html: playerLabelHtml(name, speed, hr, color, false, isFlame, scale),
                iconSize: [iconW, iconH], iconAnchor: [6, 6],
            });
            if (existing[id]) {
                existing[id].marker.setLatLng(position);
                existing[id].marker.setIcon(icon);
            } else {
                // zIndexOffset 600: renders above traffic lights (50) and police (300)
                const marker = L.marker(position, { icon, zIndexOffset: 600 }).addTo(map);
                existing[id] = { marker };
            }
        });

        Object.keys(existing).forEach(id => {
            if (!players.find(p => p.id === id)) {
                existing[id].marker.remove();
                delete existing[id];
            }
        });
    }, [players, myId]);

    // ── Auto-fit: zoom to show all players + destination (instructor mode) ─
    useEffect(() => {
        if (!autoFit) return;
        const map = leafletRef.current;
        if (!map) return;
        const allPositions = players
            .filter(p => p.position)
            .map(p => p.position);
        if (myPosition) allPositions.push(myPosition);
        // Always include the target/destination in the bounds
        if (targetPosition) allPositions.push(targetPosition);
        if (allPositions.length < 1) return;
        if (allPositions.length === 1) {
            map.setView(allPositions[0], 14, { animate: true, duration: 1 });
        } else {
            const bounds = L.latLngBounds(allPositions);
            map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16, animate: true, duration: 1 });
        }
    }, [autoFit, players, myPosition, targetPosition]);

    const style = mini
        ? { width: '100%', height: '100%' }
        : { position: 'absolute', inset: 0, zIndex: 0 };

    return <div ref={mapRef} style={style} />;
}
