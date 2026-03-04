// ============================================================
// src/utils/routing.js — OSRM street routing + route utilities
// ============================================================

const OSRM_PRIMARY = 'https://router.project-osrm.org';
const OSRM_BACKUP = 'https://routing.openstreetmap.de/routed-bike';

/**
 * Fetch a cycling route from start → end via OSRM public API.
 * Returns { waypoints: [lat,lng][], steps: NavStep[] }
 * where NavStep = { streetName, maneuver, distM, bearing }
 */
export async function fetchStreetRoute(start, end, { alternatives = false } = {}) {
    const [slat, slng] = start;
    const [elat, elng] = end;
    const altParam = alternatives ? '&alternatives=3' : '';
    const baseParams = `overview=full&geometries=geojson&steps=true&annotations=false${altParam}`;

    const ENDPOINTS = [
        `${OSRM_PRIMARY}/route/v1/cycling/${slng},${slat};${elng},${elat}?${baseParams}`,
        `${OSRM_BACKUP}/route/v1/driving/${slng},${slat};${elng},${elat}?overview=full&geometries=geojson&steps=true`,
    ];

    for (const url of ENDPOINTS) {
        try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 9000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(tid);
            if (!res.ok) continue;
            const data = await res.json();
            if (!data.routes?.length) continue;

            const parsed = data.routes.map(r => ({
                waypoints: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
                steps: parseSteps(r),
                distKm: (r.distance ?? 0) / 1000,
                durationMin: (r.duration ?? 0) / 60,
            }));

            if (parsed[0]?.waypoints?.length > 1) {
                // If alternatives requested, return all; otherwise return first
                return alternatives ? parsed : parsed[0];
            }
        } catch (e) {
            console.warn('[Routing] Endpoint failed:', e.message);
        }
    }

    // Fallback: curved path with no step data
    console.warn('[Routing] Fallback curved path');
    const wp = generateCurvedFallback(start, end, 120);
    const result = { waypoints: wp, steps: [], distKm: 0, durationMin: 0 };
    return alternatives ? [result] : result;
}

/**
 * Parse OSRM step objects into simplified NavStep structures.
 */
function parseSteps(route) {
    const steps = [];
    for (const leg of (route.legs ?? [])) {
        for (const step of (leg.steps ?? [])) {
            const m = step.maneuver ?? {};
            steps.push({
                streetName: step.name || step.ref || '',
                maneuverType: m.type ?? 'straight',
                maneuverModifier: m.modifier ?? 'straight',
                distM: step.distance ?? 0,
                durationSec: step.duration ?? 0,
                // First coordinate of this step (entry point for this maneuver)
                location: step.geometry?.coordinates?.[0]
                    ? [step.geometry.coordinates[0][1], step.geometry.coordinates[0][0]]
                    : null,
            });
        }
    }
    return steps;
}

/**
 * Find the active OSRM step for a given position and wpIndex.
 * Returns the step whose location the player is closest to.
 */
export function findActiveStep(steps, position) {
    if (!steps?.length || !position) return null;
    let best = null, bestDist = Infinity;
    for (const step of steps) {
        if (!step.location) continue;
        const d = haversine(position, step.location);
        if (d < bestDist) { bestDist = d; best = step; }
    }
    return best;
}

/**
 * Find the NEXT upcoming step from current position.
 */
export function findNextStep(steps, position) {
    if (!steps?.length || !position) return null;
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < steps.length; i++) {
        if (!steps[i].location) continue;
        const d = haversine(position, steps[i].location);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    // Return the step AFTER the current closest one
    return steps[bestIdx + 1] ?? steps[bestIdx] ?? null;
}

/**
 * Map OSRM maneuver type+modifier → display emoji + label
 */
export function maneuverDisplay(type, modifier) {
    if (type === 'arrive') return { arrow: '🏁', label: 'ARRIVE' };
    if (type === 'depart') return { arrow: '↑', label: 'START' };

    const mod = modifier ?? 'straight';
    if (mod === 'left') return { arrow: '←', label: 'TURN LEFT' };
    if (mod === 'right') return { arrow: '→', label: 'TURN RIGHT' };
    if (mod === 'sharp left') return { arrow: '↰', label: 'SHARP LEFT' };
    if (mod === 'sharp right') return { arrow: '↱', label: 'SHARP RIGHT' };
    if (mod === 'slight left') return { arrow: '↖', label: 'SLIGHT LEFT' };
    if (mod === 'slight right') return { arrow: '↗', label: 'SLIGHT RIGHT' };
    if (mod === 'uturn') return { arrow: '↩', label: 'U-TURN' };
    return { arrow: '↑', label: 'CONTINUE' };
}

/**
 * Generate a graceful curved fallback path.
 */
function generateCurvedFallback([slat, slng], [elat, elng], steps) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = slat + (elat - slat) * t;
        const lng = slng + (elng - slng) * t;
        const bulge = Math.sin(t * Math.PI) * 0.003;
        const dlat = elat - slat, dlng = elng - slng;
        const len = Math.sqrt(dlat * dlat + dlng * dlng) || 1;
        pts.push([lat + bulge * dlng / len, lng - bulge * dlat / len]);
    }
    return pts;
}

/**
 * Pick `count` evenly-spaced positions along a route array.
 */
export function sampleRoutePositions(waypoints, count) {
    if (!waypoints || waypoints.length < 2) return [];
    return Array.from({ length: count }, (_, i) => {
        const idx = Math.floor(((i + 1) / (count + 1)) * (waypoints.length - 1));
        return waypoints[idx];
    });
}

/**
 * Simple haversine distance in km.
 */
export function haversine([lat1, lon1], [lat2, lon2]) {
    const R = 6371, d = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * d / 2) ** 2 +
        Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin((lon2 - lon1) * d / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
