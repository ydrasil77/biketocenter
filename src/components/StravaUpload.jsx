// ============================================================
// StravaUpload — Post-race Strava OAuth + GPX upload
// ============================================================
import { useState } from 'react';
import { buildGPX, downloadGPX } from '../utils/gpx';

const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID ?? '';
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:3001`;

export default function StravaUpload({ track = [], riderName = 'Rider', onClose }) {
    const [uploadState, setUploadState] = useState('idle'); // idle | uploading | done | error
    const [uploadMsg, setUploadMsg] = useState('');
    const [activityUrl, setActivityUrl] = useState('');

    const hasToken = !!localStorage.getItem('strava_token');

    function handleStravaAuth() {
        const redirect = encodeURIComponent(`${SERVER_URL}/auth/strava/callback`);
        const scope = 'activity:write,read';
        const state = btoa(JSON.stringify({ returnTo: window.location.href }));
        window.location.href =
            `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${redirect}&scope=${scope}&state=${state}`;
    }

    async function handleUpload() {
        if (track.length === 0) {
            setUploadMsg('No track data recorded yet.');
            return;
        }

        const token = localStorage.getItem('strava_token');
        if (!token) { handleStravaAuth(); return; }

        setUploadState('uploading');
        setUploadMsg('Building GPX…');

        const gpxStr = buildGPX(track, `Dark Velocity — ${riderName}`);
        const blob = new Blob([gpxStr], { type: 'application/gpx+xml' });

        const form = new FormData();
        form.append('file', blob, 'ride.gpx');
        form.append('data_type', 'gpx');
        form.append('activity_type', 'virtualride');
        form.append('name', `Dark Velocity — ${riderName}`);
        form.append('description', 'Virtual cycle race powered by Dark Velocity');

        try {
            setUploadMsg('Uploading to Strava…');
            const res = await fetch('https://www.strava.com/api/v3/uploads', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            });
            const data = await res.json();
            if (res.ok) {
                setUploadState('done');
                setUploadMsg('✓ Upload successful! Processing…');
                // Strava upload is async — poll for activity ID
                pollUpload(data.id, token);
            } else {
                throw new Error(data.message ?? 'Upload failed');
            }
        } catch (err) {
            setUploadState('error');
            setUploadMsg(err.message);
        }
    }

    async function pollUpload(uploadId, token) {
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const res = await fetch(`https://www.strava.com/api/v3/uploads/${uploadId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.activity_id) {
                setActivityUrl(`https://www.strava.com/activities/${data.activity_id}`);
                setUploadMsg('✓ Activity ready on Strava!');
                return;
            }
            if (data.error) { setUploadState('error'); setUploadMsg(data.error); return; }
        }
    }

    function handleDownloadGPX() {
        if (track.length === 0) return;
        downloadGPX(buildGPX(track, `Dark Velocity — ${riderName}`));
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div className="glass" style={{
                borderRadius: 20, padding: 36, maxWidth: 400, width: '100%',
                display: 'flex', flexDirection: 'column', gap: 20,
            }}>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 32, marginBottom: 8 }}>🏁</p>
                    <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic', fontSize: 28, fontWeight: 900 }}>
                        RACE COMPLETE
                    </h2>
                    <p style={{ fontSize: 13, color: '#52526a', marginTop: 4 }}>
                        {track.length} GPS points recorded
                    </p>
                </div>

                {uploadMsg && (
                    <p style={{
                        fontSize: 12, textAlign: 'center',
                        color: uploadState === 'error' ? '#ef4444' : uploadState === 'done' ? '#22c55e' : '#e2e2f0',
                        background: uploadState === 'error' ? 'rgba(239,68,68,0.08)' : uploadState === 'done' ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${uploadState === 'error' ? 'rgba(239,68,68,0.2)' : uploadState === 'done' ? 'rgba(34,197,94,0.2)' : '#1e1e2e'}`,
                        borderRadius: 8, padding: '8px 12px',
                    }}>{uploadMsg}</p>
                )}

                {activityUrl && (
                    <a href={activityUrl} target="_blank" rel="noreferrer" style={{
                        display: 'block', textAlign: 'center', fontSize: 13,
                        color: '#fc4c02', textDecoration: 'underline',
                    }}>View on Strava →</a>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {STRAVA_CLIENT_ID ? (
                        <button onClick={handleUpload} disabled={uploadState === 'uploading'} style={{
                            background: 'linear-gradient(135deg, #c0392b, #fc4c02)',
                            border: 'none', borderRadius: 12, padding: '13px 20px',
                            color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: 1,
                            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                            opacity: uploadState === 'uploading' ? 0.7 : 1,
                        }}>
                            {hasToken ? '📤 UPLOAD TO STRAVA' : '🔑 CONNECT STRAVA & UPLOAD'}
                        </button>
                    ) : (
                        <p style={{ fontSize: 11, color: '#52526a', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10 }}>
                            Strava upload: add <code>VITE_STRAVA_CLIENT_ID</code> to your .env file
                        </p>
                    )}

                    <button onClick={handleDownloadGPX} style={{
                        background: 'rgba(255,255,255,0.06)', border: '1px solid #1e1e2e',
                        borderRadius: 12, padding: '11px 20px',
                        color: '#e2e2f0', fontWeight: 700, fontSize: 13,
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    }}>⬇ DOWNLOAD GPX</button>

                    <button onClick={onClose} style={{
                        background: 'transparent', border: '1px solid #1e1e2e',
                        borderRadius: 12, padding: '10px 20px',
                        color: '#52526a', fontWeight: 600, fontSize: 12,
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    }}>Return to Lobby</button>
                </div>
            </div>
        </div>
    );
}
