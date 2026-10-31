// The hull's turret-sweep guard knows the launchers riding the gun (2026-10-30, 266; after the owner's "for tanks like
// griffin, dont allow decorations to be on the missile pods"). decorations.ts measures the turret's sweep at rest and
// leaves the gun subtree to the bore guard, which knows only the barrel, so a pod riding rig_gun swept over the hull
// unseen: the Griffin Viper's pods reach past the turret's own sweep and their rear drops about 0.5 m at full elevation,
// over the jerrycan rack 265 seated on its stern. launcherSweepBands makes each gun-riding launcher piece a band of its
// own (its annulus about the yaw axis, down to its lowest point through the gun's pitch range), and the hull guard turns
// away any piece under one that does not clear it by 3.5 cm ('launcher-sweep').
//
// Every playable id whose anatomy hangs missile-rack stock on the gun (spec.armor.externalWeapons, gunFollow) is built
// with its decor: its bands must exist, and no cosmetic hull decor triangle may lie under a band's annulus (7 cm either
// side) higher than its lowest point less 3.5 cm. Negative control: the Viper planned as if its gun never elevated
// (gunElevationDeg 0: the launchers seen only at rest and depressed) seats the jerrycan rack under its pods, and this
// check sees it.
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import './tankFactory.ts';
import { createTankSteps } from './tankFactoryCore.ts';
import { TANK_SPECS } from './specs.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { ensureInteriorFills } from './interiorFills.ts';
import { launcherSweepBands, planTankDecorationsSteps } from './decorations.ts';

const warn = console.warn;
console.warn = () => {};
installCanvasFixture();

const gunLauncherIds = Object.keys(FLEET_GROUP_BY_ID).filter((id) => (TANK_SPECS[id]?.armor?.externalWeapons ?? [])
  .some((part) => part.module === 'missileRack' && part.gunFollow));
assert.ok(gunLauncherIds.includes('griffin_viper') && gunLauncherIds.length >= 8, `the fleet's gun-riding launcher ids (${gunLauncherIds.length})`);
await ensureInteriorFills(gunLauncherIds);

const box = new Box3(), v = new Vector3();
/** Build `id` with its decor through the factory's planner hook; `planSpec` patches the spec the plan reads. */
function survey(id, planSpec = null) {
  let bands = null, rest = null, plan = null;
  const decorPlanner = (args) => {
    bands = launcherSweepBands(args.turretG, args.spec);
    rest = launcherSweepBands(args.turretG, { gunElevationDeg: 0, gunDepressionDeg: 0 });
    const steps = planTankDecorationsSteps(planSpec ? { ...args, spec: { ...args.spec, ...planSpec } } : args);
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
    assert.ok(bands, `${id}: the decor planned`);
    tank.root.updateMatrixWorld(true);
    const [px, py, pz] = TANK_SPECS[id].armor.turretPivot;
    const hull = tank.root.getObjectByName('rig_hull');
    const inv = hull.matrixWorld.clone().invert();
    let under = 0;
    const kits = new Set();
    hull.traverse((o) => {
      if (!o.isMesh) return;
      let group = null;
      for (let p = o; p && !group; p = p.parent) if ((p.name || '').startsWith('rig_decor')) group = p.name;
      // the resident group's smoke banks are a gameplay fitting, always seated and exempt
      if (!group || /_functional$/.test(group)) return;
      const m = inv.clone().multiply(o.matrixWorld), pos = o.geometry.attributes.position, idx = o.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < n; i += 3) {
        box.makeEmpty();
        for (let k = 0; k < 3; k++) box.expandByPoint(v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m));
        // the triangle's radial span about the yaw axis (nearest approach, farthest corner), as the guard reads a box
        const rMin = Math.hypot(Math.max(0, box.min.x - px, px - box.max.x), Math.max(0, box.min.z - pz, pz - box.max.z));
        let rMax = 0;
        for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) rMax = Math.max(rMax, Math.hypot(x - px, z - pz));
        if (bands.some((band) => rMin <= band.rMax + 0.07 && rMax >= band.rMin - 0.07 && box.max.y > py + band.minY - 0.035 + 1e-4)) {
          under++;
          kits.add(o.name);
        }
      }
    });
    return { bands, rest, under, kits: [...kits],
      turnedAway: plan?.summary.skipped.filter(([, why]) => why === 'launcher-sweep').length ?? 0 };
  } finally {
    tank.dispose();
  }
}

// Negative control first: the Viper's decor as the rest-pose guard left it, a jerrycan rack under the elevated pods.
const before = survey('griffin_viper', { gunElevationDeg: 0 });
assert.ok(before.under > 0, `griffin_viper planned without the pods' elevation seats hull decor under them (${before.under} triangles)`);
assert.equal(before.turnedAway, 0, 'with no elevation the pods sweep nothing the guard turns away');
// piece for piece (one traversal order), the bands reach down where the pods' rear swings at full elevation
assert.equal(before.bands.length, before.rest.length, 'the same launcher pieces swept and at rest');
const drop = Math.max(...before.rest.map((band, i) => band.minY - before.bands[i].minY));
assert.ok(drop > 0.3, `griffin_viper: the pods' bands are swept over the gun's pitch range (${drop.toFixed(2)} m lower than at rest)`);

let turnedAway = 0;
for (const id of gunLauncherIds) {
  const r = survey(id);
  assert.ok(r.bands.length > 0, `${id}: its gun-riding launcher stock yields sweep bands`);
  assert.equal(r.under, 0, `${id}: no hull decor under a launcher's swept band (${r.kits.join(', ')})`);
  turnedAway += r.turnedAway;
}
assert.ok(turnedAway > 0, 'the guard turned some placement away');
console.warn = warn;
console.log(`launcherSweepGuard: ${gunLauncherIds.length} gun-riding launcher ids keep their hull decor clear of the launchers' swept bands; `
  + `${turnedAway} placements turned away; negative control: griffin_viper without the pods' elevation had ${before.under} hull decor `
  + `triangles under them (${before.kits.join(', ')}), its pods' bands ${drop.toFixed(2)} m lower swept than at rest`);
