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
            <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', opacity: 0.15, pointerEvents: 'none' }}>
                <h1 style={{ fontSize: 280, fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic', margin: 0, whiteSpace: 'nowrap', color: '#f8fafc', textShadow: '0 0 40px rgba(59,130,246,0.3)' }}>
                    {mt.name.toUpperCase()}
                </h1>
            </div>

            <div style={{ position: 'relative', width: '90%', maxWidth: 1400, aspectRatio: '2/1' }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>

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
                    {sortedPlayers.map((p, i) => {
                        // Clamp distance
                        const safeKm = Math.max(0, Math.min(p.distKm, mt.totalDistKm));

                        // Interpolate elevation for smooth avatar placement
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

                        const px = getX(safeKm);
                        const py = getY(exactElev);

                        // If team mode, use team color, else use their avatar color fallback
                        const isBot = p.isBot;
                        const color = p.team === 'A' ? '#eab308' :
                            p.team === 'B' ? '#3b82f6' :
                                p.team === 'C' ? '#22c55e' :
                                    p.team === 'D' ? '#a855f7' :
                                        (p.color || '#fff');

                        const playerWkg = p.wkg || (p.watts / (p.weight || 75));
                        const isSpurting = playerWkg > 4.5;

                        return (
                            <g key={p.id} style={{ transition: 'transform 0.5s linear' }} transform={`translate(${px}, ${py})`}>
                                {/* Drop line to ground */}
                                <line x1={0} y1={0} x2={0} y2={H - MARGIN_BOTTOM - py} stroke={color} strokeWidth="2" strokeDasharray="3 3" opacity={0.4} />

                                {isSpurting && (
                                    <text x="-25" y="-10" fontSize="26" style={{ filter: 'drop-shadow(0 0 8px #f97316)' }}>🔥</text>
                                )}

                                {/* Bike / Avatar */}
                                <image href="/landing-bike2.png" x="-25" y="-35" width="50" height="50" opacity={0.9} />

                                {/* Base Color dot / highlight */}
                                <circle cx="0" cy="-10" r={isBot ? 5 : 8} fill={color} stroke="#000" strokeWidth="2" />

                                <text y="-40" fill="#fff" fontSize={isBot ? "13" : "16"} fontWeight="bold"
                                    fontFamily="Inter, sans-serif" textAnchor="middle"
                                    paintOrder="stroke" stroke="#000" strokeWidth="6" strokeLinejoin="round">
                                    {p.name}
                                </text>
                                {!isBot && (
                                    <text y="-58" fill="#cbd5e1" fontSize="11" fontWeight="900"
                                        fontFamily="Inter, sans-serif" textAnchor="middle"
                                        paintOrder="stroke" stroke="#000" strokeWidth="5" strokeLinejoin="round">
                                        {playerWkg.toFixed(1)} W/kg
                                    </text>
                                )}
                            </g>
                        );
                    })}

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
