import { formatCloud } from './cloudFormatting.js';

let map;
let layerGroup;
let markers = [];
let dataOverlayLayer;
let dataOverlayEnabled = false;
let dataOverlayDensity = 'normal';
let dataOverlayForecastIso = null;
let dataOverlayRequestToken = 0;

const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const NZ_DOMAIN = {
  south: -47.5,
  north: -34.0,
  west: 166.0,
  east: 178.8
};
const WIND_KT_PER_KMH = 0.539957;
const OVERLAY_DENSITY = {
  coarse: 2.0,
  normal: 1.5,
  fine: 1.1
};

const statusColour = status => ({
  good: '#22c55e', review: '#eab308', caution: '#f97316', poor: '#ef4444', unknown: '#64748b'
}[status] || '#64748b');

const formatCloudForSurface = (sample, surface) => formatCloud(sample, { surface });

const formatVisibility = sample => sample.cavokReported
  ? '≥10 KM'
  : sample.source === 'METAR' || sample.source === 'TAF'
    ? (sample.visibilityText || (Number.isFinite(sample.visibilityKm) ? `${Math.round(sample.visibilityKm)} KM` : '—'))
    : Number.isFinite(sample.visibilityKm)
      ? (sample.visibilityKm >= 20 ? '>20 KM' : `${Math.round(sample.visibilityKm)} KM`)
      : '—';

const formatWind = sample => (sample.windText && sample.windText !== '—')
  ? sample.windText
  : `${String(sample.windDirection).padStart(3, '0')}/${sample.windKt}${sample.gustKt > sample.windKt ? ` G${sample.gustKt}` : ''}`;

const formatRain = sample => sample.precipitationMm > .2 ? `${sample.precipitationMm.toFixed(1)} MM` : 'NIL';

const popupContent = sample => `<div>
  <strong>${sample.name.toUpperCase()}</strong><br>
  Cloud: ${formatCloudForSurface(sample, 'popup')}<br>
  Visibility: ${formatVisibility(sample)}<br>
  Wind: ${formatWind(sample)}<br>
  Rain: ${formatRain(sample)}<br>
  ${sample.source === 'METAR' ? `Temp: ${Number.isFinite(sample.metarTempC) ? `${sample.metarTempC} C` : '—'}<br>
  Dew Point: ${Number.isFinite(sample.metarDewPointC) ? `${sample.metarDewPointC} C` : '—'}<br>
  QNH: ${Number.isFinite(sample.metarQnhHpa) ? `${sample.metarQnhHpa} HPA` : '—'}<br>
  Obs Time: ${sample.metarObsTime || '—'}<br>` : ''}
  ${sample.sourceLabel || sample.source || 'Forecast'}
</div>`;

const hoverContent = sample => `${sample.name} · ${formatCloudForSurface(sample, 'hover')}`;

function windArrowFromDirection(direction) {
  if (!Number.isFinite(direction)) return null;
  const normalized = ((Math.round(direction) % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  return arrows[index] || null;
}

function markerWindIndicator(sample) {
  const arrow = windArrowFromDirection(sample.windDirection);
  if (!arrow || !Number.isFinite(sample.windKt)) return '';
  const speed = String(Math.max(0, Math.round(sample.windKt))).padStart(2, '0');
  return `<span class="route-marker-wind">${arrow}${speed}</span>`;
}

function controls() {
  return {
    toggle: document.getElementById('metvuwToggle'),
    lead: document.getElementById('metvuwLead'),
    refresh: document.getElementById('metvuwRefresh'),
    status: document.getElementById('mapStatus')
  };
}

function setMapStatus(message) {
  const { status } = controls();
  if (!status) return;
  status.textContent = message;
}

function overlayGlyph(direction, speedKt) {
  const arrow = windArrowFromDirection(direction) || '•';
  const speed = Number.isFinite(speedKt) ? Math.max(0, Math.round(speedKt)) : 0;
  return `${arrow}${String(speed).padStart(2, '0')}`;
}

function rainColor(mm) {
  if (!Number.isFinite(mm) || mm <= 0.05) return null;
  if (mm < 0.5) return '#7dd3fc';
  if (mm < 1.5) return '#38bdf8';
  if (mm < 3) return '#0ea5e9';
  if (mm < 6) return '#0284c7';
  return '#0369a1';
}

function gridPointsForDomain(stepDegrees) {
  const points = [];
  for (let lat = NZ_DOMAIN.south; lat <= NZ_DOMAIN.north + 0.001; lat += stepDegrees) {
    for (let lon = NZ_DOMAIN.west; lon <= NZ_DOMAIN.east + 0.001; lon += stepDegrees) {
      points.push({
        lat: Number(lat.toFixed(3)),
        lon: Number(lon.toFixed(3))
      });
    }
  }
  return points;
}

function nearestHourIndex(times, targetMs) {
  if (!Array.isArray(times) || !times.length || !Number.isFinite(targetMs)) return -1;
  let bestIndex = -1;
  let bestDelta = Infinity;
  times.forEach((time, index) => {
    const ms = new Date(time).getTime();
    if (!Number.isFinite(ms)) return;
    const delta = Math.abs(ms - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });
  return bestIndex;
}

async function fetchGridPointForecast(point, targetIso) {
  const params = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lon),
    hourly: 'precipitation,wind_speed_10m,wind_direction_10m',
    timezone: 'UTC',
    forecast_days: '6'
  });
  const response = await fetch(`${WEATHER_API}?${params.toString()}`);
  if (!response.ok) throw new Error(`Open-Meteo request failed (${response.status})`);
  const payload = await response.json();
  const hourly = payload?.hourly;
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const targetMs = new Date(targetIso).getTime();
  const index = nearestHourIndex(times, targetMs);
  if (index < 0) return null;

  const windKmh = Number(hourly?.wind_speed_10m?.[index]);
  const windDirection = Number(hourly?.wind_direction_10m?.[index]);
  const precipitationMm = Number(hourly?.precipitation?.[index]);
  return {
    ...point,
    windKt: Number.isFinite(windKmh) ? windKmh * WIND_KT_PER_KMH : null,
    windDirection: Number.isFinite(windDirection) ? windDirection : null,
    precipitationMm: Number.isFinite(precipitationMm) ? precipitationMm : 0,
    timeIso: times[index] || null
  };
}

async function fetchGridForecast(points, targetIso, concurrency = 8) {
  const results = [];
  for (let index = 0; index < points.length; index += concurrency) {
    const chunk = points.slice(index, index + concurrency);
    const chunkResults = await Promise.all(chunk.map(point =>
      fetchGridPointForecast(point, targetIso).catch(() => null)
    ));
    results.push(...chunkResults.filter(Boolean));
  }
  return results;
}

function ensureDataOverlayLayer() {
  if (!map) return null;
  if (dataOverlayLayer) return dataOverlayLayer;
  dataOverlayLayer = L.layerGroup();
  return dataOverlayLayer;
}

function clearDataOverlay() {
  if (!map || !dataOverlayLayer) return;
  dataOverlayLayer.clearLayers();
  if (map.hasLayer(dataOverlayLayer)) map.removeLayer(dataOverlayLayer);
}

function renderDataOverlay(gridSamples) {
  const layer = ensureDataOverlayLayer();
  if (!layer) return;
  layer.clearLayers();

  gridSamples.forEach(sample => {
    const color = rainColor(sample.precipitationMm);
    if (color) {
      L.circle([sample.lat, sample.lon], {
        radius: 32000,
        stroke: false,
        fillColor: color,
        fillOpacity: 0.22,
        pane: 'windRainPane'
      }).addTo(layer);
    }

    const glyph = overlayGlyph(sample.windDirection, sample.windKt);
    const icon = L.divIcon({
      className: 'wind-overlay-icon',
      html: `<span class="wind-overlay-glyph">${glyph}</span>`,
      iconSize: [34, 16],
      iconAnchor: [17, 8]
    });
    const marker = L.marker([sample.lat, sample.lon], {
      icon,
      pane: 'windRainPane',
      interactive: false
    });
    marker.addTo(layer);
  });

  if (!map.hasLayer(layer)) layer.addTo(map);
}

async function updateWeatherDataOverlay({ forceRefresh = false } = {}) {
  if (!map) return;
  if (!dataOverlayEnabled) {
    clearDataOverlay();
    setMapStatus('');
    return;
  }

  if (!dataOverlayForecastIso) {
    setMapStatus('Build a briefing first to load wind/rain data.');
    return;
  }

  const activeToken = ++dataOverlayRequestToken;
  setMapStatus('Loading wind/rain data...');

  const stepDegrees = OVERLAY_DENSITY[dataOverlayDensity] || OVERLAY_DENSITY.normal;
  const points = gridPointsForDomain(stepDegrees);
  const samples = await fetchGridForecast(points, dataOverlayForecastIso);
  if (activeToken !== dataOverlayRequestToken) return;

  if (!samples.length) {
    clearDataOverlay();
    setMapStatus('Wind/rain data unavailable right now.');
    return;
  }

  renderDataOverlay(samples);
  const sampleTime = samples[0].timeIso ? new Date(samples[0].timeIso).toISOString().slice(11, 16) : null;
  const refreshLabel = forceRefresh ? ' (refreshed)' : '';
  setMapStatus(`Wind/rain data • ${samples.length} points${sampleTime ? ` • ${sampleTime} UTC` : ''}${refreshLabel}`);
}

function bindMapControls() {
  const { toggle, lead, refresh } = controls();
  if (!toggle || !lead || !refresh || toggle.dataset.bound === '1') return;

  [
    { value: 'coarse', label: 'COARSE' },
    { value: 'normal', label: 'NORMAL' },
    { value: 'fine', label: 'FINE' }
  ].forEach(entry => {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    lead.appendChild(option);
  });
  lead.value = dataOverlayDensity;

  toggle.checked = dataOverlayEnabled;
  toggle.addEventListener('change', () => {
    dataOverlayEnabled = Boolean(toggle.checked);
    updateWeatherDataOverlay({ forceRefresh: false });
  });
  lead.addEventListener('change', () => {
    dataOverlayDensity = OVERLAY_DENSITY[lead.value] ? lead.value : 'normal';
    updateWeatherDataOverlay({ forceRefresh: false });
  });
  refresh.addEventListener('click', () => updateWeatherDataOverlay({ forceRefresh: true }));

  toggle.dataset.bound = '1';
}

function ensureMap() {
  if (map) return map;
  map = L.map('routeMap', { zoomControl: true, preferCanvas: true });
  const windRainPane = map.createPane('windRainPane');
  windRainPane.style.zIndex = '350';
  windRainPane.style.pointerEvents = 'none';

  const primaryTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  let fallbackLoaded = false;
  primaryTiles.on('tileerror', () => {
    if (fallbackLoaded) return;
    fallbackLoaded = true;
    primaryTiles.setUrl('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png');
  });
  layerGroup = L.layerGroup().addTo(map);
  bindMapControls();
  return map;
}

export function clearMap() {
  if (layerGroup) layerGroup.clearLayers();
  markers = [];
}

export function renderRouteMap(routeLinePoints, weatherReferencePoints, onSelect, forecastIso = null) {
  const instance = ensureMap();
  clearMap();
  dataOverlayForecastIso = forecastIso || weatherReferencePoints[0]?.pointEtaIso || dataOverlayForecastIso;
  updateWeatherDataOverlay({ forceRefresh: false });
  const routeLatLngs = routeLinePoints.map(point => [point.lat, point.lon]);
  const markerLatLngs = weatherReferencePoints.map(point => [point.lat, point.lon]);
  L.polyline(routeLatLngs, { color: '#111827', weight: 4, opacity: .95 }).addTo(layerGroup);

  markers = weatherReferencePoints.map((sample, index) => {
    const isAirport = sample.type === 'airport';
    const icon = L.divIcon({
      className: '',
      html: `<div class="route-marker-wrap"><div class="route-marker ${isAirport ? 'airport' : ''}" style="background:${statusColour(sample.status)}"></div>${markerWindIndicator(sample)}</div>`,
      iconSize: [58, 24],
      iconAnchor: [9, 9]
    });
    const marker = L.marker([sample.lat, sample.lon], { icon }).addTo(layerGroup);
    marker.bindPopup(popupContent(sample));
    marker.on('click', event => {
      onSelect(index);
      L.DomEvent.stopPropagation(event);
    });
    marker.bindTooltip(hoverContent(sample), { direction: 'top', offset: [0, -8] });
    return marker;
  });

  requestAnimationFrame(() => {
    instance.invalidateSize();
    if (markerLatLngs.length === 1) instance.setView(markerLatLngs[0], 8);
    else instance.fitBounds(L.latLngBounds(markerLatLngs), { padding: [45, 45], maxZoom: 9 });
  });
}

export function highlightMarker(index) {
  markers.forEach((marker, markerIndex) => {
    const el = marker.getElement()?.querySelector('.route-marker');
    if (!el) return;
    el.classList.toggle('active', markerIndex === index);
    if (markerIndex !== index) marker.closePopup();
  });
  const marker = markers[index];
  if (marker && map) {
    map.panTo(marker.getLatLng(), { animate: true, duration: .35 });
    marker.openPopup();
  }
}
