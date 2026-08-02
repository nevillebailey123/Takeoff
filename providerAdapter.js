const ACTIVE_PROVIDER = 'noaaText';

const PROXY_PREFIX = 'https://r.jina.ai/http://';
const NOAA_METAR_CYCLES_BASE = 'tgftp.nws.noaa.gov/data/observations/metar/cycles';
const NOAA_TAF_CYCLES_BASE = 'tgftp.nws.noaa.gov/data/forecasts/taf/cycles';

function toIsoFromHeader(headerLine) {
  const match = String(headerLine || '').match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00Z`;
}

function parseTempPair(raw) {
  const token = String(raw || '').split(/\s+/).find(part => /^M?\d{2}\/M?\d{2}$/.test(part));
  if (!token) return { temp: null, dewp: null };
  const [tempToken, dewpToken] = token.split('/');
  const parseSigned = value => {
    if (!value) return null;
    const negative = value.startsWith('M');
    const n = Number(value.replace('M', ''));
    if (!Number.isFinite(n)) return null;
    return negative ? -n : n;
  };
  return { temp: parseSigned(tempToken), dewp: parseSigned(dewpToken) };
}

function parseWind(raw) {
  const token = String(raw || '').split(/\s+/).find(part => /^(\d{3}|VRB)\d{2,3}(G\d{2,3})?KT$/.test(part));
  if (!token) return { wdir: null, wspd: null, wgst: null };
  const match = token.match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT$/);
  if (!match) return { wdir: null, wspd: null, wgst: null };
  const direction = match[1] === 'VRB' ? 0 : Number(match[1]);
  const speed = Number(match[2]);
  const gust = Number(match[4]);
  return {
    wdir: Number.isFinite(direction) ? direction : null,
    wspd: Number.isFinite(speed) ? speed : null,
    wgst: Number.isFinite(gust) ? gust : null
  };
}

function parseAltimeter(raw) {
  const tokens = String(raw || '').split(/\s+/);
  const qnhToken = tokens.find(part => /^Q\d{4}$/.test(part));
  if (qnhToken) {
    const n = Number(qnhToken.slice(1));
    return Number.isFinite(n) ? n : null;
  }
  const inHgToken = tokens.find(part => /^A\d{4}$/.test(part));
  if (!inHgToken) return null;
  const inHg = Number(inHgToken.slice(1)) / 100;
  if (!Number.isFinite(inHg)) return null;
  return inHg * 33.8639;
}

function parseCloudLayers(raw) {
  return String(raw || '')
    .split(/\s+/)
    .filter(token => /^(FEW|SCT|BKN|OVC|VV)\d{3}(CB|TCU)?$/.test(token))
    .map(token => {
      const match = token.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/);
      if (!match) return null;
      return {
        cover: match[1],
        base: Number(match[2]) * 100,
        type: match[3] || null
      };
    })
    .filter(Boolean);
}

function parseVisibilityToken(raw) {
  const tokens = String(raw || '').split(/\s+/);
  const metric = tokens.find(token => /^\d{4}$/.test(token));
  if (metric) {
    if (metric === '9999') return '10+';
    const km = Number(metric) / 1000;
    return Number.isFinite(km) ? String(km) : null;
  }
  const statute = tokens.find(token => /^\d+(?:\/\d+)?SM$/.test(token));
  return statute || null;
}

function latestTafCycleHour(date = new Date()) {
  const hour = date.getUTCHours();
  if (hour >= 18) return '18';
  if (hour >= 12) return '12';
  if (hour >= 6) return '06';
  return '00';
}

function extractNoaaPayload(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trimEnd());
  const headerIndex = lines.findIndex(line => /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}$/.test(line.trim()));
  const header = headerIndex >= 0 ? lines[headerIndex].trim() : '';
  const reportLines = lines
    .slice(headerIndex >= 0 ? headerIndex + 1 : 0)
    .filter(line => line.trim() && !/^Title:\s*/.test(line) && !/^URL Source:\s*/.test(line) && !/^Published Time:\s*/.test(line) && !/^Markdown Content:\s*/.test(line));
  const report = reportLines.join(' ').replace(/\s+/g, ' ').trim();
  return { header, report };
}

function extractNoaaContentLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trimEnd());
}

function headerTimestampToken(line) {
  const match = String(line || '').trim().match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})\b/);
  return match?.[1] || null;
}

function parseMetarReport(report, headerIso, expectedCode) {
  if (!report) return null;
  const normalizedReport = String(report).replace(/^(METAR|SPECI)\s+/i, '').trim();
  if (!/^[A-Z]{4}\s+\d{6}Z\b/.test(normalizedReport)) return null;

  const code = String(expectedCode || '').toUpperCase() || String(normalizedReport.split(/\s+/)[0] || '').toUpperCase();
  const { temp, dewp } = parseTempPair(normalizedReport);
  const wind = parseWind(normalizedReport);

  return {
    icaoId: code,
    reportTime: headerIso || null,
    temp,
    dewp,
    wdir: wind.wdir,
    wspd: wind.wspd,
    wgst: wind.wgst,
    visib: parseVisibilityToken(normalizedReport),
    altim: parseAltimeter(normalizedReport),
    rawOb: normalizedReport,
    clouds: parseCloudLayers(normalizedReport)
  };
}

function parseMetarCycleText(text) {
  const lines = extractNoaaContentLines(text);
  const rows = [];
  let headerIso = null;

  lines.forEach(line => {
    const trimmed = String(line || '').trim();
    if (!trimmed || /^Title:\s*/.test(trimmed) || /^URL Source:\s*/.test(trimmed) || /^Published Time:\s*/.test(trimmed) || /^Markdown Content:\s*/.test(trimmed) || /^Warning:\s*/.test(trimmed)) {
      return;
    }

    const headerToken = headerTimestampToken(trimmed);
    if (headerToken) {
      headerIso = toIsoFromHeader(headerToken);
      return;
    }

    const parsed = parseMetarReport(trimmed, headerIso, null);
    if (parsed?.icaoId) rows.push(parsed);
  });

  return rows;
}

function parseMetarText(text, expectedCode) {
  const { header, report } = extractNoaaPayload(text);
  if (!report) return null;
  return parseMetarReport(report, toIsoFromHeader(header), expectedCode);
}

function parseIssueAndValidity(rawTaf, fallbackIso) {
  const tokens = String(rawTaf || '').split(/\s+/);
  const issueToken = tokens.find(part => /^\d{6}Z$/.test(part));
  const validityToken = tokens.find(part => /^\d{4}\/\d{4}$/.test(part));
  if (!issueToken || !validityToken) {
    return { issueTime: fallbackIso, startTime: null, endTime: null };
  }

  const base = fallbackIso ? new Date(fallbackIso) : new Date();
  const [fromToken, toToken] = validityToken.split('/');
  const issueDay = Number(issueToken.slice(0, 2));
  const issueHour = Number(issueToken.slice(2, 4));
  const issueMinute = Number(issueToken.slice(4, 6));
  const fromDay = Number(fromToken.slice(0, 2));
  const fromHour = Number(fromToken.slice(2, 4));
  const toDay = Number(toToken.slice(0, 2));
  const toHour = Number(toToken.slice(2, 4));

  const buildUtc = (day, hour, minute = 0) => {
    const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day, hour, minute, 0, 0));
    if (date.getUTCDate() < base.getUTCDate() - 10) {
      date.setUTCMonth(date.getUTCMonth() + 1);
    }
    return date;
  };

  const issue = buildUtc(issueDay, issueHour, issueMinute);
  const from = buildUtc(fromDay, fromHour, 0);
  const to = buildUtc(toDay, toHour, 0);
  if (to <= from) to.setUTCDate(to.getUTCDate() + 1);

  return {
    issueTime: issue.toISOString(),
    startTime: Math.floor(from.getTime() / 1000),
    endTime: Math.floor(to.getTime() / 1000)
  };
}

function parseTafText(text, expectedCode) {
  const { header, report } = extractNoaaPayload(text);
  if (!report || !report.startsWith('TAF ')) return null;

  const code = String(expectedCode || '').toUpperCase() || String(report.split(/\s+/)[1] || '').toUpperCase();
  const fallbackIso = toIsoFromHeader(header);
  const timing = parseIssueAndValidity(report, fallbackIso);

  const cleaned = report.replace(/^TAF\s+[A-Z]{4}\s+/, '');
  const segment = cleaned
    .split(/\s+(?:FM\d{6}|BECMG|TEMPO|PROB\d{2})\b/)[0]
    .trim();
  const wind = parseWind(segment);
  const clouds = parseCloudLayers(segment);
  const visib = parseVisibilityToken(segment);

  return {
    icaoId: code,
    issueTime: timing.issueTime,
    bulletinTime: timing.issueTime,
    rawTAF: report,
    fcsts: timing.startTime && timing.endTime
      ? [{
          timeFrom: timing.startTime,
          timeTo: timing.endTime,
          fcstChange: null,
          wdir: wind.wdir,
          wspd: wind.wspd,
          wgst: wind.wgst,
          visib,
          altim: null,
          clouds
        }]
      : []
  };
}

function parseTafReport(report, headerIso, expectedCode) {
  const compact = String(report || '').replace(/\s+/g, ' ').trim();
  if (!compact || !compact.startsWith('TAF ')) return null;

  const withoutPrefix = compact.replace(/^TAF\s+/, '');
  const normalized = withoutPrefix.startsWith('TAF ') ? withoutPrefix : compact;
  const codeMatch = normalized.match(/^TAF\s+(?:AMD\s+|COR\s+)?([A-Z]{4})\b/);
  const code = String(expectedCode || '').toUpperCase() || String(codeMatch?.[1] || '').toUpperCase();
  if (!code) return null;

  const fallbackIso = headerIso || null;
  const timing = parseIssueAndValidity(normalized, fallbackIso);

  const cleaned = normalized.replace(/^TAF\s+(?:AMD\s+|COR\s+)?[A-Z]{4}\s+/, '');
  const segment = cleaned
    .split(/\s+(?:FM\d{6}|BECMG|TEMPO|PROB\d{2})\b/)[0]
    .trim();
  const wind = parseWind(segment);
  const clouds = parseCloudLayers(segment);
  const visib = parseVisibilityToken(segment);

  return {
    icaoId: code,
    issueTime: timing.issueTime,
    bulletinTime: timing.issueTime,
    rawTAF: normalized,
    fcsts: timing.startTime && timing.endTime
      ? [{
          timeFrom: timing.startTime,
          timeTo: timing.endTime,
          fcstChange: null,
          wdir: wind.wdir,
          wspd: wind.wspd,
          wgst: wind.wgst,
          visib,
          altim: null,
          clouds
        }]
      : []
  };
}

function parseTafCycleText(text) {
  const lines = extractNoaaContentLines(text);
  const rows = [];
  let headerIso = null;
  let active = null;

  const flush = () => {
    if (!active) return;
    const parsed = parseTafReport(active, headerIso, null);
    if (parsed?.icaoId) rows.push(parsed);
    active = null;
  };

  lines.forEach(line => {
    const raw = String(line || '');
    const trimmed = raw.trim();
    if (!trimmed || /^Title:\s*/.test(trimmed) || /^URL Source:\s*/.test(trimmed) || /^Published Time:\s*/.test(trimmed) || /^Markdown Content:\s*/.test(trimmed) || /^Warning:\s*/.test(trimmed)) {
      return;
    }

    const headerToken = headerTimestampToken(trimmed);
    if (headerToken) {
      flush();
      headerIso = toIsoFromHeader(headerToken);
      return;
    }

    if (trimmed.startsWith('TAF ')) {
      flush();
      active = trimmed;
      return;
    }

    if (active) {
      active = `${active} ${trimmed}`;
    }
  });

  flush();
  return rows;
}

const providers = {
  noaaText: {
    metarUrl() {
      const hour = String(new Date().getUTCHours()).padStart(2, '0');
      return `${PROXY_PREFIX}${NOAA_METAR_CYCLES_BASE}/${hour}Z.TXT`;
    },
    tafUrl() {
      const hour = latestTafCycleHour(new Date());
      return `${PROXY_PREFIX}${NOAA_TAF_CYCLES_BASE}/${hour}Z.TXT`;
    },
    metarRows(payload) {
      if (payload && typeof payload === 'object' && typeof payload.bulkText === 'string') {
        return parseMetarCycleText(payload.bulkText);
      }
      if (Array.isArray(payload)) return payload;
      if (payload && typeof payload === 'object' && Array.isArray(payload.rows)) return payload.rows;
      return [];
    },
    tafRows(payload) {
      if (payload && typeof payload === 'object' && typeof payload.bulkText === 'string') {
        return parseTafCycleText(payload.bulkText);
      }
      if (Array.isArray(payload)) return payload;
      if (payload && typeof payload === 'object' && Array.isArray(payload.rows)) return payload.rows;
      return [];
    },
    normalizeMetarRow(row) {
      if (row?.rawOb) return row;
      if (typeof row?.rawText === 'string') return parseMetarText(row.rawText, row.icaoId || row.code);
      return null;
    },
    normalizeTafRow(row) {
      if (row?.rawTAF) return row;
      if (typeof row?.rawText === 'string') return parseTafText(row.rawText, row.icaoId || row.code);
      return null;
    }
  }

  // Future providers plug in here.
  // Add a new key such as "metservice", "avwx", or "checkwx" with:
  // - metarUrl(icaoCodes)
  // - tafUrl(icaoCodes)
  // - metarRows(payload)
  // - tafRows(payload)
  // - normalizeMetarRow(row)
  // - normalizeTafRow(row)
};

function providerConfig() {
  return providers[ACTIVE_PROVIDER];
}

export function buildMetarUrl(icaoCodes) {
  return providerConfig().metarUrl(icaoCodes);
}

export function buildTafUrl(icaoCodes) {
  return providerConfig().tafUrl(icaoCodes);
}

export function normalizeMetar(payload) {
  const byCode = new Map();
  const rows = providerConfig().metarRows(payload);
  rows.forEach(row => {
    const normalized = providerConfig().normalizeMetarRow(row);
    const code = String(normalized?.icaoId || '').toUpperCase();
    if (code) byCode.set(code, normalized);
  });
  return byCode;
}

export function normalizeTaf(payload) {
  const byCode = new Map();
  const rows = providerConfig().tafRows(payload);
  rows.forEach(row => {
    const normalized = providerConfig().normalizeTafRow(row);
    const code = String(normalized?.icaoId || '').toUpperCase();
    if (code) byCode.set(code, normalized);
  });
  return byCode;
}
