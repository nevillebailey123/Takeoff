"use strict";

/*
    TAKEOFF

    General New Zealand route-weather prototype.

    Features:
    - New Zealand aerodrome database from OurAirports
    - Departure and destination search
    - Route distance and bearing
    - Leaflet route map
    - Open-Meteo route-weather sampling
    - Estimated cloud base from temperature/dew-point spread
    - Map markers show cloud base in hundreds of feet

    Marker examples:
    35 = 3,500 ft AGL
    08 = 800 ft AGL
    100+ = 10,000 ft AGL or higher

    Cloud-base colours:
    Green: 3,000 ft AGL or higher
    Orange: 1,000–2,999 ft AGL
    Red: below 1,000 ft AGL

    Cloud base is estimated using:
    temperature/dew-point spread × 400 ft

    This is not an official aviation weather briefing.
*/


const AIRPORT_DATA_URL =
    "https://davidmegginson.github.io/ourairports-data/airports.csv";


const $ = (id) => document.getElementById(id);


let aerodromes = [];
let airportLookup = new Map();

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


/* FALLBACK AERODROMES */

const fallbackAerodromes = [
    {
        ident: "NZAA",
        name: "Auckland Airport",
        type: "large_airport",
        lat: -37.0082,
        lon: 174.7850,
        elevationFt: 23
    },
    {
        ident: "NZAR",
        name: "Ardmore Airport",
        type: "small_airport",
        lat: -37.0297,
        lon: 174.9733,
        elevationFt: 111
    },
    {
        ident: "NZAS",
        name: "Ashburton Aerodrome",
        type: "small_airport",
        lat: -43.9033,
        lon: 171.7967,
        elevationFt: 298
    },
    {
        ident: "NZCH",
        name: "Christchurch International Airport",
        type: "large_airport",
        lat: -43.4894,
        lon: 172.5322,
        elevationFt: 123
    },
    {
        ident: "NZDN",
        name: "Dunedin Airport",
        type: "medium_airport",
        lat: -45.9281,
        lon: 170.1983,
        elevationFt: 4
    },
    {
        ident: "NZHK",
        name: "Hokitika Airport",
        type: "medium_airport",
        lat: -42.7136,
        lon: 170.9853,
        elevationFt: 146
    },
    {
        ident: "NZHN",
        name: "Hamilton Airport",
        type: "medium_airport",
        lat: -37.8667,
        lon: 175.3321,
        elevationFt: 172
    },
    {
        ident: "NZHT",
        name: "Haast Aerodrome",
        type: "small_airport",
        lat: -43.8650,
        lon: 169.0410,
        elevationFt: 19
    },
    {
        ident: "NZMF",
        name: "Milford Sound Airport",
        type: "small_airport",
        lat: -44.6733,
        lon: 167.9233,
        elevationFt: 10
    },
    {
        ident: "NZNS",
        name: "Nelson Airport",
        type: "medium_airport",
        lat: -41.2983,
        lon: 173.2211,
        elevationFt: 17
    },
    {
        ident: "NZNV",
        name: "Invercargill Airport",
        type: "medium_airport",
        lat: -46.4124,
        lon: 168.3130,
        elevationFt: 5
    },
    {
        ident: "NZQN",
        name: "Queenstown Airport",
        type: "medium_airport",
        lat: -45.0211,
        lon: 168.7390,
        elevationFt: 1171
    },
    {
        ident: "NZTG",
        name: "Tauranga Airport",
        type: "medium_airport",
        lat: -37.6719,
        lon: 176.1960,
        elevationFt: 13
    },
    {
        ident: "NZTU",
        name: "Timaru Airport",
        type: "medium_airport",
        lat: -44.3028,
        lon: 171.2253,
        elevationFt: 89
    },
    {
        ident: "NZWF",
        name: "Wānaka Airport",
        type: "small_airport",
        lat: -44.7222,
        lon: 169.2456,
        elevationFt: 1142
    },
    {
        ident: "NZWN",
        name: "Wellington International Airport",
        type: "large_airport",
        lat: -41.3272,
        lon: 174.8053,
        elevationFt: 42
    }
];


/* GENERAL HELPERS */

function normaliseText(value) {
    return String(value || "")
        .trim()
        .toUpperCase();
}


function safeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
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


function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function formatAirportType(type) {
    const labels = {
        large_airport: "Large airport",
        medium_airport: "Medium airport",
        small_airport: "Small aerodrome",
        seaplane_base: "Seaplane base",
        heliport: "Heliport",
        balloonport: "Balloon port"
    };

    return labels[type] || "Aerodrome";
}


/* CSV */

function parseCsv(text) {
    const rows = [];

    let row = [];
    let field = "";
    let insideQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];

        if (insideQuotes) {
            if (
                character === '"' &&
                text[index + 1] === '"'
            ) {
                field += '"';
                index += 1;
            } else if (character === '"') {
                insideQuotes = false;
            } else {
                field += character;
            }

            continue;
        }

        if (character === '"') {
            insideQuotes = true;
        } else if (character === ",") {
            row.push(field);
            field = "";
        } else if (character === "\n") {
            row.push(field);

            if (row.length > 1 || row[0] !== "") {
                rows.push(row);
            }

            row = [];
            field = "";
        } else if (character !== "\r") {
            field += character;
        }
    }

    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}


function rowsToObjects(rows) {
    if (rows.length < 2) {
        return [];
    }

    const headings = rows[0];

    return rows.slice(1).map((row) => {
        const result = {};

        headings.forEach((heading, index) => {
            result[heading] = row[index] || "";
        });

        return result;
    });
}


/* AERODROME DATABASE */

function isUsableNewZealandAirport(record) {
    const activeTypes = [
        "large_airport",
        "medium_airport",
        "small_airport",
        "seaplane_base",
        "heliport",
        "balloonport"
    ];

    return (
        record.iso_country === "NZ" &&
        activeTypes.includes(record.type)
    );
}


function buildAirportObject(record) {
    const ident =
        record.ident ||
        record.gps_code ||
        record.local_code ||
        record.iata_code;

    return {
        ident: normaliseText(ident),
        gpsCode: normaliseText(record.gps_code),
        localCode: normaliseText(record.local_code),
        iataCode: normaliseText(record.iata_code),
        name: record.name || "Unnamed aerodrome",
        municipality: record.municipality || "",
        region: record.iso_region || "",
        type: record.type || "small_airport",
        lat: safeNumber(record.latitude_deg, NaN),
        lon: safeNumber(record.longitude_deg, NaN),
        elevationFt: safeNumber(record.elevation_ft, 0)
    };
}


function registerAirportLookup(key, airport) {
    const normalised = normaliseText(key);

    if (
        normalised &&
        !airportLookup.has(normalised)
    ) {
        airportLookup.set(normalised, airport);
    }
}


function buildAirportLookup() {
    airportLookup = new Map();

    aerodromes.forEach((airport) => {
        registerAirportLookup(airport.ident, airport);
        registerAirportLookup(airport.gpsCode, airport);
        registerAirportLookup(airport.localCode, airport);
        registerAirportLookup(airport.iataCode, airport);
        registerAirportLookup(airport.name, airport);

        registerAirportLookup(
            `${airport.ident} ${airport.name}`,
            airport
        );

        registerAirportLookup(
            `${airport.name} ${airport.ident}`,
            airport
        );
    });
}


function airportDisplayValue(airport) {
    return `${airport.ident} · ${airport.name}`;
}


function populateAerodromeList() {
    const datalist = $("aerodromeList");

    if (!datalist) {
        return;
    }

    datalist.innerHTML = "";

    const fragment = document.createDocumentFragment();

    aerodromes.forEach((airport) => {
        const option = document.createElement("option");

        option.value = airportDisplayValue(airport);

        const location = airport.municipality
            ? ` · ${airport.municipality}`
            : "";

        option.label =
            `${formatAirportType(airport.type)}${location}`;

        fragment.appendChild(option);
    });

    datalist.appendChild(fragment);
}


function resolveAirport(value) {
    const query = normaliseText(value);

    if (!query) {
        return null;
    }

    if (airportLookup.has(query)) {
        return airportLookup.get(query);
    }

    const displayCode = query.split("·")[0].trim();

    if (
        displayCode &&
        airportLookup.has(displayCode)
    ) {
        return airportLookup.get(displayCode);
    }

    const exactName = aerodromes.find((airport) =>
        normaliseText(airport.name) === query
    );

    if (exactName) {
        return exactName;
    }

    const beginsWith = aerodromes.find((airport) => {
        const name = normaliseText(airport.name);
        const town = normaliseText(airport.municipality);

        return (
            airport.ident.startsWith(query) ||
            name.startsWith(query) ||
            town === query
        );
    });

    if (beginsWith) {
        return beginsWith;
    }

    return aerodromes.find((airport) => {
        const searchable = normaliseText([
            airport.ident,
            airport.gpsCode,
            airport.localCode,
            airport.iataCode,
            airport.name,
            airport.municipality
        ].join(" "));

        return searchable.includes(query);
    }) || null;
}


async function loadAerodromeDatabase() {
    setText(
        "airportDatabaseStatus",
        "Loading aerodromes"
    );

    try {
        const response = await fetch(
            AIRPORT_DATA_URL,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                `Aerodrome database returned ${response.status}`
            );
        }

        const csvText = await response.text();
        const records = rowsToObjects(parseCsv(csvText));

        aerodromes = records
            .filter(isUsableNewZealandAirport)
            .map(buildAirportObject)
            .filter((airport) =>
                airport.ident &&
                Number.isFinite(airport.lat) &&
                Number.isFinite(airport.lon)
            )
            .sort((a, b) =>
                a.name.localeCompare(b.name)
            );

        if (aerodromes.length < 20) {
            throw new Error(
                "Aerodrome database returned too few locations"
            );
        }

        buildAirportLookup();
        populateAerodromeList();

        setText(
            "airportDatabaseStatus",
            `${aerodromes.length} NZ locations`
        );

        setClass(
            "airportDatabaseStatus",
            "database-badge loaded"
        );

        setText("statusValue", "Ready");
    } catch (error) {
        console.warn(
            "Using fallback aerodrome list",
            error
        );

        aerodromes = [...fallbackAerodromes]
            .sort((a, b) =>
                a.name.localeCompare(b.name)
            );

        buildAirportLookup();
        populateAerodromeList();

        setText(
            "airportDatabaseStatus",
            "Limited fallback list"
        );

        setClass(
            "airportDatabaseStatus",
            "database-badge fallback"
        );

        setText(
            "statusValue",
            "Limited Database"
        );
    }

    loadFlight();
    updateSummary();
}


/* ROUTE CALCULATIONS */

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

    const c =
        2 *
        Math.atan2(
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

    const totalMinutes = Math.round(hours * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (wholeHours === 0) {
        return `${minutes} min`;
    }

    return (
        `${wholeHours} hr ` +
        `${String(minutes).padStart(2, "0")} min`
    );
}


function calculateSampleCount(distanceNm) {
    if (distanceNm <= 30) {
        return 3;
    }

    if (distanceNm <= 70) {
        return 4;
    }

    if (distanceNm <= 130) {
        return 5;
    }

    if (distanceNm <= 220) {
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
                (end.lat - start.lat) * fraction,

            lon:
                start.lon +
                (end.lon - start.lon) * fraction,

            fraction
        });
    }

    return points;
}


function calculateRoute() {
    const start = resolveAirport(
        departure.value
    );

    const end = resolveAirport(
        destination.value
    );

    if (!start || !end) {
        setText(
            "resolvedDeparture",
            start
                ? airportDisplayValue(start)
                : "Not selected"
        );

        setText(
            "resolvedDestination",
            end
                ? airportDisplayValue(end)
                : "Not selected"
        );

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

    const speed = safeNumber(
        cruiseSpeed.value,
        0
    );

    const flightTime =
        speed > 0
            ? distance / speed
            : null;

    const sampleCount =
        calculateSampleCount(distance);

    setText(
        "resolvedDeparture",
        airportDisplayValue(start)
    );

    setText(
        "resolvedDestination",
        airportDisplayValue(end)
    );

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
        start,
        end,
        distance,
        bearing,
        speed,
        flightTime,
        sampleCount
    };
}


/* MAP */

function createRouteIcon() {
    return L.divIcon({
        className: "",

        html:
            '<div class="route-marker"></div>',

        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -10]
    });
}


function cloudBaseMarkerText(cloudBaseFt) {
    if (!Number.isFinite(cloudBaseFt)) {
        return "?";
    }

    if (cloudBaseFt >= 10000) {
        return "100+";
    }

    const hundreds = Math.max(
        0,
        Math.round(cloudBaseFt / 100)
    );

    return String(hundreds).padStart(2, "0");
}


function createWeatherIcon(
    riskClass,
    cloudBaseFt
) {
    const label =
        cloudBaseMarkerText(cloudBaseFt);

    return L.divIcon({
        className: "",

        html: `
            <div
                class="
                    weather-map-marker
                    ${riskClass}
                "
                title="Cloud base ${formatCloudBase(cloudBaseFt)}"
            >
                ${label}
            </div>
        `,

        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -18]
    });
}


function initialiseMap() {
    const mapElement = $("routeMap");

    if (!mapElement) {
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

    routeMap = L.map(
        "routeMap",
        {
            zoomControl: true
        }
    ).setView(
        [-41.7, 172.4],
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


function removeMapLayer(layer) {
    if (
        routeMap &&
        layer &&
        routeMap.hasLayer(layer)
    ) {
        routeMap.removeLayer(layer);
    }
}


function clearWeatherMarkers() {
    routeWeatherMarkers.forEach(
        removeMapLayer
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

    clearWeatherMarkers();

    setText(
        "mapRouteLabel",
        "No route"
    );
}


function updateRouteMap() {
    if (
        !routeMap ||
        !departure ||
        !destination
    ) {
        return;
    }

    const start = resolveAirport(
        departure.value
    );

    const end = resolveAirport(
        destination.value
    );

    clearRouteMap();

    if (!start || !end) {
        routeMap.setView(
            [-41.7, 172.4],
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
        .bindPopup(`
            <strong>
                ${escapeHtml(start.ident)}
            </strong>

            <br>

            ${escapeHtml(start.name)}

            <br>

            Elevation:
            ${Math.round(start.elevationFt)} ft
        `);

    destinationMarker = L.marker(
        endPosition,
        {
            icon: createRouteIcon()
        }
    )
        .addTo(routeMap)
        .bindPopup(`
            <strong>
                ${escapeHtml(end.ident)}
            </strong>

            <br>

            ${escapeHtml(end.name)}

            <br>

            Elevation:
            ${Math.round(end.elevationFt)} ft
        `);

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
        `${start.ident} → ${end.ident}`
    );

    window.setTimeout(() => {
        routeMap.invalidateSize();
    }, 100);
}


/* CLOUD BASE */

function estimateCloudBaseFtAgl(
    temperatureC,
    dewPointC
) {
    if (
        !Number.isFinite(temperatureC) ||
        !Number.isFinite(dewPointC)
    ) {
        return null;
    }

    const spread = Math.max(
        0,
        temperatureC - dewPointC
    );

    return Math.round(spread * 400);
}


function assessCloudBase(cloudBaseFt) {
    if (!Number.isFinite(cloudBaseFt)) {
        return {
            level: 2,
            className: "review",
            label: "Cloud base unavailable"
        };
    }

    if (cloudBaseFt < 1000) {
        return {
            level: 3,
            className: "high",
            label: "Cloud base below 1,000 ft"
        };
    }

    if (cloudBaseFt < 3000) {
        return {
            level: 2,
            className: "review",
            label: "Cloud base 1,000–2,999 ft"
        };
    }

    return {
        level: 1,
        className: "low",
        label: "Cloud base 3,000 ft or above"
    };
}


function formatCloudBase(cloudBaseFt) {
    if (!Number.isFinite(cloudBaseFt)) {
        return "Unavailable";
    }

    if (cloudBaseFt < 100) {
        return "<100 ft AGL";
    }

    return (
        `${Math.round(cloudBaseFt / 100) * 100}` +
        " ft AGL"
    );
}


/* WEATHER */

function makeWeatherUrl(point) {
    const params = new URLSearchParams({
        latitude: point.lat,
        longitude: point.lon,

        current: [
            "temperature_2m",
            "dew_point_2m",
            "apparent_temperature",
            "precipitation",
            "weather_code",
            "cloud_cover",
            "cloud_cover_low",
            "visibility",
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

    const temperature = safeNumber(
        data.current.temperature_2m,
        NaN
    );

    const dewPoint = safeNumber(
        data.current.dew_point_2m,
        NaN
    );

    return {
        ...point,
        current: data.current,

        cloudBaseFt:
            estimateCloudBaseFtAgl(
                temperature,
                dewPoint
            )
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

    return descriptions[code] ||
        "Forecast available";
}


function assessPointRisk(point) {
    const current = point.current;

    const wind = safeNumber(
        current.wind_speed_10m
    );

    const gust = safeNumber(
        current.wind_gusts_10m
    );

    const rain = safeNumber(
        current.precipitation
    );

    const visibilityKm =
        safeNumber(
            current.visibility,
            100000
        ) / 1000;

    const code = safeNumber(
        current.weather_code
    );

    const cloudAssessment =
        assessCloudBase(
            point.cloudBaseFt
        );

    let level =
        cloudAssessment.level;

    const reasons = [];

    if (point.cloudBaseFt < 3000) {
        reasons.push(
            `cloud base ${formatCloudBase(
                point.cloudBaseFt
            )}`
        );
    }

    if (wind >= 22) {
        level = Math.max(level, 3);

        reasons.push(
            `wind ${Math.round(wind)} kt`
        );
    } else if (wind >= 15) {
        level = Math.max(level, 2);

        reasons.push(
            `wind ${Math.round(wind)} kt`
        );
    }

    if (gust >= 30) {
        level = Math.max(level, 3);

        reasons.push(
            `gusts ${Math.round(gust)} kt`
        );
    } else if (gust >= 20) {
        level = Math.max(level, 2);

        reasons.push(
            `gusts ${Math.round(gust)} kt`
        );
    }

    if (visibilityKm < 5) {
        level = Math.max(level, 3);

        reasons.push(
            `visibility ${visibilityKm.toFixed(1)} km`
        );
    } else if (visibilityKm < 10) {
        level = Math.max(level, 2);

        reasons.push(
            `visibility ${visibilityKm.toFixed(1)} km`
        );
    }

    if (rain >= 4) {
        level = Math.max(level, 3);

        reasons.push(
            `precipitation ${rain.toFixed(1)} mm`
        );
    } else if (rain > 0) {
        level = Math.max(level, 2);

        reasons.push(
            `precipitation ${rain.toFixed(1)} mm`
        );
    }

    if (
        [
            57,
            65,
            67,
            75,
            82,
            86,
            95,
            96,
            99
        ].includes(code)
    ) {
        level = 3;
        reasons.push(weatherDescription(code));
    } else if (
        [
            45,
            48,
            53,
            55,
            56,
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
        level = Math.max(level, 2);
        reasons.push(weatherDescription(code));
    }

    if (level >= 3) {
        return {
            level: 3,
            className: "high",
            label: "High concern",

            reasons:
                reasons.length
                    ? reasons
                    : ["Higher-concern conditions"]
        };
    }

    if (level === 2) {
        return {
            level: 2,
            className: "review",
            label: "Review",

            reasons:
                reasons.length
                    ? reasons
                    : ["Conditions deserve review"]
        };
    }

    return {
        level: 1,
        className: "low",
        label: "Lower concern",

        reasons: [
            "No threshold concerns detected"
        ]
    };
}


/* WEATHER DISPLAY */

function routePointLabel(
    point,
    index,
    total,
    route
) {
    if (index === 0) {
        return (
            `${route.start.ident} · ` +
            `${route.start.name}`
        );
    }

    if (index === total - 1) {
        return (
            `${route.end.ident} · ` +
            `${route.end.name}`
        );
    }

    return (
        `${Math.round(point.fraction * 100)}` +
        "% along route"
    );
}


function distanceAlongRoute(point, route) {
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

            ${points.map((point, index) => {
                const current = point.current;
                const risk = assessPointRisk(point);

                const cloudAssessment =
                    assessCloudBase(
                        point.cloudBaseFt
                    );

                const temperature = safeNumber(
                    current.temperature_2m
                );

                const dewPoint = safeNumber(
                    current.dew_point_2m
                );

                const wind = safeNumber(
                    current.wind_speed_10m
                );

                const gust = safeNumber(
                    current.wind_gusts_10m
                );

                const direction = safeNumber(
                    current.wind_direction_10m
                );

                const visibilityKm =
                    safeNumber(
                        current.visibility
                    ) / 1000;

                const rain = safeNumber(
                    current.precipitation
                );

                const code = safeNumber(
                    current.weather_code
                );

                const label = routePointLabel(
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

                const reasons = risk.reasons
                    .map(escapeHtml)
                    .join(", ");

                return `
                    <article
                        class="
                            route-weather-card
                            ${risk.className}
                        "
                    >

                        <div class="route-step">
                            ${index + 1}
                        </div>

                        <div>

                            <div class="route-card-heading">

                                <strong>
                                    ${escapeHtml(label)}
                                </strong>

                                <span>
                                    ${distance} NM
                                </span>

                            </div>

                            <p>
                                ${weatherDescription(code)}
                                ·
                                ${Math.round(temperature)}°C

                                · Dew point
                                ${Math.round(dewPoint)}°C
                            </p>

                            <p>
                                Wind

                                ${String(
                                    Math.round(direction)
                                ).padStart(3, "0")}°

                                ${compassDirection(direction)}

                                at
                                ${Math.round(wind)} kt

                                · gusts
                                ${Math.round(gust)} kt
                            </p>

                            <div class="weather-metrics">

                                <div class="weather-metric">

                                    <span>
                                        Cloud base
                                    </span>

                                    <strong
                                        class="
                                            cloud-base-value
                                            ${cloudAssessment.className}
                                        "
                                    >
                                        ${formatCloudBase(
                                            point.cloudBaseFt
                                        )}
                                    </strong>

                                </div>

                                <div class="weather-metric">

                                    <span>
                                        Visibility
                                    </span>

                                    <strong>
                                        ${visibilityKm.toFixed(1)} km
                                    </strong>

                                </div>

                                <div class="weather-metric">

                                    <span>
                                        Wind
                                    </span>

                                    <strong>
                                        ${Math.round(wind)} kt
                                    </strong>

                                </div>

                                <div class="weather-metric">

                                    <span>
                                        Gusts
                                    </span>

                                    <strong>
                                        ${Math.round(gust)} kt
                                    </strong>

                                </div>

                            </div>

                            <p>
                                Precipitation:
                                ${rain.toFixed(1)} mm
                            </p>

                            <p class="route-condition">
                                ${risk.label}:
                                ${reasons}
                            </p>

                        </div>

                    </article>
                `;
            }).join("")}

        </div>
    `;
}


function renderAirportWeather(
    point,
    airport
) {
    const current = point.current;
    const risk = assessPointRisk(point);

    const cloudAssessment =
        assessCloudBase(
            point.cloudBaseFt
        );

    const temperature = safeNumber(
        current.temperature_2m
    );

    const apparent = safeNumber(
        current.apparent_temperature
    );

    const dewPoint = safeNumber(
        current.dew_point_2m
    );

    const wind = safeNumber(
        current.wind_speed_10m
    );

    const gust = safeNumber(
        current.wind_gusts_10m
    );

    const direction = safeNumber(
        current.wind_direction_10m
    );

    const visibilityKm =
        safeNumber(
            current.visibility
        ) / 1000;

    const precipitation = safeNumber(
        current.precipitation
    );

    const weatherCode = safeNumber(
        current.weather_code
    );

    return `
        <article
            class="
                weather-card
                ${risk.className}
            "
        >

            <div class="airport-name">

                ${escapeHtml(airport.ident)}
                ·
                ${escapeHtml(airport.name)}

            </div>

            <h3>
                ${weatherDescription(weatherCode)}
            </h3>

            <p>
                🌡

                <strong>
                    ${Math.round(temperature)}°C
                </strong>

                · feels
                ${Math.round(apparent)}°C

                · dew point
                ${Math.round(dewPoint)}°C
            </p>

            <p>
                💨

                <strong>
                    ${String(
                        Math.round(direction)
                    ).padStart(3, "0")}°

                    ${compassDirection(direction)}

                    at
                    ${Math.round(wind)} kt
                </strong>

                · gusts
                ${Math.round(gust)} kt
            </p>

            <p>
                Cloud base:

                <strong
                    class="
                        cloud-base-value
                        ${cloudAssessment.className}
                    "
                >
                    ${formatCloudBase(
                        point.cloudBaseFt
                    )}
                </strong>
            </p>

            <p>
                Visibility:
                ${visibilityKm.toFixed(1)} km
            </p>

            <p>
                Precipitation:
                ${precipitation.toFixed(1)} mm
            </p>

            <p>
                Aerodrome elevation:
                ${Math.round(
                    airport.elevationFt
                )} ft
            </p>

        </article>
    `;
}


function plotWeatherMarkers(
    points,
    route
) {
    if (!routeMap) {
        return;
    }

    clearWeatherMarkers();

    points.forEach((point, index) => {
        const risk = assessPointRisk(point);
        const current = point.current;

        const label = routePointLabel(
            point,
            index,
            points.length,
            route
        );

        const visibilityKm =
            safeNumber(
                current.visibility
            ) / 1000;

        const direction = safeNumber(
            current.wind_direction_10m
        );

        const wind = safeNumber(
            current.wind_speed_10m
        );

        const gust = safeNumber(
            current.wind_gusts_10m
        );

        const rain = safeNumber(
            current.precipitation
        );

        const marker = L.marker(
            [
                point.lat,
                point.lon
            ],
            {
                icon: createWeatherIcon(
                    risk.className,
                    point.cloudBaseFt
                )
            }
        )
            .addTo(routeMap)
            .bindPopup(`
                <strong>
                    ${escapeHtml(label)}
                </strong>

                <br><br>

                Cloud base:
                <strong>
                    ${formatCloudBase(
                        point.cloudBaseFt
                    )}
                </strong>

                <br>

                Visibility:
                ${visibilityKm.toFixed(1)} km

                <br>

                Wind:
                ${String(
                    Math.round(direction)
                ).padStart(3, "0")}°

                at
                ${Math.round(wind)} kt

                <br>

                Gusts:
                ${Math.round(gust)} kt

                <br>

                Precipitation:
                ${rain.toFixed(1)} mm

                <br><br>

                <strong>
                    ${risk.label}
                </strong>
            `);

        routeWeatherMarkers.push(marker);
    });
}


/* WHOLE ROUTE ASSESSMENT */

function pointConcernScore(point) {
    const current = point.current;

    const cloudPenalty =
        Number.isFinite(point.cloudBaseFt)
            ? Math.max(
                0,
                3000 - point.cloudBaseFt
            )
            : 1000;

    return (
        cloudPenalty +
        safeNumber(
            current.wind_gusts_10m
        ) * 40 +
        Math.max(
            0,
            10 -
            safeNumber(
                current.visibility,
                100000
            ) / 1000
        ) * 100
    );
}


function assessWholeRoute(points) {
    const assessed = points.map((point) => ({
        point,
        risk: assessPointRisk(point)
    }));

    const worst = assessed.reduce(
        (currentWorst, item) => {
            if (
                item.risk.level >
                currentWorst.risk.level
            ) {
                return item;
            }

            if (
                item.risk.level ===
                currentWorst.risk.level &&
                pointConcernScore(item.point) >
                pointConcernScore(
                    currentWorst.point
                )
            ) {
                return item;
            }

            return currentWorst;
        },
        assessed[0]
    );

    const maxWind = Math.max(
        ...points.map((point) =>
            safeNumber(
                point.current.wind_speed_10m
            )
        )
    );

    const maxGust = Math.max(
        ...points.map((point) =>
            safeNumber(
                point.current.wind_gusts_10m
            )
        )
    );

    const validCloudBases = points
        .map((point) => point.cloudBaseFt)
        .filter(Number.isFinite);

    const minimumCloudBase =
        validCloudBases.length
            ? Math.min(...validCloudBases)
            : NaN;

    const minimumVisibility = Math.min(
        ...points.map((point) =>
            safeNumber(
                point.current.visibility,
                100000
            ) / 1000
        )
    );

    return {
        worst,
        maxWind,
        maxGust,
        minimumCloudBase,
        minimumVisibility
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

    const worstIndex = points.indexOf(
        assessment.worst.point
    );

    const worstLocation = routePointLabel(
        assessment.worst.point,
        worstIndex,
        points.length,
        route
    );

    const level =
        assessment.worst.risk.level;

    if (level === 3) {
        panel?.classList.add("bad");

        setText(
            "decisionTitle",
            "🔴 HIGH CONCERN"
        );

        setText(
            "decisionMessage",
            `The highest-concern conditions are near ${worstLocation}. Check the cloud base, visibility, wind and official aviation weather before making any flight decision.`
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
    } else if (level === 2) {
        panel?.classList.add("review");

        setText(
            "decisionTitle",
            "🟠 ROUTE REVIEW"
        );

        setText(
            "decisionMessage",
            `Conditions deserve closer examination near ${worstLocation}. Check the cloud base, visibility, wind, precipitation and terrain.`
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
            "No configured threshold concerns were found at the sampled points. This is not a go or no-go recommendation."
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

            <span>
                Lowest cloud base
            </span>

            <strong>
                ${formatCloudBase(
                    assessment.minimumCloudBase
                )}
            </strong>

        </div>

        <div class="risk-detail">

            <span>
                Lowest visibility
            </span>

            <strong>
                ${assessment.minimumVisibility.toFixed(1)} km
            </strong>

        </div>

        <div class="risk-detail">

            <span>
                Maximum wind
            </span>

            <strong>
                ${Math.round(
                    assessment.maxWind
                )} kt
            </strong>

        </div>

        <div class="risk-detail">

            <span>
                Maximum gust
            </span>

            <strong>
                ${Math.round(
                    assessment.maxGust
                )} kt
            </strong>

        </div>
    `;
}


/* SAVE AND LOAD */

function updateSummary() {
    const start = resolveAirport(
        departure.value
    );

    const end = resolveAirport(
        destination.value
    );

    setText(
        "departureSummary",
        start
            ? airportDisplayValue(start)
            : departure.value.trim() ||
              "Not entered"
    );

    setText(
        "destinationSummary",
        end
            ? airportDisplayValue(end)
            : destination.value.trim() ||
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
    const start = resolveAirport(
        departure.value
    );

    const end = resolveAirport(
        destination.value
    );

    const flight = {
        departure:
            start
                ? airportDisplayValue(start)
                : departure.value,

        destination:
            end
                ? airportDisplayValue(end)
                : destination.value,

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
            if (
                $("statusValue")?.textContent ===
                "Route Saved"
            ) {
                setText(
                    "statusValue",
                    "Ready"
                );
            }
        }, 1600);
    }
}


function loadFlight() {
    try {
        const saved = localStorage.getItem(
            "lastFlight"
        );

        if (!saved) {
            cruiseSpeed.value =
                cruiseSpeed.value || "110";

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
    } catch (error) {
        console.warn(
            "Could not load saved flight",
            error
        );

        cruiseSpeed.value = "110";
    }
}


function normaliseAirportInput(input) {
    const airport = resolveAirport(
        input.value
    );

    if (airport) {
        input.value =
            airportDisplayValue(airport);
    }
}


function reverseRoute() {
    const oldDeparture =
        departure.value;

    departure.value =
        destination.value;

    destination.value =
        oldDeparture;

    clearWeatherBriefing();
    saveFlight();
}


function clearWeatherBriefing() {
    clearWeatherMarkers();

    setText(
        "routeWeatherStatus",
        "Not loaded"
    );

    routeWeatherResult.innerHTML = `
        <p class="muted-text">
            Request a briefing to sample conditions
            along the direct route.
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
        "Select a departure and destination, then request a route weather briefing."
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

    $("riskDetails")
        ?.classList.add("hidden");
}


/* GET WEATHER */

async function getWeather() {
    normaliseAirportInput(departure);
    normaliseAirportInput(destination);

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
                Select valid departure and destination
                aerodromes from the suggestions.
            </p>
        `;

        return;
    }

    saveFlight();

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
            Sampling cloud base and weather
            along the route…
        </div>
    `;

    try {
        const routePoints = interpolateRoute(
            route.start,
            route.end,
            route.sampleCount
        );

        const weatherPoints =
            await Promise.all(
                routePoints.map(fetchPointWeather)
            );

        renderRouteWeather(
            weatherPoints,
            route
        );

        weatherResult.innerHTML = `
            <div class="weather-grid">

                ${renderAirportWeather(
                    weatherPoints[0],
                    route.start
                )}

                ${renderAirportWeather(
                    weatherPoints[
                        weatherPoints.length - 1
                    ],
                    route.end
                )}

            </div>
        `;

        plotWeatherMarkers(
            weatherPoints,
            route
        );

        const assessment =
            assessWholeRoute(weatherPoints);

        displayOverallAssessment(
            assessment,
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
                Unable to retrieve weather.
                Check your internet connection
                and try again.
            </p>
        `;

        routeWeatherResult.innerHTML = `
            <p class="error-text">
                Route weather analysis could
                not be completed.
            </p>
        `;
    } finally {
        weatherButton.disabled = false;

        weatherButton.textContent =
            "🌦 Get Route Weather Briefing";
    }
}


/* START APP */

function initialiseApp() {
    departure = $("departure");
    destination = $("destination");
    altitude = $("altitude");
    departureTime = $("departureTime");
    cruiseSpeed = $("cruiseSpeed");
    weatherButton = $("weatherButton");
    weatherResult = $("weatherResult");
    routeWeatherResult = $("routeWeatherResult");

    $("reverseButton").addEventListener(
        "click",
        reverseRoute
    );

    $("saveButton").addEventListener(
        "click",
        () => saveFlight(true)
    );

    weatherButton.addEventListener(
        "click",
        getWeather
    );

    document
        .querySelectorAll("input")
        .forEach((input) => {
            input.addEventListener(
                "input",
                () => {
                    clearWeatherMarkers();
                    updateSummary();
                }
            );

            input.addEventListener(
                "change",
                () => {
                    if (
                        input === departure ||
                        input === destination
                    ) {
                        normaliseAirportInput(input);
                    }

                    saveFlight();
                }
            );
        });

    departure.addEventListener(
        "blur",
        () => {
            normaliseAirportInput(departure);
            saveFlight();
        }
    );

    destination.addEventListener(
        "blur",
        () => {
            normaliseAirportInput(destination);
            saveFlight();
        }
    );

    initialiseMap();
    loadAerodromeDatabase();
}


document.addEventListener(
    "DOMContentLoaded",
    initialiseApp
);
