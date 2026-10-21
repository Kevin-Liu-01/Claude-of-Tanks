// Release 229: the fleet's working pintles ride their cradles (workingPintleCradleAudit.test-support.mjs; the whole-fleet
// measurement runs in fleetPassDefault on its one build per vehicle). This receipt holds the rule at its sources and its
// construction without building the fleet:
// - every FITTINGS.pintleMG call that makes a working station (`working` or `remoteControlled`) passes ridingCradle,
//   unless its host builds the cradle round the gun (mount: 'external-cradle');
// - the riding rig of every class and shield the fleet draws, standalone, keeps 1.5 mm from its own mount through the
//   heavy and rifle profiles' pitch ranges and its recoil stroke, with its yaw stage one mesh in the mount's tone and no
//   slot the fleet rig of the same options does not draw (materials flat);
// - negative control: the fleet's yaw-stage rig of the same options fails the audit.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { FITTINGS } from './profiles/kit.ts';
import { assertWorkingPintleClear } from './workingPintleCradleAudit.test-support.mjs';
import { stationSelfClearance } from './cnTurretGeometry.test-support.mjs';

// ---- sources: every working pintleMG call rides its cradle
const SRC = new URL('..', import.meta.url).pathname;
const files = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
  if (e.isDirectory()) walk(join(dir, e.name)); else if (e.name.endsWith('.ts')) files.push(join(dir, e.name)); } };
walk(SRC);
let calls = 0;
const missing = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (let i = src.indexOf('FITTINGS.pintleMG('); i >= 0; i = src.indexOf('FITTINGS.pintleMG(', i + 1)) {
    let j = i + 'FITTINGS.pintleMG('.length, depth = 1;
    while (depth && j < src.length) { const c = src[j++]; if ('({['.includes(c)) depth++; else if (')}]'.includes(c)) depth--; }
    const call = src.slice(i, j).replace(/\/\/[^\n]*/g, '');
    if (!/\b(working|remoteControlled)\s*:/.test(call) || /mount\s*:\s*'external-cradle'/.test(call)) continue;
    calls++;
    if (!/\bridingCradle\s*:/.test(call)) missing.push(`${file.slice(SRC.length)}:${src.slice(0, i).split('\n').length}`);
  }
}
assert.ok(calls >= 70, `the scan finds the fleet's working pintle calls (${calls})`);
assert.deepEqual(missing, [], `every working FITTINGS.pintleMG station rides its cradle (ridingCradle): ${missing.join(', ')}`);

// ---- construction: the riding rig per class and shield, against the fleet rig of the same options
const mat = () => new THREE.MeshStandardMaterial();
const mats = { dark: mat(), detail: mat(), shadow: mat(), glass: mat(), hull: mat(), gunmetalAmmo: mat() };
const slotsOf = (root) => { const s = new Set(); root.traverse((o) => { if (o.isMesh) s.add(o.userData.fittingSlot); }); return s; };
const yawMeshes = (f) => f.children.filter((c) => c.isMesh);
const CASES = [
  // the classes and shields the fleet's working pintles draw (each class's own feed side; the NSVT and Kord feed from
  // the right, so their side arm stands on the left)
  { cls: 'm2', working: true },
  { cls: 'm2', shield: 'armored', scale: .78, remoteControlled: true },
  { cls: 'm2', shield: true, scale: .94, ring: { r: .17, stubs: 3 }, working: true },
  { cls: 'heavy', tone: 'dark', scale: .82, remoteControlled: true },
  { cls: 'dshk', shield: true, scale: 1.08, working: true },
  { cls: 'nsvt', shield: true, scale: .88, working: true },
  { cls: 'nsvt', feed: 'left', reflexSight: true, ring: { r: .155, stubs: 3 }, working: true },
  { cls: 'kord', tone: 'dark', shield: true, scale: .72, remoteControlled: true },
  { cls: 'mag', tone: 'dark', riser: .10, working: true },
  { cls: 'mag58', shield: 'low', scale: 1.02, working: true },
  { cls: 'mg3', shield: true, scale: .96, working: true },
  { cls: 'qjc88', shield: true, ring: { r: .16, stubs: 3 }, working: true },
];
const HEAVY = { depression: .18, elevation: .75 };
let worst = Infinity;
for (const opts of CASES) {
  const label = `${opts.cls}${opts.shield ? ` ${opts.shield === true ? 'standard' : opts.shield} shield` : ''}${opts.remoteControlled ? ' remote' : ''}`;
  const riding = FITTINGS.pintleMG({ mats, tone: 'two-tone', ammo: true, seed: 229, ...opts, ridingCradle: true });
  riding.updateMatrixWorld(true);
  const self = assertWorkingPintleClear(label, riding, riding.getObjectByName('auxiliaryWeaponPitch'));
  worst = Math.min(worst, self.d);
  const yaw = yawMeshes(riding);
  assert.equal(yaw.length, 1, `${label}: the yaw stage is one mesh (${yaw.map((m) => m.userData.fittingSlot)})`);
  assert.equal(yaw[0].userData.fittingSlot, opts.tone === 'dark' ? 'dark' : 'detail', `${label}: the yaw stage in the mount's tone`);
  const fleet = FITTINGS.pintleMG({ mats, tone: 'two-tone', ammo: true, seed: 229, ...opts });
  fleet.updateMatrixWorld(true);
  for (const slot of slotsOf(riding)) assert.ok(slotsOf(fleet).has(slot) || slot === 'detail' || slot === 'dark',
    `${label}: the riding rig draws no slot the fleet rig does not (${slot})`);
  // negative control: the fleet's yaw-stage cradle and shield
  assert.throws(() => assertWorkingPintleClear(label, fleet, fleet.getObjectByName('auxiliaryWeaponPitch')),
    /rides its cradle/, `${label}: negative control: the fleet rig is not a riding cradle`);
  for (const f of [riding, fleet]) f.traverse((o) => o.geometry?.dispose?.());
}
// the fleet rig's own moving gun, measured, goes through its mount (the defect the riding cradle removes)
{
  const fleet = FITTINGS.pintleMG({ mats, cls: 'm2', tone: 'two-tone', ammo: true, seed: 229, shield: true, working: true });
  fleet.updateMatrixWorld(true);
  const self = stationSelfClearance(fleet, fleet.getObjectByName('auxiliaryWeaponPitch'), HEAVY);
  assert.ok(self.d < .0015 && self.crossings > 0, `negative control: the fleet rig's gun passes through its own mount (${(self.d * 1000).toFixed(1)} mm, ${self.crossings} pairs)`);
  fleet.traverse((o) => o.geometry?.dispose?.());
}
for (const m of Object.values(mats)) m.dispose();
console.log(`workingPintleCradle: ${calls} working pintle calls ride their cradles; ${CASES.length} classes and shields clear their own mounts (closest ${(worst * 1000).toFixed(1)} mm), the fleet rig fails PASS`);
