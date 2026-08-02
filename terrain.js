const TERRAIN_PROVIDER = 'openTopoData';
const FT_PER_METER = 3.28084;
const OPEN_TOPO_DATA_BASE = 'https://api.opentopodata.org/v1/srtm90m';

const terrainCache = new Map();

function cacheKey(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

function metersToFeet(meters) {
  return Number.isFinite(meters) ? Math.round(meters * FT_PER_METER) : null;
}

async function fetchOpenTopoData(lat, lon) {
  const url = new URL(OPEN_TOPO_DATA_BASE);
  url.searchParams.set('locations', `${lat},${lon}`);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Terrain request failed (HTTP ${response.status}).`);

  const payload = await response.json();
  const elevationMeters = Number(payload?.results?.[0]?.elevation);
  return metersToFeet(elevationMeters);
}

const providers = {
  openTopoData: {
    getElevation: fetchOpenTopoData
  }
};

function providerConfig() {
  return providers[TERRAIN_PROVIDER];
}

export function clearTerrainCache() {
  terrainCache.clear();
}

export function terrainCacheSize() {
  return terrainCache.size;
}

export async function getTerrainElevation(lat, lon) {
  const key = cacheKey(lat, lon);
  if (!key) return null;

  const cached = terrainCache.get(key);
  if (cached) return cached;

  const lookupPromise = providerConfig().getElevation(Number(lat), Number(lon))
    .then(value => (Number.isFinite(value) ? value : null))
    .catch(() => null);

  terrainCache.set(key, lookupPromise);
  return lookupPromise;
}