/* ============================================================
   DARK VELOCITY — GAME.JS
   Full race logic: physics, map, BT, simulator, leaderboard
   ============================================================ */

'use strict';

// ─── CONFIG ──────────────────────────────────────────────
const CITIES = {
    copenhagen: {
        center:  [55.6926, 12.5992], // The Little Mermaid
        start:   [55.6760, 12.5684],
        name:    'Copenhagen',
        target:  'The Little Mermaid'
    },
    london: {
        center:  [51.5007, -0.1246], // Big Ben
        start:   [51.5090, -0.1350],
        name:    'London',
        target:  'Big Ben'
    },
    singapore: {
        center:  [1.2815,  103.8636], // Marina Bay Sands
        start:   [1.3050,  103.8200],
        name:    'Singapore',
        target:  'Marina Bay Sands'
    },
    paris: {
        center:  [48.8584,  2.2945], // Eiffel Tower
        start:   [48.8750,  2.3500],
        name:    'Paris',
        target:  'Eiffel Tower'
    },
    tokyo: {
        center:  [35.6586, 139.7454], // Tokyo Tower
        start:   [35.6900, 139.7000],
        name:    'Tokyo',
        target:  'Tokyo Tower'
    }
};

const TRAINING_ZONES = [
    { name: 'REST',     max: 0.55,  color: '#6b7280' },
    { name: 'Z1 — ACTIVE RECOVERY', max: 0.65, color: '#22d3ee' },
    { name: 'Z2 — ENDURANCE',       max: 0.75, color: '#22c55e' },
    { name: 'Z3 — TEMPO',           max: 0.87, color: '#facc15' },
    { name: 'Z4 — THRESHOLD',       max: 1.00, color: '#f97316' },
    { name: 'Z5 — VO2 MAX',         max: 1.15, color: '#ef4444' },
    { name: 'Z6 — ANAEROBIC',       max: 999,  color: '#a855f7' },
];

// ─── STATE ───────────────────────────────────────────────
let map, playerMarker, targetMarker, pathPolyline, trailCoords = [];
let isSimulating    = false;
let isPaused        = false;
let trafficState    = 'GREEN'; // 'GREEN' | 'RED'
let currentWatts    = 0;
let currentCadence  = 0;
let currentHR       = 0;
let currentSpeed    = 0;
let totalDistKm     = 0;
let raceDistanceKm  = 0; // total distance start→target
let raceStartTime   = null;
let raceTimer       = null;
let elapsedSec      = 0;
let btDevice        = null;
let roomCode        = '';
let animFrame       = null;
let simInterval     = null;
let cityKey         = 'copenhagen';
let lastFrameTime   = null;

// Leaderboard: simulated opponents
let opponentPositions = {};

// ─── INIT (called from startRace button) ─────────────────
function startRace() {
    cityKey = document.getElementById('city-select').value;
    const name = document.getElementById('user-name').value || 'Rider 1';

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('race-screen').classList.remove('hidden');

    document.getElementById('rider-display-name').textContent = name;
    document.getElementById('rider-city-name').textContent = CITIES[cityKey].name;

    roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    document.getElementById('room-code').textContent = roomCode;

    generateQR();
    initMap(cityKey);
    initOpponents();
    startTrafficLoop();
    startTimerLoop();
    requestAnimationFrame(gameLoop);
}

// ─── QR CODE ─────────────────────────────────────────────
function generateQR() {
    const el = document.getElementById('qr-code');
    el.innerHTML = '';
    // QR links to current URL with room param
    const url = `${location.href.split('?')[0]}?room=${roomCode}`;
    try {
        new QRCode(el, {
            text: url,
            width: 100,
            height: 100,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } catch(e) {
        el.innerHTML = `<div style="font-size:9px;color:#888;padding:4px;text-align:center">Room ${roomCode}</div>`;
    }
}

// ─── MAP ────────────────────────────────────────────────
function initMap(key) {
    const city = CITIES[key];

    map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        keyboard: false,
    }).setView(city.start, 14);

    // Dark tile layer (CartoDB dark matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    // Target marker (destination)
    const targetIcon = L.divIcon({
        className: '',
        html: `<div style="
            width:22px;height:22px;background:#22c55e;border-radius:50%;
            border:3px solid #fff;box-shadow:0 0 20px #22c55e;
            display:flex;align-items:center;justify-content:center">
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
    targetMarker = L.marker(city.center, { icon: targetIcon }).addTo(map)
        .bindTooltip(city.target, { permanent: true, className: 'target-tooltip', offset: [14, 0] });

    // Player marker
    const playerIcon = L.divIcon({
        className: '',
        html: `<div class="player-marker-ring" style="
            width:18px;height:18px;background:#3b82f6;border-radius:50%;
            border:3px solid #fff;box-shadow:0 0 14px #3b82f6;">
        </div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });
    playerMarker = L.marker(city.start, { icon: playerIcon }).addTo(map);
    trailCoords = [city.start];

    // Trail polyline
    pathPolyline = L.polyline(trailCoords, { color: '#3b82f6', weight: 3, opacity: 0.6 }).addTo(map);

    // Calc total race distance
    raceDistanceKm = haversine(city.start, city.center);
}

// ─── DISTANCE HELPERS ────────────────────────────────────
function haversine(a, b) {
    const R = 6371;
    const lat1 = a[0] * Math.PI / 180, lat2 = b[0] * Math.PI / 180;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

// ─── PHYSICS ─────────────────────────────────────────────
function calculateSpeed(watts) {
    if (trafficState === 'RED' || isPaused) return 0;
    if (watts <= 0) return 0;

    const weight = parseFloat(document.getElementById('user-weight').value) || 75;
    const gender = document.getElementById('user-gender').value;

    // Women's advantage modifier (per UCI data, women typically have ~10% higher V/kg than men at same effort)
    const genderMult = (gender === 'female') ? 1.12 : 1.0;
    const effectiveWatts = watts * genderMult;

    // Simplified drag model: P = 0.5 * Cd * A * rho * v^3 + Crr * m * g * v
    // Solve for v numerically (approximate with cubic root of power/drag)
    // P ≈ Fd · v, Fd ≈ 0.5 * 0.9 * 0.45 * 1.225 * v^2  (CdA=0.405, rho=1.225)
    const CdA = 0.405;
    const rho = 1.225;
    const Crr = 0.004;
    const g   = 9.81;
    const m   = weight + 9; // rider + bike

    // Iterative solve (Newton)
    let v = 8; // initial guess m/s
    for (let i = 0; i < 40; i++) {
        const drag  = 0.5 * CdA * rho * v * v;
        const roll  = Crr * m * g;
        const power = (drag + roll) * v;
        const dpdv  = (3 * 0.5 * CdA * rho * v * v) + roll;
        v = v - (power - effectiveWatts) / dpdv;
        if (v < 0) { v = 0; break; }
    }

    return v * 3.6; // → km/h
}

// ─── TRAINING ZONE ──────────────────────────────────────
function getZone(watts) {
    const ftp = parseFloat(document.getElementById('user-ftp').value) || 250;
    const pct = watts / ftp;
    for (const z of TRAINING_ZONES) {
        if (pct <= z.max) return { ...z, pct };
    }
    return { ...TRAINING_ZONES[TRAINING_ZONES.length - 1], pct };
}

// ─── GAME LOOP ───────────────────────────────────────────
function gameLoop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const dtSec = Math.min((timestamp - lastFrameTime) / 1000, 0.2);
    lastFrameTime = timestamp;

    if (!isPaused) {
        // Simulator override
        if (isSimulating) {
            const t = timestamp / 1000;
            currentWatts   = 240 + 30 * Math.sin(t * 0.3) + 15 * Math.sin(t * 0.7);
            currentCadence = 88  + 5  * Math.sin(t * 0.2);
            currentHR      = 155 + 8  * Math.sin(t * 0.15) + (currentWatts > 270 ? 10 : 0);
        }

        currentSpeed = calculateSpeed(currentWatts);

        // Move player marker
        if (currentSpeed > 0) {
            const city    = CITIES[cityKey];
            const pos     = playerMarker.getLatLng();
            const target  = L.latLng(city.center);
            const dist    = pos.distanceTo(target) / 1000; // km

            if (dist > 0.02) {
                // Real-world displacement based on physics speed
                const distanceDeltaKm = (currentSpeed / 3600) * dtSec;
                totalDistKm += distanceDeltaKm;

                // Move fraction towards target
                const fraction = distanceDeltaKm / dist;
                const nextLat  = pos.lat + (target.lat - pos.lat) * fraction;
                const nextLng  = pos.lng + (target.lng - pos.lng) * fraction;

                playerMarker.setLatLng([nextLat, nextLng]);
                map.panTo([nextLat, nextLng], { animate: true, duration: 0.5 });

                trailCoords.push([nextLat, nextLng]);
                pathPolyline.setLatLngs(trailCoords);
            } else {
                // Arrived!
                onArrived();
            }
        }

        // Move opponents
        updateOpponents(dtSec);
        updateUI();
    }

    animFrame = requestAnimationFrame(gameLoop);
}

// ─── UI UPDATE ──────────────────────────────────────────
function updateUI() {
    document.getElementById('display-speed').textContent  = currentSpeed.toFixed(1);
    document.getElementById('display-watts').textContent  = Math.round(currentWatts);
    document.getElementById('display-hr').textContent     = currentHR > 0 ? Math.round(currentHR) : '--';
    document.getElementById('display-cadence').textContent = currentCadence > 0 ? Math.round(currentCadence) : '--';
    document.getElementById('display-time').textContent   = formatTime(elapsedSec);

    // FTP %
    const ftp = parseFloat(document.getElementById('user-ftp').value) || 250;
    const pct = currentWatts > 0 ? Math.round(currentWatts / ftp * 100) : 0;
    document.getElementById('display-ftp-pct').textContent = currentWatts > 0 ? pct : '--';
    const ftpEl = document.getElementById('ftp-pct-el');
    if (pct >= 100)      ftpEl.className = 'metric-value red';
    else if (pct >= 87)  ftpEl.className = 'metric-value orange';
    else if (pct >= 75)  ftpEl.className = 'metric-value blue';
    else                 ftpEl.className = 'metric-value';

    // Zone bar
    const zone = getZone(currentWatts);
    const pctZone = Math.min(zone.pct * 100, 100);
    document.getElementById('zone-fill').style.width      = pctZone + '%';
    document.getElementById('zone-fill').style.background = zone.color;
    document.getElementById('zone-label').textContent     = zone.name;

    // Progress bar
    const progress = Math.min(totalDistKm / raceDistanceKm, 1);
    document.getElementById('race-progress-fill').style.width = (progress * 100).toFixed(1) + '%';
    document.getElementById('dist-label').textContent  = totalDistKm.toFixed(2) + ' km';
    const remaining = Math.max(raceDistanceKm - totalDistKm, 0).toFixed(2);
    document.getElementById('dist-remaining').textContent = remaining + ' km left';

    updateLeaderboard();
}

// ─── TIMER ───────────────────────────────────────────────
function startTimerLoop() {
    raceStartTime = Date.now();
    raceTimer = setInterval(() => {
        if (!isPaused) {
            elapsedSec++;
        }
    }, 1000);
}

function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2,'0');
    const s = (sec % 60).toString().padStart(2,'0');
    return `${m}:${s}`;
}

// ─── TRAFFIC LIGHT ──────────────────────────────────────
function startTrafficLoop() {
    setTrafficState('GREEN');
    // Random interval between 6–14 seconds
    scheduleNextTrafficChange();
}

function scheduleNextTrafficChange() {
    const delay = (trafficState === 'GREEN') 
        ? (8000 + Math.random() * 6000)   // Green: 8-14s
        : (3000 + Math.random() * 3000);  // Red: 3-6s
    setTimeout(() => {
        const next = trafficState === 'GREEN' ? 'RED' : 'GREEN';
        setTrafficState(next);
        scheduleNextTrafficChange();
    }, delay);
}

function setTrafficState(state) {
    trafficState = state;

    const red    = document.getElementById('light-red');
    const yellow = document.getElementById('light-yellow');
    const green  = document.getElementById('light-green');
    const label  = document.getElementById('tl-text');

    // Reset
    red.className = yellow.className = green.className = 'light';

    if (state === 'RED') {
        red.classList.add('red-on');
        label.textContent = 'STOP';
        label.style.color = '#ef4444';
    } else if (state === 'YELLOW_TO_GO') {
        yellow.classList.add('yellow-on');
        label.textContent = 'READY';
        label.style.color = '#facc15';
        setTimeout(() => setTrafficState('GREEN'), 1500);
    } else {
        green.classList.add('green-on');
        label.textContent = 'GO';
        label.style.color = '#22c55e';
    }

    // RED → YELLOW → GREEN sequence
    if (state === 'RED') {
        setTimeout(() => {
            if (trafficState === 'RED') {
                yellow.classList.add('yellow-on');
            }
        }, 1000);
    }
}

// ─── OPPONENTS (Simulated) ───────────────────────────────
function initOpponents() {
    const names = ['Valeria_R', 'ThorKraft', 'SkyRider', 'Chen_W', 'JoséL', 'NordicS'];
    opponentPositions = {};
    names.forEach((name, i) => {
        opponentPositions[name] = {
            distKm: 0,
            speedBase: 22 + i * 1.5 + Math.random() * 4, // km/h base
        };
    });
}

function updateOpponents(dtSec) {
    Object.entries(opponentPositions).forEach(([name, opp]) => {
        const variance = 1 + 0.2 * Math.sin(Date.now() / 5000 + opp.speedBase);
        opp.distKm += (opp.speedBase * variance / 3600) * dtSec;
    });
}

function updateLeaderboard() {
    const ftp = parseFloat(document.getElementById('user-ftp').value) || 250;
    const myName = document.getElementById('user-name').value || 'You';

    const riders = [
        { name: myName, dist: totalDistKm, isMe: true },
        ...Object.entries(opponentPositions).map(([n, o]) => ({ name: n, dist: o.distKm, isMe: false }))
    ];
    riders.sort((a, b) => b.dist - a.dist);

    const container = document.getElementById('leaderboard-list');
    const rankClasses = ['gold', 'silver', 'bronze'];
    container.innerHTML = riders.slice(0, 7).map((r, i) => `
        <div class="lb-row ${r.isMe ? 'you' : ''}">
            <span class="lb-rank ${rankClasses[i] || ''}">${i + 1}</span>
            <span class="lb-name">${r.isMe ? '⚡ ' : ''}${r.name}</span>
            <span class="lb-dist">${r.dist.toFixed(2)} km</span>
        </div>
    `).join('');
}

// ─── ARRIVAL ────────────────────────────────────────────
function onArrived() {
    cancelAnimationFrame(animFrame);
    clearInterval(raceTimer);
    isPaused = true;

    const city = CITIES[cityKey];
    const summary = `🏆 You reached ${city.target} in ${formatTime(elapsedSec)}!\n` +
                    `Total distance: ${totalDistKm.toFixed(2)} km\n` +
                    `Average power: ${Math.round(currentWatts)} W`;

    setTimeout(() => alert(summary), 400);
}

// ─── CONTROLS ────────────────────────────────────────────
function toggleSimulator() {
    isSimulating = !isSimulating;
    const btn = document.getElementById('sim-btn');
    const state = document.getElementById('sim-state');
    if (isSimulating) {
        btn.classList.add('active');
        state.textContent = 'ON';
    } else {
        btn.classList.remove('active');
        state.textContent = 'OFF';
        currentWatts = currentCadence = currentHR = 0;
    }
}

function togglePause() {
    isPaused = !isPaused;
    const btn = document.getElementById('pause-btn');
    btn.textContent = isPaused ? '▶ RESUME' : '⏸ PAUSE';
    btn.classList.toggle('active', isPaused);
}

function leaveRace() {
    if (confirm('Leave the race?')) {
        cancelAnimationFrame(animFrame);
        clearInterval(raceTimer);
        location.reload();
    }
}

// ─── BLUETOOTH ──────────────────────────────────────────
async function connectBluetooth() {
    if (!navigator.bluetooth) {
        alert('Web Bluetooth is not supported in this browser.\nUse Chrome on desktop or Android.');
        return;
    }

    const btn = document.getElementById('bt-btn');
    const statusDiv = document.getElementById('bt-status');
    const statusText = document.getElementById('bt-status-text');

    btn.disabled = true;
    statusDiv.classList.remove('hidden');
    statusText.textContent = 'Scanning for Body Bike Smart+…';

    try {
        btDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: false,
            filters: [
                { services: [0x1818] }, // Cycling Power
                { namePrefix: 'Body Bike' }
            ],
            optionalServices: [
                0x1818, // Cycling Power Service
                0x180D, // Heart Rate
                0x1816, // Cycling Speed and Cadence
            ]
        });

        statusText.textContent = `Connecting to ${btDevice.name}…`;
        const server = await btDevice.gatt.connect();

        // ── Cycling Power ──
        try {
            const powerSvc  = await server.getPrimaryService(0x1818);
            const powerChar = await powerSvc.getCharacteristic(0x2A63);
            await powerChar.startNotifications();
            powerChar.addEventListener('characteristicvaluechanged', onPowerData);
        } catch(e) { console.warn('Power service not found', e); }

        // ── Heart Rate ──
        try {
            const hrSvc  = await server.getPrimaryService(0x180D);
            const hrChar = await hrSvc.getCharacteristic(0x2A37);
            await hrChar.startNotifications();
            hrChar.addEventListener('characteristicvaluechanged', onHRData);
        } catch(e) { console.warn('HR service not found', e); }

        // ── Cadence (Cycling Speed & Cadence) ──
        try {
            const cscSvc   = await server.getPrimaryService(0x1816);
            const cscChar  = await cscSvc.getCharacteristic(0x2A5B);
            await cscChar.startNotifications();
            cscChar.addEventListener('characteristicvaluechanged', onCSCData);
        } catch(e) { console.warn('CSC service not found', e); }

        statusText.textContent = `✓ Connected: ${btDevice.name}`;
        statusDiv.querySelector('.status-dot').classList.remove('pulse');
        document.getElementById('bt-icon').textContent = '✅';

        btDevice.addEventListener('gattserverdisconnected', onBTDisconnect);

    } catch (err) {
        statusDiv.classList.add('hidden');
        btn.disabled = false;
        console.error(err);
        if (err.name !== 'NotFoundError') {
            alert('Bluetooth Error: ' + err.message);
        }
    }
}

// Power Measurement characteristic parser (GATT 0x2A63)
function onPowerData(event) {
    const val   = event.target.value;
    const flags = val.getUint16(0, true);
    // Byte 2-3: Instantaneous Power (sint16, Watts)
    currentWatts = Math.max(0, val.getInt16(2, true));

    // If Accumulated Torque present (bit 2), skip — just use Power
    // Cadence from crank revolution data (flags bit 5)
    if (flags & (1 << 5)) {
        // Crank revolution data present at bytes following power
        // (skipping accelerometer data if present)
    }
}

// Heart Rate Measurement parser (GATT 0x2A37)
function onHRData(event) {
    const val   = event.target.value;
    const flags = val.getUint8(0);
    // bit 0: 0=uint8, 1=uint16
    currentHR = (flags & 0x01) ? val.getUint16(1, true) : val.getUint8(1);
}

// CSC parser (GATT 0x2A5B)
let _lastCrankRevs = -1, _lastCrankTime = -1;
function onCSCData(event) {
    const val   = event.target.value;
    const flags = val.getUint8(0);
    if (flags & 0x02) { // Crank Revolution Data Present
        let offset = (flags & 0x01) ? 6 : 1; // skip wheel data if present
        const revs = val.getUint16(offset, true);
        const time = val.getUint16(offset + 2, true); // 1/1024 s resolution
        if (_lastCrankRevs >= 0 && _lastCrankTime >= 0) {
            const deltaRevs = revs - _lastCrankRevs;
            const deltaSec  = (time - _lastCrankTime) / 1024;
            if (deltaSec > 0 && deltaRevs >= 0) {
                currentCadence = Math.round(deltaRevs / deltaSec * 60);
            }
        }
        _lastCrankRevs = revs;
        _lastCrankTime = time;
    }
}

function onBTDisconnect() {
    document.getElementById('bt-status-text').textContent = '⚠ Device disconnected';
    document.getElementById('bt-icon').textContent = '📡';
    document.getElementById('bt-btn').disabled = false;
    currentWatts = currentHR = currentCadence = 0;
}
