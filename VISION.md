# TAKEOFF Product Vision

Takeoff is a New Zealand VFR route-weather briefing application. It is not a flight-planning or go/no-go decision application.

## Core principles

- The briefing is the product; the map explains the briefing.
- Departure is the only required route field.
- The pilot chooses the route; Takeoff adds weather samples at approximately 50 NM intervals.
- A pilot can add a specific Via location whenever they want a particular point sampled.
- Weather cards and map markers must be generated from one ordered Route Reference list.
- Cloud is shown as AMSL followed by AGL in brackets where elevation is known, for example `3400 (2650)`.
- Wind is shown as `290/15 G25`.
- Map route line is dark; marker fill indicates weather status.
- Airport markers use a double white ring; geographic references use a plain circle.
- No stale briefing is shown at startup. Entry data may be remembered, briefing results are not.
- Information is progressively revealed and never overloads the pilot.
