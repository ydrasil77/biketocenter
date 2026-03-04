// ============================================================
// Dashboard — Bottom metrics bar
// Adds: W/kg metric, ETA estimator, red-light banner
// ============================================================

function Metric({ label, value, unit, color, small = false }) {
    const colorMap = {
        blue: '#3b82f6', red: '#ef4444', orange: '#f97316',
        green: '#22c55e', purple: '#a855f7', white: '#e2e2f0',
    };
    return (
        <div style={{ textAlign: 'center', padding: '0 10px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#52526a', marginBottom: 2 }}>
                {label}
            </p>
            <p style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: small ? 22 : 28,
                fontStyle: 'italic',
                fontWeight: 900,
                lineHeight: 1,
                color: colorMap[color] ?? '#e2e2f0',
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'center',
                gap: 2,
            }}>
                {value}
                {unit && <span style={{ fontSize: 11, fontWeight: 400, fontStyle: 'normal', color: '#52526a' }}>{unit}</span>}
            </p>
        </div>
    );
}

export default function Dashboard({
    speed = 0,
    watts = 0,
    hr = 0,
    cadence = 0,
    elapsedSec = 0,
    ftp = 250,
    weightKg = 75,
    zone = null,
    totalDistKm = 0,
    distLeftKm = 0,
    riderName = 'Rider',
    cityName = '',
    trafficState = 'GREEN',
    isSimulating,
    isPaused,
    onToggleSim,
    onTogglePause,
    onLeave,
}) {
    const ftpPct = ftp > 0 && watts > 0 ? Math.round((watts / ftp) * 100) : 0;
    const ftpColor = ftpPct >= 115 ? 'purple' : ftpPct >= 100 ? 'red' : ftpPct >= 87 ? 'orange' : ftpPct >= 75 ? 'blue' : 'white';

    // W/kg — the key metric for class planning
    const wkg = watts > 0 && weightKg > 0 ? (watts / weightKg).toFixed(2) : '--';
    const wkgNum = parseFloat(wkg);

    // Estimated time to finish (minutes) based on current speed
    let etaMin = '--';
    if (speed > 0.5 && distLeftKm > 0) {
        etaMin = Math.ceil((distLeftKm / speed) * 60);
    }

    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const ss = String(elapsedSec % 60).padStart(2, '0');
    const isRed = trafficState === 'RED';

    return (
        <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
            background: 'rgba(4,4,7,0.94)',
            backdropFilter: 'blur(20px)',
            borderTop: `1px solid ${isRed ? 'rgba(239,68,68,0.4)' : '#1e1e2e'}`,
            transition: 'border-color 0.3s',
        }}>
            {/* Zone bar */}
            {zone && (
                <div style={{ height: 5, background: 'rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
                    <div className="zone-bar-fill" style={{
                        height: '100%',
                        width: isRed ? '0%' : `${Math.min(zone.pctFtp * 100, 100).toFixed(1)}%`,
                        background: zone.color,
                    }} />
                    <span style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.45)',
                    }}>{isRed ? '🔴 RED LIGHT — STOPPED' : zone.name}</span>
                </div>
            )}

            {/* Red light banner */}
            {isRed && (
                <div style={{
                    background: 'rgba(239,68,68,0.12)',
                    borderBottom: '1px solid rgba(239,68,68,0.2)',
                    padding: '4px 0',
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 2,
                    color: '#ef4444',
                    animation: 'pulse 1s infinite',
                }}>
                    🚦 RED LIGHT — SPEED LOCKED AT ZERO
                </div>
            )}

            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Rider info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 130, flexShrink: 0 }}>
                    <span style={{ fontSize: 24, filter: isRed ? 'grayscale(1) opacity(0.5)' : 'drop-shadow(0 0 8px rgba(59,130,246,0.6))', transition: 'filter 0.3s' }}>🚴</span>
                    <div>
                        <p style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 90, textOverflow: 'ellipsis' }}>{riderName}</p>
                        <p style={{ fontSize: 10, color: '#52526a' }}>{cityName}</p>
                    </div>
                </div>

                {/* Metrics grid — 8 columns now */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(8, 1fr)',
                    flex: 1,
                    borderLeft: '1px solid #1e1e2e',
                    borderRight: '1px solid #1e1e2e',
                    paddingLeft: 12,
                }}>
                    <Metric label="Speed" value={isRed ? '0.0' : speed.toFixed(1)} unit="km/h" color={isRed ? 'red' : 'white'} />
                    <Metric label="Power" value={Math.round(watts)} unit="W" color="blue" />
                    <Metric label="W/kg" value={wkg} unit="w/kg" color={!isNaN(wkgNum) && wkgNum >= 4 ? 'red' : !isNaN(wkgNum) && wkgNum >= 3 ? 'orange' : 'green'} />
                    <Metric label="% FTP" value={watts > 0 ? ftpPct : '--'} unit={watts > 0 ? '%' : ''} color={ftpColor} />
                    <Metric label="HR" value={hr > 0 ? Math.round(hr) : '--'} unit={hr > 0 ? 'bpm' : ''} color="red" />
                    <Metric label="Cadence" value={cadence > 0 ? Math.round(cadence) : '--'} unit={cadence > 0 ? 'rpm' : ''} color="orange" />
                    <Metric label="Elapsed" value={`${mm}:${ss}`} color="white" small />
                    <Metric label="ETA" value={etaMin !== '--' ? etaMin : '--'} unit={etaMin !== '--' ? 'min' : ''} color="purple" small />
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                    <button onClick={onToggleSim} style={{
                        background: isSimulating ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isSimulating ? '#22c55e' : '#1e1e2e'}`,
                        color: isSimulating ? '#22c55e' : '#e2e2f0',
                        borderRadius: 8, padding: '5px 10px',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>🔄 SIM {isSimulating ? 'ON' : 'OFF'}</button>
                    <button onClick={onTogglePause} style={{
                        background: isPaused ? 'rgba(250,204,21,0.12)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isPaused ? '#facc15' : '#1e1e2e'}`,
                        color: isPaused ? '#facc15' : '#e2e2f0',
                        borderRadius: 8, padding: '5px 10px',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>{isPaused ? '▶ RESUME' : '⏸ PAUSE'}</button>
                    <button onClick={onLeave} style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        color: '#ef4444',
                        borderRadius: 8, padding: '5px 10px',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>✕ LEAVE</button>
                </div>
            </div>
        </div>
    );
}
