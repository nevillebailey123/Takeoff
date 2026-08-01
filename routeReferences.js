import { locations } from './airports.js';

const EARTH_NM = 3440.065;
const toRad = deg => deg * Math.PI / 180;

export function distanceNm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function interpolate(a, b, fraction) {
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lon: a.lon + (b.lon - a.lon) * fraction
  };
}

function nearestNamedLocation(point, usedNames, maxDistanceNm = 35) {
  const candidates = locations
    .filter(item => !usedNames.has(item.name.toUpperCase()))
    .map(item => ({ item, distance: distanceNm(point, item) }))
    .filter(entry => entry.distance <= maxDistanceNm)
    .sort((a, b) => a.distance - b.distance);
  return candidates[0]?.item || null;
}

export function buildRouteReferences(userPoints, targetSpacingNm = 50) {
  const result = [];
  const usedNames = new Set();

  const pushUnique = point => {
    const name = point.name.toUpperCase();
    if (usedNames.has(name)) return;
    usedNames.add(name);
    result.push(point);
  };

  userPoints.forEach((start, index) => {
    if (index === 0) pushUnique({ ...start, userEntered: true });
    const end = userPoints[index + 1];
    if (!end) return;

    const legDistance = distanceNm(start, end);
    const intervals = Math.max(1, Math.ceil(legDistance / targetSpacingNm));

    for (let i = 1; i < intervals; i += 1) {
      const mathematicalPoint = interpolate(start, end, i / intervals);
      const named = nearestNamedLocation(mathematicalPoint, usedNames, 40);
      if (named) {
        pushUnique({ ...named, automatic: true });
      } else {
        pushUnique({
          code: `ENR${index + 1}-${i}`,
          name: `Enroute ${result.length}`,
          type: 'enroute',
          lat: mathematicalPoint.lat,
          lon: mathematicalPoint.lon,
          elevationFt: null,
          automatic: true
        });
      }
    }

    pushUnique({ ...end, userEntered: true });
  });

  return result;
}

export function routeDistanceNm(points) {
  return points.slice(1).reduce((sum, point, index) => sum + distanceNm(points[index], point), 0);
}
