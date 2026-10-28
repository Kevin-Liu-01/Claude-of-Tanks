// Release 262: the Christian II (profiles/christian2.ts), a Danish concept derived from the Type 90 X (the owner,
// 2026-10-27: "base off of that type 90"). Its first-party concept fixture (tools/first-party-concept-policy.mjs):
//  1. the derivative carries the Type 90 X's hull, running gear, turret shell and gun exactly (every hull, gear, track,
//     turret-shell and gun mesh hashes as the type90 build's at HIGH and LOW), so the shared recipe is reused, not copied;
//  2. each bolted side module rides on spacers seated in the compartment wall the build actually draws (the wall's
//     half-width measured by ray at every spacer, against the datum table the builder and the spec share), its plate
//     clear of the wall by its standoff, and its spaced plate in the spec on the module's outer face;
//  3. the main gun keeps 25 mm from its hull, suit included, at every yaw at its published depression stop
//     (gunPitchByYawDeg, measured with tools/gun-depression-sweep.mjs), at level and at full elevation; negative control:
//     at the bare -10 degrees the gun meets the hull;
//  4. the spec's frame, gun and dimensions are the concept document's (first-party-concept-datums.mjs).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { geometryHash } from '../../../tools/receipt-kit.test-support.mjs';
import { CHRISTIAN2_PIVOT, CHRISTIAN2_SIDE_MODULES as M, christian2WallX } from '../christian2Armor.ts';
import { gunHullProbe, gunHullSweep, GUN_HULL_KEEP_M } from '../gunHullClearance.test-support.mjs';
import { firstPartyConcept } from '../../../tools/first-party-concept-policy.mjs';
import { assertConceptDatums } from '../../../tools/first-party-concept-datums.mjs';

const DEG = Math.PI / 180;
const options = { proceduralOnly: true, geometryReceipt: true, batchStatic: false, decor: false, camoSeed: 4242 };
const SHARED = /^(hull(?!.*ghillie)|gear|track|turret$|gun|recoil)/;

// 1. the shared Type 90 X stock
for (const quality of ['high', 'low']) {
  const digest = (id) => {
    const tank = createTank(id, null, { ...options, quality }), rows = new Map();
    tank.root.traverse((o) => {
      if (!o.geometry || !SHARED.test(o.name) || /_ghillie_/.test(o.name)) return;
      const key = `${o.parent?.name}/${o.name}`;
      rows.set(key, [...(rows.get(key) ?? []), geometryHash(o.geometry)]);
    });
    tank.dispose();
    return rows;
  };
  const base = digest('type90'), derived = digest('christian2');
  assert.ok(base.size > 8, `${quality}: the Type 90 X's shared stock is found (${base.size} meshes)`);
  for (const [key, hashes] of base) {
    assert.deepEqual(derived.get(key), hashes, `${quality}: the Christian II carries the Type 90 X's ${key} unchanged`);
  }
}

const spec = getSpec('christian2');
assert.equal(spec.name, 'Christian II');
assert.equal(spec.nation, 'Denmark');
assert.deepEqual(spec.gun.autoloader, { magazineSize: 3, intraClipS: 2.1, fullReloadS: 17 }, 'the bustle autoloader cycle');

// 2. the side modules on the wall the build draws
{
  const tank = createTank('christian2', null, { ...options, quality: 'high' });
  try {
    tank.root.updateMatrixWorld(true);
    const turret = tank.root.getObjectByName('rig_turret');
    const shell = [], armour = [];
    turret.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'turret') shell.push(o);
      if (o.name === 'turretExternalArmor') armour.push(o);
    });
    assert.ok(shell.length && armour.length, 'the turret shell and the external armour are separate meshes');
    const ray = new THREE.Raycaster(), [px, py, pz] = CHRISTIAN2_PIVOT;
    const world = (x, y, z) => new THREE.Vector3(x - px, y - py, z - pz).applyMatrix4(turret.matrixWorld);
    for (const side of [-1, 1]) {
      for (const [z0, z1] of M.spans) {
        for (const z of [z0 + 0.10, (z0 + z1) / 2, z1 - 0.10]) for (const y of [M.y0 + 0.08, M.y1 - 0.10]) {
          // the wall, by ray from outside with the modules left out
          ray.set(world(side * 2.2, y, z), new THREE.Vector3(-side, 0, 0).transformDirection(turret.matrixWorld));
          const wallHit = ray.intersectObjects(shell, false)[0];
          assert.ok(wallHit, `side ${side} z ${z}: the ray meets the wall`);
          const wallX = 2.2 - wallHit.distance;
          assert.ok(Math.abs(wallX - christian2WallX(z, side)) < 0.006,
            `side ${side} z ${z.toFixed(2)} y ${y.toFixed(2)}: the datum wall ${christian2WallX(z, side).toFixed(4)} is the built wall ${wallX.toFixed(4)}`);
          // the plate's outer face, by ray from outside
          const plateHit = ray.intersectObjects(armour, false)[0];
          const outer = christian2WallX(z, side) + M.standoffM + M.depthM;
          assert.ok(plateHit && Math.abs(2.2 - plateHit.distance - outer) < 0.006,
            `side ${side} z ${z.toFixed(2)}: the module's face stands at ${outer.toFixed(3)} (${plateHit ? (2.2 - plateHit.distance).toFixed(3) : 'none'})`);
        }
        // the spacers bury 10 mm in the wall: a ray along the wall's normal from the plate's inner face meets armour stock
        // before it meets the wall, and nothing is open between them
        const z = z0 + 0.10, y = M.y0 + 0.08, inner = christian2WallX(z, side) + M.standoffM - 0.002;
        ray.set(world(side * inner, y, z), new THREE.Vector3(-side, 0, 0).transformDirection(turret.matrixWorld));
        ray.far = M.standoffM + 0.02;
        assert.ok(ray.intersectObjects(armour, false).some((h) => h.distance < 0.005),
          `side ${side} z ${z.toFixed(2)}: a spacer stands between the plate and the wall`);
        ray.far = Infinity;
      }
    }
  } finally {
    tank.dispose();
  }
}
const plates = spec.armor.turretPlates.filter((p) => p.name.startsWith('christian2_side_module_'));
assert.equal(plates.length, 6, 'three spaced plates a side');
for (const p of plates) {
  assert.equal(p.kind, 'spaced');
  const side = p.name.includes('_R') ? 1 : -1;
  for (const [x, , z] of p.verts) {
    assert.ok(Math.abs(x + CHRISTIAN2_PIVOT[0] - side * (christian2WallX(z + CHRISTIAN2_PIVOT[2], side) + M.standoffM + M.depthM)) < 1e-9,
      `${p.name}: on the module's outer face`);
  }
}

// 3. the gun over its hull, suit included
{
  const probe = gunHullProbe('christian2');
  try {
    assert.ok(probe.spec.gunPitchByYawDeg, 'publishes its measured gunPitchByYawDeg');
    const worst = gunHullSweep(probe, probe.spec);
    console.log(`christian2: the gun's worst clearance ${(worst.d * 1000).toFixed(1)} mm at yaw ${worst.yd}, pitch ${(worst.pitch / DEG).toFixed(2)} (${worst.part})`);
    assert.ok(worst.d >= GUN_HULL_KEEP_M - 1e-4, `the main gun keeps 25 mm from its hull at every yaw (${(worst.d * 1000).toFixed(2)} mm at yaw ${worst.yd} from ${worst.part})`);
    const bare = gunHullSweep(probe, { gunDepressionDeg: probe.spec.gunDepressionDeg }, { stop: GUN_HULL_KEEP_M });
    assert.ok(bare.d < GUN_HULL_KEEP_M, `negative control: the bare -${probe.spec.gunDepressionDeg} degrees meets the hull (${(bare.d * 1000).toFixed(2)} mm)`);
  } finally {
    probe.dispose();
  }
}

// 4. the concept document's frame and dimensions
assertConceptDatums(spec, firstPartyConcept('christian2'));
console.log('christian2.selftest: the Type 90 X stock shared exactly, side modules seated on the built wall, the gun clear of its hull at its published stops, the concept datums PASS');
