// ============================================================
// PHYSICS ENGINE
// Virtual speed calculation from real-world power data
// ============================================================

// Training zone boundaries as fraction of FTP
export const ZONES = [
    { id: 'Z0', name: 'REST', maxFtp: 0.55, color: '#6b7280' },
    { id: 'Z1', name: 'ACTIVE RECOVERY', maxFtp: 0.65, color: '#22d3ee' },
    { id: 'Z2', name: 'ENDURANCE', maxFtp: 0.75, color: '#22c55e' },
    { id: 'Z3', name: 'TEMPO', maxFtp: 0.87, color: '#facc15' },
    { id: 'Z4', name: 'THRESHOLD', maxFtp: 1.00, color: '#f97316' },
    { id: 'Z5', name: 'VO₂ MAX', maxFtp: 1.15, color: '#ef4444' },
    { id: 'Z6', name: 'ANAEROBIC', maxFtp: Infinity, color: '#a855f7' },
];

/**
 * Calculate virtual speed (km/h) using Newton-iteration drag model.
 *
 * Power balance: P = (Fdrag + Froll + Fgravity) × v
 *   Fdrag = 0.5 × CdA × ρ × v²
 *   Froll = Crr × m × g
 *   Fgravity = m × g × sin(arctan(grade))
 *
 * @param {number} watts - measured power (W)
 * @param {number} weightKg - rider weight (kg)
 * @param {'male'|'female'} gender
 * @param {'GREEN'|'RED'} trafficState
 * @param {number} grade - slope grade as a decimal (e.g. 0.05 for 5% incline)
 * @returns {number} speed in km/h
 */
export function calcSpeed(watts, weightKg, gender, trafficState, grade = 0) {
    if (trafficState === 'RED') return 0;

    const genderMult = gender === 'female' ? 1.15 : 1.0;
    const P = watts * genderMult;

    const CdA = 0.405;   // Drag coefficient × frontal area (m²)
    const rho = 1.225;   // Air density (kg/m³)
    const Crr = 0.004;   // Rolling resistance coefficient
    const g = 9.81;      // Gravity (m/s²)
    const m = weightKg + 9; // Rider + bike mass (kg)

    const Fgravity = m * g * Math.sin(Math.atan(grade));

    // If rider is pedaling 0W on a flat/uphill, they stop.
    // If downhill, they might coast.
    if (P <= 0 && Fgravity >= 0) return 0;

    // Newton-Raphson iteration: f(v) = P(v) - P_input = 0
    let v = 8; // initial guess (m/s)
    for (let i = 0; i < 50; i++) {
        const Fdrag = 0.5 * CdA * rho * v * v;
        const Froll = Crr * m * g;

        const Ftotal = Fdrag + Froll + Fgravity;
        const Pv = Ftotal * v;
        const dPdv = 1.5 * CdA * rho * v * v + Froll + Fgravity;

        // Prevent division by zero/negatives leading to divergence on extreme downhills
        if (Math.abs(dPdv) < 0.01) break;

        const dv = (Pv - P) / dPdv;
        v -= dv;

        if (v < 0) { v = 0; break; }
        if (Math.abs(dv) < 1e-6) break;
    }

    return v * 3.6; // m/s → km/h
}

/**
 * Return the training zone for a given power output.
 * @param {number} watts
 * @param {number} ftp
 * @returns {{ id, name, color, pctFtp }}
 */
export function getZone(watts, ftp) {
    if (!ftp || ftp <= 0 || watts <= 0) return { ...ZONES[0], pctFtp: 0 };
    const pct = watts / ftp;
    const zone = ZONES.find(z => pct <= z.maxFtp) ?? ZONES[ZONES.length - 1];
    return { ...zone, pctFtp: pct };
}

/**
 * Estimate calories burned (approximate):
 * kcal ≈ watts × hours × 3.6 / 0.24 (assuming ~24% metabolic efficiency)
 */
export function calcCalories(watts, elapsedSec) {
    return (watts * (elapsedSec / 3600) * 3.6) / 0.24 / 1000;
}
