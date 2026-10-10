// decorDrawBudget.selftest.mjs — decor draws per tank stay at or below their count before the accessory rebuild
// (tank-accessories lane, 2026-10-05; the coordinator's Phase A condition: equal or lower draws per tank).
//
// The molded / sewn accessories admit more kits under the 6,000-triangle budget, and each new material family on a
// frame is a draw. Four rules hold the count: camo-painted hard kit rides the resident group with the working smoke
// banks (one 'kit' draw per frame, as before, instead of a cosmetic 'kit' beside the smoke banks'); webbing and small
// wooden parts ride the painted-hardware ('cans') draw; optic glass folds into steel and tyre rubber into the
// hardware draw. The lane's fleet census measured 178 tanks lower, 40 equal and one higher (ua_m2a3_bradley, whose
// opt-in branch bundles carry their own atlas material); mean near decor draws 8.74 -> 6.89.
//
// This builds representative decorated hulls and checks that structure, the decor LOD contract (cosmetic groups:
// non-armor, coarse forms from 28 m, nothing past 150 m; the resident group: equipment, no LOD), and their near draws
// against the counts measured on the PR head before the rebuild (5d2461283).
import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const BEFORE = Object.freeze({ challenger1: 9, leclerc: 9, t64bv1: 10, type90a: 8, m1a1: 9, merkava3c: 9 });

const warn = console.warn;
console.warn = () => {};
const restoreCanvas = installCanvasFixture();
const rows = [];
try {
  for (const [id, before] of Object.entries(BEFORE)) {
    const tank = createTank(id, null, { proceduralOnly: true, decor: true, quality: 'high', geometryQuality: 'high', camoSeed: 4242 });
    try {
      let near = 0, resident = 0;
      tank.root.traverse((object) => {
        if (!object.isMesh || !object.userData?.__decor) return;
        assert.doesNotMatch(object.name, /_(lens|rubber)(_coarse)?$/, `${id}/${object.name}: glass and rubber fold into a host draw`);
        let group = object.parent;
        while (group && !/^rig_decor_/.test(group.name)) group = group.parent;
        assert.ok(group, `${id}/${object.name}: inside a decor group`);
        const residentGroup = /_functional$/.test(group.name);
        if (/_kit(_coarse)?$/.test(object.name)) {
          assert.ok(residentGroup, `${id}/${object.name}: camo-painted hard kit rides the resident group`);
        }
        if (residentGroup) {
          resident++;
          assert.equal(object.userData.combatHitboxRole, 'equipment', `${id}/${object.name}: resident decor is equipment`);
          assert.notEqual(object.userData.decorLevel, 'coarse', `${id}/${object.name}: the resident group keeps its near forms`);
        } else {
          assert.equal(object.userData.combatHitboxRole, 'nonArmor', `${id}/${object.name}: cosmetic decor is non-armor`);
          const lod = object.parent;
          assert.ok(lod?.isLOD, `${id}/${object.name}: cosmetic decor sits in a LOD`);
          const distances = lod.levels.map((level) => level.distance);
          assert.equal(distances.at(-1), 150, `${id}/${object.name}: nothing past 150 m`);
          if (lod.levels.some((level) => level.object.userData?.decorLevel === 'coarse')) {
            assert.deepEqual(distances, [0, 28, 150], `${id}/${object.name}: coarse forms from 28 m`);
          }
        }
        if (object.userData.decorLevel !== 'coarse') near++;
      });
      assert.ok(near <= before, `${id}: ${near} near decor draws, at or below the ${before} before the rebuild`);
      rows.push(`${id} ${before}->${near} (resident ${resident})`);
    } finally {
      tank.dispose();
    }
  }
} finally {
  restoreCanvas();
  console.warn = warn;
}
console.log(`decorDrawBudget.selftest: ${rows.join(', ')} PASS`);
