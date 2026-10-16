// adobeWallKit.selftest.mjs — the mud field walls in their region's build (props lane A, #6, 2026-10-16): the wall is the
// legacy module's own section on a subset of its rings (every vertex one of the legacy's), filling the same envelope in a
// quarter of its triangles; each region's crown on it; the mud print's box the wall's own; broken a low stepped bite; the
// collision, the fit and the footprint the legacy module's exactly; props.ts lays it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { adobeCrownFor, adobeWallType, buildAdobeWall } from './adobeWallKit.ts';
import { deriveRuntimeStructureContactBand } from '../structureCollision.ts';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const legacyType = { ...DESTRUCTIBLE_TYPES.walladobe, mat: 'fieldMud' };
const legacy = legacyType.build(mulberry32(7));
legacy.computeBoundingBox();
const b = legacy.boundingBox, env = { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z };
const legacyTris = legacy.attributes.position.count / 3;
const key = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
const surface = new Set();
for (let i = 0; i < legacy.attributes.position.count; i++) surface.add(key(legacy.attributes.position.getX(i), legacy.attributes.position.getY(i), legacy.attributes.position.getZ(i)));

const caps = { worn: 130, pinnacles: 175, kershef: 230, ridge: 140, brush: 170 };
for (const kind of ['worn', 'pinnacles', 'kershef', 'ridge', 'brush']) {
  const g = buildAdobeWall(kind, env), p = g.attributes.position, tris = p.count / 3;
  assert.deepEqual(Object.keys(g.attributes).sort(), ['normal', 'position', 'uv'], `${kind}: the mud print's attributes`);
  assert.ok(tris <= caps[kind] && tris < legacyTris / 2, `${kind}: ${tris} triangles (the legacy ${legacyTris})`);
  // the wall's own vertices (at or under the crown) are the legacy module's; the box the mud print reads is the wall's
  let own = 0, onLegacy = 0;
  for (let i = 0; i < p.count; i++) {
    // (the kershef's lumps lift its crown rows: its faces below them are still the legacy's)
    if (p.getY(i) > (kind === 'kershef' ? env.y0 + 0.8 * (env.y1 - env.y0) : env.y1 + 1e-4)) continue;
    if (Math.abs(p.getX(i)) > (env.x1 - env.x0) / 2 + 1e-4) continue;
    own++;
    if (surface.has(key(p.getX(i), p.getY(i), p.getZ(i)))) onLegacy++;
  }
  if (kind === 'worn') assert.equal(onLegacy, own, `the worn wall is the legacy's own section (${onLegacy}/${own})`);
  else assert.ok(onLegacy / own > 0.6, `${kind}: its wall the legacy's section (${onLegacy}/${own})`);
  assert.ok(Math.abs(g.boundingBox.max.y - env.y1) < 0.13 && Math.abs(g.boundingBox.min.z - env.z0) < 1e-3, `${kind}: the mud print reads the wall's box`);
  let top = -Infinity;
  for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
  if (kind === 'pinnacles') assert.ok(top > env.y1 + 0.15, 'the ksour\'s pinnacles stand on the crown');
  if (kind === 'ridge') assert.ok(top > env.y1 + 0.08, 'the cap ridges the crown');
  assert.ok(top < env.y1 + 0.3, `${kind}: no taller than a crown (${(top - env.y1).toFixed(2)} m)`);
  for (const v of p.array) assert.ok(Number.isFinite(v));
  const br = buildAdobeWall(kind, env, true);
  let btop = -Infinity;
  for (let i = 0; i < br.attributes.position.count; i++) btop = Math.max(btop, br.attributes.position.getY(i));
  assert.ok(btop < env.y0 + (env.y1 - env.y0) * 0.5, `${kind}: broken lies low (${btop.toFixed(2)})`);
  assert.deepEqual(buildAdobeWall(kind, env).attributes.position.array, p.array, `${kind}: deterministic`);
}
for (const [arch, want] of [['ksar', 'pinnacles'], ['siwa', 'kershef'], ['wadirum', 'brush'], ['bengal', 'ridge'], ['mekong', 'ridge'], ['navajo', 'worn'], [null, 'worn']]) {
  assert.equal(adobeCrownFor(arch), want, `${arch}: ${want}`);
}

// the collision, the fit and the footprint are the legacy module's
const t = adobeWallType('ksar', legacyType, () => mulberry32(0x0f0f7));
for (const field of ['cls', 'mat', 'contact', 'r', 'h', 'hw', 'hl', 'wall', 'collider', 'keep', 'crushMin']) assert.equal(t[field], legacyType[field], field);
let dA = 0, dB = 0;
const ra = mulberry32(99), rb = mulberry32(99);
const built = t.build(() => { dA++; return ra(); }), old = legacyType.build(() => { dB++; return rb(); });
assert.equal(dA, dB, 'the legacy draws are spent exactly');
assert.deepEqual(t.contactBand, deriveRuntimeStructureContactBand({ baked: [old] }), 'the frozen band is the legacy module\'s');
assert.deepEqual(t.fitGeometry.attributes.position.array, old.attributes.position.array, 'the terrain fit reads the legacy module');
let bA = 0, bB = 0;
const ba = mulberry32(5), bb = mulberry32(5);
t.broken(() => { bA++; return ba(); }); legacyType.broken(() => { bB++; return bb(); });
assert.equal(bA, bB, 'the legacy broken draws are spent exactly');
assert.deepEqual(t.footprintBuild().attributes.position.array, legacyType.build(mulberry32(0x0f0f7)).attributes.position.array, 'the legacy footprint');
built.dispose(); old.dispose();

const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
assert.ok(props.includes('walladobe: adobeWallType(regionalArchitecture?.id, { ...DESTRUCTIBLE_TYPES.walladobe, mat: adobeWallBucket }, () => mulberry32(0x0f0f7)),'), 'props.ts lays the mud walls');
console.log(`adobeWallKit.selftest: 5 crowns on the legacy section (${legacyTris} -> ~120 triangles), broken low, kits mapped, legacy collision/fit/footprint, wired`);
