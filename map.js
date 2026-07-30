"use strict";

/*
    TAKEOFF
    New Zealand VFR Weather Briefing

    map.js
    Displays the route and forecast sampling points
    using Leaflet.
*/


/* ==========================================================
   MAP STATE
========================================================== */

let routeMap = null;

let routeLine = null;

let markerLayer = null;


/* ==========================================================
   INITIALISE MAP
========================================================== */

export function initialiseMap() {

    const mapElement =
        document.getElementById("routeMap");

    if (!mapElement) {

        console.warn(
            "Route map element was not found."
        );

        return;
    }

    if (
        typeof window.L ===
        "undefined"
    ) {

        console.error(
            "Leaflet has not loaded."
        );

        return;
    }

    if (routeMap) {

        return;
    }

    routeMap =
        window.L.map(
            mapElement,
            {

                zoomControl:
                    true,

                attributionControl:
                    true
            }
        ).setView(
            [
                -41.2,
                172.7
            ],
            5
        );

    window.L.tileLayer(

        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

        {

            maxZoom:
                18,

            attribution:
                "&copy; OpenStreetMap contributors"

        }

    ).addTo(
        routeMap
    );

    markerLayer =
        window.L.layerGroup()
            .addTo(
                routeMap
            );
}


/* ==========================================================
   RENDER ROUTE MAP
========================================================== */

export function renderRouteMap(
    briefing
) {

    if (!routeMap) {

        initialiseMap();
    }

    if (
        !routeMap ||
        !briefing
    ) {

        return;
    }

    clearMap();

    const routePoints =
        getRoutePoints(
            briefing
        );

    const forecasts =
        getForecasts(
            briefing
        );

    if (
        routePoints.length ===
        0
    ) {

        return;
    }

    drawRouteLine(
        routePoints
    );

    drawForecastMarkers(
        forecasts
    );

    fitMapToRoute(
        routePoints
    );

    /*
        The map may have been hidden while the briefing
        was being prepared. Leaflet needs its size refreshed
        after the panel becomes visible.
    */

    window.setTimeout(
        () => {

            routeMap.invalidateSize();

            fitMapToRoute(
                routePoints
            );

        },
        150
    );
}


/* ==========================================================
   CLEAR MAP
========================================================== */

function clearMap() {

    if (
        routeLine &&
        routeMap
    ) {

        routeMap.removeLayer(
            routeLine
        );

        routeLine = null;
    }

    if (markerLayer) {

        markerLayer.clearLayers();
    }
}


/* ==========================================================
   ROUTE LINE
========================================================== */

function drawRouteLine(
    routePoints
) {

    const coordinates =
        routePoints.map(
            (point) => {

                return [

                    Number(
                        point.latitude
                    ),

                    Number(
                        point.longitude
                    )
                ];
            }
        );

    routeLine =
        window.L.polyline(
            coordinates,
            {

                color:
                    "#3ba3ff",

                weight:
                    4,

                opacity:
                    0.9,

                lineJoin:
                    "round"
            }
        ).addTo(
            routeMap
        );
}


/* ==========================================================
   FORECAST MARKERS
========================================================== */

function drawForecastMarkers(
    forecasts
) {

    forecasts.forEach(
        (forecast, index) => {

            const latitude =
                Number(
                    forecast.latitude
                );

            const longitude =
                Number(
                    forecast.longitude
                );

            if (
                !Number.isFinite(
                    latitude
                ) ||
                !Number.isFinite(
                    longitude
                )
            ) {

                return;
            }

            const marker =
                window.L.marker(

                    [
                        latitude,
                        longitude
                    ],

                    {

                        icon:
                            createWeatherIcon(
                                forecast,
                                index
                            ),

                        keyboard:
                            true,

                        title:
                            forecast.label ||
                            "Route forecast point"
                    }

                );

            marker.bindPopup(
                buildPopupHtml(
                    forecast
                )
            );

            marker.addTo(
                markerLayer
            );
        }
    );
}


/* ==========================================================
   MARKER ICON
========================================================== */

function createWeatherIcon(
    forecast,
    index
) {

    const colour =
        getConditionColour(
            forecast
        );

    const cloudBaseLabel =
        getCloudBaseMarkerLabel(
            forecast.cloudBaseFeet
        );

    const routePointClass =
        forecast.isRoutePoint
            ? " route-weather-marker-major"
            : "";

    const html = `

        <div
            class="route-weather-marker${routePointClass}"
            style="
                background:${colour};
                width:${forecast.isRoutePoint ? 42 : 34}px;
                height:${forecast.isRoutePoint ? 42 : 34}px;
                border-radius:50%;
                display:flex;
                align-items:center;
                justify-content:center;
                color:#ffffff;
                font-size:${forecast.isRoutePoint ? 14 : 12}px;
                font-weight:700;
                border:3px solid #ffffff;
                box-shadow:0 4px 12px rgba(0,0,0,.45);
            "
            aria-label="Weather point ${index + 1}"
        >
            ${escapeHtml(cloudBaseLabel)}
        </div>
    `;

    const size =
        forecast.isRoutePoint
            ? 42
            : 34;

    return window.L.divIcon({

        html,

        className:
            "takeoff-weather-icon",

        iconSize:

            [
                size,
                size
            ],

        iconAnchor:

            [
                size / 2,
                size / 2
            ],

        popupAnchor:

            [
                0,
                -(size / 2)
            ]
    });
}


/* ==========================================================
   POPUP
========================================================== */

function buildPopupHtml(
    forecast
) {

    const label =
        forecast.label ||
        "Route forecast";

    const eta =
        forecast.display?.eta ||
        formatTime(
            forecast.etaDate ||
            forecast.eta
        );

    const cloudBase =
        forecast.display?.cloudBase ||
        formatCloudBase(
            forecast.cloudBaseFeet
        );

    const visibility =
        forecast.display?.visibility ||
        formatVisibility(
            forecast.visibilityKm
        );

    const wind =
        forecast.display?.wind ||
        "Unavailable";

    const weather =
        forecast.display?.weather ||
        forecast.weatherDescription ||
        "Forecast weather";

    const concern =
        forecast.primaryConcern ||
        (
            forecast.conditionLevel ===
            "good"
                ? "No significant concern identified."
                : "Review this forecast point carefully."
        );

    return `

        <div
            style="
                min-width:220px;
                color:#071525;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
            "
        >

            <strong
                style="
                    display:block;
                    font-size:16px;
                    margin-bottom:4px;
                "
            >
                ${escapeHtml(label)}
            </strong>

            <span
                style="
                    display:block;
                    color:#52677c;
                    margin-bottom:12px;
                "
            >
                ETA ${escapeHtml(eta)}
            </span>

            <div
                style="
                    display:grid;
                    grid-template-columns:1fr 1fr;
                    gap:8px;
                    font-size:13px;
                "
            >

                <div>
                    <span style="color:#6b7f91;">
                        Cloud
                    </span>
                    <br>
                    <strong>
                        ${escapeHtml(cloudBase)}
                    </strong>
                </div>

                <div>
                    <span style="color:#6b7f91;">
                        Visibility
                    </span>
                    <br>
                    <strong>
                        ${escapeHtml(visibility)}
                    </strong>
                </div>

                <div>
                    <span style="color:#6b7f91;">
                        Wind
                    </span>
                    <br>
                    <strong>
                        ${escapeHtml(wind)}
                    </strong>
                </div>

                <div>
                    <span style="color:#6b7f91;">
                        Weather
                    </span>
                    <br>
                    <strong>
                        ${escapeHtml(weather)}
                    </strong>
                </div>

            </div>

            <p
                style="
                    margin:12px 0 0;
                    padding-top:10px;
                    border-top:1px solid #d9e0e6;
                    line-height:1.4;
                    font-size:13px;
                "
            >
                ${escapeHtml(concern)}
            </p>

        </div>
    `;
}


/* ==========================================================
   MAP BOUNDS
========================================================== */

function fitMapToRoute(
    routePoints
) {

    if (
        !routeMap ||
        routePoints.length ===
        0
    ) {

        return;
    }

    const coordinates =
        routePoints
            .map(
                (point) => {

                    return [

                        Number(
                            point.latitude
                        ),

                        Number(
                            point.longitude
                        )
                    ];
                }
            )
            .filter(
                (coordinate) => {

                    return (
                        Number.isFinite(
                            coordinate[0]
                        ) &&
                        Number.isFinite(
                            coordinate[1]
                        )
                    );
                }
            );

    if (
        coordinates.length ===
        1
    ) {

        routeMap.setView(
            coordinates[0],
            10
        );

        return;
    }

    if (
        coordinates.length >
        1
    ) {

        const bounds =
            window.L.latLngBounds(
                coordinates
            );

        routeMap.fitBounds(
            bounds,
            {

                padding:

                    [
                        35,
                        35
                    ],

                maxZoom:
                    11
            }
        );
    }
}


/* ==========================================================
   DATA ACCESS
========================================================== */

function getRoutePoints(
    briefing
) {

    const points =
        briefing?.routePlan?.weatherPoints ||
        briefing?.routePlan?.routePoints ||
        briefing?.routePlan?.points ||
        [];

    return Array.isArray(
        points
    )
        ? points
        : [];
}


function getForecasts(
    briefing
) {

    const forecasts =
        briefing?.weather?.forecasts ||
        briefing?.weather?.points ||
        [];

    return Array.isArray(
        forecasts
    )
        ? forecasts
        : [];
}


/* ==========================================================
   CONDITION COLOURS
========================================================== */

function getConditionColour(
    forecast
) {

    const level =
        forecast.conditionLevel ||
        forecast.condition ||
        getCloudBaseCondition(
            forecast.cloudBaseFeet
        );

    if (
        level ===
        "danger"
    ) {

        return "#e65050";
    }

    if (
        level ===
        "review"
    ) {

        return "#f7a531";
    }

    return "#26c281";
}


function getCloudBaseCondition(
    cloudBaseFeet
) {

    if (
        !Number.isFinite(
            cloudBaseFeet
        )
    ) {

        return "review";
    }

    if (
        cloudBaseFeet <
        1000
    ) {

        return "danger";
    }

    if (
        cloudBaseFeet <
        3000
    ) {

        return "review";
    }

    return "good";
}


/* ==========================================================
   DISPLAY HELPERS
========================================================== */

function getCloudBaseMarkerLabel(
    cloudBaseFeet
) {

    if (
        !Number.isFinite(
            cloudBaseFeet
        )
    ) {

        return "?";
    }

    if (
        cloudBaseFeet >=
        10000
    ) {

        return "100+";
    }

    return String(
        Math.max(
            0,
            Math.round(
                cloudBaseFeet /
                100
            )
        )
    );
}


function formatCloudBase(
    value
) {

    if (
        !Number.isFinite(
            value
        )
    ) {

        return "Unavailable";
    }

    const rounded =
        Math.round(
            value /
            100
        ) *
        100;

    if (
        rounded >=
        10000
    ) {

        return "10,000 ft+";
    }

    return (
        `${rounded.toLocaleString("en-NZ")} ft`
    );
}


function formatVisibility(
    value
) {

    if (
        !Number.isFinite(
            value
        )
    ) {

        return "Unavailable";
    }

    if (
        value >=
        20
    ) {

        return "20 km+";
    }

    return `${value.toFixed(1)} km`;
}


function formatTime(
    value
) {

    const date =
        new Date(
            value
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "—";
    }

    return new Intl.DateTimeFormat(
        "en-NZ",
        {

            hour:
                "2-digit",

            minute:
                "2-digit",

            hour12:
                false,

            timeZone:
                "Pacific/Auckland"

        }
    ).format(
        date
    );
}


/* ==========================================================
   HTML SAFETY
========================================================== */

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}
