const KEY = 'takeoff.route.v2';

export function saveFlight(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function loadFlight() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
