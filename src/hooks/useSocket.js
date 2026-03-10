// ============================================================
// useSocket — Socket.io client
// Adds: POLICE_CHECKPOINTS, POLICE_STOP, ADD_BOTS emit
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:3001`;

export function useSocket() {
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const [players, setPlayers] = useState([]);
    const [trafficState, setTrafficState] = useState('GREEN');
    const [countdown, setCountdown] = useState(null);
    const [myStartPos, setMyStartPos] = useState(null);
    const [raceStarted, setRaceStarted] = useState(false);
    const [policeCheckpoints, setPoliceCheckpoints] = useState([]);  // [{id, position, radius}]
    const [policeStop, setPoliceStop] = useState(null); // { playerId, until }
    const [roomPlayMode, setRoomPlayMode] = useState(null);   // set from server ROOM_STATE
    const [roomMountainId, setRoomMountainId] = useState(null); // set from server ROOM_STATE

    useEffect(() => {
        const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
        socketRef.current = socket;

        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));

        socket.on('PLAYER_LIST', (list) => setPlayers(list));
        socket.on('LIGHT_CHANGE', ({ state }) => setTrafficState(state));

        socket.on('COUNTDOWN', ({ value }) => {
            setCountdown(value);
            if (value === 0) {
                setRaceStarted(true);
                setTimeout(() => setCountdown(null), 1000);
            }
        });

        socket.on('START_POSITION', ({ position }) => setMyStartPos(position));

        socket.on('ROOM_STATE', ({ raceStarted, playMode, mountainId }) => {
            setRaceStarted(raceStarted);
            if (playMode) setRoomPlayMode(playMode);
            if (mountainId !== undefined) setRoomMountainId(mountainId ?? null);
        });

        // Police checkpoints: array of {id, position:[lat,lng], radius}
        socket.on('POLICE_CHECKPOINTS', (checkpoints) => {
            setPoliceCheckpoints(checkpoints);
        });

        // Police stop: applies to myId or a bot
        socket.on('POLICE_STOP', ({ playerId, duration }) => {
            setPoliceStop({ playerId, until: Date.now() + duration * 1000 });
            // Clear after duration
            setTimeout(() => setPoliceStop(null), duration * 1000 + 200);
        });

        return () => socket.disconnect();
    }, []);

    const joinRoom = useCallback((roomCode, playerData) => {
        socketRef.current?.emit('JOIN_ROOM', { roomCode, ...playerData });
    }, []);

    const updatePosition = useCallback((data) => {
        socketRef.current?.emit('PLAYER_UPDATE', data);
    }, []);

    const triggerStart = useCallback((roomCode) => {
        socketRef.current?.emit('INSTRUCTOR_START', { roomCode });
    }, []);

    const addBots = useCallback((roomCode, count) => {
        socketRef.current?.emit('ADD_BOTS', { roomCode, count });
    }, []);

    const removeBots = useCallback((roomCode) => {
        socketRef.current?.emit('REMOVE_BOTS', { roomCode });
    }, []);

    return {
        connected, players, trafficState, countdown,
        myStartPos, raceStarted,
        roomPlayMode, roomMountainId,
        policeCheckpoints, policeStop,
        joinRoom, updatePosition, triggerStart, addBots, removeBots,
        socketId: socketRef.current?.id,
        rawSocket: socketRef.current,  // direct socket access for RaceList
    };
}
