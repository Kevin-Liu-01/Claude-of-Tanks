// No decor seats on a missile launcher (2026-10-30; the owner on the Griffin Viper: "for tanks like griffin, dont allow
// decorations to be on the missile pods. theres likea bag and stuff on it"). The Viper's pods carried a soft bag and two
// cases (generic fleet cargo seated on the gun group's pods, pitching with the launcher). decorations.ts launcherKeepOut
// reads every launcher's stock off the built tank (the factory's missileRackRanges: what a profile builds in
// weaponAssembly), swept over the gun's pitch limits where it rides the gun, 3 cm clear and open above, and commit()
// turns away any decor piece but the smoke banks whose placed box enters it.
//
// Every playable id whose anatomy publishes missile-rack stock (spec.armor.externalWeapons, the anatomy chain's exact
// launcher surfaces) is built with its decor: its frames' keep-out boxes must exist where the anatomy puts the stock,
// no seated load's placed box may meet one, and no cosmetic decor triangle may lie inside one. Negative control: the
// Viper planned with the factory's launcher spans stripped (the decor before the keep-out) seats loads on its pods, and
// this check sees them; and its pods' keep-out reaches down where the pods' rear swings at full elevation, not only
// where they rest.
import assert from 'node:assert/strict';
import { Triangle, Vector3 } from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import './tankFactory.ts';
import { createTankSteps } from './tankFactoryCore.ts';
import { TANK_SPECS } from './specs.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { ensureInteriorFills } from './interiorFills.ts';
import { LAUNCHER_KEEP_OUT_CLEAR, launcherKeepOut, launcherKeepOutVolumes, planTankDecorationsSteps } from './decorations.ts';

const warn = console.warn;
console.warn = () => {};
installCanvasFixture();

const frameOf = (part) => (part.turretLocal || part.gunFollow ? 'turret' : 'hull');
const launcherIds = Object.keys(FLEET_GROUP_BY_ID)
  .filter((id) => (TANK_SPECS[id]?.armor?.externalWeapons ?? []).some((part) => part.module === 'missileRack'));
assert.ok(launcherIds.includes('griffin_viper') && launcherIds.length >= 20, `the fleet's launcher ids (${launcherIds.length})`);
await ensureInteriorFills(launcherIds);

const tri = new Triangle(), a = new Vector3(), b = new Vector3(), c = new Vector3();
/** Build `id` with its decor through the factory's planner hook; `strip` plans with the launcher spans removed. */
function survey(id, strip = false) {
  let boxes = null, plan = null, rest = null;
  const decorPlanner = (args) => {
    boxes = launcherKeepOutVolumes(args.hullG, args.turretG, args.spec);
    rest = launcherKeepOut(args.turretG);
    if (strip) args.root.traverse((o) => { delete o.userData.missileRackRanges; });
    const steps = planTankDecorationsSteps(args);
    let step = steps.next();
    while (!step.done) step = steps.next();
    plan = step.value;
    return plan;
  };
  const steps = createTankSteps(id, null, { proceduralOnly: true, decor: true, quality: 'high', geometryQuality: 'high', camoSeed: 4242, decorPlanner });
  let step = steps.next();
  while (!step.done) step = steps.next();
  const tank = step.value;
  try {
    assert.ok(boxes, `${id}: the decor planned`);
    tank.root.updateMatrixWorld(true);
    const loadsMet = [], trianglesIn = { hull: 0, turret: 0 };
    for (const frame of ['hull', 'turret']) {
      for (const bb of plan?.seatedLoads[frame] ?? []) if (boxes[frame].some((box) => box.intersectsBox(bb))) loadsMet.push(frame);
      const rig = tank.root.getObjectByName(`rig_${frame}`);
      if (!rig || !boxes[frame].length) continue;
      const inv = rig.matrixWorld.clone().invert();
      rig.traverse((o) => {
        if (!o.isMesh) return;
        let group = null;
        for (let p = o; p && !group; p = p.parent) if ((p.name || '').startsWith('rig_decor')) group = p.name;
        // the resident group's smoke banks are a gameplay fitting, seated before any load and exempt
        if (!group || /_functional$/.test(group)) return;
        const m = inv.clone().multiply(o.matrixWorld), pos = o.geometry.attributes.position, idx = o.geometry.index;
        const n = idx ? idx.count : pos.count;
        for (let i = 0; i + 2 < n; i += 3) {
          a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
          b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m);
          c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m);
          tri.set(a, b, c);
          if (boxes[frame].some((box) => box.intersectsTriangle(tri))) trianglesIn[frame]++;
        }
      });
    }
    return { boxes, rest, loadsMet, trianglesIn, loads: (plan?.seatedLoads.hull.length ?? 0) + (plan?.seatedLoads.turret.length ?? 0),
      turnedAway: plan?.summary.skipped.filter(([, why]) => why === 'launcher').length ?? 0 };
  } finally {
    tank.dispose();
  }
}

// Negative control first: the Viper as the owner saw it, its pods dressed.
const before = survey('griffin_viper', true);
assert.ok(before.loadsMet.length > 0 && before.trianglesIn.turret > 0,
  `griffin_viper without the keep-out seats loads on its pods (${before.loadsMet.length} loads, ${before.trianglesIn.turret} triangles)`);
assert.equal(before.turnedAway, 0, 'with the spans stripped the keep-out has nothing to turn away');
// piece for piece (one traversal order), the pods' boxes reach down where their rear swings at full elevation
assert.equal(before.boxes.turret.length, before.rest.length, 'the same launcher pieces swept and at rest');
const drop = Math.max(...before.rest.map((box, i) => box.min.y - before.boxes.turret[i].min.y));
assert.ok(drop > 0.3, `griffin_viper: the pods' keep-out is swept over the gun's pitch range (${drop.toFixed(2)} m lower than at rest)`);

let turnedAway = 0, loads = 0;
const dressed = [];
for (const id of launcherIds) {
  const r = survey(id);
  // the keep-out stands in every frame the anatomy puts missile-rack stock in
  for (const frame of new Set(TANK_SPECS[id].armor.externalWeapons.filter((p) => p.module === 'missileRack').map(frameOf))) {
    assert.ok(r.boxes[frame].length > 0, `${id}: the ${frame} frame's launcher stock yields keep-out boxes`);
  }
  assert.deepEqual(r.loadsMet, [], `${id}: no seated load's placed box meets a launcher keep-out`);
  assert.deepEqual(r.trianglesIn, { hull: 0, turret: 0 }, `${id}: no decor triangle inside a launcher keep-out`);
  turnedAway += r.turnedAway; loads += r.loads;
  if (r.loads) dressed.push(id);
}
assert.ok(LAUNCHER_KEEP_OUT_CLEAR >= 0.02 && LAUNCHER_KEEP_OUT_CLEAR <= 0.05, 'a few centimetres of clearance');
console.warn = warn;
console.log(`launcherDecorKeepOut: ${launcherIds.length} launcher ids (${dressed.length} dressed, ${loads} loads) keep every launcher clear; `
  + `${turnedAway} placements turned away; negative control: griffin_viper without the keep-out had ${before.loadsMet.length} loads `
  + `and ${before.trianglesIn.turret} decor triangles in its launcher volumes`);
