// ============================================================
// GPX BUILDER
// Converts recorded GPS + sensor data into Strava-compatible GPX
// ============================================================

/**
 * Build a GPX 1.1 XML string from an array of track points.
 *
 * @param {Array<{
 *   lat: number,
 *   lng: number,
 *   timestamp: number,  // Unix ms
 *   watts: number,
 *   hr: number,
 *   cadence: number,
 * }>} points
 * @param {string} activityName
 * @returns {string} GPX XML string
 */
export function buildGPX(points, activityName = 'Dark Velocity Virtual Ride') {
    const trkpts = points
        .map(({ lat, lng, timestamp, watts, hr, cadence }) => {
            const iso = new Date(timestamp).toISOString();
            const power = watts > 0 ? `<gpxtpx:PowerInWatts>${Math.round(watts)}</gpxtpx:PowerInWatts>` : '';
            const hrExt = hr > 0 ? `<gpxtpx:hr>${Math.round(hr)}</gpxtpx:hr>` : '';
            const cadExt = cadence > 0 ? `<gpxtpx:cad>${Math.round(cadence)}</gpxtpx:cad>` : '';
            const hasExt = power || hrExt || cadExt;
            return `    <trkpt lat="${lat.toFixed(7)}" lon="${lng.toFixed(7)}">
      <time>${iso}</time>${hasExt ? `
      <extensions>
        <gpxtpx:TrackPointExtension>
          ${hrExt}${cadExt}${power}
        </gpxtpx:TrackPointExtension>
      </extensions>` : ''}
    </trkpt>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
     version="1.1"
     creator="Dark Velocity">
  <metadata>
    <name>${escapeXml(activityName)}</name>
    <time>${new Date(points[0]?.timestamp ?? Date.now()).toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(activityName)}</name>
    <type>virtualride</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Trigger a browser download of the GPX file.
 */
export function downloadGPX(gpxString, filename = 'dark-velocity-ride.gpx') {
    const blob = new Blob([gpxString], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
