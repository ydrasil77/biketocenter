// src/utils/mountains.js

export const MOUNTAINS = {
    alpe_dhuez: {
        id: 'alpe_dhuez',
        name: "Alpe d'Huez",
        country: "France",
        totalDistKm: 13.8,
        segments: [
            { endKm: 1.0, grade: 0.104 },
            { endKm: 2.0, grade: 0.098 },
            { endKm: 3.0, grade: 0.090 },
            { endKm: 4.0, grade: 0.110 },
            { endKm: 5.0, grade: 0.086 },
            { endKm: 6.0, grade: 0.080 },
            { endKm: 7.0, grade: 0.090 },
            { endKm: 8.0, grade: 0.088 },
            { endKm: 9.0, grade: 0.075 },
            { endKm: 10.0, grade: 0.095 },
            { endKm: 11.0, grade: 0.086 },
            { endKm: 12.0, grade: 0.082 },
            { endKm: 13.0, grade: 0.060 },
            { endKm: 13.8, grade: 0.050 },
        ]
    },
    mont_ventoux: {
        id: 'mont_ventoux',
        name: "Mont Ventoux (Bédoin)",
        country: "France",
        totalDistKm: 21.0,
        segments: [
            // Simplified 21km profile
            { endKm: 5.0, grade: 0.045 },
            { endKm: 6.0, grade: 0.080 },
            { endKm: 7.0, grade: 0.090 },
            { endKm: 10.0, grade: 0.095 },
            { endKm: 15.0, grade: 0.090 },
            { endKm: 18.0, grade: 0.075 },
            { endKm: 21.0, grade: 0.080 },
        ]
    },
    stelvio_pass: {
        id: 'stelvio_pass',
        name: "Stelvio Pass (Prato)",
        country: "Italy",
        totalDistKm: 24.3,
        segments: [
            { endKm: 8.0, grade: 0.055 },
            { endKm: 15.0, grade: 0.080 },
            { endKm: 20.0, grade: 0.090 },
            { endKm: 24.3, grade: 0.085 },
        ]
    }
};

/**
 * Get the current grade based on distance traveled.
 * @param {string} mountainId - key in MOUNTAINS
 * @param {number} currentDistKm - distance ridden in km
 * @returns {number} grade (decimal, e.g., 0.08 for 8%)
 */
export function getMountainGrade(mountainId, currentDistKm) {
    if (!mountainId || !MOUNTAINS[mountainId]) return 0;
    const mt = MOUNTAINS[mountainId];
    if (currentDistKm >= mt.totalDistKm) return 0;

    for (const seg of mt.segments) {
        if (currentDistKm <= seg.endKm) {
            return seg.grade;
        }
    }
    return 0; // fallback
}
