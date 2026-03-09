import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:3001`;

export default function GlobalLeaderboard({ onBack, embedded = false }) {
    const [scores, setScores] = useState([]);

    useEffect(() => {
        const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

        socket.on('connect', () => {
            socket.emit('get_arcade_leaderboard');
        });

        socket.on('arcade_leaderboard', (data) => {
            setScores(data);
        });

        const iv = setInterval(() => {
            if (socket.connected) socket.emit('get_arcade_leaderboard');
        }, 5000);

        return () => {
            clearInterval(iv);
            socket.disconnect();
        };
    }, []);

    const containerProps = embedded ? {
        style: {
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            width: '100%', height: '100%',
        }
    } : {
        style: {
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'radial-gradient(circle at center, #1a0b2e 0%, #040407 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px',
            overflowY: 'auto'
        }
    };

    return (
        <div {...containerProps}>
            {!embedded && (
                <button onClick={onBack} style={{
                    position: 'fixed', top: 20, left: 20, zIndex: 10000,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid #1e1e2e',
                    borderRadius: 10, padding: '10px 16px',
                    color: '#52526a', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>← BACK</button>
            )}

            <h1 style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic',
                fontSize: embedded ? 'clamp(32px, 4vw, 48px)' : 64, fontWeight: 900, letterSpacing: 2,
                color: '#facc15', textShadow: '0 0 40px rgba(250,204,21,0.5)',
                marginBottom: embedded ? 20 : 40, marginTop: embedded ? 0 : 20, textAlign: 'center'
            }}>ARCADE HIGH SCORES</h1>

            <div style={{ width: '100%', maxWidth: 800 }}>
                {/* Header */}
                <div style={{
                    display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 100px',
                    padding: '0 20px 12px', borderBottom: '2px solid rgba(250,204,21,0.3)',
                    color: '#a1a1aa', fontSize: 12, fontWeight: 800, letterSpacing: 2, fontFamily: 'Inter, sans-serif'
                }}>
                    <div>RANK</div>
                    <div>RIDER</div>
                    <div style={{ textAlign: 'right' }}>DISTANCE</div>
                    <div style={{ textAlign: 'right' }}>MAX W/KG</div>
                    <div style={{ textAlign: 'right' }}>MAX SPEED</div>
                </div>

                {/* Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {scores.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#52526a', padding: 40, fontSize: 16, fontStyle: 'italic' }}>
                            INSERT COIN TO RIDE
                        </div>
                    ) : scores.map((s, i) => (
                        <div key={s.name} style={{
                            display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 100px',
                            background: i === 0 ? 'linear-gradient(90deg, rgba(234,179,8,0.15), rgba(255,255,255,0.02))' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${i === 0 ? 'rgba(234,179,8,0.5)' : '#1e1e2e'}`,
                            borderRadius: 12, padding: '16px 20px', alignItems: 'center',
                            boxShadow: i === 0 ? '0 0 20px rgba(234,179,8,0.2)' : 'none',
                        }}>
                            <div style={{
                                fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic',
                                fontSize: i < 3 ? 28 : 20, fontWeight: 900,
                                color: i === 0 ? '#facc15' : i === 1 ? '#e2e8f0' : i === 2 ? '#b45309' : '#52526a'
                            }}>
                                {i + 1}
                            </div>
                            <div style={{
                                fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: 1,
                                color: i === 0 ? '#facc15' : '#fff'
                            }}>
                                {s.name}
                            </div>
                            <div style={{ textAlign: 'right', color: '#22c55e', fontWeight: 700, fontFamily: 'Inter, sans-serif', fontSize: 16 }}>
                                {s.totalDistKm.toFixed(2)} <span style={{ fontSize: 10, color: '#52526a' }}>km</span>
                            </div>
                            <div style={{ textAlign: 'right', color: '#a855f7', fontWeight: 700, fontFamily: 'Inter, sans-serif', fontSize: 16 }}>
                                {s.maxWkg.toFixed(2)} <span style={{ fontSize: 10, color: '#52526a' }}>W/kg</span>
                            </div>
                            <div style={{ textAlign: 'right', color: '#3b82f6', fontWeight: 700, fontFamily: 'Inter, sans-serif', fontSize: 16 }}>
                                {Math.round(s.maxSpeed)} <span style={{ fontSize: 10, color: '#52526a' }}>km/h</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
