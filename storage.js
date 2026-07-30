"use strict";

/*
    TAKEOFF
    New Zealand VFR Weather Briefing

    storage.js
    Saves and restores the most recent flight details
    using the browser's localStorage.
*/


/* ==========================================================
   CONSTANTS
========================================================== */

const STORAGE_KEY =
    "takeoff-last-flight";

const STORAGE_VERSION =
    1;


/* ==========================================================
   SAVE FLIGHT
========================================================== */

export function saveFlight(flight) {

    try {

        const storedFlight = {

            version:
                STORAGE_VERSION,

            savedAt:
                new Date().toISOString(),

            departure:
                cleanText(
                    flight?.departure
                ),

            destination:
                cleanText(
                    flight?.destination
                ),

            viaOne:
                cleanText(
                    flight?.viaOne
                ),

            viaTwo:
                cleanText(
                    flight?.viaTwo
                ),

            departureTime:
                cleanText(
                    flight?.departureTime
                ),

            cruiseSpeed:
                cleanText(
                    flight?.cruiseSpeed
                )
        };

        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(
                storedFlight
            )
        );

        return true;

    } catch (error) {

        console.warn(
            "Takeoff could not save the flight.",
            error
        );

        return false;
    }
}


/* ==========================================================
   LOAD FLIGHT
========================================================== */

export function loadFlight() {

    try {

        const storedValue =
            window.localStorage.getItem(
                STORAGE_KEY
            );

        if (!storedValue) {

            return null;
        }

        const storedFlight =
            JSON.parse(
                storedValue
            );

        if (
            !storedFlight ||
            typeof storedFlight !==
            "object"
        ) {

            return null;
        }

        return {

            departure:
                cleanText(
                    storedFlight.departure
                ),

            destination:
                cleanText(
                    storedFlight.destination
                ),

            viaOne:
                cleanText(
                    storedFlight.viaOne
                ),

            viaTwo:
                cleanText(
                    storedFlight.viaTwo
                ),

            departureTime:
                cleanText(
                    storedFlight.departureTime
                ),

            cruiseSpeed:
                cleanText(
                    storedFlight.cruiseSpeed
                ),

            savedAt:
                cleanText(
                    storedFlight.savedAt
                )
        };

    } catch (error) {

        console.warn(
            "Takeoff could not restore the saved flight.",
            error
        );

        return null;
    }
}


/* ==========================================================
   CLEAR FLIGHT
========================================================== */

export function clearSavedFlight() {

    try {

        window.localStorage.removeItem(
            STORAGE_KEY
        );

        return true;

    } catch (error) {

        console.warn(
            "Takeoff could not clear the saved flight.",
            error
        );

        return false;
    }
}


/* ==========================================================
   REVERSE SAVED ROUTE
========================================================== */

export function reverseSavedRoute() {

    const flight =
        loadFlight();

    if (!flight) {

        return null;
    }

    const reversedFlight = {

        ...flight,

        departure:
            flight.destination,

        destination:
            flight.departure,

        viaOne:
            flight.viaTwo,

        viaTwo:
            flight.viaOne
    };

    saveFlight(
        reversedFlight
    );

    return reversedFlight;
}


/* ==========================================================
   CHECK SAVED FLIGHT
========================================================== */

export function hasSavedFlight() {

    try {

        return Boolean(
            window.localStorage.getItem(
                STORAGE_KEY
            )
        );

    } catch (error) {

        return false;
    }
}


/* ==========================================================
   HELPERS
========================================================== */

function cleanText(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";
    }

    return String(
        value
    ).trim();
}
