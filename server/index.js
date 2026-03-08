// ============================================================
// server/index.js — Dark Velocity backend
// Express + Socket.io: rooms, bots, police, traffic, Strava OAuth
// ============================================================
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import {
    ROOMS, getRoom, clearRoom, scheduleLight, startCountdown,
    addBots, broadcastPlayerList,
} from './roomManager.js';

dotenv.config({ path: '../.env' });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});
app.use(cors());
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ─────────────────────────────────────────────────
// STRAVA OAUTH
// ─────────────────────────────────────────────────
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID ?? '';
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET ?? '';
const STRAVA_REDIRECT_URI = process.env.STRAVA_REDIRECT_URI ?? 'http://localhost:3001/auth/strava/callback';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

app.get('/auth/strava', (_, res) => {
    res.redirect(`https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT_URI)}&scope=activity:write,read`);
});

app.get('/auth/strava/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error || !code) return res.redirect(`${FRONTEND_URL}?strava_error=access_denied`);
    try {
        const r = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: STRAVA_CLIENT_ID, client_secret: STRAVA_CLIENT_SECRET, code, grant_type: 'authorization_code' }),
        });
        const data = await r.json();
        if (!data.access_token) throw new Error(data.message ?? 'Token exchange failed');
        res.redirect(`${FRONTEND_URL}?strava_token=${data.access_token}`);
    } catch (err) {
        console.error('[Strava]', err.message);
        res.redirect(`${FRONTEND_URL}?strava_error=${encodeURIComponent(err.message)}`);
    }
});

// ─────────────────────────────────────────────────
// GLOBAL ARCADE LEADERBOARD
// ─────────────────────────────────────────────────
const ARCADE_LEADERBOARD = new Map(); // Tracking best efforts of real players by name

function updateArcadeLeaderboard(player) {
    if (!player || player.role === 'instructor' || player.isBot) return;

    // Use name as the unique key for the arcade feel (like entering initials)
    const name = player.name && player.name.trim() !== '' ? player.name.trim().toUpperCase() : 'UNKNOWN RIDER';
    const wkg = player.watts && player.weight ? player.watts / player.weight : 0;

    if (!ARCADE_LEADERBOARD.has(name)) {
        ARCADE_LEADERBOARD.set(name, {
            name,
            maxSpeed: player.speed || 0,
            maxWkg: wkg,
            totalDistKm: player.distKm || 0,
            lastSeen: Date.now()
        });
    } else {
        const entry = ARCADE_LEADERBOARD.get(name);
        entry.maxSpeed = Math.max(entry.maxSpeed, player.speed || 0);
        entry.maxWkg = Math.max(entry.maxWkg, wkg);

        // If distKm wrapped around (new race), we'd want to handle that, but for simplicity
        // in an arcade DB just storing the longest single ride distance achieved under that name
        entry.totalDistKm = Math.max(entry.totalDistKm, player.distKm || 0);
        entry.lastSeen = Date.now();
    }
}

// ─────────────────────────────────────────────────
// SOCKET.IO — MULTIPLAYER
// ─────────────────────────────────────────────────
const CITY_CENTERS = {
    copenhagen: [55.6926, 12.5992],
    london: [51.5007, -0.1246],
    singapore: [1.2815, 103.8636],
    paris: [48.8584, 2.2945],
    tokyo: [35.6586, 139.7454],
};

// Police checkpoint positions — evenly spaced along route
function genCheckpoints(center, radiusKm, count = 3) {
    const pts = [];
    for (let i = 0; i < count; i++) {
        const fraction = 0.25 + (i / count) * 0.55;
        const angle = Math.PI / 4 + (i * Math.PI * 2) / count;
        const r = radiusKm * (1 - fraction);
        const latDeg = r / 111.32;
        const lngDeg = r / (111.32 * Math.cos((center[0] * Math.PI) / 180));
        pts.push({
            id: `police_${i}`,
            position: [center[0] + latDeg * Math.cos(angle), center[1] + lngDeg * Math.sin(angle)],
            radius: 0.08, // 80m
        });
    }
    return pts;
}

io.on('connection', (socket) => {
    console.log(`[+] ${socket.id}`);
    let currentRoom = null;

    // ── LIST_ROOMS: rider lobby discovery ──────────────────────
    socket.on('list_rooms', () => {
        const list = [];
        for (const [code, room] of ROOMS.entries()) {
            // Include all rooms (even 0-rider, instructor-only rooms)
            const players = room.players instanceof Map ? room.players : new Map();
            const bots = room.bots instanceof Map ? room.bots : new Map();
            list.push({
                code,
                city: room.city ?? 'copenhagen',
                riderCount: players.size,
                botCount: bots.size,
                raceStarted: room.raceStarted ?? false,
                radiusKm: room.radiusKm ?? 2,
                playMode: room.playMode ?? 'solo',
                mountainId: room.mountainId ?? null,
            });
        }
        socket.emit('room_list', list);
    });

    // ── GET_ARCADE_LEADERBOARD ─────────────────────────────────
    socket.on('get_arcade_leaderboard', () => {
        const sorted = Array.from(ARCADE_LEADERBOARD.values())
            .sort((a, b) => b.totalDistKm - a.totalDistKm) // Sort by most distance travelled
            .slice(0, 15); // Top 15
        socket.emit('arcade_leaderboard', sorted);
    });

    // ── JOIN_ROOM: now includes radiusKm and botCount ──────────
    socket.on('JOIN_ROOM', ({ roomCode, name, city, role, ftp, radiusKm = 2, botCount = 0, playMode = 'solo', team = null, mountainId = null }) => {
        if (currentRoom) socket.leave(currentRoom);
        currentRoom = roomCode;
        socket.join(roomCode);

        const room = getRoom(roomCode);

        // Store city + radius + mode in room for bot loop reference
        if (!room.city || room.players.size === 0) {
            room.city = city ?? 'copenhagen';
            room.radiusKm = radiusKm;
            room.playMode = playMode;
            room.mountainId = mountainId;
        }

        const center = CITY_CENTERS[room.city] ?? CITY_CENTERS.copenhagen;

        // Assign start position: ring around city at radiusKm
        const playerIndex = room.players.size;
        const totalSlots = Math.max(room.players.size + 1, 1);
        const angle = (2 * Math.PI * playerIndex) / totalSlots;
        const latDeg = room.radiusKm / 111.32;
        const lngDeg = room.radiusKm / (111.32 * Math.cos((center[0] * Math.PI) / 180));
        const startPos = [center[0] + latDeg * Math.cos(angle), center[1] + lngDeg * Math.sin(angle)];

        room.players.set(socket.id, {
            id: socket.id, name: name ?? 'Rider', city, role, ftp,
            position: startPos, distKm: 0, speed: 0, hr: 0, watts: 0, zone: 'Z0',
            team: room.playMode === 'team' ? team : null,
        });

        scheduleLight(roomCode, io);
        socket.emit('START_POSITION', { position: startPos });
        socket.emit('LIGHT_CHANGE', { state: room.trafficState });

        // Generate police checkpoints (only once per room)
        if (room.policeCheckpoints.length === 0) {
            room.policeCheckpoints = genCheckpoints(center, room.radiusKm, 3);
            io.to(roomCode).emit('POLICE_CHECKPOINTS', room.policeCheckpoints);
        } else {
            socket.emit('POLICE_CHECKPOINTS', room.policeCheckpoints);
        }

        // Add bots on first join (instructor or first rider sets the count)
        if (botCount > 0 && room.bots.size === 0) {
            addBots(roomCode, botCount, io);
        }

        broadcastPlayerList(roomCode, io);
        console.log(`[Room ${roomCode}] ${name} joined, ${room.players.size} real + ${room.bots.size} bots`);
    });

    // ── Real player sends position update ───────────────────────
    socket.on('PLAYER_UPDATE', (data) => {
        if (!currentRoom) return;
        const room = getRoom(currentRoom);
        const player = room.players.get(socket.id);
        if (!player) return;

        Object.assign(player, data);

        // Check real player against police checkpoints
        const now = Date.now();
        if (player.position) {
            room.policeCheckpoints.forEach(cp => {
                const d = haversineSimple(player.position, cp.position);
                const alreadyStopped = (room.policeStops?.get(socket.id) ?? 0) > now;
                if (d < cp.radius && !alreadyStopped) {
                    if (!room.policeStops) room.policeStops = new Map();
                    room.policeStops.set(socket.id, now + 30000);
                    io.to(currentRoom).emit('POLICE_STOP', { playerId: socket.id, duration: 30 });
                    console.log(`[Police] Stopped ${player.name} for 30s`);
                }
            });
        }

        updateArcadeLeaderboard(player);
        broadcastPlayerList(currentRoom, io);
    });

    // ── Instructor triggers 10s countdown ───────────────────────
    socket.on('INSTRUCTOR_START', ({ roomCode }) => {
        console.log(`[Start] Room ${roomCode}`);
        startCountdown(roomCode, io);
    });

    // ── Instructor can add bots mid-session ─────────────────────
    socket.on('ADD_BOTS', ({ roomCode, count }) => {
        addBots(roomCode, Math.min(count, 15), io);
        broadcastPlayerList(roomCode, io);
    });

    // ── Disconnect ───────────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log(`[-] ${socket.id}`);
        if (!currentRoom) return;
        const room = getRoom(currentRoom);
        room.players.delete(socket.id);
        if (room.players.size === 0 && room.bots.size === 0) {
            clearRoom(currentRoom);
        } else {
            broadcastPlayerList(currentRoom, io);
        }
    });
});

function haversineSimple([lat1, lon1], [lat2, lon2]) {
    const R = 6371, d = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * d / 2) ** 2 +
        Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin((lon2 - lon1) * d / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => {
    console.log(`🚀 Dark Velocity server on http://localhost:${PORT}`);
});
