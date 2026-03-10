import React, { useMemo } from 'react';
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

function elevColor(frac) {
    for (let i = 1; i < ELEV_COLORS.length; i++) {
        if (frac <= ELEV_COLORS[i].frac) {
            const a = ELEV_COLORS[i - 1], b = ELEV_COLORS[i];
            const t = (frac - a.frac) / (b.frac - a.frac);
            // Simple hex lerp
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

export default function MountainProfile({ mountainId, players }) {
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
    const MB = 60;   // bottom margin
    const MT = 120;  // top margin
    const EFF = H - MT - MB;

    const getX = (km) => (km / mt.totalDistKm) * W;
    const getY = (elev) => H - MB - (elev / maxElev) * EFF;

    // ── Mountain fill path ───────────────────────────────────
    const profilePath = `M ${getX(0)},${getY(0)} `
        + points.slice(1).map(p => `L ${getX(p.km)},${getY(p.elev)}`).join(' ')
        + ` L ${W},${H - MB} L 0,${H - MB} Z`;

    // ── Profile outline (no bottom) ──────────────────────────
    const profileLine = `M ${getX(0)},${getY(0)} `
        + points.slice(1).map(p => `L ${getX(p.km)},${getY(p.elev)}`).join(' ');

    // ── Colored segment paths (height-based fill) ────────────
    const segPaths = points.slice(1).map((p, i) => {
        const prev = points[i];
        const midElev = (prev.elev + p.elev) / 2;
        const frac = midElev / maxElev;
        const col = elevColor(frac);
        const segPath = `M ${getX(prev.km)},${getY(prev.elev)} L ${getX(p.km)},${getY(p.elev)} L ${getX(p.km)},${H - MB} L ${getX(prev.km)},${H - MB} Z`;
        return { path: segPath, fill: col, grade: p.grade, midKm: (prev.km + p.km) / 2, midElev, key: i };
    });

    // ── Player positions with collision avoidance ────────────
    const sortedPlayers = [...players].sort((a, b) => (b.distKm || 0) - (a.distKm || 0));

    const playerPositions = useMemo(() => {
        const posArr = sortedPlayers.map(p => {
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
            return { ...p, safeKm, px: getX(safeKm), py: getY(elev), elev, grade };
        });

        // ── Smart label stacking: avoid overlap ──────────────
        const BOX_W = 130;  // approximate label width in SVG units
        const BOX_H = 85;   // approximate label height
        const sorted = [...posArr].sort((a, b) => a.px - b.px);
        const placed = [];

        for (const p of sorted) {
            let bestY = p.py - 90;   // default: above bike
            let side = 0;            // 0 = centered, -1 = left, 1 = right

            // Check if this overlaps any placed box
            for (let attempt = 0; attempt < 6; attempt++) {
                const candidateY = bestY - attempt * BOX_H;
                let collides = false;
                for (const box of placed) {
                    if (Math.abs(p.px - box.x) < BOX_W && Math.abs(candidateY - box.y) < BOX_H) {
                        collides = true;
                        break;
                    }
                }
                if (!collides) {
                    bestY = candidateY;
                    break;
                }
            }
            placed.push({ x: p.px, y: bestY });
            p.labelY = bestY - p.py;
        }
        return posArr;
    }, [sortedPlayers, points, mt.totalDistKm]);

    // ── Gradient defs for colored segments ────────────────────
    const gradId = `mtnFill_${mountainId}`;

    return (
        <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, #04040a 0%, #0a0a1a 40%, #0f172a 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
        }}>
            {/* ── Mountain name — subtle bottom-right watermark ── */}
            <div style={{
                position: 'absolute', bottom: 20, right: 30, zIndex: 1,
                fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic',
                fontSize: 'clamp(36px, 5vw, 72px)', fontWeight: 900,
                color: 'rgba(255,255,255,0.06)', letterSpacing: 4,
                lineHeight: 1, textTransform: 'uppercase', pointerEvents: 'none',
            }}>
                {mt.name}
            </div>

            {/* ── Mountain name — readable header ── */}
            <div style={{
                position: 'absolute', top: 12, left: 20, zIndex: 10,
                fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic',
                fontSize: 'clamp(18px, 2.5vw, 32px)', fontWeight: 900,
                color: '#e2e2f0', letterSpacing: 2,
                textShadow: '0 2px 12px rgba(0,0,0,0.8)',
            }}>
                ⛰️ {mt.name} <span style={{ color: '#52526a', fontWeight: 700, fontSize: '0.7em' }}>{mt.country} · {mt.totalDistKm} km</span>
            </div>

            <div style={{ position: 'relative', width: '92%', maxWidth: 1500, aspectRatio: '2/1' }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>

                    {/* Sky gradient */}
                    <defs>
                        <linearGradient id={`${gradId}_sky`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(15,23,42,0)" />
                            <stop offset="100%" stopColor="rgba(15,23,42,0.4)" />
                        </linearGradient>
                        {/* Elevation gradient for the full mountain fill */}
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            {ELEV_COLORS.map((c, i) => (
                                <stop key={i} offset={`${(1 - c.frac) * 100}%`} stopColor={c.color} stopOpacity="0.35" />
                            ))}
                        </linearGradient>
                    </defs>

                    {/* Subtle grid lines */}
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

                    {/* Colored segments fill */}
                    {segPaths.map(s => (
                        <path key={s.key} d={s.path} fill={s.fill} opacity="0.25" />
                    ))}

                    {/* Main mountain fill with vertical gradient */}
                    <path d={profilePath} fill={`url(#${gradId})`} />

                    {/* Mountain profile outline — white glow */}
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

                    {/* ── KM markers on bottom axis ── */}
                    {Array.from({ length: Math.floor(mt.totalDistKm) + 1 }, (_, i) => i).filter((_, i, a) => {
                        const step = a.length > 15 ? 5 : a.length > 8 ? 2 : 1;
                        return _ % step === 0;
                    }).map(km => (
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

                    {/* ── Finish flag ── */}
                    <g transform={`translate(${W - 10}, ${getY(maxElev)})`}>
                        <text x="0" y="-8" fontSize="28" textAnchor="end">🏁</text>
                    </g>

                    {/* ── Players ── */}
                    {playerPositions.map((p, i) => {
                        const color = p.team === 'A' ? '#eab308' :
                            p.team === 'B' ? '#3b82f6' :
                                p.team === 'C' ? '#22c55e' :
                                    p.team === 'D' ? '#a855f7' :
                                        (p.color || '#e2e2f0');

                        const wkg = p.wkg || (p.watts / (p.weight || 75));
                        const isFlame = p.ftp > 0 && p.watts > p.ftp * 1.1;
                        const isBot = p.isBot;
                        const bikeW = isBot ? 44 : 56;

                        return (
                            <g key={p.id} style={{ transition: 'transform 0.5s linear' }}
                                transform={`translate(${p.px}, ${p.py})`}>

                                {/* Vertical drop line to baseline */}
                                <line x1={0} y1={0} x2={0} y2={H - MB - p.py}
                                    stroke={color} strokeWidth="1" strokeDasharray="3 4" opacity={0.2} />

                                {/* Connector from bike to stacked label (if shifted) */}
                                {p.labelY < -90 && (
                                    <line x1={0} y1={p.labelY + 70} x2={0} y2={-15}
                                        stroke={color} strokeWidth="1.5" strokeDasharray="4 3" opacity={0.5} />
                                )}

                                {/* Bike icon — all on the profile line, can overlap */}
                                <g transform="translate(0, -10)">
                                    {isFlame && (
                                        <text x={-bikeW / 2 - 8} y={-4} fontSize="22"
                                            style={{ filter: 'drop-shadow(0 0 8px #f97316)' }}>🔥</text>
                                    )}
                                    <image href="/phantom-bike.png"
                                        x={-bikeW / 2} y={-bikeW / 2} width={bikeW} height={bikeW}
                                        opacity={0.95}
                                        style={{
                                            filter: isFlame
                                                ? 'drop-shadow(0 -3px 8px rgba(255,69,0,0.8)) drop-shadow(0 0 4px rgba(255,140,0,0.6))'
                                                : `drop-shadow(0 0 3px ${color})`,
                                        }} />
                                </g>

                                {/* Metric box — non-overlapping via labelY */}
                                <g transform={`translate(0, ${p.labelY})`}>
                                    <rect x="-55" y="0" width="110" height={isBot ? 28 : 60} rx="8"
                                        fill="rgba(4,4,7,0.92)" stroke={color}
                                        strokeWidth={isBot ? "1" : "1.5"} opacity="0.95" />

                                    {/* Name */}
                                    <text y={isBot ? 19 : 18} fill="#e2e2f0"
                                        fontSize={isBot ? "12" : "14"} fontWeight="800"
                                        fontFamily="Inter,sans-serif" textAnchor="middle"
                                        style={{ textShadow: '0 1px 4px #000' }}>
                                        {(p.name || '').substring(0, 12)}
                                    </text>

                                    {/* Metrics (real players only) */}
                                    {!isBot && (
                                        <>
                                            <text y="36" fill={color} fontSize="11" fontWeight="800"
                                                fontFamily="Inter,sans-serif" textAnchor="middle">
                                                {wkg.toFixed(1)} W/kg
                                            </text>
                                            <text y="52" fill="#52526a" fontSize="10" fontWeight="700"
                                                fontFamily="Inter,sans-serif" textAnchor="middle">
                                                {(p.speed || 0).toFixed(0)} km/h · {(p.distKm || 0).toFixed(1)} km
                                            </text>
                                        </>
                                    )}
                                </g>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}
