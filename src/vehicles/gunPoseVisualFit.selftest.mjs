// The drawn muzzle against the pose both drivers fire from (276, sim-det-trig; Main's ruling on gap 3). The solo step
// fired from the visual's scene graph until 276. Now every round leaves sim/gunPose.ts gunWorldPose, and the visual draws
// only the flash, smoke and the tracer's first frame at its own mouth. What that costs on screen is the distance
// between the two at the fire instant, measured here on the real rig (createTank, headless three):
// - every production id's main-gun mounts: a single bore, each mouth of a twin, each launcher tube;
// - the hull on a grade (visualPitch 0.04, visualRoll -0.03), at turret yaws across the ring (a casemate's own arc) and
//   gun pitches across its depression and elevation, never below the floor the sim holds the gun to at that yaw (a rear
//   deck's curve: sim/gunPitchLimits.ts); a fixed hydraulic gun (Strv 103) at its only lay, the hull tilted;
// - during traverse: the turret slewing at its rated speed for ten ticks before the shot, the visual synced every tick.
// Rule (Main, 2026-11-22, written before the measurement): p99 <= 3 cm and max <= 10 cm, and any id beyond is listed by
// distance; there is no looser bound and no tracer blend. Recoil starts after the shot leaves, so the barrel is at rest.
// Roof stations and coaxials fire from the sim's own pose already (sim/auxiliarySystems.ts auxiliaryShot) and are not
// rows here.
// No id is pinned: the combat frame is the rig measured on each build (276: the calibration's rig, finalizeCombatAnatomy),
// which took the 18 strays of the first fleet pass (up to 196 cm, the Olifant Mk1B's hand-kept pivots and barrel) to 0.
// The bound applies to every row of every id; a stray is a stale calibration or a builder the measurement misses.
// Builds the fleet: MANUAL suite 'fleet' (tools/selftest-tiers.mjs). `--ids=a,b` measures those ids only.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec, PRODUCTION_TANK_IDS } from './specs.ts';
import { casemateGunYaw } from './casemateGunPose.ts';
import { createTankState, SIM_DT } from '../sim/movement.ts';
import { createCombatState } from '../sim/damage.ts';
import { gunWorldPose } from '../sim/gunPose.ts';
import { usesLauncherMuzzles } from '../sim/launcherPolicy.ts';
import { mechanicalGunPitchFloor, minimumMechanicalGunPitch } from '../sim/gunPitchLimits.ts';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import { betweenBuilds } from '../../tools/build-loop-yield.mjs';

// the rig's lazy materials paint on canvases; their pixels are not measured here
installCanvasFixture();

const P99_M = 0.03, MAX_M = 0.10;
const idsArg = process.argv.find((arg) => arg.startsWith('--ids='));
const ids = idsArg ? idsArg.slice(6).split(',').filter(Boolean) : PRODUCTION_TANK_IDS;
const DEG = Math.PI / 180;
const visual = new Vector3();

/** The mounts a spec's main gun fires from: [{ kind, round, cannonMuzzle, launcher }] (one row per mouth or tube). */
function mountsOf(spec) {
  const mounts = [];
  const cannonRound = spec.gun.shells.find((round) => !usesLauncherMuzzles(spec.gun, round));
  if (cannonRound) {
    const mouths = Array.isArray(spec.gun.muzzles) && spec.gun.muzzles.length > 1 ? spec.gun.muzzles.length : 0;
    if (mouths) for (let i = 0; i < mouths; i++) mounts.push({ kind: 'twin', round: cannonRound, cannonMuzzle: i, launcher: false });
    else mounts.push({ kind: 'single', round: cannonRound, cannonMuzzle: -1, launcher: false });
  }
  const launcherRound = spec.gun.shells.find((round) => usesLauncherMuzzles(spec.gun, round));
  if (launcherRound) for (let i = 0; i < (spec.gun.launcherMuzzles?.length ?? 0); i++) {
    if (spec.gun.launcherMuzzles[i].shellSlots && !spec.gun.launcherMuzzles[i].shellSlots.includes(spec.gun.shells.indexOf(launcherRound))) continue;
    mounts.push({ kind: 'launcher', round: launcherRound, cannonMuzzle: -1, launcher: true, tube: i });
  }
  return mounts;
}

/** The distance from the drawn mouth to the fired one, the visual synced to `state` (and settled). */
function gap(tank, entity, mount) {
  tank.root.updateMatrixWorld(true);
  tank.gunMuzzleWorld(visual, mount.launcher ? mount.tube : mount.cannonMuzzle >= 0 ? mount.cannonMuzzle : undefined, mount.launcher);
  if (mount.launcher) entity.combat.launcherCursor = mount.tube;
  return visual.distanceTo(gunWorldPose(entity, mount.round, mount.cannonMuzzle).muzzle);
}

const rows = [];
let built = 0;
for (const id of ids) {
  await betweenBuilds(); // the last build is free to go (tools/build-loop-yield.mjs)
  const spec = getSpec(id);
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, decor: false, batchStatic: false });
  built++;
  try {
    const state = createTankState(spec, new Vector3(3, 0, 7), 0.35);
    state.visualPitch = 0.04; state.visualRoll = -0.03;
    const entity = { spec, state, combat: createCombatState(spec) };
    const turretless = spec.armor?.turretless === true;
    // a fixed hydraulic gun (the Strv 103s) never lays: movement.ts holds its yaw and pitch at 0 and tilts the whole hull
    const fixed = turretless && !!spec.hydropneumaticAim;
    const pitches = fixed ? [0] : [-spec.gunDepressionDeg, 0, spec.gunElevationDeg * 0.5, spec.gunElevationDeg].map((deg) => deg * DEG);
    const yaws = fixed ? [0] : turretless ? [-1, 0, 1].map((side) => casemateGunYaw(spec, side)) : [-2.6, -1.2, 0, 0.7, Math.PI];
    const hullPitches = fixed ? [-0.12, 0.04, 0.15] : [0.04];
    // the lowest the sim lays the gun at a turret yaw (a rear deck's curve, a casemate's floor): movement.ts mechanicalLowAt
    const floor = spec.gunPitchByYawDeg ? mechanicalGunPitchFloor(spec) : null;
    const floorAt = (yaw) => (floor ? floor(yaw) : minimumMechanicalGunPitch(spec, yaw));
    for (const mount of mountsOf(spec)) {
      for (const hullPitch of hullPitches) for (const yaw of yaws) for (const pitch of pitches) {
        // only poses the sim lays: a gun is held above its deck's floor at that yaw (movement.ts mechanicalLowAt)
        if (pitch < floorAt(yaw) - 1e-9 && pitch !== pitches[0]) continue;
        state.visualPitch = hullPitch; state.turretYaw = yaw; state.gunPitch = Math.max(pitch, floorAt(yaw)); state.turretYawRate = 0;
        for (let k = 0; k < 3; k++) tank.syncFromState(state, SIM_DT);
        rows.push({ id, kind: mount.kind, mount: mount.launcher ? `tube ${mount.tube}` : mount.cannonMuzzle >= 0 ? `mouth ${mount.cannonMuzzle}` : 'bore',
          pose: `${fixed ? `hull pitch ${hullPitch} ` : ''}yaw ${yaw.toFixed(2)} pitch ${(pitch / DEG).toFixed(1)}`, d: gap(tank, entity, mount) });
      }
      state.visualPitch = 0.04;
      if (!turretless) {
        // traverse: ten ticks at the rated slew, the visual synced each tick, the shot on the tenth
        const rate = spec.turretTraverseDegS * DEG;
        state.turretYaw = 0.2; state.turretYawRate = rate;
        for (let tick = 0; tick < 10; tick++) {
          state.turretYaw += rate * SIM_DT; state.gunPitch = Math.max(pitches[2], floorAt(state.turretYaw)); tank.syncFromState(state, SIM_DT);
        }
        rows.push({ id, kind: mount.kind, mount: mount.launcher ? `tube ${mount.tube}` : mount.cannonMuzzle >= 0 ? `mouth ${mount.cannonMuzzle}` : 'bore',
          pose: `traverse ${spec.turretTraverseDegS} deg/s`, d: gap(tank, entity, mount) });
      }
    }
  } finally { tank.dispose(); }
}

if (process.env.COT_FIT_DUMP) for (const row of rows) console.log(`${row.id} ${row.kind} ${row.mount} ${row.pose} ${(row.d * 100).toFixed(2)} cm`);
const worstById = new Map();
for (const row of rows) if (!worstById.has(row.id) || row.d > worstById.get(row.id).d) worstById.set(row.id, row);
const describe = (row) => `${row.id} ${(row.d * 100).toFixed(1)} cm (${row.kind} ${row.mount}, ${row.pose})`;
const beyond = [...worstById.values()].filter((row) => row.d > P99_M).sort((a, b) => b.d - a.d);
const quantile = (list, q) => list.length ? list[Math.min(list.length - 1, Math.floor(list.length * q))] : 0;
/** The rule over every shot of every id (276: the combat frame is the measured rig, so no id is pinned): p99 and max. */
function bound(distances) {
  const sorted = [...distances].sort((x, y) => x - y);
  const p99 = quantile(sorted, 0.99), max = sorted.at(-1) ?? 0;
  return { p99, max, ok: p99 <= P99_M && max <= MAX_M };
}
// planted: ninety-nine shots on their mouth and one 12 cm off fail the max; a hundred at 2 cm hold
assert.equal(bound([...Array(99).fill(0.001), 0.12]).ok, false, 'control: one shot 12 cm off fails the rule');
assert.equal(bound(Array(100).fill(0.02)).ok, true, 'control: every shot within 2 cm holds');
const { p99, max, ok } = bound(rows.map((row) => row.d));
const kinds = Object.entries(rows.reduce((count, row) => ({ ...count, [row.kind]: (count[row.kind] ?? 0) + 1 }), {}))
  .map(([kind, count]) => `${count} ${kind}`).join(', ');
console.log(`gunPoseVisualFit: ${built} ids, ${rows.length} shots (${kinds}); p99 ${(p99 * 100).toFixed(2)} cm, max ${(max * 100).toFixed(2)} cm; `
  + `${beyond.length} id(s) beyond 3 cm, ${beyond.filter((row) => row.d > MAX_M).length} beyond 10 cm`
  + `${beyond.length ? `:\n  ${beyond.map(describe).join('\n  ')}` : ''}`);
assert.ok(ok, `the drawn muzzle strays from the fired one (p99 ${(p99 * 100).toFixed(2)} cm, max ${(max * 100).toFixed(2)} cm; rule p99 <= 3 cm, max <= 10 cm):\n  ${beyond.map(describe).join('\n  ')}`);
