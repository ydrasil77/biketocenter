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
function playerLabelHtml(name, speed, hr, color, isMe, isZ5) {
    const speedStr = speed > 0 ? `${speed.toFixed(1)}<span style="font-size:12px;opacity:0.7">km/h</span>` : '';
    const hrStr = hr > 0 ? `❤ ${Math.round(hr)}` : '';
    const badge = [speedStr, hrStr].filter(Boolean).join(' · ');

    // Add pulsing flame effect if isZ5 is true
    const bikeFilter = isZ5
        ? `drop-shadow(0 -4px 12px rgba(255, 69, 0, 0.9)) drop-shadow(0 0 8px rgba(255, 140, 0, 0.8))`
        : `drop-shadow(0 0 ${isMe ? 6 : 4}px ${color})`;

    return `
    <div style="display:flex;flex-direction:column;align-items:flex-start;pointer-events:none;white-space:nowrap;">
      <div style="position:relative;width:${isMe ? 55 : 45}px;height:${isMe ? 55 : 45}px;margin-bottom:3px;">
        ${isMe ? `<div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.3;" class="marker-ping"></div>` : ''}
        <img class="${isZ5 ? 'flame-flicker' : ''}" src="/phantom-bike.png" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;filter:${bikeFilter}; transition: filter 0.3s;" />
      </div>
      <div style="background:rgba(4,4,7,0.85);border:2px solid ${color};border-radius:6px;padding:3px 10px;font-family:'Inter',sans-serif;font-size:16px;font-weight:800;color:#e2e2f0;line-height:1.45;backdrop-filter:blur(4px);max-width:140px;">
        ${isMe ? '⚡ ' : ''}${name}
        ${badge ? `<br><span style="font-size:13px;color:${color}">${badge}</span>` : ''}
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

        // Target marker
        if (targetPosition) {
            L.marker(targetPosition, {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="width:22px;height:22px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 0 18px #22c55e;"></div>`,
                    iconSize: [22, 22], iconAnchor: [11, 11],
                }),
            }).addTo(map).bindTooltip(targetName ?? 'Target', {
                permanent: !mini, className: 'target-tooltip', offset: [14, 0],
            });
        }

        // Own trail — bright solid blue with glow underlay
        // Two polylines: thick glow layer + bright top layer
        myTrailRef.current = L.layerGroup([
            L.polyline([], { color: '#3b82f6', weight: 10, opacity: 0.18 }),  // glow
            L.polyline([], { color: '#60a5fa', weight: 4, opacity: 0.92 }),  // bright line
        ]).addTo(map);
        myTrailRef.current._lines = myTrailRef.current.getLayers();

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


    // ── Independent traffic light markers on map ──────────────
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
                tls[id] = L.marker(position, { icon, zIndexOffset: 200, interactive: false }).addTo(map);
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
        const myWkg = (myHr /* assuming we have hr passed, actually we need to estimate or just check zone */);
        // MapView is missing 'zone' directly as a prop for 'my', but we can check if it's over Z5 logically if we pass it later. For now let's leave my player without a hardcoded Zone logic unless we pull it from players array.
        const myPlayerData = players.find(p => p.id === myId);
        const myZ5 = myPlayerData?.zone === 'Z5' || myPlayerData?.zone === 'Z6';

        const icon = L.divIcon({
            className: '',
            html: playerLabelHtml(myName, mySpeed, myHr, '#3b82f6', true, myZ5),
            iconSize: [130, 65], iconAnchor: [10, 10],
        });
        if (!myMarkerRef.current) {
            myMarkerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
        } else {
            myMarkerRef.current.setLatLng([lat, lng]);
            myMarkerRef.current.setIcon(icon);
        }
        // Update both trail layers with latest coords
        myTrailCoords.current.push([lat, lng]);
        if (myTrailCoords.current.length > 1200) myTrailCoords.current.shift();
        myTrailRef.current?._lines?.forEach(l => l.setLatLngs(myTrailCoords.current));
        if (!mini) map.panTo([lat, lng], { animate: true, duration: 0.6 });
    }, [myPosition, mySpeed, myHr, myName, mini]);

    // ── Other players + their trails ─────────────────────────
    useEffect(() => {
        const map = leafletRef.current;
        if (!map) return;
        const existing = playerMarkersRef.current;

        players.forEach(({ id, name, position, color = '#f97316', speed = 0, hr = 0, zone }) => {
            if (id === myId || !position) return;
            const isZ5 = zone === 'Z5' || zone === 'Z6';
            const icon = L.divIcon({
                className: '',
                html: playerLabelHtml(name, speed, hr, color, false, isZ5),
                iconSize: [120, 60], iconAnchor: [7, 7],
            });
            if (existing[id]) {
                existing[id].marker.setLatLng(position);
                existing[id].marker.setIcon(icon);
                existing[id].coords.push([...position]);
                if (existing[id].coords.length > 500) existing[id].coords.shift();
                existing[id].trail.getLayers().forEach(l => l.setLatLngs(existing[id].coords));
            } else {
                // Two-layer trail: glow + solid bright color line
                const glow = L.polyline([[...position]], { color, weight: 9, opacity: 0.15 });
                const bright = L.polyline([[...position]], { color, weight: 3, opacity: 0.80 });
                const trail = L.layerGroup([glow, bright]).addTo(map);
                const marker = L.marker(position, { icon, zIndexOffset: 50 }).addTo(map);
                existing[id] = { marker, trail, coords: [[...position]] };
            }
        });

        Object.keys(existing).forEach(id => {
            if (!players.find(p => p.id === id)) {
                existing[id].marker.remove();
                existing[id].trail.remove();
                delete existing[id];
            }
        });
    }, [players, myId]);

    // ── Auto-fit: zoom to show all players (instructor mode) ─────
    useEffect(() => {
        if (!autoFit) return;
        const map = leafletRef.current;
        if (!map) return;
        const allPositions = players
            .filter(p => p.position)
            .map(p => p.position);
        if (myPosition) allPositions.push(myPosition);
        if (allPositions.length < 1) return;
        if (allPositions.length === 1) {
            map.setView(allPositions[0], 15, { animate: true, duration: 1 });
        } else {
            const bounds = L.latLngBounds(allPositions);
            map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16, animate: true, duration: 1 });
        }
    }, [autoFit, players, myPosition]);

    const style = mini
        ? { width: '100%', height: '100%' }
        : { position: 'absolute', inset: 0, zIndex: 0 };

    return <div ref={mapRef} style={style} />;
}
