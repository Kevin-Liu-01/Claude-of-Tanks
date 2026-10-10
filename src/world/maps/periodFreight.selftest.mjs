// The map-revival lane (2026-10-09; gauntlet waves 319/320: "modern ISO shipping containers sit in a March 1945
// ironworks"): no ISO box stands on a battlefield set before 1966. A container row there holds its period's freight at
// the very same seats, spending exactly the shared draws the boxes spent (the stream every later placement draws), one
// UV-consuming core per box the row would have stood (props.ts jitterBuildingUvs), every core hidden inside its stack,
// the base cores the Ironworks court's feet; a battlefield set later keeps its boxes byte for byte.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MAP_IDS, getMapConfig } from './index.ts';
import { MAP_SETTING_YEAR } from './periodClutterKit.ts';
import { ISO_CONTAINER_INTRODUCED, FREIGHT_MIX, drawsPeriodFreight, freightForm, precedesIsoContainer } from './periodFreight.ts';
import { makeContainerRow } from './railKit.ts';
import { attachStructureBuildContext } from './exteriorDetailKit.ts';
import { ARCHITECTURE_STYLES } from './regional/index.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function counted(seed) { const inner = mulberry32(seed); const r = () => { r.calls++; return inner(); }; r.calls = 0; return r; }
const BUCKETS = ['plaster', 'stone', 'roof', 'wood', 'dark', 'glass', 'baked', 'steel', 'structureMetal', 'structureWood'];
function build(mapId, seed) {
  const buckets = Object.fromEntries(BUCKETS.map((k) => [k, []]));
  attachStructureBuildContext(buckets, { mapId, snowCap: false, seed: 7, cladding: 'brick' });
  const rng = counted(seed);
  const dims = makeContainerRow(rng, buckets);
  return { buckets, dims, calls: rng.calls, tail: rng() };
}
const all = (b) => Object.values(b).flat();
const consumes = (b) => all(b).filter((g) => g.userData.uvJitter === 'consume');

// 1. the rule is keyed to the shared setting-year table
assert.equal(ISO_CONTAINER_INTRODUCED, 1966);
for (const id of MAP_IDS) {
  const year = MAP_SETTING_YEAR[id];
  assert.equal(precedesIsoContainer(id), year !== undefined && year < 1966, `${id}: the year rule`);
}
assert.equal(precedesIsoContainer(undefined), false);
assert.equal(precedesIsoContainer('nowhere'), false, 'a map without a year keeps its boxes');

// 2. every pre-1966 battlefield that draws a container row through the rail kit (no regional builder of its own) is
// named, and has its own freight mix; the receipt names them so a new one is a decision, not an accident
const drawn = [];
for (const id of MAP_IDS) {
  const props = getMapConfig(id).props ?? {};
  if (!(props.plan ?? []).includes('containerRow')) continue;
  const style = props.architecture ? ARCHITECTURE_STYLES.find((st) => st.id === props.architecture) : null;
  if (style?.builders?.containerRow) continue;
  if (precedesIsoContainer(id)) drawn.push(id);
}
// (Cinder Junction, 1962, a protected map: the owner approved its period freight on 2026-10-09)
assert.deepEqual(drawn.sort(), ['foundry', 'railyard', 'steppe'], 'the pre-container battlefields whose rows were boxes');
assert.equal(precedesIsoContainer('railyard'), true, 'Cinder Junction\'s goods yard holds its period freight');
for (const id of drawn) assert.ok(FREIGHT_MIX[id], `${id}: its own freight mix`);
// (2026-10-10, the freight landing's gate) the rail kit's row draws freight on exactly those maps; a pre-container map
// whose kit rebuilds its container rows (Titan Gorge's trailers, Skybridge's houses, both 1965) keeps the base row whose
// bounds the kit fills, so its records stand where main has them (collisionManifestDrift)
for (const id of MAP_IDS) assert.equal(drawsPeriodFreight(id), drawn.includes(id), `${id}: period freight in the rail kit's row only where drawn`);
for (const id of ['titan_gorge', 'skybridge']) {
  assert.equal(precedesIsoContainer(id), true, `${id}: before the ISO box`);
  assert.equal(drawsPeriodFreight(id), false, `${id}: its kit's rows keep the base row's bounds`);
}
assert.equal(freightForm('foundry', 0.1), 'billets');
assert.equal(freightForm('steppe', 0.999), 'crates');

// 3. against the container build of the same seat stream: the same draws, the same dimensions, one core per box
for (const id of drawn) {
  for (let seed = 1; seed <= 40; seed++) {
    const period = build(id, seed), boxes = build('airfield', seed); // airfield: 2022, the boxes
    assert.equal(period.calls, boxes.calls, `${id} seed ${seed}: the shared stream spends the boxes' draws`);
    assert.equal(period.tail, boxes.tail, `${id} seed ${seed}: every later placement keeps its draw`);
    assert.deepEqual(period.dims, boxes.dims, `${id} seed ${seed}: the row's envelope`);
    assert.equal(period.buckets.steel.length, 0, `${id} seed ${seed}: no ISO box`);
    const boxBodies = consumes(boxes.buckets).length;
    assert.equal(consumes(period.buckets).length, boxBodies, `${id} seed ${seed}: one UV-consuming core per box`);
    const feet = all(period.buckets).filter((g) => g.userData.structureSupport?.part === 'freight-core');
    const seats = boxes.buckets.steel.filter((g) => g.userData.uvJitter === 'consume' && (g.computeBoundingBox(), g.boundingBox.min.y < 0.01)).length;
    assert.equal(feet.length, seats, `${id} seed ${seed}: a foot per seat`);
    for (const g of all(period.buckets)) {
      assert.ok(g.userData.uvJitter === 'consume' || g.userData.uvJitter === 'none', 'every part declares its UV draws');
      assert.ok(g.getAttribute('color'), 'every part is vertex-coloured');
      const p = g.getAttribute('position').array;
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), 'finite geometry');
    }
    // every core is hidden: its box lies inside the bounds of the visible parts of its seat
    const visible = all(period.buckets).filter((g) => g.userData.uvJitter === 'none');
    for (const c of consumes(period.buckets)) {
      c.computeBoundingBox();
      const cb = c.boundingBox, centre = cb.getCenter(new THREE.Vector3());
      const seat = new THREE.Box3();
      for (const v of visible) {
        v.computeBoundingBox();
        const vc = v.boundingBox.getCenter(new THREE.Vector3());
        if (Math.abs(vc.x - centre.x) < 1.6 && Math.abs(vc.z - centre.z) < 3.6) seat.union(v.boundingBox);
      }
      assert.ok(cb.min.y >= -1e-6, 'a core stands on the ground');
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(cb.max[axis] <= seat.max[axis] + 1e-3 && cb.min[axis] >= seat.min[axis] - 1e-3 - (axis === 'y' ? 1 : 0),
          `${id} seed ${seed}: a core inside its stack (${axis})`);
      }
    }
  }
}

// 4. a battlefield set after 1966 keeps its boxes exactly
for (const id of ['airfield', 'whiteout', 'mars']) {
  const a = build(id, 11), b = build(id, 11);
  assert.ok(a.buckets.steel.length > 0, `${id}: its boxes`);
  assert.deepEqual(a.buckets.steel.map((g) => Array.from(g.getAttribute('position').array.slice(0, 12))),
    b.buckets.steel.map((g) => Array.from(g.getAttribute('position').array.slice(0, 12))), `${id}: deterministic`);
}

console.log(JSON.stringify({ test: 'periodFreight', isoYear: ISO_CONTAINER_INTRODUCED, periodRows: drawn }));
