// ============================================================
// Lobby — Setup screen with role, BT, bots, race distance
// ============================================================
import { useState, useEffect } from 'react';
import { CITIES } from '../utils/cities';
import { MOUNTAINS } from '../utils/mountains';

// BT Connection Modal: full-screen overlay while scanning / connecting
function BtModal({ status, statusMsg, onDismiss }) {
    if (status !== 'connecting' && status !== 'connected' && status !== 'error') return null;
    const isConnecting = status === 'connecting';
    const isConnected = status === 'connected';
    const isError = status === 'error';

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(4,4,7,0.92)',
            backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: '#0d0d14',
                border: `1px solid ${isConnected ? 'rgba(34,197,94,0.4)' : isError ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.3)'}`,
                borderRadius: 24, padding: '40px 48px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
                boxShadow: `0 0 60px ${isConnected ? 'rgba(34,197,94,0.12)' : isError ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)'}`,
                maxWidth: 360, textAlign: 'center',
            }}>
                {/* Icon */}
                <div style={{ fontSize: 56, lineHeight: 1 }}>
                    {isConnecting ? '📡' : isConnected ? '✅' : '❌'}
                </div>

                {/* Spinner (only while connecting) */}
                {isConnecting && (
                    <div style={{
                        width: 48, height: 48,
                        border: '4px solid rgba(59,130,246,0.2)',
                        borderTop: '4px solid #3b82f6',
                        borderRadius: '50%',
                        animation: 'btSpin 0.8s linear infinite',
                    }} />
                )}

                <div>
                    <div style={{
                        fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                        fontSize: 24, fontWeight: 900,
                        color: isConnected ? '#22c55e' : isError ? '#ef4444' : '#fff',
                        marginBottom: 8,
                    }}>
                        {isConnecting ? 'CONNECTING…' : isConnected ? 'CONNECTED!' : 'CONNECTION FAILED'}
                    </div>
                    <div style={{
                        fontSize: 13, color: '#94a3b8',
                        fontFamily: 'Inter, sans-serif', lineHeight: 1.5,
                    }}>{statusMsg}</div>
                </div>

                {/* Dismiss button (not shown while connecting) */}
                {!isConnecting && (
                    <button onClick={onDismiss} style={{
                        background: isConnected ? 'linear-gradient(135deg,#15803d,#22c55e)' : 'rgba(255,255,255,0.06)',
                        border: 'none', borderRadius: 12,
                        padding: '12px 32px', color: '#fff',
                        fontWeight: 700, fontSize: 14, letterSpacing: 1, cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif',
                    }}>
                        {isConnected ? <>LETS GO <img src="/landing-bike.png" style={{ height: '1.2em', verticalAlign: 'middle', marginLeft: '6px' }} alt="bike" /></> : 'TRY AGAIN'}
                    </button>
                )}
            </div>

            {/* Keyframe animation */}
            <style>{`@keyframes btSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

const TEAMS = [
    { id: 'A', name: 'Team A (Pro)', minWkg: 4.0, maxWkg: 9.9, color: '#eab308' },  // Yellow
    { id: 'B', name: 'Team B (Elite)', minWkg: 3.2, maxWkg: 3.99, color: '#3b82f6' }, // Blue
    { id: 'C', name: 'Team C (Sport)', minWkg: 2.5, maxWkg: 3.19, color: '#22c55e' }, // Green
    { id: 'D', name: 'Team D (Base)', minWkg: 0, maxWkg: 2.49, color: '#a855f7' }   // Purple
];

const RACE_DISTANCES = [
    { label: '2 km  (~5–10 min)', km: 2 },
    { label: '5 km  (~10–20 min)', km: 5 },
    { label: '10 km (~20–40 min)', km: 10 },
    { label: '20 km (~40–80 min)', km: 20 },
    { label: '40 km (~1–2 h)', km: 40 },
    { label: '60 km (~2 h)', km: 60 },
];

export default function Lobby({ onStart, onBack, bluetooth, initialRole, presetConfig }) {
    const [role, setRole] = useState(presetConfig?.role ?? initialRole ?? 'rider');
    const [name, setName] = useState(presetConfig?.name ?? 'Rider 1');
    const [weight, setWeight] = useState(presetConfig?.weight ?? 75);
    const [gender, setGender] = useState(presetConfig?.gender ?? 'male');
    const [city, setCity] = useState(presetConfig?.city ?? 'copenhagen');
    const [ftp, setFtp] = useState(presetConfig?.ftp ?? 250);
    const [roomCode, setRoomCode] = useState(presetConfig?.roomCode ?? '');
    const [botCount, setBotCount] = useState(presetConfig?.botCount ?? 3);
    const [distKm, setDistKm] = useState(presetConfig?.radiusKm ?? 2);
    const [playMode, setPlayMode] = useState(presetConfig?.playMode ?? 'solo'); // 'solo', 'team', 'mountain'
    const [team, setTeam] = useState(presetConfig?.team ?? null); // 'A', 'B', 'C', 'D'
    const [mountainId, setMountainId] = useState(presetConfig?.mountainId ?? 'alpe_dhuez');

    const isJoiningLive = !!presetConfig?.roomCode;

    const { bikeConnected, hrConnected, status, statusMsg, savedDevice, connectBike, quickReconnect, clearSavedDevice } = bluetooth;
    const btConnected = bikeConnected || hrConnected;
    const [showBtModal, setShowBtModal] = useState(false);

    // Show modal whenever BT state changes away from idle
    useEffect(() => {
        if (status === 'connecting') setShowBtModal(true);
        if (status === 'connected') setShowBtModal(true);
        if (status === 'error') setShowBtModal(true);
    }, [status]);

    function handleConnect() {
        setShowBtModal(true);
        connectBike();
    }

    // Estimated time helper
    function etaLabel(km) {
        const t = Math.round((km / 8) * 60); // ~24 km/h avg
        return t >= 60 ? `~${Math.floor(t / 60)}h ${t % 60}min` : `~${t} min`;
    }

    function handleStart() {
        const generatedRoom = role === 'instructor'
            ? `${city.toUpperCase().slice(0, 3)}_${Math.floor(1000 + Math.random() * 9000)}`
            : (roomCode.trim() || `${city.toUpperCase().slice(0, 3)}_${Math.floor(1000 + Math.random() * 9000)}`);

        const activeRadius = playMode === 'mountain' ? MOUNTAINS[mountainId].totalDistKm : distKm;
        onStart({
            role, name, weight: Number(weight), gender, city, ftp: Number(ftp), roomCode: generatedRoom,
            botCount: Number(botCount), radiusKm: activeRadius, playMode,
            team: playMode === 'team' ? team : null, mountainId: playMode === 'mountain' ? mountainId : null
        });
    }

    // Helper for Watt/kg
    const wkg = ftp > 0 && weight > 0 ? (ftp / weight).toFixed(2) : 0;

    useEffect(() => {
        if (playMode === 'team' && role === 'rider') {
            const recommended = TEAMS.find(t => wkg >= t.minWkg && wkg <= t.maxWkg) || TEAMS[3];
            if (team !== recommended.id) {
                setTeam(recommended.id);
            }
        }
    }, [wkg, playMode, role]);

    const inputStyle = {
        background: '#040407', border: '1px solid #1e1e2e', borderRadius: 10,
        color: '#e2e2f0', padding: '11px 14px', fontFamily: 'Inter, sans-serif',
        fontSize: 14, width: '100%', outline: 'none',
    };
    const labelStyle = {
        fontSize: 11, fontWeight: 700, letterSpacing: '1.5px',
        textTransform: 'uppercase', color: '#52526a', marginBottom: 4, display: 'block',
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(ellipse at 50% 30%, #0c0c20 0%, #040407 80%)',
            padding: 16, overflowY: 'auto',
        }}>
            <div style={{
                width: '100%', maxWidth: 500,
                background: '#0d0d14', border: '1px solid #1e1e2e',
                borderRadius: 20, padding: 36,
                display: 'flex', flexDirection: 'column', gap: 20,
                boxShadow: '0 0 80px rgba(59,130,246,0.06), 0 32px 64px rgba(0,0,0,0.6)',
            }}>
                {/* Back button */}
                {onBack && (
                    <button onClick={onBack} style={{
                        position: 'absolute', top: 20, left: 20,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid #1e1e2e',
                        borderRadius: 10, padding: '8px 14px',
                        color: '#52526a', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>← BACK</button>
                )}
                {/* Logo */}
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontStyle: 'italic', fontSize: 48, fontWeight: 900, letterSpacing: -1,
                        background: 'linear-gradient(135deg, #fff 30%, #3b82f6 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        lineHeight: 1, marginBottom: 6,
                    }}>DARK VELOCITY</h1>
                    <p style={{ fontSize: 11, letterSpacing: 3, color: '#52526a', textTransform: 'uppercase' }}>
                        Multiplayer Cycle Race
                    </p>
                </div>

                {/* Role */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {['rider', 'instructor'].map(r => (
                        <button key={r} onClick={() => setRole(r)} disabled={isJoiningLive} style={{
                            padding: 12, borderRadius: 10,
                            border: `1px solid ${role === r ? '#3b82f6' : '#1e1e2e'}`,
                            background: role === r ? 'rgba(59,130,246,0.12)' : 'transparent',
                            color: role === r ? '#3b82f6' : '#52526a',
                            fontWeight: 700, fontSize: 13, cursor: isJoiningLive ? 'not-allowed' : 'pointer',
                            opacity: isJoiningLive && role !== r ? 0.4 : 1,
                            fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 1,
                        }}>{r === 'rider' ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><img src="/landing-bike.png" style={{ height: '1.2em' }} alt="bike" /> Rider</span> : '📡 Instructor'}</button>
                    ))}
                </div>

                {/* Fields — city and distance always shown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Common Fields: Play Mode */}
                    <div>
                        <label style={labelStyle}>Play Mode</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {['solo', 'team', 'mountain'].map(m => (
                                <button key={m} onClick={() => setPlayMode(m)} disabled={isJoiningLive} style={{
                                    flex: 1, padding: '10px 0', borderRadius: 8,
                                    border: `1px solid ${playMode === m ? '#3b82f6' : '#1e1e2e'}`,
                                    background: playMode === m ? 'rgba(59,130,246,0.15)' : 'transparent',
                                    color: playMode === m ? '#3b82f6' : '#52526a',
                                    fontWeight: 700, fontSize: 12, cursor: isJoiningLive ? 'not-allowed' : 'pointer',
                                    opacity: isJoiningLive && playMode !== m ? 0.4 : 1,
                                    fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
                                }}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Rider-only fields */}
                    {role === 'rider' && (<>
                        <div>
                            <label style={labelStyle}>Rider Name</label>
                            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your callsign…" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>Weight (kg)</label>
                                <input style={inputStyle} type="number" value={weight} onChange={e => setWeight(e.target.value)} />
                            </div>
                            <div>
                                <label style={labelStyle}>Gender</label>
                                <select style={{ ...inputStyle, cursor: 'pointer' }} value={gender} onChange={e => setGender(e.target.value)}>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>FTP (W)</label>
                                <input style={inputStyle} type="number" value={ftp} onChange={e => setFtp(e.target.value)} />
                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, fontFamily: 'Inter,sans-serif' }}>
                                    Current: <strong style={{ color: '#fff' }}>{wkg} W/kg</strong>
                                </div>
                            </div>
                        </div>

                        {/* Auto-Assigned Team Display */}
                        {playMode === 'team' && (
                            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #1e1e2e', borderRadius: 12, padding: 16 }}>
                                <label style={labelStyle}>Assigned Team (Based on Watt/kg)</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                    {TEAMS.map(t => {
                                        const isSelected = team === t.id;
                                        return (
                                            <div key={t.id} style={{
                                                padding: '10px 8px', borderRadius: 10,
                                                border: `1px solid ${isSelected ? t.color : '#1e1e2e'}`,
                                                background: isSelected ? `${t.color}20` : 'rgba(0,0,0,0.2)',
                                                color: isSelected ? '#fff' : '#94a3b8',
                                                fontFamily: 'Inter,sans-serif', textAlign: 'left',
                                                opacity: isSelected ? 1 : 0.4,
                                                display: 'flex', flexDirection: 'column', gap: 2,
                                                position: 'relative', overflow: 'hidden'
                                            }}>
                                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: t.color }} />
                                                <div style={{ paddingLeft: 6, fontSize: 13, fontWeight: 700, color: t.color }}>{t.name}</div>
                                                <div style={{ paddingLeft: 6, fontSize: 10, color: '#52526a' }}>
                                                    {t.id === 'A' ? '> 4.0' : t.id === 'B' ? '3.2 - 3.9' : t.id === 'C' ? '2.5 - 3.1' : '< 2.5'} W/kg
                                                </div>
                                                {isSelected && (
                                                    <div style={{ position: 'absolute', top: 6, right: 6, background: '#22c55e', color: '#000', fontSize: 8, padding: '2px 4px', borderRadius: 4, fontWeight: 800 }}>
                                                        ACTIVE
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>)}

                    {playMode === 'mountain' ? (
                        <div>
                            <label style={labelStyle}>Select Mountain</label>
                            <select disabled={isJoiningLive} style={{ ...inputStyle, cursor: isJoiningLive ? 'not-allowed' : 'pointer', opacity: isJoiningLive ? 0.6 : 1 }} value={mountainId} onChange={e => setMountainId(e.target.value)}>
                                {Object.values(MOUNTAINS).map(m => (
                                    <option key={m.id} value={m.id}>{m.country.toUpperCase() === 'FRANCE' ? '🇫🇷' : '🇮🇹'} {m.name} — {m.totalDistKm} km</option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div>
                            <label style={labelStyle}>Race City</label>
                            <select disabled={isJoiningLive} style={{ ...inputStyle, cursor: isJoiningLive ? 'not-allowed' : 'pointer', opacity: isJoiningLive ? 0.6 : 1 }} value={city} onChange={e => setCity(e.target.value)}>
                                <option value="copenhagen">🇩🇰 Copenhagen — The Little Mermaid</option>
                                <option value="london">🇬🇧 London — Big Ben</option>
                                <option value="singapore">🇸🇬 Singapore — Marina Bay Sands</option>
                                <option value="paris">🇫🇷 Paris — Eiffel Tower</option>
                                <option value="tokyo">🇯🇵 Tokyo — Tokyo Tower</option>
                            </select>
                        </div>
                    )}

                    {/* Race distance — both roles. Hidden if mountain mode */}
                    {playMode !== 'mountain' && (
                        <div>
                            <label style={labelStyle}>{role === 'instructor' ? 'Class Duration / Distance' : 'Race Distance / Class Duration'}</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                {RACE_DISTANCES.map(d => (
                                    <button key={d.km} disabled={isJoiningLive} onClick={() => setDistKm(d.km)} style={{
                                        padding: '8px 4px', borderRadius: 8,
                                        border: `1px solid ${distKm === d.km ? '#a855f7' : '#1e1e2e'}`,
                                        background: distKm === d.km ? 'rgba(168,85,247,0.15)' : 'transparent',
                                        color: distKm === d.km ? '#a855f7' : '#52526a',
                                        fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700,
                                        cursor: isJoiningLive ? 'not-allowed' : 'pointer', textAlign: 'center', lineHeight: 1.4,
                                        opacity: isJoiningLive && distKm !== d.km ? 0.3 : 1
                                    }}>
                                        {d.km} km<br />
                                        <span style={{ fontWeight: 400, opacity: 0.7 }}>{etaLabel(d.km)}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Rider-only: FTP, bots, room code */}
                    {role === 'rider' && (<>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>🤖 AI Bots (0–15)</label>
                                <input style={inputStyle} type="number" min={0} max={15} value={botCount} onChange={e => setBotCount(Math.min(15, Math.max(0, Number(e.target.value))))} />
                                <p style={{ fontSize: 10, color: '#52526a', marginTop: 3 }}>Bots race with live speeds + HR. In Team mode, bots are assigned to teams.</p>
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Room Code (leave blank to create new)</label>
                            <input style={{ ...inputStyle, textTransform: 'uppercase' }}
                                value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())}
                                placeholder="e.g. CPH_8821" />
                        </div>
                    </>)}
                </div>


                {/* ── Bluetooth section — riders only ── */}
                {role === 'rider' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                        {/* Web BT not supported warning */}
                        {typeof navigator !== 'undefined' && !navigator.bluetooth && (
                            <div style={{
                                background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
                                borderRadius: 10, padding: '8px 14px',
                                fontSize: 11, color: '#eab308', fontFamily: 'Inter,sans-serif', lineHeight: 1.5,
                            }}>
                                ⚠️ Web Bluetooth requires Chrome or Edge on desktop / Android — not supported in this browser.
                            </div>
                        )}

                        {/* Connected panel */}
                        {btConnected ? (
                            <div style={{
                                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
                                borderRadius: 12, padding: '12px 16px',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: 12,
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', fontFamily: 'Inter,sans-serif' }}>
                                        📡 BODY BIKE CONNECTED
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, fontSize: 11, fontFamily: 'Inter,sans-serif' }}>
                                        <span style={{ color: bikeConnected ? '#22c55e' : '#52526a' }}>
                                            {bikeConnected ? '✅ Power + Cadence' : '⚪ Power'}
                                        </span>
                                        <span style={{ color: hrConnected ? '#ef4444' : '#52526a' }}>
                                            {hrConnected ? '❤️ Heart Rate' : '⚪ HR'}
                                        </span>
                                    </div>
                                </div>
                                <button onClick={handleConnect} style={{
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid #1e1e2e',
                                    borderRadius: 8, padding: '6px 12px', color: '#52526a',
                                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                                }}>Reconnect</button>
                            </div>
                        ) : (
                            <>
                                {/* Quick Reconnect shortcut */}
                                {savedDevice && (
                                    <button onClick={() => { setShowBtModal(true); quickReconnect(); }} style={{
                                        background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                                        borderRadius: 10, padding: '10px 14px', color: '#22c55e', fontWeight: 700,
                                        fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}>
                                        <span>⚡ Quick Reconnect: {savedDevice.name}</span>
                                        <span onClick={e => { e.stopPropagation(); clearSavedDevice(); }}
                                            style={{ fontSize: 10, color: '#52526a', textDecoration: 'underline', cursor: 'pointer' }}>forget</span>
                                    </button>
                                )}
                                {/* Main connect button */}
                                <button onClick={handleConnect} style={{
                                    background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                                    border: 'none', borderRadius: 12, padding: '13px 20px',
                                    color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: 1,
                                    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                                    boxShadow: '0 4px 20px rgba(59,130,246,0.35)',
                                }}>
                                    📡 CONNECT BODY BIKE SMART+
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* JOIN RACE / OPEN INSTRUCTOR VIEW */}
                <button onClick={handleStart} style={{
                    background: 'linear-gradient(135deg, #15803d, #22c55e)',
                    border: 'none', borderRadius: 12, padding: '13px 20px',
                    color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: 1,
                    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    boxShadow: '0 4px 20px rgba(34,197,94,0.35)',
                }}>
                    {role === 'instructor' ? '📺 OPEN INSTRUCTOR VIEW' : '🚀 JOIN RACE'}
                </button>
                {role === 'rider' && (
                    <p style={{ fontSize: 11, color: '#52526a', textAlign: 'center' }}>
                        No bike? Enable Simulator in the race.
                    </p>
                )}
            </div>

            {/* BT Connection Modal — shown while connecting / after connect / on error */}
            {showBtModal && (
                <BtModal
                    status={status}
                    statusMsg={statusMsg}
                    onDismiss={() => setShowBtModal(false)}
                />
            )}
        </div>
    );
}
