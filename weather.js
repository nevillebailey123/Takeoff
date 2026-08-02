import { locations } from './airports.js';
import { buildMetarUrl, buildTafUrl, normalizeMetar, normalizeTaf } from './providerAdapter.js';

const API = 'https://api.open-meteo.com/v1/forecast';
const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700];
const HOURLY_FIELDS = [
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'temperature_2m',
  'dew_point_2m',
  'visibility',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  ...PRESSURE_LEVELS.flatMap(level => [
    `relative_humidity_${level}hPa`,
    `cloud_cover_${level}hPa`,
    `geopotential_height_${level}hPa`
  ])
].join(',');
const NEARBY_THRESHOLD_NM = 3;
const MAX_COORDS_PER_BATCH = 40;
const REPORTING_AIRPORT_THRESHOLD_NM = 25;
const AIRPORT_REPORT_LOOKUPS_ENABLED = true;
const LOW_LEVEL_MAX_METERS = 3000;
const FT_PER_METER = 3.28084;
const MOIST_WEATHER_CODES = new Set([45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86]);

function nearestIndex(times, targetIso) {
  const target = new Date(targetIso).getTime();
  let best = 0;
  let bestDelta = Infinity;
  times.forEach((time, index) => {
    const delta = Math.abs(new Date(time).getTime() - target);
    if (delta < bestDelta) { best = index; bestDelta = delta; }
  });
  return best;
}

function estimateCloudBaseFt(tempC, dewC) {
  if (!Number.isFinite(tempC) || !Number.isFinite(dewC)) return null;
  const lclFt = Math.max(0, (tempC - dewC) * 400);
  return Math.min(Math.max(lclFt, 0), 20000);
}

function percentOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

function metersToFeet(value) {
  return Number.isFinite(value) ? value * FT_PER_METER : null;
}

function interpolateHeightFt(lowerLevel, upperLevel, threshold, key) {
  if (!lowerLevel || !upperLevel) return null;
  const lowerValue = Number(lowerLevel[key]);
  const upperValue = Number(upperLevel[key]);
  const lowerHeight = Number(lowerLevel.heightFt);
  const upperHeight = Number(upperLevel.heightFt);
  if (![lowerValue, upperValue, lowerHeight, upperHeight].every(Number.isFinite)) return null;
  if (upperValue === lowerValue) return upperHeight;
  const ratio = (threshold - lowerValue) / (upperValue - lowerValue);
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return lowerHeight + (upperHeight - lowerHeight) * clampedRatio;
}

function normalizeWeatherCode(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function weatherCodeSuggestsMoisture(code) {
  return MOIST_WEATHER_CODES.has(normalizeWeatherCode(code));
}

function buildPressureLevels(sample) {
  return PRESSURE_LEVELS.map(level => {
    const heightMeters = Number(sample[`geopotential_height_${level}hPa`]);
    return {
      pressureHpa: level,
      heightMeters: Number.isFinite(heightMeters) ? heightMeters : null,
      heightFt: metersToFeet(Number.isFinite(heightMeters) ? heightMeters : null),
      relativeHumidityPercent: percentOrNull(sample[`relative_humidity_${level}hPa`]),
      cloudCoverPercent: percentOrNull(sample[`cloud_cover_${level}hPa`])
    };
  }).filter(level => Number.isFinite(level.heightMeters));
}

function adjacentHumiditySupportsLayer(levels, index) {
  const current = levels[index];
  if (!current || !Number.isFinite(current.relativeHumidityPercent)) return false;
  const neighbors = [levels[index - 1], levels[index + 1]].filter(Boolean);
  return neighbors.some(level => Number.isFinite(level.relativeHumidityPercent) && level.relativeHumidityPercent >= 85);
}

function estimateLayerHeightFt(levels, index, metricKey, threshold) {
  const current = levels[index];
  if (!current || !Number.isFinite(current.heightFt)) return null;
  const lower = levels[index - 1];
  if (!lower) return current.heightFt;

  const lowerValue = Number(lower[metricKey]);
  const currentValue = Number(current[metricKey]);
  if (!Number.isFinite(lowerValue) || !Number.isFinite(currentValue)) return current.heightFt;
  if (lowerValue >= threshold) return lower.heightFt;
  if (currentValue < threshold) return current.heightFt;

  const interpolated = interpolateHeightFt(lower, current, threshold, metricKey);
  return Number.isFinite(interpolated) ? interpolated : current.heightFt;
}

function classifyModelCloud(sample) {
  const cloudCoverLowPercent = percentOrNull(sample.cloudCoverLowPercent);
  const pressureLevels = buildPressureLevels(sample);
  const lowLevelPressureLevels = pressureLevels.filter(level => level.heightMeters <= LOW_LEVEL_MAX_METERS);
  const pressureCloudLevelExists = lowLevelPressureLevels.some(level => Number.isFinite(level.cloudCoverPercent) && level.cloudCoverPercent >= 50);
  const pressureHumidityLayerExists = lowLevelPressureLevels.some((level, index) => {
    if (!Number.isFinite(level.relativeHumidityPercent) || level.relativeHumidityPercent < 90) return false;
    return adjacentHumiditySupportsLayer(lowLevelPressureLevels, index);
  });
  const lowLevelMoistureExists = lowLevelPressureLevels.some(level => {
    return Number.isFinite(level.relativeHumidityPercent) && level.relativeHumidityPercent >= 85;
  });
  const weatherSupportsCloud = weatherCodeSuggestsMoisture(sample.weatherCode) && (lowLevelMoistureExists || (Number.isFinite(cloudCoverLowPercent) && cloudCoverLowPercent >= 20));
  const significantLowCloudLikely = (Number.isFinite(cloudCoverLowPercent) && cloudCoverLowPercent >= 50) || pressureCloudLevelExists || pressureHumidityLayerExists || weatherSupportsCloud;
  const nilConditions = Number.isFinite(cloudCoverLowPercent) && cloudCoverLowPercent < 20 && !pressureCloudLevelExists && !pressureHumidityLayerExists && !weatherSupportsCloud;

  if (nilConditions) {
    return {
      cloudBaseAmslFt: null,
      cloudBaseAglFt: null,
      cloudState: 'nil',
      cloudMethod: 'nil',
      cloudStatusFt: null,
      cloudIsVerticalVisibility: false,
      cloudDisplay: 'NIL',
      cloudRawLayers: [],
      cloudSelectedLayer: null
    };
  }

  let selectedLevel = null;
  let cloudMethod = null;
  let cloudBaseAmslFt = null;

  for (let index = 0; index < lowLevelPressureLevels.length; index += 1) {
    const level = lowLevelPressureLevels[index];
    const cloudCover = Number(level.cloudCoverPercent);
    const relativeHumidity = Number(level.relativeHumidityPercent);

    if (Number.isFinite(cloudCover) && cloudCover >= 50) {
      selectedLevel = level;
      cloudMethod = 'pressure-cloud';
      cloudBaseAmslFt = estimateLayerHeightFt(lowLevelPressureLevels, index, 'cloudCoverPercent', 50);
      break;
    }

    if (Number.isFinite(relativeHumidity) && relativeHumidity >= 90 && adjacentHumiditySupportsLayer(lowLevelPressureLevels, index)) {
      selectedLevel = level;
      cloudMethod = 'pressure-humidity';
      cloudBaseAmslFt = estimateLayerHeightFt(lowLevelPressureLevels, index, 'relativeHumidityPercent', 90);
      break;
    }
  }

  if (!Number.isFinite(cloudBaseAmslFt) && significantLowCloudLikely) {
    const lclAmslFt = estimateCloudBaseFt(sample.temperature2mC, sample.dewPoint2mC);
    if (Number.isFinite(lclAmslFt)) {
      const terrainFloorFt = Number.isFinite(sample.terrainElevationFt) ? sample.terrainElevationFt : 0;
      cloudBaseAmslFt = Math.max(terrainFloorFt, Math.min(lclAmslFt, 20000));
      cloudMethod = 'lcl-fallback';
    }
  }

  if (!Number.isFinite(cloudBaseAmslFt)) {
    return {
      cloudBaseAmslFt: null,
      cloudBaseAglFt: null,
      cloudState: 'unknown',
      cloudMethod: null,
      cloudStatusFt: null,
      cloudIsVerticalVisibility: false,
      cloudDisplay: '—',
      cloudRawLayers: [],
      cloudSelectedLayer: selectedLevel,
      cloudCoverLowPercent,
      cloudCoverMidPercent: percentOrNull(sample.cloudCoverMidPercent),
      cloudCoverHighPercent: percentOrNull(sample.cloudCoverHighPercent)
    };
  }

  const roundedCloudBaseAmslFt = Math.round(cloudBaseAmslFt / 100) * 100;

  return {
    cloudBaseAmslFt: roundedCloudBaseAmslFt,
    cloudBaseAglFt: null,
    cloudState: 'numeric',
    cloudMethod,
    cloudStatusFt: roundedCloudBaseAmslFt,
    cloudIsVerticalVisibility: false,
    cloudDisplay: `${roundedCloudBaseAmslFt} ft`,
    cloudRawLayers: [],
    cloudSelectedLayer: selectedLevel,
    cloudCoverLowPercent,
    cloudCoverMidPercent: percentOrNull(sample.cloudCoverMidPercent),
    cloudCoverHighPercent: percentOrNull(sample.cloudCoverHighPercent)
  };
}

function visibilityKm(valueM) {
  return Number.isFinite(valueM) ? valueM / 1000 : null;
}

function roundHundred(value) {
  return Number.isFinite(value) ? Math.round(value / 100) * 100 : null;
}

function formatWindText(direction, speed, gust) {
  if (!Number.isFinite(speed)) return '—';
  const directionText = direction === 'VRB'
    ? 'VRB'
    : Number.isFinite(direction)
      ? String(Math.round(direction)).padStart(3, '0')
      : '—';
  return `${directionText}/${Math.round(speed)}${Number.isFinite(gust) ? ` G${Math.round(gust)}` : ''}`;
}

function parseCloudLayerToken(token) {
  const match = String(token || '').trim().toUpperCase().match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/);
  if (!match) return null;
  return {
    cover: match[1],
    baseHundredsFt: Number(match[2]),
    token: `${match[1]}${match[2]}${match[3] || ''}`
  };
}

function cloudStateFromLayers(layers, { rawText = '' } = {}) {
  const list = Array.isArray(layers) ? layers : [];
  const rawLayers = list
    .map(layer => {
      const cover = String(layer?.cover || '').trim().toUpperCase();
      const base = Number(layer?.base);
      if (!cover) return null;
      if (cover === 'CAVOK') return 'CAVOK';
      if (!Number.isFinite(base)) return cover;
      return `${cover}${Math.round(base)}`;
    })
    .filter(Boolean);

  const specialText = String(rawText || '').toUpperCase();
  if (specialText.includes('CAVOK') || rawLayers.includes('CAVOK')) {
    return { display: 'CAVOK', lowestAglFt: null, rawLayers, selectedLayer: null };
  }

  const selectedLayers = list
    .map(layer => ({
      cover: String(layer?.cover || '').trim().toUpperCase(),
      baseFt: Number(layer?.base)
    }))
    .filter(layer => ['BKN', 'OVC', 'VV'].includes(layer.cover) && Number.isFinite(layer.baseFt));

  if (selectedLayers.length) {
    const selectedLayer = selectedLayers.sort((a, b) => a.baseFt - b.baseFt)[0];
    const display = selectedLayer.cover === 'VV'
      ? 'VV'
      : rawLayers.length
        ? rawLayers.join(' ')
        : `${selectedLayer.cover}${selectedLayer.baseFt}`;
    return {
      display,
      lowestAglFt: selectedLayer.baseFt,
      rawLayers,
      selectedLayer
    };
  }

  if (specialText.includes('NCD') || specialText.includes('NSC') || specialText.includes('CLR') || specialText.includes('SKC')) {
    return { display: 'NSC', lowestAglFt: null, rawLayers, selectedLayer: null };
  }

  if (rawLayers.length) {
    return { display: 'NSC', lowestAglFt: null, rawLayers, selectedLayer: null };
  }

  return { display: 'NIL', lowestAglFt: null, rawLayers: [], selectedLayer: null };
}

function isAirportReference(point) {
  return point.type === 'airport' && !point.automatic && /^[A-Z]{4}$/.test(String(point.code || '').toUpperCase());
}

function isIcaoAirport(point) {
  return point?.type === 'airport' && /^[A-Z]{4}$/.test(String(point.code || '').toUpperCase());
}

function isEligibleReportingAirport(point) {
  return isIcaoAirport(point) && (point?.hasMetar === true || point?.hasTaf === true);
}

function parseWindToken(raw) {
  const token = String(raw || '').split(/\s+/).find(part => /^(\d{3}|VRB)\d{2,3}(G\d{2,3})?KT$/.test(part));
  if (!token) return { windKt: null, windDirection: null, gustKt: null, text: '—' };
  const match = token.match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT$/);
  if (!match) return { windKt: null, windDirection: null, gustKt: null, text: '—' };
  const direction = match[1] === 'VRB' ? 'VRB' : Number(match[1]);
  const speed = Number(match[2]);
  const gust = Number(match[4]);
  return {
    windKt: Number.isFinite(speed) ? speed : null,
    windDirection: direction,
    gustKt: Number.isFinite(gust) ? gust : null,
    text: `${match[1]}/${match[2]}${match[4] ? ` G${match[4]}` : ''}`
  };
}

function parseCloudInfo(report) {
  return cloudStateFromLayers(report?.clouds, { rawText: report?.rawOb || '' });
}

function parseTafCloudInfo(clouds, rawText = '') {
  return cloudStateFromLayers(clouds, { rawText });
}

function buildAirportCloudState(cloudState, terrainElevationFt) {
  const hasOperationalLayer = Number.isFinite(cloudState.lowestAglFt);
  if (!hasOperationalLayer) {
    return {
      cloudDisplay: cloudState.display,
      cloudBaseAglFt: null,
      cloudBaseAmslFt: null,
      cloudStatusFt: null,
      cloudIsVerticalVisibility: false,
      cloudRawLayers: cloudState.rawLayers,
      cloudSelectedLayer: cloudState.selectedLayer
    };
  }

  const cloudBaseAglFt = cloudState.lowestAglFt;
  const cloudBaseAmslFt = Number.isFinite(terrainElevationFt) ? cloudBaseAglFt + terrainElevationFt : null;
  const amslText = Number.isFinite(cloudBaseAmslFt) ? Math.round(cloudBaseAmslFt) : '—';
  const aglText = Math.round(cloudBaseAglFt);

  return {
    cloudDisplay: Number.isFinite(cloudBaseAmslFt) ? `${amslText} (${aglText})` : `${aglText}`,
    cloudBaseAglFt,
    cloudBaseAmslFt,
    cloudStatusFt: cloudBaseAglFt,
    cloudIsVerticalVisibility: cloudState.selectedLayer?.cover === 'VV',
    cloudRawLayers: cloudState.rawLayers,
    cloudSelectedLayer: cloudState.selectedLayer
  };
}

function cloudStatus(sample) {
  const cloudState = String(sample?.cloudState || '').trim().toLowerCase();
  if (cloudState === 'nil') return 'good';
  if (cloudState === 'unknown') return 'unknown';

  const text = String(sample?.cloudDisplay || '').trim().toUpperCase();
  if (['CAVOK', 'NSC', 'NIL'].includes(text)) return 'good';

  const cloudBaseFt = Number.isFinite(sample?.cloudStatusFt) ? sample.cloudStatusFt : null;
  if (!Number.isFinite(cloudBaseFt)) return null;
  if (cloudBaseFt > 3000) return 'good';
  if (cloudBaseFt >= 1500) return 'review';
  if (cloudBaseFt >= 700) return 'caution';
  return 'poor';
}

function visibilityStatus(sample) {
  if (sample?.cavokReported) return 'good';
  const visibilityKm = Number.isFinite(sample?.visibilityKm) ? sample.visibilityKm : null;
  if (!Number.isFinite(visibilityKm)) return null;
  if (visibilityKm > 20) return 'good';
  if (visibilityKm >= 10) return 'review';
  if (visibilityKm >= 5) return 'caution';
  return 'poor';
}

function parseVisibilityKm(raw, fallbackVisib) {
  const tokens = String(raw || '').split(/\s+/);
  if (tokens.includes('CAVOK')) return { km: 10, text: '≥10 KM' };

  const metric = tokens.find(token => /^\d{4}$/.test(token));
  if (metric) {
    if (metric === '9999') return { km: 10, text: '9999' };
    const km = Number(metric) / 1000;
    return { km, text: metric };
  }

  const statute = tokens.find(token => /^\d+(?:\/\d+)?SM$/.test(token));
  if (statute) {
    const value = statute.replace('SM', '');
    const [whole, frac] = value.split('/').map(Number);
    const miles = Number.isFinite(frac) && frac > 0 ? whole / frac : Number(whole);
    return { km: miles * 1.60934, text: statute };
  }

  const fallback = String(fallbackVisib || '').trim().toUpperCase();
  if (fallback) {
    if (/^\d+\+$/.test(fallback)) {
      const miles = Number(fallback.replace('+', ''));
      if (Number.isFinite(miles)) return { km: miles * 1.60934, text: fallbackVisib };
    }
    const statuteMatch = fallback.match(/^(?:P|M)?(\d+(?:\/\d+)?(?:\s+\d+\/\d+)?)SM$/);
    if (statuteMatch) {
      const parts = statuteMatch[1].trim().split(/\s+/);
      let miles = 0;
      parts.forEach(part => {
        if (part.includes('/')) {
          const [whole, frac] = part.split('/').map(Number);
          if (Number.isFinite(whole) && Number.isFinite(frac) && frac > 0) miles += whole / frac;
        } else {
          const whole = Number(part);
          if (Number.isFinite(whole)) miles += whole;
        }
      });
      if (miles > 0) return { km: miles * 1.60934, text: fallbackVisib };
    }
    const n = Number(fallback.replace('+', ''));
    if (Number.isFinite(n)) return { km: n * 1.60934, text: fallbackVisib };
  }

  return { km: null, text: '—' };
}

function parseMetarTime(raw, reportTime) {
  const token = String(raw || '').split(/\s+/).find(part => /^\d{6}Z$/.test(part));
  if (token) return token;
  if (!reportTime) return '—';
  const iso = new Date(reportTime);
  if (Number.isNaN(iso.getTime())) return '—';
  const day = String(iso.getUTCDate()).padStart(2, '0');
  const hour = String(iso.getUTCHours()).padStart(2, '0');
  const minute = String(iso.getUTCMinutes()).padStart(2, '0');
  return `${day}${hour}${minute}Z`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

function distanceNm(a, b) {
  const EARTH_NM = 3440.065;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function fetchJsonWithRetry(url, cache) {
  const cached = cache.get(url);
  if (cached) return cached;

  const promise = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(url);
      if (response.ok) return response.json();

      if (response.status === 429) {
        if (attempt === 0) {
          await delay(800);
          continue;
        }
        throw new Error('Weather service is busy right now. Please wait a moment and try again.');
      }

      throw new Error(`Weather request failed (HTTP ${response.status}).`);
    }

    throw new Error('Weather service is busy right now. Please wait a moment and try again.');
  })();

  cache.set(url, promise);
  return promise;
}

async function fetchMetars(icaoCodes) {
  if (!icaoCodes.length) return new Map();
  const url = buildMetarUrl(icaoCodes);
  try {
    const response = await fetch(url);
    if (!response.ok) return new Map();
    const rawText = await response.text();
    return normalizeMetar({ bulkText: rawText });
  } catch {
    // METAR is an enhancement; continue with model fallback.
    return new Map();
  }
}

async function fetchTafs(icaoCodes) {
  if (!icaoCodes.length) return new Map();
  const url = buildTafUrl(icaoCodes);
  try {
    const response = await fetch(url);
    if (!response.ok) return new Map();
    const rawText = await response.text();
    return normalizeTaf({ bulkText: rawText });
  } catch {
    // TAF is optional; continue with model fallback.
    return new Map();
  }
}

function selectTafForecastGroup(taf, forecastIso, { requireCoverage = false } = {}) {
  const target = new Date(forecastIso).getTime() / 1000;
  const groups = Array.isArray(taf?.fcsts) ? taf.fcsts : [];
  if (!groups.length) return null;

  const withBounds = groups.map((group, index) => ({
    group,
    index,
    start: Number(group?.timeFrom),
    end: Number(group?.timeTo)
  }));

  const matching = withBounds.filter(entry => Number.isFinite(target) && Number.isFinite(entry.start) && Number.isFinite(entry.end) && target >= entry.start && target < entry.end);
  if (requireCoverage && !matching.length) return null;
  const pool = matching.length ? matching : withBounds;
  const precedence = { TEMPO: 0, PROB30: 1, PROB40: 1, FM: 2, BECMG: 3, null: 4, undefined: 4 };

  return pool.sort((a, b) => {
    const aType = String(a.group?.fcstChange || '').toUpperCase() || null;
    const bType = String(b.group?.fcstChange || '').toUpperCase() || null;
    const aPriority = precedence[aType] ?? 4;
    const bPriority = precedence[bType] ?? 4;
    if (aPriority !== bPriority) return aPriority - bPriority;

    const aSpan = Number.isFinite(a.start) && Number.isFinite(a.end) ? a.end - a.start : Number.POSITIVE_INFINITY;
    const bSpan = Number.isFinite(b.start) && Number.isFinite(b.end) ? b.end - b.start : Number.POSITIVE_INFINITY;
    if (aSpan !== bSpan) return aSpan - bSpan;
    return a.index - b.index;
  })[0] || null;
}

function findNearestReportingAirport(point, reportingAirports) {
  if (!reportingAirports.length) return null;
  const nearest = reportingAirports
    .map(airport => ({ airport, distanceNm: distanceNm(point, airport) }))
    .sort((a, b) => a.distanceNm - b.distanceNm)[0];
  return nearest || null;
}

function nearestAirportWithAviationWeather(point, etaIso, reportingAirports, metarsByCode, tafsByCode, maxDistanceNm = 120) {
  if (!Array.isArray(reportingAirports) || !reportingAirports.length) return null;
  const sorted = reportingAirports
    .map(airport => ({ airport, distanceNm: distanceNm(point, airport) }))
    .sort((a, b) => a.distanceNm - b.distanceNm);

  for (const candidate of sorted) {
    if (!Number.isFinite(candidate.distanceNm) || candidate.distanceNm > maxDistanceNm) break;
    const selected = buildAviationWeatherForAirport(candidate.airport, etaIso, metarsByCode, tafsByCode);
    if (selected) return { ...candidate, selected };
  }

  return null;
}

function parseIsoTimeMs(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function metarAgeMinutes(metar, nowMs) {
  const reportMs = parseIsoTimeMs(metar?.reportTime);
  if (!Number.isFinite(reportMs)) return null;
  return (nowMs - reportMs) / 60000;
}

function hasRecentMetar(metar, nowMs, maxAgeMinutes = 90) {
  const ageMinutes = metarAgeMinutes(metar, nowMs);
  return Number.isFinite(ageMinutes) && ageMinutes >= 0 && ageMinutes <= maxAgeMinutes;
}

function isEtaWithinMinutes(etaIso, nowMs, maxMinutes) {
  const etaMs = parseIsoTimeMs(etaIso);
  if (!Number.isFinite(etaMs)) return false;
  const deltaMinutes = (etaMs - nowMs) / 60000;
  return deltaMinutes >= 0 && deltaMinutes <= maxMinutes;
}

function pointEtaIsoByIndex(routeReferences, departureIso, cruiseSpeedKt) {
  const etaByIndex = new Map();
  const startMs = parseIsoTimeMs(departureIso);
  if (!Number.isFinite(startMs)) return etaByIndex;

  const speedKt = Number.isFinite(cruiseSpeedKt) && cruiseSpeedKt > 0 ? cruiseSpeedKt : 110;
  let cumulativeNm = 0;

  routeReferences.forEach((point, index) => {
    if (index > 0) cumulativeNm += distanceNm(routeReferences[index - 1], point);
    const etaMs = startMs + (cumulativeNm / speedKt) * 3600000;
    etaByIndex.set(index, new Date(etaMs).toISOString());
  });

  return etaByIndex;
}

function terrainClearanceWorkflowPlaceholder(sample) {
  return {
    cloudBaseAmslFt: sample?.cloudBaseAmslFt ?? null,
    terrainWithin5NmFt: null,
    terrainClearanceFt: null,
    clearanceBand: null
  };
}

function buildAviationWeatherForAirport(airport, etaIso, metarsByCode, tafsByCode) {
  const code = String(airport?.code || '').toUpperCase();
  if (!code) return null;

  const nowMs = Date.now();
  const metar = metarsByCode.get(code);

  const taf = tafsByCode.get(code);
  if (taf) {
    const tafWeather = buildTafAirportWeather(taf, airport, etaIso, { requireCoverage: true });
    if (tafWeather) {
      return {
        source: 'TAF',
        reason: 'TAF group covers waypoint ETA.',
        weather: tafWeather,
        rawReport: taf.rawTAF || '',
        tafGroup: tafWeather.tafGroup || null
      };
    }
  }

  if (metar && hasRecentMetar(metar, nowMs, 90) && isEtaWithinMinutes(etaIso, nowMs, 30)) {
    return {
      source: 'METAR',
      reason: 'METAR is 90 minutes old or newer and ETA is within 30 minutes.',
      weather: buildMetarAirportWeather(metar, airport),
      rawReport: metar.rawOb || '',
      tafGroup: null
    };
  }

  if (metar && hasRecentMetar(metar, nowMs, 90)) {
    return {
      source: 'METAR',
      reason: 'No valid ETA-covering TAF group; using METAR that is 90 minutes old or newer.',
      weather: buildMetarAirportWeather(metar, airport),
      rawReport: metar.rawOb || '',
      tafGroup: null
    };
  }

  return null;
}

function buildMetarAirportWeather(metar, point) {
  const terrainElevationFt = Number.isFinite(point.elevationFt) ? point.elevationFt : null;
  const cloud = parseCloudInfo(metar);
  const cavokReported = cloud.display === 'CAVOK' || /(?:^|\s)CAVOK(?:\s|$)/.test(String(metar.rawOb || '').toUpperCase());
  const visibility = cavokReported
    ? { km: 10, text: '≥10 KM' }
    : parseVisibilityKm(metar.rawOb, metar.visib);
  const wind = parseWindToken(metar.rawOb);
  const cloudState = buildAirportCloudState(cloud, terrainElevationFt);

  return {
    source: 'METAR',
    forecastTime: metar.reportTime || null,
    ...cloudState,
    visibilityKm: visibility.km,
    visibilityText: visibility.text,
    precipitationMm: null,
    weatherCode: null,
    windKt: Number.isFinite(wind.windKt) ? wind.windKt : Math.round(metar.wspd ?? 0),
    windDirection: Number.isFinite(wind.windDirection) || wind.windDirection === 'VRB' ? wind.windDirection : Math.round(metar.wdir ?? 0),
    gustKt: Number.isFinite(wind.gustKt) ? wind.gustKt : Math.round(metar.wgst ?? 0),
    windText: wind.text,
    metarTempC: Number.isFinite(metar.temp) ? metar.temp : null,
    metarDewPointC: Number.isFinite(metar.dewp) ? metar.dewp : null,
    metarQnhHpa: Number.isFinite(metar.altim) ? Math.round(metar.altim) : null,
    metarObsTime: parseMetarTime(metar.rawOb, metar.reportTime),
    metarRaw: metar.rawOb || '',
    cavokReported
  };
}

function buildTafAirportWeather(taf, point, forecastIso, options = {}) {
  const terrainElevationFt = Number.isFinite(point.elevationFt) ? point.elevationFt : null;
  const selected = selectTafForecastGroup(taf, forecastIso, options);
  if (!selected?.group) return null;

  const cloud = parseTafCloudInfo(selected.group.clouds, taf.rawTAF || '');
  const cavokReported = cloud.display === 'CAVOK';
  const visibility = cavokReported
    ? { km: 10, text: '≥10 KM' }
    : parseVisibilityKm(null, selected.group.visib);
  const cloudState = buildAirportCloudState(cloud, terrainElevationFt);

  return {
    source: 'TAF',
    tafGroup: selected.group.fcstChange ? String(selected.group.fcstChange).toUpperCase() : 'PREVAILING',
    forecastTime: Number.isFinite(selected.group.timeFrom) ? new Date(selected.group.timeFrom * 1000).toISOString() : taf.issueTime || taf.bulletinTime || null,
    ...cloudState,
    visibilityKm: visibility.km,
    visibilityText: visibility.text,
    precipitationMm: null,
    weatherCode: null,
    windKt: Number.isFinite(selected.group.wspd) ? Math.round(selected.group.wspd) : null,
    windDirection: Number.isFinite(selected.group.wdir) ? Math.round(selected.group.wdir) : null,
    gustKt: Number.isFinite(selected.group.wgst) ? Math.round(selected.group.wgst) : null,
    windText: formatWindText(selected.group.wdir, selected.group.wspd, selected.group.wgst),
    metarTempC: null,
    metarDewPointC: null,
    metarQnhHpa: Number.isFinite(selected.group.altim) ? Math.round(selected.group.altim) : null,
    metarObsTime: null,
    metarRaw: taf.rawTAF || '',
    cavokReported
  };
}

function pickRepresentativePoints(routeReferences) {
  const representatives = [];
  const representativeIndexByPoint = [];

  routeReferences.forEach(point => {
    const existingIndex = representatives.findIndex(candidate => distanceNm(candidate, point) <= NEARBY_THRESHOLD_NM);
    if (existingIndex >= 0) {
      representativeIndexByPoint.push(existingIndex);
      return;
    }
    representativeIndexByPoint.push(representatives.length);
    representatives.push(point);
  });

  return { representatives, representativeIndexByPoint };
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

function buildBatchUrl(points) {
  const params = new URLSearchParams({
    latitude: points.map(point => point.lat).join(','),
    longitude: points.map(point => point.lon).join(','),
    hourly: HOURLY_FIELDS,
    wind_speed_unit: 'kn',
    timezone: 'Pacific/Auckland',
    forecast_days: '4'
  });
  return `${API}?${params.toString()}`;
}

function normaliseBatchResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.responses)) return payload.responses;
  return [payload];
}

function extractHourlySample(data, forecastIso) {
  const i = nearestIndex(data.hourly.time, forecastIso);
  const sample = {
    forecastTime: data.hourly.time[i],
    temperature2mC: data.hourly.temperature_2m[i],
    dewPoint2mC: data.hourly.dew_point_2m[i],
    cloudCoverTotalPercent: percentOrNull(data.hourly.cloud_cover[i]),
    cloudCoverLowPercent: percentOrNull(data.hourly.cloud_cover_low[i]),
    cloudCoverMidPercent: percentOrNull(data.hourly.cloud_cover_mid[i]),
    cloudCoverHighPercent: percentOrNull(data.hourly.cloud_cover_high[i]),
    visibilityKm: visibilityKm(data.hourly.visibility[i]),
    precipitationMm: data.hourly.precipitation[i],
    weatherCode: data.hourly.weather_code[i],
    windKt: Math.round(data.hourly.wind_speed_10m[i] ?? 0),
    windDirection: Math.round(data.hourly.wind_direction_10m[i] ?? 0),
    gustKt: Math.round(data.hourly.wind_gusts_10m[i] ?? 0)
  };

  PRESSURE_LEVELS.forEach(level => {
    sample[`relative_humidity_${level}hPa`] = data.hourly[`relative_humidity_${level}hPa`]?.[i] ?? null;
    sample[`cloud_cover_${level}hPa`] = data.hourly[`cloud_cover_${level}hPa`]?.[i] ?? null;
    sample[`geopotential_height_${level}hPa`] = data.hourly[`geopotential_height_${level}hPa`]?.[i] ?? null;
  });

  const modelCloud = classifyModelCloud(sample);
  const pressureLevels = buildPressureLevels(sample);
  return {
    ...sample,
    amslFt: modelCloud.cloudBaseAmslFt,
    cloudDisplay: modelCloud.cloudDisplay,
    cloudBaseAglFt: modelCloud.cloudBaseAglFt,
    cloudBaseAmslFt: modelCloud.cloudBaseAmslFt,
    cloudState: modelCloud.cloudState,
    cloudMethod: modelCloud.cloudMethod,
    cloudStatusFt: modelCloud.cloudStatusFt,
    cloudIsVerticalVisibility: modelCloud.cloudIsVerticalVisibility,
    cloudRawLayers: modelCloud.cloudRawLayers,
    cloudSelectedLayer: modelCloud.cloudSelectedLayer,
    cloudCoverLowPercent: modelCloud.cloudCoverLowPercent,
    cloudCoverMidPercent: modelCloud.cloudCoverMidPercent,
    cloudCoverHighPercent: modelCloud.cloudCoverHighPercent,
    pressureLevels
  };
}

async function fetchRepresentativeWeather(representatives, forecastIso, requestCache) {
  const result = new Map();

  const batches = chunk(representatives, MAX_COORDS_PER_BATCH);
  for (const batch of batches) {
    const url = buildBatchUrl(batch);
    const payload = await fetchJsonWithRetry(url, requestCache);
    const rows = normaliseBatchResponse(payload);

    if (rows.length !== batch.length) {
      for (let i = 0; i < batch.length; i += 1) {
        const singleUrl = buildBatchUrl([batch[i]]);
        const singlePayload = await fetchJsonWithRetry(singleUrl, requestCache);
        const singleRow = normaliseBatchResponse(singlePayload)[0];
        result.set(batch[i], extractHourlySample(singleRow, forecastIso));
      }
      continue;
    }

    rows.forEach((row, index) => {
      result.set(batch[index], extractHourlySample(row, forecastIso));
    });
  }

  return result;
}

export function weatherStatus(sample) {
  const ranks = { good: 0, review: 1, caution: 2, poor: 3, unknown: -1 };
  const statuses = [];
  const cloud = cloudStatus(sample);
  const visibility = visibilityStatus(sample);
  if (cloud) statuses.push(cloud);
  if (visibility) statuses.push(visibility);
  if (!statuses.length) return 'unknown';
  return statuses.sort((a, b) => ranks[b] - ranks[a])[0];
}

export async function fetchRouteWeather(routeReferences, forecastIso, options = {}) {
  const requestCache = new Map();
  const weatherByIndex = new Map();
  const departureIso = options.departureIso || forecastIso;
  const cruiseSpeedKt = Number.isFinite(Number(options.cruiseSpeedKt)) ? Number(options.cruiseSpeedKt) : 110;
  const etaByIndex = pointEtaIsoByIndex(routeReferences, departureIso, cruiseSpeedKt);

  const airportCatalog = locations
    .filter(isEligibleReportingAirport)
    .map(airport => ({ ...airport, code: String(airport.code).toUpperCase() }));
  const airportByCode = new Map(airportCatalog.map(airport => [airport.code, airport]));
  const airportCodes = [...new Set(airportCatalog.map(airport => airport.code))];
  const metarsByCode = AIRPORT_REPORT_LOOKUPS_ENABLED ? await fetchMetars(airportCodes) : new Map();
  const tafsByCode = AIRPORT_REPORT_LOOKUPS_ENABLED ? await fetchTafs(airportCodes) : new Map();

  const logSourceSelection = ({ point, nearest, source, reason }) => {
    console.info('[Takeoff source selection]', {
      waypoint: point.name,
      waypointCoordinates: {
        lat: Number.isFinite(point?.lat) ? Number(point.lat.toFixed(4)) : null,
        lon: Number.isFinite(point?.lon) ? Number(point.lon.toFixed(4)) : null
      },
      nearestReportingAirport: nearest?.airport?.name || null,
      distanceNm: Number.isFinite(nearest?.distanceNm) ? Number(nearest.distanceNm.toFixed(1)) : null,
      icao: nearest?.airport?.code || null,
      source,
      reason: source === 'Forecast' ? reason : null
    });
  };

  routeReferences.forEach((point, index) => {
    if (isAirportReference(point)) {
      const ownCode = String(point.code || '').toUpperCase();
      const ownAirport = airportByCode.get(ownCode);
      const nearest = ownAirport ? { airport: ownAirport, distanceNm: 0 } : null;
      if (!ownAirport) {
        logSourceSelection({ point, nearest, source: 'Forecast', reason: 'User-entered airport not found in reporting catalog.' });
        return;
      }

      const pointEtaIso = etaByIndex.get(index) || forecastIso;
      const selected = buildAviationWeatherForAirport(ownAirport, pointEtaIso, metarsByCode, tafsByCode);
      if (!selected) {
        const nearby = nearestAirportWithAviationWeather(point, pointEtaIso, airportCatalog.filter(airport => airport.code !== ownCode), metarsByCode, tafsByCode);
        if (!nearby) {
          logSourceSelection({ point, nearest, source: 'Forecast', reason: 'No METAR or valid TAF available for user-entered airport.' });
          return;
        }

        weatherByIndex.set(index, {
          ...nearby.selected.weather,
          source: nearby.selected.source,
          sourceReason: `No valid report at ${ownAirport.code}; using nearest reporting airport ${nearby.airport.code} (${nearby.distanceNm.toFixed(1)} NM). ${nearby.selected.reason}`,
          reportingAirportIcao: nearby.airport.code,
          reportingAirportDistanceNm: nearby.distanceNm,
          sourceLabel: `${nearby.selected.source} ${nearby.airport.code}`
        });

        logSourceSelection({ point, nearest: nearby, source: nearby.selected.source, reason: null });
        return;
      }

      weatherByIndex.set(index, {
        ...selected.weather,
        source: selected.source,
        sourceReason: selected.reason,
        reportingAirportIcao: ownAirport.code,
        reportingAirportDistanceNm: 0,
        sourceLabel: `${selected.source} ${ownAirport.code}`
      });

      logSourceSelection({ point, nearest, source: selected.source, reason: null });
      console.info('[Takeoff cloud diagnostic]', {
        icao: ownAirport.code,
        point: point.name,
        source: selected.source,
        rawReport: selected.rawReport,
        selectedTafGroup: selected.tafGroup,
        rawCloudLayers: selected.weather.cloudRawLayers || [],
        chosenLayer: selected.weather.cloudSelectedLayer || null,
        airportElevationFt: Number.isFinite(ownAirport.elevationFt) ? ownAirport.elevationFt : null,
        resultingAglFt: Number.isFinite(selected.weather.cloudBaseAglFt) ? selected.weather.cloudBaseAglFt : null,
        resultingAmslFt: Number.isFinite(selected.weather.cloudBaseAmslFt) ? selected.weather.cloudBaseAmslFt : null
      });
      return;
    }

    if (!point.automatic) {
      logSourceSelection({ point, nearest: null, source: 'Forecast', reason: 'Reference is not an automatic waypoint or user-entered airport.' });
      return;
    }

    const nearest = findNearestReportingAirport(point, airportCatalog);
    if (!nearest) {
      logSourceSelection({ point, nearest, source: 'Forecast', reason: 'No eligible reporting airport found in airports data.' });
      return;
    }

    if (nearest.distanceNm > REPORTING_AIRPORT_THRESHOLD_NM) {
      logSourceSelection({ point, nearest, source: 'Forecast', reason: `Nearest reporting airport beyond ${REPORTING_AIRPORT_THRESHOLD_NM} NM threshold.` });
      return;
    }

    const pointEtaIso = etaByIndex.get(index) || forecastIso;
    const selected = buildAviationWeatherForAirport(nearest.airport, pointEtaIso, metarsByCode, tafsByCode);
    if (!selected) {
      logSourceSelection({ point, nearest, source: 'Forecast', reason: 'Nearest reporting airport has no METAR and no valid TAF group.' });
      return;
    }

    weatherByIndex.set(index, {
      ...selected.weather,
      source: selected.source,
        sourceReason: selected.reason,
      reportingAirportIcao: nearest.airport.code,
      reportingAirportDistanceNm: nearest.distanceNm,
      sourceLabel: `${selected.source} ${nearest.airport.code}`
    });

    logSourceSelection({ point, nearest, source: selected.source, reason: null });
  });

  const forecastEntries = routeReferences
    .map((point, index) => ({ point, index }))
    .filter(entry => !weatherByIndex.has(entry.index));

  if (forecastEntries.length) {
    const forecastPoints = forecastEntries.map(entry => entry.point);
    const { representatives, representativeIndexByPoint } = pickRepresentativePoints(forecastPoints);
    const representativeWeather = await fetchRepresentativeWeather(representatives, forecastIso, requestCache);

    forecastEntries.forEach((entry, forecastIndex) => {
      const weather = representativeWeather.get(representatives[representativeIndexByPoint[forecastIndex]]);
      weatherByIndex.set(entry.index, {
        source: 'Forecast',
        sourceReason: 'No valid TAF or recent METAR was available for this point; using model forecast.',
        sourceLabel: 'Model',
        forecastTime: weather.forecastTime,
        cloudDisplay: weather.cloudDisplay,
        cloudBaseAglFt: weather.cloudBaseAglFt,
        cloudBaseAmslFt: weather.cloudBaseAmslFt,
        cloudState: weather.cloudState,
        cloudMethod: weather.cloudMethod,
        cloudStatusFt: weather.cloudStatusFt,
        cloudIsVerticalVisibility: weather.cloudIsVerticalVisibility,
        cloudRawLayers: weather.cloudRawLayers,
        cloudSelectedLayer: weather.cloudSelectedLayer,
        cloudCoverLowPercent: weather.cloudCoverLowPercent,
        cloudCoverMidPercent: weather.cloudCoverMidPercent,
        cloudCoverHighPercent: weather.cloudCoverHighPercent,
        pressureLevels: weather.pressureLevels,
        visibilityKm: weather.visibilityKm,
        precipitationMm: weather.precipitationMm,
        weatherCode: weather.weatherCode,
        windKt: weather.windKt,
        windDirection: weather.windDirection,
        gustKt: weather.gustKt
      });
    });
  }

  return routeReferences.map((point, pointIndex) => {
    const weather = weatherByIndex.get(pointIndex);
    if (!weather) throw new Error('Weather data unavailable for one or more route points. Please try again.');

    const terrainElevationFt = Number.isFinite(point.elevationFt) ? point.elevationFt : null;
    const sample = {
      ...point,
      elevationFt: terrainElevationFt,
      source: weather.source,
      sourceReason: weather.sourceReason || null,
      sourceLabel: weather.sourceLabel || weather.source,
      tafGroup: weather.tafGroup || null,
      reportingAirportIcao: weather.reportingAirportIcao || null,
      reportingAirportDistanceNm: Number.isFinite(weather.reportingAirportDistanceNm) ? weather.reportingAirportDistanceNm : null,
      forecastTime: weather.forecastTime,
      cloudDisplay: weather.cloudDisplay,
      cloudBaseAglFt: weather.source === 'Forecast' ? null : weather.cloudBaseAglFt,
      cloudBaseAmslFt: weather.cloudBaseAmslFt,
      cloudState: weather.cloudState || null,
      cloudMethod: weather.cloudMethod || null,
      cloudStatusFt: weather.cloudStatusFt,
      cloudIsVerticalVisibility: weather.cloudIsVerticalVisibility,
      cloudRawLayers: weather.cloudRawLayers || [],
      cloudSelectedLayer: weather.cloudSelectedLayer || null,
      cloudCoverLowPercent: weather.cloudCoverLowPercent ?? null,
      cloudCoverMidPercent: weather.cloudCoverMidPercent ?? null,
      cloudCoverHighPercent: weather.cloudCoverHighPercent ?? null,
      pressureLevels: Array.isArray(weather.pressureLevels) ? weather.pressureLevels : [],
      visibilityKm: weather.visibilityKm,
      visibilityText: weather.visibilityText,
      precipitationMm: weather.precipitationMm,
      weatherCode: weather.weatherCode,
      windKt: weather.windKt,
      windDirection: weather.windDirection,
      gustKt: weather.gustKt,
      windText: weather.windText,
      metarTempC: weather.metarTempC,
      metarDewPointC: weather.metarDewPointC,
      metarQnhHpa: weather.metarQnhHpa,
      metarObsTime: weather.metarObsTime,
      metarRaw: weather.metarRaw,
      cavokReported: Boolean(weather.cavokReported)
    };
    sample.terrainClearance = terrainClearanceWorkflowPlaceholder(sample);
    sample.status = weatherStatus(sample);
    return sample;
  });
}
