import { locations } from './airports.js';

const EARTH_NM = 3440.065;
const toRad = deg => deg * Math.PI / 180;
const NAME_SEARCH_RADIUS_NM = {
  airport: 55,
  pass: 40,
  gorge: 35,
  airstrip: 35,
  town: 60,
  valley: 60,
  lake: 55,
  landmark: 70
};

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

function nearestByType(point, predicate, maxDistanceNm = Infinity) {
  const candidates = locations
    .filter(predicate)
    .map(item => ({ item, distance: distanceNm(point, item) }))
    .filter(entry => entry.distance <= maxDistanceNm)
    .sort((a, b) => a.distance - b.distance);
  return candidates[0]?.item || null;
}

function isAirport(item) {
  return item?.type === 'airport';
}

function isMountainPass(item) {
  return item?.type === 'pass';
}

function isGorge(item) {
  return item?.type === 'gorge';
}

function isAirstrip(item) {
  return item?.type === 'airstrip';
}

function isTown(item) {
  return item?.type === 'town';
}

function isLake(item) {
  return item?.type === 'lake';
}

function isValley(item) {
  return item?.type === 'valley';
}

function isLandmark(item) {
  return item?.type === 'landmark';
}

function chooseReferenceName(mathematicalPoint, previousPoint, nextPoint) {
  const nearestAirport = nearestByType(mathematicalPoint, isAirport, NAME_SEARCH_RADIUS_NM.airport);
  if (nearestAirport) return nearestAirport.name;

  const nearestPass = nearestByType(mathematicalPoint, isMountainPass, NAME_SEARCH_RADIUS_NM.pass);
  if (nearestPass) return nearestPass.name;

  const nearestGorge = nearestByType(mathematicalPoint, isGorge, NAME_SEARCH_RADIUS_NM.gorge);
  if (nearestGorge) return nearestGorge.name;

  const nearestAirstrip = nearestByType(mathematicalPoint, isAirstrip, NAME_SEARCH_RADIUS_NM.airstrip);
  if (nearestAirstrip) return nearestAirstrip.name;

  const nearestTown = nearestByType(mathematicalPoint, isTown, NAME_SEARCH_RADIUS_NM.town);
  if (nearestTown) return nearestTown.name;

  const nearestValley = nearestByType(mathematicalPoint, isValley, NAME_SEARCH_RADIUS_NM.valley);
  if (nearestValley) return nearestValley.name;

  const nearestLake = nearestByType(mathematicalPoint, isLake, NAME_SEARCH_RADIUS_NM.lake);
  if (nearestLake) return nearestLake.name;

  const nearestLandmark = nearestByType(mathematicalPoint, isLandmark, NAME_SEARCH_RADIUS_NM.landmark);
  if (nearestLandmark) return nearestLandmark.name;

  return `Between ${previousPoint.name} and ${nextPoint.name}`;
}

export function buildRouteReferences(userPoints, targetSpacingNm = 50) {
  const result = [];

  const pushUnique = point => {
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
      const displayName = chooseReferenceName(mathematicalPoint, start, end);
      pushUnique({
        code: `REF${index + 1}-${i}`,
        name: displayName,
        type: 'enroute',
        lat: mathematicalPoint.lat,
        lon: mathematicalPoint.lon,
        elevationFt: null,
        automatic: true
      });
    }

    pushUnique({ ...end, userEntered: true });
  });

  return result;
}

export function routeDistanceNm(points) {
  return points.slice(1).reduce((sum, point, index) => sum + distanceNm(points[index], point), 0);
}
