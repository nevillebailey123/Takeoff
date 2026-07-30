"use strict";

// TAKEOFF v1.7
// General model weather information only.
// Not an official aviation weather briefing.

const $ = (id) => document.getElementById(id);

const aerodromes = {
    NZAA: {
        name: "Auckland",
        lat: -37.0082,
        lon: 174.7850
    },

    NZAR: {
        name: "Ardmore",
        lat: -37.0297,
        lon: 174.9733
    },

    NZAS: {
        name: "Ashburton",
        lat: -43.9033,
        lon: 171.7967
    },

    NZCH: {
        name: "Christchurch",
        lat: -43.4894,
        lon: 172.5322
    },

    NZDN: {
        name: "Dunedin",
        lat: -45.9281,
        lon: 170.1983
    },

    NZHK: {
        name: "Hokitika",
        lat: -42.7136,
        lon: 170.9853
    },

    NZHN: {
        name: "Hamilton",
        lat: -37.8667,
        lon: 175.3321
    },

    NZHT: {
        name: "Haast",
        lat: -43.8650,
        lon: 169.0410
    },

    NZMF: {
        name: "Milford Sound",
        lat: -44.6733,
        lon: 167.9233
    },

    NZMK: {
        name: "Motueka",
        lat: -41.1233,
        lon: 172.9886
    },

    NZNS: {
        name: "Nelson",
        lat: -41.2983,
        lon: 173.2211
    },

    NZNV: {
        name: "Invercargill",
        lat: -46.4124,
        lon: 168.3130
    },

    NZPM: {
        name: "Palmerston North",
        lat: -40.3206,
        lon: 175.6170
    },

    NZPP: {
        name: "Paraparaumu",
        lat: -40.9047,
        lon: 174.9890
    },

    NZQN: {
        name: "Queenstown",
        lat: -45.0211,
        lon: 168.7390
    },

    NZRO: {
        name: "Rotorua",
        lat: -38.1092,
        lon: 176.3172
    },

    NZTG: {
        name: "Tauranga",
        lat: -37.6719,
        lon: 176.1960
    },

    NZTU: {
        name: "Timaru",
        lat: -44.3028,
        lon: 171.2253
    },

    NZWB: {
        name: "Woodbourne",
        lat: -41.5183,
        lon: 173.8700
    },

    NZWF: {
        name: "Wānaka",
        lat: -44.7222,
        lon: 169.2456
    },

    NZWN: {
        name: "Wellington",
        lat: -41.3272,
        lon: 174.8053
    },

    NZWR: {
        name: "Whangārei",
        lat: -35.7683,
        lon: 174.3650
    }
};


let departure;
let destination;
let altitude;
let departureTime;
let cruiseSpeed;
let weatherButton;
let weatherResult;
let routeWeatherResult;

let routeMap;
let routeLine;
let departureMarker;
let destinationMarker;
let routeWeatherMarkers = [];


function normaliseCode(value) {
    return String(value || "")
        .trim()
        .toUpperCase();
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


function safeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
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

    const deltaLat = toRadians(
        end.lat - start.lat
    );

    const deltaLon = toRadians(
        end.lon - start.lon
    );

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

    const deltaLon = toRadians(
        end.lon - start.lon
    );

    const y =
        Math.sin(deltaLon) *
        Math.cos(lat2);

    const x =
        Math.cos(lat1) *
        Math.sin(lat2) -
        Math.sin(lat1) *
        Math.cos(lat2) *
        Math.cos(deltaLon);

    return (
        toDegrees(Math.atan2(y, x)) + 360
    ) % 360;
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

    return (
        `${flightHours} hr ` +
        `${String(minutes).padStart(2, "0")} min`
    );
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

    return points[
        Math.round(degrees / 45) % 8
    ];
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
        80: "Rain showers",
        81: "Rain showers",
        82: "Heavy showers",
        85: "Snow showers",
        86: "Heavy snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm with hail",
        99: "Thunderstorm with hail"
    };

    return descriptions[code] || "Forecast available";
}


function createRouteIcon() {
    return L.divIcon({
        className: "",
        html: '<div class="route-marker"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -10]
    });
}


function createWeatherIcon(risk, number) {
    return L.divIcon({
        className: "",
        html: `
            <div class="weather-map-marker ${risk}">
                ${number}
            </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -15]
    });
}


function initialiseMap() {
    const mapElement = $("routeMap");

    if (!mapElement) {
        console.error("routeMap element is missing.");
        return;
    }

    if (typeof L === "undefined") {
        mapElement.innerHTML = `
            <p class="error-text">
                The map library did not load.
            </p>
        `;

        return;
    }

    routeMap = L.map("routeMap", {
        zoomControl: true
    }).setView(
        [-42.2, 172.5],
        5
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            subdomains: ["a", "b", "c"],
            maxZoom: 19,
            attribution:
                "&copy; OpenStreetMap contributors"
        }
    ).addTo(routeMap);

    routeMap.whenReady(() => {
        routeMap.invalidateSize();
        updateRouteMap();
    });

    window.setTimeout(() => {
        routeMap.invalidateSize();
        updateRouteMap();
    }, 700);
}


function clearWeatherMarkers() {
    if (!routeMap) {
        return;
    }

    routeWeatherMarkers.forEach((marker) => {
        routeMap.removeLayer(marker);
    });

    routeWeatherMarkers = [];
}


function clearRouteMap() {
    if (!routeMap) {
        return;
    }

    clearWeatherMarkers();

    if (routeLine) {
        routeMap.removeLayer(routeLine);
        routeLine = null;
    }

    if (departureMarker) {
        routeMap.removeLayer(departureMarker);
        departureMarker = null;
    }

    if (destinationMarker) {
        routeMap.removeLayer(destinationMarker);
        destinationMarker = null;
    }

    setText("mapRouteLabel", "No route");
}


function updateRouteMap() {
    if (!routeMap || !departure || !destination) {
        return;
    }

    const depCode = normaliseCode(
        departure.value
    );

    const destCode = normaliseCode(
        destination.value
    );

    const start = aerodromes[depCode];
    const end = aerodromes[destCode];

    clearRouteMap();

    if (!start || !end) {
        routeMap.setView(
            [-42.2, 172.5],
            5
        );

        return;
    }

    const startPosition = [
        start.lat,
        start.lon
    ];

    const endPosition = [
        end.lat,
        end.lon
    ];

    departureMarker = L.marker(
        startPosition,
        {
            icon: createRouteIcon()
        }
    )
        .addTo(routeMap)
        .bindPopup(
            `<strong>${depCode}</strong><br>${start.name}`
        );

    destinationMarker = L.marker(
        endPosition,
        {
            icon: createRouteIcon()
        }
    )
        .addTo(routeMap)
        .bindPopup(
            `<strong>${destCode}</strong><br>${end.name}`
        );

    routeLine = L.polyline(
        [
            startPosition,
            endPosition
        ],
        {
            weight: 4,
            opacity: 0.9,
            color: "#348cff"
        }
    ).addTo(routeMap);

    routeMap.fitBounds(
        routeLine.getBounds(),
        {
            padding: [35, 35]
        }
    );

    setText(
        "mapRouteLabel",
        `${depCode} → ${destCode}`
    );

    window.setTimeout(() => {
        routeMap.invalidateSize();
    }, 100);
}


function calculateSampleCount(distanceNm) {
    if (distanceNm <= 40) {
        return 3;
    }

    if (distanceNm <= 90) {
        return 4;
    }

    if (distanceNm <= 160) {
        return 5;
    }

    if (distanceNm <= 260) {
        return 6;
    }

    return 7;
}


function interpolateRoute(start, end, count) {
    const points = [];

    for (let index = 0; index < count; index += 1) {
        const fraction = index / (count - 1);

        points.push({
            lat:
                start.lat +
                (end.lat - start.lat) *
                fraction,

            lon:
                start.lon +
                (end.lon - start.lon) *
                fraction,

            fraction
        });
    }

    return points;
}


function calculateRoute() {
    const depCode = normaliseCode(
        departure.value
    );

    const destCode = normaliseCode(
        destination.value
    );

    const start = aerodromes[depCode];
    const end = aerodromes[destCode];

    if (!start || !end) {
        setText(
            "distanceValue",
            "Not calculated"
        );

        setText(
            "bearingValue",
            "Not calculated"
        );

        setText(
            "flightTimeValue",
            "Not calculated"
        );

        setText(
            "sampleCountValue",
            "Not calculated"
        );

        updateRouteMap();
        return null;
    }

    const distance = calculateDistanceNm(
        start,
        end
    );

    const bearing = calculateBearing(
        start,
        end
    );

    const speed = Number(cruiseSpeed.value);

    const flightTime =
        speed > 0
            ? distance / speed
            : null;

    const sampleCount =
        calculateSampleCount(distance);

    setText(
        "distanceValue",
        `${Math.round(distance)} NM`
    );

    setText(
        "bearingValue",
        `${String(Math.round(bearing))
            .padStart(3, "0")}° true`
    );

    setText(
        "flightTimeValue",
        flightTime
            ? formatFlightTime(flightTime)
            : "Enter cruise speed"
    );

    setText(
        "sampleCountValue",
        `${sampleCount} points`
    );

    updateRouteMap();

    return {
        depCode,
        destCode,
        start,
        end,
        distance,
        bearing,
        sampleCount,
        flightTime
    };
}


function updateSummary() {
    setText(
        "departureSummary",
        normaliseCode(departure.value) ||
        "Not entered"
    );

    setText(
        "destinationSummary",
        normaliseCode(destination.value) ||
        "Not entered"
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

    setText(
        "timeSummary",
        departureTime.value ||
        "Not entered"
    );

    calculateRoute();
}


function saveFlight(showConfirmation = false) {
    const flight = {
        departure: normaliseCode(
            departure.value
        ),

        destination: normaliseCode(
            destination.value
        ),

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
        console.warn(
            "Could not save flight",
            error
        );
    }

    updateSummary();

    if (showConfirmation) {
        setText(
            "statusValue",
            "Route Saved"
        );

        window.setTimeout(() => {
            const status = $("statusValue");

            if (
                status &&
                status.textContent === "Route Saved"
            ) {
                status.textContent =
                    "Awaiting Weather";
            }
        }, 1600);
    }
}


function loadFlight() {
    try {
        const saved =
            localStorage.getItem("lastFlight");

        if (!saved) {
            cruiseSpeed.value = "110";
            updateSummary();
            return;
        }

        const flight = JSON.parse(saved);

        departure.value =
            flight.departure || "";

        destination.value =
            flight.destination || "";

        altitude.value =
            flight.altitude || "";

        departureTime.value =
            flight.departureTime || "";

        cruiseSpeed.value =
            flight.cruiseSpeed || "110";

        updateSummary();

    } catch (error) {
        console.warn(
            "Could not load saved flight",
            error
        );

        cruiseSpeed.value = "110";
        updateSummary();
    }
}


function reverseRoute() {
    const oldDeparture =
        departure.value;

    departure.value =
        destination.value;

    destination.value =
        oldDeparture;

    saveFlight();

    clearWeatherBriefing();
}


function clearWeatherBriefing() {
    clearWeatherMarkers();

    setText(
        "routeWeatherStatus",
        "Not loaded"
    );

    routeWeatherResult.innerHTML = `
        <p class="muted-text">
            Request a weather briefing to analyse conditions
            along the route.
        </p>
    `;

    weatherResult.innerHTML = `
        <p class="muted-text">
            No weather has been requested yet.
        </p>
    `;

    setText(
        "weatherBadge",
        "READY"
    );

    setClass(
        "weatherBadge",
        "weather-badge"
    );

    setText(
        "decisionTitle",
        "Flight Review"
    );

    setText(
        "decisionMessage",
        "Request a route weather briefing to assess conditions."
    );

    setText(
        "warningsValue",
        "Not assessed"
    );

    const panel = $("decisionPanel");

    panel?.classList.remove(
        "good",
        "review",
        "bad"
    );

    $("riskDetails")?.classList.add("hidden");
}


function makeWeatherUrl(point) {
    const params = new URLSearchParams({
        latitude: point.lat,
        longitude: point.lon,

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

    return (
        "https://api.open-meteo.com/v1/forecast?" +
        params.toString()
    );
}


async function fetchPointWeather(point) {
    const response = await fetch(
        makeWeatherUrl(point),
        {
            cache: "no-store"
        }
    );

    if (!response.ok) {
        throw new Error(
            `Weather service returned ${response.status}`
        );
    }

    const data = await response.json();

    if (!data.current) {
        throw new Error(
            "Weather data was incomplete"
        );
    }

    return {
        ...point,
        current: data.current
    };
}


function assessPointRisk(current) {
    const wind = safeNumber(
        current.wind_speed_10m
    );

    const gust = safeNumber(
        current.wind_gusts_10m
    );

    const cloud = safeNumber(
        current.cloud_cover
    );

    const rain = safeNumber(
        current.precipitation
    );

    const code = safeNumber(
        current.weather_code
    );

    const severeCodes = [
        57,
        65,
        67,
        75,
        82,
        86,
        95,
        96,
        99
    ];

    if (
        gust >= 30 ||
        wind >= 22 ||
        rain >= 4 ||
        severeCodes.includes(code)
    ) {
        return {
            level: 3,
            className: "high",
            label: "High concern",
            reason:
                buildRiskReason(
                    wind,
                    gust,
                    cloud,
                    rain,
                    code,
                    3
                )
        };
    }

    if (
        gust >= 20 ||
        wind >= 15 ||
        cloud >= 85 ||
        rain > 0 ||
        [45, 48, 55, 63, 71, 73, 80, 81, 85]
            .includes(code)
    ) {
        return {
            level: 2,
            className: "review",
            label: "Review",
            reason:
                buildRiskReason(
                    wind,
                    gust,
                    cloud,
                    rain,
                    code,
                    2
                )
        };
    }

    return {
        level: 1,
        className: "low",
        label: "Lower concern",
        reason:
            "No obvious concern detected in this limited model snapshot."
    };
}


function buildRiskReason(
    wind,
    gust,
    cloud,
    rain,
    code,
    level
) {
    const reasons = [];

    if (wind >= 15) {
        reasons.push(
            `wind ${Math.round(wind)} kt`
        );
    }

    if (gust >= 20) {
        reasons.push(
            `gusts ${Math.round(gust)} kt`
        );
    }

    if (cloud >= 85) {
        reasons.push(
            `cloud cover ${Math.round(cloud)}%`
        );
    }

    if (rain > 0) {
        reasons.push(
            `precipitation ${rain.toFixed(1)} mm`
        );
    }

    if (
        [
            45,
            48,
            57,
            65,
            67,
            71,
            73,
            75,
            82,
            85,
            86,
            95,
            96,
            99
        ].includes(code)
    ) {
        reasons.push(
            weatherDescription(code).toLowerCase()
        );
    }

    if (reasons.length === 0) {
        return level === 3
            ? "Significant weather requires review."
            : "Conditions deserve closer review.";
    }

    return reasons.join(", ");
}


function routePointLabel(
    point,
    index,
    total,
    route
) {
    if (index === 0) {
        return `${route.depCode} · ${route.start.name}`;
    }

    if (index === total - 1) {
        return `${route.destCode} · ${route.end.name}`;
    }

    const percentage =
        Math.round(point.fraction * 100);

    return `${percentage}% along route`;
}


function distanceAlongRoute(
    point,
    route
) {
    return Math.round(
        route.distance * point.fraction
    );
}


function renderRouteWeather(
    points,
    route
) {
    routeWeatherResult.innerHTML = `
        <div class="route-weather-list">

            ${points.map(
                (point, index) => {
                    const current = point.current;
                    const risk =
                        assessPointRisk(current);

                    const wind = safeNumber(
                        current.wind_speed_10m
                    );

                    const gust = safeNumber(
                        current.wind_gusts_10m
                    );

                    const direction = safeNumber(
                        current.wind_direction_10m
                    );

                    const cloud = safeNumber(
                        current.cloud_cover
                    );

                    const rain = safeNumber(
                        current.precipitation
                    );

                    const temperature = safeNumber(
                        current.temperature_2m
                    );

                    const code = safeNumber(
                        current.weather_code
                    );

                    const label =
                        routePointLabel(
                            point,
                            index,
                            points.length,
                            route
                        );

                    const distance =
                        distanceAlongRoute(
                            point,
                            route
                        );

                    return `
                        <article
                            class="route-weather-card ${risk.className}"
                        >

                            <div class="route-step">
                                ${index + 1}
                            </div>

                            <div>

                                <div class="route-card-heading">

                                    <strong>
                                        ${label}
                                    </strong>

                                    <span>
                                        ${distance} NM
                                    </span>

                                </div>

                                <p>
                                    ${weatherDescription(code)}
                                    · ${Math.round(temperature)}°C
                                </p>

                                <p>
                                    Wind
                                    ${String(Math.round(direction))
                                        .padStart(3, "0")}°
                                    ${compassDirection(direction)}
                                    at ${Math.round(wind)} kt
                                    · gusts ${Math.round(gust)} kt
                                </p>

                                <p>
                                    Cloud ${Math.round(cloud)}%
                                    · rain ${rain.toFixed(1)} mm
                                </p>

                                <p class="route-condition">
                                    ${risk.label}: ${risk.reason}
                                </p>

                            </div>

                        </article>
                    `;
                }
            ).join("")}

        </div>
    `;
}


function renderAirportWeather(
    point,
    code,
    airport
) {
    const weather = point.current;

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
                ${code} · ${airport.name}
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
                    ${String(Math.round(direction))
                        .padStart(3, "0")}°
                    ${compassDirection(direction)}
                    at ${Math.round(wind)} kt
                </strong>
            </p>

            <p>
                ↗ Gusts ${Math.round(gust)} kt
            </p>

            <p>
                ☁ Cloud cover ${Math.round(cloud)}%
            </p>

            <p>
                🌧 Precipitation
                ${precipitation.toFixed(1)} mm
            </p>

        </article>
    `;
}


function plotRouteWeatherMarkers(
    points,
    route
) {
    if (!routeMap) {
        return;
    }

    clearWeatherMarkers();

    points.forEach((point, index) => {
        const risk =
            assessPointRisk(point.current);

        const current = point.current;

        const wind = safeNumber(
            current.wind_speed_10m
        );

        const gust = safeNumber(
            current.wind_gusts_10m
        );

        const cloud = safeNumber(
            current.cloud_cover
        );

        const rain = safeNumber(
            current.precipitation
        );

        const label =
            routePointLabel(
                point,
                index,
                points.length,
                route
            );

        const marker = L.marker(
            [point.lat, point.lon],
            {
                icon: createWeatherIcon(
                    risk.className,
                    index + 1
                )
            }
        )
            .addTo(routeMap)
            .bindPopup(`
                <strong>${label}</strong><br>
                ${weatherDescription(
                    safeNumber(
                        current.weather_code
                    )
                )}<br>
                Wind ${Math.round(wind)} kt,
                gusts ${Math.round(gust)} kt<br>
                Cloud ${Math.round(cloud)}%,
                rain ${rain.toFixed(1)} mm<br>
                <strong>${risk.label}</strong>
            `);

        routeWeatherMarkers.push(marker);
    });
}


function assessWholeRoute(points) {
    const assessments = points.map(
        (point) => ({
            point,
            risk:
                assessPointRisk(point.current)
        })
    );

    const worst = assessments.reduce(
        (currentWorst, item) => {
            if (
                item.risk.level >
                currentWorst.risk.level
            ) {
                return item;
            }

            return currentWorst;
        },
        assessments[0]
    );

    const maxWind = Math.max(
        ...points.map(
            (point) =>
                safeNumber(
                    point.current.wind_speed_10m
                )
        )
    );

    const maxGust = Math.max(
        ...points.map(
            (point) =>
                safeNumber(
                    point.current.wind_gusts_10m
                )
        )
    );

    const maxCloud = Math.max(
        ...points.map(
            (point) =>
                safeNumber(
                    point.current.cloud_cover
                )
        )
    );

    const maxRain = Math.max(
        ...points.map(
            (point) =>
                safeNumber(
                    point.current.precipitation
                )
        )
    );

    return {
        worst,
        maxWind,
        maxGust,
        maxCloud,
        maxRain
    };
}


function displayOverallAssessment(
    assessment,
    points,
    route
) {
    const panel = $("decisionPanel");
    const riskDetails = $("riskDetails");

    panel?.classList.remove(
        "good",
        "review",
        "bad"
    );

    const worstIndex =
        points.indexOf(
            assessment.worst.point
        );

    const worstLocation =
        routePointLabel(
            assessment.worst.point,
            worstIndex,
            points.length,
            route
        );

    if (
        assessment.worst.risk.level === 3
    ) {
        panel?.classList.add("bad");

        setText(
            "decisionTitle",
            "🔴 HIGH CONCERN"
        );

        setText(
            "decisionMessage",
            `The most significant modelled conditions are near ${worstLocation}. Review official weather products and the complete route before making any flight decision.`
        );

        setText(
            "weatherBadge",
            "HIGH"
        );

        setClass(
            "weatherBadge",
            "weather-badge error"
        );

        setText(
            "warningsValue",
            "High concern"
        );
    } else if (
        assessment.worst.risk.level === 2
    ) {
        panel?.classList.add("review");

        setText(
            "decisionTitle",
            "🟠 ROUTE REVIEW"
        );

        setText(
            "decisionMessage",
            `Conditions deserve closer review near ${worstLocation}. Confirm cloud, wind, precipitation and terrain implications using official aviation sources.`
        );

        setText(
            "weatherBadge",
            "REVIEW"
        );

        setClass(
            "weatherBadge",
            "weather-badge review"
        );

        setText(
            "warningsValue",
            "Review required"
        );
    } else {
        panel?.classList.add("good");

        setText(
            "decisionTitle",
            "🟢 LOWER CONCERN"
        );

        setText(
            "decisionMessage",
            "No obvious concern was found across the sampled route in this limited model snapshot. This is not a go or no-go recommendation."
        );

        setText(
            "weatherBadge",
            "LOWER"
        );

        setClass(
            "weatherBadge",
            "weather-badge live"
        );

        setText(
            "warningsValue",
            "Lower concern"
        );
    }

    riskDetails.classList.remove("hidden");

    riskDetails.innerHTML = `
        <div class="risk-detail">
            <span>Maximum wind</span>
            <strong>
                ${Math.round(assessment.maxWind)} kt
            </strong>
        </div>

        <div class="risk-detail">
            <span>Maximum gust</span>
            <strong>
                ${Math.round(assessment.maxGust)} kt
            </strong>
        </div>

        <div class="risk-detail">
            <span>Maximum cloud</span>
            <strong>
                ${Math.round(assessment.maxCloud)}%
            </strong>
        </div>
    `;
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

    const route = calculateRoute();

    if (!route) {
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
                Enter supported departure and destination
                aerodrome codes.
            </p>
        `;

        return;
    }

    weatherButton.disabled = true;

    weatherButton.textContent =
        "Analysing route weather…";

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

    setText(
        "warningsValue",
        "Assessing"
    );

    setText(
        "routeWeatherStatus",
        "Loading"
    );

    weatherResult.innerHTML = `
        <div class="loading-box">
            Loading aerodrome weather…
        </div>
    `;

    routeWeatherResult.innerHTML = `
        <div class="loading-box">
            Sampling weather along the route…
        </div>
    `;

    try {
        const routePoints =
            interpolateRoute(
                route.start,
                route.end,
                route.sampleCount
            );

        const weatherPoints =
            await Promise.all(
                routePoints.map(
                    fetchPointWeather
                )
            );

        renderRouteWeather(
            weatherPoints,
            route
        );

        weatherResult.innerHTML = `
            <div class="weather-grid">

                ${renderAirportWeather(
                    weatherPoints[0],
                    route.depCode,
                    route.start
                )}

                ${renderAirportWeather(
                    weatherPoints[
                        weatherPoints.length - 1
                    ],
                    route.destCode,
                    route.end
                )}

            </div>
        `;

        plotRouteWeatherMarkers(
            weatherPoints,
            route
        );

        const overallAssessment =
            assessWholeRoute(
                weatherPoints
            );

        displayOverallAssessment(
            overallAssessment,
            weatherPoints,
            route
        );

        setText(
            "statusValue",
            "Briefing Loaded"
        );

        setText(
            "routeWeatherStatus",
            `${weatherPoints.length} points`
        );

        setText(
            "updatedValue",
            new Date().toLocaleTimeString(
                [],
                {
                    hour: "2-digit",
                    minute: "2-digit"
                }
            )
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
            "Unavailable"
        );

        setText(
            "routeWeatherStatus",
            "Error"
        );

        weatherResult.innerHTML = `
            <p class="error-text">
                Unable to retrieve weather right now.
                Check your internet connection and try again.
            </p>
        `;

        routeWeatherResult.innerHTML = `
            <p class="error-text">
                Route weather analysis could not be completed.
            </p>
        `;

    } finally {
        weatherButton.disabled = false;

        weatherButton.textContent =
            "🌦 Get Route Weather Briefing";
    }
}


function initialiseApp() {
    departure = $("departure");
    destination = $("destination");
    altitude = $("altitude");
    departureTime = $("departureTime");
    cruiseSpeed = $("cruiseSpeed");

    weatherButton =
        $("weatherButton");

    weatherResult =
        $("weatherResult");

    routeWeatherResult =
        $("routeWeatherResult");

    const reverseButton =
        $("reverseButton");

    const saveButton =
        $("saveButton");

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
                () => {
                    saveFlight();
                    clearWeatherMarkers();
                }
            );
        });

    departure.addEventListener(
        "blur",
        () => {
            departure.value =
                normaliseCode(
                    departure.value
                );

            saveFlight();
        }
    );

    destination.addEventListener(
        "blur",
        () => {
            destination.value =
                normaliseCode(
                    destination.value
                );

            saveFlight();
        }
    );

    initialiseMap();
    loadFlight();
}


document.addEventListener(
    "DOMContentLoaded",
    initialiseApp
);
