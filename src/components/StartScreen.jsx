// ============================================================
// StartScreen — First screen: choose RIDER or INSTRUCTOR
// ============================================================
import { useState, useEffect } from 'react';
import GlobalLeaderboard from './GlobalLeaderboard';

export default function StartScreen({ onChoose }) {
    const [hovered, setHovered] = useState(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setShow(true), 80);
        return () => clearTimeout(t);
    }, []);



    const cards = [
        {
            id: 'rider',
            icon: <img src="/phantom-bike.png" style={{ height: '70px', objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(34,197,94,0.6))' }} alt="Rider" />,
            label: 'RIDER',
            sub: 'Join or watch an ongoing race. Race against bots and other riders.',
            color: '#22c55e',
            glow: 'rgba(34,197,94,0.4)',
            border: 'rgba(34,197,94,0.5)',
            isPrimary: true
        },
        {
            id: 'instructor',
            icon: '📡',
            label: 'INSTRUCTOR',
            sub: 'Create a class session, monitor all riders, control traffic lights.',
            color: '#3b82f6',
            glow: 'rgba(59,130,246,0.4)',
            border: 'rgba(59,130,246,0.5)',
        }
    ];

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'radial-gradient(ellipse at 40% 20%, #0f0f2e 0%, #040407 70%)',
            display: 'flex', flexDirection: 'column',
            opacity: show ? 1 : 0, transition: 'opacity 0.5s ease',
            overflowY: 'auto',
        }}>
            {/* TOP: Logo + Arcade Leaderboard */}
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: 'clamp(20px,4vh,40px) clamp(16px,4vw,40px) 0',
                flex: '0 0 auto',
            }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <div style={{
                        fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                        fontSize: 'clamp(40px,8vw,90px)', fontWeight: 900, letterSpacing: -2, lineHeight: 1,
                        background: 'linear-gradient(135deg,#fff 30%,#3b82f6 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>DARK VELOCITY</div>
                    <p style={{ fontSize: 'clamp(10px,1.5vw,14px)', letterSpacing: 6, color: '#52526a', textTransform: 'uppercase', marginTop: 8 }}>
                        Multiplayer Indoor Cycle Race
                    </p>
                </div>

                {/* Leaderboard */}
                <div style={{ width: '100%', maxWidth: 900 }}>
                    <GlobalLeaderboard embedded={true} />
                </div>
            </div>

            {/* BOTTOM: Insert coin + Role cards */}
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: 'clamp(16px,3vh,32px) clamp(16px,4vw,40px) clamp(16px,3vh,32px)',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(0,0,0,0.2)',
                flex: '0 0 auto',
            }}>
                {/* INSERT COIN gif */}
                <div style={{ textAlign: 'center', marginBottom: 'clamp(16px,3vh,28px)' }}>
                    <img
                        src="/insert-coin.gif"
                        alt="Insert Coin to Continue"
                        style={{
                            maxHeight: 'clamp(50px,8vh,100px)',
                            maxWidth: '80%',
                            objectFit: 'contain',
                            filter: 'drop-shadow(0 0 32px rgba(34,197,94,0.5))',
                            imageRendering: 'pixelated',
                        }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                </div>

                {/* Role cards */}
                <div style={{ display: 'flex', gap: 'clamp(16px,3vw,32px)', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {cards.map(card => (
                        <button
                            key={card.id}
                            onClick={() => onChoose(card.id)}
                            onMouseEnter={() => setHovered(card.id)}
                            onMouseLeave={() => setHovered(null)}
                            style={{
                                width: 'clamp(160px,28vw,280px)',
                                padding: 'clamp(20px,3vh,40px) clamp(16px,2vw,28px)',
                                borderRadius: 24,
                                background: hovered === card.id
                                    ? `rgba(${card.id === 'rider' ? '34,197,94' : '59,130,246'},0.12)`
                                    : 'rgba(255,255,255,0.03)',
                                border: `2px solid ${hovered === card.id ? card.border : card.isPrimary ? 'rgba(34,197,94,0.3)' : '#1e1e2e'}`,
                                boxShadow: hovered === card.id ? `0 0 40px ${card.glow}, 0 20px 60px rgba(0,0,0,0.5)` : (card.isPrimary ? '0 0 20px rgba(34,197,94,0.1)' : '0 8px 32px rgba(0,0,0,0.4)'),
                                cursor: 'pointer', transition: 'all 0.25s ease',
                                transform: hovered === card.id ? 'translateY(-4px) scale(1.02)' : 'none',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                            }}
                        >
                            <div style={{ fontSize: 'clamp(36px,6vw,60px)', lineHeight: 1 }}>{card.icon}</div>
                            <div style={{
                                fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                                fontSize: 'clamp(22px,3vw,32px)', fontWeight: 900, letterSpacing: 1,
                                color: hovered === card.id ? card.color : '#e2e2f0',
                                transition: 'color 0.25s',
                            }}>{card.label}</div>
                            <p style={{
                                fontSize: 'clamp(11px,1.2vw,13px)', color: '#94a3b8', lineHeight: 1.5,
                                textAlign: 'center', fontFamily: 'Inter, sans-serif', margin: 0,
                            }}>{card.sub}</p>
                            <div style={{
                                marginTop: 8, fontSize: 12, fontWeight: 800, letterSpacing: 3,
                                color: card.color, opacity: hovered === card.id ? 1 : 0.5,
                                transition: 'opacity 0.2s', fontFamily: 'Inter, sans-serif',
                            }}>CONTINUE →</div>
                        </button>
                    ))}
                </div>

                <p style={{ marginTop: 20, fontSize: 10, color: '#2a2a3a', letterSpacing: 2, textTransform: 'uppercase' }}>
                    Powered by OSRM · Leaflet · Socket.io
                </p>
            </div>
        </div>
    );
}
