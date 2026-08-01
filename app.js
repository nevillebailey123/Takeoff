import { locations, resolveLocation, titleForInput } from './airports.js';
import { buildRouteReferences, routeDistanceNm } from './routeReferences.js';
import { fetchRouteWeather } from './weather.js';
import { saveFlight, loadFlight } from './storage.js';
import { renderRouteMap, highlightMarker } from './map.js';
import { populateDaySelect, renderBriefingHeader, renderLimitingBanner, renderWeatherCards, highlightCard } from './ui.js';

const $ = id => document.getElementById(id);
const inputs = {
  departure: $('departure'), waypoint1: $('waypoint1'), waypoint2: $('waypoint2'), destination: $('destination'),
  day: $('daySelect'), time: $('departureTime'), period: $('periodToggle'), speed: $('cruiseSpeed')
};
const briefingButton = $('briefingButton');
const briefingPanel = $('briefingPanel');
const weatherCards = $('weatherCards');

function populateLocations() {
  $('locationList').innerHTML = locations.map(item => `<option value="${item.code}">${item.name}</option><option value="${item.name}">${item.code}</option>`).join('');
}

function stateFromFields() {
  return {
    departure: inputs.departure.value,
    waypoint1: inputs.waypoint1.value,
    waypoint2: inputs.waypoint2.value,
    destination: inputs.destination.value,
    day: inputs.day.value,
    time: inputs.time.value,
    period: inputs.period.textContent,
    speed: inputs.speed.value
  };
}

function saveCurrent() { saveFlight(stateFromFields()); }

function restoreSaved() {
  const saved = loadFlight();
  if (!saved) return;
  Object.entries({ departure:'departure', waypoint1:'waypoint1', waypoint2:'waypoint2', destination:'destination', day:'day', time:'time', speed:'speed' })
    .forEach(([key, inputKey]) => { if (saved[key] != null) inputs[inputKey].value = saved[key]; });
  if (saved.period === 'PM') inputs.period.textContent = 'PM';
}

function normaliseField(input) {
  const resolved = resolveLocation(input.value);
  input.value = resolved ? (resolved.code.length <= 4 ? resolved.code : resolved.name.toUpperCase()) : titleForInput(input.value).toUpperCase();
  saveCurrent();
}

function reverseRoute() {
  const values = [inputs.departure.value, inputs.waypoint1.value, inputs.waypoint2.value, inputs.destination.value].filter(Boolean);
  const reversed = values.reverse();
  inputs.departure.value = reversed[0] || '';
  inputs.waypoint1.value = reversed.length === 4 ? reversed[1] : '';
  inputs.waypoint2.value = reversed.length === 4 ? reversed[2] : '';
  inputs.destination.value = reversed.length > 1 ? reversed[reversed.length - 1] : '';
  saveCurrent();
}

function selectedForecastDate() {
  const [hour, minute] = inputs.time.value.split(':').map(Number);
  const date = new Date();
  date.setDate(date.getDate() + Number(inputs.day.value || 0));
  let h = hour;
  if (inputs.period.textContent === 'PM' && h < 12) h += 12;
  if (inputs.period.textContent === 'AM' && h === 12) h = 0;
  date.setHours(h, minute || 0, 0, 0);
  return date;
}

function buildUserRoute() {
  const raw = [inputs.departure.value, inputs.waypoint1.value, inputs.waypoint2.value, inputs.destination.value].filter(Boolean);
  if (!raw.length) throw new Error('Enter a departure location.');
  if (raw.length === 1) {
    const start = resolveLocation(raw[0]);
    if (!start) throw new Error(`Location not recognised: ${raw[0]}`);
    return [start];
  }
  return raw.map(value => {
    const point = resolveLocation(value);
    if (!point) throw new Error(`Location not recognised: ${value}`);
    return point;
  });
}

function selectReference(index) {
  highlightCard(weatherCards, index);
  highlightMarker(index);
}

async function getBriefing() {
  $('formMessage').textContent = '';
  briefingButton.disabled = true;
  $('loadingOverlay').hidden = false;
  try {
    const userRoute = buildUserRoute();
    const references = userRoute.length === 1 ? userRoute : buildRouteReferences(userRoute, 50);
    const forecastDate = selectedForecastDate();
    const samples = await fetchRouteWeather(references, forecastDate.toISOString());
    const distance = userRoute.length === 1 ? 0 : routeDistanceNm(userRoute);
    const speed = Math.max(40, Number(inputs.speed.value || 110));
    const etaMinutes = distance / speed * 60;

    briefingPanel.hidden = false;
    renderBriefingHeader($('briefingHeader'), userRoute.map(p => p.name.toUpperCase()), distance, etaMinutes, samples,
      `${forecastDate.toLocaleDateString('en-NZ',{weekday:'long',day:'numeric',month:'short'}).toUpperCase()} • ${forecastDate.toLocaleTimeString('en-NZ',{hour:'2-digit',minute:'2-digit'})} NZT`);
    renderLimitingBanner($('limitingBanner'), samples, selectReference);
    renderWeatherCards(weatherCards, samples, selectReference);
    renderRouteMap(userRoute, samples, selectReference);
    saveCurrent();
    briefingPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    $('formMessage').textContent = error.message || 'Unable to build briefing.';
  } finally {
    briefingButton.disabled = false;
    $('loadingOverlay').hidden = true;
  }
}

function bindEvents() {
  $('reverseButton').addEventListener('click', reverseRoute);
  briefingButton.addEventListener('click', getBriefing);
  inputs.period.addEventListener('click', () => { inputs.period.textContent = inputs.period.textContent === 'AM' ? 'PM' : 'AM'; saveCurrent(); });

  [inputs.departure, inputs.waypoint1, inputs.waypoint2, inputs.destination].forEach(input => {
    input.addEventListener('focus', () => setTimeout(() => input.select(), 0));
    input.addEventListener('blur', () => normaliseField(input));
    input.addEventListener('input', saveCurrent);
  });
  [inputs.day, inputs.time, inputs.speed].forEach(input => input.addEventListener('change', saveCurrent));

  document.querySelector('.route-panel').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); getBriefing(); }
  });
}

populateLocations();
populateDaySelect(inputs.day);
restoreSaved();
bindEvents();
