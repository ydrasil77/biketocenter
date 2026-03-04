// ============================================================
// useBots — Client-side bot simulation
// Every bot gets its own unique OSRM street route AND its own
// traffic lights along that route.
// Returns: { bots, routes, botLights }
//   botLights: { botId: [{id, position, state}] }
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { fetchStreetRoute } from '../utils/routing';
import { haversine, calcStartPositions } from '../utils/cities';
import { sampleRoutePositions } from '../utils/routing';

const PLAYER_COLORS = [
    '#f97316', '#a855f7', '#06b6d4', '#ec4899', '#facc15',
    '#10b981', '#ef4444', '#8b5cf6', '#3b82f6', '#f43f5e',
    '#84cc16', '#fb923c', '#22d3ee', '#c084fc', '#4ade80',
];

const BOT_NAMES = [
    'VeloBot', 'ThorKraft', 'Valeria_R', 'NordicS', 'Chen_W',
    'SkyRider', 'JoséL', 'FenixPro', 'Luna_V', 'IronPedal',
    'SwiftK', 'RocketR', 'DuskRider', 'GaleForce', 'NightWing',
];

const BOT_PROFILES = [
    { wkg: 2.4, weight: 80 }, { wkg: 2.9, weight: 75 }, { wkg: 3.3, weight: 70 },
    { wkg: 3.6, weight: 68 }, { wkg: 3.9, weight: 72 }, { wkg: 4.3, weight: 65 },
    { wkg: 4.7, weight: 60 }, { wkg: 2.6, weight: 78 }, { wkg: 3.1, weight: 73 },
    { wkg: 3.5, weight: 67 }, { wkg: 2.2, weight: 83 }, { wkg: 4.0, weight: 63 },
    { wkg: 3.8, weight: 69 }, { wkg: 2.7, weight: 77 }, { wkg: 4.5, weight: 62 },
];

const TL_STATES = ['GREEN', 'YELLOW', 'RED', 'YELLOW'];
const TL_DURATIONS = [14000, 2000, 8000, 2000]; // ms per state

/** Convert W/kg → km/h using stable binary search */
function wkgToSpeed(wkg, weight) {
    if (wkg <= 0) return 0;
    const P = wkg * weight;
    let lo = 0, hi = 25;
    for (let i = 0; i < 50; i++) {
        const vm = (lo + hi) / 2;
        const Pv = 0.5 * 0.405 * 1.225 * vm * vm * vm + 0.004 * (weight + 9) * 9.81 * vm;
        if (Pv < P) lo = vm; else hi = vm;
    }
    return ((lo + hi) / 2) * 3.6;
}

/** Curved fallback route with 61 points */
function buildFallback([slat, slng], [elat, elng], steps = 60) {
    const dlat = elat - slat, dlng = elng - slng;
    const len = Math.sqrt(dlat * dlat + dlng * dlng) || 1;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const bt = Math.sin(t * Math.PI) * 0.003;
        pts.push([slat + dlat * t + bt * dlng / len, slng + dlng * t - bt * dlat / len]);
    }
    return pts;
}

/** Create 3 independent traffic lights sampled along a route */
function makeRouteLights(routeId, route, offset = 0) {
    const positions = sampleRoutePositions(route, 3);
    return positions.map((pos, i) => {
        const phaseOffset = (offset * 3 + i) % 4;
        return {
            id: `tl_${routeId}_${i}`,
            position: pos,
            stateIdx: phaseOffset,
            durations: [
                TL_DURATIONS[0] + Math.random() * 6000,
                TL_DURATIONS[1],
                TL_DURATIONS[2] + Math.random() * 4000,
                TL_DURATIONS[3],
            ],
            state: TL_STATES[phaseOffset],
        };
    });
}

export function useBots({ count = 0, targetPos, radiusKm = 2, trafficState }) {
    const [bots, setBots] = useState([]);
    const [routes, setRoutes] = useState({});
    const [botLights, setBotLights] = useState({}); // botId → [{id,position,state}]

    const botsRef = useRef([]);
    const botRoutesRef = useRef({});
    const lightTimers = useRef([]);
    const lightStateRef = useRef({}); // lightId → current state string
    const botLightsRef = useRef({}); // botId → [{...}]
    const intervalRef = useRef(null);
    const trafficRef = useRef(trafficState);

    useEffect(() => { trafficRef.current = trafficState; }, [trafficState]);

    // ── Fetch one unique OSRM route per bot + create route lights ──
    useEffect(() => {
        // Cleanup previous light timers
        lightTimers.current.forEach(clearTimeout);
        lightTimers.current = [];
        lightStateRef.current = {};
        botLightsRef.current = {};

        if (!targetPos || count === 0) {
            setBots([]); setRoutes({}); setBotLights({});
            botsRef.current = []; botRoutesRef.current = {};
            return;
        }

        const n = Math.min(count, 15);
        const startPositions = calcStartPositions(targetPos, n, radiusKm);

        Promise.all(
            startPositions.map((sp, i) =>
                fetchStreetRoute(sp, targetPos)
                    .then(r => ({ i, sp, route: r }))
                    .catch(() => ({ i, sp, route: null }))
            )
        ).then(results => {
            const routeMap = {};
            const lightsMap = {};
            const initial = results.map(({ i, sp, route }) => {
                const p = BOT_PROFILES[i % BOT_PROFILES.length];
                const id = `cbot_${i}`;

                // fetchStreetRoute now returns {waypoints, steps, distKm} — unwrap
                const rawRoute = (route && !Array.isArray(route)) ? route.waypoints : route;
                const waypoints = (rawRoute && rawRoute.length > 2) ? rawRoute : buildFallback(sp, targetPos, 60);
                routeMap[id] = waypoints;

                // Create 3 independent traffic lights for this bot's route
                const lights = makeRouteLights(id, waypoints, i);
                lightsMap[id] = lights;
                lights.forEach(l => { lightStateRef.current[l.id] = l.state; });

                const pos = [...waypoints[0]];
                pos[0] += (Math.random() - 0.5) * 0.0005;
                pos[1] += (Math.random() - 0.5) * 0.0005;

                return {
                    id, name: BOT_NAMES[i % BOT_NAMES.length],
                    isBot: true, color: PLAYER_COLORS[i % PLAYER_COLORS.length],
                    position: pos, distKm: 0, speed: 0,
                    watts: Math.round(p.wkg * p.weight),
                    hr: 130 + Math.floor(Math.random() * 25),
                    wkg: p.wkg, weight: p.weight, zone: 'Z2',
                    arrived: false, wpIndex: 1, policeStopUntil: 0,
                };
            });

            botRoutesRef.current = routeMap;
            botLightsRef.current = lightsMap;
            botsRef.current = initial;
            setBots(initial.map(b => ({ ...b })));
            setRoutes({ ...routeMap });
            setBotLights({ ...lightsMap });

            // Start independent timers for each light
            Object.values(lightsMap).flat().forEach(light => {
                let idx = light.stateIdx;
                function tick() {
                    idx = (idx + 1) % 4;
                    const newState = TL_STATES[idx];
                    lightStateRef.current[light.id] = newState;
                    // Update botLights state for this light
                    setBotLights(prev => {
                        const botId = light.id.replace(/tl_(\w+)_\d+/, 'cbot_$1').replace('tl_cbot_', 'cbot_');
                        // Rebuild botId from lightId pattern: tl_cbot_0_1 → cbot_0
                        const match = light.id.match(/^tl_(cbot_\d+)_\d+$/);
                        if (!match) return prev;
                        const bid = match[1];
                        return {
                            ...prev,
                            [bid]: (prev[bid] ?? []).map(l => l.id === light.id ? { ...l, state: newState } : l),
                        };
                    });
                    const t = setTimeout(tick, light.durations[idx]);
                    lightTimers.current.push(t);
                }
                const t = setTimeout(tick, light.durations[idx]);
                lightTimers.current.push(t);
            });
        });

        return () => { lightTimers.current.forEach(clearTimeout); };
    }, [count, targetPos?.[0], targetPos?.[1], radiusKm]); // eslint-disable-line

    // ── Simulation loop — each bot follows its own route ─────────
    // A bot stops only when ITS NEXT WAYPOINT has a RED traffic light on the route
    useEffect(() => {
        clearInterval(intervalRef.current);
        if (count === 0) return;

        intervalRef.current = setInterval(() => {
            const bots = botsRef.current;
            if (bots.length === 0) return;
            const now = Date.now();

            const updated = bots.map(bot => {
                if (bot.arrived) return bot;

                const route = botRoutesRef.current[bot.id];
                if (!route || route.length < 2) return bot;

                // Check if bot is AT a red light on its own route
                const myLights = botLightsRef.current[bot.id] ?? [];
                const atRedLight = myLights.some(light =>
                    light.state === 'RED' &&
                    haversine(bot.position, light.position) < 0.060  // within 60m of light
                );

                const isPoliceStopped = (bot.policeStopUntil ?? 0) > now;
                const stopped = atRedLight || isPoliceStopped;

                const t = now / 1000;
                const liveWkg = bot.wkg + 0.25 * Math.sin(t * 0.2 + bot.id.length * 0.9);
                const watts = Math.round(liveWkg * bot.weight);
                const hr = Math.round(140 + 15 * (liveWkg / 4) + 5 * Math.sin(t * 0.1));
                const speed = stopped ? 0 : wkgToSpeed(liveWkg, bot.weight);
                const fp = liveWkg / (bot.wkg * 1.05);
                const zone = fp < 0.65 ? 'Z1' : fp < 0.75 ? 'Z2' : fp < 0.87 ? 'Z3' : fp < 1.0 ? 'Z4' : 'Z5';

                if (speed === 0) return { ...bot, speed: 0, watts, hr, zone };

                let wpIndex = bot.wpIndex;
                while (wpIndex < route.length - 1 && haversine(bot.position, route[wpIndex]) < 0.025) {
                    wpIndex++;
                }

                if (wpIndex >= route.length - 1) {
                    return { ...bot, arrived: true, position: [...route[route.length - 1]], speed, watts, hr, zone, wpIndex };
                }

                const target = route[wpIndex];
                const distDelta = (speed / 3600) * 0.5;
                const distToWp = haversine(bot.position, target);
                const frac = distToWp > 0 ? Math.min(distDelta / distToWp, 1) : 0;
                const position = [
                    bot.position[0] + (target[0] - bot.position[0]) * frac,
                    bot.position[1] + (target[1] - bot.position[1]) * frac,
                ];

                return { ...bot, position, distKm: bot.distKm + distDelta, speed, watts, hr, zone, wpIndex };
            });

            botsRef.current = updated;
            setBots(updated.map(b => ({ ...b })));
        }, 500);

        return () => clearInterval(intervalRef.current);
    }, [count]); // eslint-disable-line

    return { bots, routes, botLights };
}
