

// TAKEOFF v1.4
// General forecast information only. Not an official aviation briefing.

const $ = (id) => document.getElementById(id);

const departure = $("departure");
const destination = $("destination");
const altitude = $("altitude");
const departureTime = $("departureTime");
const weatherButton = $("weatherButton");
const weatherResult = $("weatherResult");

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
    NZWF: { name: "WÄnaka", lat: -44.7222, lon: 169.2456 },
    NZWN: { name: "Wellington", lat: -41.3272, lon: 174.8053 },
    NZWR: { name: "WhangÄrei", lat: -35.7683, lon: 174.3650 }
};

function normaliseCode(value) {
    return value.trim().toUpperCase();
}

function updateSummary() {
    $("departureSummary").textContent = normaliseCode(departure.value) || "Not entered";
    $("destinationSummary").textContent = normaliseCode(destination.value) || "Not entered";
    $("altitudeSummary").textContent = altitude.value ? `${altitude.value} ft` : "Not entered";
}

function saveFlight(showConfirmation = false) {
    const flight = {
        departure: normaliseCode(departure.value),
        destination: normaliseCode(destination.value),
        altitude: altitude.value,
        departureTime: departureTime.value
    };

    localStorage.setItem("lastFlight", JSON.stringify(flight));
    updateSummary();

    if (showConfirmation) {
        $("statusValue").textContent = "Route Saved";
        window.setTimeout(() => {
            if ($("statusValue").textContent === "Route Saved") {
                $("statusValue").textContent = "Awaiting Weather";
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
        updateSummary();
    } catch (error) {
        console.warn("Could not load saved flight", error);
        localStorage.removeItem("lastFlight");
        updateSummary();
    }
}

function reverseRoute() {
    [departure.value, destination.value] = [destination.value, departure.value];
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
    const response = await fetch(makeWeatherUrl(airport), { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`Weather service returned ${response.status}`);
    }

    const data = await response.json();
    if (!data.current) {
        throw new Error("Weather data was incomplete");
    }

    return { code, airport, current: data.current };
}

function compassDirection(degrees) {
    if (!Number.isFinite(degrees)) return "â";
    const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
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

function renderAirportWeather(item) {
    const w = item.current;
    const wind = Number(w.wind_speed_10m);
    const gust = Number(w.wind_gusts_10m);
    const direction = Number(w.wind_direction_10m);
    const cloud = Number(w.cloud_cover);
    const precipitation = Number(w.precipitation);

    return `
        <article class="weather-card">
            <div class="airport-name">${item.code} Â· ${item.airport.name}</div>
            <h3>${weatherDescription(Number(w.weather_code))}</h3>
            <p>ð¡ <strong>${Math.round(Number(w.temperature_2m))}Â°C</strong> Â· feels ${Math.round(Number(w.apparent_temperature))}Â°C</p>
            <p>ð¨ <strong>${Math.round(direction).toString().padStart(3, "0")}Â° ${compassDirection(direction)} at ${Math.round(wind)} kt</strong></p>
            <p>âï¸ Gusts ${Math.round(gust)} kt</p>
            <p>âï¸ Cloud cover ${Math.round(cloud)}%</p>
            <p>ð§ Precipitation ${precipitation.toFixed(1)} mm</p>
        </article>
    `;
}

function assessWeather(items) {
    const values = items.map(({ current }) => ({
        wind: Number(current.wind_speed_10m),
        gust: Number(current.wind_gusts_10m),
        cloud: Number(current.cloud_cover),
        precipitation: Number(current.precipitation),
        code: Number(current.weather_code)
    }));

    const severeCode = values.some((v) => [65, 75, 82, 95, 96, 99].includes(v.code));
    const highConcern = values.some((v) => v.gust >= 30 || v.wind >= 22 || v.precipitation >= 4) || severeCode;
    const review = values.some((v) => v.gust >= 20 || v.wind >= 15 || v.cloud >= 85 || v.precipitation > 0);

    const panel = $("decisionPanel");
    panel.classList.remove("good", "review", "bad");

    if (highConcern) {
        panel.classList.add("bad");
        $("decisionTitle").textContent = "ð´ HIGH CONCERN";
        $("decisionMessage").textContent = "General forecast data flags stronger wind, gusts, precipitation or significant weather. Check official aviation sources before making any decision.";
        $("warningsValue").textContent = "Weather flags";
        return;
    }

    if (review) {
        panel.classList.add("review");
        $("decisionTitle").textContent = "ð  REVIEW";
        $("decisionMessage").textContent = "Some general forecast elements deserve a closer look. Confirm the full picture using official aviation weather and NOTAM sources.";
        $("warningsValue").textContent = "Review required";
        return;
    }

    panel.classList.add("good");
    $("decisionTitle").textContent = "ð¢ LOWER CONCERN";
    $("decisionMessage").textContent = "No obvious concern was found in this limited general forecast snapshot. This is not a flight-release or go/no-go recommendation.";
    $("warningsValue").textContent = "None detected";
}

async function getWeather() {
    const depCode = normaliseCode(departure.value);
    const destCode = normaliseCode(destination.value);

    departure.value = depCode;
    destination.value = destCode;
    saveFlight();

    if (!aerodromes[depCode] || !aerodromes[destCode]) {
        const missing = [];
        if (!aerodromes[depCode]) missing.push(depCode || "departure");
        if (!aerodromes[destCode]) missing.push(destCode || "destination");

        $("weatherBadge").textContent = "CHECK ROUTE";
        $("weatherBadge").className = "weather-badge error";
        $("statusValue").textContent = "Route Error";
        weatherResult.innerHTML = `<p class="error-text">Unsupported aerodrome: ${missing.join(" and ")}. Use one of the codes listed below.</p>`;
        return;
    }

    weatherButton.disabled = true;
    weatherButton.textContent = "Loading weatherâ¦";
    $("weatherBadge").textContent = "LOADING";
    $("weatherBadge").className = "weather-badge";
    $("statusValue").textContent = "Loading Weather";
    weatherResult.innerHTML = "<p>Contacting the forecast serviceâ¦</p>";

    try {
        const items = await Promise.all([
            fetchAirportWeather(depCode),
            fetchAirportWeather(destCode)
        ]);

        weatherResult.innerHTML = `<div class="weather-grid">${items.map(renderAirportWeather).join("")}</div>`;
        assessWeather(items);

        $("weatherBadge").textContent = "LIVE";
        $("weatherBadge").className = "weather-badge live";
        $("statusValue").textContent = "Forecast Loaded";
        $("updatedValue").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (error) {
        console.error(error);
        $("weatherBadge").textContent = "ERROR";
        $("weatherBadge").className = "weather-badge error";
        $("statusValue").textContent = "Weather Error";
        $("warningsValue").textContent = "Service unavailable";
        weatherResult.innerHTML = "<p class=\"error-text\">Unable to retrieve weather right now. Check your internet connection and try again.</p>";
    } finally {
        weatherButton.disabled = false;
        weatherButton.textContent = "ð¦ Get Weather Briefing";
    }
}

$("weatherButton").addEventListener("click", getWeather);
$("reverseButton").addEventListener("click", reverseRoute);
$("saveButton").addEventListener("click", () => saveFlight(true));

document.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => saveFlight());
});

departure.addEventListener("blur", () => {
    departure.value = normaliseCode(departure.value);
    saveFlight();
});

destination.addEventListener("blur", () => {
    destination.value = normaliseCode(destination.value);
    saveFlight();
});

loadFlight();
