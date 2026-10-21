// cloudBase.selftest.mjs — a map's cloud base and cover as Clouds 2.0 draws them, and the far country's cap (2026-10-15,
// the SKY lane; HZ.14): the ring's far range stands into a deck with breaks (the cloud covers it where it is) and is
// capped only under a closed deck, at half its depth; the legacy cap (0.82 of the lowest authored cloud altitude) is gone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLOUD_BASE_NO_CAP_M, resolveCloudBase, resolveCloudCover } from './cloudBase.ts';
import { CLOUD_DECK_TUNE, cloudShellCover } from './cloudLayers.ts';
import { resolveFarRangeAmp } from '../world/horizonFarRange.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';

// Frosthollow: a closed overcast since the 10-13 ruling's enforcement (Cinder Junction on cumulus 2026-10-16, Ironworks 2026-10-18) (a deck is closed or it
// is cumulus: cloudsBan.selftest) — their far country stands to half the deck's depth, over the legacy 0.82 of its base
const far = { ampM: 900 };
for (const id of ['winter']) {
  const cfg = getMapConfig(id);
  const b = resolveCloudBase(cfg);
  assert.equal(b.deck, true, `${id}: a deck`);
  assert.equal(b.closed, true, `${id}: closed (cover ${b.cover.toFixed(2)})`);
  assert.equal(b.capM, b.baseM + 0.5 * (b.topM - b.baseM));
  assert.ok(b.capM > 0.82 * b.baseM, `${id}: the cap (${b.capM} m) over the legacy one (${Math.round(0.82 * b.baseM)} m)`);
  assert.equal(resolveFarRangeAmp(far, b.capM / 0.82), Math.min(far.ampM, b.capM), `${id}: the far peaks rise into the deck's lower half`);
  assert.ok(b.baseM < 1000 && b.topM > b.baseM, `${id}: a low deck (${b.baseM} m)`);
}
// Cinder Junction's hazy summer cumulus and Ironworks' (2026-10-18, the 228 census): their far country uncapped
for (const id of ['railyard', 'foundry']) {
  const b = resolveCloudBase(getMapConfig(id));
  assert.ok(!b.deck && !b.closed && b.capM === CLOUD_BASE_NO_CAP_M, `${id}: cumulus, no cap`);
  assert.equal(resolveFarRangeAmp(far, CLOUD_BASE_NO_CAP_M), far.ampM);
}
// a closed deck caps the far country at half its depth, never a flat top under its base
{
  const cfg = { clouds: { regime: 'overcast-stratus', coverage: 0.94, baseM: 600, thicknessM: 330 } };
  const b = resolveCloudBase(cfg);
  assert.ok(cloudShellCover(0.94, true) >= 1, 'an overcast at 0.94 closes its shell');
  assert.equal(b.closed, true);
  assert.equal(b.capM, 600 + 165);
  assert.equal(resolveFarRangeAmp(far, b.capM / 0.82), 765, 'the far range stays under half the closed deck\'s depth');
}
// a cumulus sky never caps; the sky block alone caps only its legacy overcast
assert.equal(resolveCloudBase({ clouds: { regime: 'fair-weather-cumulus' } }).capM, CLOUD_BASE_NO_CAP_M);
assert.equal(resolveCloudBase({ sky: { cloudAltM: 300, cloudOpacity: 1, cloudOpacity2: 0.95, turbidity: 9 } }).closed, true, 'the old layer\'s overcast');
assert.equal(resolveCloudBase({ sky: { cloudOpacity: 0.85, cloudOpacity2: 0.5, turbidity: 4 } }).capM, CLOUD_BASE_NO_CAP_M);
assert.equal(resolveCloudBase(null).capM, CLOUD_BASE_NO_CAP_M);
// every map: a cover in 0..1, the cover helper the same; the closed decks listed
const closed = [];
for (const id of MAP_IDS) {
  const cfg = getMapConfig(id);
  const b = resolveCloudBase(cfg);
  assert.ok(b.cover >= 0 && b.cover <= 1 && Number.isFinite(b.baseM) && b.topM >= b.baseM, `${id}: a sane base`);
  assert.equal(resolveCloudCover(cfg), b.cover);
  if (b.closed) closed.push(`${id} (${b.baseM}-${b.topM} m, cap ${b.capM} m)`);
}
assert.equal(CLOUD_DECK_TUNE.CLOUD_DECK_COVER, 1, 'the render tune leaves a deck\'s cover (no broken deck: cloudsBan.selftest)');
// the ring reads it (horizon.ts), the legacy min over the authored altitudes gone
const horizon = readFileSync(new URL('../world/maps/horizon.ts', import.meta.url), 'utf8');
assert.match(horizon, /const cloudBase = resolveCloudBase\(cfg as Parameters<typeof resolveCloudBase>\[0\]\);\s*const deckBaseM = cloudBase\.closed \? cloudBase\.capM \/ 0\.82 : CLOUD_BASE_NO_CAP_M;/);
assert.doesNotMatch(horizon, /cfg\?\.sky\?\.cloudAltM \?\? Infinity/, 'the legacy cap is gone');
console.log(`cloudBase.selftest: Frosthollow capped at half its closed deck's depth, Cinder Junction and Ironworks uncapped; closed decks capped at half their depth: ${closed.join(', ') || 'none'} PASS`);
