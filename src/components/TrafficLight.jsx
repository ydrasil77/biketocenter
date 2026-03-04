// ============================================================
// TrafficLight — Server-synchronized traffic light component
// ============================================================
export default function TrafficLight({ state = 'GREEN' }) {
    const isRed = state === 'RED';
    const isYellow = state === 'YELLOW';
    const isGreen = state === 'GREEN';

    const label = isRed ? 'STOP' : isYellow ? 'READY' : 'GO';
    const labelColor = isRed ? '#ef4444' : isYellow ? '#facc15' : '#22c55e';

    return (
        <div className="flex flex-col items-center gap-1">
            <div style={{
                background: '#0d0d14',
                border: '2px solid #1e1e2e',
                borderRadius: 12,
                padding: '10px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.6)',
            }}>
                {/* Red */}
                <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: isRed ? '#ff4d4d' : '#1a1a24',
                    border: '1px solid #2a2a38',
                    boxShadow: isRed ? '0 0 14px #ff4d4d, 0 0 28px rgba(255,77,77,0.5)' : 'none',
                    transition: 'all 0.25s',
                }} />
                {/* Yellow */}
                <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: isYellow ? '#facc15' : '#1a1a24',
                    border: '1px solid #2a2a38',
                    boxShadow: isYellow ? '0 0 14px #facc15, 0 0 28px rgba(250,204,21,0.5)' : 'none',
                    transition: 'all 0.25s',
                }} />
                {/* Green */}
                <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: isGreen ? '#22c55e' : '#1a1a24',
                    border: '1px solid #2a2a38',
                    boxShadow: isGreen ? '0 0 14px #22c55e, 0 0 28px rgba(34,197,94,0.5)' : 'none',
                    transition: 'all 0.25s',
                }} />
            </div>
            <span style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 2,
                color: labelColor,
                transition: 'color 0.25s',
            }}>{label}</span>
        </div>
    );
}
