import React, { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MOUNTAINS } from '../utils/mountains';

// ── Height-based color stops (low → high) ────────────────────
const ELEV_COLORS = [
    { frac: 0.0, color: '#166534' },  // dark green — valley
    { frac: 0.2, color: '#22c55e' },  // green — forest
    { frac: 0.4, color: '#84cc16' },  // lime — meadow
    { frac: 0.6, color: '#eab308' },  // amber — treeline
    { frac: 0.8, color: '#d97706' },  // brown — rocky
    { frac: 1.0, color: '#9ca3af' },  // grey — summit
];

const TEAM_COLORS = { A: '#eab308', B: '#3b82f6', C: '#22c55e', D: '#a855f7' };

function elevColor(frac) {
    for (let i = 1; i < ELEV_COLORS.length; i++) {
        if (frac <= ELEV_COLORS[i].frac) {
            const a = ELEV_COLORS[i - 1], b = ELEV_COLORS[i];
            const t = (frac - a.frac) / (b.frac - a.frac);
            const c1 = parseInt(a.color.slice(1), 16);
            const c2 = parseInt(b.color.slice(1), 16);
            const r = Math.round(((c1 >> 16) & 0xff) * (1 - t) + ((c2 >> 16) & 0xff) * t);
            const g = Math.round(((c1 >> 8) & 0xff) * (1 - t) + ((c2 >> 8) & 0xff) * t);
            const bl = Math.round((c1 & 0xff) * (1 - t) + (c2 & 0xff) * t);
            return `rgb(${r},${g},${bl})`;
        }
    }
    return '#9ca3af';
}

function zoneColor(zone) {
    if (zone === 'Z5') return '#ef4444';
    if (zone === 'Z4') return '#f97316';
    if (zone === 'Z3') return '#eab308';
    if (zone === 'Z2') return '#22c55e';
    return '#3b82f6';
}

export default function MountainProfile({ mountainId, players, roomCode, joinUrl }) {
    const mt = MOUNTAINS[mountainId];
    if (!mt) return <div style={{ color: 'white' }}>Mountain not found</div>;

    // ── Build elevation profile ──────────────────────────────
    const { points, maxElev } = useMemo(() => {
        let curElev = 0;
        const pts = [{ km: 0, elev: 0, grade: 0 }];
        for (const seg of mt.segments) {
            const prev = pts[pts.length - 1];
            const dist = Math.max(0, seg.endKm - prev.km);
            curElev += dist * 1000 * seg.grade;
            pts.push({ km: seg.endKm, elev: curElev, grade: seg.grade });
        }
        return { points: pts, maxElev: curElev };
    }, [mt]);

    // ── SVG layout ───────────────────────────────────────────
    const W = 1400;
    const H = 700;
    const MB = 55;   // bottom margin
    const MT = 80;   // top margin (reduced so boxes have more room above)
    const EFF = H - MT - MB;

    const getX = (km) => (km / mt.totalDistKm) * W;
    const getY = (elev) => H - MB - (elev / maxElev) * EFF;

    // ── Mountain fill path ───────────────────────────────────
    const profilePath = `M ${getX(0)},${getY(0)} `
        + points.slice(1).map(p => `L ${getX(p.km)},${getY(p.elev)}`).join(' ')
        + ` L ${W},${H - MB} L 0,${H - MB} Z`;

    // ── Profile outline ──────────────────────────────────────
    const profileLine = `M ${getX(0)},${getY(0)} `
        + points.slice(1).map(p => `L ${getX(p.km)},${getY(p.elev)}`).join(' ');

    // ── Colored segment paths ────────────────────────────────
    const segPaths = points.slice(1).map((p, i) => {
        const prev = points[i];
        const midElev = (prev.elev + p.elev) / 2;
        const frac = midElev / maxElev;
        const col = elevColor(frac);
        const segPath = `M ${getX(prev.km)},${getY(prev.elev)} L ${getX(p.km)},${getY(p.elev)} L ${getX(p.km)},${H - MB} L ${getX(prev.km)},${H - MB} Z`;
        return { path: segPath, fill: col, grade: p.grade, midKm: (prev.km + p.km) / 2, midElev, key: i };
    });

    // ── Player positions with compact collision-safe boxes ───
    const playerPositions = useMemo(() => {
        const sorted = [...players].sort((a, b) => (b.distKm || 0) - (a.distKm || 0));

        const posArr = sorted.map((p, rank) => {
            const safeKm = Math.max(0, Math.min(p.distKm || 0, mt.totalDistKm));
            let cur = points[0], nxt = points[1];
            for (let j = 0; j < points.length - 1; j++) {
                if (safeKm >= points[j].km && safeKm <= points[j + 1].km) {
                    cur = points[j]; nxt = points[j + 1]; break;
                }
            }
            const frac = (safeKm - cur.km) / (nxt.km - cur.km || 1);
            const elev = cur.elev + frac * (nxt.elev - cur.elev);
            const grade = nxt.grade;
            return { ...p, safeKm, px: getX(safeKm), py: getY(elev), elev, grade, rank: rank + 1 };
        });

        const BW_REAL = 185, BH_REAL = 96;
        const BW_BOT  = 130, BH_BOT  = 28;
        const GAP = 6;

        // Sort left → right; try horizontal shifts FIRST so clustered riders spread out
        const byX = [...posArr].sort((a, b) => a.px - b.px);
        const placed = []; // { left, top, right, bottom } in absolute SVG coords

        for (const p of byX) {
            const BW = p.isBot ? BW_BOT : BW_REAL;
            const BH = p.isBot ? BH_BOT : BH_REAL;

            // Base position: well above the bike so it's always visible
            const baseY = p.py - BH - 50;
            // Try centered-on-bike first, then shift right, left, further right, further left…
            const xShifts = [0, BW * 0.9, -BW * 0.9, BW * 1.8, -BW * 1.8, BW * 2.7, -BW * 2.7];

            let bestBox = null;
            outer:
            for (const xShift of xShifts) {
                for (let ya = 0; ya < 20; ya++) {
                    const yd = ya % 2 === 0 ? -(Math.floor(ya / 2)) : Math.ceil(ya / 2);
                    const by = baseY + yd * (BH + GAP);
                    const bx = p.px + xShift;

                    const cx = Math.max(BW / 2 + 2, Math.min(bx, W - BW / 2 - 2));
                    const cy = Math.max(2, Math.min(by, H - MB - BH - 2));

                    const left = cx - BW / 2, right = cx + BW / 2;
                    const top = cy, bottom = cy + BH;

                    let ok = true;
                    for (const box of placed) {
                        if (left < box.right + GAP && right > box.left - GAP &&
                            top < box.bottom + GAP && bottom > box.top - GAP) {
                            ok = false; break;
                        }
                    }
                    if (ok) { bestBox = { left, top, right, bottom, cx, cy }; break outer; }
                }
            }

            if (!bestBox) {
                const cx = Math.max(BW / 2 + 2, Math.min(p.px, W - BW / 2 - 2));
                const cy = Math.max(2, Math.min(baseY, H - MB - BH - 2));
                bestBox = { left: cx - BW / 2, top: cy, right: cx + BW / 2, bottom: cy + BH, cx, cy };
            }

            placed.push(bestBox);
            p.boxX = bestBox.cx;   // center-X of box in SVG coords
            p.boxY = bestBox.top;  // top-Y of box in SVG coords
            p.BOX_W = BW;
            p.BOX_H = BH;
        }
        return posArr;
    }, [players, points, mt.totalDistKm]); // eslint-disable-line

    const gradId = `mtnFill_${mountainId}`;

    // Sorted for the right panel
    const rankedPlayers = [...playerPositions].sort((a, b) => a.rank - b.rank);

    return (
        <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, #04040a 0%, #0a0a1a 40%, #0f172a 100%)',
            display: 'flex', flexDirection: 'row',
            overflow: 'hidden',
        }}>
            {/* ── Full-screen mountain name watermark ── */}
            <div style={{
                position: 'absolute', inset: 0, zIndex: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', overflow: 'hidden',
            }}>
                <div style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontStyle: 'italic', fontWeight: 900,
                    fontSize: 'clamp(70px, 14vw, 200px)',
                    color: 'rgba(255,255,255,0.07)',
                    letterSpacing: 8, textTransform: 'uppercase',
                    whiteSpace: 'nowrap', userSelect: 'none', lineHeight: 1,
                    textShadow: '0 0 80px rgba(255,255,255,0.03)',
                }}>
                    {mt.name.toUpperCase()}
                </div>
            </div>

            {/* ── SVG area ── */}
            <div style={{
                position: 'relative', flex: 1, zIndex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
            }}>
                {/* Readable header */}
                <div style={{
                    position: 'absolute', top: 12, left: 20, zIndex: 10,
                    fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic',
                    fontSize: 'clamp(16px, 2vw, 28px)', fontWeight: 900,
                    color: '#e2e2f0', letterSpacing: 2,
                    textShadow: '0 2px 12px rgba(0,0,0,0.8)',
                }}>
                    ⛰️ {mt.name}
                    <span style={{ color: '#52526a', fontWeight: 700, fontSize: '0.65em', marginLeft: 8 }}>
                        {mt.country} · {mt.totalDistKm} km · {Math.round(maxElev)}m elev
                    </span>
                </div>

                {/* SVG clips so boxes never escape top/bottom of the chart area */}
                <div style={{ position: 'relative', width: '98%', aspectRatio: '2/1', overflow: 'hidden' }}>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>

                        <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                {ELEV_COLORS.map((c, i) => (
                                    <stop key={i} offset={`${(1 - c.frac) * 100}%`} stopColor={c.color} stopOpacity="0.35" />
                                ))}
                            </linearGradient>
                        </defs>

                        {/* Grid lines */}
                        {[0.25, 0.5, 0.75, 1].map(frac => (
                            <g key={frac}>
                                <line x1={0} y1={H - MB - frac * EFF} x2={W} y2={H - MB - frac * EFF}
                                    stroke="rgba(255,255,255,0.04)" strokeDasharray="4 6" strokeWidth="1" />
                                <text x={8} y={H - MB - frac * EFF - 4} fill="#3f3f5a" fontSize="11"
                                    fontFamily="Inter,sans-serif" fontWeight="700">
                                    {Math.round(maxElev * frac)}m
                                </text>
                            </g>
                        ))}

                        {/* Colored segments */}
                        {segPaths.map(s => <path key={s.key} d={s.path} fill={s.fill} opacity="0.25" />)}

                        {/* Main fill */}
                        <path d={profilePath} fill={`url(#${gradId})`} />

                        {/* Profile outline */}
                        <path d={profileLine} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="3"
                            style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.15))' }} />

                        {/* Grade annotations */}
                        {segPaths.map(s => (
                            <text key={`g${s.key}`} x={getX(s.midKm)} y={getY(s.midElev) - 14}
                                fill={elevColor(s.midElev / maxElev)} fontSize="13" fontWeight="800"
                                fontFamily="Inter,sans-serif" textAnchor="middle" opacity="0.85">
                                {(s.grade * 100).toFixed(1)}%
                            </text>
                        ))}

                        {/* KM markers */}
                        {Array.from({ length: Math.floor(mt.totalDistKm) + 1 }, (_, i) => i)
                            .filter(km => {
                                const step = mt.totalDistKm > 15 ? 5 : mt.totalDistKm > 8 ? 2 : 1;
                                return km % step === 0;
                            })
                            .map(km => (
                                <g key={`km${km}`}>
                                    <line x1={getX(km)} y1={H - MB} x2={getX(km)} y2={H - MB + 8}
                                        stroke="#3f3f5a" strokeWidth="1" />
                                    <text x={getX(km)} y={H - MB + 22} fill="#52526a" fontSize="11"
                                        fontFamily="Inter,sans-serif" fontWeight="700" textAnchor="middle">
                                        {km}km
                                    </text>
                                </g>
                            ))}

                        {/* Bottom baseline */}
                        <line x1={0} y1={H - MB} x2={W} y2={H - MB} stroke="#3f3f5a" strokeWidth="1.5" />

                        {/* Finish flag */}
                        <g transform={`translate(${W - 10}, ${getY(maxElev)})`}>
                            <text x="0" y="-8" fontSize="28" textAnchor="end">🏁</text>
                        </g>

                        {/* ── Boxes — rendered FIRST so bikes always appear on top ── */}
                        {playerPositions.map((p) => {
                            const color = TEAM_COLORS[p.team] || p.color || '#e2e2f0';
                            const pWkg = p.wkg > 0 ? p.wkg
                                : (p.watts > 0 && p.weight > 0 ? p.watts / p.weight
                                    : (p.watts > 0 ? p.watts / 75 : 0));
                            const isBot = p.isBot;
                            const BW = p.BOX_W, BH = p.BOX_H;
                            const rankLbl = p.rank <= 3
                                ? (p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : '🥉')
                                : `#${p.rank}`;
                            const zc = zoneColor(p.zone);
                            return (
                                <g key={`box-${p.id}`}
                                    style={{ transition: 'transform 0.9s cubic-bezier(0.25,0.46,0.45,0.94)' }}
                                    transform={`translate(${p.boxX}, ${p.boxY})`}>
                                    <rect x={-BW / 2} y="0" width={BW} height={BH} rx="8"
                                        fill="rgba(4,4,7,0.96)" stroke={color}
                                        strokeWidth={isBot ? "0.8" : "1.8"} />
                                    <rect x={-BW / 2} y="0" width="5" height={BH} rx="4"
                                        fill={color} opacity="0.9" />
                                    <text x="6" y="16" fill={isBot ? '#52526a' : '#ffffff'}
                                        fontSize={isBot ? "10" : "14"} fontWeight="900"
                                        fontFamily="'Barlow Condensed',sans-serif" fontStyle="italic"
                                        textAnchor="middle" letterSpacing="0.5">
                                        {!isBot && `${rankLbl} `}{(p.name || '').substring(0, 13)}
                                    </text>
                                    {isBot && (
                                        <text x="6" y="21" fill="#3f3f5a" fontSize="9"
                                            fontFamily="'Barlow Condensed',sans-serif" textAnchor="middle">
                                            {(p.speed || 0).toFixed(0)} km/h · {(p.distKm || 0).toFixed(1)} km
                                        </text>
                                    )}
                                    {!isBot && (<>
                                        <line x1={-BW / 2 + 7} y1="20" x2={BW / 2 - 4} y2="20"
                                            stroke={color} strokeWidth="0.5" opacity="0.3" />
                                        <text x="-38" y="33" fill="#f97316" fontSize="13" fontWeight="800"
                                            fontFamily="'Barlow Condensed',sans-serif" fontStyle="italic" textAnchor="middle">
                                            {Math.round(p.watts || 0)}W
                                        </text>
                                        <text x="-4" y="33" fill="#3f3f5a" fontSize="11"
                                            fontFamily="Inter,sans-serif" textAnchor="middle">|</text>
                                        <text x="46" y="33" fill={color} fontSize="13" fontWeight="800"
                                            fontFamily="'Barlow Condensed',sans-serif" fontStyle="italic" textAnchor="middle">
                                            {pWkg > 0 ? pWkg.toFixed(1) : '—'} w/kg
                                        </text>
                                        <text x="6" y="48" fill="#f43f5e" fontSize="12" fontWeight="800"
                                            fontFamily="'Barlow Condensed',sans-serif" fontStyle="italic" textAnchor="middle">
                                            ♥ {p.hr > 0 ? Math.round(p.hr) + ' bpm' : '— bpm'}
                                        </text>
                                        <text x="-32" y="63" fill="#22c55e" fontSize="12" fontWeight="800"
                                            fontFamily="'Barlow Condensed',sans-serif" fontStyle="italic" textAnchor="middle">
                                            {(p.speed || 0).toFixed(0)} km/h
                                        </text>
                                        <text x="-4" y="63" fill="#3f3f5a" fontSize="11"
                                            fontFamily="Inter,sans-serif" textAnchor="middle">|</text>
                                        <text x="46" y="63" fill="#94a3b8" fontSize="12" fontWeight="700"
                                            fontFamily="'Barlow Condensed',sans-serif" fontStyle="italic" textAnchor="middle">
                                            {(p.distKm || 0).toFixed(2)} km
                                        </text>
                                        <text x="-44" y="78" fill="#84cc16" fontSize="11" fontWeight="700"
                                            fontFamily="'Barlow Condensed',sans-serif" fontStyle="italic" textAnchor="middle">
                                            ⛰{Math.round(p.elev || 0)}m
                                        </text>
                                        <text x="-12" y="78" fill="#3f3f5a" fontSize="11"
                                            fontFamily="Inter,sans-serif" textAnchor="middle">|</text>
                                        <text x="18" y="78" fill="#60a5fa" fontSize="11" fontWeight="700"
                                            fontFamily="'Barlow Condensed',sans-serif" fontStyle="italic" textAnchor="middle">
                                            {((p.grade || 0) * 100).toFixed(1)}%
                                        </text>
                                        {p.zone && p.zone !== 'Z0' && (<>
                                            <rect x="40" y="68" width="36" height="15" rx="4"
                                                fill={zc + '28'} stroke={zc} strokeWidth="0.8" />
                                            <text x="58" y="79" fill={zc} fontSize="10" fontWeight="900"
                                                fontFamily="'Barlow Condensed',sans-serif" fontStyle="italic" textAnchor="middle" letterSpacing="1">
                                                {p.zone}
                                            </text>
                                        </>)}
                                        {p.ftp > 0 && (<>
                                            <rect x={-BW / 2 + 7} y="85" width={BW - 14} height="6" rx="3"
                                                fill="rgba(255,255,255,0.06)" />
                                            <rect x={-BW / 2 + 7} y="85"
                                                width={Math.min((p.watts / p.ftp), 1.5) * (BW - 14)} height="6" rx="3"
                                                fill={p.watts > p.ftp ? '#ef4444' : p.watts > p.ftp * 0.75 ? '#f97316' : '#22c55e'} />
                                            <text x={-BW / 2 + 9} y="83" fill="#52526a" fontSize="8"
                                                fontFamily="Inter,sans-serif">FTP%</text>
                                            <text x={BW / 2 - 6} y="83" fill="#52526a" fontSize="8"
                                                fontFamily="Inter,sans-serif" textAnchor="end">
                                                {Math.round((p.watts / p.ftp) * 100)}%
                                            </text>
                                        </>)}
                                    </>)}
                                </g>
                            );
                        })}

                        {/* ── Bikes + connectors — rendered LAST so always visible ── */}
                        {playerPositions.map((p) => {
                            const color = TEAM_COLORS[p.team] || p.color || '#e2e2f0';
                            const isFlame = p.ftp > 0 && p.watts > p.ftp * 1.1;
                            const isBot = p.isBot;
                            const bikeW = isBot ? 40 : 54;
                            // Connect from nearest vertical edge of box to bike
                            const connY = p.boxY + p.BOX_H < p.py ? p.boxY + p.BOX_H : p.boxY;
                            return (
                                <g key={`bike-${p.id}`}>
                                    {/* Vertical drop line to baseline */}
                                    <line x1={p.px} y1={p.py} x2={p.px} y2={H - MB}
                                        stroke={color} strokeWidth="1" strokeDasharray="3 4" opacity={0.18} />
                                    {/* Connector: box → bike */}
                                    <line x1={p.boxX} y1={connY} x2={p.px} y2={p.py - 10}
                                        stroke={color} strokeWidth="1.5" strokeDasharray="4 3" opacity={0.55}
                                        style={{ transition: 'all 0.9s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
                                    {/* Bike icon with smooth transition */}
                                    <g transform={`translate(${p.px}, ${p.py - 10})`}
                                        style={{ transition: 'transform 0.9s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
                                        {isFlame && (
                                            <text x={-bikeW / 2 - 6} y={-4} fontSize="20"
                                                style={{ filter: 'drop-shadow(0 0 8px #f97316)' }}>🔥</text>
                                        )}
                                        <image href="/phantom-bike.png"
                                            x={-bikeW / 2} y={-bikeW / 2} width={bikeW} height={bikeW}
                                            opacity={isBot ? 0.6 : 0.95}
                                            style={{
                                                filter: isFlame
                                                    ? 'drop-shadow(0 -3px 8px rgba(255,69,0,0.8))'
                                                    : `drop-shadow(0 0 6px ${color})`,
                                            }} />
                                    </g>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>

            {/* ── Right player list + QR panel ── */}
            <div style={{
                width: 240,
                flexShrink: 0, zIndex: 1,
                background: 'rgba(4,4,7,0.82)',
                borderLeft: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(14px)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
                {/* Panel header */}
                <div style={{
                    padding: '12px 14px 8px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#52526a', textTransform: 'uppercase' }}>
                        ⛰️ Riders
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#84cc16' }}>
                        {rankedPlayers.length}
                    </span>
                </div>

                {/* Scrollable rider list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                    {rankedPlayers.map((p, i) => {
                        const color = TEAM_COLORS[p.team] || '#e2e2f0';
                        const pWkg = p.wkg > 0 ? p.wkg
                            : (p.watts > 0 && p.weight > 0 ? p.watts / p.weight
                                : (p.watts > 0 ? p.watts / 75 : 0));
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                        const zc = zoneColor(p.zone);
                        return (
                            <div key={p.id} style={{
                                marginBottom: p.isBot ? 3 : 5,
                                borderRadius: 8,
                                background: p.isBot ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${p.isBot ? 'rgba(255,255,255,0.04)' : color + '35'}`,
                                padding: p.isBot ? '4px 8px' : '7px 10px',
                                opacity: p.isBot ? 0.5 : 1,
                                borderLeft: `3px solid ${color}${p.isBot ? '40' : 'bb'}`,
                            }}>
                                {/* Name + dist */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: p.isBot ? 0 : 4 }}>
                                    <span style={{ fontSize: 12, minWidth: 24, fontWeight: 900,
                                        color: medal ? 'transparent' : '#52526a', textAlign: 'center',
                                        textShadow: medal ? 'none' : 'none',
                                    }}>
                                        {medal || `${i + 1}.`}
                                    </span>
                                    <span style={{
                                        fontSize: 12, fontWeight: 800, flex: 1,
                                        color: p.isBot ? '#3f3f5a' : '#e2e2f0',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        fontFamily: "'Barlow Condensed',sans-serif",
                                        letterSpacing: 0.5,
                                    }}>
                                        {p.name}
                                    </span>
                                    <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 800, flexShrink: 0 }}>
                                        {(p.distKm || 0).toFixed(1)}km
                                    </span>
                                </div>

                                {/* Real player metrics: 3 rows */}
                                {!p.isBot && (
                                    <>
                                        <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                                            <span style={{ fontSize: 11, color: '#f97316', fontWeight: 700 }}>
                                                {Math.round(p.watts || 0)}W
                                            </span>
                                            <span style={{ fontSize: 11, color, fontWeight: 700 }}>
                                                {pWkg > 0 ? pWkg.toFixed(1) : '—'} w/kg
                                            </span>
                                            {p.hr > 0 && (
                                                <span style={{ fontSize: 11, color: '#f43f5e', fontWeight: 700 }}>
                                                    ♥{Math.round(p.hr)}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>
                                                {(p.speed || 0).toFixed(0)} km/h
                                            </span>
                                            <span style={{ fontSize: 10, color: '#84cc16' }}>
                                                ⛰{Math.round(p.elev || 0)}m
                                            </span>
                                            <span style={{ fontSize: 10, color: '#60a5fa' }}>
                                                {((p.grade || 0) * 100).toFixed(1)}%
                                            </span>
                                            {p.zone && p.zone !== 'Z0' && (
                                                <span style={{
                                                    fontSize: 9, fontWeight: 800, color: zc,
                                                    background: zc + '22', borderRadius: 3,
                                                    padding: '0px 4px', border: `1px solid ${zc}44`,
                                                }}>
                                                    {p.zone}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}

                                {p.isBot && (
                                    <div style={{ fontSize: 9, color: '#3f3f5a' }}>
                                        {(p.speed || 0).toFixed(0)} km/h
                                        {pWkg > 0 ? ` · ${pWkg.toFixed(1)} w/kg` : ''}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* QR Code at the bottom of the panel — no overlap with mountain */}
                {joinUrl && (
                    <div style={{
                        flexShrink: 0,
                        borderTop: '1px solid rgba(255,255,255,0.07)',
                        padding: '12px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        background: 'rgba(0,0,0,0.3)',
                    }}>
                        <div style={{ background: '#fff', borderRadius: 10, padding: 8, display: 'inline-block' }}>
                            <QRCodeSVG value={joinUrl} size={116} level="M" />
                        </div>
                        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#e2e2f0', margin: 0, textAlign: 'center' }}>
                            ROOM · {roomCode}
                        </p>
                        <p style={{ fontSize: 9, color: '#52526a', letterSpacing: 1, margin: 0 }}>SCAN TO JOIN</p>
                    </div>
                )}
            </div>
        </div>
    );
}
