let map;
let layerGroup;
let markers = [];

const statusColour = status => ({
  good: '#22c55e', review: '#eab308', caution: '#f97316', poor: '#ef4444', unknown: '#64748b'
}[status] || '#64748b');

function ensureMap() {
  if (map) return map;
  map = L.map('routeMap', { zoomControl: true, preferCanvas: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);
  return map;
}

export function clearMap() {
  if (layerGroup) layerGroup.clearLayers();
  markers = [];
}

export function renderRouteMap(samples, onSelect) {
  const instance = ensureMap();
  clearMap();
  const latlngs = samples.map(sample => [sample.lat, sample.lon]);
  L.polyline(latlngs, { color: '#111827', weight: 4, opacity: .95 }).addTo(layerGroup);

  markers = samples.map((sample, index) => {
    const isAirport = sample.type === 'airport';
    const icon = L.divIcon({
      className: '',
      html: `<div class="route-marker ${isAirport ? 'airport' : ''}" style="background:${statusColour(sample.status)}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    const marker = L.marker([sample.lat, sample.lon], { icon }).addTo(layerGroup);
    marker.on('click', () => onSelect(index));
    marker.bindTooltip(sample.name, { direction: 'top', offset: [0, -8] });
    return marker;
  });

  requestAnimationFrame(() => {
    instance.invalidateSize();
    if (latlngs.length === 1) instance.setView(latlngs[0], 8);
    else instance.fitBounds(L.latLngBounds(latlngs), { padding: [45, 45], maxZoom: 9 });
  });
}

export function highlightMarker(index) {
  markers.forEach((marker, markerIndex) => {
    const el = marker.getElement()?.querySelector('.route-marker');
    if (!el) return;
    el.classList.toggle('active', markerIndex === index);
  });
  const marker = markers[index];
  if (marker && map) map.panTo(marker.getLatLng(), { animate: true, duration: .35 });
}
