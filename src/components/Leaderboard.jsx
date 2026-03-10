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
    // Only show real players on the leaderboard — no bots
    const realPlayers = players.filter(p => !p.isBot);
    const sorted = [...realPlayers].sort((a, b) => (b.distKm ?? 0) - (a.distKm ?? 0));

    const hasTeams = players.some(p => p.team);
    let teamScores = [];
    if (hasTeams) {
        const scores = players.reduce((acc, p) => {
            if (p.team) {
                acc[p.team] = (acc[p.team] || 0) + (p.distKm || 0);
            }
            return acc;
        }, {});
        teamScores = Object.entries(scores)
            .map(([team, dist]) => ({ team, dist }))
            .sort((a, b) => b.dist - a.dist);
    }

    return (
        <div className="glass" style={{
            borderRadius: 16,
            padding: '16px 20px',
            minWidth: 260,
            maxHeight: 500,
            overflowY: 'auto',
        }}>
            <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: '#52526a', marginBottom: 12, textTransform: 'uppercase' }}>
                Leaderboard
            </p>
            {hasTeams && teamScores.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: '#a1a1aa', marginBottom: 8, textTransform: 'uppercase' }}>
                        Team Standings
                    </p>
                    {teamScores.map((t, i) => (
                        <div key={t.team} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 14, color: RANK_COLORS[i] ?? '#52526a', fontWeight: 900, width: 16 }}>{i + 1}</span>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: TEAM_COLORS[t.team] }} />
                                <span style={{ fontSize: 14, fontWeight: 700, color: TEAM_COLORS[t.team] }}>Team {t.team}</span>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e2f0' }}>{t.dist.toFixed(2)} km</span>
                        </div>
                    ))}
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginTop: 8 }} />
                </div>
            )}
            {sorted.length === 0 && (
                <p style={{ fontSize: 14, color: '#52526a' }}>Waiting for riders…</p>
            )}
            {sorted.map((p, i) => {
                const isMe = p.id === myId;
                const dotColor = p.team ? TEAM_COLORS[p.team] : PLAYER_DOT_COLORS[i % PLAYER_DOT_COLORS.length];
                return (
                    <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px',
                        marginBottom: 4,
                        borderRadius: 8,
                        background: isMe ? 'rgba(59,130,246,0.1)' : 'transparent',
                        border: isMe ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
                    }}>
                        <span style={{
                            width: 24, textAlign: 'center',
                            fontSize: 16, fontWeight: 900,
                            color: RANK_COLORS[i] ?? '#52526a',
                        }}>{i + 1}</span>
                        <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: dotColor, flexShrink: 0,
                            boxShadow: p.team ? `0 0 8px ${dotColor}` : 'none'
                        }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: isMe ? '#e2e2f0' : '#a1a1b4', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                {i === 0 && <span style={{ marginRight: 4 }} title="Race Leader">👑</span>}
                                {isMe ? '⚡ ' : ''}{p.name}
                            </span>
                            {p.team && (
                                <span style={{ fontSize: 11, color: dotColor, fontWeight: 800, textTransform: 'uppercase', marginTop: -2 }}>
                                    Team {p.team}
                                </span>
                            )}
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: dotColor, whiteSpace: 'nowrap' }}>
                            {(p.distKm ?? 0).toFixed(2)} km
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
