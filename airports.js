import { landmarks } from './landmarks.js';

export const airports = [
  { code: 'NZAA', name: 'Auckland', type: 'airport', hasMetar: true, hasTaf: true, lat: -37.0082, lon: 174.7850, elevationFt: 23 },
  { code: 'NZAP', name: 'Taupo', type: 'airport', hasMetar: false, hasTaf: false, lat: -38.7397, lon: 176.0840, elevationFt: 1335 },
  { code: 'NZAR', name: 'Ardmore', type: 'airport', hasMetar: true, hasTaf: true, lat: -37.0297, lon: 174.9733, elevationFt: 111 },
  { code: 'NZAS', name: 'Ashburton', type: 'airport', hasMetar: true, hasTaf: true, lat: -43.9033, lon: 171.7967, elevationFt: 298 },
  { code: 'NZCH', name: 'Christchurch', type: 'airport', hasMetar: true, hasTaf: true, lat: -43.4894, lon: 172.5322, elevationFt: 123 },
  { code: 'NZCI', name: 'Chatham Islands', type: 'airport', hasMetar: true, hasTaf: true, lat: -43.8100, lon: -176.4570, elevationFt: 43 },
  { code: 'NZDN', name: 'Dunedin', type: 'airport', hasMetar: true, hasTaf: true, lat: -45.9281, lon: 170.1983, elevationFt: 4 },
  { code: 'NZGB', name: 'Great Barrier', type: 'airport', hasMetar: true, hasTaf: false, lat: -36.2414, lon: 175.4728, elevationFt: 20 },
  { code: 'NZGS', name: 'Gisborne', type: 'airport', hasMetar: true, hasTaf: true, lat: -38.6633, lon: 177.9783, elevationFt: 15 },
  { code: 'NZHK', name: 'Hokitika', type: 'airport', hasMetar: true, hasTaf: true, lat: -42.7136, lon: 170.9853, elevationFt: 146 },
  { code: 'NZHN', name: 'Hamilton', type: 'airport', hasMetar: true, hasTaf: true, lat: -37.8667, lon: 175.3321, elevationFt: 172 },
  { code: 'NZHT', name: 'Haast', type: 'airport', hasMetar: true, hasTaf: false, lat: -43.8653, lon: 169.0414, elevationFt: 19 },
  { code: 'NZKI', name: 'Kaikoura', type: 'airport', hasMetar: true, hasTaf: true, lat: -42.4250, lon: 173.6053, elevationFt: 19 },
  { code: 'NZKK', name: 'Kerikeri', type: 'airport', hasMetar: true, hasTaf: false, lat: -35.2628, lon: 173.9119, elevationFt: 492 },
  { code: 'NZKT', name: 'Kaitaia', type: 'airport', hasMetar: true, hasTaf: false, lat: -35.0697, lon: 173.2853, elevationFt: 270 },
  { code: 'NZLX', name: 'Alexandra', type: 'airport', hasMetar: true, hasTaf: false, lat: -45.2117, lon: 169.3733, elevationFt: 752 },
  { code: 'NZMC', name: 'Mount Cook', type: 'airport', hasMetar: true, hasTaf: true, lat: -43.7647, lon: 170.1331, elevationFt: 2153 },
  { code: 'NZMF', name: 'Milford Sound', type: 'airport', hasMetar: true, hasTaf: true, lat: -44.6733, lon: 167.9233, elevationFt: 10 },
  { code: 'NZMK', name: 'Motueka', type: 'airport', hasMetar: true, hasTaf: false, lat: -41.1214, lon: 172.9889, elevationFt: 23 },
  { code: 'NZMO', name: 'Manapouri', type: 'airport', hasMetar: true, hasTaf: true, lat: -45.5331, lon: 167.6500, elevationFt: 687 },
  { code: 'NZMS', name: 'Masterton', type: 'airport', hasMetar: true, hasTaf: true, lat: -40.9733, lon: 175.6336, elevationFt: 364 },
  { code: 'NZNE', name: 'North Shore', type: 'airport', hasMetar: true, hasTaf: false, lat: -36.7897, lon: 174.6553, elevationFt: 23 },
  { code: 'NZNP', name: 'New Plymouth', type: 'airport', hasMetar: true, hasTaf: true, lat: -39.0086, lon: 174.1792, elevationFt: 89 },
  { code: 'NZNR', name: 'Napier', type: 'airport', hasMetar: true, hasTaf: true, lat: -39.4658, lon: 176.8700, elevationFt: 7 },
  { code: 'NZNS', name: 'Nelson', type: 'airport', hasMetar: true, hasTaf: true, lat: -41.2983, lon: 173.2211, elevationFt: 17 },
  { code: 'NZNV', name: 'Invercargill', type: 'airport', hasMetar: true, hasTaf: true, lat: -46.4124, lon: 168.3129, elevationFt: 5 },
  { code: 'NZOH', name: 'Ohakea', type: 'airport', hasMetar: true, hasTaf: true, lat: -40.2060, lon: 175.3878, elevationFt: 164 },
  { code: 'NZOM', name: 'Omaka', type: 'airport', hasMetar: true, hasTaf: false, lat: -41.5131, lon: 173.8286, elevationFt: 188 },
  { code: 'NZOU', name: 'Oamaru', type: 'airport', hasMetar: true, hasTaf: true, lat: -44.9700, lon: 171.0817, elevationFt: 99 },
  { code: 'NZPM', name: 'Palmerston North', type: 'airport', hasMetar: true, hasTaf: true, lat: -40.3206, lon: 175.6172, elevationFt: 151 },
  { code: 'NZPP', name: 'Paraparaumu', type: 'airport', hasMetar: true, hasTaf: true, lat: -40.9047, lon: 174.9892, elevationFt: 22 },
  { code: 'NZQN', name: 'Queenstown', type: 'airport', hasMetar: true, hasTaf: true, lat: -45.0211, lon: 168.7392, elevationFt: 1171 },
  { code: 'NZRC', name: "Ryan's Creek", type: 'airport', hasMetar: false, hasTaf: false, lat: -46.8997, lon: 168.1010, elevationFt: 62 },
  { code: 'NZRO', name: 'Rotorua', type: 'airport', hasMetar: true, hasTaf: true, lat: -38.1092, lon: 176.3172, elevationFt: 935 },
  { code: 'NZTK', name: 'Takaka', type: 'airport', hasMetar: false, hasTaf: false, lat: -40.8133, lon: 172.7750, elevationFt: 102 },
  { code: 'NZTG', name: 'Tauranga', type: 'airport', hasMetar: true, hasTaf: true, lat: -37.6719, lon: 176.1961, elevationFt: 13 },
  { code: 'NZTH', name: 'Thames', type: 'airport', hasMetar: true, hasTaf: false, lat: -37.1567, lon: 175.5519, elevationFt: 10 },
  { code: 'NZTL', name: 'Tekapo', type: 'airport', hasMetar: true, hasTaf: false, lat: -44.0053, lon: 170.4440, elevationFt: 2496 },
  { code: 'NZTM', name: 'Taumarunui', type: 'airport', hasMetar: true, hasTaf: false, lat: -38.8422, lon: 175.2581, elevationFt: 1125 },
  { code: 'NZTU', name: 'Timaru', type: 'airport', hasMetar: true, hasTaf: true, lat: -44.3028, lon: 171.2253, elevationFt: 89 },
  { code: 'NZUK', name: 'Pukaki', type: 'airport', hasMetar: true, hasTaf: true, lat: -44.2350, lon: 170.1183, elevationFt: 1575 },
  { code: 'NZWB', name: 'Woodbourne', type: 'airport', hasMetar: true, hasTaf: true, lat: -41.5183, lon: 173.8703, elevationFt: 109 },
  { code: 'NZWF', name: 'Wanaka', type: 'airport', hasMetar: true, hasTaf: true, lat: -44.7222, lon: 169.2456, elevationFt: 1142 },
  { code: 'NZWH', name: 'Whenuapai', type: 'airport', hasMetar: true, hasTaf: true, lat: -36.7878, lon: 174.6328, elevationFt: 90 },
  { code: 'NZWN', name: 'Wellington', type: 'airport', hasMetar: true, hasTaf: true, lat: -41.3272, lon: 174.8053, elevationFt: 42 },
  { code: 'NZWK', name: 'Whakatane', type: 'airport', hasMetar: false, hasTaf: false, lat: -37.9222, lon: 176.9170, elevationFt: 20 },
  { code: 'NZWO', name: 'Wairoa', type: 'airport', hasMetar: true, hasTaf: false, lat: -39.0069, lon: 177.4067, elevationFt: 42 },
  { code: 'NZWR', name: 'Whangarei', type: 'airport', hasMetar: true, hasTaf: false, lat: -35.7683, lon: 174.3650, elevationFt: 133 },
  { code: 'NZWT', name: 'Whitianga', type: 'airport', hasMetar: false, hasTaf: false, lat: -36.8287, lon: 175.6828, elevationFt: 10 },
  { code: 'NZWU', name: 'Whanganui', type: 'airport', hasMetar: true, hasTaf: true, lat: -39.9622, lon: 175.0253, elevationFt: 27 },
  { code: 'NZWL', name: 'Westport', type: 'airport', hasMetar: true, hasTaf: false, lat: -41.7381, lon: 171.5808, elevationFt: 13 }
];

export const locations = [...airports, ...landmarks];

const normalise = value => String(value || '').trim().toUpperCase();

export function resolveLocation(value) {
  const key = normalise(value);
  if (!key) return null;
  return locations.find(location =>
    normalise(location.code) === key || normalise(location.name) === key
  ) || null;
}

export function titleForInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^[A-Za-z]{3,4}$/.test(text)) return text.toUpperCase();
  return text.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
