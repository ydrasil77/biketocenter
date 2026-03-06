// ============================================================
// Leaderboard — Live race standings derived from socket data
// ============================================================

const RANK_COLORS = ['#facc15', '#a1a1aa', '#cd7f32'];
const PLAYER_DOT_COLORS = [
    '#3b82f6', '#f97316', '#a855f7', '#22d3ee', '#f43f5e',
    '#84cc16', '#fb923c', '#e879f9',
];

export { PLAYER_DOT_COLORS };

export default function Leaderboard({ players = [], myId }) {
    const sorted = [...players].sort((a, b) => (b.distKm ?? 0) - (a.distKm ?? 0));

    return (
        <div className="glass" style={{
            borderRadius: 14,
            padding: '12px 14px',
            minWidth: 192,
            maxHeight: 320,
            overflowY: 'auto',
        }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: '#52526a', marginBottom: 10, textTransform: 'uppercase' }}>
                Leaderboard
            </p>
            {sorted.length === 0 && (
                <p style={{ fontSize: 11, color: '#52526a' }}>Waiting for riders…</p>
            )}
            {sorted.map((p, i) => {
                const isMe = p.id === myId;
                const dotColor = PLAYER_DOT_COLORS[i % PLAYER_DOT_COLORS.length];
                return (
                    <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 6px',
                        marginBottom: 2,
                        borderRadius: 6,
                        background: isMe ? 'rgba(59,130,246,0.1)' : 'transparent',
                        border: isMe ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
                    }}>
                        <span style={{
                            width: 20, textAlign: 'center',
                            fontSize: 12, fontWeight: 900,
                            color: RANK_COLORS[i] ?? '#52526a',
                        }}>{i + 1}</span>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: dotColor, flexShrink: 0,
                        }} />
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: isMe ? '#e2e2f0' : '#a1a1b4' }}>
                            {i === 0 && <span style={{ marginRight: 4 }} title="Race Leader">👑</span>}
                            {isMe ? '⚡ ' : ''}{p.name}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: dotColor, whiteSpace: 'nowrap' }}>
                            {(p.distKm ?? 0).toFixed(2)} km
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
