async function getWeather() {

    const dep = departure.value.trim().toUpperCase();
    const dest = destination.value.trim().toUpperCase();

    if (!aerodromes[dep]) {
        weatherResult.innerHTML =
            "<p>Please enter a valid departure aerodrome.</p>";
        return;
    }

    if (!aerodromes[dest]) {
        weatherResult.innerHTML =
            "<p>Please enter a valid destination aerodrome.</p>";
        return;
    }

    weatherResult.innerHTML = "<p>Loading live weather...</p>";

    try {

        const depAirport = aerodromes[dep];
        const destAirport = aerodromes[dest];

        const depURL =
`https://api.open-meteo.com/v1/forecast?latitude=${depAirport.lat}&longitude=${depAirport.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover`;

        const destURL =
`https://api.open-meteo.com/v1/forecast?latitude=${destAirport.lat}&longitude=${destAirport.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover`;

        const depResponse = await fetch(depURL);
        const destResponse = await fetch(destURL);

        const depData = await depResponse.json();
        const destData = await destResponse.json();

        const d = depData.current;
        const a = destData.current;

        document.getElementById("weatherBadge").textContent = "LIVE";
        document.getElementById("statusValue").textContent = "Weather Loaded";
        document.getElementById("updatedValue").textContent =
            new Date().toLocaleTimeString();

        let decision = "🟢 GO";
        let message = "Weather appears suitable for VFR. Continue normal planning.";

        if (
            d.wind_speed_10m > 35 ||
            a.wind_speed_10m > 35 ||
            d.cloud_cover > 90 ||
            a.cloud_cover > 90
        ) {
            decision = "🔴 NO GO";
            message = "Strong winds or extensive cloud. Review carefully.";
            document.getElementById("warningsValue").textContent = "Weather";
        }
        else if (
            d.wind_speed_10m > 25 ||
            a.wind_speed_10m > 25 ||
            d.cloud_cover > 70 ||
            a.cloud_cover > 70
        ) {
            decision = "🟠 REVIEW";
            message = "Conditions are becoming marginal.";
            document.getElementById("warningsValue").textContent = "Review";
        }
        else {
            document.getElementById("warningsValue").textContent = "None";
        }

        document.getElementById("decisionTitle").textContent = decision;
        document.getElementById("decisionMessage").textContent = message;

        weatherResult.innerHTML = `

<h3>Departure (${dep})</h3>

<p>🌡 ${d.temperature_2m}°C</p>
<p>💨 ${d.wind_speed_10m} km/h @ ${d.wind_direction_10m}°</p>
<p>☁️ ${d.cloud_cover}% cloud</p>

<hr>

<h3>Destination (${dest})</h3>

<p>🌡 ${a.temperature_2m}°C</p>
<p>💨 ${a.wind_speed_10m} km/h @ ${a.wind_direction_10m}°</p>
<p>☁️ ${a.cloud_cover}% cloud</p>

`;

    }
    catch (err) {

        document.getElementById("weatherBadge").textContent = "ERROR";

        weatherResult.innerHTML =
            "<p>Unable to retrieve weather.</p>";

    }

}
