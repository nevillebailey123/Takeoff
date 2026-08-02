import { locations } from './airports.js';

const ICAOS = [
  'NZGS',
  'NZNR',
  'NZPM',
  'NZPP',
  'NZWB',
  'NZKI',
  'NZCH',
  'NZWN',
  'NZWF',
  'NZHK',
  'NZNS'
];

const API_BASE = 'https://data.skylinkapi.com/v3.1/weather';

function airportNameFor(icao) {
  return locations.find(location => String(location.code || '').toUpperCase() === icao)?.name || 'Unknown';
}

function getApiKey() {
  const argIndex = process.argv.indexOf('--api-key');
  if (argIndex !== -1 && process.argv[argIndex + 1]) return process.argv[argIndex + 1];
  return process.env.SKYLINK_API_KEY || process.env.API_KEY || '';
}

async function requestReport(kind, icao, apiKey) {
  const url = `${API_BASE}/${kind}/${icao}?parsed=true`;
  const response = await fetch(url, {
    headers: { 'x-api-key': apiKey, accept: 'application/json' }
  });

  let body = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  } else {
    try {
      body = await response.text();
    } catch {
      body = null;
    }
  }

  const parsed = body && typeof body === 'object' ? body.parsed || null : null;
  const rawIcao = body && typeof body === 'object' ? body.icao ?? null : null;
  const airportName = body && typeof body === 'object' ? body.airport_name ?? airportNameFor(icao) : airportNameFor(icao);

  return {
    kind,
    status: response.status,
    ok: response.ok,
    metarAvailable: kind === 'metar' ? response.ok : undefined,
    tafAvailable: kind === 'taf' ? response.ok : undefined,
    observationTime: kind === 'metar' ? (parsed?.time || body?.timestamp || null) : (body?.timestamp || null),
    rawIcao,
    airportName,
    success: response.ok ? 'success' : 'failure'
  };
}

function formatValue(value) {
  return value == null ? '—' : String(value);
}

function printTable(rows) {
  const headers = [
    'ICAO',
    'Airport',
    'METAR HTTP',
    'METAR?',
    'TAF HTTP',
    'TAF?',
    'Observation time',
    'Raw ICAO',
    'Result',
    'Complete coverage'
  ];

  const widths = headers.map((header, index) => {
    const values = rows.map(row => String(row[index]));
    return Math.max(header.length, ...values.map(value => value.length));
  });

  const renderRow = values => values.map((value, index) => String(value).padEnd(widths[index])).join(' | ');
  const separator = widths.map(width => '-'.repeat(width)).join('-|-');

  console.log(renderRow(headers));
  console.log(separator);
  rows.forEach(row => console.log(renderRow(row)));
}

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('Missing SkyLink API key. Set SKYLINK_API_KEY or pass --api-key <key>.');
    process.exitCode = 1;
    return;
  }

  const results = [];
  const coverage = [];

  for (const icao of ICAOS) {
    const [metar, taf] = await Promise.all([
      requestReport('metar', icao, apiKey),
      requestReport('taf', icao, apiKey)
    ]);

    const completeCoverage = metar.ok && taf.ok;
    coverage.push({ icao, airport: airportNameFor(icao), completeCoverage });

    results.push([
      icao,
      airportNameFor(icao),
      metar.status,
      metar.ok ? 'yes' : 'no',
      taf.status,
      taf.ok ? 'yes' : 'no',
      formatValue(metar.observationTime),
      formatValue(metar.rawIcao),
      completeCoverage ? 'success' : 'failure',
      completeCoverage ? 'yes' : 'no'
    ]);

    console.log(JSON.stringify({ icao, metar, taf }, null, 2));
  }

  console.log('\nSummary table');
  printTable(results);

  console.log('\nAirports with complete coverage');
  coverage.filter(item => item.completeCoverage).forEach(item => {
    console.log(`${item.icao} ${item.airport}`);
  });
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});