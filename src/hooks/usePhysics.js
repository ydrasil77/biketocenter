// ============================================================
// usePhysics — Game loop that follows street route waypoints
// Supports: L/R heading offset, police stop, traffic light stop
// ============================================================
import { useState, useRef, useEffect, useCallback } from 'react';
import { calcSpeed, getZone, calcCalories } from '../utils/physics';
import { haversine } from '../utils/cities';
import { getMountainGrade } from '../utils/mountains';

const RECORD_INTERVAL_MS = 2000;

// Move a [lat,lng] position toward a target by `km` kilometers
function moveToward(pos, target, km) {
    const dist = haversine(pos, target);
    if (dist < 0.001) return target;
    const frac = Math.min(km / dist, 1);
    return [
        pos[0] + (target[0] - pos[0]) * frac,
        pos[1] + (target[1] - pos[1]) * frac,
    ];
}

// Apply a lateral heading offset (degrees) — positive = right, negative = left
// This shifts the next waypoint perpendicular to the current heading
function applyHeadingOffset(pos, nextWp, offsetDeg) {
    if (!offsetDeg) return nextWp;
    const bearingRad = Math.atan2(nextWp[1] - pos[1], nextWp[0] - pos[0]);
    const perpRad = bearingRad + (offsetDeg * Math.PI) / 180;
    const nudge = 0.0003; // ~30m lateral nudge
    return [
        nextWp[0] + nudge * Math.cos(perpRad),
        nextWp[1] + nudge * Math.sin(perpRad),
    ];
}

export function usePhysics({
    watts,
    cadence,
    hr,
    weightKg,
    gender,
    ftp,
    trafficState,
    startPosition,
    targetPosition,
    routeWaypoints = null, // [lat,lng][] from OSRM — if null, go straight
    headingOffset = 0,     // degrees L/R override (-ve = left, +ve = right)
    mountainId = null,     // ID of mountain if in mountain mode
    active,
    paused,
}) {
    const [position, setPosition] = useState(startPosition ?? [0, 0]);
    const [speed, setSpeed] = useState(0);
    const [zone, setZone] = useState(null);
    const [totalDistKm, setTotalDistKm] = useState(0);
    const [elapsedSec, setElapsedSec] = useState(0);
    const [calories, setCalories] = useState(0);
    const [arrived, setArrived] = useState(false);
    const [track, setTrack] = useState([]);
    const [wpIndex, setWpIndex] = useState(0); // current waypoint cursor

    const posRef = useRef(startPosition ?? [0, 0]);
    const distRef = useRef(0);
    const rafRef = useRef(null);
    const lastTimeRef = useRef(null);
    const lastRecordRef = useRef(0);
    const elapsedRef = useRef(0);
    const timerRef = useRef(null);
    const wpIndexRef = useRef(0);
    const headingRef = useRef(headingOffset);
    const routeRef = useRef(routeWaypoints);

    // Update heading ref live (no re-render loop)
    useEffect(() => { headingRef.current = headingOffset; }, [headingOffset]);
    // Update route ref live
    useEffect(() => { routeRef.current = routeWaypoints; wpIndexRef.current = 0; }, [routeWaypoints]);

    // Reset on start position change
    useEffect(() => {
        if (startPosition) {
            posRef.current = startPosition;
            setPosition(startPosition);
            wpIndexRef.current = 0;
            setWpIndex(0);
        }
    }, [startPosition?.[0], startPosition?.[1]]);

    // Elapsed timer
    useEffect(() => {
        if (active && !paused) {
            timerRef.current = setInterval(() => {
                elapsedRef.current += 1;
                setElapsedSec(e => e + 1);
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [active, paused]);

    // Animation loop
    useEffect(() => {
        if (!active || !targetPosition) return;

        const loop = (timestamp) => {
            if (!lastTimeRef.current) lastTimeRef.current = timestamp;
            const dtSec = Math.min((timestamp - lastTimeRef.current) / 1000, 0.25);
            lastTimeRef.current = timestamp;

            if (!paused) {
                const grade = getMountainGrade(mountainId, distRef.current);
                const spd = calcSpeed(watts, weightKg, gender, trafficState, grade);
                setSpeed(spd);
                setZone(getZone(watts, ftp));
                setCalories(calcCalories(watts, elapsedRef.current));

                if (spd > 0) {
                    const pos = posRef.current;
                    const route = routeRef.current;
                    const delta = (spd / 3600) * dtSec; // km this frame

                    // Determine next target point
                    let nextTarget;
                    if (route && route.length > 0) {
                        // Advance waypoint cursor if we've passed the current waypoint
                        while (
                            wpIndexRef.current < route.length - 1 &&
                            haversine(pos, route[wpIndexRef.current]) < 0.025
                        ) {
                            wpIndexRef.current++;
                            setWpIndex(wpIndexRef.current);
                        }
                        nextTarget = applyHeadingOffset(
                            pos,
                            route[wpIndexRef.current],
                            headingRef.current,
                        );
                    } else {
                        // No route — straight to target
                        nextTarget = targetPosition;
                    }

                    const distToNext = haversine(pos, nextTarget);
                    if (distToNext > 0.005) {
                        const newPos = moveToward(pos, nextTarget, delta);
                        posRef.current = newPos;
                        setPosition([...newPos]);
                        distRef.current += delta;
                        setTotalDistKm(distRef.current);

                        // GPS recording
                        if (timestamp - lastRecordRef.current >= RECORD_INTERVAL_MS) {
                            setTrack(t => [...t, {
                                lat: newPos[0], lng: newPos[1],
                                timestamp: Date.now(),
                                watts, hr, cadence,
                            }]);
                            lastRecordRef.current = timestamp;
                        }
                    } else if (wpIndexRef.current >= (route?.length ?? 1) - 1) {
                        setArrived(true);
                    }
                }
            }

            rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(rafRef.current);
            lastTimeRef.current = null;
        };
    }, [active, paused, watts, hr, cadence, weightKg, gender, ftp, trafficState, targetPosition, mountainId]);

    const resetTrack = useCallback(() => {
        setTrack([]);
        distRef.current = 0;
        setTotalDistKm(0);
        setElapsedSec(0);
        setArrived(false);
        elapsedRef.current = 0;
        wpIndexRef.current = 0;
        setWpIndex(0);
    }, []);

    return {
        position, speed, zone, totalDistKm,
        elapsedSec, calories, arrived, track, resetTrack, wpIndex,
    };
}
