let map;
let layerGroup;
let markers = [];

const statusColour = status => ({
  good: '#22c55e', review: '#eab308', caution: '#f97316', poor: '#ef4444', unknown: '#64748b'
}[status] || '#64748b');

const formatCloud = sample => sample.cloudDisplay || '—';

const formatVisibility = sample => sample.source === 'METAR'
  ? (sample.visibilityText || '—')
  : Number.isFinite(sample.visibilityKm)
    ? (sample.visibilityKm >= 20 ? '>20 KM' : `${Math.round(sample.visibilityKm)} KM`)
    : '—';

const formatWind = sample => sample.source === 'METAR' && sample.windText
  ? sample.windText
  : `${String(sample.windDirection).padStart(3, '0')}/${sample.windKt}${sample.gustKt > sample.windKt ? ` G${sample.gustKt}` : ''}`;

const formatRain = sample => sample.precipitationMm > .2 ? `${sample.precipitationMm.toFixed(1)} MM` : 'NIL';

const popupContent = sample => `<div>
  <strong>${sample.name.toUpperCase()}</strong><br>
  Cloud base: ${formatCloud(sample)}<br>
  Visibility: ${formatVisibility(sample)}<br>
  Wind: ${formatWind(sample)}<br>
  Rain: ${formatRain(sample)}<br>
  ${sample.source === 'METAR' ? `Temp: ${Number.isFinite(sample.metarTempC) ? `${sample.metarTempC} C` : '—'}<br>
  Dew Point: ${Number.isFinite(sample.metarDewPointC) ? `${sample.metarDewPointC} C` : '—'}<br>
  QNH: ${Number.isFinite(sample.metarQnhHpa) ? `${sample.metarQnhHpa} HPA` : '—'}<br>
  Obs Time: ${sample.metarObsTime || '—'}<br>` : ''}
  ${sample.sourceLabel || sample.source || 'Forecast'}
</div>`;

function ensureMap() {
  if (map) return map;
  map = L.map('routeMap', { zoomControl: true, preferCanvas: true });
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
  return map;
}

export function clearMap() {
  if (layerGroup) layerGroup.clearLayers();
  markers = [];
}

export function renderRouteMap(routeLinePoints, weatherReferencePoints, onSelect) {
  const instance = ensureMap();
  clearMap();
  const routeLatLngs = routeLinePoints.map(point => [point.lat, point.lon]);
  const markerLatLngs = weatherReferencePoints.map(point => [point.lat, point.lon]);
  L.polyline(routeLatLngs, { color: '#111827', weight: 4, opacity: .95 }).addTo(layerGroup);

  markers = weatherReferencePoints.map((sample, index) => {
    const isAirport = sample.type === 'airport';
    const icon = L.divIcon({
      className: '',
      html: `<div class="route-marker ${isAirport ? 'airport' : ''}" style="background:${statusColour(sample.status)}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    const marker = L.marker([sample.lat, sample.lon], { icon }).addTo(layerGroup);
    marker.bindPopup(popupContent(sample));
    marker.on('click', event => {
      onSelect(index);
      L.DomEvent.stopPropagation(event);
    });
    marker.bindTooltip(sample.name, { direction: 'top', offset: [0, -8] });
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
