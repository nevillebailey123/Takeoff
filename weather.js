const API = 'https://api.open-meteo.com/v1/forecast';

function nearestIndex(times, targetIso) {
  const target = new Date(targetIso).getTime();
  let best = 0;
  let bestDelta = Infinity;
  times.forEach((time, index) => {
    const delta = Math.abs(new Date(time).getTime() - target);
    if (git statusdelta < bestDelta) { best = index; bestDelta = delta; }
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

export function weatherStatus(sample) {
  const ranks = { good: 0, review: 1, caution: 2, poor: 3, unknown: -1 };
  const statuses = [];
  const agl = sample.cloudBaseAglFt;
  if (Number.isFinite(agl)) {
    statuses.push(agl < 1000 ? 'poor' : agl < 2000 ? 'caution' : agl < 3000 ? 'review' : 'good');
  }
  if (Number.isFinite(sample.visibilityKm)) {
    statuses.push(sample.visibilityKm < 5 ? 'poor' : sample.visibilityKm < 10 ? 'caution' : sample.visibilityKm < 20 ? 'review' : 'good');
  }
  if (Number.isFinite(sample.windKt)) {
    statuses.push(sample.windKt > 30 ? 'poor' : sample.windKt > 20 ? 'caution' : sample.windKt > 15 ? 'review' : 'good');
  }
  if (Number.isFinite(sample.gustKt)) {
    statuses.push(sample.gustKt > 35 ? 'poor' : sample.gustKt > 25 ? 'caution' : sample.gustKt > 20 ? 'review' : 'good');
  }
  if (!statuses.length) return 'unknown';
  return statuses.sort((a, b) => ranks[b] - ranks[a])[0];
}

export async function fetchRouteWeather(routeReferences, forecastIso) {
  const requests = routeReferences.map(async point => {
    const params = new URLSearchParams({
      latitude: point.lat,
      longitude: point.lon,
      hourly: 'temperature_2m,dew_point_2m,visibility,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit: 'kn',
      timezone: 'Pacific/Auckland',
      forecast_days: '4'
    });
    const response = await fetch(`${API}?${params.toString()}`);
    if (!response.ok) throw new Error(`Weather request failed for ${point.name}`);
    const data = await response.json();
    const i = nearestIndex(data.hourly.time, forecastIso);
    const aglFt = estimateCloudBaseFt(data.hourly.temperature_2m[i], data.hourly.dew_point_2m[i]);
    const amslFt = Number.isFinite(aglFt) && Number.isFinite(point.elevationFt) ? aglFt + point.elevationFt : aglFt;
    const sample = {
      ...point,
      forecastTime: data.hourly.time[i],
      cloudBaseAglFt: roundHundred(aglFt),
      cloudBaseAmslFt: roundHundred(amslFt),
      visibilityKm: visibilityKm(data.hourly.visibility[i]),
      precipitationMm: data.hourly.precipitation[i],
      weatherCode: data.hourly.weather_code[i],
      windKt: Math.round(data.hourly.wind_speed_10m[i] ?? 0),
      windDirection: Math.round(data.hourly.wind_direction_10m[i] ?? 0),
      gustKt: Math.round(data.hourly.wind_gusts_10m[i] ?? 0)
    };
    sample.status = weatherStatus(sample);
    return sample;
  });
  return Promise.all(requests);
}
