import { locations, resolveLocation, titleForInput } from './airports.js';
import { buildRouteReferences, routeDistanceNm } from './routeReferences.js';
import { fetchRouteWeather } from './weather.js';
import { saveFlight, loadFlight } from './storage.js';
import { renderRouteMap, highlightMarker } from './map.js';
import { populateDaySelect, renderBriefingHeader, renderLimitingBanner, renderWeatherCards, highlightCard } from './ui.js';

const $ = id => document.getElementById(id);
const inputs = {
  departure: $('departure'), waypoint1: $('waypoint1'), waypoint2: $('waypoint2'), destination: $('destination'),
  day: $('daySelect'), time: $('departureTime'), speed: $('cruiseSpeed')
};
const briefingButton = $('briefingButton');
const briefingPanel = $('briefingPanel');
const weatherCards = $('weatherCards');
const departureTimeField = $('departureTimeField');
const departureTimeButton = $('departureTimeButton');
const departureTimeValue = $('departureTimeValue');
const timePickerOverlay = $('timePickerOverlay');
const timePickerWheel = $('timePickerWheel');
const timePickerCancel = $('timePickerCancel');
const timePickerDone = $('timePickerDone');

const TIME_STEP_MINUTES = 15;
const TIME_VALUES = Array.from({ length: 24 * 60 / TIME_STEP_MINUTES }, (_, index) => {
  const totalMinutes = index * TIME_STEP_MINUTES;
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
});

let savedPeriod = 'AM';
let timePickerOriginalValue = '';
let timeWheelBuilt = false;
let timeWheelScrollTimer = null;
let timePickerOpen = false;

function formatTimeValue(totalMinutes) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const minutes = String(normalized % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function nearestUpcomingTime(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return formatTimeValue(Math.ceil(minutes / TIME_STEP_MINUTES) * TIME_STEP_MINUTES);
}

function timeValueIndex(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return 0;
  return (Number(match[1]) * 60 + Number(match[2])) / TIME_STEP_MINUTES;
}

function updateTimeDisplay(value) {
  const nextValue = TIME_VALUES.includes(value) ? value : nearestUpcomingTime();
  inputs.time.value = nextValue;
  departureTimeValue.textContent = nextValue;
  departureTimeButton.setAttribute('aria-label', `Departure time ${nextValue}`);
}

function setSelectedTime(value, { scrollIntoView = false } = {}) {
  const nextValue = TIME_VALUES.includes(value) ? value : nearestUpcomingTime();
  updateTimeDisplay(nextValue);
  if (!timeWheelBuilt) return;
  const buttons = [...timePickerWheel.querySelectorAll('.time-picker-option')];
  buttons.forEach(button => button.classList.toggle('is-selected', button.dataset.value === nextValue));
  if (scrollIntoView) {
    const selectedButton = buttons.find(button => button.dataset.value === nextValue);
    selectedButton?.scrollIntoView({ block: 'center' });
  }
}

function commitSelectedTime() {
  saveCurrent();
}

function buildTimeWheel() {
  if (timeWheelBuilt) return;
  timePickerWheel.innerHTML = TIME_VALUES.map(value => `<button type="button" class="time-picker-option" data-value="${value}">${value}</button>`).join('');
  timePickerWheel.querySelectorAll('.time-picker-option').forEach(button => {
    button.addEventListener('click', () => setSelectedTime(button.dataset.value, { scrollIntoView: true }));
  });
  timePickerWheel.addEventListener('scroll', () => {
    if (!timePickerOpen) return;
    clearTimeout(timeWheelScrollTimer);
    timeWheelScrollTimer = setTimeout(() => {
      const wheelMidpoint = timePickerWheel.scrollTop + timePickerWheel.clientHeight / 2;
      let closestButton = null;
      let closestDelta = Infinity;
      timePickerWheel.querySelectorAll('.time-picker-option').forEach(button => {
        const buttonMidpoint = button.offsetTop + button.offsetHeight / 2;
        const delta = Math.abs(buttonMidpoint - wheelMidpoint);
        if (delta < closestDelta) {
          closestDelta = delta;
          closestButton = button;
        }
      });
      if (closestButton) setSelectedTime(closestButton.dataset.value);
    }, 80);
  });
  timeWheelBuilt = true;
}

function openTimePicker() {
  buildTimeWheel();
  if (!inputs.time.value) updateTimeDisplay(nearestUpcomingTime());
  timePickerOriginalValue = inputs.time.value;
  timePickerOverlay.hidden = false;
  document.body.classList.add('time-picker-open');
  timePickerOpen = true;
  requestAnimationFrame(() => {
    setSelectedTime(inputs.time.value || nearestUpcomingTime(), { scrollIntoView: true });
  });
}

function closeTimePicker(commit) {
  if (!timePickerOpen) return;
  clearTimeout(timeWheelScrollTimer);
  timePickerOpen = false;
  timePickerOverlay.hidden = true;
  document.body.classList.remove('time-picker-open');
  if (!commit) {
    setSelectedTime(timePickerOriginalValue, { scrollIntoView: false });
    return;
  }
  commitSelectedTime();
}

function clampDayValue(value) {
  const day = Number(value);
  if (!Number.isFinite(day)) return '0';
  return String(Math.max(0, Math.min(5, Math.round(day))));
}

function populateLocations() {
  $('locationList').innerHTML = locations.map(item => `<option value="${item.code}">${item.name}</option><option value="${item.name}">${item.code}</option>`).join('');
}

function stateFromFields() {
  return {
    departure: inputs.departure.value,
    waypoint1: inputs.waypoint1.value,
    waypoint2: inputs.waypoint2.value,
    destination: inputs.destination.value,
    day: clampDayValue(inputs.day.value),
    time: inputs.time.value,
    period: savedPeriod,
    speed: inputs.speed.value
  };
}

function saveCurrent() { saveFlight(stateFromFields()); }

function restoreSaved() {
  const saved = loadFlight();
  if (!saved) return false;
  Object.entries({ departure:'departure', waypoint1:'waypoint1', waypoint2:'waypoint2', destination:'destination', day:'day', time:'time', speed:'speed' })
    .forEach(([key, inputKey]) => { if (saved[key] != null) inputs[inputKey].value = saved[key]; });
  savedPeriod = saved.period || savedPeriod;
  inputs.day.value = clampDayValue(inputs.day.value);
  if (!TIME_VALUES.includes(inputs.time.value)) {
    updateTimeDisplay(nearestUpcomingTime());
  } else {
    updateTimeDisplay(inputs.time.value);
  }
  return true;
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
  date.setHours(hour, minute || 0, 0, 0);
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
    const speed = Math.max(40, Number(inputs.speed.value || 110));
    const samples = await fetchRouteWeather(references, forecastDate.toISOString(), {
      departureIso: forecastDate.toISOString(),
      cruiseSpeedKt: speed
    });
    const distance = userRoute.length === 1 ? 0 : routeDistanceNm(userRoute);
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

  departureTimeField.addEventListener('click', event => {
    event.preventDefault();
    openTimePicker();
  });
  timePickerCancel.addEventListener('click', () => closeTimePicker(false));
  timePickerDone.addEventListener('click', () => closeTimePicker(true));
  timePickerOverlay.addEventListener('click', event => {
    if (event.target === timePickerOverlay) closeTimePicker(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && timePickerOpen) closeTimePicker(false);
  });

  [inputs.departure, inputs.waypoint1, inputs.waypoint2, inputs.destination].forEach(input => {
    input.addEventListener('focus', () => setTimeout(() => input.select(), 0));
    input.addEventListener('blur', () => normaliseField(input));
    input.addEventListener('input', saveCurrent);
  });
  [inputs.day, inputs.speed].forEach(input => input.addEventListener('change', saveCurrent));

  document.querySelector('.route-panel').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); getBriefing(); }
  });
}

populateLocations();
populateDaySelect(inputs.day);
const restoredSavedState = restoreSaved();
if (!restoredSavedState) updateTimeDisplay(nearestUpcomingTime());
bindEvents();
