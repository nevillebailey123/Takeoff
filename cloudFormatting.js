function normalizeCloudText(value) {
  return String(value || '').trim().toUpperCase();
}

function isAviationSpecial(text) {
  return text === 'CAVOK' || text === 'NSC' || text === 'NIL';
}

function roundedAmsl(sample) {
  return Number.isFinite(sample?.cloudBaseAmslFt) ? Math.round(sample.cloudBaseAmslFt) : null;
}

function roundedAglFromAmsl(amslFt, elevationFt) {
  if (!Number.isFinite(amslFt) || !Number.isFinite(elevationFt)) return null;
  return Math.round((amslFt - elevationFt) / 100) * 100;
}

function buildCloudPresentation(sample) {
  const cloudText = normalizeCloudText(sample?.cloudDisplay);
  const amslFt = roundedAmsl(sample);

  if (cloudText === 'CAVOK' || cloudText === 'NSC') {
    return {
      kind: 'special',
      cloudText,
      amslFt: null,
      aglFt: null,
      terrainFt: null,
      clearanceFt: null
    };
  }

  if (sample?.source === 'Forecast' && sample?.cloudState === 'nil') {
    return {
      kind: 'special',
      cloudText: 'NIL',
      amslFt: null,
      aglFt: null,
      terrainFt: null,
      clearanceFt: null
    };
  }

  if (Number.isFinite(amslFt)) {
    const isAirport = sample?.type === 'airport';
    const aglFt = isAirport ? roundedAglFromAmsl(amslFt, sample?.elevationFt) : null;
    return {
      kind: 'numeric',
      cloudText: null,
      amslFt,
      aglFt,
      terrainFt: Number.isFinite(sample?.terrainClearance?.terrainWithin5NmFt) ? Math.round(sample.terrainClearance.terrainWithin5NmFt) : null,
      clearanceFt: Number.isFinite(sample?.terrainClearance?.terrainClearanceFt) ? Math.round(sample.terrainClearance.terrainClearanceFt) : null
    };
  }

  if (isAviationSpecial(cloudText)) {
    return {
      kind: 'special',
      cloudText,
      amslFt: null,
      aglFt: null,
      terrainFt: null,
      clearanceFt: null
    };
  }

  return {
    kind: 'text',
    cloudText: sample?.cloudDisplay || 'NIL',
    amslFt: null,
    aglFt: null,
    terrainFt: null,
    clearanceFt: null
  };
}

export function formatCloud(sample, { surface = 'card' } = {}) {
  const presentation = buildCloudPresentation(sample);

  if (surface === 'banner') {
    return Number.isFinite(presentation.amslFt) ? `${presentation.amslFt} ft` : null;
  }

  let value;
  if (presentation.kind === 'numeric') {
    value = Number.isFinite(presentation.aglFt)
      ? `${presentation.amslFt} (${presentation.aglFt} AGL)`
      : `${presentation.amslFt}`;
  } else {
    value = presentation.cloudText;
  }

  if (surface === 'card' || surface === 'briefing') return `Cloud ${value}`;
  return value;
}

export function formatCloudForCard(sample) {
  return formatCloud(sample, { surface: 'card' });
}

export function formatCloudForPopup(sample) {
  return formatCloud(sample, { surface: 'popup' });
}

export function numericCloudBaseForComparison(sample) {
  const presentation = buildCloudPresentation(sample);
  return Number.isFinite(presentation.amslFt) ? presentation.amslFt : null;
}

export function formatCloudForBanner(sample) {
  return formatCloud(sample, { surface: 'banner' });
}
