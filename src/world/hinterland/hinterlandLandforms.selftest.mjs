// HL-2 (the horizons stream, 2026-10-13; B-architecture §4.5–§4.6): the near ranges' landform primitives and the far
// country's sectors, so mountains have real form — pure, on synthetic specs:
//   - each primitive keeps its law: a dike's level crown, an escarpment's stair rising monotone to its plateau with its
//     ledges, a mesa's flat cap over its caprock cliff, a jebel's sheer wall, a cone's crater, a caldera's rim over its
//     floor, a canyon and a valley cutting down, a notch opening a massif's wall;
//   - positive forms combine by their maximum (authoring order never matters);
//   - a massif carries summits and gullies (its skyline is not a dome);
//   - one geology near and far: the tables' section is landformGeology.ts's inselbergSection;
//   - geology: snow on a massif's tops over its line, the forest belt only inside its band, bare rock on the walls;
//   - the far sectors: an alpine sector stands at its relief, a plain stays low, the coarse bake keeps the low octaves;
//   - a pin of the whole law (a re-pin needs its reason).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const { createLandformRelief, landformProfileAt } = await import('./landforms.ts');
const { createFarRelief, FAR_FORMS } = await import('./far.ts');
const { resolveHinterlandSpec, hinterlandPoint } = await import('./spec.ts');
const { createHinterlandField, createHinterlandGeology, createHinterlandCover, HL_COVER } = await import('./field.ts');
const { inselbergSection } = await import('../landformGeology.ts');

const at = { azDeg: 0, distM: 3000 };
const P = (cfg, u, v) => landformProfileAt(cfg, u, v);

// a dike: a level crown, 1-in-3 batters
const dike = { kind: 'dike', at, heightM: 4, lengthM: 1000, widthM: 30, strikeDeg: 90, crown: { widthM: 6 } };
assert.equal(P(dike, 0, 0), 4); assert.equal(P(dike, 200, 2.9), 4);
assert.ok(P(dike, 0, 9) > 0 && P(dike, 0, 9) < 4 && P(dike, 0, 16) === 0, 'the batter falls to the foot');

// an escarpment: a stair rising monotone across its face to the plateau, with ledges
const esc = { kind: 'escarpment', at, heightM: 120, lengthM: 3000, widthM: 1200, strikeDeg: 90, geology: { strata: { bedM: 8 } } };
let prev = -1, ledges = 0, lastRise = 0;
for (let v = -600; v <= 400; v += 4) { // (the plateau eases off past 85 % of its width)
  const h = P(esc, 0, v);
  assert.ok(h >= prev - 1e-6, `the stair never falls back (v ${v})`);
  if (h - prev < 1e-6 && lastRise > 1e-6 && h > 1) ledges++; // a riser gives way to a level ledge
  lastRise = h - prev; prev = h;
}
assert.ok(ledges >= 2, `an escarpment's ledges (${ledges})`);
assert.ok(Math.abs(P(esc, 0, 300) - 120) < 1e-6, 'the plateau behind the scarp');

// a mesa: a flat cap, a caprock cliff, a talus apron; its section is landformGeology's
const mesa = { kind: 'mesa', at, heightM: 200, lengthM: 1400, widthM: 1400 };
const capSpread = Math.abs(P(mesa, 0, 0) - P(mesa, 120, 0));
assert.ok(capSpread < 6, `the cap stands level (${capSpread.toFixed(2)} m over 120 m)`);
let steepest = 0;
for (let u = 300; u < 700; u += 2) steepest = Math.max(steepest, Math.abs(P(mesa, u + 2, 0) - P(mesa, u, 0)) / 2);
assert.ok(steepest > 1.5, `the caprock cliff is steep (${(Math.atan(steepest) * 180 / Math.PI).toFixed(0)}°)`);
assert.equal(inselbergSection(0, 0.74, 0.32, 4, 0.9, 0.015, 2, 0.3), 1, "the tables' law is landformGeology's inselbergSection");

// a jebel: a sheer wall
const jebel = { kind: 'jebel', at, heightM: 400, lengthM: 1600, widthM: 1600 };
let jWall = 0;
for (let u = 200; u < 800; u += 2) jWall = Math.max(jWall, Math.abs(P(jebel, u + 2, 0) - P(jebel, u, 0)) / 2);
assert.ok(jWall > 3, `a jebel's wall is sheer (${(Math.atan(jWall) * 180 / Math.PI).toFixed(0)}°)`);

// a cone has its crater; a caldera's rim stands over its floor
const cone = { kind: 'cone', at, heightM: 300, lengthM: 2000, widthM: 2000 };
assert.ok(P(cone, 0, 0) < P(cone, 120, 0), 'the crater dips at the top');
const caldera = { kind: 'caldera', at, heightM: 300, lengthM: 6000, widthM: 6000 };
assert.ok(P(caldera, 0, 0) < 0.15 * 300 && P(caldera, 2150, 0) > 0.85 * 300, 'the rim over the floor');

// negative forms cut; notches open a wall; positive forms combine by maximum (authoring order never matters)
const canyon = { kind: 'canyon', at, heightM: 150, lengthM: 2000, widthM: 600, strikeDeg: 0 };
assert.ok(P(canyon, 0, 0) < -140, 'the canyon cuts down');
const ridgeA = { kind: 'ridge', at, heightM: 100, lengthM: 2000, widthM: 800, strikeDeg: 90 };
const ridgeB = { kind: 'ridge', at: { azDeg: 2, distM: 3050 }, heightM: 140, lengthM: 2000, widthM: 800, strikeDeg: 60 };
const geologyStub = { rock: 'granite', rockHex: 0, strata: { bedM: 8, dipDeg: 0, contrast: 0 }, scree: 0, snow: { lineM: Infinity, maxSlopeDeg: 0, scour: 0 },
  gullies: 0, erosion: 0.3, rockSlopeDeg: 30, forestBandM: [0, 0], sand: 0, varnish: 0 };
const both = (list) => createLandformRelief({ mapId: 'probe', landforms: list, geology: geologyStub }, 1337);
const ab = both([ridgeA, ridgeB]), ba = both([ridgeB, ridgeA]), a = both([ridgeA]), b = both([ridgeB]);
for (let i = 0; i < 64; i++) {
  const p = hinterlandPoint({ azDeg: -8 + i * 0.25, distM: 2600 + (i % 8) * 110 });
  const hab = ab.heightAt(p.x, p.z, 0);
  assert.equal(hab, ba.heightAt(p.x, p.z, 0), 'order never matters');
  assert.ok(Math.abs(hab - Math.max(a.heightAt(p.x, p.z, 0), b.heightAt(p.x, p.z, 0))) < 1e-9, 'two crests keep the higher');
}
const massif = { kind: 'massif', at, heightM: 900, lengthM: 4000, widthM: 3000, strikeDeg: 90 };
const notch = { kind: 'notch', at: { azDeg: 0, distM: 2400 }, heightM: 70, lengthM: 1600, widthM: 500, strikeDeg: 0 };
const m = both([massif]), mn = both([massif, notch]);
const inNotch = hinterlandPoint({ azDeg: 0, distM: 2500 });
assert.ok(mn.heightAt(inNotch.x, inNotch.z, 0) < 0.5 * m.heightAt(inNotch.x, inNotch.z, 0) + 1, 'a notch opens the wall');

// a massif carries a dominant summit over a crest line that rises and falls, its cols real dips (HL-2c: not an even
// plateau crest with small pyramids sprinkled on top)
const crest = [];
for (let u = -1600; u <= 1600; u += 10) crest.push(P(massif, u, 0));
const sorted = crest.slice().sort((p, q) => p - q), median = sorted[sorted.length >> 1], top = sorted[sorted.length - 1];
let summits = 0;
for (let i = 1; i + 1 < crest.length; i++) if (crest[i] > crest[i - 1] && crest[i] > crest[i + 1] && crest[i] > 0.2 * 900) summits++;
assert.ok(top - median > 0.12 * 900, `a dominant summit stands clear of the crest (${(top - median).toFixed(0)} m over its median)`);
assert.ok(summits >= 2, `the crest has summits and cols (${summits})`);
assert.ok(top > 450 && top < 1600, `its height (${top.toFixed(0)} m for 900)`);

// geology on a mountain: snow over its line, the forest belt only in its band, bare rock on its walls
const mountainSpec = resolveHinterlandSpec({ id: 'probe-alpine', terrain: { rimH: 30 }, hinterland: { place: 'probe', region: 'alpineCol',
  landforms: [{ ...massif, geology: { snow: { lineM: 300 } }, cover: { forest: [0, 160] } }], far: [] } });
const flat = { getHeightAt: () => 0, getOutlandHeightAt: () => 0 };
const field = createHinterlandField(mountainSpec, 1337, flat, { relief: [createLandformRelief(mountainSpec, 1337)] });
const geo = createHinterlandGeology(), cover = createHinterlandCover();
let snowHigh = 0, snowLow = 0, woodsHigh = 0, rockSteep = 0, nHigh = 0, nLow = 0, nSteep = 0;
for (let i = 0; i < 400; i++) {
  const p = hinterlandPoint({ azDeg: -20 + (i % 40), distM: 2200 + Math.floor(i / 40) * 160 });
  const h = field.heightAt(p.x, p.z);
  field.geologyAt(p.x, p.z, geo);
  field.coverAt(p.x, p.z, cover);
  if (h > 480) { nHigh++; if (geo.snow > 0.5) snowHigh++; if (cover.cls === HL_COVER.woods) woodsHigh++; }
  if (h < 100 && h > 5) { nLow++; if (geo.snow > 0.5) snowLow++; }
  if (geo.rock > 0.5) { nSteep++; if (cover.cls === HL_COVER.rock || cover.cls === HL_COVER.snow) rockSteep++; }
}
assert.ok(nHigh > 10 && snowHigh / nHigh > 0.4, `snow on the tops (${snowHigh}/${nHigh})`);
assert.ok(snowLow / Math.max(1, nLow) < 0.2, `none on the low slopes (${snowLow}/${nLow})`);
assert.equal(woodsHigh, 0, 'no wood over its forest belt');
assert.ok(nSteep > 0 && rockSteep / nSteep > 0.8, 'bare rock (or snow) on the walls');

// the far sectors: an alpine sector stands at its relief, a plain stays low, a coarse bake keeps the low octaves
const farSpec = (form, reliefM) => resolveHinterlandSpec({ id: `far-${form}`, hinterland: { place: 'probe', region: 'alpineCol',
  far: [{ azDeg: [0, 360], distKm: [6, 20], reliefM, form, layers: 2 }] } });
const alp = createFarRelief(farSpec('alpine', 1600), 1337), pl = createFarRelief(farSpec('plain', 60), 1337);
let maxAlp = 0, maxPl = 0, diff = 0, n = 0;
for (let i = 0; i < 300; i++) {
  const p = hinterlandPoint({ azDeg: i * 1.2, distM: 9000 + (i % 7) * 1500 });
  const h = alp.heightAt(p.x, p.z, 0, 0);
  maxAlp = Math.max(maxAlp, h); maxPl = Math.max(maxPl, pl.heightAt(p.x, p.z, 0, 0));
  diff += Math.abs(h - alp.heightAt(p.x, p.z, 0, 512)); n++;
}
assert.ok(maxAlp > 900 && maxAlp < 3200, `the alpine far country (${maxAlp.toFixed(0)} m for 1,600)`);
assert.ok(maxPl < 140, `the plain stays low (${maxPl.toFixed(0)} m)`);
assert.ok(diff / n < 0.12 * 1600, `the 512 m bake keeps the form (mean ${(diff / n).toFixed(0)} m)`);
assert.ok(Object.keys(FAR_FORMS).length === 14, 'every far form has its vocabulary');
assert.equal(createFarRelief(farSpec('alpine', 1600), 1337).heightAt(0, 2000, 0, 0), 0, 'nothing nearer than 1.5 km inside the sector');

// the pin
const pinRelief = both([dike, esc, mesa, jebel, cone, caldera, canyon, ridgeA, ridgeB, massif, notch]);
const hash = createHash('sha256');
for (let i = 0; i < 400; i++) {
  const p = hinterlandPoint({ azDeg: -30 + (i % 60), distM: 1500 + Math.floor(i / 60) * 450 });
  hash.update(`${pinRelief.heightAt(p.x, p.z, 0).toFixed(3)};${alp.heightAt(p.x * 3, p.z * 3, 0, 0).toFixed(3)};`);
}
const pin = hash.digest('hex').slice(0, 16);
const PIN = process.env.HINTERLAND_PIN_PRINT ? null : '45d5529957c77fb9';
if (PIN === null || PIN === '__PIN__') console.log(`hinterlandLandforms pin: ${pin}`);
else assert.equal(pin, PIN, 'the landform or far law moved: re-pin with the reason (HINTERLAND_PIN_PRINT=1)');
console.log(`hinterlandLandforms.selftest: ok — massif crest ${summits} summits, ${ledges} ledges, jebel wall ${(Math.atan(jWall) * 180 / Math.PI).toFixed(0)}°, alpine far ${maxAlp.toFixed(0)} m`);
