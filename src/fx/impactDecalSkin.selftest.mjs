// Hit marks lie on drawn skin or nowhere (hitbox-fit-274; the owner, 2026-11-18: "i can see hitmarks that are floating in
// air"). A contact on an armour plate buried under the drawn skin is lifted onto that skin; a contact on a plate with no
// drawn surface under it (a donor's plate the build lacks, e.g. the Abrams X's inherited bustle rack) writes no mark,
// and a hidden or see-through mesh is not skin. Headless: the atlas paints through @napi-rs/canvas.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createImpactDecals, IMPACT_DECAL_LIFT_M } from './impactDecals.ts';

// the lift and its jitter (impactDecals.ts writeStamp: IMPACT_DECAL_LIFT_M + up to 2 mm)
const LIFT_MAX = IMPACT_DECAL_LIFT_M + 0.0021;
const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
try {
  const decals = createImpactDecals({ seed: 11 });
  // a 3 x 1 x 6 m hull (x ±1.5, y 0..1, z ±3) and a turret (x ±1, y 1..1.8, z ±1.5)
  const root = new THREE.Object3D();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 6), new THREE.MeshStandardMaterial());
  hull.position.y = 0.5; root.add(hull);
  const turret = new THREE.Object3D(); turret.name = 'rig_turret'; turret.position.y = 1; root.add(turret);
  const turretBox = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 3), new THREE.MeshStandardMaterial());
  turretBox.position.y = 0.4; turret.add(turretBox);
  // a hidden rack and a see-through screen behind the turret: neither is skin
  const hiddenRack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.1), new THREE.MeshStandardMaterial());
  hiddenRack.position.set(0, 0.45, -2.3); hiddenRack.visible = false; turret.add(hiddenRack);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.1), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 }));
  glass.position.set(0, 0.45, 2.6); turret.add(glass);
  root.updateWorldMatrix(true, true);
  const ent = { visual: { root, isDestroyed: () => false }, state: { pos: new THREE.Vector3(), yaw: 0, turretYaw: 0 },
    spec: { id: 'skin-probe', armor: { turretPivot: [0, 1, 0], gunPivot: [0, 0.4, 1.5] } } };
  let n = 0;
  const hit = (frame, impactLocalPos, impactLocalNormal) => ({ kind: 'nonpen', targetId: `skin-probe-${++n}`, caliberMm: 120,
    zone: 'probe', impactFrame: frame, impactLocalPos, impactLocalNormal, impactLocalDir: impactLocalNormal.map((c) => -c) });
  /** Every decal vertex of the vehicle, in the root frame. */
  const markVertices = () => {
    const out = [];
    root.updateWorldMatrix(true, true);
    root.traverse((object) => {
      if (object.name !== 'fx_impactDecals') return;
      const position = object.geometry.attributes.position, range = object.geometry.drawRange;
      const end = Math.min(position.count, range.start + (Number.isFinite(range.count) ? range.count : position.count));
      for (let i = range.start; i < end; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        if (v.lengthSq() > 0) out.push(v);
      }
    });
    return out;
  };

  // 1. a hull side plate authored 12 cm inside the drawn side (x 1.38): the mark is lifted onto the drawn side (x 1.5)
  assert.ok(decals.stampFromEvent(hit('hull', [1.38, 0.5, 0.5], [1, 0, 0]), ent), 'a contact under drawn skin is marked');
  let marks = markVertices();
  assert.ok(marks.length >= 4, 'the mark wrote its quad');
  for (const v of marks) assert.ok(Math.abs(v.x - 1.5) <= LIFT_MAX, `the mark sits on the drawn side, not the plate (x ${v.x.toFixed(4)})`);

  // 2. a turret plate standing 0.25 m off the drawn turret side (x 1.25 in a 1.0 m half-width): lifted onto the side
  assert.ok(decals.stampFromEvent(hit('turret', [1.25, 0.4, 0], [1, 0, 0]), ent), 'a plate proud of the drawn turret is marked on it');
  marks = markVertices().filter((v) => v.y > 1);
  assert.ok(marks.length >= 4 && marks.every((v) => Math.abs(v.x - 1) <= LIFT_MAX), 'the mark sits on the drawn turret side');

  const before = decals.stats().decals;
  // 3. a floating rear plate 1.2 m behind the drawn turret rear (z -1.5), as the Abrams X's inherited bustle rack stood:
  //    no drawn skin within the clamp's reach, so no mark hangs in the air
  assert.equal(decals.stampFromEvent(hit('turret', [0, 0.45, -2.7], [0, 0, -1]), ent), false, 'a contact with no drawn skin under it writes no mark');
  // 4. the same contact on the hidden rack's face: a hidden mesh is not skin
  assert.equal(decals.stampFromEvent(hit('turret', [0, 0.45, -2.35], [0, 0, -1]), ent), false, 'a hidden part is not skin');
  // 5. on the see-through screen's face, with nothing drawn behind it within reach: a see-through mesh is not skin
  assert.equal(decals.stampFromEvent(hit('turret', [0, 0.45, 2.65], [0, 0, 1]), ent), false, 'a see-through part is not skin');
  assert.equal(decals.stats().decals, before, 'the refused contacts left no decal');
  for (const v of markVertices()) {
    assert.ok(Math.abs(v.x) <= 1.5 + LIFT_MAX && v.z >= -3 - 1e-4 && v.z <= 3 + 1e-4, 'no mark outside the drawn vehicle');
  }
  // negative control: the floating plate's contact is marked once a drawn surface stands there
  hiddenRack.visible = true; root.updateWorldMatrix(true, true);
  assert.ok(decals.stampFromEvent(hit('turret', [0, 0.45, -2.7], [0, 0, -1]), ent), 'the same contact is marked once the part is drawn');
  console.log('impactDecalSkin.selftest: marks lie on drawn skin or nowhere passed');
} finally {
  if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
}
