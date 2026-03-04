// ============================================================
// useBluetooth — BLE connection hook for Body Bike Smart+
// Connects to Cycling Power (0x1818) and Heart Rate (0x180D)
// Persists device info in localStorage for Quick Reconnect
// ============================================================
import { useState, useRef, useCallback } from 'react';

const LS_KEY = 'dv_bike_device';

export function useBluetooth() {
    const [watts, setWatts] = useState(0);
    const [cadence, setCadence] = useState(0);
    const [hr, setHr] = useState(0);
    const [bikeConnected, setBikeConnected] = useState(false);
    const [hrConnected, setHrConnected] = useState(false);
    const [status, setStatus] = useState('idle'); // idle | connecting | connected | error
    const [statusMsg, setStatusMsg] = useState('');
    const [savedDevice, setSavedDevice] = useState(() => {
        try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
    });

    // Mutable refs for crank data (CSC cadence)
    const lastCrankRevs = useRef(-1);
    const lastCrankTime = useRef(-1);

    // ── Cycling Power Measurement (0x2A63) parser ──
    const onPowerData = useCallback((e) => {
        const v = e.target.value;
        // flags (2 bytes) | Instantaneous Power (sint16 LE, bytes 2-3)
        const flags = v.getUint16(0, true);
        const w = Math.max(0, v.getInt16(2, true));
        setWatts(w);

        // Crank Revolution Data: flag bit 5
        if (flags & (1 << 5)) {
            // offset: bytes 4-5 = cumulative crank revolutions, 6-7 = last crank event time (1/1024s)
            const revs = v.getUint16(4, true);
            const time = v.getUint16(6, true);
            if (lastCrankRevs.current >= 0) {
                const dRevs = revs - lastCrankRevs.current;
                const dTime = (time - lastCrankTime.current) / 1024;
                if (dTime > 0 && dRevs >= 0) {
                    setCadence(Math.round((dRevs / dTime) * 60));
                }
            }
            lastCrankRevs.current = revs;
            lastCrankTime.current = time;
        }
    }, []);

    // ── Heart Rate Measurement (0x2A37) parser ──
    const onHRData = useCallback((e) => {
        const v = e.target.value;
        const flags = v.getUint8(0);
        // bit 0: 0 = UINT8 format, 1 = UINT16 format
        const bpm = (flags & 0x01) ? v.getUint16(1, true) : v.getUint8(1);
        setHr(bpm);
    }, []);

    const connectBike = useCallback(async (forcedDeviceId = null) => {
        if (!navigator.bluetooth) {
            setStatus('error');
            setStatusMsg('Web Bluetooth not supported. Use Chrome on desktop/Android.');
            return;
        }
        setStatus('connecting');
        setStatusMsg('Scanning for Body Bike Smart+…');
        try {
            const filters = forcedDeviceId
                ? [{ deviceId: forcedDeviceId }]
                : [{ services: [0x1818] }, { namePrefix: 'Body Bike' }];

            const device = await navigator.bluetooth.requestDevice({
                filters,
                optionalServices: [0x1818, 0x180D],
            });

            setStatusMsg(`Connecting to ${device.name}…`);
            const server = await device.gatt.connect();

            try {
                const svc = await server.getPrimaryService(0x1818);
                const char = await svc.getCharacteristic(0x2A63);
                await char.startNotifications();
                char.addEventListener('characteristicvaluechanged', onPowerData);
                setBikeConnected(true);
            } catch (e) { console.warn('[BT] Power service unavailable', e); }

            try {
                const svc = await server.getPrimaryService(0x180D);
                const char = await svc.getCharacteristic(0x2A37);
                await char.startNotifications();
                char.addEventListener('characteristicvaluechanged', onHRData);
                setHrConnected(true);
            } catch (e) { console.warn('[BT] HR service unavailable', e); }

            // Persist for Quick Reconnect
            const info = { id: device.id, name: device.name };
            localStorage.setItem(LS_KEY, JSON.stringify(info));
            setSavedDevice(info);

            setStatus('connected');
            setStatusMsg(`✓ ${device.name}`);

            device.addEventListener('gattserverdisconnected', () => {
                setBikeConnected(false);
                setHrConnected(false);
                setWatts(0); setCadence(0); setHr(0);
                setStatus('idle');
                setStatusMsg('Device disconnected');
            });

        } catch (err) {
            if (err.name !== 'NotFoundError') {
                setStatus('error');
                setStatusMsg(err.message);
            } else {
                setStatus('idle');
                setStatusMsg('');
            }
        }
    }, [onPowerData, onHRData]);

    const quickReconnect = useCallback(() => {
        if (savedDevice?.id) connectBike(savedDevice.id);
        else connectBike();
    }, [savedDevice, connectBike]);

    const clearSavedDevice = useCallback(() => {
        localStorage.removeItem(LS_KEY);
        setSavedDevice(null);
    }, []);

    return {
        watts, cadence, hr,
        bikeConnected, hrConnected,
        status, statusMsg,
        savedDevice,
        connectBike, quickReconnect, clearSavedDevice,
    };
}
