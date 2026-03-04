// ============================================================
// Lobby — Setup screen with role, BT, bots, race distance
// ============================================================
import { useState } from 'react';
import { CITIES } from '../utils/cities';

const RACE_DISTANCES = [
    { label: '2 km  (~5–10 min)', km: 2 },
    { label: '5 km  (~10–20 min)', km: 5 },
    { label: '10 km (~20–40 min)', km: 10 },
    { label: '20 km (~40–80 min)', km: 20 },
    { label: '40 km (~1–2 h)', km: 40 },
    { label: '60 km (~2 h)', km: 60 },
];

export default function Lobby({ onStart, onBack, bluetooth, initialRole }) {
    const [role, setRole] = useState(initialRole ?? 'rider');
    const [name, setName] = useState('Rider 1');
    const [weight, setWeight] = useState(75);
    const [gender, setGender] = useState('male');
    const [city, setCity] = useState('copenhagen');
    const [ftp, setFtp] = useState(250);
    const [roomCode, setRoomCode] = useState('');
    const [botCount, setBotCount] = useState(3);
    const [distKm, setDistKm] = useState(2);

    const { bikeConnected, hrConnected, status, statusMsg, savedDevice, connectBike, quickReconnect, clearSavedDevice } = bluetooth;
    const btConnected = bikeConnected || hrConnected;

    // Estimated time helper
    function etaLabel(km) {
        const t = Math.round((km / 8) * 60); // ~24 km/h avg
        return t >= 60 ? `~${Math.floor(t / 60)}h ${t % 60}min` : `~${t} min`;
    }

    function handleStart() {
        const generatedRoom = role === 'instructor'
            ? `${city.toUpperCase().slice(0, 3)}_${Math.floor(1000 + Math.random() * 9000)}`
            : (roomCode.trim() || `${city.toUpperCase().slice(0, 3)}_${Math.floor(1000 + Math.random() * 9000)}`);

        onStart({ role, name, weight: Number(weight), gender, city, ftp: Number(ftp), roomCode: generatedRoom, botCount: Number(botCount), radiusKm: distKm });
    }

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
                        <button key={r} onClick={() => setRole(r)} style={{
                            padding: 12, borderRadius: 10,
                            border: `1px solid ${role === r ? '#3b82f6' : '#1e1e2e'}`,
                            background: role === r ? 'rgba(59,130,246,0.12)' : 'transparent',
                            color: role === r ? '#3b82f6' : '#52526a',
                            fontWeight: 700, fontSize: 13, cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 1,
                        }}>{r === 'rider' ? '🚴 Rider' : '📡 Instructor'}</button>
                    ))}
                </div>

                {/* Fields — city and distance always shown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                    </>)}

                    <div>
                        <label style={labelStyle}>Race City</label>
                        <select style={{ ...inputStyle, cursor: 'pointer' }} value={city} onChange={e => setCity(e.target.value)}>
                            <option value="copenhagen">🇩🇰 Copenhagen — The Little Mermaid</option>
                            <option value="london">🇬🇧 London — Big Ben</option>
                            <option value="singapore">🇸🇬 Singapore — Marina Bay Sands</option>
                            <option value="paris">🇫🇷 Paris — Eiffel Tower</option>
                            <option value="tokyo">🇯🇵 Tokyo — Tokyo Tower</option>
                        </select>
                    </div>

                    {/* Race distance — both roles */}
                    <div>
                        <label style={labelStyle}>{role === 'instructor' ? 'Class Duration / Distance' : 'Race Distance / Class Duration'}</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                            {RACE_DISTANCES.map(d => (
                                <button key={d.km} onClick={() => setDistKm(d.km)} style={{
                                    padding: '8px 4px', borderRadius: 8,
                                    border: `1px solid ${distKm === d.km ? '#a855f7' : '#1e1e2e'}`,
                                    background: distKm === d.km ? 'rgba(168,85,247,0.15)' : 'transparent',
                                    color: distKm === d.km ? '#a855f7' : '#52526a',
                                    fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700,
                                    cursor: 'pointer', textAlign: 'center', lineHeight: 1.4,
                                }}>
                                    {d.km} km<br />
                                    <span style={{ fontWeight: 400, opacity: 0.7 }}>{etaLabel(d.km)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Rider-only: FTP, bots, room code */}
                    {role === 'rider' && (<>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>FTP (W)</label>
                                <input style={inputStyle} type="number" value={ftp} onChange={e => setFtp(e.target.value)} />
                            </div>
                            <div>
                                <label style={labelStyle}>🤖 AI Bots (0–15)</label>
                                <input style={inputStyle} type="number" min={0} max={15} value={botCount} onChange={e => setBotCount(Math.min(15, Math.max(0, Number(e.target.value))))} />
                                <p style={{ fontSize: 10, color: '#52526a', marginTop: 3 }}>Bots race with live speeds + HR</p>
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


                {/* Bluetooth + Start */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {savedDevice && !btConnected && (
                        <button onClick={quickReconnect} style={{
                            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                            borderRadius: 10, padding: '10px 14px', color: '#22c55e', fontWeight: 700,
                            fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <span>⚡ Quick Reconnect: {savedDevice.name}</span>
                            <span onClick={e => { e.stopPropagation(); clearSavedDevice(); }}
                                style={{ fontSize: 11, color: '#52526a', textDecoration: 'underline', cursor: 'pointer' }}>forget</span>
                        </button>
                    )}

                    <button onClick={() => connectBike()} disabled={status === 'connecting'} style={{
                        background: btConnected ? 'rgba(34,197,94,0.12)' : 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                        border: `1px solid ${btConnected ? '#22c55e' : 'transparent'}`,
                        borderRadius: 12, padding: '13px 20px', color: '#fff', fontWeight: 700,
                        fontSize: 14, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                        boxShadow: btConnected ? 'none' : '0 4px 20px rgba(59,130,246,0.35)',
                        opacity: status === 'connecting' ? 0.7 : 1,
                    }}>
                        {btConnected ? `✅ ${statusMsg}` : status === 'connecting' ? `🔄 ${statusMsg}` : '📡 CONNECT BODY BIKE SMART+'}
                    </button>

                    <button onClick={handleStart} style={{
                        background: 'linear-gradient(135deg, #15803d, #22c55e)',
                        border: 'none', borderRadius: 12, padding: '13px 20px',
                        color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: 1,
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                        boxShadow: '0 4px 20px rgba(34,197,94,0.35)',
                    }}>
                        {role === 'instructor' ? '📺 OPEN INSTRUCTOR VIEW' : '🚀 JOIN RACE'}
                    </button>
                    <p style={{ fontSize: 11, color: '#52526a', textAlign: 'center' }}>
                        No bike? Enable Simulator in the race.
                    </p>
                </div>
            </div>
        </div>
    );
}
