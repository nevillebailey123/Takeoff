"use strict";

/*
    TAKEOFF
    New Zealand VFR Weather Briefing

    route.js
    Builds route legs, distance, ETA and forecast sampling points.
*/


/* ==========================================================
   CONSTANTS
========================================================== */

const EARTH_RADIUS_NM = 3440.065;

const DEFAULT_CRUISE_SPEED = 110;

const SAMPLE_SPACING_NM = 20;


/* ==========================================================
   BUILD ROUTE PLAN
========================================================== */

export function buildRoutePlan(options) {

    const points =
        Array.isArray(options?.points)
            ? options.points
            : [];

    const departureTime =
        options?.departureTime;

    const cruiseSpeed =
        Number(options?.cruiseSpeed);

    validateRouteInputs(
        points,
        departureTime,
        cruiseSpeed
    );

    const departureDate =
        parseDepartureTime(
            departureTime
        );

    const legs =
        buildLegs(
            points,
            cruiseSpeed,
            departureDate
        );

    const totalDistanceNm =
        legs.reduce(
            (total, leg) => {

                return total + leg.distanceNm;
            },
            0
        );

    const totalDurationMinutes =
        legs.reduce(
            (total, leg) => {

                return total + leg.durationMinutes;
            },
            0
        );

    const arrivalDate =
        addMinutes(
            departureDate,
            totalDurationMinutes
        );

    const routePoints =
        buildRoutePoints(
            points,
            legs,
            departureDate
        );

    const weatherPoints =
        buildWeatherSamplingPoints(
            legs,
            departureDate,
            cruiseSpeed
        );

    return {

        points,

        legs,

        routePoints,

        weatherPoints,

        departureDate,

        departureTime:
            departureDate.toISOString(),

        arrivalDate,

        arrivalTime:
            arrivalDate.toISOString(),

        cruiseSpeed,

        totalDistanceNm:
            roundNumber(
                totalDistanceNm,
                1
            ),

        totalDurationMinutes:
            Math.round(
                totalDurationMinutes
            ),

        totalDurationHours:
            roundNumber(
                totalDurationMinutes / 60,
                2
            )
    };
}


/* ==========================================================
   BUILD LEGS
========================================================== */

function buildLegs(
    points,
    cruiseSpeed,
    departureDate
) {

    const legs = [];

    let elapsedMinutes = 0;

    for (
        let index = 0;
        index < points.length - 1;
        index += 1
    ) {

        const startPoint =
            points[index];

        const endPoint =
            points[index + 1];

        const distanceNm =
            calculateDistanceNm(
                startPoint.latitude,
                startPoint.longitude,
                endPoint.latitude,
                endPoint.longitude
            );

        const durationMinutes =
            calculateDurationMinutes(
                distanceNm,
                cruiseSpeed
            );

        const legDepartureDate =
            addMinutes(
                departureDate,
                elapsedMinutes
            );

        const legArrivalDate =
            addMinutes(
                legDepartureDate,
                durationMinutes
            );

        const bearingDegrees =
            calculateInitialBearing(
                startPoint.latitude,
                startPoint.longitude,
                endPoint.latitude,
                endPoint.longitude
            );

        legs.push({

            id:
                `leg-${index + 1}`,

            index,

            number:
                index + 1,

            startPoint,

            endPoint,

            distanceNm:
                roundNumber(
                    distanceNm,
                    1
                ),

            durationMinutes:
                roundNumber(
                    durationMinutes,
                    1
                ),

            bearingDegrees:
                Math.round(
                    bearingDegrees
                ),

            departureDate:
                legDepartureDate,

            departureTime:
                legDepartureDate.toISOString(),

            arrivalDate:
                legArrivalDate,

            arrivalTime:
                legArrivalDate.toISOString(),

            elapsedStartMinutes:
                roundNumber(
                    elapsedMinutes,
                    1
                ),

            elapsedEndMinutes:
                roundNumber(
                    elapsedMinutes +
                    durationMinutes,
                    1
                )
        });

        elapsedMinutes +=
            durationMinutes;
    }

    return legs;
}


/* ==========================================================
   BUILD ROUTE POINTS
========================================================== */

function buildRoutePoints(
    points,
    legs,
    departureDate
) {

    const routePoints = [];

    points.forEach(
        (point, index) => {

            if (index === 0) {

                routePoints.push({

                    ...point,

                    pointType:
                        "departure",

                    etaDate:
                        departureDate,

                    eta:
                        departureDate.toISOString(),

                    elapsedMinutes:
                        0,

                    distanceFromStartNm:
                        0
                });

                return;
            }

            const previousLeg =
                legs[index - 1];

            const distanceFromStartNm =
                legs
                    .slice(0, index)
                    .reduce(
                        (total, leg) => {

                            return (
                                total +
                                leg.distanceNm
                            );
                        },
                        0
                    );

            routePoints.push({

                ...point,

                pointType:
                    index === points.length - 1
                        ? "destination"
                        : "waypoint",

                etaDate:
                    previousLeg.arrivalDate,

                eta:
                    previousLeg.arrivalTime,

                elapsedMinutes:
                    previousLeg.elapsedEndMinutes,

                distanceFromStartNm:
                    roundNumber(
                        distanceFromStartNm,
                        1
                    )
            });
        }
    );

    return routePoints;
}


/* ==========================================================
   WEATHER SAMPLING POINTS
========================================================== */

function buildWeatherSamplingPoints(
    legs,
    departureDate,
    cruiseSpeed
) {

    const samples = [];

    let totalElapsedMinutes = 0;

    legs.forEach(
        (leg, legIndex) => {

            const numberOfSections =
                Math.max(
                    1,
                    Math.ceil(
                        leg.distanceNm /
                        SAMPLE_SPACING_NM
                    )
                );

            for (
                let sectionIndex = 0;
                sectionIndex <= numberOfSections;
                sectionIndex += 1
            ) {

                if (
                    legIndex > 0 &&
                    sectionIndex === 0
                ) {

                    continue;
                }

                const fraction =
                    sectionIndex /
                    numberOfSections;

                const coordinate =
                    interpolateGreatCircle(
                        leg.startPoint.latitude,
                        leg.startPoint.longitude,
                        leg.endPoint.latitude,
                        leg.endPoint.longitude,
                        fraction
                    );

                const distanceAlongLegNm =
                    leg.distanceNm *
                    fraction;

                const elapsedAlongLegMinutes =
                    calculateDurationMinutes(
                        distanceAlongLegNm,
                        cruiseSpeed
                    );

                const elapsedMinutes =
                    totalElapsedMinutes +
                    elapsedAlongLegMinutes;

                const etaDate =
                    addMinutes(
                        departureDate,
                        elapsedMinutes
                    );

                const isStart =
                    legIndex === 0 &&
                    sectionIndex === 0;

                const isEnd =
                    legIndex === legs.length - 1 &&
                    sectionIndex === numberOfSections;

                const isRoutePoint =
                    sectionIndex === 0 ||
                    sectionIndex === numberOfSections;

                const label =
                    getSampleLabel({

                        leg,

                        sectionIndex,

                        numberOfSections,

                        isStart,

                        isEnd

                    });

                samples.push({

                    id:
                        `weather-${legIndex}-${sectionIndex}`,

                    legIndex,

                    sectionIndex,

                    fraction:
                        roundNumber(
                            fraction,
                            4
                        ),

                    latitude:
                        coordinate.latitude,

                    longitude:
                        coordinate.longitude,

                    label,

                    code:
                        getSampleCode({

                            leg,

                            sectionIndex,

                            numberOfSections

                        }),

                    pointType:
                        isStart
                            ? "departure"
                            : isEnd
                                ? "destination"
                                : isRoutePoint
                                    ? "waypoint"
                                    : "sample",

                    isRoutePoint,

                    distanceAlongLegNm:
                        roundNumber(
                            distanceAlongLegNm,
                            1
                        ),

                    distanceFromStartNm:
                        roundNumber(
                            calculateDistanceBeforeLeg(
                                legs,
                                legIndex
                            ) +
                            distanceAlongLegNm,
                            1
                        ),

                    elapsedMinutes:
                        roundNumber(
                            elapsedMinutes,
                            1
                        ),

                    etaDate,

                    eta:
                        etaDate.toISOString()
                });
            }

            totalElapsedMinutes +=
                leg.durationMinutes;
        }
    );

    return samples;
}


/* ==========================================================
   SAMPLE LABELS
========================================================== */

function getSampleLabel(options) {

    const {
        leg,
        sectionIndex,
        numberOfSections,
        isStart,
        isEnd
    } = options;

    if (isStart) {

        return leg.startPoint.name;
    }

    if (isEnd) {

        return leg.endPoint.name;
    }

    if (sectionIndex === numberOfSections) {

        return leg.endPoint.name;
    }

    const percentage =
        Math.round(
            (
                sectionIndex /
                numberOfSections
            ) * 100
        );

    return (
        `${leg.startPoint.name} to ` +
        `${leg.endPoint.name} ` +
        `(${percentage}%)`
    );
}


function getSampleCode(options) {

    const {
        leg,
        sectionIndex,
        numberOfSections
    } = options;

    if (sectionIndex === 0) {

        return leg.startPoint.code || "";
    }

    if (sectionIndex === numberOfSections) {

        return leg.endPoint.code || "";
    }

    return "";
}


/* ==========================================================
   DISTANCE AND TIME
========================================================== */

export function calculateDistanceNm(
    latitudeOne,
    longitudeOne,
    latitudeTwo,
    longitudeTwo
) {

    const lat1 =
        degreesToRadians(
            Number(latitudeOne)
        );

    const lon1 =
        degreesToRadians(
            Number(longitudeOne)
        );

    const lat2 =
        degreesToRadians(
            Number(latitudeTwo)
        );

    const lon2 =
        degreesToRadians(
            Number(longitudeTwo)
        );

    const latitudeDifference =
        lat2 - lat1;

    const longitudeDifference =
        lon2 - lon1;

    const a =
        Math.sin(
            latitudeDifference / 2
        ) ** 2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(
            longitudeDifference / 2
        ) ** 2;

    const angularDistance =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return (
        EARTH_RADIUS_NM *
        angularDistance
    );
}


function calculateDurationMinutes(
    distanceNm,
    cruiseSpeed
) {

    return (
        Number(distanceNm) /
        Number(cruiseSpeed)
    ) * 60;
}


/* ==========================================================
   BEARING
========================================================== */

export function calculateInitialBearing(
    latitudeOne,
    longitudeOne,
    latitudeTwo,
    longitudeTwo
) {

    const lat1 =
        degreesToRadians(
            Number(latitudeOne)
        );

    const lat2 =
        degreesToRadians(
            Number(latitudeTwo)
        );

    const longitudeDifference =
        degreesToRadians(
            Number(longitudeTwo) -
            Number(longitudeOne)
        );

    const y =
        Math.sin(
            longitudeDifference
        ) *
        Math.cos(lat2);

    const x =
        Math.cos(lat1) *
        Math.sin(lat2) -
        Math.sin(lat1) *
        Math.cos(lat2) *
        Math.cos(
            longitudeDifference
        );

    const bearing =
        radiansToDegrees(
            Math.atan2(y, x)
        );

    return (
        bearing + 360
    ) % 360;
}


/* ==========================================================
   GREAT-CIRCLE INTERPOLATION
========================================================== */

function interpolateGreatCircle(
    latitudeOne,
    longitudeOne,
    latitudeTwo,
    longitudeTwo,
    fraction
) {

    if (fraction <= 0) {

        return {

            latitude:
                Number(latitudeOne),

            longitude:
                Number(longitudeOne)
        };
    }

    if (fraction >= 1) {

        return {

            latitude:
                Number(latitudeTwo),

            longitude:
                Number(longitudeTwo)
        };
    }

    const lat1 =
        degreesToRadians(
            Number(latitudeOne)
        );

    const lon1 =
        degreesToRadians(
            Number(longitudeOne)
        );

    const lat2 =
        degreesToRadians(
            Number(latitudeTwo)
        );

    const lon2 =
        degreesToRadians(
            Number(longitudeTwo)
        );

    const angularDistance =
        calculateAngularDistance(
            lat1,
            lon1,
            lat2,
            lon2
        );

    if (angularDistance === 0) {

        return {

            latitude:
                Number(latitudeOne),

            longitude:
                Number(longitudeOne)
        };
    }

    const startWeight =
        Math.sin(
            (1 - fraction) *
            angularDistance
        ) /
        Math.sin(
            angularDistance
        );

    const endWeight =
        Math.sin(
            fraction *
            angularDistance
        ) /
        Math.sin(
            angularDistance
        );

    const x =
        startWeight *
        Math.cos(lat1) *
        Math.cos(lon1) +
        endWeight *
        Math.cos(lat2) *
        Math.cos(lon2);

    const y =
        startWeight *
        Math.cos(lat1) *
        Math.sin(lon1) +
        endWeight *
        Math.cos(lat2) *
        Math.sin(lon2);

    const z =
        startWeight *
        Math.sin(lat1) +
        endWeight *
        Math.sin(lat2);

    const interpolatedLatitude =
        Math.atan2(
            z,
            Math.sqrt(
                x ** 2 +
                y ** 2
            )
        );

    const interpolatedLongitude =
        Math.atan2(
            y,
            x
        );

    return {

        latitude:
            roundNumber(
                radiansToDegrees(
                    interpolatedLatitude
                ),
                6
            ),

        longitude:
            roundNumber(
                radiansToDegrees(
                    interpolatedLongitude
                ),
                6
            )
    };
}


function calculateAngularDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const latitudeDifference =
        lat2 - lat1;

    const longitudeDifference =
        lon2 - lon1;

    const a =
        Math.sin(
            latitudeDifference / 2
        ) ** 2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(
            longitudeDifference / 2
        ) ** 2;

    return (
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        )
    );
}


/* ==========================================================
   DATE HELPERS
========================================================== */

function parseDepartureTime(value) {

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        throw new Error(
            "The departure time is invalid."
        );
    }

    return date;
}


function addMinutes(
    date,
    minutes
) {

    return new Date(
        date.getTime() +
        Number(minutes) *
        60 *
        1000
    );
}


/* ==========================================================
   VALIDATION
========================================================== */

function validateRouteInputs(
    points,
    departureTime,
    cruiseSpeed
) {

    if (points.length < 2) {

        throw new Error(
            "The route requires at least two points."
        );
    }

    points.forEach(
        (point) => {

            if (
                !Number.isFinite(
                    Number(point.latitude)
                ) ||
                !Number.isFinite(
                    Number(point.longitude)
                )
            ) {

                throw new Error(
                    `Coordinates for ${point.name} are invalid.`
                );
            }
        }
    );

    if (!departureTime) {

        throw new Error(
            "A departure time is required."
        );
    }

    if (
        !Number.isFinite(
            cruiseSpeed
        ) ||
        cruiseSpeed <= 0
    ) {

        throw new Error(
            "The cruise speed is invalid."
        );
    }
}


/* ==========================================================
   HELPERS
========================================================== */

function calculateDistanceBeforeLeg(
    legs,
    legIndex
) {

    return legs
        .slice(
            0,
            legIndex
        )
        .reduce(
            (total, leg) => {

                return (
                    total +
                    leg.distanceNm
                );
            },
            0
        );
}


function degreesToRadians(degrees) {

    return (
        Number(degrees) *
        Math.PI /
        180
    );
}


function radiansToDegrees(radians) {

    return (
        Number(radians) *
        180 /
        Math.PI
    );
}


function roundNumber(
    value,
    decimalPlaces = 0
) {

    const multiplier =
        10 ** decimalPlaces;

    return (
        Math.round(
            Number(value) *
            multiplier
        ) /
        multiplier
    );
}
