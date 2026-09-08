import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { markWorldWindowPane, markWorldBeacon, ensureWorldNightEmissionMask } from './worldNightEmissionGeometry.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';
import { STRUCTURE_BUILDERS, makeTimberBathhouse } from './maps/structureKit.ts';
import { VILLAGE_BUILDERS } from './maps/villageKit.ts';

const box = new THREE.BoxGeometry(1, 2, .05);
const original = ['position', 'normal', 'uv'].map(name => box.getAttribute(name).array.slice());
markWorldWindowPane(box, 'curtain', [0, 0, 1]);
const mask = box.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
assert.equal([...mask.array].filter(value => value === 1).length, 4, 'only the visible pane face, not all six box faces');
for (let i = 0; i < mask.count; i++) assert.equal(mask.getX(i), box.getAttribute('normal').getZ(i) > .99 ? 1 : 0);
assert.deepEqual(['position', 'normal', 'uv'].map(name => box.getAttribute(name).array), original);
assert.throws(() => markWorldWindowPane(box, 'curtain', [0, 0, 0]), /unit normal/);
assert.throws(() => markWorldWindowPane(box, 'curtain', [Math.SQRT1_2, 0, Math.SQRT1_2]), /no outward face/);
const ordinary = new THREE.BoxGeometry(1, 2, .05);
markWorldWindowPane(ordinary, 'glass', [0, 0, 1]);
assert.equal(ordinary.hasAttribute(NIGHT_EMISSION_ATTRIBUTE), false, 'ordinary glass remains untouched');
const cloth = ensureWorldNightEmissionMask(new THREE.BoxGeometry(1, 1, .02));
const beacon = markWorldBeacon(new THREE.CylinderGeometry(.2, .2, .3, 8));
const merged = mergeGeometries([box, cloth, beacon].map(geometry => geometry.toNonIndexed()));
assert.ok(merged, 'all shared curtain bucket owners merge without a new draw');
assert.deepEqual(new Set(merged.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array), new Set([0, 1, 2]));

function seeded(seed) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}
const names = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
let windows = 0, beacons = 0, unlit = 0;
for (const [id, build] of Object.entries({ ...STRUCTURE_BUILDERS, ...VILLAGE_BUILDERS, timberBathhouse: makeTimberBathhouse })) {
  for (const seed of [17, 42, 2026]) {
    const buckets = Object.fromEntries(names.map(name => [name, []]));
    build(seeded(seed), buckets, 'plaster');
    for (const geometry of buckets.curtain) {
      const attribute = geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
      assert.ok(attribute, `${id}: every curtain writer explicitly classifies its actual surface`);
      assert.equal(attribute.array.byteLength, geometry.getAttribute('position').count, 'one byte per original vertex');
      const kinds = new Set(attribute.array);
      assert([...kinds].every(value => value === 0 || value === 1 || value === 2));
      if (kinds.has(1)) {
        windows++;
        const normals = geometry.getAttribute('normal');
        const first = attribute.array.findIndex(value => value === 1);
        const normal = new THREE.Vector3().fromBufferAttribute(normals, first);
        for (let i = 0; i < attribute.count; i++) if (attribute.getX(i) === 1) {
          assert(normal.dot(new THREE.Vector3().fromBufferAttribute(normals, i)) > .999,
            `${id}: only one outward-facing pane plane emits, never its edge/back`);
        }
      } else if (kinds.has(2)) beacons++;
      else {
        unlit++;
        assert.match(geometry.userData.structureSupport?.part ?? '', /^bathhouse-entry-panel-/,
          `${id}: non-window fabric explicitly stays off`);
      }
    }
    Object.values(buckets).flat().forEach(geometry => geometry.dispose());
  }
}
assert(windows > 100 && beacons > 0 && unlit > 0);
for (const geometry of [box, ordinary, cloth, beacon, merged]) geometry.dispose();
console.log(`worldNightEmissionGeometry: ${windows} authored panes, ${beacons} beacon bulbs, ${unlit} unlit cloth panels; unchanged geometry and shared merge PASS`);
