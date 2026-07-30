// TAKEOFF v1.2
alert("app.js loaded");
const departure = document.getElementById("departure");
const destination = document.getElementById("destination");
const altitude = document.getElementById("altitude");
const departureTime = document.getElementById("departureTime");

function updateSummary() {
    document.getElementById("departureSummary").textContent =
        departure.value || "Not entered";

    document.getElementById("destinationSummary").textContent =
        destination.value || "Not entered";

    document.getElementById("altitudeSummary").textContent =
        altitude.value ? altitude.value + " ft" : "Not entered";
}

function saveFlight() {
    const flight = {
        departure: departure.value,
        destination: destination.value,
        altitude: altitude.value,
        departureTime: departureTime.value
    };

    localStorage.setItem("lastFlight", JSON.stringify(flight));
    updateSummary();
}

function loadFlight() {
    const saved = localStorage.getItem("lastFlight");
    if (!saved) return;

    const flight = JSON.parse(saved);

    departure.value = flight.departure || "";
    destination.value = flight.destination || "";
    altitude.value = flight.altitude || "";
    departureTime.value = flight.departureTime || "";

    updateSummary();
}

function reverseRoute() {
    [departure.value, destination.value] =
        [destination.value, departure.value];

    saveFlight();
}

async function getWeather() {

    document.getElementById("weatherResult").innerHTML =
        "<p>Loading...</p>";

    document.getElementById("weatherResult").innerHTML = `
        <h3>Weather Brief</h3>
        <p><strong>Departure:</strong> ${departure.value}</p>
        <p><strong>Destination:</strong> ${destination.value}</p>
        <p>🌤 VFR</p>
        <p>💨 NW 15 kt</p>
        <p>☁️ SCT 5000 ft</p>
        <p>👀 Visibility 20 km</p>
    `;
}

document.getElementById("weatherButton").addEventListener("click", getWeather);
document.getElementById("reverseButton").addEventListener("click", reverseRoute);
document.getElementById("saveButton").addEventListener("click", saveFlight);

document.querySelectorAll("input").forEach(input =>
    input.addEventListener("input", saveFlight)
);

loadFlight();
