const test = require('node:test');
const assert = require('node:assert/strict');

const { parseTafSemantic, selectTafConditionsAtEta } = require('../tafSemanticParser.js');
const { TAF_FIXTURES } = require('./fixtures/tafFixtures.js');

function parseFixture(key) {
  const fixture = TAF_FIXTURES[key];
  return parseTafSemantic(fixture.raw, { referenceDate: fixture.referenceDate });
}

test('1. simple prevailing TAF only', () => {
  const parsed = parseFixture('simplePrevailing');
  assert.equal(parsed.status, 'valid');
  assert.equal(parsed.icao, 'NZCH');
  assert.ok(parsed.issueTime);
  assert.ok(parsed.validityStart);
  assert.ok(parsed.validityEnd);
  assert.equal(parsed.prevailingTimeline.length, 1);
  assert.equal(parsed.prevailingTimeline[0].type, 'INITIAL');
  assert.equal(parsed.overlays.length, 0);
  assert.equal(parsed.prevailingTimeline[0].raw, '22010KT 9999 SCT030');
});

test('2. one FM group replaces prevailing timeline entry', () => {
  const parsed = parseFixture('oneFm');
  const fm = parsed.prevailingTimeline.find(entry => entry.type === 'FM');
  assert.ok(fm);
  assert.equal(parsed.prevailingTimeline.length, 2);
  assert.ok(fm.validFrom.endsWith(':00.000Z'));
  assert.equal(fm.wind, '32018KT');
});

test('3. multiple FM groups are retained in order', () => {
  const parsed = parseFixture('multipleFm');
  const fms = parsed.prevailingTimeline.filter(entry => entry.type === 'FM');
  assert.equal(fms.length, 2);
  assert.ok(new Date(fms[0].validFrom) < new Date(fms[1].validFrom));
});

test('4. one BECMG group is preserved with transition window', () => {
  const parsed = parseFixture('oneBecmg');
  const becmg = parsed.prevailingTimeline.find(entry => entry.type === 'BECMG');
  assert.ok(becmg);
  assert.ok(becmg.validFrom);
  assert.ok(becmg.validTo);
  assert.equal(becmg.wind, '33018KT');
  assert.equal(becmg.visibility, '5000');
});

test('5. ETA before BECMG uses pre-change prevailing', () => {
  const parsed = parseFixture('oneBecmg');
  const selected = selectTafConditionsAtEta(parsed, '2026-08-02T17:00:00.000Z');
  assert.equal(selected.prevailing.type, 'INITIAL');
  assert.equal(selected.becmgTransition, null);
});

test('6. ETA inside BECMG returns transition diagnostics', () => {
  const parsed = parseFixture('oneBecmg');
  const selected = selectTafConditionsAtEta(parsed, '2026-08-02T19:00:00.000Z');
  assert.ok(selected.becmgTransition);
  assert.equal(selected.becmgTransition.target.type, 'BECMG');
  assert.equal(selected.becmgTransition.preChange.type, 'INITIAL');
});

test('7. ETA after BECMG uses post-change target', () => {
  const parsed = parseFixture('oneBecmg');
  const selected = selectTafConditionsAtEta(parsed, '2026-08-02T21:00:00.000Z');
  assert.equal(selected.prevailing.wind, '33018KT');
});

test('8. TEMPO remains overlay', () => {
  const parsed = parseFixture('tempoOverlay');
  assert.equal(parsed.overlays.length, 1);
  assert.equal(parsed.overlays[0].type, 'TEMPO');
  assert.equal(parsed.overlays[0].probability, null);
});

test('9. PROB30 overlay retains probability', () => {
  const parsed = parseFixture('prob30Overlay');
  assert.equal(parsed.overlays[0].type, 'PROB30');
  assert.equal(parsed.overlays[0].probability, 30);
});

test('10. PROB40 overlay retains probability', () => {
  const parsed = parseFixture('prob40Overlay');
  assert.equal(parsed.overlays[0].type, 'PROB40');
  assert.equal(parsed.overlays[0].probability, 40);
});

test('11. PROB30 TEMPO is preserved as dedicated overlay type', () => {
  const parsed = parseFixture('prob30Tempo');
  assert.equal(parsed.overlays[0].type, 'PROB30_TEMPO');
  assert.equal(parsed.overlays[0].probability, 30);
});

test('12. PROB40 TEMPO is preserved as dedicated overlay type', () => {
  const parsed = parseFixture('prob40Tempo');
  assert.equal(parsed.overlays[0].type, 'PROB40_TEMPO');
  assert.equal(parsed.overlays[0].probability, 40);
});

test('13. CAVOK is represented in prevailing entry', () => {
  const parsed = parseFixture('cavok');
  assert.equal(parsed.prevailingTimeline[0].cavok, true);
  assert.equal(parsed.prevailingTimeline[0].visibility, 'CAVOK');
});

test('14. NSC is represented in prevailing entry', () => {
  const parsed = parseFixture('nsc');
  assert.equal(parsed.prevailingTimeline[0].nsc, true);
});

test('15. NIL status is parsed', () => {
  const parsed = parseFixture('nil');
  assert.equal(parsed.status, 'nil');
  assert.equal(parsed.prevailingTimeline.length, 0);
});

test('16. CNL status is parsed', () => {
  const parsed = parseFixture('cnl');
  assert.equal(parsed.status, 'cancelled');
  assert.equal(parsed.prevailingTimeline.length, 0);
});

test('17. AMD amendment is recorded', () => {
  const parsed = parseFixture('amd');
  assert.equal(parsed.amendmentType, 'AMD');
  assert.equal(parsed.status, 'valid');
});

test('18. COR amendment is recorded', () => {
  const parsed = parseFixture('cor');
  assert.equal(parsed.amendmentType, 'COR');
  assert.equal(parsed.status, 'valid');
});

test('19. midnight rollover parses FM on next day correctly', () => {
  const parsed = parseFixture('midnightRollover');
  const fm = parsed.prevailingTimeline.find(entry => entry.type === 'FM');
  assert.ok(fm.validFrom.startsWith('2026-08-03T00:00:00.000Z'));
});

test('20. month rollover validity is handled', () => {
  const parsed = parseFixture('monthRollover');
  assert.ok(parsed.validityStart.startsWith('2026-08-31T23:00:00.000Z'));
  assert.ok(parsed.validityEnd.startsWith('2026-09-01T06:00:00.000Z'));
});

test('21. malformed TAF fails safely', () => {
  const parsed = parseFixture('malformed');
  assert.equal(parsed.status, 'malformed');
  assert.equal(parsed.icao, null);
});

test('22. overlapping TEMPO and PROB overlays remain independent', () => {
  const parsed = parseFixture('overlappingTempoProb');
  assert.equal(parsed.overlays.length, 2);
  const types = parsed.overlays.map(entry => entry.type).sort();
  assert.deepEqual(types, ['PROB40', 'TEMPO']);

  const selected = selectTafConditionsAtEta(parsed, '2026-08-02T19:00:00.000Z');
  assert.equal(selected.activeOverlays.length, 2);
});

test('supports DDHHMM validity and overlay windows', () => {
  const parsed = parseFixture('ddhhmmWindow');
  assert.ok(parsed.validityStart.startsWith('2026-08-02T12:30:00.000Z'));
  assert.ok(parsed.validityEnd.startsWith('2026-08-03T12:00:00.000Z'));
  assert.ok(parsed.overlays[0].validFrom.startsWith('2026-08-02T15:30:00.000Z'));
});

test('NOSIG token is retained in raw diagnostics and does not change status', () => {
  const parsed = parseFixture('nosig');
  assert.equal(parsed.status, 'valid');
  assert.ok(parsed.prevailingTimeline[0].raw.includes('NOSIG'));
});
