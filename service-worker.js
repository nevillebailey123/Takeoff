"use strict";

/*
    TAKEOFF
    Simple New Zealand VFR weather prototype.

    Weather source:
    Open-Meteo public forecast API.

    This is general forecast information only.
    It is not an official aviation weather briefing.
*/


const aerodromes = {

    NZAA: {
        name: "Auckland",
        latitude: -37.0082,
        longitude: 174.7850
    },

    NZAR: {
        name: "Ardmore",
        latitude: -37.0297,
        longitude: 174.9733
    },

    NZCH: {
        name: "Christchurch",
        latitude: -43.4894,
        longitude: 172.5322
    },

    NZDN: {
        name: "Dunedin",
        latitude: -45.9281,
        longitude: 170.1983
    },

    NZHK: {
        name: "Hokitika",
        latitude: -42.7136,
        longitude: 170.9853
    },

    NZHN: {
        name: "Hamilton",
        latitude: -37.8667,
        longitude: 175.3321
    },

    NZHT: {
        name: "Haast",
        latitude: -43.8653,
        longitude: 169.0417
    },

    NZMF: {
        name: "Milford Sound",
        latitude: -44.6733,
        longitude: 167.9233
    },

    NZNS: {
        name: "Nelson",
        latitude: -41.2983,
        longitude: 173.2211
    },

    NZNV: {
        name: "Invercargill",
        latitude: -46.4124,
        longitude: 168.3129
    },

    NZPM: {
        name: "Palmerston North",
        latitude: -40.3206,
        longitude: 175.6172
    },

    NZPP: {
        name: "Paraparaumu",
        latitude: -40.9047,
        longitude: 174.9892
    },

    NZQN: {
        name: "Queenstown",
        latitude: -45.0211,
        longitude: 168.7392
    },

    NZRO: {
        name: "Rotorua",
        latitude: -38.1092,
        longitude: 176.3172
    },

    NZTG: {
        name: "Tauranga",
        latitude: -37.6719,
        longitude: 176.1961
    },

    NZTU: {
        name: "Timaru",
        latitude: -44.3028,
        longitude: 171.2253
    },

    NZWB: {
        name: "Woodbourne",
        latitude: -41.5183,
        longitude: 173.8703
    },

    NZWN: {
        name: "Wellington",
        latitude: -41.3272,
        longitude: 174.8053
    },

    NZWR: {
        name: "Whangārei",
        latitude: -35.7683,
        longitude: 174.3650
    },

    NZAS: {
        name: "Ashburton",
        latitude: -43.9033,
        longitude: 171.7967
    }

};


const departureInput =
    document.getElementById("departure");

const destinationInput =
    document.getElementById("destination");

const altitudeInput =
    document.getElementById("altitude");

const departureTimeInput =
    document.getElementById("departureTime");


const departureSummary =
    document.getElementById("departureSummary");

const destinationSummary =
    document.getElementById("destinationSummary");

const altitudeSummary =
    document.getElementById("altitudeSummary");


const weatherButton =
    document.getElementById("weatherButton");

const reverseButton =
    document.getElementById("reverseButton");

const saveButton =
    document.getElementById("saveButton");


const weatherResult =
    document.getElementById("weatherResult");

const weatherBadge =
    document.getElementById("weatherBadge");


const statusValue =
    document.getElementById("statusValue");

const warningsValue =
    document.getElementById("warningsValue");

const updatedValue =
    document.getElementById("updatedValue");


const decisionPanel =
    document.getElementById("decisionPanel");

const decisionTitle =
    document.getElementById("decisionTitle");

const decisionMessage =
    document.getElementById("decisionMessage");


function cleanCode(value) {

    return value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 4);

}


function formatAirport(code) {

    if (!code) {
        return "Not entered";
    }

    const airport = aerodromes[code];

    if (!airport) {
        return code;
    }

    return `${code} · ${airport.name}`;

}


function updateRouteSummary() {

    const departure =
        cleanCode(departureInput.value);

    const destination =
        cleanCode(destinationInput.value);

    const altitude =
        altitudeInput.value.trim();


    departureSummary.textContent =
        formatAirport(departure);

    destinationSummary.textContent =
        formatAirport(destination);

    altitudeSummary.textContent =
        altitude
            ? `${Number(altitude).toLocaleString("en-NZ")} ft`
            : "Not entered";

}


function setCurrentTime() {

    if (departureTimeInput.value) {
        return;
    }

    const now = new Date();

    const hours =
        String(now.getHours()).padStart(2, "0");

    const minutes =
        String(now.getMinutes()).padStart(2, "0");

    departureTimeInput.value =
        `${hours}:${minutes}`;

}


function saveRoute() {

    const flight = {

        departure:
            cleanCode(departureInput.value),

        destination:
            cleanCode(destinationInput.value),

        altitude:
            altitudeInput.value.trim(),

        departureTime:
            departureTimeInput.value

    };


    localStorage.setItem(
        "takeoffLastFlight",
        JSON.stringify(flight)
    );


    saveButton.textContent =
        "✅ Route Saved";


    window.setTimeout(() => {

        saveButton.textContent =
            "💾 Save Route";

    }, 1600);

}


function loadLastRouteReversed() {

    const saved =
        localStorage.getItem("takeoffLastFlight");

    if (!saved) {

        departureInput.value = "NZCH";
        destinationInput.value = "NZAS";
        altitudeInput.value = "6500";

        setCurrentTime();
        updateRouteSummary();

        return;

    }


    try {

        const flight =
            JSON.parse(saved);


        /*
            The previous destination becomes
            the new departure automatically.
        */

        departureInput.value =
            flight.destination || "";

        destinationInput.value =
            flight.departure || "";

        altitudeInput.value =
            flight.altitude || "";

        departureTimeInput.value =
            flight.departureTime || "";

        setCurrentTime();
        updateRouteSummary();

    } catch (error) {

        console.error(
            "Could not load saved route:",
            error
        );

        setCurrentTime();
        updateRouteSummary();

    }

}


function reverseRoute() {

    const originalDeparture =
        cleanCode(departureInput.value);

    const originalDestination =
        cleanCode(destinationInput.value);


    departureInput.value =
        originalDestination;

    destinationInput.value =
        originalDeparture;


    updateRouteSummary();

}


function getWeatherDescription(code) {

    const descriptions = {

        0: "Clear",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Freezing fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Heavy drizzle",
        56: "Freezing drizzle",
        57: "Heavy freezing drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        66: "Freezing rain",
        67: "Heavy freezing rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        77: "Snow grains",
        80: "Light showers",
        81: "Showers",
        82: "Heavy showers",
        85: "Snow showers",
        86: "Heavy snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm with hail",
        99: "Severe thunderstorm with hail"

    };

    return descriptions[code] || "Unknown";

}


function degreesToCompass(degrees) {

    const directions = [
        "N",
        "NE",
        "E",
        "SE",
        "S",
        "SW",
        "W",
        "NW"
    ];

    const index =
        Math.round(degrees / 45) % 8;

    return directions[index];

}


async function fetchAirportWeather(code) {

    const airport =
        aerodromes[code];

    if (!airport) {

        throw new Error(
            `${code} is not yet in the aerodrome database.`
        );

    }


    const parameters =
        new URLSearchParams({

            latitude:
                airport.latitude,

            longitude:
                airport.longitude,

            current: [
                "temperature_2m",
                "apparent_temperature",
                "relative_humidity_2m",
                "precipitation",
                "weather_code",
                "cloud_cover",
                "surface_pressure",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m"
            ].join(","),

            wind_speed_unit:
                "kn",

            precipitation_unit:
                "mm",

            timezone:
                "Pacific/Auckland",

            forecast_days:
                "1"

        });


    const response =
        await fetch(
            `https://api.open-meteo.com/v1/forecast?${parameters}`
        );


    if (!response.ok) {

        throw new Error(
            `Weather service returned error ${response.status}.`
        );

    }


    const data =
        await response.json();


    if (!data.current) {

        throw new Error(
            `No current weather was returned for ${code}.`
        );

    }


    return {

        code,
        name:
            airport.name,

        temperature:
            data.current.temperature_2m,

        apparentTemperature:
            data.current.apparent_temperature,

        humidity:
            data.current.relative_humidity_2m,

        precipitation:
            data.current.precipitation,

        weatherCode:
            data.current.weather_code,

        cloudCover:
            data.current.cloud_cover,

        pressure:
            data.current.surface_pressure,

        windSpeed:
            data.current.wind_speed_10m,

        windDirection:
            data.current.wind_direction_10m,

        windGust:
            data.current.wind_gusts_10m,

        observationTime:
            data.current.time

    };

}


function weatherCard(weather, heading) {

    const windCompass =
        degreesToCompass(weather.windDirection);

    const description =
        getWeatherDescription(weather.weatherCode);

    return `
        <article class="weather-location">

            <h3>
                ${heading}: ${weather.code}
            </h3>

            <div class="location-name">
                ${weather.name} · ${description}
            </div>

            <div class="weather-data-grid">

                <div class="weather-item">
                    <span>Wind</span>
                    <strong>
                        ${Math.round(weather.windDirection)}°
                        ${windCompass}
                        ${Math.round(weather.windSpeed)} kt
                    </strong>
                </div>

                <div class="weather-item">
                    <span>Gusts</span>
                    <strong>
                        ${Math.round(weather.windGust)} kt
                    </strong>
                </div>

                <div class="weather-item">
                    <span>Temperature</span>
                    <strong>
                        ${Math.round(weather.temperature)}°C
                    </strong>
                </div>

                <div class="weather-item">
                    <span>Cloud cover</span>
                    <strong>
                        ${Math.round(weather.cloudCover)}%
                    </strong>
                </div>

                <div class="weather-item">
                    <span>Pressure</span>
                    <strong>
                        ${Math.round(weather.pressure)} hPa
                    </strong>
                </div>

                <div class="weather-item">
                    <span>Rain</span>
                    <strong>
                        ${Number(weather.precipitation).toFixed(1)} mm
                    </strong>
                </div>

            </div>

        </article>
    `;

}


function analyseWeather(weatherReports) {

    let level = "go";
    const warnings = [];


    for (const weather of weatherReports) {

        const description =
            getWeatherDescription(weather.weatherCode);


        if (
            weather.weatherCode >= 95 ||
            weather.windGust >= 35
        ) {

            level = "no-go";

        } else if (
            weather.windSpeed >= 20 ||
            weather.windGust >= 25 ||
            weather.cloudCover >= 90 ||
            weather.weatherCode === 45 ||
            weather.weatherCode === 48 ||
            weather.precipitation >= 2
        ) {

            if (level !== "no-go") {
                level = "review";
            }

        }


        if (weather.windSpeed >= 20) {

            warnings.push(
                `${weather.code}: strong surface wind`
            );

        }


        if (weather.windGust >= 25) {

            warnings.push(
                `${weather.code}: gusts ${Math.round(weather.windGust)} kt`
            );

        }


        if (
            weather.weatherCode === 45 ||
            weather.weatherCode === 48
        ) {

            warnings.push(
                `${weather.code}: fog reported`
            );

        }


        if (weather.weatherCode >= 95) {

            warnings.push(
                `${weather.code}: ${description}`
            );

        }


        if (weather.precipitation >= 2) {

            warnings.push(
                `${weather.code}: significant precipitation`
            );

        }

    }


    if (level === "go") {

        return {

            level: "go",
            title: "🟢 CONDITIONS LOOK REASONABLE",
            message:
                "No major concerns detected in the available surface forecast.",

            warnings

        };

    }


    if (level === "no-go") {

        return {

            level: "no-go",
            title: "🔴 SERIOUS WEATHER CONCERNS",
            message:
                "Significant weather has been detected. Review official aviation information before proceeding.",

            warnings

        };

    }


    return {

        level: "review",
        title: "🟠 REVIEW REQUIRED",
        message:
            "One or more weather factors deserve closer examination.",

        warnings

    };

}


function updateDecision(analysis) {

    decisionPanel.className =
        `decision-panel ${analysis.level}`;

    decisionTitle.textContent =
        analysis.title;

    decisionMessage.textContent =
        analysis.message;


    warningsValue.textContent =
        analysis.warnings.length > 0
            ? analysis.warnings.join(" · ")
            : "None detected";

}


async function getWeatherBriefing() {

    const departure =
        cleanCode(departureInput.value);

    const destination =
        cleanCode(destinationInput.value);


    departureInput.value =
        departure;

    destinationInput.value =
        destination;


    updateRouteSummary();


    if (!departure || !destination) {

        weatherResult.innerHTML = `
            <div class="error-message">
                Enter both a departure and destination.
            </div>
        `;

        return;

    }


    if (!aerodromes[departure]) {

        weatherResult.innerHTML = `
            <div class="error-message">
                ${departure} is not yet in the supported aerodrome list.
            </div>
        `;

        return;

    }


    if (!aerodromes[destination]) {

        weatherResult.innerHTML = `
            <div class="error-message">
                ${destination} is not yet in the supported aerodrome list.
            </div>
        `;

        return;

    }


    weatherButton.disabled = true;
    weatherButton.textContent = "Loading weather…";

    weatherBadge.textContent = "LOADING";
    weatherBadge.className = "weather-badge";

    weatherResult.textContent =
        "Contacting the live weather service…";

    statusValue.textContent =
        "Loading Weather";


    try {

        const [
            departureWeather,
            destinationWeather
        ] = await Promise.all([

            fetchAirportWeather(departure),
            fetchAirportWeather(destination)

        ]);


        const reports = [
            departureWeather,
            destinationWeather
        ];


        const analysis =
            analyseWeather(reports);


        weatherResult.innerHTML = `

            ${weatherCard(
                departureWeather,
                "Departure"
            )}

            ${weatherCard(
                destinationWeather,
                "Destination"
            )}

            <div class="weather-note">
                This prototype uses general surface forecast data,
                not METAR, TAF, GAF or NOTAM information.
                Always obtain an official aviation briefing before flight.
            </div>
        `;


        updateDecision(analysis);


        const now =
            new Date();


        updatedValue.textContent =
            now.toLocaleTimeString(
                "en-NZ",
                {
                    hour: "2-digit",
                    minute: "2-digit"
                }
            );


        statusValue.textContent =
            "Live Weather Loaded";

        weatherBadge.textContent =
            "LIVE";

        weatherBadge.className =
            "weather-badge live";


        saveRoute();

    } catch (error) {

        console.error(error);


        weatherResult.innerHTML = `
            <div class="error-message">
                Unable to load weather.<br><br>
                ${error.message}
            </div>
        `;


        statusValue.textContent =
            "Weather Error";

        warningsValue.textContent =
            "Weather unavailable";

        weatherBadge.textContent =
            "ERROR";

        weatherBadge.className =
            "weather-badge error";


        decisionPanel.className =
            "decision-panel review";

        decisionTitle.textContent =
            "🟠 WEATHER UNAVAILABLE";

        decisionMessage.textContent =
            "Check your internet connection and try again.";

    } finally {

        weatherButton.disabled = false;

        weatherButton.textContent =
            "🌦 Get Weather Briefing";

    }

}


departureInput.addEventListener(
    "input",
    () => {

        departureInput.value =
            cleanCode(departureInput.value);

        updateRouteSummary();

    }
);


destinationInput.addEventListener(
    "input",
    () => {

        destinationInput.value =
            cleanCode(destinationInput.value);

        updateRouteSummary();

    }
);


altitudeInput.addEventListener(
    "input",
    updateRouteSummary
);


weatherButton.addEventListener(
    "click",
    getWeatherBriefing
);


reverseButton.addEventListener(
    "click",
    reverseRoute
);


saveButton.addEventListener(
    "click",
    saveRoute
);


loadLastRouteReversed();
