// ============================================================
// CITIES CONFIG & START POSITION MATH
// ============================================================

export const CITIES = {
    copenhagen: {
        center: [55.6926, 12.5992],
        name: 'Copenhagen',
        target: 'The Little Mermaid',
        zoom: 14,
    },
    london: {
        center: [51.5007, -0.1246],
        name: 'London',
        target: 'Big Ben',
        zoom: 14,
    },
    singapore: {
        center: [1.2815, 103.8636],
        name: 'Singapore',
        target: 'Marina Bay Sands',
        zoom: 14,
    },
    paris: {
        center: [48.8584, 2.2945],
        name: 'Paris',
        target: 'Eiffel Tower',
        zoom: 14,
    },
    tokyo: {
        center: [35.6586, 139.7454],
        name: 'Tokyo',
        target: 'Tokyo Tower',
        zoom: 14,
    },
};

/**
 * Calculate evenly distributed start positions around a center point.
 * lat  = center.lat + R * cos(2π * i / N) / 111.32
 * lng  = center.lng + R * sin(2π * i / N) / (111.32 * cos(lat_rad))
 *
 * @param {[number,number]} center - [lat, lng]
 * @param {number} n - number of players
 * @param {number} radiusKm - radius in km (default 2km)
 * @returns {Array<[number, number]>} array of [lat, lng] start positions
 */
export function calcStartPositions(center, n, radiusKm = 2.0) {
    const [clat, clng] = center;
    const latDeg = radiusKm / 111.32;
    const lngDeg = radiusKm / (111.32 * Math.cos((clat * Math.PI) / 180));

    return Array.from({ length: n }, (_, i) => {
        const angle = (2 * Math.PI * i) / n;
        return [clat + latDeg * Math.cos(angle), clng + lngDeg * Math.sin(angle)];
    });
}

/**
 * Haversine distance between two [lat,lng] pairs in km
 */
export function haversine([lat1, lon1], [lat2, lon2]) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
