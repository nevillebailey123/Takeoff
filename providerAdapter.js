const ACTIVE_PROVIDER = 'aviationweather';

const providers = {
  aviationweather: {
    metarUrl(icaoCodes) {
      const params = new URLSearchParams({ ids: icaoCodes.join(','), format: 'json' });
      return `https://aviationweather.gov/api/data/metar?${params.toString()}`;
    },
    tafUrl(icaoCodes) {
      const params = new URLSearchParams({ ids: icaoCodes.join(','), format: 'json' });
      return `https://aviationweather.gov/api/data/taf?${params.toString()}`;
    },
    metarRows(payload) {
      return Array.isArray(payload) ? payload : [];
    },
    tafRows(payload) {
      return Array.isArray(payload) ? payload : [];
    },
    normalizeMetarRow(row) {
      const code = String(row?.icaoId || '').toUpperCase();
      if (!code) return null;

      return {
        icaoId: code,
        receiptTime: row?.receiptTime || null,
        obsTime: Number.isFinite(Number(row?.obsTime)) ? Number(row.obsTime) : null,
        reportTime: row?.reportTime || null,
        temp: Number.isFinite(Number(row?.temp)) ? Number(row.temp) : null,
        dewp: Number.isFinite(Number(row?.dewp)) ? Number(row.dewp) : null,
        wdir: Number.isFinite(Number(row?.wdir)) ? Number(row.wdir) : null,
        wspd: Number.isFinite(Number(row?.wspd)) ? Number(row.wspd) : null,
        wgst: Number.isFinite(Number(row?.wgst)) ? Number(row.wgst) : null,
        visib: row?.visib ?? null,
        altim: Number.isFinite(Number(row?.altim)) ? Number(row.altim) : null,
        rawOb: row?.rawOb || '',
        clouds: Array.isArray(row?.clouds)
          ? row.clouds.map(layer => ({
              cover: String(layer?.cover || '').toUpperCase() || null,
              base: Number.isFinite(Number(layer?.base)) ? Number(layer.base) : null
            }))
          : []
      };
    },
    normalizeTafRow(row) {
      const code = String(row?.icaoId || '').toUpperCase();
      if (!code) return null;

      const fcsts = Array.isArray(row?.fcsts)
        ? row.fcsts.map(group => ({
            timeFrom: Number.isFinite(Number(group?.timeFrom)) ? Number(group.timeFrom) : null,
            timeTo: Number.isFinite(Number(group?.timeTo)) ? Number(group.timeTo) : null,
            fcstChange: group?.fcstChange || null,
            wdir: Number.isFinite(Number(group?.wdir)) ? Number(group.wdir) : null,
            wspd: Number.isFinite(Number(group?.wspd)) ? Number(group.wspd) : null,
            wgst: Number.isFinite(Number(group?.wgst)) ? Number(group.wgst) : null,
            visib: group?.visib ?? null,
            altim: Number.isFinite(Number(group?.altim)) ? Number(group.altim) : null,
            clouds: Array.isArray(group?.clouds)
              ? group.clouds.map(layer => ({
                  cover: String(layer?.cover || '').toUpperCase() || null,
                  base: Number.isFinite(Number(layer?.base)) ? Number(layer.base) : null,
                  type: layer?.type || null
                }))
              : []
          }))
        : [];

      return {
        icaoId: code,
        issueTime: row?.issueTime || null,
        bulletinTime: row?.bulletinTime || null,
        rawTAF: row?.rawTAF || '',
        fcsts
      };
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
