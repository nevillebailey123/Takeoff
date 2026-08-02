const API = 'https://api.open-meteo.com/v1/forecast';
const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700];
const LOW_LEVEL_MAX_METERS = 3000;
const FT_PER_METER = 3.28084;
const MOIST_WEATHER_CODES = new Set([45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86]);

const points = [
  { name: 'Christchurch', code: 'NZCH', lat: -43.4894, lon: 172.5322, elevationFt: 123 },
  { name: 'Palmerston North', code: 'NZPM', lat: -40.3206, lon: 175.6172, elevationFt: 151 },
  { name: 'Napier', code: 'NZNR', lat: -39.4658, lon: 176.87, elevationFt: 7 },
  { name: 'Kaikoura', code: 'NZKI', lat: -42.425, lon: 173.6053, elevationFt: 19 },
  { name: 'Arthurs Pass (Alpine)', code: 'ARTHURS PASS', lat: -42.9455, lon: 171.5662, elevationFt: 3020 }
];

const hourlyFields = [
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

function nearestIndex(times, targetIso) {
  const target = new Date(targetIso).getTime();
  let best = 0;
  let bestDelta = Infinity;
  times.forEach((time, index) => {
    const delta = Math.abs(new Date(time).getTime() - target);
    if (delta < bestDelta) {
      best = index;
      bestDelta = delta;
    }
  });
  return best;
}

function percentOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

function metersToFeet(value) {
  return Number.isFinite(value) ? value * FT_PER_METER : null;
}

function estimateCloudBaseFt(tempC, dewC) {
  if (!Number.isFinite(tempC) || !Number.isFinite(dewC)) return null;
  const lclFt = Math.max(0, (tempC - dewC) * 400);
  return Math.min(Math.max(lclFt, 0), 20000);
}

function interpolateHeightFt(lowerLevel, upperLevel, threshold, key) {
  const lowerValue = Number(lowerLevel?.[key]);
  const upperValue = Number(upperLevel?.[key]);
  const lowerHeight = Number(lowerLevel?.heightFt);
  const upperHeight = Number(upperLevel?.heightFt);
  if (![lowerValue, upperValue, lowerHeight, upperHeight].every(Number.isFinite)) return null;
  if (upperValue === lowerValue) return upperHeight;
  const ratio = (threshold - lowerValue) / (upperValue - lowerValue);
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return lowerHeight + (upperHeight - lowerHeight) * clampedRatio;
}

function weatherCodeSuggestsMoisture(code) {
  const number = Number(code);
  return Number.isFinite(number) && MOIST_WEATHER_CODES.has(number);
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

  return interpolateHeightFt(lower, current, threshold, metricKey) ?? current.heightFt;
}

function classifyModelCloud(sample, terrainElevationFt) {
  const cloudCoverLowPercent = percentOrNull(sample.cloudCoverLowPercent);
  const pressureLevels = buildPressureLevels(sample);
  const lowLevelPressureLevels = pressureLevels.filter(level => level.heightMeters <= LOW_LEVEL_MAX_METERS);

  const pressureCloudLevelExists = lowLevelPressureLevels.some(level => Number.isFinite(level.cloudCoverPercent) && level.cloudCoverPercent >= 50);
  const pressureHumidityLayerExists = lowLevelPressureLevels.some((level, index) => {
    if (!Number.isFinite(level.relativeHumidityPercent) || level.relativeHumidityPercent < 90) return false;
    return adjacentHumiditySupportsLayer(lowLevelPressureLevels, index);
  });
  const lowLevelMoistureExists = lowLevelPressureLevels.some(level => Number.isFinite(level.relativeHumidityPercent) && level.relativeHumidityPercent >= 85);

  const weatherSupportsCloud = weatherCodeSuggestsMoisture(sample.weatherCode)
    && (lowLevelMoistureExists || (Number.isFinite(cloudCoverLowPercent) && cloudCoverLowPercent >= 20));

  const significantLowCloudLikely = (Number.isFinite(cloudCoverLowPercent) && cloudCoverLowPercent >= 50)
    || pressureCloudLevelExists
    || pressureHumidityLayerExists
    || weatherSupportsCloud;

  const nilConditions = Number.isFinite(cloudCoverLowPercent)
    && cloudCoverLowPercent < 20
    && !pressureCloudLevelExists
    && !pressureHumidityLayerExists
    && !weatherSupportsCloud;

  if (nilConditions) {
    return {
      pressureLevels,
      cloudMethod: 'nil',
      cloudState: 'nil',
      cloudSelectedLayer: null,
      cloudBaseAmslFt: null,
      cloudDisplay: 'Cloud NIL'
    };
  }

  let cloudBaseAmslFt = null;
  let cloudMethod = null;
  let cloudSelectedLayer = null;

  for (let i = 0; i < lowLevelPressureLevels.length; i += 1) {
    const level = lowLevelPressureLevels[i];
    if (Number.isFinite(level.cloudCoverPercent) && level.cloudCoverPercent >= 50) {
      cloudMethod = 'pressure-cloud';
      cloudSelectedLayer = level;
      cloudBaseAmslFt = estimateLayerHeightFt(lowLevelPressureLevels, i, 'cloudCoverPercent', 50);
      break;
    }

    if (Number.isFinite(level.relativeHumidityPercent)
      && level.relativeHumidityPercent >= 90
      && adjacentHumiditySupportsLayer(lowLevelPressureLevels, i)) {
      cloudMethod = 'pressure-humidity';
      cloudSelectedLayer = level;
      cloudBaseAmslFt = estimateLayerHeightFt(lowLevelPressureLevels, i, 'relativeHumidityPercent', 90);
      break;
    }
  }

  if (!Number.isFinite(cloudBaseAmslFt) && significantLowCloudLikely) {
    const lclFt = estimateCloudBaseFt(sample.temperature2mC, sample.dewPoint2mC);
    if (Number.isFinite(lclFt)) {
      cloudMethod = 'lcl-fallback';
      cloudBaseAmslFt = Math.max(Number.isFinite(terrainElevationFt) ? terrainElevationFt : 0, Math.min(lclFt, 20000));
    }
  }

  if (!Number.isFinite(cloudBaseAmslFt)) {
    return {
      pressureLevels,
      cloudMethod: null,
      cloudState: 'unknown',
      cloudSelectedLayer,
      cloudBaseAmslFt: null,
      cloudDisplay: 'Cloud —'
    };
  }

  const rounded = Math.round(cloudBaseAmslFt / 100) * 100;
  return {
    pressureLevels,
    cloudMethod,
    cloudState: 'numeric',
    cloudSelectedLayer,
    cloudBaseAmslFt: rounded,
    cloudDisplay: `Cloud ${rounded}`
  };
}

function parseMetarCeiling(metar, elevationFt) {
  const raw = String(metar?.rawOb || '');
  const tokens = raw.split(/\s+/);
  if (tokens.includes('CAVOK') || tokens.includes('NSC') || tokens.includes('NCD') || tokens.includes('CLR') || tokens.includes('SKC')) {
    return 'NSC/CAVOK';
  }
  const layers = tokens
    .map(token => token.match(/^(BKN|OVC|VV)(\d{3})/))
    .filter(Boolean)
    .map(match => Number(match[2]) * 100)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!layers.length) return 'NIL';
  const lowestAgl = layers[0];
  const amsl = lowestAgl + (Number.isFinite(elevationFt) ? elevationFt : 0);
  return `Cloud ${Math.round(amsl / 100) * 100} (from METAR layer)`;
}

async function fetchOpenMeteoRows() {
  const params = new URLSearchParams({
    latitude: points.map(point => point.lat).join(','),
    longitude: points.map(point => point.lon).join(','),
    hourly: hourlyFields,
    timezone: 'Pacific/Auckland',
    forecast_days: '2'
  });
  const response = await fetch(`${API}?${params.toString()}`);
  if (!response.ok) throw new Error(`Open-Meteo failed: HTTP ${response.status}`);
  const payload = await response.json();
  if (Array.isArray(payload?.responses)) return payload.responses;
  if (Array.isArray(payload)) return payload;
  return [payload];
}

async function fetchChristchurchMetar() {
  const url = 'https://aviationweather.gov/api/data/metar?ids=NZCH&format=json';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`METAR fetch failed: HTTP ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function main() {
  const forecastIso = new Date().toISOString();
  const rows = await fetchOpenMeteoRows();
  const metar = await fetchChristchurchMetar();

  const diagnostics = rows.map((row, index) => {
    const point = points[index];
    const i = nearestIndex(row.hourly.time, forecastIso);
    const sample = {
      forecastTime: row.hourly.time[i],
      temperature2mC: row.hourly.temperature_2m[i],
      dewPoint2mC: row.hourly.dew_point_2m[i],
      cloudCoverLowPercent: percentOrNull(row.hourly.cloud_cover_low[i]),
      cloudCoverMidPercent: percentOrNull(row.hourly.cloud_cover_mid[i]),
      cloudCoverHighPercent: percentOrNull(row.hourly.cloud_cover_high[i]),
      weatherCode: row.hourly.weather_code[i]
    };

    for (const level of PRESSURE_LEVELS) {
      sample[`relative_humidity_${level}hPa`] = row.hourly[`relative_humidity_${level}hPa`]?.[i] ?? null;
      sample[`cloud_cover_${level}hPa`] = row.hourly[`cloud_cover_${level}hPa`]?.[i] ?? null;
      sample[`geopotential_height_${level}hPa`] = row.hourly[`geopotential_height_${level}hPa`]?.[i] ?? null;
    }

    const model = classifyModelCloud(sample, point.elevationFt);

    return {
      location: point.name,
      code: point.code,
      forecastTime: sample.forecastTime,
      lowMidHighCloudCover: {
        low: sample.cloudCoverLowPercent,
        mid: sample.cloudCoverMidPercent,
        high: sample.cloudCoverHighPercent
      },
      pressureLevelRhPercent: model.pressureLevels.map(level => ({ hPa: level.pressureHpa, rh: level.relativeHumidityPercent })),
      pressureLevelCloudPercent: model.pressureLevels.map(level => ({ hPa: level.pressureHpa, cloud: level.cloudCoverPercent })),
      pressureLevelGeopotentialHeights: model.pressureLevels.map(level => ({ hPa: level.pressureHpa, metersAmsl: level.heightMeters, feetAmsl: Math.round(level.heightFt) })),
      selectedCloudLayer: model.cloudSelectedLayer,
      cloudMethod: model.cloudMethod,
      finalDisplayedCloudHeight: model.cloudDisplay
    };
  });

  const christchurch = diagnostics.find(item => item.code === 'NZCH');

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    diagnostics,
    christchurchComparison: {
      modelResult: christchurch?.finalDisplayedCloudHeight || null,
      modelMethod: christchurch?.cloudMethod || null,
      currentMetarRaw: metar?.rawOb || null,
      currentMetarCeilingDisplay: parseMetarCeiling(metar, points[0].elevationFt)
    }
  }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
