// The combat frame of a built tank, measured on its drawn rig at rest (276 sim-det-trig; Main's ruling on the class of
// combat data only the visual builder computed). tools/gen-combat-anatomy.mjs publishes it in each id's calibration and
// finalizeCombatAnatomy applies it on every driver, so the page and every authority fire from the gun the page draws:
// - turretPivot: where the builder seated rig_turret (root frame, the hull's)
// - gunPivot: rig_gun's trunnion, where the drawn gun pitches
// - lengthM and mouth: the drawn mouth from that trunnion at rest, along the bore (lengthM) and across it (mouth {x, y});
//   sim/gunPose.ts carries the mouth about the trunnion as it pitches, so the fired muzzle is the drawn one at every pitch
//   (moving the pivot onto the mouth's line instead would pitch it about the wrong axis: 5 cm at full elevation for a
//   bore drawn 2 degrees askew over 5 m)
// - mouths: a twin plant's mouths across the bore ({x, y} as sim/launcherPolicy.ts cannonMouth reads them)
// - launchers: each drawn launcher tube's mouth and bore, in the frame its row names ('turret', else the pitching gun)
// - trackHulls: the running gear's track hitbox as built (specs.ts attachTrackShapes' input)
// The drawn muzzle is the build's own (tank.gunMuzzleWorld / gunDirWorld), the one src/vehicles/gunPoseVisualFit.selftest.mjs
// holds every fired muzzle to. Measured with the root at rest: turret yaw 0 (a casemate's centred), gun pitch 0.
// Every number is the measurement. Where the measurement proves the drawn rig stands on its builder's authored input to
// within 1 um (MEASURED_EQUAL_M: the rig seated from that very number, its matrices adding float noise), the measured value
// published is that exact number (Main's ruling, 2026-11-24): it is what the drawn rig measures, written without the
// noise, so a pivot or mouth the build did not move stays bit-identical to the input every other receipt and signature
// hashes. Where the drawn rig stands more than 1 um off its input (the Olifant Mk1B's turret 1.96 m), the measurement is
// published to the micron. src/vehicles/combatRigFromBuild.selftest.mjs holds both, with a rig moved either side of 1 um.
// This replaces the second, stale copy of the same idea: the gun-barrel census's combat-rig table, written only for a
// misaligned gun and never by tank:regen:changed (Main's ruling: deleted).
import * as THREE from 'three';
import { authoredGun, authoringRigSpec } from '../src/vehicles/combatGunRigSeat.ts';

/** How near (m, and rad for a tube's bore) the drawn rig must stand to its authored input to be published as that input. */
export const MEASURED_EQUAL_M = 1e-6;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
/** The measured `value`, written as the authored `input` when the two agree within MEASURED_EQUAL_M, else to the micron. */
export const measured = (value, input) => (Number.isFinite(input) && Math.abs(value - input) <= MEASURED_EQUAL_M ? input : r6(value));
const measuredVec = (values, inputs) => values.map((value, i) => measured(value, inputs?.[i]));
const world = (object, out = new THREE.Vector3()) => object.getWorldPosition(out);

/**
 * The combat frame `tank` (a createTank result) draws for `spec`. Throws when the build draws a weapon it cannot measure:
 * a drawn gun with no rig_gun, a turret gun with no rig_turret, a cannon or launcher with no mouth (finalize then has no
 * pose for it, and a drawn weapon with no measured pose is an error, not a fallback).
 */
export function measureCombatRig(tank, spec) {
  const root = tank.root;
  const turret = root.getObjectByName('rig_turret');
  const gun = root.getObjectByName('rig_gun');
  const turretless = spec.armor?.turretless === true;
  const saved = { turret: turret?.rotation.y ?? 0, gun: gun?.rotation.x ?? 0, rootPos: root.position.clone(), rootQuat: root.quaternion.clone() };
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  if (turret) turret.rotation.y = 0;
  if (gun) gun.rotation.x = 0;
  root.updateMatrixWorld(true);
  try {
    const launcherRows = Array.isArray(spec.gun?.launcherMuzzles) ? spec.gun.launcherMuzzles : [];
    const cannon = spec.gun?.fixedLaunchCanisters !== true && !!spec.armor?.gunBarrel;
    if ((cannon || launcherRows.length) && !gun) throw new Error(`${spec.id}: a drawn weapon with no rig_gun to measure`);
    if (cannon && !turretless && !turret) throw new Error(`${spec.id}: a turret gun with no rig_turret to measure`);
    // a hull-fixed gun has no turret to seat: its yaw node, where one is drawn, else the authored turret pivot (the frame
    // the casemate traverse turns about is the builder's own when it draws one)
    const authored = authoringRigSpec(spec).armor;
    const authoredMouths = authoredGun(spec.gun);
    const tp = turret ? world(turret) : new THREE.Vector3().fromArray(authored.turretPivot);
    const trunnion = world(gun);
    const rig = { turretPivot: measuredVec(tp.toArray(), authored.turretPivot), gunPivot: measuredVec(trunnion.clone().sub(tp).toArray(), authored.gunPivot) };
    if (cannon) {
      const mouthCount = Array.isArray(spec.gun.muzzles) && spec.gun.muzzles.length > 1 ? spec.gun.muzzles.length : 0;
      const mouths = mouthCount ? Array.from({ length: mouthCount }, (_, i) => tank.gunMuzzleWorld(new THREE.Vector3(), i, false))
        : [tank.gunMuzzleWorld(new THREE.Vector3(), undefined, false)];
      if (mouths.some((m) => !Number.isFinite(m.x))) throw new Error(`${spec.id}: a drawn cannon with no mouth to measure`);
      // a twin plant's mouths against its authored muzzles; a single bore's mouth against the bore's own axis (0, 0)
      const across = mouths.map((m, i) => {
        const input = mouthCount ? authoredMouths?.muzzles?.[i] : null;
        return { x: measured(m.x - trunnion.x, input ? (input.x ?? 0) : 0), y: measured(m.y - trunnion.y, input ? (input.y ?? 0) : 0) };
      });
      rig.lengthM = measured(mouths.reduce((sum, m) => sum + m.z - trunnion.z, 0) / mouths.length, authored.gunBarrel?.lengthM);
      if (mouthCount) rig.mouths = across; else rig.mouth = across[0];
      if (!(rig.lengthM > 0)) throw new Error(`${spec.id}: the drawn mouth stands ${rig.lengthM} m behind its trunnion`);
    }
    if (launcherRows.length && tank.launcherTipCount !== launcherRows.length) {
      throw new Error(`${spec.id}: ${launcherRows.length} launcher row(s) but ${tank.launcherTipCount} drawn tube mouth(s)`);
    }
    if (launcherRows.length) {
      const pivotWorld = tp.clone().add(new THREE.Vector3().fromArray(rig.gunPivot));
      rig.launchers = launcherRows.map((row, i) => {
        const tip = tank.gunMuzzleWorld(new THREE.Vector3(), i, true);
        const bore = tank.gunDirWorld(new THREE.Vector3(), i, true).normalize();
        if (!Number.isFinite(tip.x) || !Number.isFinite(bore.x)) throw new Error(`${spec.id}: launcher tube ${i} has no drawn mouth`);
        const at = tip.clone().sub(row.frame === 'turret' ? tp : pivotWorld);
        const input = authoredMouths?.launcherMuzzles?.[i] ?? row;
        return { x: measured(at.x, input.x), y: measured(at.y, input.y), z: measured(at.z, input.z),
          pitch: measured(Math.asin(Math.max(-1, Math.min(1, bore.y))), input.pitch), yaw: measured(Math.atan2(bore.x, bore.z), input.yaw) };
      });
    }
    const hulls = tank.trackHitbox;
    if (Array.isArray(hulls) && hulls.length) {
      rig.trackHulls = hulls.map((hull) => ({ ...hull, x0: r6(hull.x0), x1: r6(hull.x1), poly: hull.poly.map(([z, y]) => [r6(z), r6(y)]) }));
    }
    return rig;
  } finally {
    root.position.copy(saved.rootPos);
    root.quaternion.copy(saved.rootQuat);
    if (turret) turret.rotation.y = saved.turret;
    if (gun) gun.rotation.x = saved.gun;
    root.updateMatrixWorld(true);
  }
}
