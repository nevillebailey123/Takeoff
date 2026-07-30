"use strict";

/*
    TAKEOFF v1.7

    Features:
    - Save flight details
    - Reverse route
    - Distance calculation
    - Initial true track
    - Estimated flight time
    - Interactive Leaflet map
    - Departure and destination weather
    - Five-point weather sampling along route
    - Route concern assessment

    Weather source:
    Open-Meteo general forecast-model data.

    This is not an official aviation weather briefing.
*/


const $ = (id) =>
    document.getElementById(id);


/* AERODROME DATABASE */

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

    NZGB: {
        name: "Great Barrier",
        lat: -36.2414,
        lon: 175.4728
    },

    NZGS: {
        name: "Gisborne",
        lat: -38.6633,
        lon: 177.9783
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

    NZKK: {
        name: "Kerikeri",
        lat: -35.2628,
        lon: 173.9119
    },

    NZKT: {
        name: "Kaitaia",
        lat: -35.0700,
        lon: 173.2853
    },

    NZLX: {
        name: "Alexandra",
        lat: -45.2117,
        lon: 169.3733
    },

    NZMC: {
        name: "Mount Cook",
        lat: -43.7647,
        lon: 170.1331
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

    NZMO: {
        name: "Manapouri",
        lat: -45.5331,
        lon: 167.6500
    },

    NZMS: {
        name: "Masterton",
        lat: -40.9733,
        lon: 175.6336
    },

    NZNP: {
        name: "New Plymouth",
        lat: -39.0086,
        lon: 174.1792
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

    NZOH: {
        name: "Ōhakea",
        lat: -40.2061,
        lon: 175.3878
    },

    NZOU: {
        name: "Oamaru",
        lat: -44.9700,
        lon: 171.0817
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

    NZTK: {
        name: "Takaka",
        lat: -40.8133,
        lon: 172.7753
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

    NZWH: {
        name: "Wigram",
        lat: -43.5511,
        lon: 172.5528
    },

    NZWK: {
        name: "Whakatāne",
        lat: -37.9206,
        lon: 176.9142
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
    },

    NZWS: {
        name: "Westport",
        lat: -41.7381,
        lon: 171.5808
    }
};


/* DOM REFERENCES */

let departure;
let destination;
let altitude;
let departureTime;
let cruiseSpeed;
let weatherButton;
let weatherResult;
let routeWeatherResult;
let routeFocusResult;


/* MAP REFERENCES */

let routeMap;
let routeLine;
let departureMarker;
let destinationMarker;

let routeWeatherMarkers = [];


/* GENERAL HELPERS */

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


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* NAVIGATION CALCULATIONS */

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

    if (
        !Number.isFinite(hours) ||
        hours <= 0
    ) {
        return "Not calculated";
    }

    const totalMinutes =
        Math.round(hours * 60);

    const flightHours =
        Math.floor(totalMinutes / 60);

    const minutes =
        totalMinutes % 60;

    if (flightHours === 0) {
        return `${minutes} min`;
    }

    return (
        `${flightHours} hr ` +
        `${String(minutes).padStart(2, "0")} min`
    );

}


/* ROUTE SAMPLING */

function interpolateRoutePoint(
    start,
    end,
    fraction
) {

    return {
        lat:
            start.lat +
            (end.lat - start.lat) *
            fraction,

        lon:
            start.lon +
            (end.lon - start.lon) *
            fraction
    };

}


function createRouteSamplePoints(
    start,
    end,
    count = 5
) {

    const totalDistance =
        calculateDistanceNm(start, end);

    const points = [];

    for (
        let index = 0;
        index < count;
        index += 1
    ) {

        const fraction =
            index / (count - 1);

        const position =
            interpolateRoutePoint(
                start,
                end,
                fraction
            );

        let label;

        if (index === 0) {

            label = "Departure";

        } else if (index === count - 1) {

            label = "Destination";

        } else {

            label =
                `${Math.round(
                    fraction * 100
                )}% route`;

        }

        points.push({
            index,
            fraction,
            label,

            distanceNm:
                totalDistance *
                fraction,

            lat: position.lat,
            lon: position.lon
        });

    }

    return points;

}


/* MAP */

function createRouteEndIcon() {

    return L.divIcon({
        className: "",

        html:
            '<div class="route-end-marker"></div>',

        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -12]
    });

}


function createWeatherPointIcon(
    level,
    index
) {

    const safeLevel = [
        "good",
        "review",
        "bad"
    ].includes(level)
        ? level
        : "review";

    return L.divIcon({
        className: "",

        html: `
            <div
                class="
                    route-weather-marker
                    marker-${safeLevel}
                "
            >
                ${index + 1}
            </div>
        `,

        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -14]
    });

}


function initialiseMap() {

    const mapElement =
        $("routeMap");

    if (!mapElement) {

        console.error(
            "routeMap element is missing."
        );

        return;
    }

    if (typeof L === "undefined") {

        console.error(
            "Leaflet did not load."
        );

        mapElement.innerHTML = `
            <p class="error-text">
                The map library did not load.
                Refresh the page and try again.
            </p>
        `;

        return;
    }

    routeMap = L.map(
        "routeMap",
        {
            zoomControl: true
        }
    ).setView(
        [-42.2, 172.5],
        5
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            subdomains: [
                "a",
                "b",
                "c"
            ],

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

    }, 800);

}


function removeMapLayer(layer) {

    if (
        routeMap &&
        layer &&
        routeMap.hasLayer(layer)
    ) {
        routeMap.removeLayer(layer);
    }

}


function clearRouteWeatherMarkers() {

    routeWeatherMarkers.forEach(
        (marker) => {
            removeMapLayer(marker);
        }
    );

    routeWeatherMarkers = [];

}


function clearRouteMap() {

    removeMapLayer(routeLine);
    removeMapLayer(departureMarker);
    removeMapLayer(destinationMarker);

    routeLine = null;
    departureMarker = null;
    destinationMarker = null;

    clearRouteWeatherMarkers();

    setText(
        "mapRouteLabel",
        "No route"
    );

}


function updateRouteMap() {

    if (!routeMap) {
        return;
    }

    const depCode =
        normaliseCode(departure.value);

    const destCode =
        normaliseCode(destination.value);

    const start =
        aerodromes[depCode];

    const end =
        aerodromes[destCode];

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
            icon:
                createRouteEndIcon()
        }
    )
        .addTo(routeMap)
        .bindPopup(
            `<strong>${depCode}</strong>` +
            `<br>${escapeHtml(start.name)}`
        );

    destinationMarker = L.marker(
        endPosition,
        {
            icon:
                createRouteEndIcon()
        }
    )
        .addTo(routeMap)
        .bindPopup(
            `<strong>${destCode}</strong>` +
            `<br>${escapeHtml(end.name)}`
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


function addRouteWeatherMarkers(
    weatherPoints
) {

    if (!routeMap) {
        return;
    }

    clearRouteWeatherMarkers();

    weatherPoints.forEach(
        (item, index) => {

            const marker =
                L.marker(
                    [
                        item.lat,
                        item.lon
                    ],
                    {
                        icon:
                            createWeatherPointIcon(
                                item.assessment.level,
                                index
                            )
                    }
                );

            const current =
                item.current;

            marker.bindPopup(`
                <strong>
                    Point ${index + 1}
                    · ${escapeHtml(item.label)}
                </strong>

                <br>

                ${Math.round(item.distanceNm)} NM
                from departure

                <br><br>

                Wind:
                ${Math.round(
                    safeNumber(
                        current.wind_speed_10m
                    )
                )} kt

                <br>

                Gusts:
                ${Math.round(
                    safeNumber(
                        current.wind_gusts_10m
                    )
                )} kt

                <br>

                Cloud:
                ${Math.round(
                    safeNumber(
                        current.cloud_cover
                    )
                )}%

                <br>

                Rain:
                ${safeNumber(
                    current.precipitation
                ).toFixed(1)} mm
            `);

            marker.addTo(routeMap);

            routeWeatherMarkers.push(
                marker
            );

        }
    );

}


/* ROUTE INFORMATION */

function calculateRoute() {

    const depCode =
        normaliseCode(departure.value);

    const destCode =
        normaliseCode(destination.value);

    const start =
        aerodromes[depCode];

    const end =
        aerodromes[destCode];

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

        updateRouteMap();

        return;
    }

    const distance =
        calculateDistanceNm(
            start,
            end
        );

    const bearing =
        calculateBearing(
            start,
            end
        );

    const speed =
        Number(cruiseSpeed.value);

    const flightTime =
        speed > 0
            ? distance / speed
            : null;

    setText(
        "distanceValue",
        `${Math.round(distance)} NM`
    );

    setText(
        "bearingValue",
        `${String(
            Math.round(bearing)
        ).padStart(3, "0")}° true`
    );

    setText(
        "flightTimeValue",
        flightTime
            ? formatFlightTime(
                flightTime
            )
            : "Enter cruise speed"
    );

    updateRouteMap();

}


/* SUMMARY AND STORAGE */

function updateSummary() {

    setText(
        "departureSummary",
        normaliseCode(
            departure.value
        ) || "Not entered"
    );

    setText(
        "destinationSummary",
        normaliseCode(
            destination.value
        ) || "Not entered"
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


function saveFlight(
    showConfirmation = false
) {

    const flight = {

        departure:
            normaliseCode(
                departure.value
            ),

        destination:
            normaliseCode(
                destination.value
            ),

        altitude:
            altitude.value,

        departureTime:
            departureTime.value,

        cruiseSpeed:
            cruiseSpeed.value
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

            const status =
                $("statusValue");

            if (
                status &&
                status.textContent ===
                "Route Saved"
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
            localStorage.getItem(
                "lastFlight"
            );

        if (!saved) {

            cruiseSpeed.value = "110";
            updateSummary();

            return;
        }

        const flight =
            JSON.parse(saved);

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

    clearWeatherResults();

    saveFlight();

}


/* WEATHER API */

function makeWeatherUrl(
    latitude,
    longitude
) {

    const params =
        new URLSearchParams({

            latitude,
            longitude,

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
        "https://api.open-meteo.com/" +
        "v1/forecast?" +
        params.toString()
    );

}


async function fetchPointWeather(
    point
) {

    const response =
        await fetch(
            makeWeatherUrl(
                point.lat,
                point.lon
            ),
            {
                cache: "no-store"
            }
        );

    if (!response.ok) {

        throw new Error(
            `Weather service returned ` +
            `${response.status}`
        );

    }

    const data =
        await response.json();

    if (!data.current) {

        throw new Error(
            "Weather data was incomplete"
        );

    }

    return {
        ...point,

        current:
            data.current
    };

}


/* WEATHER DISPLAY HELPERS */

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

        61: "Light rain",

        63: "Rain",

        65: "Heavy rain",

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

    return (
        descriptions[code] ||
        "Forecast available"
    );

}


/* WEATHER ASSESSMENT */

function assessWeatherPoint(current) {

    const wind =
        safeNumber(
            current.wind_speed_10m
        );

    const gust =
        safeNumber(
            current.wind_gusts_10m
        );

    const cloud =
        safeNumber(
            current.cloud_cover
        );

    const precipitation =
        safeNumber(
            current.precipitation
        );

    const code =
        safeNumber(
            current.weather_code
        );

    let score = 0;

    const reasons = [];


    if (wind >= 22) {

        score += 3;
        reasons.push(
            `wind ${Math.round(wind)} kt`
        );

    } else if (wind >= 15) {

        score += 1;
        reasons.push(
            `wind ${Math.round(wind)} kt`
        );

    }


    if (gust >= 30) {

        score += 3;
        reasons.push(
            `gusts ${Math.round(gust)} kt`
        );

    } else if (gust >= 20) {

        score += 1;
        reasons.push(
            `gusts ${Math.round(gust)} kt`
        );

    }


    if (cloud >= 95) {

        score += 2;
        reasons.push(
            `cloud cover ${Math.round(cloud)}%`
        );

    } else if (cloud >= 85) {

        score += 1;
        reasons.push(
            `cloud cover ${Math.round(cloud)}%`
        );

    }


    if (precipitation >= 4) {

        score += 3;
        reasons.push(
            `precipitation ` +
            `${precipitation.toFixed(1)} mm`
        );

    } else if (precipitation > 0) {

        score += 1;
        reasons.push(
            `precipitation ` +
            `${precipitation.toFixed(1)} mm`
        );

    }


    if (
        [
            65,
            75,
            82,
            86,
            95,
            96,
            99
        ].includes(code)
    ) {

        score += 4;

        reasons.push(
            weatherDescription(code)
        );

    } else if (
        [
            45,
            48,
            51,
            53,
            55,
            61,
            63,
            71,
            73,
            77,
            80,
            81,
            85
        ].includes(code)
    ) {

        score += 1;

        reasons.push(
            weatherDescription(code)
        );

    }


    let level;
    let title;

    if (score >= 4) {

        level = "bad";
        title = "Higher concern";

    } else if (score >= 1) {

        level = "review";
        title = "Review";

    } else {

        level = "good";
        title = "Lower concern";

    }

    return {
        score,
        level,
        title,

        reasons:
            reasons.length > 0
                ? reasons
                : [
                    "No threshold flags detected"
                ]
    };

}


/* ENDPOINT WEATHER CARDS */

function renderAirportWeather(
    item,
    code,
    name
) {

    const weather =
        item.current;

    const temperature =
        safeNumber(
            weather.temperature_2m
        );

    const apparent =
        safeNumber(
            weather.apparent_temperature
        );

    const wind =
        safeNumber(
            weather.wind_speed_10m
        );

    const gust =
        safeNumber(
            weather.wind_gusts_10m
        );

    const direction =
        safeNumber(
            weather.wind_direction_10m
        );

    const cloud =
        safeNumber(
            weather.cloud_cover
        );

    const precipitation =
        safeNumber(
            weather.precipitation
        );

    const weatherCode =
        safeNumber(
            weather.weather_code
        );

    return `
        <article class="weather-card">

            <div class="airport-name">

                ${escapeHtml(code)}
                ·
                ${escapeHtml(name)}

            </div>

            <h3>

                ${weatherDescription(
                    weatherCode
                )}

            </h3>

            <p>

                🌡

                <strong>
                    ${Math.round(
                        temperature
                    )}°C
                </strong>

                · feels
                ${Math.round(apparent)}°C

            </p>

            <p>

                💨

                <strong>

                    ${String(
                        Math.round(direction)
                    ).padStart(3, "0")}°

                    ${compassDirection(
                        direction
                    )}

                    at
                    ${Math.round(wind)}
                    kt

                </strong>

            </p>

            <p>

                ↗ Gusts
                ${Math.round(gust)}
                kt

            </p>

            <p>

                ☁ Cloud cover
                ${Math.round(cloud)}%

            </p>

            <p>

                🌧 Precipitation
                ${precipitation.toFixed(1)}
                mm

            </p>

        </article>
    `;

}


/* ROUTE WEATHER CARDS */

function renderRouteWeatherPoint(
    item,
    index
) {

    const current =
        item.current;

    const assessment =
        item.assessment;

    const wind =
        safeNumber(
            current.wind_speed_10m
        );

    const gust =
        safeNumber(
            current.wind_gusts_10m
        );

    const cloud =
        safeNumber(
            current.cloud_cover
        );

    const precipitation =
        safeNumber(
            current.precipitation
        );

    const code =
        safeNumber(
            current.weather_code
        );

    const direction =
        safeNumber(
            current.wind_direction_10m
        );

    return `
        <article
            class="
                route-point-card
                ${assessment.level}
            "
        >

            <div class="route-point-position">

                <strong>
                    ${index + 1}
                </strong>

                <span>
                    ${Math.round(
                        item.distanceNm
                    )} NM
                </span>

            </div>


            <div class="route-point-main">

                <h3>

                    ${escapeHtml(
                        item.label
                    )}

                    ·

                    ${weatherDescription(
                        code
                    )}

                </h3>

                <p>

                    Wind

                    ${String(
                        Math.round(direction)
                    ).padStart(3, "0")}°

                    at
                    ${Math.round(wind)}
                    kt,

                    gusting
                    ${Math.round(gust)}
                    kt.

                    Cloud
                    ${Math.round(cloud)}%.

                    Rain
                    ${precipitation.toFixed(1)}
                    mm.

                </p>

            </div>


            <span
                class="
                    route-point-status
                    ${assessment.level}
                "
            >

                ${assessment.title.toUpperCase()}

            </span>

        </article>
    `;

}


/* OVERALL ROUTE ASSESSMENT */

function assessRoute(weatherPoints) {

    const sorted = [
        ...weatherPoints
    ].sort(
        (a, b) =>
            b.assessment.score -
            a.assessment.score
    );

    const worst =
        sorted[0];

    const badCount =
        weatherPoints.filter(
            (item) =>
                item.assessment.level ===
                "bad"
        ).length;

    const reviewCount =
        weatherPoints.filter(
            (item) =>
                item.assessment.level ===
                "review"
        ).length;

    let overallLevel;
    let overallTitle;
    let overallMessage;

    if (badCount > 0) {

        overallLevel = "bad";

        overallTitle =
            "🔴 HIGHER CONCERN";

        overallMessage =
            "At least one sampled point along the direct route triggered stronger weather flags. Review the highlighted location and confirm conditions using official aviation products.";

    } else if (reviewCount > 0) {

        overallLevel = "review";

        overallTitle =
            "🟠 ROUTE REVIEW";

        overallMessage =
            "One or more sampled points deserve closer examination. The route may contain stronger wind, gusts, extensive cloud or precipitation.";

    } else {

        overallLevel = "good";

        overallTitle =
            "🟢 LOWER CONCERN";

        overallMessage =
            "No threshold flags were detected at the sampled route points. This limited model snapshot is not a go/no-go recommendation.";

    }

    return {
        overallLevel,
        overallTitle,
        overallMessage,
        worst,
        badCount,
        reviewCount
    };

}


function renderRouteFocus(
    routeAssessment
) {

    const worst =
        routeAssessment.worst;

    if (!worst) {

        routeFocusResult.innerHTML = `
            <p class="muted-text">
                No route focus is available.
            </p>
        `;

        return;
    }

    const current =
        worst.current;

    const wind =
        safeNumber(
            current.wind_speed_10m
        );

    const gust =
        safeNumber(
            current.wind_gusts_10m
        );

    const cloud =
        safeNumber(
            current.cloud_cover
        );

    const precipitation =
        safeNumber(
            current.precipitation
        );

    const reasons =
        worst.assessment.reasons
            .map(escapeHtml)
            .join(", ");

    routeFocusResult.innerHTML = `
        <article
            class="
                focus-card
                ${worst.assessment.level}
            "
        >

            <h3>

                Point ${worst.index + 1}

                ·

                ${escapeHtml(worst.label)}

                ·

                ${Math.round(
                    worst.distanceNm
                )} NM from departure

            </h3>

            <p>

                This was the highest-scoring sampled
                point in the current route snapshot.

            </p>

            <p>

                Flags:
                <strong>${reasons}</strong>.

            </p>


            <div class="focus-metrics">

                <div>

                    <span>Wind</span>

                    <strong>
                        ${Math.round(wind)} kt
                    </strong>

                </div>


                <div>

                    <span>Gusts</span>

                    <strong>
                        ${Math.round(gust)} kt
                    </strong>

                </div>


                <div>

                    <span>Cloud</span>

                    <strong>
                        ${Math.round(cloud)}%
                    </strong>

                </div>

            </div>

            <p>

                Model precipitation:
                ${precipitation.toFixed(1)} mm.

            </p>

        </article>
    `;

}


/* RESET WEATHER */

function clearWeatherResults() {

    weatherResult.innerHTML = `
        <p class="muted-text">
            No weather has been requested yet.
        </p>
    `;

    routeWeatherResult.innerHTML = `
        <p class="muted-text">
            Request route weather to see conditions
            between departure and destination.
        </p>
    `;

    routeFocusResult.innerHTML = `
        <p class="muted-text">
            No route-weather assessment is
            available yet.
        </p>
    `;

    setText(
        "routeWeatherCount",
        "Not loaded"
    );

    setText(
        "statusValue",
        "Awaiting Weather"
    );

    setText(
        "warningsValue",
        "None"
    );

    setText(
        "updatedValue",
        "Not yet"
    );

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
        "Route Review"
    );

    setText(
        "decisionMessage",
        "Enter a departure and destination, then request route weather."
    );

    const panel =
        $("decisionPanel");

    panel?.classList.remove(
        "good",
        "review",
        "bad"
    );

    clearRouteWeatherMarkers();

}


/* MAIN WEATHER FUNCTION */

async function getWeather() {

    const depCode =
        normaliseCode(
            departure.value
        );

    const destCode =
        normaliseCode(
            destination.value
        );

    departure.value = depCode;
    destination.value = destCode;

    saveFlight();

    const start =
        aerodromes[depCode];

    const end =
        aerodromes[destCode];

    const missing = [];

    if (!start) {

        missing.push(
            depCode || "departure"
        );

    }

    if (!end) {

        missing.push(
            destCode || "destination"
        );

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

        setText(
            "warningsValue",
            "Unsupported aerodrome"
        );

        weatherResult.innerHTML = `
            <p class="error-text">

                Unsupported aerodrome:
                ${escapeHtml(
                    missing.join(" and ")
                )}.

            </p>
        `;

        return;
    }


    weatherButton.disabled = true;

    weatherButton.textContent =
        "Sampling route weather…";


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
        "Loading Route"
    );

    setText(
        "warningsValue",
        "Checking"
    );

    setText(
        "routeWeatherCount",
        "Loading"
    );


    weatherResult.innerHTML = `
        <p class="loading-text">
            Loading departure and destination weather…
        </p>
    `;


    routeWeatherResult.innerHTML = `
        <p class="loading-text">
            Sampling conditions along the route…
        </p>
    `;


    routeFocusResult.innerHTML = `
        <p class="loading-text">
            Assessing the route…
        </p>
    `;


    try {

        const samplePoints =
            createRouteSamplePoints(
                start,
                end,
                5
            );

        const weatherPoints =
            await Promise.all(
                samplePoints.map(
                    fetchPointWeather
                )
            );

        weatherPoints.forEach(
            (item) => {

                item.assessment =
                    assessWeatherPoint(
                        item.current
                    );

            }
        );


        const routeAssessment =
            assessRoute(
                weatherPoints
            );


        const departureWeather =
            weatherPoints[0];

        const destinationWeather =
            weatherPoints[
                weatherPoints.length - 1
            ];


        weatherResult.innerHTML = `
            <div class="weather-grid">

                ${renderAirportWeather(
                    departureWeather,
                    depCode,
                    start.name
                )}

                ${renderAirportWeather(
                    destinationWeather,
                    destCode,
                    end.name
                )}

            </div>
        `;


        routeWeatherResult.innerHTML = `
            <div class="route-weather-list">

                ${weatherPoints
                    .map(
                        renderRouteWeatherPoint
                    )
                    .join("")}

            </div>
        `;


        setText(
            "routeWeatherCount",
            `${weatherPoints.length} points`
        );


        renderRouteFocus(
            routeAssessment
        );


        addRouteWeatherMarkers(
            weatherPoints
        );


        const decisionPanel =
            $("decisionPanel");

        decisionPanel?.classList.remove(
            "good",
            "review",
            "bad"
        );

        decisionPanel?.classList.add(
            routeAssessment.overallLevel
        );


        setText(
            "decisionTitle",
            routeAssessment.overallTitle
        );


        setText(
            "decisionMessage",
            routeAssessment.overallMessage
        );


        if (
            routeAssessment.overallLevel ===
            "bad"
        ) {

            setText(
                "weatherBadge",
                "CHECK"
            );

            setClass(
                "weatherBadge",
                "weather-badge error"
            );

            setText(
                "warningsValue",
                `${routeAssessment.badCount} high flag`
            );

        } else if (
            routeAssessment.overallLevel ===
            "review"
        ) {

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
                `${routeAssessment.reviewCount} review`
            );

        } else {

            setText(
                "weatherBadge",
                "LIVE"
            );

            setClass(
                "weatherBadge",
                "weather-badge live"
            );

            setText(
                "warningsValue",
                "None detected"
            );

        }


        setText(
            "statusValue",
            "Route Loaded"
        );


        setText(
            "updatedValue",
            new Date()
                .toLocaleTimeString(
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
            "Service unavailable"
        );


        weatherResult.innerHTML = `
            <p class="error-text">

                Unable to retrieve weather.

                Check your internet connection
                and try again.

            </p>
        `;


        routeWeatherResult.innerHTML = `
            <p class="error-text">

                Route sampling could not be
                completed.

            </p>
        `;


        routeFocusResult.innerHTML = `
            <p class="error-text">

                No route assessment is available.

            </p>
        `;


    } finally {

        weatherButton.disabled = false;

        weatherButton.textContent =
            "🌦 Get Route Weather";

    }

}


/* INITIALISE */

function initialiseApp() {

    departure =
        $("departure");

    destination =
        $("destination");

    altitude =
        $("altitude");

    departureTime =
        $("departureTime");

    cruiseSpeed =
        $("cruiseSpeed");

    weatherButton =
        $("weatherButton");

    weatherResult =
        $("weatherResult");

    routeWeatherResult =
        $("routeWeatherResult");

    routeFocusResult =
        $("routeFocusResult");


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
        .forEach(
            (input) => {

                input.addEventListener(
                    "input",
                    () => {

                        clearRouteWeatherMarkers();
                        saveFlight();

                    }
                );

            }
        );


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
