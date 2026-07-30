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
