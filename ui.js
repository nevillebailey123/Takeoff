import { formatCloud, numericCloudBaseForComparison } from './cloudFormatting.js';

function stringifyValue(value) {
  if (value == null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function logRenderedTafCardDiagnostic(sample, rendered) {
  const diag = sample?.tafDiagnostics || null;
  const parserGroups = Array.isArray(diag?.parserGroups) ? diag.parserGroups : [];
  const selectedGroup = diag?.selectedGroup || null;
  const sourceSelection = sample?.sourceSelection || {};

  const consistencyOrigins = diag?.fieldConsistency?.origins || {
    cloud: 'unknown',
    visibility: 'unknown',
    wind: 'unknown',
    weather: 'unknown',
    rain: 'unknown',
    sourceLabel: 'unknown'
  };

  const integrityChecks = {
    displayedEqualsSample: {
      cloud: rendered.cloud === `Cloud ${stringifyValue(formatCloud(sample, { surface: 'card' }).replace(/^Cloud\s+/, ''))}` || rendered.cloud === formatCloud(sample, { surface: 'card' }),
      visibility: rendered.visibility === (sample.cavokReported ? '≥10 KM' : (sample.visibilityText || (Number.isFinite(sample.visibilityKm) ? `${Math.round(sample.visibilityKm)} KM` : '—'))),
      wind: rendered.wind === (sample.source === 'METAR' && sample.windText ? sample.windText : `${String(sample.windDirection).padStart(3, '0')}/${sample.windKt}${sample.gustKt > sample.windKt ? ` G${sample.gustKt}` : ''}`),
      rain: rendered.rain === (sample.precipitationMm > .2 ? `${sample.precipitationMm.toFixed(1)} MM` : 'NIL'),
      sourceLabel: rendered.source === (sample.sourceLabel || sample.source || 'Forecast')
    },
    oneSelectedGroupOnly: Boolean(diag?.checks?.valuesComeFromOneSelectedGroup),
    etaInsideSelectedGroup: Boolean(diag?.etaInsideSelectedGroup),
    noModelContamination: sample.source === 'TAF',
    noMetarContamination: sample.source === 'TAF',
    fallbackExplicitlyIdentified: !sourceSelection.fallbackUsed || String(rendered.source || '').includes(String(sample.reportingAirportIcao || ''))
  };

  const displayedEqualsParsed = Object.values(integrityChecks.displayedEqualsSample).every(Boolean);
  const mixedSourcesDetected = Boolean(diag?.fieldConsistency?.mixedSourcesDetected)
    || !integrityChecks.oneSelectedGroupOnly
    || !integrityChecks.noModelContamination
    || !integrityChecks.noMetarContamination;

  const normalizedGroups = parserGroups.map(group => ({
    type: group.type || null,
    start: group.startIso || null,
    end: group.endIso || null,
    wind: group.wind || null,
    visibility: group.visibility || null,
    weather: group.weather || [],
    cloud: group.cloud || [],
    rawText: group.rawText || ''
  }));

  console.info('[Takeoff TAF card diagnostic report]', {
    airport: {
      cardAirport: sample.name,
      icao: String(sample.code || '').toUpperCase(),
      etaUtc: diag?.etaIso || sample.pointEtaIso || null,
      etaNzt: diag?.etaNzt || null
    },
    sourceSelection: {
      ownAirport: sourceSelection.ownAirport,
      nearestAirport: sourceSelection.nearestAirport,
      fallbackUsed: sourceSelection.fallbackUsed,
      reasonSelected: sourceSelection.reasonSelected
    },
    rawTaf: {
      text: diag?.rawTaf || sample.metarRaw || '',
      issueTime: diag?.issueTimeIso || null,
      validityStart: diag?.validityStartIso || null,
      validityEnd: diag?.validityEndIso || null,
      status: diag?.status || null
    },
    parser: {
      groupCount: normalizedGroups.length,
      groups: normalizedGroups
    },
    etaSelection: {
      selectedGroup,
      whySelected: sourceSelection.reasonSelected || diag?.selection || null,
      rejectedGroups: diag?.selection?.rejected || []
    },
    finalDisplayValues: {
      cloud: rendered.cloud,
      visibility: rendered.visibility,
      wind: rendered.wind,
      weather: 'Not displayed on card',
      rain: rendered.rain,
      sourceLabel: rendered.source
    },
    consistencyCheck: {
      cloud: consistencyOrigins.cloud,
      visibility: consistencyOrigins.visibility,
      wind: consistencyOrigins.wind,
      weather: consistencyOrigins.weather,
      rain: consistencyOrigins.rain,
      sourceLabel: consistencyOrigins.sourceLabel,
      mixedSourcesDetected,
      mixedSourcesMessage: mixedSourcesDetected ? '*** MIXED SOURCES DETECTED ***' : null
    },
    integrityChecks: {
      displayedValuesExactlyEqualParsedValues: displayedEqualsParsed,
      displayedValuesComeFromOneSelectedTafGroup: integrityChecks.oneSelectedGroupOnly,
      etaFallsInsideSelectedGroup: integrityChecks.etaInsideSelectedGroup,
      noModelDataContamination: integrityChecks.noModelContamination,
      noMetarDataContamination: integrityChecks.noMetarContamination,
      noUnidentifiedFallbackContamination: integrityChecks.fallbackExplicitlyIdentified
    }
  });
}

export function populateDaySelect(select) {
  select.innerHTML = '';
  const now = new Date();
  for (let offset = 0; offset < 6; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const label = date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();
    const option = document.createElement('option');
    option.value = String(offset);
    option.textContent = offset === 0 ? `${label} (TODAY)` : label;
    select.appendChild(option);
  }
}

export function renderBriefingHeader(container, routeNames, distanceNm, etaMinutes, samples, forecastDate) {
  const hours = Math.floor(etaMinutes / 60);
  const minutes = Math.round(etaMinutes % 60);
  container.innerHTML = `
    <div class="briefing-header">
      <div class="briefing-route">${routeNames.join(' → ')}</div>
      <div class="briefing-meta">${Math.round(distanceNm)} NM • ETA ${hours} HR ${minutes} MIN • ${samples.length} WEATHER POINTS</div>
      <div class="briefing-meta">${forecastDate}</div>
    </div>`;
}

export function renderLimitingBanner(container, samples, onSelect) {
  const comparable = samples.map((sample, index) => ({ sample, index }));
  const lowestCloud = comparable
    .filter(item => Number.isFinite(numericCloudBaseForComparison(item.sample)))
    .sort((a, b) => numericCloudBaseForComparison(a.sample) - numericCloudBaseForComparison(b.sample))[0];

  if (!lowestCloud) {
    container.innerHTML = `<div class="limiting-banner card-unknown"><strong>NO SIGNIFICANT CLOUD BASE REPORTED</strong></div>`;
    return;
  }

  const value = formatCloud(lowestCloud.sample, { surface: 'banner' }) || '—';
  container.innerHTML = `<button type="button" class="limiting-banner card-${lowestCloud.sample.status || 'unknown'}" id="limitingButton"><strong>LOWEST CLOUD BASE: ${lowestCloud.sample.name}</strong><span>${value}</span></button>`;
  container.querySelector('#limitingButton').addEventListener('click', () => onSelect(lowestCloud.index));
}

export function renderWeatherCards(container, samples, onSelect) {
  container.innerHTML = samples.map((sample, index) => {
    const sampleIndex = Number.isInteger(sample.cardSampleIndex) ? sample.cardSampleIndex : index;
    const cloud = formatCloud(sample, { surface: 'card' });
    const visibility = sample.cavokReported
      ? '≥10 KM'
      : sample.source === 'METAR' || sample.source === 'TAF'
        ? (sample.visibilityText || (Number.isFinite(sample.visibilityKm) ? `${Math.round(sample.visibilityKm)} KM` : '—'))
        : Number.isFinite(sample.visibilityKm)
          ? (sample.visibilityKm >= 20 ? '>20 KM' : `${Math.round(sample.visibilityKm)} KM`)
          : '—';
    const wind = sample.source === 'METAR' && sample.windText
      ? sample.windText
      : `${String(sample.windDirection).padStart(3,'0')}/${sample.windKt}${sample.gustKt > sample.windKt ? ` G${sample.gustKt}` : ''}`;
    const rain = sample.precipitationMm > .2 ? `${sample.precipitationMm.toFixed(1)} MM` : 'NIL';
    const source = sample.sourceLabel || sample.source || 'Forecast';
    if (sample.source === 'TAF' && /^TAF\s+[A-Z]{4}\b/.test(String(source))) {
      logRenderedTafCardDiagnostic(sample, {
        cloud,
        visibility,
        wind,
        rain,
        source
      });
    }
    const metarRows = sample.source === 'METAR' ? `
      <div class="weather-row"><span>🌡</span><strong>${Number.isFinite(sample.metarTempC) ? `${sample.metarTempC} C` : '—'}</strong></div>
      <div class="weather-row"><span>💧</span><strong>${Number.isFinite(sample.metarDewPointC) ? `${sample.metarDewPointC} C` : '—'}</strong></div>
      <div class="weather-row"><span>⚖</span><strong>${Number.isFinite(sample.metarQnhHpa) ? `${sample.metarQnhHpa} HPA` : '—'}</strong></div>
      <div class="weather-row"><span>🕒</span><strong>${sample.metarObsTime || '—'}</strong></div>` : '';
    return `<button type="button" class="weather-card card-${sample.status}" data-index="${sampleIndex}">
      <h3>${sample.name.toUpperCase()}</h3>
      <div class="weather-row"><span>☁</span><strong>${cloud}</strong></div>
      <div class="weather-row"><span>👁</span><strong>${visibility}</strong></div>
      <div class="weather-row"><span>💨</span><strong>${wind}</strong></div>
      <div class="weather-row"><span>🌧</span><strong>${rain}</strong></div>
      ${metarRows}
      <div class="weather-row"><span>ⓘ</span><strong>${source}</strong></div>
    </button>`;
  }).join('');
  container.querySelectorAll('.weather-card').forEach(card => card.addEventListener('click', () => onSelect(Number(card.dataset.index))));
}

export function highlightCard(container, index) {
  container.querySelectorAll('.weather-card').forEach(card => card.classList.toggle('active', Number(card.dataset.index) === index));
  const target = container.querySelector(`[data-index="${index}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}
