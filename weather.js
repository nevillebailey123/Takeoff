const API = 'https://api.open-meteo.com/v1/forecast';
const METAR_API = 'https://aviationweather.gov/api/data/metar';
const HOURLY_FIELDS = 'temperature_2m,dew_point_2m,visibility,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const NEARBY_THRESHOLD_NM = 3;
const MAX_COORDS_PER_BATCH = 40;

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
  return Math.max(0, (tempC - dewC) * 400);
}

function visibilityKm(valueM) {
  return Number.isFinite(valueM) ? valueM / 1000 : null;
}

function roundHundred(value) {
  return Number.isFinite(value) ? Math.round(value / 100) * 100 : null;
}

function isAirportReference(point) {
  return point.type === 'airport' && !point.automatic && /^[A-Z]{4}$/.test(String(point.code || '').toUpperCase());
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

function parseCloudInfo(raw) {
  const tokens = String(raw || '').split(/\s+/);
  if (tokens.includes('CAVOK')) return { display: 'CAVOK', lowestAglFt: null };
  if (tokens.includes('NSC')) return { display: 'NSC', lowestAglFt: null };
  if (tokens.includes('NCD')) return { display: 'NSC', lowestAglFt: null };

  const layers = tokens.filter(token => /^(FEW|SCT|BKN|OVC|VV)\d{3}(CB|TCU)?$/.test(token));
  if (!layers.length) {
    if (tokens.includes('CLR') || tokens.includes('SKC')) return { display: 'NSC', lowestAglFt: null };
    return { display: '—', lowestAglFt: null };
  }

  const brokenLayers = layers.filter(layer => /^BKN\d{3}/.test(layer));
  if (brokenLayers.length) {
    const bknBase = brokenLayers[0].match(/\d{3}/);
    const lowestAglFt = bknBase ? Number(bknBase[0]) * 100 : null;
    return { display: layers.join(' '), lowestAglFt };
  }

  const overcastOrVertical = layers.filter(layer => /^(OVC|VV)\d{3}/.test(layer));
  if (!overcastOrVertical.length) {
    return { display: layers.join(' '), lowestAglFt: null };
  }

  const baseLayer = overcastOrVertical[0].match(/\d{3}/);
  const lowestAglFt = baseLayer ? Number(baseLayer[0]) * 100 : null;
  return { display: layers.join(' '), lowestAglFt };
}

function parseVisibilityKm(raw, fallbackVisib) {
  const tokens = String(raw || '').split(/\s+/);
  if (tokens.includes('CAVOK')) return { km: 10, text: 'CAVOK' };

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

  if (typeof fallbackVisib === 'string' && fallbackVisib) {
    const n = Number(fallbackVisib.replace('+', ''));
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

async function fetchMetars(icaoCodes, cache) {
  if (!icaoCodes.length) return new Map();
  const params = new URLSearchParams({ ids: icaoCodes.join(','), format: 'json' });
  const directUrl = `${METAR_API}?${params.toString()}`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;

  try {
    const payload = await fetchJsonWithRetry(directUrl, cache);
    const rows = Array.isArray(payload) ? payload : [];
    const byCode = new Map();
    rows.forEach(row => {
      const code = String(row.icaoId || '').toUpperCase();
      if (code) byCode.set(code, row);
    });
    return byCode;
  } catch {
    try {
      const payload = await fetchJsonWithRetry(proxyUrl, cache);
      const rows = Array.isArray(payload) ? payload : [];
      const byCode = new Map();
      rows.forEach(row => {
        const code = String(row.icaoId || '').toUpperCase();
        if (code) byCode.set(code, row);
      });
      return byCode;
    } catch {
      // METAR is an enhancement; if unavailable we fall back to forecast samples.
      return new Map();
    }
  }
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
  return {
    forecastTime: data.hourly.time[i],
    amslFt: estimateCloudBaseFt(data.hourly.temperature_2m[i], data.hourly.dew_point_2m[i]),
    visibilityKm: visibilityKm(data.hourly.visibility[i]),
    precipitationMm: data.hourly.precipitation[i],
    weatherCode: data.hourly.weather_code[i],
    windKt: Math.round(data.hourly.wind_speed_10m[i] ?? 0),
    windDirection: Math.round(data.hourly.wind_direction_10m[i] ?? 0),
    gustKt: Math.round(data.hourly.wind_gusts_10m[i] ?? 0)
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
  const agl = sample.cloudBaseAglFt;
  if (Number.isFinite(agl)) {
    statuses.push(agl < 600 ? 'poor' : agl < 1000 ? 'caution' : 'good');
  }
  if (Number.isFinite(sample.visibilityKm)) {
    statuses.push(sample.visibilityKm < 5 ? 'poor' : sample.visibilityKm < 10 ? 'caution' : sample.visibilityKm < 20 ? 'review' : 'good');
  }
  if (Number.isFinite(sample.windKt)) {
    statuses.push(sample.windKt > 40 ? 'poor' : sample.windKt > 20 ? 'caution' : 'good');
  }
  if (Number.isFinite(sample.gustKt)) {
    statuses.push(sample.gustKt > 40 ? 'poor' : sample.gustKt > 20 ? 'caution' : 'good');
  }
  if (!statuses.length) return 'unknown';
  return statuses.sort((a, b) => ranks[b] - ranks[a])[0];
}

export async function fetchRouteWeather(routeReferences, forecastIso) {
  const requestCache = new Map();
  const weatherByIndex = new Map();

  const airportCandidates = routeReferences
    .map((point, index) => ({ point, index }))
    .filter(entry => isAirportReference(entry.point));

  const airportCodes = [...new Set(airportCandidates.map(entry => String(entry.point.code).toUpperCase()))];
  const metarsByCode = await fetchMetars(airportCodes, requestCache);

  airportCandidates.forEach(({ point, index }) => {
    const metar = metarsByCode.get(String(point.code).toUpperCase());
    if (!metar) return;

    const terrainElevationFt = Number.isFinite(point.elevationFt) ? point.elevationFt : null;
    const cloud = parseCloudInfo(metar.rawOb);
    const visibility = parseVisibilityKm(metar.rawOb, metar.visib);
    const wind = parseWindToken(metar.rawOb);
    const cloudBaseAglFt = Number.isFinite(cloud.lowestAglFt) ? cloud.lowestAglFt : null;
    const cloudBaseAmslFt = Number.isFinite(cloudBaseAglFt) && Number.isFinite(terrainElevationFt)
      ? cloudBaseAglFt + terrainElevationFt
      : null;

    weatherByIndex.set(index, {
      source: 'METAR',
      forecastTime: metar.reportTime || null,
      cloudBaseAmslFt,
      cloudBaseAglFt,
      visibilityKm: visibility.km,
      visibilityText: visibility.text,
      precipitationMm: null,
      weatherCode: null,
      windKt: Number.isFinite(wind.windKt) ? wind.windKt : Math.round(metar.wspd ?? 0),
      windDirection: Number.isFinite(wind.windDirection) || wind.windDirection === 'VRB' ? wind.windDirection : Math.round(metar.wdir ?? 0),
      gustKt: Number.isFinite(wind.gustKt) ? wind.gustKt : Math.round(metar.wgst ?? 0),
      windText: wind.text,
      cloudText: cloud.display,
      metarTempC: Number.isFinite(metar.temp) ? metar.temp : null,
      metarDewPointC: Number.isFinite(metar.dewp) ? metar.dewp : null,
      metarQnhHpa: Number.isFinite(metar.altim) ? Math.round(metar.altim) : null,
      metarObsTime: parseMetarTime(metar.rawOb, metar.reportTime),
      metarRaw: metar.rawOb || ''
    });
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
        forecastTime: weather.forecastTime,
        cloudBaseAmslFt: weather.amslFt,
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

    const amslFt = weather.cloudBaseAmslFt;
    const terrainElevationFt = Number.isFinite(point.elevationFt) ? point.elevationFt : null;
    const aglFt = Number.isFinite(weather.cloudBaseAglFt)
      ? weather.cloudBaseAglFt
      : Number.isFinite(amslFt) && Number.isFinite(terrainElevationFt)
      ? Math.max(0, amslFt - terrainElevationFt)
      : null;
    const sample = {
      ...point,
      elevationFt: terrainElevationFt,
      source: weather.source,
      forecastTime: weather.forecastTime,
      cloudBaseAglFt: roundHundred(aglFt),
      cloudBaseAmslFt: roundHundred(amslFt),
      visibilityKm: weather.visibilityKm,
      visibilityText: weather.visibilityText,
      precipitationMm: weather.precipitationMm,
      weatherCode: weather.weatherCode,
      windKt: weather.windKt,
      windDirection: weather.windDirection,
      gustKt: weather.gustKt,
      windText: weather.windText,
      cloudText: weather.cloudText,
      metarTempC: weather.metarTempC,
      metarDewPointC: weather.metarDewPointC,
      metarQnhHpa: weather.metarQnhHpa,
      metarObsTime: weather.metarObsTime,
      metarRaw: weather.metarRaw
    };
    sample.status = weatherStatus(sample);
    return sample;
  });
}
