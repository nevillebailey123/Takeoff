"use strict";

/*
    TAKEOFF
    New Zealand VFR Weather Briefing

    app.js
    Main application controller.
*/

import {
    resolveRoute
} from "./airports.js";

import {
    buildRoutePlan
} from "./route.js";

import {
    fetchRouteWeather
} from "./weather.js";

import {
    initialiseMap,
    renderRouteMap
} from "./map.js";

import {
    saveFlight,
    loadFlight,
    clearSavedFlight
} from "./storage.js";

import {
    showLoading,
    hideLoading,
    showFormMessage,
    clearFormMessage,
    showEntryScreen,
    showBriefingScreen,
    renderBriefing
} from "./ui.js";


/* ==========================================================
   ELEMENTS
========================================================== */

const departureInput =
    document.getElementById("departure");

const viaOneInput =
    document.getElementById("viaOne");

const viaTwoInput =
    document.getElementById("viaTwo");

const destinationInput =
    document.getElementById("destination");

const departureTimeInput =
    document.getElementById("departureTime");

const cruiseSpeedInput =
    document.getElementById("cruiseSpeed");

const reverseRouteButton =
    document.getElementById("reverseRouteButton");

const clearFlightButton =
    document.getElementById("clearFlightButton");

const briefMeButton =
    document.getElementById("briefMeButton");

const editFlightButton =
    document.getElementById("editFlightButton");

const refreshBriefingButton =
    document.getElementById("refreshBriefingButton");


/* ==========================================================
   APPLICATION STATE
========================================================== */

let currentBriefing = null;

let isBriefingInProgress = false;


/* ==========================================================
   START APPLICATION
========================================================== */

function startApplication() {

    initialiseMap();

    loadSavedFlightIntoForm();

    setDefaultDepartureTime();

    attachEventListeners();

    showEntryScreen();
}


/* ==========================================================
   EVENT LISTENERS
========================================================== */

function attachEventListeners() {

    reverseRouteButton.addEventListener(
        "click",
        reverseRoute
    );

    clearFlightButton.addEventListener(
        "click",
        clearFlight
    );

    briefMeButton.addEventListener(
        "click",
        createBriefing
    );

    editFlightButton.addEventListener(
        "click",
        editFlight
    );

    refreshBriefingButton.addEventListener(
        "click",
        refreshBriefing
    );

    const inputs = [

        departureInput,
        viaOneInput,
        viaTwoInput,
        destinationInput,
        departureTimeInput,
        cruiseSpeedInput

    ];

    inputs.forEach((input) => {

        input.addEventListener(
            "change",
            saveCurrentFlight
        );

        input.addEventListener(
            "input",
            clearFormMessage
        );

    });

    document.addEventListener(
        "keydown",
        handleKeyboardShortcut
    );
}


/* ==========================================================
   CREATE BRIEFING
========================================================== */

async function createBriefing() {

    if (isBriefingInProgress) {

        return;
    }

    clearFormMessage();

    const flight = readFlightFromForm();

    const validationMessage =
        validateFlight(flight);

    if (validationMessage) {

        showFormMessage(
            validationMessage,
            "error"
        );

        return;
    }

    isBriefingInProgress = true;

    briefMeButton.disabled = true;

    try {

        showLoading(
            "Resolving your route…"
        );

        saveFlight(flight);

        const resolvedPoints =
            resolveRoute([

                flight.departure,
                flight.viaOne,
                flight.viaTwo,
                flight.destination

            ]);

        showLoading(
            "Calculating distance and ETA…"
        );

        const routePlan =
            buildRoutePlan({

                points: resolvedPoints,

                departureTime:
                    flight.departureTime,

                cruiseSpeed:
                    flight.cruiseSpeed

            });

        showLoading(
            "Fetching forecast weather…"
        );

        const weather =
            await fetchRouteWeather(
                routePlan
            );

        showLoading(
            "Building your briefing…"
        );

        currentBriefing = {

            flight,
            routePlan,
            weather

        };

        renderBriefing(
    currentBriefing
);

attachBriefingButtonListeners();

showBriefingScreen();
        renderRouteMap(
            currentBriefing
        );

        window.scrollTo({

            top: 0,
            behavior: "smooth"

        });

    } catch (error) {

        console.error(
            "Unable to create briefing:",
            error
        );

        showEntryScreen();

        showFormMessage(
            getFriendlyErrorMessage(error),
            "error"
        );

    } finally {

        hideLoading();

        isBriefingInProgress = false;

        briefMeButton.disabled = false;
    }
}


/* ==========================================================
   REFRESH BRIEFING
========================================================== */

async function refreshBriefing() {

    if (!currentBriefing) {

        await createBriefing();

        return;
    }

    await createBriefing();
}


/* ==========================================================
   EDIT FLIGHT
========================================================== */

function editFlight() {

    showEntryScreen();

    window.scrollTo({

        top: 0,
        behavior: "smooth"

    });
}


/* ==========================================================
   REVERSE ROUTE
========================================================== */

function reverseRoute() {

    const route = [

        departureInput.value,
        viaOneInput.value,
        viaTwoInput.value,
        destinationInput.value

    ];

    const reversedRoute =
        route.reverse();

    departureInput.value =
        reversedRoute[0] || "";

    viaOneInput.value =
        reversedRoute[1] || "";

    viaTwoInput.value =
        reversedRoute[2] || "";

    destinationInput.value =
        reversedRoute[3] || "";

    saveCurrentFlight();

    clearFormMessage();
}


/* ==========================================================
   CLEAR FLIGHT
========================================================== */

function clearFlight() {

    departureInput.value = "";

    viaOneInput.value = "";

    viaTwoInput.value = "";

    destinationInput.value = "";

    cruiseSpeedInput.value = "110";

    departureTimeInput.value =
        getDefaultDepartureTime();

    currentBriefing = null;

    clearSavedFlight();

    clearFormMessage();

    departureInput.focus();
}


/* ==========================================================
   FORM DATA
========================================================== */

function readFlightFromForm() {

    return {

        departure:
            normaliseText(
                departureInput.value
            ),

        viaOne:
            normaliseText(
                viaOneInput.value
            ),

        viaTwo:
            normaliseText(
                viaTwoInput.value
            ),

        destination:
            normaliseText(
                destinationInput.value
            ),

        departureTime:
            departureTimeInput.value,

        cruiseSpeed:
            Number(
                cruiseSpeedInput.value
            )

    };
}


function saveCurrentFlight() {

    const flight =
        readFlightFromForm();

    saveFlight(flight);
}


/* ==========================================================
   LOAD SAVED FLIGHT
========================================================== */

function loadSavedFlightIntoForm() {

    const savedFlight =
        loadFlight();

    if (!savedFlight) {

        cruiseSpeedInput.value =
            "110";

        return;
    }

    departureInput.value =
        savedFlight.departure || "";

    viaOneInput.value =
        savedFlight.viaOne || "";

    viaTwoInput.value =
        savedFlight.viaTwo || "";

    destinationInput.value =
        savedFlight.destination || "";

    departureTimeInput.value =
        savedFlight.departureTime || "";

    cruiseSpeedInput.value =
        savedFlight.cruiseSpeed || "110";
}


/* ==========================================================
   VALIDATION
========================================================== */

function validateFlight(flight) {

    if (!flight.departure) {

        return "Enter a departure point.";
    }

    if (!flight.destination) {

        return "Enter a destination.";
    }

    if (!flight.departureTime) {

        return "Select a departure time.";
    }

    if (
        !Number.isFinite(
            flight.cruiseSpeed
        )
    ) {

        return "Enter a valid cruise speed.";
    }

    if (
        flight.cruiseSpeed < 30 ||
        flight.cruiseSpeed > 400
    ) {

        return (
            "Cruise speed must be between " +
            "30 and 400 knots."
        );
    }

    if (
        flight.departure.toLowerCase() ===
        flight.destination.toLowerCase()
    ) {

        return (
            "Departure and destination " +
            "must be different."
        );
    }

    return "";
}


/* ==========================================================
   DEFAULT TIME
========================================================== */

function setDefaultDepartureTime() {

    if (departureTimeInput.value) {

        return;
    }

    departureTimeInput.value =
        getDefaultDepartureTime();
}


function getDefaultDepartureTime() {

    const now =
        new Date();

    const roundedMinutes =
        Math.ceil(
            now.getMinutes() / 15
        ) * 15;

    now.setMinutes(
        roundedMinutes,
        0,
        0
    );

    if (roundedMinutes >= 60) {

        now.setHours(
            now.getHours() + 1
        );

        now.setMinutes(0);
    }

    return formatDateTimeLocal(
        now
    );
}


function formatDateTimeLocal(date) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    const hours =
        String(
            date.getHours()
        ).padStart(2, "0");

    const minutes =
        String(
            date.getMinutes()
        ).padStart(2, "0");

    return (
        `${year}-${month}-${day}` +
        `T${hours}:${minutes}`
    );
}


/* ==========================================================
   KEYBOARD SHORTCUT
========================================================== */

function handleKeyboardShortcut(event) {

    if (
        event.key !== "Enter" ||
        event.shiftKey
    ) {

        return;
    }

    const activeElement =
        document.activeElement;

    const isFormInput = [

        departureInput,
        viaOneInput,
        viaTwoInput,
        destinationInput,
        departureTimeInput,
        cruiseSpeedInput

    ].includes(activeElement);

    if (!isFormInput) {

        return;
    }

    event.preventDefault();

    createBriefing();
}


/* ==========================================================
   HELPERS
========================================================== */

function normaliseText(value) {

    return String(value || "")
        .trim()
        .replace(/\s+/g, " ");
}


function getFriendlyErrorMessage(error) {

    const message =
        String(
            error?.message || ""
        );

    if (
        message.includes(
            "could not be found"
        )
    ) {

        return message;
    }

    if (
        message.includes(
            "weather"
        )
    ) {

        return (
            "Weather data could not be loaded. " +
            "Check your connection and try again."
        );
    }

    if (
        message.includes(
            "forecast range"
        )
    ) {

        return (
            "The selected departure time is " +
            "outside the available forecast range."
        );
    }

    return (
        "The briefing could not be created. " +
        "Please check the route and try again."
    );
function attachBriefingButtonListeners() {

    const newEditFlightButton =

        document.getElementById(

            "editFlightButton"

        );

    const newRefreshBriefingButton =

        document.getElementById(

            "refreshBriefingButton"

        );

    if (newEditFlightButton) {

        newEditFlightButton.addEventListener(

            "click",

            editFlight

        );

    }

    if (newRefreshBriefingButton) {

        newRefreshBriefingButton.addEventListener(

            "click",

            refreshBriefing

        );

    }

}


/* ==========================================================
   START
========================================================== */

startApplication();
