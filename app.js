// TAKEOFF v1.1

const departure = document.getElementById("departure");
const destination = document.getElementById("destination");
const altitude = document.getElementById("altitude");
const departureTime = document.getElementById("departureTime");

function saveFlight() {
    const flight = {
        departure: departure.value,
        destination: destination.value,
        altitude: altitude.value,
        departureTime: departureTime.value
    };

    localStorage.setItem("lastFlight", JSON.stringify(flight));
}

function loadFlight() {
    const saved = localStorage.getItem("lastFlight");

    if (!saved) return;

    const flight = JSON.parse(saved);

    departure.value = flight.departure || "";
    destination.value = flight.destination || "";
    altitude.value = flight.altitude || "";
    departureTime.value = flight.departureTime || "";
}

function reverseRoute() {
    const temp = departure.value;
    departure.value = destination.value;
    destination.value = temp;

    saveFlight();
}

document.querySelectorAll("input").forEach(input => {
    input.addEventListener("change", saveFlight);
});

window.onload = loadFlight;
async function getWeather() {

    const dep = departure.value;
    const dest = destination.value;

    document.getElementById("weatherResult").innerHTML =
        "Loading weather...";

    // Temporary demo

    document.getElementById("weatherResult").innerHTML = `
        <h3>Weather Brief</h3>

        Departure: ${dep}<br>
        Destination: ${dest}<br><br>

        🌤 VFR<br>
        💨 NW 15 kt<br>
        ☁️ SCT 5000 ft<br>
        🌧 Nil<br>
        👀 Visibility 20 km
    `;
}
document.getElementById("weatherButton").addEventListener("click", getWeather);

document.getElementById("reverseButton").addEventListener("click", reverseRoute);

document.getElementById("saveButton").addEventListener("click", saveFlight);
