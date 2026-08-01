const statusLabel = status => ({ good: 'GOOD', review: 'REVIEW', caution: 'CAUTION', poor: 'POOR', unknown: 'UNKNOWN' }[status]);

export function populateDaySelect(select) {
  select.innerHTML = '';
  const now = new Date();
  for (let offset = 0; offset < 3; offset += 1) {
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
  const lowestCloud = comparable.filter(x => Number.isFinite(x.sample.cloudBaseAglFt)).sort((a,b) => a.sample.cloudBaseAglFt - b.sample.cloudBaseAglFt)[0];
  const strongestWind = comparable.sort((a,b) => Math.max(b.sample.windKt,b.sample.gustKt) - Math.max(a.sample.windKt,a.sample.gustKt))[0];
  const lowestVis = comparable.filter(x => Number.isFinite(x.sample.visibilityKm)).sort((a,b) => a.sample.visibilityKm - b.sample.visibilityKm)[0];
  const candidates = [
    lowestCloud && { label: 'LOWEST CLOUD', value: `${lowestCloud.sample.cloudBaseAmslFt ?? '—'}${Number.isFinite(lowestCloud.sample.cloudBaseAglFt) ? ` (${lowestCloud.sample.cloudBaseAglFt})` : ''}`, ...lowestCloud },
    lowestVis && { label: 'LOWEST VISIBILITY', value: `${lowestVis.sample.visibilityKm.toFixed(0)} KM`, ...lowestVis },
    strongestWind && { label: 'STRONGEST WIND', value: `${String(strongestWind.sample.windDirection).padStart(3,'0')}/${strongestWind.sample.windKt}${strongestWind.sample.gustKt > strongestWind.sample.windKt ? ` G${strongestWind.sample.gustKt}` : ''}`, ...strongestWind }
  ].filter(Boolean);
  const chosen = candidates[0];
  if (!chosen) { container.innerHTML = ''; return; }
  container.innerHTML = `<button type="button" class="limiting-banner" id="limitingButton"><strong>${chosen.label}: ${chosen.sample.name}</strong><span>${chosen.value}</span></button>`;
  container.querySelector('#limitingButton').addEventListener('click', () => onSelect(chosen.index));
}

export function renderWeatherCards(container, samples, onSelect) {
  container.innerHTML = samples.map((sample, index) => {
    const cloud = sample.source === 'METAR'
      ? (sample.cloudText || '—')
      : Number.isFinite(sample.cloudBaseAmslFt)
        ? (sample.automatic
            ? `${sample.cloudBaseAmslFt}`
            : `${sample.cloudBaseAmslFt} (${Number.isFinite(sample.cloudBaseAglFt) ? sample.cloudBaseAglFt : '—'})`)
        : '—';
    const visibility = sample.source === 'METAR'
      ? (sample.visibilityText || '—')
      : Number.isFinite(sample.visibilityKm) ? (sample.visibilityKm >= 20 ? '>20 KM' : `${Math.round(sample.visibilityKm)} KM`) : '—';
    const wind = sample.source === 'METAR' && sample.windText
      ? sample.windText
      : `${String(sample.windDirection).padStart(3,'0')}/${sample.windKt}${sample.gustKt > sample.windKt ? ` G${sample.gustKt}` : ''}`;
    const rain = sample.precipitationMm > .2 ? `${sample.precipitationMm.toFixed(1)} MM` : 'NIL';
    const source = sample.source || 'Forecast';
    const metarRows = sample.source === 'METAR' ? `
      <div class="weather-row"><span>🌡</span><strong>${Number.isFinite(sample.metarTempC) ? `${sample.metarTempC} C` : '—'}</strong></div>
      <div class="weather-row"><span>💧</span><strong>${Number.isFinite(sample.metarDewPointC) ? `${sample.metarDewPointC} C` : '—'}</strong></div>
      <div class="weather-row"><span>⚖</span><strong>${Number.isFinite(sample.metarQnhHpa) ? `${sample.metarQnhHpa} HPA` : '—'}</strong></div>
      <div class="weather-row"><span>🕒</span><strong>${sample.metarObsTime || '—'}</strong></div>` : '';
    return `<button type="button" class="weather-card card-${sample.status}" data-index="${index}">
      <h3>${sample.name.toUpperCase()}</h3>
      <div class="weather-row"><span>☁</span><strong>${cloud}</strong></div>
      <div class="weather-row"><span>👁</span><strong>${visibility}</strong></div>
      <div class="weather-row"><span>💨</span><strong>${wind}</strong></div>
      <div class="weather-row"><span>🌧</span><strong>${rain}</strong></div>
      ${metarRows}
      <div class="weather-row"><span>ⓘ</span><strong>Source: ${source}</strong></div>
    </button>`;
  }).join('');
  container.querySelectorAll('.weather-card').forEach(card => card.addEventListener('click', () => onSelect(Number(card.dataset.index))));
}

export function highlightCard(container, index) {
  container.querySelectorAll('.weather-card').forEach((card, i) => card.classList.toggle('active', i === index));
  const target = container.querySelector(`[data-index="${index}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}
