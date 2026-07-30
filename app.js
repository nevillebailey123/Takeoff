"use strict";

// TAKEOFF v1.6
// General forecast information only.
// Not an official aviation weather briefing.

const $ = (id) => document.getElementById(id);

const aerodromes = {
    NZAA: { name: "Auckland", lat: -37.0082, lon: 174.7850 },
    NZAR: { name: "Ardmore", lat: -37.0297, lon: 174.9733 },
    NZAS: { name: "Ashburton", lat: -43.9033, lon: 171.7967 },
    NZCH: { name: "Christchurch", lat: -43.4894, lon: 172.5322 },
    NZDN: { name: "Dunedin", lat: -45.9281, lon: 170.1983 },
    NZHK: { name: "Hokitika", lat: -42.7136, lon: 170.9853 },
    NZHN: { name: "Hamilton", lat: -37.8667, lon: 175.3321 },
    NZHT: { name: "Haast", lat: -43.8650, lon: 169.0410 },
    NZMF: { name: "Milford Sound", lat: -44.6733, lon: 167.9233 },
    NZMK: { name: "Motueka", lat: -41.1233, lon: 172.9886 },
    NZNS: { name: "Nelson", lat: -41.2983, lon: 173.2211 },
    NZNV: { name: "Invercargill", lat: -46.4124, lon: 168.3130 },
    NZPM: { name: "Palmerston North", lat: -40.3206, lon: 175.6170 },
    NZPP: { name: "Paraparaumu", lat: -40.9047, lon: 174.9890 },
    NZQN: { name: "Queenstown", lat: -45.0211, lon: 168.7390 },
    NZRO: { name: "Rotorua", lat: -38.1092, lon: 176.3172 },
    NZTG: { name: "Tauranga", lat: -37.6719, lon: 176.1960 },
    NZTU: { name: "Gisborne", lat: -38.6633, lon: 177.9783 },
    NZWB: { name: "Woodbourne", lat: -41.5183, lon: 173.8700 },
    NZWF: { name: "Wānaka", lat: -44.7222, lon: 169.2456 },
    NZWN: { name: "Wellington", lat: -41.3272, lon: 174.8053 },
    NZWR: { name: "Whangārei", lat: -35.7683, lon: 174.3650 }
};

let departure;
let destination;
let altitude;
let departureTime;
let cruiseSpeed;
let weatherButton;
let weatherResult;

function normaliseCode(value) {
    return String(value || "").trim().toUpperCase();
}

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value;
    }
}

function setClass(id, className) {
    const element = $(id);

    if (element) {
        element.className = className;
    }
}

function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

function toDegrees(radians) {
    return radians * 180 / Math.PI;
}

function calculateDistanceNm(start, end) {
    const earthRadiusNm = 3440.065;

    const lat1 = toRadians(start.lat);
    const lat2 = toRadians(end.lat);
    const deltaLat = toRadians(end.lat - start.lat);
    const deltaLon = toRadians(end.lon - start.lon);

    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLon / 2) ** 2;

    const c = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );

    return earthRadiusNm * c;
}

function calculateBearing(start, end) {
    const lat1 = toRadians(start.lat);
    const lat2 = toRadians(end.lat);
    const deltaLon = toRadians(end.lon - start.lon);

    const y = Math.sin(deltaLon) * Math.cos(lat2);

    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) *
        Math.cos(lat2) *
        Math.cos(deltaLon);

    return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function formatFlightTime(hours) {
    if (!Number.isFinite(hours) || hours <= 0) {
        return "Not calculated";
    }

    const totalMinutes = Math.round(hours * 60);
    const flightHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (flightHours === 0) {
        return `${minutes} min`;
    }

    return `${flightHours} hr ${minutes
        .toString()
        .padStart(2, "0")} min`;
}

function calculateRoute() {
    const depCode = normaliseCode(departure.value);
    const destCode = normaliseCode(destination.value);

    const start = aerodromes[depCode];
    const end = aerodromes[destCode];

    if (!start || !end) {
        setText("distanceValue", "Not calculated");
        setText("bearingValue", "Not calculated");
        setText("flightTimeValue", "Not calculated");
        return;
    }

    const distance = calculateDistanceNm(start, end);
    const bearing = calculateBearing(start, end);

    const speed = Number(cruiseSpeed.value);
    const flightTime = speed > 0
        ? distance / speed
        : null;

    setText(
        "distanceValue",
        `${Math.round(distance)} NM`
    );

    setText(
        "bearingValue",
        `${Math.round(bearing)
            .toString()
            .padStart(3, "0")}° true`
    );

    setText(
        "flightTimeValue",
        flightTime
            ? formatFlightTime(flightTime)
            : "Enter cruise speed"
    );
}

function updateSummary() {
    setText(
        "departureSummary",
        normaliseCode(departure.value) || "Not entered"
    );

    setText(
        "destinationSummary",
        normaliseCode(destination.value) || "Not entered"
    );

    setText(
        "altitudeSummary",
        altitude.value
            ? `${altitude.value} ft`
            : "Not entered"
    );

    setText(
        "speedSummary",
        cruiseSpeed.value
            ? `${cruiseSpeed.value} kt`
            : "Not entered"
    );

    calculateRoute();
}

function saveFlight(showConfirmation = false) {
    const flight = {
        departure: normaliseCode(departure.value),
        destination: normaliseCode(destination.value),
        altitude: altitude.value,
        departureTime: departureTime.value,
        cruiseSpeed: cruiseSpeed.value
    };

    try {
        localStorage.setItem(
            "lastFlight",
            JSON.stringify(flight)
        );
    } catch (error) {
        console.warn("Could not save flight", error);
    }

    updateSummary();

    if (showConfirmation) {
        setText("statusValue", "Route Saved");

        window.setTimeout(() => {
            const status = $("statusValue");

            if (
                status &&
                status.textContent === "Route Saved"
            ) {
                status.textContent = "Awaiting Weather";
            }
        }, 1600);
    }
}

function loadFlight() {
    try {
        const saved = localStorage.getItem("lastFlight");

        if (!saved) {
            updateSummary();
            return;
        }

        const flight = JSON.parse(saved);

        departure.value = flight.departure || "";
        destination.value = flight.destination || "";
        altitude.value = flight.altitude || "";
        departureTime.value = flight.departureTime || "";
        cruiseSpeed.value = flight.cruiseSpeed || "110";

        updateSummary();
    } catch (error) {
        console.warn("Could not load saved flight", error);
        updateSummary();
    }
}

function reverseRoute() {
    const oldDeparture = departure.value;

    departure.value = destination.value;
    destination.value = oldDeparture;

    saveFlight();
}

function makeWeatherUrl(airport) {
    const params = new URLSearchParams({
        latitude: airport.lat,
        longitude: airport.lon,
        current: [
            "temperature_2m",
            "apparent_temperature",
            "precipitation",
            "weather_code",
            "cloud_cover",
            "wind_speed_10m",
            "wind_direction_10m",
            "wind_gusts_10m"
        ].join(","),
        wind_speed_unit: "kn",
        timezone: "auto"
    });

    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function fetchAirportWeather(code) {
    const airport = aerodromes[code];

    const response = await fetch(
        makeWeatherUrl(airport),
        { cache: "no-store" }
    );

    if (!response.ok) {
        throw new Error(
            `Weather service returned ${response.status}`
        );
    }

    const data = await response.json();

    if (!data.current) {
        throw new Error("Weather data was incomplete");
    }

    return {
        code,
        airport,
        current: data.current
    };
}

function compassDirection(degrees) {
    if (!Number.isFinite(degrees)) {
        return "–";
    }

    const points = [
        "N",
        "NE",
        "E",
        "SE",
        "S",
        "SW",
        "W",
        "NW"
    ];

    return points[Math.round(degrees / 45) % 8];
}

function weatherDescription(code) {
    const descriptions = {
        0: "Clear",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Rime fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Heavy drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        80: "Rain showers",
        81: "Rain showers",
        82: "Heavy showers",
        95: "Thunderstorm",
        96: "Thunderstorm with hail",
        99: "Thunderstorm with hail"
    };

    return descriptions[code] || "Forecast available";
}

function safeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function renderAirportWeather(item) {
    const weather = item.current;

    const temperature = safeNumber(
        weather.temperature_2m
    );

    const apparent = safeNumber(
        weather.apparent_temperature
    );

    const wind = safeNumber(
        weather.wind_speed_10m
    );

    const gust = safeNumber(
        weather.wind_gusts_10m
    );

    const direction = safeNumber(
        weather.wind_direction_10m
    );

    const cloud = safeNumber(
        weather.cloud_cover
    );

    const precipitation = safeNumber(
        weather.precipitation
    );

    const weatherCode = safeNumber(
        weather.weather_code
    );

    return `
        <article class="weather-card">

            <div class="airport-name">
                ${item.code} · ${item.airport.name}
            </div>

            <h3>
                ${weatherDescription(weatherCode)}
            </h3>

            <p>
                🌡
                <strong>
                    ${Math.round(temperature)}°C
                </strong>
                · feels ${Math.round(apparent)}°C
            </p>

            <p>
                💨
                <strong>
                    ${Math.round(direction)
                        .toString()
                        .padStart(3, "0")}°
                    ${compassDirection(direction)}
                    at ${Math.round(wind)} kt
                </strong>
            </p>

            <p>
                ↗️ Gusts ${Math.round(gust)} kt
            </p>

            <p>
                ☁️ Cloud cover ${Math.round(cloud)}%
            </p>

            <p>
                🌧 Precipitation
                ${precipitation.toFixed(1)} mm
            </p>

        </article>
    `;
}

function assessWeather(items) {
    const values = items.map(({ current }) => ({
        wind: safeNumber(current.wind_speed_10m),
        gust: safeNumber(current.wind_gusts_10m),
        cloud: safeNumber(current.cloud_cover),
        precipitation: safeNumber(current.precipitation),
        code: safeNumber(current.weather_code)
    }));

    const severeCode = values.some((value) =>
        [65, 75, 82, 95, 96, 99].includes(value.code)
    );

    const highConcern =
        values.some((value) =>
            value.gust >= 30 ||
            value.wind >= 22 ||
            value.precipitation >= 4
        ) || severeCode;

    const review = values.some((value) =>
        value.gust >= 20 ||
        value.wind >= 15 ||
        value.cloud >= 85 ||
        value.precipitation > 0
    );

    const panel = $("decisionPanel");

    if (panel) {
        panel.classList.remove(
            "good",
            "review",
            "bad"
        );
    }

    if (highConcern) {
        if (panel) {
            panel.classList.add("bad");
        }

        setText(
            "decisionTitle",
            "🔴 HIGH CONCERN"
        );

        setText(
            "decisionMessage",
            "General forecast data flags stronger wind, gusts, precipitation or significant weather. Check official aviation sources before making any decision."
        );

        setText(
            "warningsValue",
            "Weather flags"
        );

        return;
    }

    if (review) {
        if (panel) {
            panel.classList.add("review");
        }

        setText(
            "decisionTitle",
            "🟠 REVIEW"
        );

        setText(
            "decisionMessage",
            "Some general forecast elements deserve a closer look. Confirm the full picture using official aviation weather and NOTAM sources."
        );

        setText(
            "warningsValue",
            "Review required"
        );

        return;
    }

    if (panel) {
        panel.classList.add("good");
    }

    setText(
        "decisionTitle",
        "🟢 LOWER CONCERN"
    );

    setText(
        "decisionMessage",
        "No obvious concern was found in this limited general forecast snapshot. This is not a flight-release or go/no-go recommendation."
    );

    setText(
        "warningsValue",
        "None detected"
    );
}

async function getWeather() {
    const depCode = normaliseCode(
        departure.value
    );

    const destCode = normaliseCode(
        destination.value
    );

    departure.value = depCode;
    destination.value = destCode;

    saveFlight();

    const missing = [];

    if (!aerodromes[depCode]) {
        missing.push(depCode || "departure");
    }

    if (!aerodromes[destCode]) {
        missing.push(destCode || "destination");
    }

    if (missing.length > 0) {
        setText(
            "weatherBadge",
            "CHECK ROUTE"
        );

        setClass(
            "weatherBadge",
            "weather-badge error"
        );

        setText(
            "statusValue",
            "Route Error"
        );

        weatherResult.innerHTML = `
            <p class="error-text">
                Unsupported aerodrome:
                ${missing.join(" and ")}.
            </p>
        `;

        return;
    }

    weatherButton.disabled = true;
    weatherButton.textContent =
        "Loading weather…";

    setText(
        "weatherBadge",
        "LOADING"
    );

    setClass(
        "weatherBadge",
        "weather-badge"
    );

    setText(
        "statusValue",
        "Loading Weather"
    );

    weatherResult.innerHTML =
        "<p>Contacting the forecast service…</p>";

    try {
        const items = await Promise.all([
            fetchAirportWeather(depCode),
            fetchAirportWeather(destCode)
        ]);

        weatherResult.innerHTML = `
            <div class="weather-grid">
                ${items
                    .map(renderAirportWeather)
                    .join("")}
            </div>
        `;

        assessWeather(items);

        setText(
            "weatherBadge",
            "LIVE"
        );

        setClass(
            "weatherBadge",
            "weather-badge live"
        );

        setText(
            "statusValue",
            "Forecast Loaded"
        );

        setText(
            "updatedValue",
            new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            })
        );
    } catch (error) {
        console.error(error);

        setText(
            "weatherBadge",
            "ERROR"
        );

        setClass(
            "weatherBadge",
            "weather-badge error"
        );

        setText(
            "statusValue",
            "Weather Error"
        );

        setText(
            "warningsValue",
            "Service unavailable"
        );

        weatherResult.innerHTML = `
            <p class="error-text">
                Unable to retrieve weather right now.
                Check your internet connection and try again.
            </p>
        `;
    } finally {
        weatherButton.disabled = false;
        weatherButton.textContent =
            "🌦 Get Weather Briefing";
    }
}

function initialiseApp() {
    departure = $("departure");
    destination = $("destination");
    altitude = $("altitude");
    departureTime = $("departureTime");
    cruiseSpeed = $("cruiseSpeed");
    weatherButton = $("weatherButton");
    weatherResult = $("weatherResult");

    const reverseButton = $("reverseButton");
    const saveButton = $("saveButton");

    weatherButton.addEventListener(
        "click",
        getWeather
    );

    reverseButton.addEventListener(
        "click",
        reverseRoute
    );

    saveButton.addEventListener(
        "click",
        () => saveFlight(true)
    );

    document
        .querySelectorAll("input")
        .forEach((input) => {
            input.addEventListener(
                "input",
                () => saveFlight()
            );
        });

    departure.addEventListener(
        "blur",
        () => {
            departure.value =
                normaliseCode(departure.value);

            saveFlight();
        }
    );

    destination.addEventListener(
        "blur",
        () => {
            destination.value =
                normaliseCode(destination.value);

            saveFlight();
        }
    );

    loadFlight();
}

document.addEventListener(
    "DOMContentLoaded",
    initialiseApp
);
