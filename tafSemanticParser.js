function toIsoUtc(date) {
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function resolveUtc(day, hour, minute, anchorDate) {
  const anchor = anchorDate instanceof Date && Number.isFinite(anchorDate.getTime()) ? anchorDate : new Date();
  const candidate = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), day, hour, minute, 0, 0));

  if (candidate.getUTCDate() < anchor.getUTCDate() - 10) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  }

  if (candidate.getUTCDate() > anchor.getUTCDate() + 20) {
    candidate.setUTCMonth(candidate.getUTCMonth() - 1);
  }

  return candidate;
}

function parseDdHhOrDdHhMm(token) {
  const value = String(token || '').trim();
  const shortMatch = value.match(/^(\d{2})(\d{2})$/);
  if (shortMatch) {
    return {
      day: Number(shortMatch[1]),
      hour: Number(shortMatch[2]),
      minute: 0
    };
  }

  const longMatch = value.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (longMatch) {
    return {
      day: Number(longMatch[1]),
      hour: Number(longMatch[2]),
      minute: Number(longMatch[3])
    };
  }

  return null;
}

function parseIssueToken(issueToken, referenceDate) {
  const match = String(issueToken || '').match(/^(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return null;
  const day = Number(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return resolveUtc(day, hour, minute, referenceDate);
}

function parseWindowToken(windowToken, anchorDate) {
  const match = String(windowToken || '').match(/^(\d{4}|\d{6})\/(\d{4}|\d{6})$/);
  if (!match) return null;

  const from = parseDdHhOrDdHhMm(match[1]);
  const to = parseDdHhOrDdHhMm(match[2]);
  if (!from || !to) return null;

  const start = resolveUtc(from.day, from.hour, from.minute, anchorDate);
  const end = resolveUtc(to.day, to.hour, to.minute, start);
  if (end <= start) end.setUTCDate(end.getUTCDate() + 1);

  return {
    validFrom: start,
    validTo: end
  };
}

function parseFmToken(fmToken, anchorDate) {
  const match = String(fmToken || '').match(/^FM(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return resolveUtc(day, hour, minute, anchorDate);
}

function parseConditions(tokens) {
  const textTokens = Array.isArray(tokens) ? tokens.map(token => String(token || '').trim()).filter(Boolean) : [];
  const raw = textTokens.join(' ');

  const wind = textTokens.find(token => /^(\d{3}|VRB)\d{2,3}(G\d{2,3})?KT$/.test(token)) || null;
  const visibility = textTokens.find(token => token === 'CAVOK' || /^\d{4}$/.test(token) || /^\d+(?:\/\d+)?SM$/.test(token)) || null;
  const clouds = textTokens.filter(token => /^(FEW|SCT|BKN|OVC|VV)\d{3}(CB|TCU)?$/.test(token));
  const nsc = textTokens.some(token => /^(NSC|NCD|SKC|CLR)$/.test(token));
  const cavok = textTokens.includes('CAVOK');

  const weather = textTokens
    .filter(token => /^(-|\+|VC)?[A-Z]{2,}$/.test(token))
    .filter(token => ![
      'TAF', 'AMD', 'COR', 'NIL', 'CNL', 'TEMPO', 'BECMG', 'NOSIG',
      'CAVOK', 'NSC', 'NCD', 'SKC', 'CLR', 'PROB30', 'PROB40'
    ].includes(token))
    .filter(token => !/^(FEW|SCT|BKN|OVC|VV)\d{3}(CB|TCU)?$/.test(token))
    .filter(token => !/^(\d{4}|\d+(?:\/\d+)?SM)$/.test(token))
    .filter(token => !/^(\d{3}|VRB)\d{2,3}(G\d{2,3})?KT$/.test(token));

  return {
    wind,
    visibility,
    weather,
    clouds,
    cavok,
    nsc,
    raw
  };
}

function isMarkerToken(token) {
  return /^(FM\d{6}|BECMG|TEMPO|PROB30|PROB40)$/.test(String(token || ''));
}

function parseBodyGroups(bodyTokens, validityStart, validityEnd) {
  const initialTokens = [];
  const segments = [];
  let index = 0;

  while (index < bodyTokens.length) {
    const token = bodyTokens[index];

    if (!isMarkerToken(token)) {
      initialTokens.push(token);
      index += 1;
      continue;
    }

    if (/^FM\d{6}$/.test(token)) {
      const marker = token;
      index += 1;
      const conditionTokens = [];
      while (index < bodyTokens.length && !isMarkerToken(bodyTokens[index])) {
        conditionTokens.push(bodyTokens[index]);
        index += 1;
      }
      segments.push({
        kind: 'FM',
        marker,
        windowToken: null,
        conditionTokens,
        raw: [marker, ...conditionTokens].join(' ')
      });
      continue;
    }

    if (token === 'BECMG' || token === 'TEMPO') {
      const marker = token;
      const windowToken = bodyTokens[index + 1] || '';
      index += 2;
      const conditionTokens = [];
      while (index < bodyTokens.length && !isMarkerToken(bodyTokens[index])) {
        conditionTokens.push(bodyTokens[index]);
        index += 1;
      }
      segments.push({
        kind: marker,
        marker,
        windowToken,
        conditionTokens,
        raw: [marker, windowToken, ...conditionTokens].join(' ').trim()
      });
      continue;
    }

    if (token === 'PROB30' || token === 'PROB40') {
      const marker = token;
      let offset = 1;
      let kind = marker;
      if (bodyTokens[index + 1] === 'TEMPO') {
        kind = `${marker}_TEMPO`;
        offset = 2;
      }
      const windowToken = bodyTokens[index + offset] || '';
      index += offset + 1;
      const conditionTokens = [];
      while (index < bodyTokens.length && !isMarkerToken(bodyTokens[index])) {
        conditionTokens.push(bodyTokens[index]);
        index += 1;
      }
      const rawTokens = [marker];
      if (kind.endsWith('_TEMPO')) rawTokens.push('TEMPO');
      rawTokens.push(windowToken, ...conditionTokens);
      segments.push({
        kind,
        marker,
        windowToken,
        conditionTokens,
        raw: rawTokens.join(' ').trim()
      });
      continue;
    }

    index += 1;
  }

  const prevailingTimeline = [];
  const overlays = [];

  const initialConditions = parseConditions(initialTokens);
  prevailingTimeline.push({
    type: 'INITIAL',
    validFrom: toIsoUtc(validityStart),
    validTo: toIsoUtc(validityEnd),
    wind: initialConditions.wind,
    visibility: initialConditions.visibility,
    weather: initialConditions.weather,
    clouds: initialConditions.clouds,
    cavok: initialConditions.cavok,
    nsc: initialConditions.nsc,
    raw: initialConditions.raw
  });

  segments.forEach(segment => {
    if (segment.kind === 'FM') {
      const validFromDate = parseFmToken(segment.marker, validityStart);
      const conditions = parseConditions(segment.conditionTokens);
      prevailingTimeline.push({
        type: 'FM',
        validFrom: toIsoUtc(validFromDate),
        validTo: toIsoUtc(validityEnd),
        wind: conditions.wind,
        visibility: conditions.visibility,
        weather: conditions.weather,
        clouds: conditions.clouds,
        cavok: conditions.cavok,
        nsc: conditions.nsc,
        raw: segment.raw
      });
      return;
    }

    if (segment.kind === 'BECMG') {
      const window = parseWindowToken(segment.windowToken, validityStart);
      const conditions = parseConditions(segment.conditionTokens);
      prevailingTimeline.push({
        type: 'BECMG',
        validFrom: toIsoUtc(window?.validFrom || null),
        validTo: toIsoUtc(window?.validTo || null),
        wind: conditions.wind,
        visibility: conditions.visibility,
        weather: conditions.weather,
        clouds: conditions.clouds,
        cavok: conditions.cavok,
        nsc: conditions.nsc,
        raw: segment.raw
      });
      return;
    }

    const window = parseWindowToken(segment.windowToken, validityStart);
    const conditions = parseConditions(segment.conditionTokens);
    const probability = segment.kind.startsWith('PROB30')
      ? 30
      : segment.kind.startsWith('PROB40')
        ? 40
        : null;
    overlays.push({
      type: segment.kind,
      probability,
      validFrom: toIsoUtc(window?.validFrom || null),
      validTo: toIsoUtc(window?.validTo || null),
      wind: conditions.wind,
      visibility: conditions.visibility,
      weather: conditions.weather,
      clouds: conditions.clouds,
      cavok: conditions.cavok,
      nsc: conditions.nsc,
      raw: segment.raw
    });
  });

  // Derive prevailing validTo bounds from next prevailing transition.
  const prevailingEntries = prevailingTimeline
    .map(entry => ({ ...entry }))
    .sort((a, b) => new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime());

  for (let i = 0; i < prevailingEntries.length; i += 1) {
    const next = prevailingEntries[i + 1];
    if (prevailingEntries[i].type === 'BECMG') {
      continue;
    }
    if (!next) {
      prevailingEntries[i].validTo = toIsoUtc(validityEnd);
      continue;
    }
    prevailingEntries[i].validTo = next.validFrom;
  }

  return {
    prevailingTimeline: prevailingEntries,
    overlays
  };
}

function parseTafSemantic(rawTaf, options = {}) {
  const raw = String(rawTaf || '').replace(/\s+/g, ' ').trim();
  const resultBase = {
    icao: null,
    issueTime: null,
    validityStart: null,
    validityEnd: null,
    amendmentType: null,
    status: 'malformed',
    prevailingTimeline: [],
    overlays: [],
    raw
  };

  if (!raw.startsWith('TAF ')) return resultBase;

  const tokens = raw.split(' ');
  let cursor = 1;
  let amendmentType = null;

  if (tokens[cursor] === 'AMD' || tokens[cursor] === 'COR') {
    amendmentType = tokens[cursor];
    cursor += 1;
  }

  const icao = tokens[cursor];
  if (!/^[A-Z]{4}$/.test(String(icao || ''))) {
    return resultBase;
  }
  cursor += 1;

  const issueToken = tokens[cursor];
  const issueDate = parseIssueToken(issueToken, options.referenceDate ? new Date(options.referenceDate) : new Date());
  if (!issueDate) return resultBase;
  cursor += 1;

  const validityToken = tokens[cursor];
  const validity = parseWindowToken(validityToken, issueDate);
  if (!validity) return resultBase;
  cursor += 1;

  const bodyTokens = tokens.slice(cursor);
  const bodyUpper = bodyTokens.map(token => token.toUpperCase());

  let status = 'valid';
  if (bodyUpper.includes('NIL')) status = 'nil';
  if (bodyUpper.includes('CNL')) status = 'cancelled';

  const parsed = (status === 'valid')
    ? parseBodyGroups(bodyTokens, validity.validFrom, validity.validTo)
    : { prevailingTimeline: [], overlays: [] };

  return {
    icao,
    issueTime: toIsoUtc(issueDate),
    validityStart: toIsoUtc(validity.validFrom),
    validityEnd: toIsoUtc(validity.validTo),
    amendmentType,
    status,
    prevailingTimeline: parsed.prevailingTimeline,
    overlays: parsed.overlays,
    raw
  };
}

function isWithinWindow(isoTime, fromIso, toIso) {
  const t = new Date(isoTime).getTime();
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Number.isFinite(t) && Number.isFinite(from) && Number.isFinite(to) && t >= from && t < to;
}

function selectTafConditionsAtEta(parsedTaf, etaIso) {
  const timeline = Array.isArray(parsedTaf?.prevailingTimeline) ? parsedTaf.prevailingTimeline : [];
  const overlays = Array.isArray(parsedTaf?.overlays) ? parsedTaf.overlays : [];

  if (!timeline.length) {
    return {
      prevailing: null,
      activeOverlays: [],
      becmgTransition: null,
      diagnostics: { reason: 'No prevailing timeline available.' }
    };
  }

  const sorted = [...timeline].sort((a, b) => new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime());
  let prevailing = sorted[0];
  let becmgTransition = null;

  for (const entry of sorted) {
    const from = new Date(entry.validFrom).getTime();
    const to = new Date(entry.validTo).getTime();
    const eta = new Date(etaIso).getTime();
    if (!Number.isFinite(eta) || !Number.isFinite(from) || !Number.isFinite(to)) continue;

    if (entry.type === 'FM' && eta >= from) {
      prevailing = entry;
      continue;
    }

    if (entry.type === 'BECMG') {
      if (eta >= to) {
        prevailing = { ...entry, type: 'INITIAL' };
      } else if (eta >= from && eta < to) {
        becmgTransition = {
          validFrom: entry.validFrom,
          validTo: entry.validTo,
          preChange: prevailing,
          target: entry,
          message: 'ETA is inside BECMG transition window.'
        };
      }
    }
  }

  const activeOverlays = overlays.filter(overlay => isWithinWindow(etaIso, overlay.validFrom, overlay.validTo));

  return {
    prevailing,
    activeOverlays,
    becmgTransition,
    diagnostics: {
      status: parsedTaf?.status || 'unknown',
      amendmentType: parsedTaf?.amendmentType || null,
      overlayCount: activeOverlays.length
    }
  };
}

module.exports = {
  parseTafSemantic,
  selectTafConditionsAtEta
};
