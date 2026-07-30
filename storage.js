"use strict";

/*
    TAKEOFF

    storage.js

    Handles saving and loading the most recent flight.
*/

const STORAGE_KEY = "takeoff-last-flight-v2";

/* ==========================================================
   SAVE
========================================================== */

export function saveFlight(flight) {

    try {

        localStorage.setItem(

            STORAGE_KEY,

            JSON.stringify(flight)

        );

    } catch (error) {

        console.warn(
            "Unable to save flight.",
            error
        );

    }

}

/* ==========================================================
   LOAD
========================================================== */

export function loadFlight() {

    try {

        const saved = localStorage.getItem(
            STORAGE_KEY
        );

        if (!saved) {

            return null;

        }

        return JSON.parse(saved);

    } catch (error) {

        console.warn(
            "Unable to load saved flight.",
            error
        );

        return null;

    }

}

/* ==========================================================
   CLEAR
========================================================== */

export function clearSavedFlight() {

    try {

        localStorage.removeItem(
            STORAGE_KEY
        );

    } catch (error) {

        console.warn(
            "Unable to clear saved flight.",
            error
        );

    }

}

/* ==========================================================
   GENERIC SETTINGS
========================================================== */

export function saveSetting(key, value) {

    try {

        localStorage.setItem(

            `takeoff-${key}`,

            JSON.stringify(value)

        );

    } catch (error) {

        console.warn(
            "Unable to save setting.",
            error
        );

    }

}

export function loadSetting(key, defaultValue = null) {

    try {

        const saved = localStorage.getItem(
            `takeoff-${key}`
        );

        if (!saved) {

            return defaultValue;

        }

        return JSON.parse(saved);

    } catch (error) {

        console.warn(
            "Unable to load setting.",
            error
        );

        return defaultValue;

    }

}

/* ==========================================================
   FAVOURITE ROUTES
========================================================== */

const FAVOURITES_KEY =
    "takeoff-favourite-routes";

export function loadFavouriteRoutes() {

    try {

        const saved = localStorage.getItem(
            FAVOURITES_KEY
        );

        if (!saved) {

            return [];

        }

        return JSON.parse(saved);

    } catch {

        return [];

    }

}

export function saveFavouriteRoute(route) {

    const routes = loadFavouriteRoutes();

    routes.push(route);

    localStorage.setItem(

        FAVOURITES_KEY,

        JSON.stringify(routes)

    );

}

export function deleteFavouriteRoute(index) {

    const routes = loadFavouriteRoutes();

    routes.splice(index, 1);

    localStorage.setItem(

        FAVOURITES_KEY,

        JSON.stringify(routes)

    );

}

/* ==========================================================
   CACHE
========================================================== */

export function saveWeatherCache(key, data) {

    try {

        const cache = {

            timestamp: Date.now(),

            data

        };

        localStorage.setItem(

            `weather-${key}`,

            JSON.stringify(cache)

        );

    } catch {

        /* Ignore */

    }

}

export function loadWeatherCache(

    key,

    maxAgeMinutes = 15

) {

    try {

        const saved = localStorage.getItem(

            `weather-${key}`

        );

        if (!saved) {

            return null;

        }

        const cache = JSON.parse(saved);

        const ageMinutes =

            (Date.now() - cache.timestamp)

            / 60000;

        if (ageMinutes > maxAgeMinutes) {

            return null;

        }

        return cache.data;

    } catch {

        return null;

    }

}
