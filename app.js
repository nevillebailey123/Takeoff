const departureInput = document.querySelector("#departure");
const destinationInput = document.querySelector("#destination");
const departureTimeInput = document.querySelector("#departureTime");
const altitudeInput = document.querySelector("#altitude");
const briefingPanel = document.querySelector("#briefingPanel");
const routeTitle = document.querySelector("#routeTitle");
const summaryDeparture = document.querySelector("#summaryDeparture");
const summaryDestination = document.querySelector("#summaryDestination");
const summaryAltitude = document.querySelector("#summaryAltitude");
const favouritesList = document.querySelector("#favouritesList");

const STORAGE_KEYS = {
  lastFlight: "takeoff-last-flight",
  favourites: "takeoff-favourites"
};

function setDefaultDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset() + 30);
  departureTimeInput.value = now.toISOString().slice(0, 16);
}

function cleanPlace(value) {
  return value.trim().replace(/^([A-Z]{4})\s*-\s*/i, "");
}

function getFlight() {
  return {
    departure: departureInput.value.trim(),
    destination: destinationInput.value.trim(),
    departureTime: departureTimeInput.value,
    altitude: altitudeInput.value
  };
}

function validateFlight(flight) {
  if (!flight.departure || !flight.destination) {
    alert("Enter both a departure and destination.");
    return false;
  }
  if (flight.departure.toLowerCase() === flight.destination.toLowerCase()) {
    alert("Departure and destination need to be different.");
    return false;
  }
  return true;
}

function displayBriefing(flight) {
  routeTitle.textContent = `${cleanPlace(flight.departure)} → ${cleanPlace(flight.destination)}`;
  summaryDeparture.textContent = cleanPlace(flight.departure);
  summaryDestination.textContent = cleanPlace(flight.destination);
  summaryAltitude.textContent = `${Number(flight.altitude).toLocaleString("en-NZ")} ft`;
  briefingPanel.classList.remove("hidden");
  briefingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function saveLastFlight(flight) {
  localStorage.setItem(STORAGE_KEYS.lastFlight, JSON.stringify(flight));
}

function loadLastFlight() {
  const saved = localStorage.getItem(STORAGE_KEYS.lastFlight);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function getFavourites() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.favourites)) || [];
  } catch {
    return [];
  }
}

function saveFavourites(favourites) {
  localStorage.setItem(STORAGE_KEYS.favourites, JSON.stringify(favourites));
}

function renderFavourites() {
  const favourites = getFavourites();
  favouritesList.innerHTML = "";

  if (!favourites.length) {
    favouritesList.innerHTML = '<p class="empty-state">No favourites saved yet.</p>';
    return;
  }

  favourites.forEach((flight, index) => {
    const button = document.createElement("button");
    button.className = "saved-route";
    button.innerHTML = `
      <strong>${cleanPlace(flight.departure)} → ${cleanPlace(flight.destination)}</strong>
      <span>${Number(flight.altitude).toLocaleString("en-NZ")} ft</span>
    `;
    button.addEventListener("click", () => {
      departureInput.value = flight.departure;
      destinationInput.value = flight.destination;
      altitudeInput.value = flight.altitude;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    let holdTimer;
    button.addEventListener("touchstart", () => {
      holdTimer = setTimeout(() => {
        const updated = getFavourites().filter((_, i) => i !== index);
        saveFavourites(updated);
        renderFavourites();
      }, 700);
    });
    button.addEventListener("touchend", () => clearTimeout(holdTimer));

    favouritesList.appendChild(button);
  });
}

document.querySelector("#swapButton").addEventListener("click", () => {
  [departureInput.value, destinationInput.value] =
    [destinationInput.value, departureInput.value];
});

document.querySelector("#checkRouteButton").addEventListener("click", () => {
  const flight = getFlight();
  if (!validateFlight(flight)) return;
  saveLastFlight(flight);
  displayBriefing(flight);
});

document.querySelector("#returnTripButton").addEventListener("click", () => {
  const lastFlight = loadLastFlight();
  if (!lastFlight) {
    alert("No previous flight is saved yet.");
    return;
  }

  departureInput.value = lastFlight.destination;
  destinationInput.value = lastFlight.departure;
  altitudeInput.value = lastFlight.altitude;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector("#saveFavouriteButton").addEventListener("click", () => {
  const flight = getFlight();
  if (!validateFlight(flight)) return;

  const favourites = getFavourites();
  const duplicate = favourites.some(item =>
    item.departure.toLowerCase() === flight.departure.toLowerCase() &&
    item.destination.toLowerCase() === flight.destination.toLowerCase()
  );

  if (duplicate) {
    alert("That route is already saved.");
    return;
  }

  favourites.unshift(flight);
  saveFavourites(favourites.slice(0, 12));
  renderFavourites();
});

setDefaultDateTime();
renderFavourites();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  });
}
