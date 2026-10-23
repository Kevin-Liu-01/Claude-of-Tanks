// The map-revival lane (2026-10-07, Sirocco Wadi round 1; gauntlet wave 235 on the PR head: "a bleached cream-beige of
// soft, low, banded mesas and pale sand", the dunes "soft cream mounds"): the sand landforms' own forms (duneForms.ts).
//
//   1. a seif is a sharp crest wandering across its ridge's line: the slope changes side over the crest within a metre,
//      the slip face stands steeper than the back but a hull can still cross it (under 21°), and the crest's height
//      swells and dips along it; a landform and its turn about the centre are each other's rotation exactly;
//   2. a star dune is a peak with sharp-crested arms: its arms reach the whole radius on as many bearings as it has arms,
//      its flanks between them fall short of it, and its broad base keeps the smooth knoll's mass (the ground over 3 m
//      within a tenth of it), so the sight it blocks is the knoll's;
//   3. Sirocco Wadi's draa and its two star dunes carry the forms on the real ground: across a draa the terrain kinks at
//      the seif's crest (the ground's slope turns by over 9° within a metre and a half either side of it, on the plain's
//      own relief, which only tilts it; the smooth ridge it replaces turns by under 5° there); only Sirocco Wadi authors
//      dune forms.
import assert from 'node:assert/strict';

const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const { seifHeight, starDuneHeight } = await import('./duneForms.ts');
const { getMapConfig, MAP_IDS } = await import('./maps/index.ts');
const { createHeightField } = await import('./terrain.ts');
const deg = (s) => Math.atan(s) * 180 / Math.PI;

// 1. a seif
const seif = { x: 150, z: 22, height: 5.5, length: 170, width: 62, dune: { kind: 'seif' } };
const twin = { ...seif, x: -150, z: -22 };
let maxDiff = 0, steepest = 0, sharp = 0, crests = 0;
const crestHeights = [];
for (let lx = -60; lx <= 60; lx += 2) {
  // the crest on this station: the highest point across
  let best = -1, at = 0;
  for (let lz = -62; lz <= 62; lz += 0.1) { const h = seifHeight(seif, lx, lz, 1); if (h > best) { best = h; at = lz; } }
  crestHeights.push(best);
  const left = (seifHeight(seif, lx, at, 1) - seifHeight(seif, lx, at - 1.5, 1)) / 1.5;
  const right = (seifHeight(seif, lx, at, 1) - seifHeight(seif, lx, at + 1.5, 1)) / 1.5;
  crests++;
  if (deg(left) > 4 && deg(right) > 4) sharp++;
  for (let lz = -62; lz <= 62; lz += 0.5) {
    maxDiff = Math.max(maxDiff, Math.abs(seifHeight(seif, lx, lz, 1) - seifHeight(twin, -lx, -lz, 1)));
    steepest = Math.max(steepest, Math.abs(seifHeight(seif, lx, lz + 0.25, 1) - seifHeight(seif, lx, lz - 0.25, 1)) / 0.5);
  }
}
assert.ok(maxDiff < 1e-9, `a seif and its turn about the centre are each other's rotation (${maxDiff})`);
assert.ok(sharp === crests, `the crest is sharp at every station (${sharp} of ${crests})`);
assert.ok(deg(steepest) < 21 && deg(steepest) > 12, `the slip face stands steep, a hull still crosses it (${deg(steepest).toFixed(1)}°)`);
const cMin = Math.min(...crestHeights), cMax = Math.max(...crestHeights);
assert.ok(cMax - cMin > 0.6, `the crest swells and dips along the ridge (${cMin.toFixed(2)}-${cMax.toFixed(2)} m)`);

// 2. a star dune
const star = { x: 128, z: 148, rx: 96, rz: 82, height: 27, dune: { kind: 'star', arms: 4 } };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let reachArms = 0, area = 0, areaKnoll = 0;
for (let k = 0; k < 360; k++) {
  const th = k * Math.PI / 180;
  let reach = 0;
  for (let r = 0; r < 1; r += 0.01) if (starDuneHeight(star, Math.cos(th) * r * 96, Math.sin(th) * r * 82) > 27 * 0.5 * 0.02 + 0.5 * 27 * (1 - smooth(0.12, 1, r)) ** 2 * (3 - 2 * (1 - smooth(0.12, 1, r)))) reach = r;
  if (reach > 0.9) reachArms++;
}
for (let lx = -100; lx <= 100; lx += 1) for (let lz = -90; lz <= 90; lz += 1) {
  if (starDuneHeight(star, lx, lz) > 3) area++;
  const q = Math.hypot(lx / 96, lz / 82), w = 1 - smooth(0.12, 1, q);
  if (27 * w * w * (3 - 2 * w) > 3) areaKnoll++;
}
assert.ok(reachArms >= 4 && reachArms < 120, `four arms reach the whole radius, the flanks between them do not (${reachArms} of 360 bearings)`);
assert.ok(Math.abs(area - areaKnoll) / areaKnoll < 0.1, `the base keeps the knoll's mass (${area} against ${areaKnoll} m² over 3 m)`);
assert.ok(Math.abs(starDuneHeight(star, 0, 0) - 27) < 1.5, 'the peak stands at the height');

// 3. on the map
const cfg = getMapConfig('desert');
const forms = cfg.terrain.landforms.filter((l) => l.dune);
assert.equal(forms.filter((l) => l.dune.kind === 'star').length, 2, 'the Erg Dune and the Gara Dune are star dunes');
assert.ok(forms.filter((l) => l.dune.kind === 'seif').length >= 12, 'the draa and the Erg Dune\'s arms are seifs');
for (const id of MAP_IDS) if (id !== 'desert') assert.ok(!getMapConfig(id).terrain?.landforms?.some?.((l) => l.dune), `${id} authors no dune forms`);
const f = createHeightField(1337, cfg);
const smoothCfg = { ...cfg, terrain: { ...cfg.terrain, landforms: cfg.terrain.landforms.map((l) => (l.dune?.kind === 'seif' ? { ...l, dune: undefined } : l)) } };
const fSmooth = createHeightField(1337, smoothCfg);
const draa = cfg.terrain.landforms.find((l) => l.kind === 'ridge' && l.x === -150 && l.z === -22);
const yaw = draa.yawDeg * Math.PI / 180, ax = [Math.cos(yaw), Math.sin(yaw)], cr = [-Math.sin(yaw), Math.cos(yaw)];
const { sampleLandformHeight } = await import('./terrain.ts');
const smoothDraa = { ...draa, dune: undefined };
let sharpOnGround = 0, smoothFlat = 0, stations = 0;
for (let s = -40; s <= 40; s += 10) {
  // each ridge's own crest on this station (the highest point of its section), then the ground's kink there
  const crestOf = (form) => {
    let best = -1e9, at = 0;
    for (let c = -50; c <= 50; c += 0.25) { const h = sampleLandformHeight(form, draa.x + ax[0] * s + cr[0] * c, draa.z + ax[1] * s + cr[1] * c); if (h > best) { best = h; at = c; } }
    return at;
  };
  const kinkOf = (field, at) => {
    const h = (c) => field.getHeightAt(draa.x + ax[0] * s + cr[0] * c, draa.z + ax[1] * s + cr[1] * c);
    return deg((h(at) - h(at - 1.5)) / 1.5) + deg((h(at) - h(at + 1.5)) / 1.5);
  };
  stations++;
  if (kinkOf(f, crestOf(draa)) > 9) sharpOnGround++;
  if (Math.abs(kinkOf(fSmooth, crestOf(smoothDraa))) < 5) smoothFlat++;
}
assert.ok(sharpOnGround >= stations * 0.8, `the ground kinks at the draa's crest (${sharpOnGround} of ${stations} stations)`);
assert.ok(smoothFlat >= stations * 0.8, `where the smooth ridge's own crest does not (${smoothFlat} of ${stations} stations under 5°)`);
console.log(`duneForms: seif slip face ${deg(steepest).toFixed(1)}°, crest ${cMin.toFixed(2)}-${cMax.toFixed(2)} m; star arms on ${reachArms} bearings, ${area} m² over 3 m (knoll ${areaKnoll}); the ground kinked at the draa's crest at ${sharpOnGround} of ${stations}`);
console.log('duneForms selftest ok');
