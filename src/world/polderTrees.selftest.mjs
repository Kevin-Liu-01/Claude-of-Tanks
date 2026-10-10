// The trees lane (2026-10-07, the gauntlet's wave 205 on Polders: "free-standing trees scattered at random through the
// ploughed field"; Zeeland's trees stand in willow rows along the ditches, poplar windbreaks and farmyard groups): two
// opt-in hooks on the real seeded producer of Polders — `woodsOffArable` (a woodlot's centre, its trees and its saplings
// refuse a field's cropped ground: any crop but pasture, inside its grass margin) and the hedge trees' `along:
// 'boundary'` (the fields' own boundaries, each planted once from the field on its far side, in a band in from it, off
// the ditch). Unset, neither plants nor refuses anything. A construction receipt: no GPU, no art claim, no pacing claim
// (the map that opts in carries its own pacing and cover).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { createLandFieldSample, landUseAt, resolveLandUseProfile } from './landUse.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function canvasFixture() {
  const saved = new Map(['document', 'ImageData'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  class ImageData { constructor(data, width, height) {
    this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height;
  } }
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => new ImageData(new Uint8ClampedArray(w * h * 4), w, h),
      getImageData: (_x, _y, w, h) => new ImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context; return canvas;
  } };
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}

const digest = (world) => createHash('sha256').update(JSON.stringify(world._trees.map((t) => [t.species, t.variant, ...t.mat.elements.map((v) => +v.toFixed(5))]))).digest('hex').slice(0, 16);
// the maps that opt in carry their own pacing; here none sets the hooks but the one the farmland lane opts in
for (const id of MAP_IDS) {
  const veg = getMapConfig(id).vegetation ?? {};
  if (veg.woodsOffArable) assert.ok(veg.woodsOffArable === true, `${id}: woodsOffArable is a flag`);
  if (veg.hedgeTrees?.along) assert.ok(['hedge', 'boundary'].includes(veg.hedgeTrees.along), `${id}: the hedge trees' lines`);
}

const ROWS = { mix: [['willow', 0.8], ['poplar', 0.2]], spacingM: 8, gateM: 5, along: 'boundary', offsetM: [1.8, 3.4], minLineM: 40 };
const restore = canvasFixture();
try {
  const base = getMapConfig('polders'), field = createHeightField(1337, base), profile = resolveLandUseProfile('polders');
  const unsetCfg = { ...base, vegetation: { ...base.vegetation, woodsOffArable: undefined, hedgeTrees: undefined } };
  const build = (over) => createVegetation(field, { setupShadowMaterial() {} }, 2001, { ...unsetCfg, vegetation: { ...unsetCfg.vegetation, ...over } });
  const plain = build({}), off = build({ woodsOffArable: true }), rows = build({ hedgeTrees: ROWS }), replay = build({ hedgeTrees: ROWS });
  try {
    const sample = createLandFieldSample();
    const arable = (x, z) => { const at = landUseAt(profile, x, z, sample); return at.active > 0 && at.crop !== 0 && at.edgeM > at.marginM; };
    // unset: no census, and woods on the cropped ground as before (the regression the hook answers)
    assert.equal(plain.group.userData.woodsOffArable, undefined, 'unset: no woodsOffArable census');
    assert.equal(plain.group.userData.hedgeTrees, undefined, 'unset: no hedge trees');
    const inner = (t) => Math.max(Math.abs(t.x), Math.abs(t.z)) < 300; // (the border's rim forest keeps its own law)
    const onArable = (w) => w._trees.filter((t) => t.wood && inner(t) && arable(t.x, t.z)).length;
    const before = onArable(plain);
    assert.ok(before > 200, `unset: Polders' woods stand on its cropped ground (${before} trees)`);
    // woodsOffArable: no wood or sapling of the woodlots on cropped ground inside the border's belt
    const census = off.group.userData.woodsOffArable;
    assert.ok(census && census.landUse && census.refused.centres > 0 && census.refused.trees > 0, `the refusals counted (${JSON.stringify(census)})`);
    assert.equal(onArable(off), 0, 'no woodlot tree on cropped ground');
    const saplingsOn = off._trees.filter((t) => !t.wood && !t.field && !t.hedgeRow && inner(t) && arable(t.x, t.z) && Math.hypot(...[t.mat.elements[4], t.mat.elements[5], t.mat.elements[6]]) < 0.75).length;
    assert.equal(saplingsOn, 0, 'no sapling on cropped ground');
    // the boundary rows: every row tree in its boundary's band, off the ditch, from the field on the boundary's far
    // side, of the mix, spaced along its line; the census honest; deterministic; every tree before them the plain map's
    const ht = rows.group.userData.hedgeTrees, rowTrees = rows._trees.filter((t) => t.hedgeRow);
    assert.ok(ht && ht.along === 'boundary' && ht.lines > 40 && ht.km > 5 && ht.standing === rowTrees.length, `the rows' census (${JSON.stringify(ht)})`);
    const first = rows._trees.findIndex((t) => t.hedgeRow);
    assert.equal(digest({ _trees: rows._trees.slice(0, first) }), digest({ _trees: plain._trees.slice(0, first) }), 'every tree before the rows as the plain map placed it');
    assert.equal(digest(rows), digest(replay), 'deterministic');
    // (a later pass may move a row tree: the authored rows displace a squatter from their seats onto a donor's — a few)
    const mix = new Set(ROWS.mix.map(([sp]) => sp)), byLine = new Map();
    let moved = 0;
    for (const t of rowTrees) {
      const at = landUseAt(profile, t.x, t.z, sample);
      const acrossU = Math.abs(at.sU) <= Math.abs(at.sV), off2 = acrossU ? at.sU : at.sV, d = Math.abs(off2);
      assert.ok(mix.has(t.species) || t.species === 'snag', `of the mix (${t.species})`);
      if (!(at.active && off2 >= 0 && d >= ROWS.offsetM[0] - 1e-6 && d <= ROWS.offsetM[1] + 1e-6 && at.track <= 0.3)) { moved++; continue; }
      const key = at.id * 2 + (acrossU ? 0 : 1);
      const along = acrossU ? -Math.sin(profile.heading) * t.x + Math.cos(profile.heading) * t.z : Math.cos(profile.heading) * t.x + Math.sin(profile.heading) * t.z;
      (byLine.get(key) ?? byLine.set(key, []).get(key)).push(along);
    }
    assert.ok(moved <= 0.02 * rowTrees.length, `the row trees in their boundaries' bands (${moved} of ${rowTrees.length} moved by a later pass)`);
    let close = 0, pairs = 0;
    for (const list of byLine.values()) {
      list.sort((a, b) => a - b);
      for (let i = 1; i < list.length; i++) { pairs++; if (list[i] - list[i - 1] < ROWS.spacingM * 0.7) close++; }
    }
    assert.ok(close <= pairs * 0.05, `spaced along their boundaries (${close} of ${pairs} pairs under 0.7 of the spacing)`);
    console.log(JSON.stringify({ map: 'polders', plain: { trees: plain._trees.length, woodsOnCrop: before }, off: { trees: off._trees.length, census },
      rows: { trees: rows._trees.length, rows: rowTrees.length, census: ht } }));
  } finally {
    for (const w of [plain, off, rows, replay]) { w.dispose(); disposeObject3DResources(w.group); }
  }
} finally { restore(); }
console.log('polderTrees.selftest: Polders\' woods off its cropped ground and its willow rows along its field boundaries, each where its hook puts it, deterministic; unset neither PASS');
