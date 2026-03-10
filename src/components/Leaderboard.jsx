// ============================================================
// Leaderboard — Live race standings derived from socket data
// ============================================================

const RANK_COLORS = ['#facc15', '#a1a1aa', '#cd7f32'];
const PLAYER_DOT_COLORS = [
    '#3b82f6', '#f97316', '#a855f7', '#22d3ee', '#f43f5e',
    '#84cc16', '#fb923c', '#e879f9',
];

const TEAM_COLORS = {
    'A': '#eab308',  // Yellow (Pro)
    'B': '#3b82f6',  // Blue (Elite)
    'C': '#22c55e',  // Green (Sport)
    'D': '#a855f7'   // Purple (Base)
};

export { PLAYER_DOT_COLORS, TEAM_COLORS };

export default function Leaderboard({ players = [], myId }) {
    // Only top-10 real players
    const realPlayers = players.filter(p => !p.isBot);
    const sorted = [...realPlayers]
        .sort((a, b) => (b.distKm ?? 0) - (a.distKm ?? 0))
        .slice(0, 10);

    const hasTeams = players.some(p => p.team);
    let teamScores = [];
    if (hasTeams) {
        const scores = players.reduce((acc, p) => {
            if (p.team) acc[p.team] = (acc[p.team] || 0) + (p.distKm || 0);
            return acc;
        }, {});
        teamScores = Object.entries(scores)
            .map(([team, dist]) => ({ team, dist }))
            .sort((a, b) => b.dist - a.dist);
    }

    // Vivid rank colours
    const rankColor = (i) => {
        if (i === 0) return '#facc15';
        if (i === 1) return '#e2e8f0';
        if (i === 2) return '#fb923c';
        return '#64748b';
    };
    const rankLabel = (i) => i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;

    return (
        <div style={{
            borderRadius: 16,
            padding: '14px 16px',
            minWidth: 270,
            maxHeight: 540,
            overflowY: 'auto',
            background: 'rgba(4,4,12,0.88)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(18px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}>
            <p style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic',
                fontSize: 15, fontWeight: 900, letterSpacing: 4,
                color: '#ffffff', marginBottom: 10, textTransform: 'uppercase',
                textShadow: '0 0 16px rgba(255,255,255,0.25)',
            }}>
                🏆 LEADERBOARD
            </p>

            {hasTeams && teamScores.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                    {teamScores.map((t, i) => (
                        <div key={t.team} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '4px 6px', marginBottom: 4, borderRadius: 6,
                            background: `${TEAM_COLORS[t.team]}18`,
                            border: `1px solid ${TEAM_COLORS[t.team]}40`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 13, color: rankColor(i), fontWeight: 900, width: 18 }}>{rankLabel(i)}</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: TEAM_COLORS[t.team] }}>Team {t.team}</span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{t.dist.toFixed(1)} km</span>
                        </div>
                    ))}
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginTop: 8, marginBottom: 8 }} />
                </div>
            )}

            {sorted.length === 0 && (
                <p style={{ fontSize: 13, color: '#3f3f5a', fontStyle: 'italic' }}>Waiting for riders…</p>
            )}

            {sorted.map((p, i) => {
                const isMe = p.id === myId;
                const dotColor = p.team ? TEAM_COLORS[p.team] : PLAYER_DOT_COLORS[i % PLAYER_DOT_COLORS.length];
                return (
                    <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px',
                        marginBottom: 3,
                        borderRadius: 9,
                        background: isMe
                            ? `linear-gradient(90deg, rgba(59,130,246,0.25), rgba(59,130,246,0.08))`
                            : i === 0
                                ? 'rgba(250,204,21,0.1)'
                                : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isMe ? 'rgba(59,130,246,0.5)' : i === 0 ? 'rgba(250,204,21,0.3)' : dotColor + '28'}`,
                        borderLeft: `3px solid ${dotColor}`,
                        boxShadow: isMe ? '0 0 12px rgba(59,130,246,0.2)' : 'none',
                    }}>
                        <span style={{
                            width: 24, textAlign: 'center', flexShrink: 0,
                            fontSize: i < 3 ? 16 : 13, fontWeight: 900,
                            color: rankColor(i),
                            textShadow: i === 0 ? '0 0 10px rgba(250,204,21,0.6)' : 'none',
                        }}>{rankLabel(i)}</span>

                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{
                                fontSize: 17, fontWeight: 900, fontStyle: 'italic',
                                color: '#ffffff',
                                whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
                                textShadow: isMe ? '0 0 10px rgba(255,255,255,0.4)' : '0 1px 4px rgba(0,0,0,0.6)',
                                fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5,
                            }}>
                                {isMe ? '⚡ ' : ''}{p.name}
                            </div>
                            {p.team && (
                                <div style={{ fontSize: 11, color: dotColor, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', marginTop: 1, fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic' }}>
                                    TEAM {p.team}
                                </div>
                            )}
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{
                                fontSize: 17, fontWeight: 900, fontStyle: 'italic',
                                fontFamily: "'Barlow Condensed', sans-serif",
                                color: isMe ? '#60a5fa' : dotColor,
                                textShadow: `0 0 8px ${dotColor}60`,
                            }}>
                                {(p.distKm ?? 0).toFixed(2)}
                            </div>
                            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif" }}>km</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
