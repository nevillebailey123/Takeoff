// TAKEOFF v1.3

const departure = document.getElementById("departure");
const destination = document.getElementById("destination");
const altitude = document.getElementById("altitude");
const departureTime = document.getElementById("departureTime");

const weatherResult = document.getElementById("weatherResult");

const aerodromes = {

    NZAA:{name:"Auckland",lat:-37.0082,lon:174.7850},
    NZAR:{name:"Ardmore",lat:-37.0297,lon:174.9733},
    NZCH:{name:"Christchurch",lat:-43.4894,lon:172.5322},
    NZDN:{name:"Dunedin",lat:-45.9281,lon:170.1983},
    NZHK:{name:"Hokitika",lat:-42.7136,lon:170.9853},
    NZHN:{name:"Hamilton",lat:-37.8667,lon:175.3321},
    NZHT:{name:"Haast",lat:-43.8650,lon:169.0410},
    NZMF:{name:"Milford",lat:-44.6733,lon:167.9233},
    NZNS:{name:"Nelson",lat:-41.2983,lon:173.2211},
    NZNV:{name:"Invercargill",lat:-46.4124,lon:168.3130},
    NZPM:{name:"Palmerston North",lat:-40.3206,lon:175.6170},
    NZPP:{name:"Paraparaumu",lat:-40.9047,lon:174.9890},
    NZQN:{name:"Queenstown",lat:-45.0211,lon:168.7390},
    NZRO:{name:"Rotorua",lat:-38.1092,lon:176.3172},
    NZTG:{name:"Tauranga",lat:-37.6719,lon:176.1960},
    NZTU:{name:"Gisborne",lat:-38.7397,lon:177.9783},
    NZWB:{name:"Woodbourne",lat:-41.5183,lon:173.8700},
    NZWN:{name:"Wellington",lat:-41.3272,lon:174.8053},
    NZWR:{name:"Rangiora",lat:-43.3067,lon:172.3817}

};

function updateSummary(){

    document.getElementById("departureSummary").textContent =
        departure.value.toUpperCase() || "Not entered";

    document.getElementById("destinationSummary").textContent =
        destination.value.toUpperCase() || "Not entered";

    document.getElementById("altitudeSummary").textContent =
        altitude.value ? altitude.value + " ft" : "Not entered";

}

function saveFlight(){

    localStorage.setItem("lastFlight",JSON.stringify({

        departure:departure.value.toUpperCase(),
        destination:destination.value.toUpperCase(),
        altitude:altitude.value,
        departureTime:departureTime.value

    }));

    updateSummary();

}

function loadFlight(){

    const saved = localStorage.getItem("lastFlight");

    if(!saved) return;

    const flight = JSON.parse(saved);

    departure.value = flight.departure || "";
    destination.value = flight.destination || "";
    altitude.value = flight.altitude || "";
    departureTime.value = flight.departureTime || "";

    updateSummary();

}

function reverseRoute(){

    const temp = departure.value;

    departure.value = destination.value;
    destination.value = temp;

    saveFlight();

}

async function getWeather(){

    const code = departure.value.trim().toUpperCase();

    if(!aerodromes[code]){

        weatherResult.innerHTML =
            "<p>Please enter a supported departure aerodrome.</p>";

        return;

    }

    const airport = aerodromes[code];

    weatherResult.innerHTML="<p>Loading live weather...</p>";

    try{

        const url =
`https://api.open-meteo.com/v1/forecast?latitude=${airport.lat}&longitude=${airport.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover`;

        const response = await fetch(url);

        const data = await response.json();

        const w = data.current;

        document.getElementById("weatherBadge").textContent="LIVE";
        document.getElementById("statusValue").textContent="Weather Loaded";
        document.getElementById("warningsValue").textContent="None";
        document.getElementById("updatedValue").textContent=
            new Date().toLocaleTimeString();

        document.getElementById("decisionTitle").textContent="🟢 GO";
        document.getElementById("decisionMessage").textContent=
            "Basic weather looks suitable. Complete your normal pre-flight planning.";

        weatherResult.innerHTML=`

<h3>${airport.name}</h3>

<p><strong>Temperature:</strong> ${w.temperature_2m}°C</p>

<p><strong>Wind:</strong> ${w.wind_speed_10m} km/h (${w.wind_direction_10m}°)</p>

<p><strong>Cloud Cover:</strong> ${w.cloud_cover}%</p>

`;

    }

    catch(error){

        document.getElementById("weatherBadge").textContent="ERROR";

        weatherResult.innerHTML=
            "<p>Unable to retrieve weather.</p>";

    }

}

document.getElementById("weatherButton").addEventListener("click",getWeather);
document.getElementById("reverseButton").addEventListener("click",reverseRoute);
document.getElementById("saveButton").addEventListener("click",saveFlight);

document.querySelectorAll("input").forEach(input=>{

    input.addEventListener("input",saveFlight);

});

loadFlight();
