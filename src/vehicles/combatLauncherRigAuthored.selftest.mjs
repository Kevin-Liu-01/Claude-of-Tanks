// 278 (fleet-debt-278, Main's ruling): the anatomy generator measures the launcher exits the authored spec draws, never
// its own last calibration. The drawn launcher tubes' anchors are built from spec.gun.launcherMuzzles (tankFactoryCore
// createLauncherTips), and applyCombatGunRig used to overwrite those with the committed calibration's rig.launchers in the
// generator's measurement pass too, so the generator re-measured its own output and an authored move
// (fleetLauncherMuzzles.ts) never reached the rig: cv90_mk4_concept fired from its pre-267 exits, 2.2 m off its pod.
// Per id with launchers, in the generator's mode (combatAnatomyMeasurementMode.ts):
// - the spec carries its authored exits, not the calibration's;
// - the committed calibration's rig.launchers is those authored exits (no calibration is stale against its author);
// - the CV90 Mk IV concept's build, measured as the generator measures it (tools/combat-rig-measure.mjs), reports its
//   authored exits;
// and the control: a calibration whose launchers stand 0.5 m off the authored exits leaves the spec's authored exits in
// place in this mode (with the 278 fix reverted, this and the cv90 rows fail with the stale exits).
import assert from 'node:assert/strict';
import { enableCombatAnatomyMeasurementMode } from './combatAnatomyMeasurementMode.ts';

enableCombatAnatomyMeasurementMode();
const { installCanvasFixture } = await import('./canvasFixture.test-support.mjs');
installCanvasFixture();
const { createTank } = await import('./tankFactory.ts');
const { ALL_TANK_IDS, getSpec } = await import('./specs.ts');
const { authoredGun } = await import('./combatGunRigSeat.ts');
const { applyCombatGunRig } = await import('./combatAnatomy.ts');
const { combatAnatomyCalibration } = await import('./combatAnatomyCalibrationRegistry.ts');
const { MEASURED_EQUAL_M, measureCombatRig } = await import('../../tools/combat-rig-measure.mjs');

const exits = (tubes) => tubes.map((t) => [t.x, t.y, t.z, t.pitch ?? 0, t.yaw ?? 0]);
const off = (a, b) => Math.max(...a.flatMap((row, i) => row.map((v, k) => Math.abs(v - (b[i]?.[k] ?? Infinity)))));

let launcherIds = 0;
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const authored = authoredGun(spec.gun)?.launcherMuzzles;
  if (!authored?.length) continue;
  launcherIds++;
  assert.deepEqual(exits(spec.gun.launcherMuzzles), exits(authored), `${id}: the generator's spec draws its authored exits`);
  const rig = (await combatAnatomyCalibration(id))?.rig?.launchers;
  assert.equal(rig?.length, authored.length, `${id}: its calibration carries one measured row per authored exit`);
  const d = off(exits(rig), exits(authored));
  assert.ok(d <= MEASURED_EQUAL_M, `${id}: the committed rig.launchers is its authored exits (${(d * 1000).toFixed(1)} mm off; `
    + `run tools/tank-regen-changed.mjs --ids=${id} --steps=anatomy)`);
}
assert.ok(launcherIds >= 38, `the fleet's launcher ids are all measured (${launcherIds})`);

{
  const id = 'cv90_mk4_concept', spec = getSpec(id), tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const rig = measureCombatRig(tank, spec);
    const d = off(exits(rig.launchers), exits(authoredGun(spec.gun).launcherMuzzles));
    assert.ok(d <= MEASURED_EQUAL_M, `${id}: the build measured as the generator measures it reports its authored exits (${(d * 1000).toFixed(1)} mm off)`);
  } finally {
    tank.dispose();
  }
}

{
  // control: a stale calibration 0.5 m off the authored exits does not reach the generator's spec
  const tube = { x: 1.1, y: 1, z: 0.35, frame: 'turret', pitch: 0, yaw: 0 };
  const spec = { id: 'control', armor: { turretPivot: [0, 1.6, 0], gunPivot: [0, 0.4, 1], boundingRadiusM: 9 }, gun: { launcherMuzzles: [tube] } };
  applyCombatGunRig(spec, { turretPivot: [0, 1.6, 0], gunPivot: [0, 0.4, 1], launchers: [{ ...tube, x: 0.6 }] });
  assert.deepEqual(exits(spec.gun.launcherMuzzles), exits([tube]), 'control: the stale calibration exits stay out of the measurement pass');
}
console.log(`combatLauncherRigAuthored: ${launcherIds} launcher ids carry their authored exits in the generator and in their calibration; cv90_mk4_concept measured; stale-calibration control held`);
