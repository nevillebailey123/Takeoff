# Takeoff v2

Static New Zealand VFR route-weather briefing prototype.

## Run locally

```bash
python3 -m http.server 8000
```

Then open the forwarded port or `http://localhost:8000`.

## Files

- `index.html` interface
- `style.css` responsive styling
- `app.js` application orchestration
- `airports.js` location database
- `routeReferences.js` 50 NM route-reference generation
- `weather.js` Open-Meteo weather requests and formatting
- `map.js` Leaflet map rendering
- `ui.js` briefing UI rendering
- `storage.js` saved route-entry state
- `VISION.md` product principles

Forecast information only. Confirm conditions using official aviation weather and NOTAM sources.
