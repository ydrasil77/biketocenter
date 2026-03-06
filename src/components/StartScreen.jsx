// ============================================================
// StartScreen — First screen: choose RIDER or INSTRUCTOR
// ============================================================
import { useState, useEffect } from 'react';

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
            icon: <img src="/landing-bike2.png" style={{ height: '52px', objectFit: 'contain' }} alt="Rider" />,
            label: 'RIDER',
            sub: 'Join or watch an ongoing race. Race against bots and other riders.',
            color: '#3b82f6',
            glow: 'rgba(59,130,246,0.4)',
            border: 'rgba(59,130,246,0.5)',
        },
        {
            id: 'instructor',
            icon: '📡',
            label: 'INSTRUCTOR',
            sub: 'Create a class session, monitor all riders, control traffic lights.',
            color: '#a855f7',
            glow: 'rgba(168,85,247,0.4)',
            border: 'rgba(168,85,247,0.5)',
        },
    ];

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'radial-gradient(ellipse at 40% 20%, #0f0f2e 0%, #040407 70%)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 48, padding: 24,
            opacity: show ? 1 : 0, transition: 'opacity 0.5s ease',
        }}>
            {/* Logo */}
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                    fontSize: 'clamp(52px,8vw,88px)', fontWeight: 900, letterSpacing: -2, lineHeight: 1,
                    background: 'linear-gradient(135deg,#fff 30%,#3b82f6 100%)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>DARK VELOCITY</div>
                <p style={{ fontSize: 12, letterSpacing: 4, color: '#52526a', textTransform: 'uppercase', marginTop: 8 }}>
                    Multiplayer Indoor Cycle Race
                </p>
            </div>

            {/* Role cards */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                {cards.map(card => (
                    <button
                        key={card.id}
                        onClick={() => onChoose(card.id)}
                        onMouseEnter={() => setHovered(card.id)}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                            width: 240, padding: '36px 24px', borderRadius: 24,
                            background: hovered === card.id
                                ? `rgba(${card.id === 'rider' ? '59,130,246' : '168,85,247'},0.12)`
                                : 'rgba(255,255,255,0.03)',
                            border: `2px solid ${hovered === card.id ? card.border : '#1e1e2e'}`,
                            boxShadow: hovered === card.id ? `0 0 40px ${card.glow}, 0 20px 60px rgba(0,0,0,0.5)` : '0 8px 32px rgba(0,0,0,0.4)',
                            cursor: 'pointer', transition: 'all 0.25s ease',
                            transform: hovered === card.id ? 'translateY(-6px) scale(1.02)' : 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                        }}
                    >
                        <div style={{ fontSize: 52, lineHeight: 1 }}>{card.icon}</div>
                        <div style={{
                            fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                            fontSize: 28, fontWeight: 900, letterSpacing: 1,
                            color: hovered === card.id ? card.color : '#e2e2f0',
                            transition: 'color 0.25s',
                        }}>{card.label}</div>
                        <p style={{
                            fontSize: 12, color: '#52526a', lineHeight: 1.6,
                            textAlign: 'center', fontFamily: 'Inter, sans-serif',
                        }}>{card.sub}</p>
                        <div style={{
                            marginTop: 8, fontSize: 11, fontWeight: 700, letterSpacing: 2,
                            color: card.color, opacity: hovered === card.id ? 1 : 0,
                            transition: 'opacity 0.2s',
                            fontFamily: 'Inter, sans-serif',
                        }}>CONTINUE →</div>
                    </button>
                ))}
            </div>

            <p style={{ fontSize: 10, color: '#2a2a3a', letterSpacing: 2, textTransform: 'uppercase' }}>
                Powered by OSRM · Leaflet · Socket.io
            </p>
        </div>
    );
}
