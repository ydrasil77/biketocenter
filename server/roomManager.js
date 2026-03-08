// ============================================================
// server/roomManager.js
// Bots fetch their own OSRM route and follow it step by step.
// Each bot starts immediately (no race-start gate).
// ============================================================
import fetch from 'node-fetch';
import { getMountainGrade } from '../src/utils/mountains.js';

const ROOMS = new Map();
export { ROOMS };

const CITY_CENTERS = {
    copenhagen: [55.6926, 12.5992],
    london: [51.5007, -0.1246],
    singapore: [1.2815, 103.8636],
    paris: [48.8584, 2.2945],
    tokyo: [35.6586, 139.7454],
};

const BOT_NAMES = ['VeloBot', 'ThorKraft', 'Valeria_R', 'NordicS', 'Chen_W', 'SkyRider', 'JoséL', 'FenixPro', 'Luna_V', 'IronPedal', 'SwiftK', 'RocketR', 'DuskRider', 'GaleForce', 'NightWing'];
const BOT_PROFILES = [
    { wkg: 2.2, weight: 82 }, { wkg: 2.8, weight: 75 }, { wkg: 3.2, weight: 70 },
    { wkg: 3.5, weight: 68 }, { wkg: 3.8, weight: 72 }, { wkg: 4.2, weight: 65 },
    { wkg: 4.8, weight: 60 }, { wkg: 2.5, weight: 78 }, { wkg: 3.0, weight: 73 },
    { wkg: 3.6, weight: 67 },
];

// ── Haversine ─────────────────────────────────────────────────
function haversine([lat1, lon1], [lat2, lon2]) {
    const R = 6371, d = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * d / 2) ** 2 + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin((lon2 - lon1) * d / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Fetch cycling route from OSRM ─────────────────────────────
async function fetchOsrmRoute(start, end) {
    const [slat, slng] = start, [elat, elng] = end;
    const url = `https://router.project-osrm.org/route/v1/cycling/${slng},${slat};${elng},${elat}?overview=full&geometries=geojson`;
    try {
        const res = await fetch(url, { timeout: 6000 });
        const data = await res.json();
        if (data.routes?.[0]) return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    } catch (e) { /* fall through */ }
    // Straight-line fallback
    return Array.from({ length: 60 }, (_, i) => [slat + (elat - slat) * i / 59, slng + (elng - slng) * i / 59]);
}

// ── Speed from W/kg ───────────────────────────────────────────
function wkgToSpeed(wkg, weight, stopped, grade = 0) {
    if (stopped) return 0;
    const P = wkg * weight;
    const m = weight + 9;
    const CdA = 0.405, rho = 1.225, Crr = 0.004, g = 9.81;

    const Fgravity = m * g * Math.sin(Math.atan(grade));
    if (P <= 0 && Fgravity >= 0) return 0;

    let v = 8;
    for (let i = 0; i < 40; i++) {
        const Fdrag = 0.5 * CdA * rho * v * v;
        const Froll = Crr * m * g;
        const Ftotal = Fdrag + Froll + Fgravity;
        const Pv = Ftotal * v;
        const dPdv = 1.5 * CdA * rho * v * v + Froll + Fgravity;

        if (Math.abs(dPdv) < 0.01) break;
        v -= (Pv - P) / dPdv;
        if (v < 0) { v = 0; break; }
    }
    return v * 3.6;
}

// ── Get / create room ─────────────────────────────────────────
function getRoom(roomCode) {
    if (!ROOMS.has(roomCode)) {
        ROOMS.set(roomCode, {
            players: new Map(),
            bots: new Map(),
            trafficState: 'GREEN',
            lightTimer: null,
            raceStarted: false,
            botInterval: null,
            city: 'copenhagen',
            radiusKm: 2,
            policeCheckpoints: [],
            policeStops: new Map(),
            routeWaypoints: null, // fetched async
        });
        scheduleLight(roomCode);
    }
    return ROOMS.get(roomCode);
}

function clearRoom(roomCode) {
    const room = ROOMS.get(roomCode);
    if (room) { clearTimeout(room.lightTimer); clearInterval(room.botInterval); ROOMS.delete(roomCode); }
}

// ── Add bots + fetch their route ──────────────────────────────
async function addBots(roomCode, count, io) {
    const room = ROOMS.get(roomCode);
    if (!room) return;
    const center = CITY_CENTERS[room.city] ?? CITY_CENTERS.copenhagen;
    const R = room.radiusKm;

    // Fetch shared route for bots (once per room)
    if (!room.routeWaypoints) {
        // Use a spread start position for the route (first bot slot)
        const startAngle = 0;
        const latDeg = R / 111.32, lngDeg = R / (111.32 * Math.cos(center[0] * Math.PI / 180));
        const botStart = [center[0] + latDeg * Math.cos(startAngle), center[1] + lngDeg * Math.sin(startAngle)];
        room.routeWaypoints = await fetchOsrmRoute(botStart, center);
        console.log(`[Room ${roomCode}] Route fetched: ${room.routeWaypoints.length} waypoints`);
    }

    const route = room.routeWaypoints;
    const existing = room.bots.size;

    for (let i = 0; i < Math.min(count, 15); i++) {
        const profile = BOT_PROFILES[(existing + i) % BOT_PROFILES.length];
        const name = BOT_NAMES[(existing + i) % BOT_NAMES.length];
        const botId = `bot_${roomCode}_${existing + i}`;

        // Start them near the beginning of the route but staggered
        const startIdx = Math.min(i * 2, Math.floor(route.length * 0.05));
        const pos = [...route[startIdx]];
        // Add small jitter so they don't stack
        pos[0] += (Math.random() - 0.5) * 0.0008;
        pos[1] += (Math.random() - 0.5) * 0.0008;

        const isTeamMode = room.playMode === 'team';
        const teamAssigned = isTeamMode ? (profile.wkg >= 4.0 ? 'A' : profile.wkg >= 3.2 ? 'B' : profile.wkg >= 2.5 ? 'C' : 'D') : null;

        room.bots.set(botId, {
            id: botId, name, isBot: true,
            position: pos,
            distKm: 0,
            speed: 0,
            watts: Math.round(profile.wkg * profile.weight),
            hr: 130 + Math.floor(Math.random() * 25),
            wkg: profile.wkg,
            weight: profile.weight,
            zone: 'Z2', role: 'rider',
            team: teamAssigned,
            arrived: false, policeStopUntil: 0,
            wpIndex: startIdx,   // current waypoint cursor
        });
    }

    console.log(`[Room ${roomCode}] ${room.bots.size} bots total`);
    startBotLoop(roomCode, io);
}

// ── Bot loop: move each bot along route waypoints ─────────────
function startBotLoop(roomCode, io) {
    const room = ROOMS.get(roomCode);
    if (!room || room.botInterval) return;

    room.botInterval = setInterval(() => {
        const r = ROOMS.get(roomCode);
        if (!r || !r.routeWaypoints) return;

        const route = r.routeWaypoints;
        const now = Date.now();

        r.bots.forEach((bot) => {
            if (bot.arrived) return;

            const isRed = r.trafficState === 'RED';
            const isPolice = bot.policeStopUntil > now;
            const stopped = isRed || isPolice;

            const t = now / 1000;
            const liveWkg = bot.wkg + 0.3 * Math.sin(t * 0.2 + bot.id.length);
            bot.watts = Math.round(liveWkg * bot.weight);
            bot.hr = Math.round(140 + 15 * (liveWkg / 4) + 5 * Math.sin(t * 0.1));
            const grade = r.playMode === 'mountain' ? getMountainGrade(r.mountainId, bot.distKm) : 0;
            bot.speed = wkgToSpeed(liveWkg, bot.weight, stopped, grade);
            const ftpPct = liveWkg / (bot.wkg * 1.05);
            bot.zone = ftpPct < 0.65 ? 'Z1' : ftpPct < 0.75 ? 'Z2' : ftpPct < 0.87 ? 'Z3' : ftpPct < 1.0 ? 'Z4' : 'Z5';

            if (!stopped && bot.speed > 0) {
                const dt = 0.5; // seconds per tick
                const distDelta = (bot.speed / 3600) * dt;
                bot.distKm += distDelta;

                // Advance waypoint cursor
                while (bot.wpIndex < route.length - 1 && haversine(bot.position, route[bot.wpIndex]) < 0.025) {
                    bot.wpIndex++;
                }

                if (bot.wpIndex >= route.length - 1) {
                    bot.arrived = true; bot.position = [...route[route.length - 1]];
                } else {
                    const target = route[bot.wpIndex];
                    const dist = haversine(bot.position, target);
                    if (dist > 0.005) {
                        const frac = Math.min(distDelta / dist, 1);
                        bot.position = [
                            bot.position[0] + (target[0] - bot.position[0]) * frac,
                            bot.position[1] + (target[1] - bot.position[1]) * frac,
                        ];
                    }
                }
            }

            // Police checkpoint collision
            if (!isPolice) {
                r.policeCheckpoints.forEach(cp => {
                    if (haversine(bot.position, cp.position) < cp.radius) {
                        bot.policeStopUntil = now + 30000;
                        io?.to(roomCode).emit('POLICE_STOP', { playerId: bot.id, duration: 30 });
                    }
                });
            }
        });

        broadcastPlayerList(roomCode, io);
    }, 500);
}

// ── Traffic light — slow, realistic timing ────────────────────
function scheduleLight(roomCode, io) {
    const room = ROOMS.get(roomCode);
    if (!room) return;
    const isGreen = room.trafficState === 'GREEN';
    // GREEN: 45–90 s   RED: 15–25 s
    const delay = isGreen
        ? 45000 + Math.random() * 45000
        : 15000 + Math.random() * 10000;
    room.lightTimer = setTimeout(() => {
        const r = ROOMS.get(roomCode);
        if (!r) return;
        if (isGreen) {
            r.trafficState = 'YELLOW'; io?.to(roomCode).emit('LIGHT_CHANGE', { state: 'YELLOW' });
            setTimeout(() => { const r2 = ROOMS.get(roomCode); if (!r2) return; r2.trafficState = 'RED'; io?.to(roomCode).emit('LIGHT_CHANGE', { state: 'RED' }); scheduleLight(roomCode, io); }, 3000);
        } else {
            r.trafficState = 'YELLOW'; io?.to(roomCode).emit('LIGHT_CHANGE', { state: 'YELLOW' });
            setTimeout(() => { const r2 = ROOMS.get(roomCode); if (!r2) return; r2.trafficState = 'GREEN'; io?.to(roomCode).emit('LIGHT_CHANGE', { state: 'GREEN' }); scheduleLight(roomCode, io); }, 3000);
        }
    }, delay);
}

function startCountdown(roomCode, io) {
    const room = ROOMS.get(roomCode);
    if (!room || room.raceStarted) return;
    room.raceStarted = true;
    let count = 10;
    const tick = () => { io?.to(roomCode).emit('COUNTDOWN', { value: count }); if (count > 0) { count--; setTimeout(tick, 1000); } };
    tick();
}

function broadcastPlayerList(roomCode, io) {
    const room = ROOMS.get(roomCode);
    if (!room) return;
    io?.to(roomCode).emit('PLAYER_LIST', [...room.players.values(), ...room.bots.values()]);
}

export { getRoom, clearRoom, scheduleLight, startCountdown, addBots, broadcastPlayerList };
