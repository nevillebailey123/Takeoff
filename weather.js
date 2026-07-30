"use strict";

/*
    TAKEOFF
    New Zealand VFR Weather Briefing

    weather.js
    Retrieves general forecast data from Open-Meteo
    for points along the planned route.

    This is not an official aviation weather briefing.
*/


/* ==========================================================
   SETTINGS
========================================================== */

const FORECAST_API =
    "https://api.open-meteo.com/v1/forecast";

const MAX_POINTS_PER_REQUEST =
    20;


/* ==========================================================
   FETCH ROUTE WEATHER
========================================================== */

export async function fetchRouteWeather(routePlan) {

    const routePoints =
        getWeatherPoints(routePlan);

    if (routePoints.length === 0) {

        throw new Error(
            "No route points were available for weather."
        );
    }

    const forecasts = [];

    for (
        let startIndex = 0;
        startIndex < routePoints.length;
        startIndex += MAX_POINTS_PER_REQUEST
    ) {

        const batch =
            routePoints.slice(
                startIndex,
                startIndex + MAX_POINTS_PER_REQUEST
            );

        const batchForecasts =
            await fetchWeatherBatch(
                batch
            );

        forecasts.push(
            ...batchForecasts
        );
    }

    const assessment =
        buildOverallAssessment(
            forecasts
        );

    return {

        source:
            "Open-Meteo numerical forecast",

        generatedAt:
            new Date().toISOString(),

        forecasts,

        points:
            forecasts,

        assessment,

        summary:
            buildWeatherSummary(
                forecasts
            ),

        firstConcern:
            findFirstConcern(
                forecasts
            ),

        changes:
            buildRouteChanges(
                forecasts
            )
    };
}


/* ==========================================================
   ROUTE POINTS
========================================================== */

function getWeatherPoints(routePlan) {

    const possiblePoints = [

        routePlan?.weatherPoints,
        routePlan?.routePoints,
        routePlan?.points

    ];

    const sourcePoints =
        possiblePoints.find(
            Array.isArray
        ) || [];

    return sourcePoints
        .map(
            (point, index) => {

                const latitude =
                    Number(
                        point.latitude ??
                        point.lat
                    );

                const longitude =
                    Number(
                        point.longitude ??
                        point.lon ??
                        point.lng
                    );

                if (
                    !Number.isFinite(latitude) ||
                    !Number.isFinite(longitude)
                ) {

                    return null;
                }

                return {

                    ...point,

                    latitude,
                    longitude,

                    label:
                        point.label ||
                        point.code ||
                        point.name ||
                        `Route point ${index + 1}`,

                    eta:
                        getPointEta(
                            point,
                            routePlan,
                            index,
                            sourcePoints.length
                        ),

                    isRoutePoint:
                        point.isRoutePoint ??
                        Boolean(
                            point.code ||
                            point.name
                        )
                };
            }
        )
        .filter(Boolean);
}


function getPointEta(
    point,
    routePlan,
    index,
    pointCount
) {

    const directEta =
        point.etaDate ||
        point.eta ||
        point.arrivalDate ||
        point.arrivalTime ||
        point.time;

    if (directEta) {

        const date =
            new Date(
                directEta
            );

        if (
            !Number.isNaN(
                date.getTime()
            )
        ) {

            return date;
        }
    }

    const departure =
        new Date(
            routePlan?.departureDate ||
            routePlan?.departureTime
        );

    if (
        Number.isNaN(
            departure.getTime()
        )
    ) {

        return new Date();
    }

    const totalMinutes =
        Number(
            routePlan?.totalDurationMinutes ||
            routePlan?.durationMinutes ||
            0
        );

    if (
        pointCount <= 1 ||
        !Number.isFinite(totalMinutes)
    ) {

        return departure;
    }

    const fraction =
        index /
        (pointCount - 1);

    return new Date(
        departure.getTime() +
        totalMinutes *
        fraction *
        60_000
    );
}


/* ==========================================================
   OPEN-METEO REQUEST
========================================================== */

async function fetchWeatherBatch(points) {

    const parameters =
        new URLSearchParams();

    parameters.set(
        "latitude",
        points
            .map(
                (point) =>
                    point.latitude
            )
            .join(",")
    );

    parameters.set(
        "longitude",
        points
            .map(
                (point) =>
                    point.longitude
            )
            .join(",")
    );

    parameters.set(
        "hourly",
        [

            "temperature_2m",
            "dew_point_2m",
            "relative_humidity_2m",
            "precipitation",
            "rain",
            "showers",
            "weather_code",
            "cloud_cover",
            "cloud_cover_low",
            "cloud_cover_mid",
            "cloud_cover_high",
            "visibility",
            "wind_speed_10m",
            "wind_direction_10m",
            "wind_gusts_10m"

        ].join(",")
    );

    parameters.set(
        "wind_speed_unit",
        "kn"
    );

    parameters.set(
        "timezone",
        "Pacific/Auckland"
    );

    parameters.set(
        "timeformat",
        "unixtime"
    );

    parameters.set(
        "forecast_days",
        "16"
    );

    const response =
        await fetch(
            `${FORECAST_API}?${parameters.toString()}`
        );

    if (!response.ok) {

        throw new Error(
            `Weather request failed with status ${response.status}.`
        );
    }

    const responseData =
        await response.json();

    const locationResults =
        Array.isArray(responseData)
            ? responseData
            : [responseData];

    return points.map(
        (point, index) => {

            const locationData =
                locationResults[index] ||
                locationResults[0];

            return buildPointForecast(
                point,
                locationData
            );
        }
    );
}


/* ==========================================================
   BUILD POINT FORECAST
========================================================== */

function buildPointForecast(
    point,
    locationData
) {

    const hourly =
        locationData?.hourly;

    if (
        !hourly ||
        !Array.isArray(hourly.time) ||
        hourly.time.length === 0
    ) {

        throw new Error(
            "Weather data was unavailable for part of the route."
        );
    }

    const eta =
        point.eta instanceof Date
            ? point.eta
            : new Date(point.eta);

    const forecastIndex =
        findNearestForecastIndex(
            hourly.time,
            eta
        );

    if (forecastIndex < 0) {

        throw new Error(
            "The selected departure time is outside the forecast range."
        );
    }

    const temperature =
        readHourlyValue(
            hourly.temperature_2m,
            forecastIndex
        );

    const dewPoint =
        readHourlyValue(
            hourly.dew_point_2m,
            forecastIndex
        );

    const humidity =
        readHourlyValue(
            hourly.relative_humidity_2m,
            forecastIndex
        );

    const visibilityMetres =
        readHourlyValue(
            hourly.visibility,
            forecastIndex
        );

    const visibilityKm =
        Number.isFinite(
            visibilityMetres
        )
            ? visibilityMetres / 1000
            : null;

    const windSpeed =
        readHourlyValue(
            hourly.wind_speed_10m,
            forecastIndex
        );

    const windDirection =
        readHourlyValue(
            hourly.wind_direction_10m,
            forecastIndex
        );

    const windGust =
        readHourlyValue(
            hourly.wind_gusts_10m,
            forecastIndex
        );

    const precipitation =
        readHourlyValue(
            hourly.precipitation,
            forecastIndex
        );

    const rain =
        readHourlyValue(
            hourly.rain,
            forecastIndex
        );

    const showers =
        readHourlyValue(
            hourly.showers,
            forecastIndex
        );

    const weatherCode =
        readHourlyValue(
            hourly.weather_code,
            forecastIndex
        );

    const cloudCover =
        readHourlyValue(
            hourly.cloud_cover,
            forecastIndex
        );

    const lowCloud =
        readHourlyValue(
            hourly.cloud_cover_low,
            forecastIndex
        );

    const midCloud =
        readHourlyValue(
            hourly.cloud_cover_mid,
            forecastIndex
        );

    const highCloud =
        readHourlyValue(
            hourly.cloud_cover_high,
            forecastIndex
        );

    const cloudBaseFeet =
        estimateCloudBaseFeet(
            temperature,
            dewPoint,
            humidity,
            lowCloud
        );

    const forecast = {

        label:
            point.label,

        code:
            point.code || "",

        name:
            point.name || "",

        latitude:
            point.latitude,

        longitude:
            point.longitude,

        eta,
        etaDate:
            eta,

        isRoutePoint:
            point.isRoutePoint,

        temperatureC:
            temperature,

        dewPointC:
            dewPoint,

        relativeHumidity:
            humidity,

        visibilityKm,

        windSpeedKt:
            windSpeed,

        windDirectionDegrees:
            windDirection,

        windGustKt:
            windGust,

        precipitationMm:
            precipitation,

        rainMm:
            rain,

        showersMm:
            showers,

        weatherCode,

        weatherDescription:
            describeWeatherCode(
                weatherCode
            ),

        cloudCoverPercent:
            cloudCover,

        lowCloudPercent:
            lowCloud,

        midCloudPercent:
            midCloud,

        highCloudPercent:
            highCloud,

        cloudBaseFeet
    };

    const condition =
        assessPointCondition(
            forecast
        );

    forecast.conditionLevel =
        condition.level;

    forecast.condition =
        condition.level;

    forecast.primaryConcern =
        condition.concern;

    forecast.display =
        buildDisplayValues(
            forecast
        );

    return forecast;
}


/* ==========================================================
   FORECAST TIME MATCHING
========================================================== */

function findNearestForecastIndex(
    times,
    eta
) {

    const etaMilliseconds =
        eta.getTime();

    if (
        !Number.isFinite(
            etaMilliseconds
        )
    ) {

        return -1;
    }

    let nearestIndex = -1;

    let smallestDifference =
        Number.POSITIVE_INFINITY;

    times.forEach(
        (unixTime, index) => {

            const forecastMilliseconds =
                Number(unixTime) *
                1000;

            const difference =
                Math.abs(
                    forecastMilliseconds -
                    etaMilliseconds
                );

            if (
                difference <
                smallestDifference
            ) {

                smallestDifference =
                    difference;

                nearestIndex =
                    index;
            }
        }
    );

    /*
        Refuse a result if the selected time is more
        than two hours beyond the available forecast.
    */

    if (
        smallestDifference >
        2 *
        60 *
        60 *
        1000
    ) {

        return -1;
    }

    return nearestIndex;
}


/* ==========================================================
   CLOUD-BASE ESTIMATE
========================================================== */

function estimateCloudBaseFeet(
    temperature,
    dewPoint,
    humidity,
    lowCloud
) {

    if (
        Number.isFinite(temperature) &&
        Number.isFinite(dewPoint)
    ) {

        const spread =
            Math.max(
                0,
                temperature - dewPoint
            );

        /*
            Approximate lifted condensation level:
            temperature/dew-point spread × 400 ft.
        */

        let estimatedBase =
            spread *
            400;

        if (
            Number.isFinite(lowCloud) &&
            lowCloud < 15 &&
            estimatedBase < 2500
        ) {

            estimatedBase =
                2500;
        }

        return Math.round(
            estimatedBase /
            100
        ) * 100;
    }

    if (
        Number.isFinite(humidity)
    ) {

        if (humidity >= 97) {

            return 300;
        }

        if (humidity >= 92) {

            return 800;
        }

        if (humidity >= 85) {

            return 1600;
        }

        if (humidity >= 75) {

            return 3000;
        }
    }

    return null;
}


/* ==========================================================
   POINT ASSESSMENT
========================================================== */

function assessPointCondition(
    forecast
) {

    const concerns = [];

    let level =
        "good";

    function addConcern(
        concernLevel,
        description
    ) {

        concerns.push({

            level:
                concernLevel,

            description
        });

        if (
            concernLevel === "danger"
        ) {

            level =
                "danger";
        } else if (
            concernLevel === "review" &&
            level !== "danger"
        ) {

            level =
                "review";
        }
    }

    if (
        Number.isFinite(
            forecast.cloudBaseFeet
        )
    ) {

        if (
            forecast.cloudBaseFeet <
            1000
        ) {

            addConcern(
                "danger",
                `Estimated cloud base ${formatCloudBase(
                    forecast.cloudBaseFeet
                )}.`
            );

        } else if (
            forecast.cloudBaseFeet <
            3000
        ) {

            addConcern(
                "review",
                `Estimated cloud base ${formatCloudBase(
                    forecast.cloudBaseFeet
                )}.`
            );
        }
    }

    if (
        Number.isFinite(
            forecast.visibilityKm
        )
    ) {

        if (
            forecast.visibilityKm <
            5
        ) {

            addConcern(
                "danger",
                `Visibility around ${formatVisibility(
                    forecast.visibilityKm
                )}.`
            );

        } else if (
            forecast.visibilityKm <
            10
        ) {

            addConcern(
                "review",
                `Visibility around ${formatVisibility(
                    forecast.visibilityKm
                )}.`
            );
        }
    }

    if (
        Number.isFinite(
            forecast.windGustKt
        )
    ) {

        if (
            forecast.windGustKt >=
            35
        ) {

            addConcern(
                "danger",
                `Gusts near ${Math.round(
                    forecast.windGustKt
                )} kt.`
            );

        } else if (
            forecast.windGustKt >=
            25
        ) {

            addConcern(
                "review",
                `Gusts near ${Math.round(
                    forecast.windGustKt
                )} kt.`
            );
        }
    }

    if (
        isThunderstormCode(
            forecast.weatherCode
        )
    ) {

        addConcern(
            "danger",
            "Thunderstorm conditions are indicated."
        );

    } else if (
        isFogCode(
            forecast.weatherCode
        )
    ) {

        addConcern(
            "danger",
            "Fog or depositing fog is indicated."
        );

    } else if (
        isHeavyPrecipitationCode(
            forecast.weatherCode
        )
    ) {

        addConcern(
            "review",
            "Heavy precipitation is indicated."
        );

    } else if (
        Number(forecast.precipitationMm) >=
        1
    ) {

        addConcern(
            "review",
            "Precipitation is forecast."
        );
    }

    if (
        concerns.length === 0
    ) {

        return {

            level:
                "good",

            concern:
                "No significant concern identified from this general forecast."
        };
    }

    const mostImportant =
        concerns.find(
            (item) =>
                item.level === "danger"
        ) ||
        concerns[0];

    return {

        level,

        concern:
            mostImportant.description
    };
}


/* ==========================================================
   OVERALL ASSESSMENT
========================================================== */

function buildOverallAssessment(
    forecasts
) {

    const dangerCount =
        forecasts.filter(
            (forecast) =>
                forecast.conditionLevel ===
                "danger"
        ).length;

    const reviewCount =
        forecasts.filter(
            (forecast) =>
                forecast.conditionLevel ===
                "review"
        ).length;

    if (
        dangerCount > 0
    ) {

        return {

            level:
                "danger",

            title:
                "Significant weather concerns",

            summary:
                `${dangerCount} route forecast ${
                    dangerCount === 1
                        ? "point requires"
                        : "points require"
                } particular caution. Review official aviation weather before making a flight decision.`
        };
    }

    if (
        reviewCount > 0
    ) {

        return {

            level:
                "review",

            title:
                "Conditions need review",

            summary:
                `${reviewCount} route forecast ${
                    reviewCount === 1
                        ? "point shows"
                        : "points show"
                } conditions worth closer examination.`
        };
    }

    return {

        level:
            "good",

        title:
            "No major concerns identified",

        summary:
            "The sampled general forecast does not show a major weather concern, but official aviation products and local conditions still require review."
    };
}


/* ==========================================================
   WEATHER SUMMARY
========================================================== */

function buildWeatherSummary(
    forecasts
) {

    const lowestCloud =
        findExtremeForecast(
            forecasts,
            "cloudBaseFeet",
            "lowest"
        );

    const lowestVisibility =
        findExtremeForecast(
            forecasts,
            "visibilityKm",
            "lowest"
        );

    const strongestWind =
        findStrongestWind(
            forecasts
        );

    const wettestPoint =
        findExtremeForecast(
            forecasts,
            "precipitationMm",
            "highest"
        );

    return {

        lowestCloudBase: {

            display:
                lowestCloud
                    ? formatCloudBase(
                        lowestCloud.cloudBaseFeet
                    )
                    : "Unavailable",

            location:
                lowestCloud?.label || ""
        },

        lowestVisibility: {

            display:
                lowestVisibility
                    ? formatVisibility(
                        lowestVisibility.visibilityKm
                    )
                    : "Unavailable",

            location:
                lowestVisibility?.label || ""
        },

        highestWind: {

            display:
                strongestWind
                    ? formatWind(
                        strongestWind
                    )
                    : "Unavailable",

            location:
                strongestWind?.label || ""
        },

        rain: {

            display:
                wettestPoint &&
                Number(
                    wettestPoint.precipitationMm
                ) > 0
                    ? `${Number(
                        wettestPoint.precipitationMm
                    ).toFixed(1)} mm`
                    : "None indicated",

            location:
                wettestPoint &&
                Number(
                    wettestPoint.precipitationMm
                ) > 0
                    ? wettestPoint.label
                    : ""
        }
    };
}


function findExtremeForecast(
    forecasts,
    property,
    direction
) {

    const validForecasts =
        forecasts.filter(
            (forecast) =>
                Number.isFinite(
                    Number(
                        forecast[property]
                    )
                )
        );

    if (
        validForecasts.length === 0
    ) {

        return null;
    }

    return validForecasts.reduce(
        (selected, forecast) => {

            const selectedValue =
                Number(
                    selected[property]
                );

            const forecastValue =
                Number(
                    forecast[property]
                );

            if (
                direction === "lowest"
            ) {

                return forecastValue <
                    selectedValue
                    ? forecast
                    : selected;
            }

            return forecastValue >
                selectedValue
                ? forecast
                : selected;
        }
    );
}


function findStrongestWind(
    forecasts
) {

    const validForecasts =
        forecasts.filter(
            (forecast) =>
                Number.isFinite(
                    Number(
                        forecast.windSpeedKt
                    )
                )
        );

    if (
        validForecasts.length === 0
    ) {

        return null;
    }

    return validForecasts.reduce(
        (selected, forecast) => {

            const selectedSpeed =
                Math.max(
                    Number(
                        selected.windSpeedKt
                    ) || 0,
                    Number(
                        selected.windGustKt
                    ) || 0
                );

            const forecastSpeed =
                Math.max(
                    Number(
                        forecast.windSpeedKt
                    ) || 0,
                    Number(
                        forecast.windGustKt
                    ) || 0
                );

            return forecastSpeed >
                selectedSpeed
                ? forecast
                : selected;
        }
    );
}


/* ==========================================================
   FIRST CONCERN
========================================================== */

function findFirstConcern(
    forecasts
) {

    return forecasts.find(
        (forecast) =>
            forecast.conditionLevel ===
            "danger"
    ) ||
    forecasts.find(
        (forecast) =>
            forecast.conditionLevel ===
            "review"
    ) ||
    forecasts[0] ||
    null;
}


/* ==========================================================
   ROUTE CHANGES
========================================================== */

function buildRouteChanges(
    forecasts
) {

    const changes = [];

    for (
        let index = 1;
        index < forecasts.length;
        index += 1
    ) {

        const previous =
            forecasts[index - 1];

        const current =
            forecasts[index];

        if (
            current.conditionLevel !==
            previous.conditionLevel
        ) {

            changes.push({

                level:
                    current.conditionLevel,

                location:
                    current.label,

                title:
                    `${capitalise(
                        current.conditionLevel
                    )} conditions near ${current.label}`,

                description:
                    current.primaryConcern,

                eta:
                    current.eta,

                etaDisplay:
                    current.display?.eta
            });

            continue;
        }

        const cloudDrop =
            Number(
                previous.cloudBaseFeet
            ) -
            Number(
                current.cloudBaseFeet
            );

        if (
            Number.isFinite(cloudDrop) &&
            cloudDrop >= 1500
        ) {

            changes.push({

                level:
                    current.conditionLevel ===
                    "good"
                        ? "review"
                        : current.conditionLevel,

                location:
                    current.label,

                title:
                    `Cloud base lowers near ${current.label}`,

                description:
                    `Estimated cloud base falls to ${formatCloudBase(
                        current.cloudBaseFeet
                    )}.`,

                eta:
                    current.eta,

                etaDisplay:
                    current.display?.eta
            });
        }
    }

    return changes.slice(
        0,
        6
    );
}


/* ==========================================================
   DISPLAY VALUES
========================================================== */

function buildDisplayValues(
    forecast
) {

    return {

        eta:
            formatTime(
                forecast.eta
            ),

        weather:
            forecast.weatherDescription,

        cloudBase:
            formatCloudBase(
                forecast.cloudBaseFeet
            ),

        visibility:
            formatVisibility(
                forecast.visibilityKm
            ),

        wind:
            formatWind(
                forecast
            ),

        temperature:
            Number.isFinite(
                forecast.temperatureC
            )
                ? `${Math.round(
                    forecast.temperatureC
                )}°C`
                : "Unavailable"
    };
}


/* ==========================================================
   WEATHER CODES
========================================================== */

function describeWeatherCode(
    code
) {

    const descriptions = {

        0:
            "Clear",

        1:
            "Mainly clear",

        2:
            "Partly cloudy",

        3:
            "Overcast",

        45:
            "Fog",

        48:
            "Depositing fog",

        51:
            "Light drizzle",

        53:
            "Drizzle",

        55:
            "Heavy drizzle",

        56:
            "Freezing drizzle",

        57:
            "Heavy freezing drizzle",

        61:
            "Light rain",

        63:
            "Rain",

        65:
            "Heavy rain",

        66:
            "Freezing rain",

        67:
            "Heavy freezing rain",

        71:
            "Light snow",

        73:
            "Snow",

        75:
            "Heavy snow",

        77:
            "Snow grains",

        80:
            "Light showers",

        81:
            "Showers",

        82:
            "Heavy showers",

        85:
            "Snow showers",

        86:
            "Heavy snow showers",

        95:
            "Thunderstorm",

        96:
            "Thunderstorm with hail",

        99:
            "Severe thunderstorm with hail"
    };

    return descriptions[
        Number(code)
    ] || "Forecast weather";
}


function isThunderstormCode(
    code
) {

    return [
        95,
        96,
        99
    ].includes(
        Number(code)
    );
}


function isFogCode(
    code
) {

    return [
        45,
        48
    ].includes(
        Number(code)
    );
}


function isHeavyPrecipitationCode(
    code
) {

    return [
        55,
        57,
        65,
        67,
        75,
        82,
        86
    ].includes(
        Number(code)
    );
}


/* ==========================================================
   FORMATTING
========================================================== */

function formatCloudBase(
    value
) {

    const cloudBase =
        Number(value);

    if (
        !Number.isFinite(
            cloudBase
        )
    ) {

        return "Unavailable";
    }

    const rounded =
        Math.max(
            0,
            Math.round(
                cloudBase /
                100
            ) *
            100
        );

    if (
        rounded >= 10000
    ) {

        return "10,000 ft+";
    }

    return `${rounded.toLocaleString(
        "en-NZ"
    )} ft`;
}


function formatVisibility(
    value
) {

    const visibility =
        Number(value);

    if (
        !Number.isFinite(
            visibility
        )
    ) {

        return "Unavailable";
    }

    if (
        visibility >= 20
    ) {

        return "20 km+";
    }

    return `${visibility.toFixed(1)} km`;
}


function formatWind(
    forecast
) {

    const speed =
        Number(
            forecast.windSpeedKt
        );

    const direction =
        Number(
            forecast.windDirectionDegrees
        );

    const gust =
        Number(
            forecast.windGustKt
        );

    if (
        !Number.isFinite(speed)
    ) {

        return "Unavailable";
    }

    const directionText =
        Number.isFinite(direction)
            ? `${String(
                Math.round(direction)
            ).padStart(3, "0")}°`
            : "Variable";

    let result =
        `${directionText} ${Math.round(
            speed
        )} kt`;

    if (
        Number.isFinite(gust) &&
        gust >
        speed + 2
    ) {

        result +=
            ` gusting ${Math.round(
                gust
            )} kt`;
    }

    return result;
}


function formatTime(
    value
) {

    const date =
        new Date(value);

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
    ).format(date);
}


/* ==========================================================
   GENERAL HELPERS
========================================================== */

function readHourlyValue(
    values,
    index
) {

    if (
        !Array.isArray(values)
    ) {

        return null;
    }

    const value =
        Number(
            values[index]
        );

    return Number.isFinite(value)
        ? value
        : null;
}


function capitalise(
    value
) {

    const text =
        String(value || "");

    return (
        text.charAt(0).toUpperCase() +
        text.slice(1)
    );
}
