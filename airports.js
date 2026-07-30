"use strict";

/*
    TAKEOFF
    New Zealand VFR Weather Briefing

    airports.js
    Resolves aerodrome codes, airport names, towns and airstrips
    into latitude and longitude coordinates.
*/


/* ==========================================================
   LOCATION DATABASE
========================================================== */

const locations = [

    /* North Island */

    {
        code: "NZAA",
        name: "Auckland Airport",
        aliases: ["Auckland", "Mangere"],
        latitude: -37.0082,
        longitude: 174.7850
    },

    {
        code: "NZAR",
        name: "Ardmore Airport",
        aliases: ["Ardmore"],
        latitude: -37.0297,
        longitude: 174.9733
    },

    {
        code: "NZWP",
        name: "Whenuapai",
        aliases: ["Whenuapai", "Auckland Whenuapai"],
        latitude: -36.7878,
        longitude: 174.6300
    },

    {
        code: "NZNE",
        name: "North Shore Aerodrome",
        aliases: ["North Shore", "Dairy Flat"],
        latitude: -36.6567,
        longitude: 174.6550
    },

    {
        code: "NZKT",
        name: "Kaitaia Airport",
        aliases: ["Kaitaia"],
        latitude: -35.0700,
        longitude: 173.2850
    },

    {
        code: "NZKK",
        name: "Kerikeri Airport",
        aliases: ["Kerikeri", "Bay of Islands"],
        latitude: -35.2628,
        longitude: 173.9119
    },

    {
        code: "NZWR",
        name: "Whangarei Airport",
        aliases: ["Whangarei"],
        latitude: -35.7683,
        longitude: 174.3650
    },

    {
        code: "NZGB",
        name: "Great Barrier Aerodrome",
        aliases: ["Great Barrier", "Claris"],
        latitude: -36.2414,
        longitude: 175.4728
    },

    {
        code: "NZTH",
        name: "Thames Aerodrome",
        aliases: ["Thames"],
        latitude: -37.1567,
        longitude: 175.5503
    },

    {
        code: "NZHN",
        name: "Hamilton Airport",
        aliases: ["Hamilton", "Rukuhia"],
        latitude: -37.8667,
        longitude: 175.3321
    },

    {
        code: "NZTG",
        name: "Tauranga Airport",
        aliases: ["Tauranga", "Mount Maunganui"],
        latitude: -37.6719,
        longitude: 176.1961
    },

    {
        code: "NZRO",
        name: "Rotorua Airport",
        aliases: ["Rotorua"],
        latitude: -38.1092,
        longitude: 176.3172
    },

    {
        code: "NZTO",
        name: "Tokoroa Aerodrome",
        aliases: ["Tokoroa"],
        latitude: -38.2367,
        longitude: 175.8928
    },

    {
        code: "NZAP",
        name: "Taupo Airport",
        aliases: ["Taupo"],
        latitude: -38.7397,
        longitude: 176.0844
    },

    {
        code: "NZWK",
        name: "Whakatane Airport",
        aliases: ["Whakatane"],
        latitude: -37.9206,
        longitude: 176.9142
    },

    {
        code: "NZGS",
        name: "Gisborne Airport",
        aliases: ["Gisborne"],
        latitude: -38.6633,
        longitude: 177.9783
    },

    {
        code: "NZNP",
        name: "New Plymouth Airport",
        aliases: ["New Plymouth"],
        latitude: -39.0086,
        longitude: 174.1792
    },

    {
        code: "NZOH",
        name: "Ohakea",
        aliases: ["Ohakea"],
        latitude: -40.2061,
        longitude: 175.3878
    },

    {
        code: "NZPM",
        name: "Palmerston North Airport",
        aliases: ["Palmerston North", "Palmy"],
        latitude: -40.3206,
        longitude: 175.6169
    },

    {
        code: "NZPP",
        name: "Kapiti Coast Airport",
        aliases: ["Paraparaumu", "Kapiti"],
        latitude: -40.9047,
        longitude: 174.9892
    },

    {
        code: "NZWN",
        name: "Wellington Airport",
        aliases: ["Wellington"],
        latitude: -41.3272,
        longitude: 174.8053
    },

    {
        code: "NZWB",
        name: "Woodbourne Airport",
        aliases: ["Woodbourne", "Blenheim"],
        latitude: -41.5183,
        longitude: 173.8703
    },

    {
        code: "NZNS",
        name: "Nelson Airport",
        aliases: ["Nelson"],
        latitude: -41.2983,
        longitude: 173.2211
    },

    {
        code: "NZNR",
        name: "Napier Airport",
        aliases: ["Napier", "Hawkes Bay"],
        latitude: -39.4658,
        longitude: 176.8700
    },

    {
        code: "NZMS",
        name: "Masterton Aerodrome",
        aliases: ["Masterton", "Hood"],
        latitude: -40.9733,
        longitude: 175.6336
    },

    {
        code: "NZWU",
        name: "Whanganui Airport",
        aliases: ["Whanganui", "Wanganui"],
        latitude: -39.9622,
        longitude: 175.0253
    },


    /* South Island */

    {
        code: "NZCH",
        name: "Christchurch Airport",
        aliases: ["Christchurch"],
        latitude: -43.4894,
        longitude: 172.5322
    },

    {
        code: "NZAS",
        name: "Ashburton Aerodrome",
        aliases: ["Ashburton"],
        latitude: -43.9033,
        longitude: 171.7967
    },

    {
        code: "NZRT",
        name: "Rangiora Aerodrome",
        aliases: ["Rangiora"],
        latitude: -43.2900,
        longitude: 172.5419
    },

    {
        code: "NZFF",
        name: "Forest Field Aerodrome",
        aliases: ["Forest Field"],
        latitude: -43.3850,
        longitude: 172.3600
    },

    {
        code: "NZTU",
        name: "Timaru Airport",
        aliases: ["Timaru", "Richard Pearse"],
        latitude: -44.3028,
        longitude: 171.2253
    },

    {
        code: "NZOU",
        name: "Oamaru Airport",
        aliases: ["Oamaru"],
        latitude: -44.9700,
        longitude: 171.0817
    },

    {
        code: "NZDN",
        name: "Dunedin Airport",
        aliases: ["Dunedin", "Momona"],
        latitude: -45.9281,
        longitude: 170.1983
    },

    {
        code: "NZNV",
        name: "Invercargill Airport",
        aliases: ["Invercargill"],
        latitude: -46.4125,
        longitude: 168.3128
    },

    {
        code: "NZRC",
        name: "Stewart Island Aerodrome",
        aliases: ["Stewart Island", "Ryan's Creek", "Ryans Creek"],
        latitude: -46.8997,
        longitude: 168.1017
    },

    {
        code: "NZQN",
        name: "Queenstown Airport",
        aliases: ["Queenstown", "Frankton"],
        latitude: -45.0211,
        longitude: 168.7392
    },

    {
        code: "NZWF",
        name: "Wanaka Airport",
        aliases: ["Wanaka"],
        latitude: -44.7222,
        longitude: 169.2456
    },

    {
        code: "NZLX",
        name: "Alexandra Aerodrome",
        aliases: ["Alexandra"],
        latitude: -45.2117,
        longitude: 169.3733
    },

    {
        code: "NZMC",
        name: "Mount Cook Aerodrome",
        aliases: ["Mount Cook", "Aoraki", "Mount Cook Airport"],
        latitude: -43.7650,
        longitude: 170.1333
    },

    {
        code: "NZGT",
        name: "Glentanner Aerodrome",
        aliases: ["Glentanner"],
        latitude: -43.9067,
        longitude: 170.1283
    },

    {
        code: "NZTW",
        name: "Pukaki Airport",
        aliases: ["Pukaki", "Twizel"],
        latitude: -44.2350,
        longitude: 170.1183
    },

    {
        code: "NZTE",
        name: "Te Anau Airport",
        aliases: ["Te Anau", "Manapouri"],
        latitude: -45.5331,
        longitude: 167.6500
    },

    {
        code: "NZMF",
        name: "Milford Sound Airport",
        aliases: ["Milford Sound", "Milford"],
        latitude: -44.6733,
        longitude: 167.9233
    },

    {
        code: "NZHK",
        name: "Hokitika Airport",
        aliases: ["Hokitika"],
        latitude: -42.7136,
        longitude: 170.9853
    },

    {
        code: "NZGM",
        name: "Greymouth Aerodrome",
        aliases: ["Greymouth"],
        latitude: -42.4617,
        longitude: 171.1900
    },

    {
        code: "NZWS",
        name: "Westport Airport",
        aliases: ["Westport"],
        latitude: -41.7381,
        longitude: 171.5808
    },

    {
        code: "NZHT",
        name: "Haast Aerodrome",
        aliases: ["Haast"],
        latitude: -43.8653,
        longitude: 169.0417
    },

    {
        code: "NZFJ",
        name: "Franz Josef Aerodrome",
        aliases: ["Franz Josef", "Franz Josef Glacier"],
        latitude: -43.3631,
        longitude: 170.1344
    },

    {
        code: "NZUK",
        name: "Pukaki / Tekapo Area",
        aliases: ["Lake Tekapo", "Tekapo"],
        latitude: -44.0050,
        longitude: 170.4440
    },

    {
        code: "NZMO",
        name: "Motu Moana",
        aliases: ["Motu Moana"],
        latitude: -45.5400,
        longitude: 167.5900
    },

    {
        code: "NZKI",
        name: "Kaikoura Aerodrome",
        aliases: ["Kaikoura"],
        latitude: -42.4250,
        longitude: 173.6053
    },

    {
        code: "NZKE",
        name: "Motueka Aerodrome",
        aliases: ["Motueka"],
        latitude: -41.1233,
        longitude: 172.9886
    },

    {
        code: "NZTK",
        name: "Takaka Aerodrome",
        aliases: ["Takaka", "Golden Bay"],
        latitude: -40.8133,
        longitude: 172.7750
    },


    /* Common towns and route points */

    {
        code: "",
        name: "Makarora",
        aliases: ["Makarora"],
        latitude: -44.2314,
        longitude: 169.2303
    },

    {
        code: "",
        name: "Omarama",
        aliases: ["Omarama"],
        latitude: -44.4872,
        longitude: 169.9686
    },

    {
        code: "",
        name: "Kurow",
        aliases: ["Kurow"],
        latitude: -44.7328,
        longitude: 170.4692
    },

    {
        code: "",
        name: "Methven",
        aliases: ["Methven"],
        latitude: -43.6333,
        longitude: 171.6467
    },

    {
        code: "",
        name: "Geraldine",
        aliases: ["Geraldine"],
        latitude: -44.0906,
        longitude: 171.2442
    },

    {
        code: "",
        name: "Fairlie",
        aliases: ["Fairlie"],
        latitude: -44.0994,
        longitude: 170.8286
    },

    {
        code: "",
        name: "Fox Glacier",
        aliases: ["Fox Glacier", "Fox"],
        latitude: -43.4647,
        longitude: 170.0178
    },

    {
        code: "",
        name: "Karamea",
        aliases: ["Karamea"],
        latitude: -41.2500,
        longitude: 172.1167
    },

    {
        code: "",
        name: "Murchison",
        aliases: ["Murchison"],
        latitude: -41.8000,
        longitude: 172.3333
    },

    {
        code: "",
        name: "Hanmer Springs",
        aliases: ["Hanmer", "Hanmer Springs"],
        latitude: -42.5228,
        longitude: 172.8294
    },

    {
        code: "",
        name: "Arthur's Pass",
        aliases: ["Arthurs Pass", "Arthur's Pass"],
        latitude: -42.9453,
        longitude: 171.5628
    },

    {
        code: "",
        name: "Lewis Pass",
        aliases: ["Lewis Pass"],
        latitude: -42.3786,
        longitude: 172.4011
    },

    {
        code: "",
        name: "Hawea",
        aliases: ["Lake Hawea", "Hawea"],
        latitude: -44.6100,
        longitude: 169.2600
    },

    {
        code: "",
        name: "Cromwell",
        aliases: ["Cromwell"],
        latitude: -45.0389,
        longitude: 169.2000
    },

    {
        code: "",
        name: "Gore",
        aliases: ["Gore"],
        latitude: -46.1028,
        longitude: 168.9436
    },

    {
        code: "",
        name: "Balclutha",
        aliases: ["Balclutha"],
        latitude: -46.2339,
        longitude: 169.7500
    }
];


/* ==========================================================
   RESOLVE ROUTE
========================================================== */

export function resolveRoute(routeValues) {

    if (!Array.isArray(routeValues)) {

        throw new Error(
            "The route could not be read."
        );
    }

    const filteredValues =
        routeValues.filter((value) => {

            return normaliseSearchText(value) !== "";
        });

    if (filteredValues.length < 2) {

        throw new Error(
            "Enter at least a departure and destination."
        );
    }

    return filteredValues.map(
        (value, index) => {

            const location =
                findLocation(value);

            if (!location) {

                throw new Error(
                    `"${value}" could not be found. ` +
                    "Try an airport code or a recognised town name."
                );
            }

            return {

                id:
                    createPointId(
                        location,
                        index
                    ),

                code:
                    location.code || "",

                name:
                    location.name,

                input:
                    String(value).trim(),

                latitude:
                    Number(location.latitude),

                longitude:
                    Number(location.longitude),

                routeIndex:
                    index
            };
        }
    );
}


/* ==========================================================
   FIND LOCATION
========================================================== */

export function findLocation(value) {

    const searchText =
        normaliseSearchText(value);

    if (!searchText) {

        return null;
    }

    const exactCodeMatch =
        locations.find((location) => {

            return (
                location.code &&
                normaliseSearchText(
                    location.code
                ) === searchText
            );
        });

    if (exactCodeMatch) {

        return exactCodeMatch;
    }

    const exactNameMatch =
        locations.find((location) => {

            return (
                normaliseSearchText(
                    location.name
                ) === searchText
            );
        });

    if (exactNameMatch) {

        return exactNameMatch;
    }

    const aliasMatch =
        locations.find((location) => {

            return location.aliases.some(
                (alias) => {

                    return (
                        normaliseSearchText(alias) ===
                        searchText
                    );
                }
            );
        });

    if (aliasMatch) {

        return aliasMatch;
    }

    const partialMatch =
        locations.find((location) => {

            const searchableValues = [

                location.code,
                location.name,
                ...location.aliases

            ];

            return searchableValues.some(
                (item) => {

                    const normalisedItem =
                        normaliseSearchText(item);

                    return (
                        normalisedItem.includes(
                            searchText
                        ) ||
                        searchText.includes(
                            normalisedItem
                        )
                    );
                }
            );
        });

    return partialMatch || null;
}


/* ==========================================================
   EXPORTED LOCATION LIST
========================================================== */

export function getKnownLocations() {

    return locations.map((location) => {

        return {

            code:
                location.code,

            name:
                location.name,

            aliases:
                [...location.aliases],

            latitude:
                location.latitude,

            longitude:
                location.longitude
        };
    });
}


/* ==========================================================
   HELPERS
========================================================== */

function normaliseSearchText(value) {

    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function createPointId(location, index) {

    const baseName =

        location.code ||
        normaliseSearchText(
            location.name
        ).replace(/\s+/g, "-");

    return `${baseName}-${index}`;
}
