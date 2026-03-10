// ============================================================
// RaceList — Rider lobby: see ongoing / waiting races, join one
// Works with and without a server (shows local-only mode if offline)
// ============================================================
import { useState, useEffect } from 'react';
import { CITIES } from '../utils/cities';
import { MOUNTAINS } from '../utils/mountains';

const CITY_FLAGS = {
    copenhagen: '🇩🇰', london: '🇬🇧', singapore: '🇸🇬', paris: '🇫🇷', tokyo: '🇯🇵',
};

export default function RaceList({ socket, bluetooth, onJoin, onBack }) {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [manualCode, setManualCode] = useState('');

    // Ask server for room list when socket connects
    useEffect(() => {
        const raw = socket?.rawSocket;
        let poll;

        if (!raw || !socket.connected) {
            // Still connecting
            return;
        }

        function requestList() {
            raw.emit('list_rooms');
        }

        // We are connected, fetch immediately
        requestList();

        raw.on('room_list', (data) => {
            setRooms(data ?? []);
            setLoading(false);
        });

        // Poll every 3s
        poll = setInterval(requestList, 3000);

        return () => {
            clearInterval(poll);
            raw.off('room_list');
        };
    }, [socket?.rawSocket, socket?.connected]);

    // Fallback: stop loading after 4s even if no server connection happens
    useEffect(() => {
        const fallback = setTimeout(() => setLoading(false), 4000);
        return () => clearTimeout(fallback);
    }, []);

    function joinRoom(room) {
        onJoin({
            role: 'rider',
            roomCode: room.code,
            city: room.city,
            radiusKm: room.radiusKm ?? 2,
            name: 'Rider',
            weight: 75, gender: 'male', ftp: 250, botCount: 0,
            playMode: room.playMode ?? 'solo',
            mountainId: room.mountainId ?? null,
            raceStarted: room.raceStarted ?? false,
        });
    }

    function joinManual() {
        const code = manualCode.trim().toUpperCase();
        if (!code) return;

        // If this room is already in our list, use its full data (correct playMode/mountainId)
        const knownRoom = rooms.find(r => r.code === code);
        if (knownRoom) {
            joinRoom(knownRoom);
            return;
        }

        // Fallback for rooms not yet loaded — join as solo with inferred city
        const prefix = code.split('_')[0].toLowerCase();
        const cityMap = { cph: 'copenhagen', lon: 'london', sgp: 'singapore', par: 'paris', tky: 'tokyo' };
        const city = cityMap[prefix] ?? 'copenhagen';
        onJoin({ role: 'rider', roomCode: code, city, radiusKm: 2, name: 'Rider', weight: 75, gender: 'male', ftp: 250, botCount: 0, playMode: 'solo' });
    }

    const inputStyle = {
        background: '#040407', border: '1px solid #1e1e2e', borderRadius: 10,
        color: '#e2e2f0', padding: '11px 14px', fontFamily: 'Inter,sans-serif',
        fontSize: 14, flex: 1, outline: 'none',
    };

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'radial-gradient(ellipse at 40% 20%, #0f0f2e 0%, #040407 70%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '24px 16px', overflowY: 'auto',
        }}>
            {/* Header */}
            <div style={{ width: '100%', maxWidth: 640, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32, marginTop: 12 }}>
                <button onClick={onBack} style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid #1e1e2e',
                    borderRadius: 10, padding: '8px 14px', color: '#52526a',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>← BACK</button>
                <div>
                    <h1 style={{
                        fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic',
                        fontSize: 32, fontWeight: 900,
                        background: 'linear-gradient(135deg,#fff 30%,#3b82f6 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>ONGOING RACES</h1>
                    <p style={{ fontSize: 11, color: '#52526a', letterSpacing: 2 }}>SELECT A RACE TO JOIN</p>
                </div>
            </div>

            <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#52526a', fontSize: 13, letterSpacing: 2 }}>
                        SCANNING FOR RACES…
                    </div>
                )}

                {/* Room list */}
                {!loading && rooms.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#52526a', fontSize: 13 }}>
                        No active races found. Enter a room code below or go back to create one.
                    </div>
                )}

                {rooms.map(room => {
                    const city = CITIES[room.city];
                    const isLive = room.raceStarted;
                    const isMountain = room.playMode === 'mountain';
                    const mountain = isMountain ? MOUNTAINS[room.mountainId] : null;
                    return (
                        <div key={room.code} style={{
                            background: '#0d0d14', border: `1px solid ${isLive ? 'rgba(34,197,94,0.3)' : isMountain ? 'rgba(132,204,22,0.25)' : '#1e1e2e'}`,
                            borderRadius: 16, padding: '18px 22px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 16,
                            boxShadow: isLive ? '0 0 20px rgba(34,197,94,0.08)' : isMountain ? '0 0 16px rgba(132,204,22,0.05)' : 'none',
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 20 }}>
                                        {isMountain ? '⛰️' : (CITY_FLAGS[room.city] ?? '🗺️')}
                                    </span>
                                    <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: 'italic', fontSize: 22, fontWeight: 900, color: '#e2e2f0' }}>
                                        {isMountain
                                            ? (mountain?.name ?? 'Mountain Race')
                                            : `${city?.name ?? room.city} → ${city?.target ?? '?'}`
                                        }
                                    </span>
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, letterSpacing: 1.5, padding: '2px 8px', borderRadius: 6,
                                        background: isLive ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.12)',
                                        color: isLive ? '#22c55e' : '#3b82f6',
                                        border: `1px solid ${isLive ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)'}`,
                                    }}>{isLive ? '● LIVE' : '⏳ WAITING'}</span>
                                    {isMountain && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 8px', borderRadius: 6,
                                            background: 'rgba(132,204,22,0.12)', color: '#84cc16',
                                            border: '1px solid rgba(132,204,22,0.3)',
                                        }}>⛰️ MOUNTAIN</span>
                                    )}
                                </div>
                                <div style={{ fontSize: 12, color: '#52526a', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><img src="/landing-bike.png" style={{ height: '1.2em' }} alt="bike" /> {room.riderCount ?? 0} riders</span>
                                    <span>🤖 {room.botCount ?? 0} bots</span>
                                    {isMountain
                                        ? <span>📏 {mountain?.totalDistKm ?? room.radiusKm ?? '?'} km climb{mountain ? ` · ${mountain.country}` : ''}</span>
                                        : <span>📏 {room.radiusKm ?? 2} km</span>
                                    }
                                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#2a2a3a' }}>#{room.code}</span>
                                </div>
                            </div>
                            <button onClick={() => joinRoom(room)} style={{
                                background: isLive
                                    ? 'linear-gradient(135deg,#15803d,#22c55e)'
                                    : isMountain
                                        ? 'linear-gradient(135deg,#365314,#84cc16)'
                                        : 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
                                border: 'none', borderRadius: 10, padding: '10px 20px',
                                color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: 1,
                                cursor: 'pointer', whiteSpace: 'nowrap',
                                boxShadow: isLive ? '0 4px 16px rgba(34,197,94,0.35)' : isMountain ? '0 4px 16px rgba(132,204,22,0.3)' : '0 4px 16px rgba(59,130,246,0.35)',
                            }}>{isLive ? '🚀 JOIN LIVE' : isMountain ? '⛰️ JOIN CLIMB' : '🎯 JOIN'}</button>
                        </div>
                    );
                })}

                {/* Manual code entry */}
                <div style={{
                    background: '#0d0d14', border: '1px solid #1e1e2e',
                    borderRadius: 16, padding: '18px 22px', marginTop: 8,
                }}>
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#52526a', marginBottom: 10 }}>
                        ENTER ROOM CODE MANUALLY
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <input
                            value={manualCode}
                            onChange={e => setManualCode(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === 'Enter' && joinManual()}
                            placeholder="e.g. CPH_8821"
                            style={{ ...inputStyle, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 2 }}
                        />
                        <button onClick={joinManual} style={{
                            background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
                            border: 'none', borderRadius: 10, padding: '11px 20px',
                            color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(59,130,246,0.35)',
                        }}>JOIN →</button>
                    </div>
                </div>

                {/* Create new race shortcut */}
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <button onClick={onBack} style={{
                        background: 'transparent', border: 'none',
                        color: '#52526a', fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
                    }}>+ Create a new race instead</button>
                </div>
            </div>
        </div>
    );
}
