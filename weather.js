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
const FOG_MIST_WEATHER_CODES = new Set([45, 48]);
const MODEL_PLAUSIBILITY_DIAGNOSTICS_ENABLED = true;
const MODEL_COMPARISON_DIAGNOSTICS_ENABLED = true;
const MODEL_COMPARISON_MODELS = [
  { label: 'Open-Meteo Best Match', model: null },
  { label: 'ECMWF IFS', model: 'ecmwf_ifs' },
  { label: 'GFS', model: 'gfs_seamless' }
];
const MODEL_COMPARISON_TEST_CODES = ['NZTU', 'NZCH', 'NZNR', 'NZPM', 'NZKI', 'ARTHURS_PASS', 'NZNS'];

function formatIsoUtc(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function formatIsoNzt(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

function timestampSecondsToIso(value) {
  return Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function resolveUtcDayHour(anchorIso, day, hour, minute = 0) {
  const anchor = new Date(anchorIso || Date.now());
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const candidate = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), day, hour, minute, 0, 0));
  if (candidate.getUTCDate() < anchor.getUTCDate() - 10) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  if (candidate.getUTCDate() > anchor.getUTCDate() + 20) candidate.setUTCMonth(candidate.getUTCMonth() - 1);
  return candidate.toISOString();
}

function parseTafWindowToken(windowToken, anchorIso) {
  const match = String(windowToken || '').match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!match) return { startIso: null, endIso: null };
  const startIso = resolveUtcDayHour(anchorIso, Number(match[1]), Number(match[2]), 0);
  let endIso = resolveUtcDayHour(anchorIso, Number(match[3]), Number(match[4]), 0);
  if (startIso && endIso && new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    const shifted = new Date(endIso);
    shifted.setUTCDate(shifted.getUTCDate() + 1);
    endIso = shifted.toISOString();
  }
  return { startIso, endIso };
}

function parseTafWeatherTokens(tokens) {
  const blocked = new Set(['TAF', 'AMD', 'COR', 'NIL', 'CNL', 'TEMPO', 'BECMG', 'NOSIG', 'CAVOK', 'NSC', 'NCD', 'SKC', 'CLR', 'PROB30', 'PROB40']);
  return tokens
    .map(token => String(token || '').trim().toUpperCase())
    .filter(Boolean)
    .filter(token => /^(-|\+|VC)?[A-Z]{2,}$/.test(token))
    .filter(token => !blocked.has(token))
    .filter(token => !/^(FEW|SCT|BKN|OVC|VV)\d{3}(CB|TCU)?$/.test(token))
    .filter(token => !/^(\d{3}|VRB)\d{2,3}(G\d{2,3})?KT$/.test(token))
    .filter(token => !/^(\d{4}|\d+(?:\/\d+)?SM)$/.test(token));
}

function parseTafGroupsFromRaw(rawTaf, issueIso, validityStartIso, validityEndIso) {
  const compact = String(rawTaf || '').replace(/\s+/g, ' ').trim();
  const empty = {
    groups: [],
    issueToken: null,
    validityToken: null,
    amendmentType: null,
    status: {
      amd: false,
      cor: false,
      nil: false,
      cnl: false
    }
  };
  if (!compact.startsWith('TAF ')) return empty;

  const tokens = compact.split(' ');
  let cursor = 1;
  let amendmentType = null;
  if (tokens[cursor] === 'AMD' || tokens[cursor] === 'COR') {
    amendmentType = tokens[cursor];
    cursor += 1;
  }

  if (!/^[A-Z]{4}$/.test(String(tokens[cursor] || ''))) return empty;
  cursor += 1;

  const issueToken = tokens[cursor] || null;
  cursor += 1;
  const validityToken = tokens[cursor] || null;
  cursor += 1;

  const body = tokens.slice(cursor);
  const markers = token => /^(FM\d{6}|BECMG|TEMPO|PROB30|PROB40)$/.test(token);
  const groups = [];
  let index = 0;
  let initialTokens = [];

  while (index < body.length && !markers(body[index])) {
    initialTokens.push(body[index]);
    index += 1;
  }

  groups.push({
    type: 'INITIAL',
    marker: null,
    windowToken: validityToken,
    tokens: initialTokens,
    rawText: initialTokens.join(' ').trim()
  });

  while (index < body.length) {
    const marker = body[index];
    if (!markers(marker)) {
      index += 1;
      continue;
    }

    if (/^FM\d{6}$/.test(marker)) {
      index += 1;
      const conditionTokens = [];
      while (index < body.length && !markers(body[index])) {
        conditionTokens.push(body[index]);
        index += 1;
      }
      groups.push({
        type: 'FM',
        marker,
        windowToken: null,
        tokens: conditionTokens,
        rawText: [marker, ...conditionTokens].join(' ').trim()
      });
      continue;
    }

    if (marker === 'BECMG' || marker === 'TEMPO') {
      const windowToken = body[index + 1] || null;
      index += 2;
      const conditionTokens = [];
      while (index < body.length && !markers(body[index])) {
        conditionTokens.push(body[index]);
        index += 1;
      }
      groups.push({
        type: marker,
        marker,
        windowToken,
        tokens: conditionTokens,
        rawText: [marker, windowToken, ...conditionTokens].join(' ').trim()
      });
      continue;
    }

    if (marker === 'PROB30' || marker === 'PROB40') {
      let offset = 1;
      let type = marker;
      if (body[index + 1] === 'TEMPO') {
        type = `${marker}_TEMPO`;
        offset = 2;
      }
      const windowToken = body[index + offset] || null;
      index += offset + 1;
      const conditionTokens = [];
      while (index < body.length && !markers(body[index])) {
        conditionTokens.push(body[index]);
        index += 1;
      }
      const rawPrefix = type.endsWith('_TEMPO') ? [marker, 'TEMPO'] : [marker];
      groups.push({
        type,
        marker,
        windowToken,
        tokens: conditionTokens,
        rawText: [...rawPrefix, windowToken, ...conditionTokens].join(' ').trim()
      });
      continue;
    }

    index += 1;
  }

  const fmStarts = groups
    .map((group, groupIndex) => {
      if (!group.marker || !/^FM\d{6}$/.test(group.marker)) return null;
      const fmMatch = group.marker.match(/^FM(\d{2})(\d{2})(\d{2})$/);
      if (!fmMatch) return null;
      const startIso = resolveUtcDayHour(issueIso, Number(fmMatch[1]), Number(fmMatch[2]), Number(fmMatch[3]));
      return { groupIndex, startIso };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());

  const groupsWithWindow = groups.map((group, groupIndex) => {
    let startIso = null;
    let endIso = null;

    if (group.type === 'INITIAL') {
      startIso = validityStartIso || null;
      endIso = validityEndIso || null;
    } else if (group.type === 'FM') {
      const currentFm = fmStarts.find(entry => entry.groupIndex === groupIndex);
      const nextFm = fmStarts.find(entry => entry.groupIndex > groupIndex);
      startIso = currentFm?.startIso || null;
      endIso = nextFm?.startIso || validityEndIso || null;
    } else {
      const window = parseTafWindowToken(group.windowToken, issueIso);
      startIso = window.startIso;
      endIso = window.endIso;
    }

    const wind = parseWindToken(group.tokens.join(' '));
    const visibilityToken = group.tokens.find(token => token === 'CAVOK' || /^\d{4}$/.test(token) || /^\d+(?:\/\d+)?SM$/.test(token)) || null;
    const cloudTokens = group.tokens.filter(token => /^(FEW|SCT|BKN|OVC|VV)\d{3}(CB|TCU)?$/.test(token));
    const weatherTokens = parseTafWeatherTokens(group.tokens);

    return {
      index: groupIndex,
      type: group.type,
      startIso,
      endIso,
      wind: wind.text,
      visibility: visibilityToken,
      weather: weatherTokens,
      cloud: cloudTokens,
      rawText: group.rawText
    };
  });

  return {
    groups: groupsWithWindow,
    issueToken,
    validityToken,
    amendmentType,
    status: {
      amd: amendmentType === 'AMD',
      cor: amendmentType === 'COR',
      nil: /\bNIL\b/.test(compact),
      cnl: /\bCNL\b/.test(compact)
    }
  };
}

function buildTafSelectionDiagnostics(taf, forecastIso, options = {}) {
  const target = new Date(forecastIso).getTime() / 1000;
  const requireCoverage = Boolean(options.requireCoverage);
  const groups = Array.isArray(taf?.fcsts) ? taf.fcsts : [];
  const withBounds = groups.map((group, index) => ({
    group,
    index,
    start: Number(group?.timeFrom),
    end: Number(group?.timeTo)
  }));
  const matching = withBounds.filter(entry => Number.isFinite(target) && Number.isFinite(entry.start) && Number.isFinite(entry.end) && target >= entry.start && target < entry.end);
  const pool = matching.length ? matching : withBounds;
  const precedence = { TEMPO: 0, PROB30: 1, PROB40: 1, FM: 2, BECMG: 3, null: 4, undefined: 4 };

  const sortedPool = [...pool].sort((a, b) => {
    const aType = String(a.group?.fcstChange || '').toUpperCase() || null;
    const bType = String(b.group?.fcstChange || '').toUpperCase() || null;
    const aPriority = precedence[aType] ?? 4;
    const bPriority = precedence[bType] ?? 4;
    if (aPriority !== bPriority) return aPriority - bPriority;

    const aSpan = Number.isFinite(a.start) && Number.isFinite(a.end) ? a.end - a.start : Number.POSITIVE_INFINITY;
    const bSpan = Number.isFinite(b.start) && Number.isFinite(b.end) ? b.end - b.start : Number.POSITIVE_INFINITY;
    if (aSpan !== bSpan) return aSpan - bSpan;
    return a.index - b.index;
  });

  const selected = sortedPool[0] || null;
  const rejected = withBounds
    .filter(entry => !selected || entry.index !== selected.index)
    .map(entry => {
      const coversEta = Number.isFinite(target) && Number.isFinite(entry.start) && Number.isFinite(entry.end)
        ? target >= entry.start && target < entry.end
        : false;
      let reason = 'Lower precedence than selected group.';
      if (requireCoverage && !matching.length) reason = 'Rejected because requireCoverage=true and no groups covered ETA.';
      else if (!coversEta && matching.length) reason = 'Rejected because group does not cover ETA while another group does.';
      return {
        index: entry.index,
        type: String(entry.group?.fcstChange || '').toUpperCase() || 'PREVAILING',
        startIso: timestampSecondsToIso(entry.start),
        endIso: timestampSecondsToIso(entry.end),
        reason
      };
    });

  return {
    targetIso: formatIsoUtc(forecastIso),
    requireCoverage,
    selectedIndex: selected?.index ?? null,
    selectedType: String(selected?.group?.fcstChange || '').toUpperCase() || (selected ? 'PREVAILING' : null),
    selectedStartIso: timestampSecondsToIso(selected?.start),
    selectedEndIso: timestampSecondsToIso(selected?.end),
    matchingIndexes: matching.map(entry => entry.index),
    rejected
  };
}

function buildTafFieldConsistency(sample, point, selectedAirportIcao) {
  const sourceGroupLabel = `TAF ${selectedAirportIcao} ${sample?.tafGroup || 'PREVAILING'}`;
  const origins = {
    cloud: sourceGroupLabel,
    visibility: sourceGroupLabel,
    wind: sourceGroupLabel,
    weather: sourceGroupLabel,
    rain: 'Derived constant (TAF path sets precipitation to NIL)',
    sourceLabel: 'Source selection label'
  };

  const operationalOrigins = [origins.cloud, origins.visibility, origins.wind, origins.weather];
  const mixedSourcesDetected = operationalOrigins.some(origin => origin !== operationalOrigins[0]);

  return {
    origins,
    mixedSourcesDetected,
    fallbackAirportUsed: String(point?.code || '').toUpperCase() !== String(selectedAirportIcao || '').toUpperCase()
  };
}

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

function pressureLevelsForLowCloud(sample) {
  return Array.isArray(sample?.pressureLevels)
    ? sample.pressureLevels.filter(level => Number.isFinite(level?.heightMeters) && level.heightMeters <= LOW_LEVEL_MAX_METERS)
    : [];
}

function adjacentPairCount(levels, condition) {
  let count = 0;
  for (let index = 0; index < levels.length - 1; index += 1) {
    if (condition(levels[index], levels[index + 1])) count += 1;
  }
  return count;
}

function lowCloudEvidenceForSample(sample) {
  const levels = pressureLevelsForLowCloud(sample);
  const cloudCoverLow = Number(sample?.cloudCoverLowPercent);
  const precipitation = Number(sample?.precipitationMm);
  const cloudCoverStrong = Number.isFinite(cloudCoverLow) && cloudCoverLow >= 60;
  const adjacentCloudPairs = adjacentPairCount(levels, (a, b) => Number(a?.cloudCoverPercent) >= 50 && Number(b?.cloudCoverPercent) >= 50);
  const adjacentRhPairs90 = adjacentPairCount(levels, (a, b) => Number(a?.relativeHumidityPercent) >= 90 && Number(b?.relativeHumidityPercent) >= 90);
  const humidityWithNeighbor = adjacentPairCount(levels, (a, b) => {
    const aRh = Number(a?.relativeHumidityPercent);
    const bRh = Number(b?.relativeHumidityPercent);
    return (aRh >= 90 && bRh >= 85) || (bRh >= 90 && aRh >= 85);
  });
  const weatherSupport = weatherCodeSuggestsMoisture(sample?.weatherCode) || (Number.isFinite(precipitation) && precipitation > 0.1);

  return {
    lowLevelPressureCount: levels.length,
    cloudCoverLow,
    cloudCoverStrong,
    adjacentCloudPairs,
    adjacentRhPairs90,
    humidityWithNeighbor,
    weatherSupport,
    strongIndicatorCount: [cloudCoverStrong, adjacentCloudPairs > 0, adjacentRhPairs90 > 0, weatherSupport].filter(Boolean).length,
    anyIndicatorCount: [cloudCoverStrong, adjacentCloudPairs > 0, humidityWithNeighbor > 0, weatherSupport].filter(Boolean).length
  };
}

function confidenceBandFromScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'LOW';
  if (value >= 75) return 'HIGH';
  if (value >= 45) return 'MEDIUM';
  return 'LOW';
}

function modelVisibilityAbove20Km(context) {
  const visibilityM = Number(context?.rawVisibilityM);
  if (!Number.isFinite(visibilityM)) return false;
  return visibilityM >= 20000;
}

function scoreCloudConfidence(sample, cloudConfidence, cloudOutlier) {
  const evidence = cloudConfidence?.evidence || {};
  const ticks = [];
  const crosses = [];
  let score = 20;

  if (evidence.cloudCoverStrong) {
    score += 18;
    ticks.push(`Low cloud cover ${Math.round(evidence.cloudCoverLow || 0)}%`);
  } else {
    crosses.push('Low cloud cover not significant');
  }

  if (Number(evidence.adjacentCloudPairs) > 0) {
    score += 18;
    ticks.push('Pressure-level cloud on adjacent levels');
  } else {
    crosses.push('No adjacent pressure-level cloud support');
  }

  if (Number(evidence.adjacentRhPairs90) > 0 || Number(evidence.humidityWithNeighbor) > 0) {
    score += 14;
    ticks.push('RH profile supports low cloud');
  } else {
    crosses.push('RH profile weak for low cloud');
  }

  if (evidence.weatherSupport) {
    score += 10;
    ticks.push('Weather code or precipitation supports cloud');
  } else {
    crosses.push('No weather/precip support for cloud');
  }

  if (evidence.neighboringForecastHourSupport) {
    score += 10;
    ticks.push('Previous/next forecast hour agrees');
  } else {
    crosses.push('Neighboring forecast hours disagree');
  }

  if (evidence.neighboringRoutePointSupport) {
    score += 10;
    ticks.push('Neighboring route points agree');
  } else {
    crosses.push('Neighboring route points disagree');
  }

  if (!Number.isFinite(evidence.lowLevelPressureCount) || evidence.lowLevelPressureCount === 0) {
    score -= 20;
    crosses.push('Low-level pressure data missing');
  }

  if (Number(evidence.strongIndicatorCount) <= 1) {
    score -= 10;
    crosses.push('Only one strong indicator present');
  }

  if (cloudOutlier?.hourlyIsolated || cloudOutlier?.routeIsolated) {
    score -= 15;
    crosses.push('Cloud base appears isolated versus neighbors');
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: bounded,
    classification: confidenceBandFromScore(bounded),
    evidence: {
      positive: ticks,
      negative: crosses
    }
  };
}

function scoreVisibilityConfidence(sample, visibilityConfidence, visibilityOutlier, neighborContext = {}) {
  const supports = visibilityConfidence?.supports || {};
  const rawVisibilityKm = Number(visibilityConfidence?.rawVisibilityKm);
  const ticks = [];
  const crosses = [];
  let score = Number.isFinite(rawVisibilityKm) && rawVisibilityKm >= 20 ? 75 : 30;

  if (supports.fogMistCode) {
    score += 16;
    ticks.push('Fog/mist weather code support');
  } else {
    crosses.push('No fog/mist weather code support');
  }

  if (supports.precipitation) {
    score += 14;
    ticks.push('Precipitation supports reduced visibility');
  } else {
    crosses.push('No precipitation support');
  }

  if (supports.highHumidity) {
    score += 12;
    ticks.push('Very high low-level RH support');
  } else {
    crosses.push('Low-level RH does not support reduction');
  }

  if (supports.highLowCloud) {
    score += 10;
    ticks.push('Low cloud coverage supports reduction');
  } else {
    crosses.push('Low cloud coverage weak');
  }

  if (supports.neighboringForecastHourSupport) {
    score += 10;
    ticks.push('Neighboring forecast hours agree');
  } else {
    crosses.push('Neighboring forecast hours disagree');
  }

  if (supports.neighboringRoutePointSupport) {
    score += 10;
    ticks.push('Neighboring route points agree');
  } else {
    crosses.push('Neighboring route points disagree');
  }

  const prevHourHigh = modelVisibilityAbove20Km(sample?.previousHourValues);
  const nextHourHigh = modelVisibilityAbove20Km(sample?.nextHourValues);
  const prevRouteHigh = modelVisibilityAbove20Km(neighborContext?.previousRoutePoint);
  const nextRouteHigh = modelVisibilityAbove20Km(neighborContext?.nextRoutePoint);

  if (Number.isFinite(rawVisibilityKm) && rawVisibilityKm < 10 && prevHourHigh && nextHourHigh) {
    score -= 18;
    crosses.push('Surrounding forecast hours all >20 KM');
  }

  if (Number.isFinite(rawVisibilityKm) && rawVisibilityKm < 10 && prevRouteHigh && nextRouteHigh) {
    score -= 18;
    crosses.push('Surrounding route points all >20 KM');
  }

  if (visibilityOutlier?.hourlyIsolated || visibilityOutlier?.routeIsolated || visibilityConfidence?.isolatedOutlier) {
    score -= 20;
    crosses.push('Likely isolated visibility drop');
  }

  if (Number.isFinite(rawVisibilityKm) && rawVisibilityKm < 10 && Number(supports.supportCount) === 0) {
    score -= 18;
    crosses.push('Low visibility has no supporting weather signal');
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: bounded,
    classification: confidenceBandFromScore(bounded),
    evidence: {
      positive: ticks,
      negative: crosses
    }
  };
}

function lowCloudSupportFromHourlyContext(hourContext) {
  if (!hourContext || typeof hourContext !== 'object') return false;
  const lowCover = Number(hourContext.cloud_cover_low);
  const precipitation = Number(hourContext.precipitation);
  const weatherCode = Number(hourContext.weather_code);
  return (Number.isFinite(lowCover) && lowCover >= 50)
    || (Number.isFinite(precipitation) && precipitation > 0.1)
    || weatherCodeSuggestsMoisture(weatherCode);
}

function visibilitySupportFromHourlyContext(hourContext) {
  if (!hourContext || typeof hourContext !== 'object') return false;
  const rawVisibilityM = Number(hourContext.rawVisibilityM);
  return Number.isFinite(rawVisibilityM) && rawVisibilityM < 10000;
}

function classifyCloudConfidence(sample, neighborContext = {}) {
  const evidence = lowCloudEvidenceForSample(sample);
  const hourSupport = lowCloudSupportFromHourlyContext(sample?.previousHourValues) || lowCloudSupportFromHourlyContext(sample?.nextHourValues);
  const routeSupport = lowCloudSupportFromHourlyContext(neighborContext.previousRoutePoint) || lowCloudSupportFromHourlyContext(neighborContext.nextRoutePoint);
  const supportCount = [hourSupport, routeSupport].filter(Boolean).length;

  let confidence = 'NONE';
  if (evidence.strongIndicatorCount >= 2) confidence = 'HIGH';
  else if (evidence.strongIndicatorCount >= 1 && (supportCount >= 1 || evidence.anyIndicatorCount >= 2)) confidence = 'MEDIUM';
  else if (evidence.anyIndicatorCount >= 1) confidence = 'LOW';

  return {
    confidence,
    evidence: {
      ...evidence,
      neighboringForecastHourSupport: hourSupport,
      neighboringRoutePointSupport: routeSupport
    }
  };
}

function classifyVisibilityConfidence(sample, neighborContext = {}) {
  const rawVisibilityM = Number(sample?.rawVisibilityM);
  const rawVisibilityKm = Number.isFinite(rawVisibilityM) ? rawVisibilityM / 1000 : null;
  const levels = pressureLevelsForLowCloud(sample);
  const highHumidity = levels.some(level => Number(level?.relativeHumidityPercent) >= 90);
  const highLowCloud = Number(sample?.cloudCoverLowPercent) >= 60;
  const precipitation = Number(sample?.precipitationMm);
  const weatherCode = Number(sample?.weatherCode);
  const fogMistCode = FOG_MIST_WEATHER_CODES.has(weatherCode);
  const precipSupport = Number.isFinite(precipitation) && precipitation > 0.1;
  const neighboringHourSupport = visibilitySupportFromHourlyContext(sample?.previousHourValues) || visibilitySupportFromHourlyContext(sample?.nextHourValues);
  const neighboringRouteSupport = visibilitySupportFromHourlyContext(neighborContext.previousRoutePoint) || visibilitySupportFromHourlyContext(neighborContext.nextRoutePoint);
  const supportCount = [fogMistCode, precipSupport, highHumidity, highLowCloud, neighboringHourSupport, neighboringRouteSupport].filter(Boolean).length;

  if (!Number.isFinite(rawVisibilityKm)) {
    return {
      confidence: 'NONE',
      rawVisibilityKm: null,
      isolatedOutlier: false,
      supports: {
        fogMistCode,
        precipitation: precipSupport,
        highHumidity,
        highLowCloud,
        neighboringForecastHourSupport: neighboringHourSupport,
        neighboringRoutePointSupport: neighboringRouteSupport,
        supportCount
      }
    };
  }

  if (rawVisibilityKm >= 10) {
    return {
      confidence: 'HIGH',
      rawVisibilityKm,
      isolatedOutlier: false,
      supports: {
        fogMistCode,
        precipitation: precipSupport,
        highHumidity,
        highLowCloud,
        neighboringForecastHourSupport: neighboringHourSupport,
        neighboringRoutePointSupport: neighboringRouteSupport,
        supportCount
      }
    };
  }

  let confidence = 'LOW';
  if (supportCount >= 2) confidence = 'HIGH';
  else if (supportCount === 1) confidence = 'MEDIUM';

  const isolatedOutlier = rawVisibilityKm < 5 && supportCount === 0;
  return {
    confidence,
    rawVisibilityKm,
    isolatedOutlier,
    supports: {
      fogMistCode,
      precipitation: precipSupport,
      highHumidity,
      highLowCloud,
      neighboringForecastHourSupport: neighboringHourSupport,
      neighboringRoutePointSupport: neighboringRouteSupport,
      supportCount
    }
  };
}

function visibilityDropOutlier(sample, neighborContext = {}) {
  const current = Number(sample?.rawVisibilityM);
  if (!Number.isFinite(current) || current <= 0) return { hourlyIsolated: false, routeIsolated: false };

  const prevHour = Number(sample?.previousHourValues?.rawVisibilityM);
  const nextHour = Number(sample?.nextHourValues?.rawVisibilityM);
  const prevRoute = Number(neighborContext.previousRoutePoint?.rawVisibilityM);
  const nextRoute = Number(neighborContext.nextRoutePoint?.rawVisibilityM);

  const hourlyIsolated = Number.isFinite(prevHour)
    && Number.isFinite(nextHour)
    && prevHour > 0
    && nextHour > 0
    && current < prevHour * 0.4
    && current < nextHour * 0.4;

  const routeIsolated = Number.isFinite(prevRoute)
    && Number.isFinite(nextRoute)
    && prevRoute > 0
    && nextRoute > 0
    && current < prevRoute * 0.4
    && current < nextRoute * 0.4;

  return { hourlyIsolated, routeIsolated };
}

function cloudBaseDropOutlier(sample, neighborContext = {}) {
  const current = Number(sample?.cloudBaseAmslFt);
  const prevHour = Number(sample?.previousHourValues?.cloudBaseAmslFt);
  const nextHour = Number(sample?.nextHourValues?.cloudBaseAmslFt);
  const prevRoute = Number(neighborContext.previousRoutePoint?.cloudBaseAmslFt);
  const nextRoute = Number(neighborContext.nextRoutePoint?.cloudBaseAmslFt);

  const hourlyIsolated = Number.isFinite(current)
    && Number.isFinite(prevHour)
    && Number.isFinite(nextHour)
    && current + 1500 < prevHour
    && current + 1500 < nextHour;

  const routeIsolated = Number.isFinite(current)
    && Number.isFinite(prevRoute)
    && Number.isFinite(nextRoute)
    && current + 1500 < prevRoute
    && current + 1500 < nextRoute;

  return { hourlyIsolated, routeIsolated };
}

function buildAviationPlausibilityReference(point, etaIso, metarsByCode, tafsByCode) {
  if (!isAirportReference(point)) return null;
  const ownCode = String(point?.code || '').toUpperCase();
  if (!ownCode) return null;
  const ownAirport = { ...point, code: ownCode };
  const nowMs = Date.now();

  const ownTaf = tafsByCode.get(ownCode);
  if (ownTaf) {
    const tafWeather = buildTafAirportWeather(ownTaf, ownAirport, etaIso, { requireCoverage: true });
    if (tafWeather) {
      return {
        source: 'TAF',
        cloud: tafWeather.cloudDisplay,
        visibility: tafWeather.visibilityText || tafWeather.visibilityKm,
        referenceIcao: ownCode
      };
    }
  }

  const ownMetar = metarsByCode.get(ownCode);
  if (ownMetar && hasRecentMetar(ownMetar, nowMs, 90)) {
    const metarWeather = buildMetarAirportWeather(ownMetar, ownAirport);
    return {
      source: 'METAR',
      cloud: metarWeather.cloudDisplay,
      visibility: metarWeather.visibilityText || metarWeather.visibilityKm,
      referenceIcao: ownCode
    };
  }

  return null;
}

async function runModelComparisonDiagnostics(forecastIso, requestCache) {
  if (!MODEL_COMPARISON_DIAGNOSTICS_ENABLED) return;
  const points = MODEL_COMPARISON_TEST_CODES
    .map(code => locations.find(location => String(location?.code || '').toUpperCase() === code))
    .filter(Boolean)
    .map(location => ({ name: location.name, code: location.code, lat: location.lat, lon: location.lon }));
  if (!points.length) return;

  for (const modelEntry of MODEL_COMPARISON_MODELS) {
    try {
      const url = buildBatchUrl(points, { model: modelEntry.model });
      const payload = await fetchJsonWithRetry(url, requestCache);
      const rows = normaliseBatchResponse(payload);
      const diagnostics = rows.map((row, index) => {
        const point = points[index] || { name: 'Unknown', code: null, lat: null, lon: null };
        const sample = extractHourlySample(row, forecastIso, { modelIdentifierRequested: modelEntry.model || 'best_match' });
        const lowLevels = pressureLevelsForLowCloud(sample).map(level => ({
          pressureHpa: level.pressureHpa,
          relativeHumidityPercent: level.relativeHumidityPercent,
          cloudCoverPercent: level.cloudCoverPercent,
          heightMeters: level.heightMeters
        }));
        return {
          location: point.name,
          code: point.code,
          forecastTime: sample.forecastTime,
          cloudCoverLowPercent: sample.cloudCoverLowPercent,
          pressureEvidence: lowLevels,
          visibilityKm: sample.visibilityKm,
          rawVisibilityM: sample.rawVisibilityM,
          precipitationMm: sample.precipitationMm
        };
      });

      console.info('[Takeoff model plausibility]', {
        stage: 'A',
        kind: 'model-comparison',
        modelRequested: modelEntry.model || 'best_match',
        modelLabel: modelEntry.label,
        diagnostics
      });
    } catch (error) {
      console.info('[Takeoff model plausibility]', {
        stage: 'A',
        kind: 'model-comparison',
        modelRequested: modelEntry.model || 'best_match',
        modelLabel: modelEntry.label,
        error: error?.message || String(error)
      });
    }
  }
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
  if (cloudBaseFt >= 2000) return 'good';
  if (cloudBaseFt >= 1000) return 'review';
  if (cloudBaseFt >= 500) return 'caution';
  return 'poor';
}

function visibilityStatus(sample) {
  if (sample?.cavokReported) return 'good';
  const visibilityKm = Number.isFinite(sample?.visibilityKm) ? sample.visibilityKm : null;
  if (!Number.isFinite(visibilityKm)) return null;
  if (visibilityKm >= 8) return 'good';
  if (visibilityKm >= 5) return 'review';
  if (visibilityKm >= 3) return 'caution';
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

function nearestAirportWithTafCoverage(point, etaIso, reportingAirports, tafsByCode, maxDistanceNm = 10) {
  if (!Array.isArray(reportingAirports) || !reportingAirports.length) return null;
  const sorted = reportingAirports
    .map(airport => ({ airport, distanceNm: distanceNm(point, airport) }))
    .sort((a, b) => a.distanceNm - b.distanceNm);

  for (const candidate of sorted) {
    if (!Number.isFinite(candidate.distanceNm) || candidate.distanceNm > maxDistanceNm) break;
    const taf = tafsByCode.get(String(candidate.airport?.code || '').toUpperCase());
    if (!taf) continue;
    const tafWeather = buildTafAirportWeather(taf, candidate.airport, etaIso, { requireCoverage: true });
    if (!tafWeather) continue;
    return {
      airport: candidate.airport,
      distanceNm: candidate.distanceNm,
      selected: {
        source: 'TAF',
        reason: 'TAF group covers waypoint ETA.',
        weather: tafWeather,
        rawReport: taf.rawTAF || '',
        tafGroup: tafWeather.tafGroup || null
      }
    };
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
  const parsedRaw = parseTafGroupsFromRaw(
    taf.rawTAF || '',
    taf.issueTime || taf.bulletinTime || forecastIso,
    timestampSecondsToIso(taf.fcsts?.[0]?.timeFrom),
    timestampSecondsToIso(taf.fcsts?.[0]?.timeTo)
  );
  const selectionDiagnostics = buildTafSelectionDiagnostics(taf, forecastIso, options);
  const selectedGroupStartIso = timestampSecondsToIso(selected.group.timeFrom);
  const selectedGroupEndIso = timestampSecondsToIso(selected.group.timeTo);
  const etaInsideSelectedGroup = Boolean(
    selectedGroupStartIso
    && selectedGroupEndIso
    && new Date(forecastIso).getTime() >= new Date(selectedGroupStartIso).getTime()
    && new Date(forecastIso).getTime() < new Date(selectedGroupEndIso).getTime()
  );

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
    cavokReported,
    tafDiagnostics: {
      rawTaf: taf.rawTAF || '',
      issueTimeIso: taf.issueTime || taf.bulletinTime || null,
      validityStartIso: timestampSecondsToIso(taf.fcsts?.[0]?.timeFrom),
      validityEndIso: timestampSecondsToIso(taf.fcsts?.[0]?.timeTo),
      amendmentType: parsedRaw.amendmentType,
      status: parsedRaw.status,
      parserGroups: parsedRaw.groups,
      selection: selectionDiagnostics,
      selectedGroup: {
        type: selected.group.fcstChange ? String(selected.group.fcstChange).toUpperCase() : 'PREVAILING',
        startIso: selectedGroupStartIso,
        endIso: selectedGroupEndIso,
        windKt: Number.isFinite(selected.group.wspd) ? Math.round(selected.group.wspd) : null,
        windDirection: Number.isFinite(selected.group.wdir) ? Math.round(selected.group.wdir) : null,
        gustKt: Number.isFinite(selected.group.wgst) ? Math.round(selected.group.wgst) : null,
        visibility: selected.group.visib || null,
        clouds: Array.isArray(selected.group.clouds) ? selected.group.clouds : []
      },
      etaIso: formatIsoUtc(forecastIso),
      etaNzt: formatIsoNzt(forecastIso),
      etaInsideSelectedGroup,
      checks: {
        modelContamination: false,
        metarContamination: false
      }
    }
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

function buildBatchUrl(points, options = {}) {
  const params = new URLSearchParams({
    latitude: points.map(point => point.lat).join(','),
    longitude: points.map(point => point.lon).join(','),
    hourly: HOURLY_FIELDS,
    wind_speed_unit: 'kn',
    timezone: 'Pacific/Auckland',
    forecast_days: '4'
  });
  if (options.model) params.set('models', options.model);
  return `${API}?${params.toString()}`;
}

function normaliseBatchResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.responses)) return payload.responses;
  return [payload];
}

function extractHourlyContext(data, index) {
  if (!data?.hourly || !Number.isFinite(index) || index < 0 || index >= data.hourly.time.length) return null;
  return {
    time: data.hourly.time[index],
    rawVisibilityM: Number.isFinite(Number(data.hourly.visibility?.[index])) ? Number(data.hourly.visibility[index]) : null,
    cloud_cover: percentOrNull(data.hourly.cloud_cover?.[index]),
    cloud_cover_low: percentOrNull(data.hourly.cloud_cover_low?.[index]),
    cloud_cover_mid: percentOrNull(data.hourly.cloud_cover_mid?.[index]),
    cloud_cover_high: percentOrNull(data.hourly.cloud_cover_high?.[index]),
    temperature_2m: Number.isFinite(Number(data.hourly.temperature_2m?.[index])) ? Number(data.hourly.temperature_2m[index]) : null,
    dew_point_2m: Number.isFinite(Number(data.hourly.dew_point_2m?.[index])) ? Number(data.hourly.dew_point_2m[index]) : null,
    weather_code: Number.isFinite(Number(data.hourly.weather_code?.[index])) ? Number(data.hourly.weather_code[index]) : null,
    precipitation: Number.isFinite(Number(data.hourly.precipitation?.[index])) ? Number(data.hourly.precipitation[index]) : null
  };
}

function extractHourlySample(data, forecastIso, options = {}) {
  const i = nearestIndex(data.hourly.time, forecastIso);
  const rawVisibilityM = Number(data.hourly.visibility[i]);
  const sample = {
    forecastTime: data.hourly.time[i],
    modelIdentifierRequested: options.modelIdentifierRequested || 'best_match',
    modelIdentifierReturned: String(data?.model || data?.model_id || data?.modelName || '').trim() || null,
    rawVisibilityM: Number.isFinite(rawVisibilityM) ? rawVisibilityM : null,
    temperature2mC: data.hourly.temperature_2m[i],
    dewPoint2mC: data.hourly.dew_point_2m[i],
    cloudCoverTotalPercent: percentOrNull(data.hourly.cloud_cover[i]),
    cloudCoverLowPercent: percentOrNull(data.hourly.cloud_cover_low[i]),
    cloudCoverMidPercent: percentOrNull(data.hourly.cloud_cover_mid[i]),
    cloudCoverHighPercent: percentOrNull(data.hourly.cloud_cover_high[i]),
    visibilityKm: visibilityKm(rawVisibilityM),
    precipitationMm: data.hourly.precipitation[i],
    weatherCode: data.hourly.weather_code[i],
    windKt: Math.round(data.hourly.wind_speed_10m[i] ?? 0),
    windDirection: Math.round(data.hourly.wind_direction_10m[i] ?? 0),
    gustKt: Math.round(data.hourly.wind_gusts_10m[i] ?? 0),
    previousHourValues: extractHourlyContext(data, i - 1),
    nextHourValues: extractHourlyContext(data, i + 1)
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

async function fetchRepresentativeWeather(representatives, forecastIso, requestCache, options = {}) {
  const result = new Map();

  const batches = chunk(representatives, MAX_COORDS_PER_BATCH);
  for (const batch of batches) {
    const url = buildBatchUrl(batch, { model: options.model || null });
    const payload = await fetchJsonWithRetry(url, requestCache);
    const rows = normaliseBatchResponse(payload);

    if (rows.length !== batch.length) {
      for (let i = 0; i < batch.length; i += 1) {
        const singleUrl = buildBatchUrl([batch[i]], { model: options.model || null });
        const singlePayload = await fetchJsonWithRetry(singleUrl, requestCache);
        const singleRow = normaliseBatchResponse(singlePayload)[0];
        result.set(batch[i], extractHourlySample(singleRow, forecastIso, { modelIdentifierRequested: options.model || 'best_match' }));
      }
      continue;
    }

    rows.forEach((row, index) => {
      result.set(batch[index], extractHourlySample(row, forecastIso, { modelIdentifierRequested: options.model || 'best_match' }));
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
  const selectedAirportNoLocalTafIndexes = new Set();

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
      const ownTaf = tafsByCode.get(ownCode);
      const ownTafWeather = ownTaf
        ? buildTafAirportWeather(ownTaf, ownAirport, pointEtaIso, { requireCoverage: true })
        : null;

      if (ownTafWeather) {
        const selected = {
          source: 'TAF',
          reason: 'TAF group covers waypoint ETA.',
          weather: ownTafWeather,
          rawReport: ownTaf.rawTAF || '',
          tafGroup: ownTafWeather.tafGroup || null
        };

        weatherByIndex.set(index, {
          ...selected.weather,
          source: selected.source,
          sourceReason: selected.reason,
          reportingAirportIcao: ownAirport.code,
          reportingAirportDistanceNm: 0,
          sourceLabel: `${selected.source} ${ownAirport.code}`,
          pointEtaIso,
          sourceSelection: {
            ownAirport: true,
            nearestAirport: ownAirport.code,
            nearestDistanceNm: 0,
            fallbackUsed: false,
            reasonSelected: selected.reason,
            selectedAirportIcao: ownAirport.code
          }
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

      const nearby = nearestAirportWithTafCoverage(
        point,
        pointEtaIso,
        airportCatalog.filter(airport => airport.code !== ownCode && airport.hasTaf === true),
        tafsByCode,
        10
      );
      if (!nearby) {
        selectedAirportNoLocalTafIndexes.add(index);
        logSourceSelection({ point, nearest, source: 'Forecast', reason: 'No local TAF available within 10 NM.' });
        return;
      }

      weatherByIndex.set(index, {
        ...nearby.selected.weather,
        source: nearby.selected.source,
        sourceReason: `No valid TAF at ${ownAirport.code}; using nearest reporting aerodrome ${nearby.airport.code} (${nearby.distanceNm.toFixed(1)} NM). ${nearby.selected.reason}`,
        reportingAirportIcao: nearby.airport.code,
        reportingAirportDistanceNm: nearby.distanceNm,
        sourceLabel: `TAF ${nearby.airport.code} • ${Math.max(1, Math.round(nearby.distanceNm))} NM`,
        pointEtaIso,
        sourceSelection: {
          ownAirport: true,
          nearestAirport: nearby.airport.code,
          nearestDistanceNm: nearby.distanceNm,
          fallbackUsed: true,
          reasonSelected: `No valid TAF at ${ownAirport.code}; using nearest reporting aerodrome ${nearby.airport.code} (${nearby.distanceNm.toFixed(1)} NM). ${nearby.selected.reason}`,
          selectedAirportIcao: nearby.airport.code
        }
      });

      logSourceSelection({ point, nearest: nearby, source: nearby.selected.source, reason: null });
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
      sourceLabel: selected.source === 'TAF'
        ? `TAF ${nearest.airport.code}${nearest.distanceNm > 0 ? ` • ${Math.max(1, Math.round(nearest.distanceNm))} NM` : ''}`
        : `${selected.source} ${nearest.airport.code}`,
      pointEtaIso,
      sourceSelection: {
        ownAirport: false,
        nearestAirport: nearest.airport.code,
        nearestDistanceNm: nearest.distanceNm,
        fallbackUsed: false,
        reasonSelected: selected.reason,
        selectedAirportIcao: nearest.airport.code
      }
    });

    logSourceSelection({ point, nearest, source: selected.source, reason: null });
  });

  const forecastEntries = routeReferences
    .map((point, index) => ({ point, index }))
    .filter(entry => !weatherByIndex.has(entry.index));

  if (forecastEntries.length) {
    const forecastPoints = forecastEntries.map(entry => entry.point);
    const { representatives, representativeIndexByPoint } = pickRepresentativePoints(forecastPoints);
    const representativeWeather = await fetchRepresentativeWeather(representatives, forecastIso, requestCache, { model: null });

    forecastEntries.forEach((entry, forecastIndex) => {
      const weather = representativeWeather.get(representatives[representativeIndexByPoint[forecastIndex]]);
      const selectedAirportNoLocalTaf = selectedAirportNoLocalTafIndexes.has(entry.index);
      weatherByIndex.set(entry.index, {
        source: 'Forecast',
        sourceReason: selectedAirportNoLocalTaf
          ? 'No local TAF available.'
          : 'No valid TAF or recent METAR was available for this point; using model forecast.',
        sourceLabel: selectedAirportNoLocalTaf
          ? 'Model • No local TAF available.'
          : 'Model',
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
        rawVisibilityM: weather.rawVisibilityM,
        modelIdentifierRequested: weather.modelIdentifierRequested,
        modelIdentifierReturned: weather.modelIdentifierReturned,
        previousHourValues: weather.previousHourValues || null,
        nextHourValues: weather.nextHourValues || null,
        visibilityKm: weather.visibilityKm,
        precipitationMm: weather.precipitationMm,
        weatherCode: weather.weatherCode,
        windKt: weather.windKt,
        windDirection: weather.windDirection,
        gustKt: weather.gustKt
      });
    });
  }

  const samples = routeReferences.map((point, pointIndex) => {
    const weather = weatherByIndex.get(pointIndex);
    if (!weather) throw new Error('Weather data unavailable for one or more route points. Please try again.');

    const terrainElevationFt = Number.isFinite(point.terrainElevationFt)
      ? point.terrainElevationFt
      : Number.isFinite(point.elevationFt)
        ? point.elevationFt
        : null;
    const sample = {
      ...point,
      elevationFt: Number.isFinite(point.elevationFt) ? point.elevationFt : null,
      latitude: point.lat,
      longitude: point.lon,
      terrainElevationFt,
      source: weather.source,
      sourceReason: weather.sourceReason || null,
      sourceLabel: weather.sourceLabel || weather.source,
      tafGroup: weather.tafGroup || null,
      reportingAirportIcao: weather.reportingAirportIcao || null,
      reportingAirportDistanceNm: Number.isFinite(weather.reportingAirportDistanceNm) ? weather.reportingAirportDistanceNm : null,
      pointEtaIso: weather.pointEtaIso || etaByIndex.get(pointIndex) || forecastIso,
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
      rawVisibilityM: Number.isFinite(weather.rawVisibilityM) ? weather.rawVisibilityM : null,
      modelIdentifierRequested: weather.modelIdentifierRequested || null,
      modelIdentifierReturned: weather.modelIdentifierReturned || null,
      previousHourValues: weather.previousHourValues || null,
      nextHourValues: weather.nextHourValues || null,
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
      cavokReported: Boolean(weather.cavokReported),
      sourceSelection: weather.sourceSelection || {
        ownAirport: isAirportReference(point),
        nearestAirport: weather.reportingAirportIcao || null,
        nearestDistanceNm: Number.isFinite(weather.reportingAirportDistanceNm) ? weather.reportingAirportDistanceNm : null,
        fallbackUsed: false,
        reasonSelected: weather.sourceReason || null,
        selectedAirportIcao: weather.reportingAirportIcao || null
      },
      tafDiagnostics: weather.tafDiagnostics || null
    };
    sample.terrainClearance = terrainClearanceWorkflowPlaceholder(sample);
    sample.status = weatherStatus(sample);
    if (sample.source === 'TAF' && sample.tafDiagnostics) {
      const fieldConsistency = buildTafFieldConsistency(sample, point, sample.reportingAirportIcao);
      sample.tafDiagnostics.fieldConsistency = fieldConsistency;
      sample.tafDiagnostics.checks = {
        ...sample.tafDiagnostics.checks,
        valuesComeFromOneSelectedGroup: !fieldConsistency.mixedSourcesDetected,
        fallbackContamination: fieldConsistency.fallbackAirportUsed && !String(sample.sourceLabel || '').includes(String(sample.reportingAirportIcao || '')),
        sourceLabelMatchesSelection: String(sample.sourceLabel || '').trim() === `TAF ${sample.reportingAirportIcao}`
      };

      console.info('[Takeoff TAF diagnostic pipeline]', {
        airport: {
          cardAirport: sample.name,
          icao: String(sample.code || '').toUpperCase(),
          etaUtc: sample.tafDiagnostics.etaIso,
          etaNzt: sample.tafDiagnostics.etaNzt
        },
        sourceSelection: {
          ownAirport: sample.sourceSelection?.ownAirport,
          nearestAirport: sample.sourceSelection?.nearestAirport,
          fallbackUsed: sample.sourceSelection?.fallbackUsed,
          reasonSelected: sample.sourceSelection?.reasonSelected
        },
        rawTaf: {
          text: sample.tafDiagnostics.rawTaf,
          issueTime: sample.tafDiagnostics.issueTimeIso,
          validityStart: sample.tafDiagnostics.validityStartIso,
          validityEnd: sample.tafDiagnostics.validityEndIso,
          status: sample.tafDiagnostics.status
        },
        parser: {
          groupCount: Array.isArray(sample.tafDiagnostics.parserGroups) ? sample.tafDiagnostics.parserGroups.length : 0,
          groups: sample.tafDiagnostics.parserGroups
        },
        etaSelection: {
          selectedGroup: sample.tafDiagnostics.selectedGroup,
          selection: sample.tafDiagnostics.selection
        },
        finalWeatherSample: {
          cloud: sample.cloudDisplay,
          visibility: sample.visibilityText || sample.visibilityKm,
          wind: sample.windText,
          weather: null,
          rain: sample.precipitationMm,
          sourceLabel: sample.sourceLabel
        },
        consistencyCheck: sample.tafDiagnostics.fieldConsistency,
        integrityChecks: sample.tafDiagnostics.checks
      });
    }
    return sample;
  });

  samples.forEach((sample, index) => {
    if (sample.source !== 'Forecast' || !MODEL_PLAUSIBILITY_DIAGNOSTICS_ENABLED) return;

    const previousRoutePoint = samples[index - 1]?.source === 'Forecast' ? samples[index - 1] : null;
    const nextRoutePoint = samples[index + 1]?.source === 'Forecast' ? samples[index + 1] : null;
    const neighborContext = { previousRoutePoint, nextRoutePoint };
    const cloudConfidence = classifyCloudConfidence(sample, neighborContext);
    const visibilityConfidence = classifyVisibilityConfidence(sample, neighborContext);
    const visibilityOutlier = visibilityDropOutlier(sample, neighborContext);
    const cloudOutlier = cloudBaseDropOutlier(sample, neighborContext);
    const cloudConfidenceScored = scoreCloudConfidence(sample, cloudConfidence, cloudOutlier);
    const visibilityConfidenceScored = scoreVisibilityConfidence(sample, visibilityConfidence, visibilityOutlier, neighborContext);
    const aviationReference = buildAviationPlausibilityReference(routeReferences[index], sample.pointEtaIso || forecastIso, metarsByCode, tafsByCode);

    sample.modelPlausibility = {
      stage: 'C',
      cloudConfidence: cloudConfidenceScored.classification,
      cloudConfidenceScore: cloudConfidenceScored.score,
      visibilityConfidence: visibilityConfidenceScored.classification,
      visibilityConfidenceScore: visibilityConfidenceScored.score,
      cloudEvidence: cloudConfidence.evidence,
      cloudEvidenceSummary: cloudConfidenceScored.evidence,
      visibilityEvidence: visibilityConfidence.supports,
      visibilityEvidenceSummary: visibilityConfidenceScored.evidence,
      outliers: {
        visibilityHourlyIsolated: visibilityOutlier.hourlyIsolated,
        visibilityRouteIsolated: visibilityOutlier.routeIsolated,
        cloudHourlyIsolated: cloudOutlier.hourlyIsolated,
        cloudRouteIsolated: cloudOutlier.routeIsolated,
        isolatedLowVisibility: visibilityConfidence.isolatedOutlier
      }
    };

    console.info('[Takeoff model plausibility]', {
      stage: 'C',
      point: {
        name: sample.name,
        latitude: Number.isFinite(sample.latitude) ? Number(sample.latitude.toFixed(4)) : null,
        longitude: Number.isFinite(sample.longitude) ? Number(sample.longitude.toFixed(4)) : null,
        forecastTime: sample.forecastTime,
        modelRequested: sample.modelIdentifierRequested,
        modelReturned: sample.modelIdentifierReturned
      },
      raw: {
        visibilityM: sample.rawVisibilityM,
        cloudCoverTotalPercent: sample.cloudCoverTotalPercent,
        cloudCoverLowPercent: sample.cloudCoverLowPercent,
        cloudCoverMidPercent: sample.cloudCoverMidPercent,
        cloudCoverHighPercent: sample.cloudCoverHighPercent,
        temperature2mC: sample.temperature2mC,
        dewPoint2mC: sample.dewPoint2mC,
        weatherCode: sample.weatherCode,
        precipitationMm: sample.precipitationMm,
        pressureLevels: sample.pressureLevels
      },
      previousRoutePointValues: previousRoutePoint ? {
        name: previousRoutePoint.name,
        rawVisibilityM: previousRoutePoint.rawVisibilityM,
        cloudBaseAmslFt: previousRoutePoint.cloudBaseAmslFt,
        cloudCoverLowPercent: previousRoutePoint.cloudCoverLowPercent,
        weatherCode: previousRoutePoint.weatherCode,
        precipitationMm: previousRoutePoint.precipitationMm
      } : null,
      nextRoutePointValues: nextRoutePoint ? {
        name: nextRoutePoint.name,
        rawVisibilityM: nextRoutePoint.rawVisibilityM,
        cloudBaseAmslFt: nextRoutePoint.cloudBaseAmslFt,
        cloudCoverLowPercent: nextRoutePoint.cloudCoverLowPercent,
        weatherCode: nextRoutePoint.weatherCode,
        precipitationMm: nextRoutePoint.precipitationMm
      } : null,
      previousForecastHourValues: sample.previousHourValues,
      nextForecastHourValues: sample.nextHourValues,
      confidence: {
        cloud: {
          score: cloudConfidenceScored.score,
          classification: cloudConfidenceScored.classification,
          evidence: cloudConfidenceScored.evidence,
          rawEvidence: cloudConfidence
        },
        visibility: {
          score: visibilityConfidenceScored.score,
          classification: visibilityConfidenceScored.classification,
          evidence: visibilityConfidenceScored.evidence,
          rawEvidence: visibilityConfidence
        }
      },
      outlierDecision: {
        visibility: visibilityOutlier,
        cloudBase: cloudOutlier
      },
      aviationCrossCheck: aviationReference ? {
        source: aviationReference.source,
        referenceIcao: aviationReference.referenceIcao,
        modelCloud: sample.cloudDisplay,
        aviationCloud: aviationReference.cloud,
        modelVisibility: Number.isFinite(sample.visibilityKm) ? `${Math.round(sample.visibilityKm)} KM` : null,
        aviationVisibility: aviationReference.visibility,
        difference: {
          visibilityKm: Number.isFinite(sample.visibilityKm) && Number.isFinite(Number(aviationReference.visibility))
            ? Number((sample.visibilityKm - Number(aviationReference.visibility)).toFixed(1))
            : null,
          cloudAmslFt: Number.isFinite(sample.cloudBaseAmslFt) ? sample.cloudBaseAmslFt : null
        },
        flaggedAsOutlier: visibilityOutlier.hourlyIsolated || visibilityOutlier.routeIsolated || cloudOutlier.hourlyIsolated || cloudOutlier.routeIsolated
      } : null
    });

    console.info('[Takeoff model plausibility]', {
      stage: 'C',
      format: 'MODEL CONFIDENCE',
      location: sample.name,
      cloud: {
        score: cloudConfidenceScored.score,
        classification: cloudConfidenceScored.classification,
        evidence: {
          positive: cloudConfidenceScored.evidence.positive.map(item => `✓ ${item}`),
          negative: cloudConfidenceScored.evidence.negative.map(item => `✗ ${item}`)
        }
      },
      visibility: {
        score: visibilityConfidenceScored.score,
        classification: visibilityConfidenceScored.classification,
        evidence: {
          positive: visibilityConfidenceScored.evidence.positive.map(item => `✓ ${item}`),
          negative: visibilityConfidenceScored.evidence.negative.map(item => `✗ ${item}`)
        }
      },
      classification: (visibilityOutlier.hourlyIsolated || visibilityOutlier.routeIsolated || visibilityConfidence.isolatedOutlier)
        ? 'Likely isolated model outlier'
        : 'No isolated outlier signal'
    });
  });

  const forecastPlausibility = samples
    .filter(sample => sample.source === 'Forecast' && sample.modelPlausibility)
    .map(sample => sample.modelPlausibility);
  if (forecastPlausibility.length) {
    const cloudHigh = forecastPlausibility.filter(item => item.cloudConfidence === 'HIGH').length;
    const cloudMedium = forecastPlausibility.filter(item => item.cloudConfidence === 'MEDIUM').length;
    const cloudLow = forecastPlausibility.filter(item => item.cloudConfidence === 'LOW').length;
    const visibilityHigh = forecastPlausibility.filter(item => item.visibilityConfidence === 'HIGH').length;
    const visibilityMedium = forecastPlausibility.filter(item => item.visibilityConfidence === 'MEDIUM').length;
    const visibilityLow = forecastPlausibility.filter(item => item.visibilityConfidence === 'LOW').length;
    const averageCloudConfidence = Number((forecastPlausibility.reduce((sum, item) => sum + (item.cloudConfidenceScore || 0), 0) / forecastPlausibility.length).toFixed(1));
    const averageVisibilityConfidence = Number((forecastPlausibility.reduce((sum, item) => sum + (item.visibilityConfidenceScore || 0), 0) / forecastPlausibility.length).toFixed(1));

    console.info('[Takeoff model plausibility]', {
      stage: 'C',
      format: 'MODEL CONFIDENCE SUMMARY',
      cloud: {
        numberHigh: cloudHigh,
        numberMedium: cloudMedium,
        numberLow: cloudLow,
        averageConfidence: averageCloudConfidence
      },
      visibility: {
        numberHigh: visibilityHigh,
        numberMedium: visibilityMedium,
        numberLow: visibilityLow,
        averageConfidence: averageVisibilityConfidence
      }
    });
  }

  await runModelComparisonDiagnostics(forecastIso, requestCache);
  return samples;
}
