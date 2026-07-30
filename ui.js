"use strict";

/*
    TAKEOFF
    New Zealand VFR Weather Briefing

    ui.js
    Controls the entry screen, loading overlay,
    messages and rendered weather briefing.
*/


/* ==========================================================
   ELEMENTS
========================================================== */

const entryPanel =
    document.getElementById("flightEntryPanel");

const briefingPanel =
    document.getElementById("briefingPanel");

const loadingOverlay =
    document.getElementById("loadingOverlay");

const loadingMessage =
    document.getElementById("loadingMessage");

const formMessage =
    document.getElementById("formMessage");


/* ==========================================================
   SCREEN CONTROL
========================================================== */

export function showEntryScreen() {

    if (entryPanel) {

        entryPanel.hidden = false;
    }

    if (briefingPanel) {

        briefingPanel.hidden = true;
    }
}


export function showBriefingScreen() {

    if (entryPanel) {

        entryPanel.hidden = true;
    }

    if (briefingPanel) {

        briefingPanel.hidden = false;
    }
}


/* ==========================================================
   LOADING OVERLAY
========================================================== */

export function showLoading(message) {

    if (loadingMessage) {

        loadingMessage.textContent =
            message ||
            "Preparing your briefing…";
    }

    if (loadingOverlay) {

        loadingOverlay.hidden = false;

        loadingOverlay.setAttribute(
            "aria-hidden",
            "false"
        );
    }

    document.body.classList.add(
        "is-loading"
    );
}


export function hideLoading() {

    if (loadingOverlay) {

        loadingOverlay.hidden = true;

        loadingOverlay.setAttribute(
            "aria-hidden",
            "true"
        );
    }

    document.body.classList.remove(
        "is-loading"
    );
}


/* ==========================================================
   FORM MESSAGES
========================================================== */

export function showFormMessage(
    message,
    type = "error"
) {

    if (!formMessage) {

        return;
    }

    formMessage.textContent =
        message || "";

    formMessage.hidden = false;

    formMessage.className =
        `form-message form-message-${type}`;

    formMessage.setAttribute(
        "role",
        type === "error"
            ? "alert"
            : "status"
    );
}


export function clearFormMessage() {

    if (!formMessage) {

        return;
    }

    formMessage.textContent = "";

    formMessage.hidden = true;

    formMessage.className =
        "form-message";
}


/* ==========================================================
   RENDER BRIEFING
========================================================== */

export function renderBriefing(
    briefing
) {

    if (
        !briefingPanel ||
        !briefing
    ) {

        return;
    }

    const routePlan =
        briefing.routePlan;

    const weather =
        briefing.weather;

    briefingPanel.innerHTML = `

        ${renderBriefingToolbar()}

        ${renderRouteHeader(routePlan)}

        ${renderAssessment(weather)}

        ${renderSummaryCards(weather)}

        ${renderFirstConcern(weather)}

        ${renderRouteMapPanel()}

        ${renderRouteLegs(routePlan)}

        ${renderWeatherTable(weather)}

        ${renderRouteChanges(weather)}

        ${renderDisclaimer(weather)}

    `;
}


/* ==========================================================
   TOOLBAR
========================================================== */

function renderBriefingToolbar() {

    return `

        <div class="briefing-toolbar">

            <button
                id="editFlightButton"
                class="secondary-button"
                type="button"
            >
                <span class="button-icon">
                    ←
                </span>

                Edit flight
            </button>

            <button
                id="refreshBriefingButton"
                class="secondary-button"
                type="button"
            >
                <span class="button-icon">
                    ↻
                </span>

                Refresh
            </button>

        </div>
    `;
}


/* ==========================================================
   ROUTE HEADER
========================================================== */

function renderRouteHeader(
    routePlan
) {

    const routePoints =
        Array.isArray(
            routePlan?.routePoints
        )
            ? routePlan.routePoints
            : [];

    const routeNames =
        routePoints
            .map(
                (point) => {

                    return (
                        point.code ||
                        point.name ||
                        point.label ||
                        "Route point"
                    );
                }
            )
            .join(" → ");

    const departureTime =
        formatDateTime(
            routePlan?.departureDate ||
            routePlan?.departureTime
        );

    const arrivalTime =
        formatDateTime(
            routePlan?.arrivalDate ||
            routePlan?.arrivalTime
        );

    const duration =
        formatDuration(
            routePlan?.totalDurationMinutes
        );

    const distance =
        formatDistance(
            routePlan?.totalDistanceNm
        );

    return `

        <section class="panel briefing-route-header">

            <div class="briefing-heading-row">

                <div>

                    <div class="eyebrow">
                        ROUTE WEATHER BRIEFING
                    </div>

                    <h2>
                        ${escapeHtml(routeNames)}
                    </h2>

                </div>

                <div class="eta-pill">

                    <span>
                        ETA
                    </span>

                    <strong>
                        ${escapeHtml(
                            formatTime(
                                routePlan?.arrivalDate ||
                                routePlan?.arrivalTime
                            )
                        )}
                    </strong>

                </div>

            </div>

            <div class="route-summary-grid">

                ${renderRouteSummaryItem(
                    "Departure",
                    departureTime
                )}

                ${renderRouteSummaryItem(
                    "Arrival",
                    arrivalTime
                )}

                ${renderRouteSummaryItem(
                    "Distance",
                    distance
                )}

                ${renderRouteSummaryItem(
                    "Flight time",
                    duration
                )}

                ${renderRouteSummaryItem(
                    "Cruise speed",
                    `${Math.round(
                        Number(
                            routePlan?.cruiseSpeed ||
                            0
                        )
                    )} kt`
                )}

            </div>

        </section>
    `;
}


function renderRouteSummaryItem(
    label,
    value
) {

    return `

        <div class="route-summary-item">

            <span>
                ${escapeHtml(label)}
            </span>

            <strong>
                ${escapeHtml(value)}
            </strong>

        </div>
    `;
}


/* ==========================================================
   OVERALL ASSESSMENT
========================================================== */

function renderAssessment(
    weather
) {

    const assessment =
        weather?.assessment || {};

    const level =
        normaliseLevel(
            assessment.level
        );

    const icon =
        level === "good"
            ? "✓"
            : level === "danger"
                ? "!"
                : "●";

    return `

        <section
            class="panel assessment-panel assessment-${level}"
        >

            <div class="assessment-icon">
                ${escapeHtml(icon)}
            </div>

            <div>

                <div class="eyebrow">
                    ROUTE ASSESSMENT
                </div>

                <h2>
                    ${escapeHtml(
                        assessment.title ||
                        "Review forecast"
                    )}
                </h2>

                <p>
                    ${escapeHtml(
                        assessment.summary ||
                        "Review the route forecast carefully."
                    )}
                </p>

            </div>

        </section>
    `;
}


/* ==========================================================
   SUMMARY CARDS
========================================================== */

function renderSummaryCards(
    weather
) {

    const summary =
        weather?.summary || {};

    return `

        <section class="briefing-summary-grid">

            ${renderSummaryCard({

                icon:
                    "☁",

                label:
                    "Lowest cloud base",

                value:
                    summary.lowestCloudBase?.display ||
                    "Unavailable",

                location:
                    summary.lowestCloudBase?.location ||
                    ""

            })}

            ${renderSummaryCard({

                icon:
                    "➤",

                label:
                    "Strongest wind",

                value:
                    summary.highestWind?.display ||
                    "Unavailable",

                location:
                    summary.highestWind?.location ||
                    ""

            })}

            ${renderSummaryCard({

                icon:
                    "◉",

                label:
                    "Lowest visibility",

                value:
                    summary.lowestVisibility?.display ||
                    "Unavailable",

                location:
                    summary.lowestVisibility?.location ||
                    ""

            })}

            ${renderSummaryCard({

                icon:
                    "☂",

                label:
                    "Precipitation",

                value:
                    summary.rain?.display ||
                    "None",

                location:
                    summary.rain?.location ||
                    ""

            })}

        </section>
    `;
}


function renderSummaryCard(options) {

    const {
        icon,
        label,
        value,
        location
    } = options;

    return `

        <article class="summary-card">

            <div class="summary-card-icon">
                ${escapeHtml(icon)}
            </div>

            <div class="summary-card-content">

                <span>
                    ${escapeHtml(label)}
                </span>

                <strong>
                    ${escapeHtml(value)}
                </strong>

                ${
                    location
                        ? `
                            <small>
                                ${escapeHtml(location)}
                            </small>
                        `
                        : ""
                }

            </div>

        </article>
    `;
}


/* ==========================================================
   FIRST CONCERN
========================================================== */

function renderFirstConcern(
    weather
) {

    const concern =
        weather?.firstConcern;

    if (!concern) {

        return "";
    }

    const hasConcern =
        concern.conditionLevel !==
        "good";

    const title =
        hasConcern
            ? "First weather concern"
            : "First route sample";

    const description =
        concern.primaryConcern ||
        (
            hasConcern
                ? "Review this forecast point carefully."
                : "No significant concern was identified at this point."
        );

    return `

        <section
            class="panel first-concern-panel condition-${normaliseLevel(
                concern.conditionLevel
            )}"
        >

            <div>

                <div class="eyebrow">
                    ${escapeHtml(
                        title.toUpperCase()
                    )}
                </div>

                <h2>
                    ${escapeHtml(
                        concern.label ||
                        "Route point"
                    )}
                </h2>

                <p>
                    ETA
                    ${escapeHtml(
                        concern.display?.eta ||
                        formatTime(
                            concern.etaDate ||
                            concern.eta
                        )
                    )}
                    ·
                    ${escapeHtml(description)}
                </p>

            </div>

            <div class="concern-weather">

                <strong>
                    ${escapeHtml(
                        concern.display?.weather ||
                        concern.weatherDescription ||
                        "Forecast"
                    )}
                </strong>

                <span>
                    ${escapeHtml(
                        concern.display?.cloudBase ||
                        "Cloud unavailable"
                    )}
                </span>

            </div>

        </section>
    `;
}


/* ==========================================================
   MAP PANEL
========================================================== */

function renderRouteMapPanel() {

    return `

        <section class="panel map-panel">

            <div class="section-heading">

                <div>

                    <div class="eyebrow">
                        ROUTE OVERVIEW
                    </div>

                    <h2>
                        Forecast map
                    </h2>

                </div>

                <span class="label-note">
                    Marker numbers show cloud base
                    in hundreds of feet
                </span>

            </div>

            <div
                id="routeMap"
                class="route-map"
                aria-label="Flight route map"
            ></div>

        </section>
    `;
}


/* ==========================================================
   ROUTE LEGS
========================================================== */

function renderRouteLegs(
    routePlan
) {

    const legs =
        Array.isArray(
            routePlan?.legs
        )
            ? routePlan.legs
            : [];

    if (
        legs.length ===
        0
    ) {

        return "";
    }

    return `

        <section class="panel">

            <div class="section-heading">

                <div>

                    <div class="eyebrow">
                        FLIGHT PLAN
                    </div>

                    <h2>
                        Route legs
                    </h2>

                </div>

            </div>

            <div class="route-leg-list">

                ${legs
                    .map(
                        renderRouteLeg
                    )
                    .join("")}

            </div>

        </section>
    `;
}


function renderRouteLeg(
    leg
) {

    const start =
        leg.startPoint?.code ||
        leg.startPoint?.name ||
        "Start";

    const end =
        leg.endPoint?.code ||
        leg.endPoint?.name ||
        "End";

    return `

        <article class="route-leg">

            <div class="route-leg-number">
                ${Number(leg.number)}
            </div>

            <div class="route-leg-route">

                <strong>
                    ${escapeHtml(start)}
                    →
                    ${escapeHtml(end)}
                </strong>

                <span>
                    ${escapeHtml(
                        leg.startPoint?.name || ""
                    )}
                    to
                    ${escapeHtml(
                        leg.endPoint?.name || ""
                    )}
                </span>

            </div>

            <div class="route-leg-detail">

                <strong>
                    ${escapeHtml(
                        formatDistance(
                            leg.distanceNm
                        )
                    )}
                </strong>

                <span>
                    ${escapeHtml(
                        formatDuration(
                            leg.durationMinutes
                        )
                    )}
                </span>

            </div>

            <div class="route-leg-detail">

                <strong>
                    ${String(
                        Math.round(
                            Number(
                                leg.bearingDegrees ||
                                0
                            )
                        )
                    ).padStart(3, "0")}°
                </strong>

                <span>
                    Track
                </span>

            </div>

            <div class="route-leg-detail">

                <strong>
                    ${escapeHtml(
                        formatTime(
                            leg.arrivalDate ||
                            leg.arrivalTime
                        )
                    )}
                </strong>

                <span>
                    ETA
                </span>

            </div>

        </article>
    `;
}


/* ==========================================================
   WEATHER TABLE
========================================================== */

function renderWeatherTable(
    weather
) {

    const forecasts =
        Array.isArray(
            weather?.forecasts
        )
            ? weather.forecasts
            : [];

    if (
        forecasts.length ===
        0
    ) {

        return `

            <section class="panel">

                <h2>
                    Route forecast
                </h2>

                <p class="empty-message">
                    No forecast points are available.
                </p>

            </section>
        `;
    }

    return `

        <section class="panel">

            <div class="section-heading">

                <div>

                    <div class="eyebrow">
                        WEATHER BY ETA
                    </div>

                    <h2>
                        Route forecast
                    </h2>

                </div>

                <span class="label-note">
                    Times shown in New Zealand time
                </span>

            </div>

            <div class="weather-table-wrapper">

                <table class="weather-table">

                    <thead>

                        <tr>

                            <th>
                                Location
                            </th>

                            <th>
                                ETA
                            </th>

                            <th>
                                Weather
                            </th>

                            <th>
                                Cloud base
                            </th>

                            <th>
                                Visibility
                            </th>

                            <th>
                                Wind
                            </th>

                            <th>
                                Temp
                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        ${forecasts
                            .map(
                                renderWeatherRow
                            )
                            .join("")}

                    </tbody>

                </table>

            </div>

        </section>
    `;
}


function renderWeatherRow(
    forecast
) {

    const level =
        normaliseLevel(
            forecast.conditionLevel ||
            forecast.condition
        );

    const concern =
        forecast.primaryConcern ||
        (
            level === "good"
                ? "No significant concern identified."
                : "Review this point carefully."
        );

    return `

        <tr class="weather-row weather-row-${level}">

            <td>

                <div class="weather-location">

                    <span
                        class="condition-dot condition-dot-${level}"
                    ></span>

                    <div>

                        <strong>
                            ${escapeHtml(
                                forecast.label ||
                                "Route point"
                            )}
                        </strong>

                        ${
                            forecast.code
                                ? `
                                    <small>
                                        ${escapeHtml(
                                            forecast.code
                                        )}
                                    </small>
                                `
                                : ""
                        }

                    </div>

                </div>

            </td>

            <td>
                ${escapeHtml(
                    forecast.display?.eta ||
                    formatTime(
                        forecast.etaDate ||
                        forecast.eta
                    )
                )}
            </td>

            <td>

                <strong>
                    ${escapeHtml(
                        forecast.display?.weather ||
                        forecast.weatherDescription ||
                        "Forecast"
                    )}
                </strong>

                <small class="weather-concern">
                    ${escapeHtml(concern)}
                </small>

            </td>

            <td>
                ${escapeHtml(
                    forecast.display?.cloudBase ||
                    "Unavailable"
                )}
            </td>

            <td>
                ${escapeHtml(
                    forecast.display?.visibility ||
                    "Unavailable"
                )}
            </td>

            <td>
                ${escapeHtml(
                    forecast.display?.wind ||
                    "Unavailable"
                )}
            </td>

            <td>
                ${escapeHtml(
                    forecast.display?.temperature ||
                    "Unavailable"
                )}
            </td>

        </tr>
    `;
}


/* ==========================================================
   ROUTE CHANGES
========================================================== */

function renderRouteChanges(
    weather
) {

    const changes =
        Array.isArray(
            weather?.changes
        )
            ? weather.changes
            : [];

    if (
        changes.length ===
        0
    ) {

        return "";
    }

    return `

        <section class="panel">

            <div class="section-heading">

                <div>

                    <div class="eyebrow">
                        ENROUTE CHANGES
                    </div>

                    <h2>
                        Forecast developments
                    </h2>

                </div>

            </div>

            <div class="change-list">

                ${changes
                    .map(
                        renderRouteChange
                    )
                    .join("")}

            </div>

        </section>
    `;
}


function renderRouteChange(
    change
) {

    return `

        <article
            class="route-change route-change-${normaliseLevel(
                change.level
            )}"
        >

            <div class="route-change-time">

                <strong>
                    ${escapeHtml(
                        change.etaDisplay ||
                        formatTime(
                            change.eta
                        )
                    )}
                </strong>

            </div>

            <div>

                <strong>
                    ${escapeHtml(
                        change.title ||
                        change.location ||
                        "Route change"
                    )}
                </strong>

                <p>
                    ${escapeHtml(
                        change.description ||
                        ""
                    )}
                </p>

            </div>

        </article>
    `;
}


/* ==========================================================
   DISCLAIMER
========================================================== */

function renderDisclaimer(
    weather
) {

    const generatedTime =
        formatDateTime(
            weather?.generatedAt
        );

    return `

        <section class="briefing-disclaimer">

            <strong>
                Forecast guidance only
            </strong>

            <p>
                This briefing uses general numerical forecast
                information and estimated cloud base. It is not
                an official aviation weather briefing and does
                not replace MetService aviation products,
                NOTAMs, aerodrome information, webcams, pilot
                reports, or your own preflight assessment.
            </p>

            <small>
                Generated
                ${escapeHtml(generatedTime)}
                · Source:
                ${escapeHtml(
                    weather?.source ||
                    "forecast model"
                )}
            </small>

        </section>
    `;
}


/* ==========================================================
   LEVEL HELPERS
========================================================== */

function normaliseLevel(
    level
) {

    if (
        level === "danger"
    ) {

        return "danger";
    }

    if (
        level === "review"
    ) {

        return "review";
    }

    return "good";
}


/* ==========================================================
   FORMATTERS
========================================================== */

function formatDistance(
    value
) {

    const distance =
        Number(value);

    if (
        !Number.isFinite(
            distance
        )
    ) {

        return "—";
    }

    return (
        `${distance.toFixed(1)} NM`
    );
}


function formatDuration(
    totalMinutes
) {

    const minutes =
        Math.round(
            Number(totalMinutes)
        );

    if (
        !Number.isFinite(
            minutes
        )
    ) {

        return "—";
    }

    const hours =
        Math.floor(
            minutes / 60
        );

    const remainingMinutes =
        minutes % 60;

    if (
        hours === 0
    ) {

        return (
            `${remainingMinutes} min`
        );
    }

    return (
        `${hours} hr ` +
        `${String(
            remainingMinutes
        ).padStart(2, "0")} min`
    );
}


function formatDateTime(
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

            weekday:
                "short",

            day:
                "numeric",

            month:
                "short",

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
