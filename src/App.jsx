// ============================================================
// App.jsx — Root component with screen management
// Screens: 'start' → 'race-list' (rider) or 'lobby' → 'race'/'instructor'
// ============================================================
import { useState, useEffect } from 'react';
import StartScreen from './components/StartScreen';
import RaceList from './components/RaceList';
import Lobby from './components/Lobby';
import RaceView from './components/RaceView';
import InstructorView from './components/InstructorView';
import GlobalLeaderboard from './components/GlobalLeaderboard';
import { useBluetooth } from './hooks/useBluetooth';
import { useSocket } from './hooks/useSocket';

function extractStravaToken() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('strava_token');
    if (token) {
        localStorage.setItem('strava_token', token);
        window.history.replaceState({}, '', window.location.pathname);
    }
    return { prefillRoom: params.get('room') };
}

export default function App() {
    // 'start' | 'race-list' | 'lobby' | 'race' | 'instructor'
    const [screen, setScreen] = useState('start');
    const [raceConfig, setRaceConfig] = useState(null);
    const [pendingRole, setPendingRole] = useState(null); // 'rider' | 'instructor'

    const bluetooth = useBluetooth();
    const socket = useSocket();

    useEffect(() => {
        const { prefillRoom } = extractStravaToken();
        // Deep-link: jump straight to race-list if there's a ?room= param
        if (prefillRoom) {
            setPendingRole('rider');
            setScreen('lobby');
        }
    }, []);

    // Role chosen on StartScreen
    function handleRoleChose(role) {
        setPendingRole(role);
        if (role === 'rider') {
            setScreen('race-list');      // riders → see ongoing races first
        } else if (role === 'instructor') {
            setScreen('lobby');          // instructors → straight to config
        } else if (role === 'arcade') {
            setScreen('arcade');         // global leaderboard
        }
    }

    // Rider chose to join a specific race from the list
    function handleJoinRace(config) {
        setPendingRole('rider');
        setRaceConfig(config);
        setScreen('lobby');
    }

    // Lobby "Start" button
    function handleStart(lobbyConfig) {
        // Merge the lobby setup with any pre-existing config (e.g. from RaceList)
        const finalConfig = { ...raceConfig, ...lobbyConfig };
        setRaceConfig(finalConfig);
        setScreen(finalConfig.role === 'instructor' ? 'instructor' : 'race');
    }

    // Back / Leave
    function handleLeave(targetParam) {
        const nextScreen = typeof targetParam === 'string' ? targetParam : 'start';
        setScreen(nextScreen);
        setRaceConfig(null);
        setPendingRole(null);
    }
    function handleBackToList() { setScreen('race-list'); }
    function handleBackToStart() { setScreen('start'); }

    // ── Screen routing ─────────────────────────────────────────
    if (screen === 'start') {
        return <StartScreen onChoose={handleRoleChose} />;
    }

    if (screen === 'race-list') {
        return (
            <RaceList
                socket={socket}
                bluetooth={bluetooth}
                onJoin={handleJoinRace}
                onBack={() => setScreen('start')}
            />
        );
    }

    if (screen === 'arcade') {
        return <GlobalLeaderboard onBack={handleBackToStart} />;
    }

    if (screen === 'lobby') {
        return (
            <Lobby
                initialRole={pendingRole}
                presetConfig={raceConfig}
                onStart={handleStart}
                onBack={handleBackToStart}
                bluetooth={bluetooth}
            />
        );
    }

    if (screen === 'race' && raceConfig) {
        return (
            <RaceView
                config={raceConfig}
                bluetooth={bluetooth}
                socket={socket}
                onLeave={handleLeave}
            />
        );
    }

    if (screen === 'instructor' && raceConfig) {
        return (
            <InstructorView
                config={raceConfig}
                socket={socket}
                onLeave={handleLeave}
            />
        );
    }

    return <StartScreen onChoose={handleRoleChose} />;
}
