import React from 'react';
import { MOUNTAINS, getMountainGrade } from '../utils/mountains';

export default function MountainProfile({ mountainId, players }) {
    const mt = MOUNTAINS[mountainId];
    if (!mt) return <div style={{ color: 'white' }}>Mountain not found</div>;

    // Calculate elevation points
    let currentElev = 0;
    const points = [{ km: 0, elev: 0, grade: 0 }];

    for (const seg of mt.segments) {
        const prevDist = points[points.length - 1].km;
        const dist = Math.max(0, seg.endKm - prevDist);
        const elevChange = dist * 1000 * seg.grade;
        currentElev += elevChange;
        points.push({ km: seg.endKm, elev: currentElev, grade: seg.grade });
    }

    const maxElev = currentElev;

    // SVG Coordinate System mapping
    const W = 1200;
    const H = 600;
    const MARGIN_BOTTOM = 50;
    const MARGIN_TOP = 150;
    const EFF_H = H - MARGIN_TOP - MARGIN_BOTTOM;

    const getX = (km) => (km / mt.totalDistKm) * W;
    const getY = (elev) => H - MARGIN_BOTTOM - (elev / maxElev) * EFF_H;

    // Construct SVG path string
    const d = `M ${getX(0)},${getY(0)} ` + points.slice(1).map(p => `L ${getX(p.km)},${getY(p.elev)}`).join(' ') + ` L ${W},${H} L 0,${H} Z`;

    const sortedPlayers = [...players].sort((a, b) => b.distKm - a.distKm);

    return (
        <div style={{
            position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #04040a, #0d0d1a)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>

            {/* Background elements */}
            {/* The text has been moved inside the SVG so it scales naturally and doesn't block the UI container layout */}

            <div style={{ position: 'relative', width: '90%', maxWidth: 1400, aspectRatio: '2/1' }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>

                    {/* Scalable Background Text */}
                    <text x={W / 2} y={H / 2 - 50} textAnchor="middle" fill="#f8fafc" opacity="0.25"
                        fontFamily="'Barlow Condensed', sans-serif" fontStyle="italic" fontSize="260"
                        fontWeight="900" style={{ textShadow: '0 0 40px rgba(59,130,246,0.4)', pointerEvents: 'none' }}>
                        {mt.name.toUpperCase()}
                    </text>

                    {/* Grid lines */}
                    {[0.25, 0.5, 0.75, 1].map(frac => (
                        <line key={frac} x1={0} y1={H - MARGIN_BOTTOM - frac * EFF_H} x2={W} y2={H - MARGIN_BOTTOM - frac * EFF_H}
                            stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" strokeWidth="2" />
                    ))}

                    <path d={d} fill="url(#mtnGrad)" stroke="#3b82f6" strokeWidth="4" />

                    {/* Grade Annotations */}
                    {points.slice(1).map((p, i) => {
                        const prev = points[i];
                        const midKm = (prev.km + p.km) / 2;
                        const midElev = (prev.elev + p.elev) / 2;
                        return (
                            <text key={i} x={getX(midKm)} y={getY(midElev) - 20} fill="#a855f7" fontSize="14"
                                fontWeight="bold" fontFamily="Inter, sans-serif" textAnchor="middle" opacity="0.8">
                                {(p.grade * 100).toFixed(1)}%
                            </text>
                        );
                    })}

                    {/* Players */}
                    {(() => {
                        // Calculate base positions for everyone
                        const playerPositions = sortedPlayers.map((p) => {
                            const safeKm = Math.max(0, Math.min(p.distKm, mt.totalDistKm));

                            let currentP = points[0];
                            let nextP = points[1];
                            for (let j = 0; j < points.length - 1; j++) {
                                if (safeKm >= points[j].km && safeKm <= points[j + 1].km) {
                                    currentP = points[j];
                                    nextP = points[j + 1];
                                    break;
                                }
                            }

                            const frac = (safeKm - currentP.km) / (nextP.km - currentP.km || 1);
                            const exactElev = currentP.elev + frac * (nextP.elev - currentP.elev);

                            return {
                                ...p,
                                safeKm,
                                px: getX(safeKm),
                                py: getY(exactElev),
                                isSpurting: (p.wkg || (p.watts / (p.weight || 75))) > 4.5,
                            };
                        });

                        // Collision resolution algorithm (stacking vertically)
                        // Sort by X descending so we process leading riders first.
                        const sortedByX = [...playerPositions].sort((a, b) => b.px - a.px);
                        const boxes = [];

                        const MIN_X_DIST = 100; // ~100px SVG units minimum separation for labels
                        const Y_OFFSET_STEP = 100; // Shift up by 100 SVG units per conflict

                        for (const p of sortedByX) {
                            let overlapCount = 0;
                            // Check previous boxes to see if we overlap horizontally
                            for (const box of boxes) {
                                if (Math.abs(p.px - box.px) < MIN_X_DIST) {
                                    // There is a horizontal conflict. Stack on top.
                                    // The number of overlapping items found in this column tells us how high to go.
                                    overlapCount = Math.max(overlapCount, box.overlapStack + 1);
                                }
                            }

                            p.yOffset = -(overlapCount * Y_OFFSET_STEP);
                            boxes.push({ px: p.px, overlapStack: overlapCount });
                        }

                        // Render them
                        return playerPositions.map((p, i) => {
                            const isBot = p.isBot;
                            const color = p.team === 'A' ? '#eab308' :
                                p.team === 'B' ? '#3b82f6' :
                                    p.team === 'C' ? '#22c55e' :
                                        p.team === 'D' ? '#a855f7' :
                                            (p.color || '#fff');

                            const playerWkg = p.wkg || (p.watts / (p.weight || 75));

                            return (
                                <g key={p.id} style={{ transition: 'transform 0.5s linear' }} transform={`translate(${p.px}, ${p.py})`}>
                                    {/* Drop line to ground */}
                                    <line x1={0} y1={0} x2={0} y2={H - MARGIN_BOTTOM - p.py} stroke={color} strokeWidth="2" strokeDasharray="3 3" opacity={0.4} />

                                    {/* Line connecting the stacked label down to the actual dot (only shown if shifted) */}
                                    {p.yOffset < 0 && (
                                        <line x1={0} y1={p.yOffset} x2={0} y2={-20} stroke={color} strokeWidth="2" strokeDasharray="5 5" opacity={0.8} />
                                    )}

                                    {/* Base Color dot / highlight */}
                                    <circle cx="0" cy="-10" r={isBot ? 8 : 12} fill={color} stroke="#000" strokeWidth="3" />

                                    {/* The movable label group container */}
                                    <g transform={`translate(0, ${p.yOffset})`}>
                                        {p.isSpurting && (
                                            <text x="-35" y="-15" fontSize="36" style={{ filter: 'drop-shadow(0 0 12px #f97316)' }}>🔥</text>
                                        )}

                                        {/* Bike / Avatar (enlarged) */}
                                        <image href="/phantom-bike.png" x="-40" y="-55" width="80" height="80" opacity={0.95} />

                                        {/* Player Name (Significantly larger) */}
                                        <text y="-65" fill="#fff" fontSize={isBot ? "20" : "26"} fontWeight="bold"
                                            fontFamily="Inter, sans-serif" textAnchor="middle"
                                            paintOrder="stroke" stroke="#000" strokeWidth="7" strokeLinejoin="round">
                                            {p.name}
                                        </text>

                                        {/* W/kg Metrics */}
                                        {!isBot && (
                                            <text y="-88" fill="#e2e2f0" fontSize="16" fontWeight="900"
                                                fontFamily="Inter, sans-serif" textAnchor="middle"
                                                paintOrder="stroke" stroke="#000" strokeWidth="6" strokeLinejoin="round">
                                                {playerWkg.toFixed(1)} W/kg
                                            </text>
                                        )}
                                    </g>
                                </g>
                            );
                        });
                    })()}

                    <defs>
                        <linearGradient id="mtnGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(59,130,246,0.2)" />
                            <stop offset="100%" stopColor="rgba(59,130,246,0.0)" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
        </div>
    );
}
