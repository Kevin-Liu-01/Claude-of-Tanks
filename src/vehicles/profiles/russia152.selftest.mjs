// Release 269 (owner 2026-11-04, "NEW RUSSIAN 152 MM TANK LINE"; DECISIONS "2026-11-04 Russian 152 mm line"): the
// Object 292, the Object 477 Molot, the Object 195 and the T-14 152, each on its real base. This receipt is the line's
// photo packet fixture (docs/references/photos/russia-152-20261104.json): each build's envelope is its packet's, the
// Object 292 is the T-80U X hull (owner 2026-11-04: no old T-80 hull), the T-14 152 the T-14's hull, every 152 mm gun's muzzle stands where its spec's
// barrel ends, and the 30 mm cannons are working stations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { auxiliaryWeaponProfile } from '../auxiliaryWeapons.ts';
import { stationDepression, stationProbe } from '../../../tools/roof-station-arcs.mjs';

const PACKET = JSON.parse(readFileSync(new URL('../../../docs/references/photos/russia-152-20261104.json', import.meta.url), 'utf8'));
const IDS = ['object292', 'object477_molot', 'object195', 't14_152'];
const box = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Combat: each fires a 152 mm gun with three rounds, harder per shot and slower than its 125 mm peers, from fewer rounds
const t14 = getSpec('t14_armata'), t80u = getSpec('t80u');
for (const id of IDS) {
  const spec = getSpec(id);
  assert.equal(spec.gun.caliberMm, 152, `${id} fires a 152 mm gun`);
  assert.equal(spec.gun.shells.length, 3, `${id}: APFSDS, HEAT-FS and HE-FRAG`);
  assert.ok(spec.gun.shells.every((s) => s.caliberMm === 152 && Number.isFinite(s.count)), `${id}: counted 152 mm rounds`);
  assert.ok(spec.gun.shells[0].dmg > t14.gun.shells[0].dmg, `${id}: a heavier hit than the 125 mm's`);
  assert.ok(spec.gun.reloadS > t14.gun.reloadS && spec.gun.reloadS > t80u.gun.reloadS, `${id}: a slower reload than the 125 mm's`);
  const rounds = spec.gun.shells.reduce((n, s) => n + s.count, 0);
  assert.ok(rounds <= 40 && rounds < 45, `${id}: fewer rounds than the T-14's 45 (${rounds})`);
  assert.ok(PACKET.targets[id], `${id}: a target in the photo packet`);
  assert.equal(PACKET.targets[id].caliberMm, 152);
}
assert.ok(getSpec('object292').armor.hullPlates.every((p) => p.kind !== 'era'), 'the Object 292 carries no Kontakt-1 bricks');
// owner 2026-11-04 ("dont use the old t80 hull only use modern new hulls like the nnew t80 x hulll"): the Object 292's build
// reuses the T-80U X recipe, never the legacy T-80 builders
const source292 = readFileSync(new URL('./object292X.ts', import.meta.url), 'utf8');
assert.ok(source292.includes("from './t80uX.ts'") && !/from '\.\/(t80|russia)\.ts'/.test(source292), 'the Object 292 is built on the T-80U X, not the legacy T-80 builders');

for (const quality of ['high', 'low']) {
  const tanks = Object.fromEntries([...IDS, 't80u', 't14_armata'].map((id) => [id,
    createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 })]));
  try {
    for (const id of IDS) {
      const tank = tanks[id], target = PACKET.targets[id], b = box(tank.root);
      assert.ok(near(b.max.x - b.min.x, target.widthM, .01 * target.widthM), `${quality}: ${id} width ${(b.max.x - b.min.x).toFixed(3)} (packet ${target.widthM})`);
      assert.ok(near(b.max.z - b.min.z, target.overallLengthM, .01 * target.overallLengthM), `${quality}: ${id} length ${(b.max.z - b.min.z).toFixed(3)} (packet ${target.overallLengthM})`);
      assert.ok(near(b.max.y, target.tallestM, .01 * target.tallestM), `${quality}: ${id} tallest ${b.max.y.toFixed(3)} (packet ${target.tallestM})`);
      // the muzzle where the hit model's barrel ends
      const spec = getSpec(id), gunG = tank.gunG ?? tank.root.getObjectByName('rig_gun');
      const pivot = new THREE.Vector3(...spec.armor.turretPivot).add(new THREE.Vector3(...spec.armor.gunPivot));
      const muzzleZ = pivot.z + spec.armor.gunBarrel.lengthM;
      assert.ok(near(b.max.z, muzzleZ, .03), `${quality}: ${id}'s muzzle at the spec's barrel end (${b.max.z.toFixed(3)} v ${muzzleZ.toFixed(3)})`);
      assert.ok(gunG, `${quality}: ${id} has a gun rig`);
    }
    // the Object 292's hull is the T-80U X's: the same hull group's envelope, its width 2 cm more over Kubinka's rubber skirts
    const hull = (id) => box(tanks[id].root.getObjectByName('rig_hull') ?? tanks[id].hullG);
    const h292 = hull('object292'), hu = hull('t80u');
    for (const k of ['x', 'y', 'z']) assert.ok(near(h292.min[k], hu.min[k], k === 'x' ? .02 : .01) && near(h292.max[k], hu.max[k], k === 'x' ? .02 : .01), `${quality}: the Object 292's hull is the T-80U X's (${k}: ${h292.min[k].toFixed(3)}..${h292.max[k].toFixed(3)} v ${hu.min[k].toFixed(3)}..${hu.max[k].toFixed(3)})`);
    // the T-14 152's hull is the T-14's: the same length and floor; its field kit (owner 2026-11-05: the net and ghillie
    // over the engine deck, the drapes down the rear slat cages) stands at most 2 cm wider and 3 cm higher
    const h152 = hull('t14_152'), h14 = hull('t14_armata');
    assert.ok(near(h152.min.z, h14.min.z, .002) && near(h152.max.z, h14.max.z, .002) && near(h152.min.y, h14.min.y, .002), `${quality}: the T-14 152's hull is the T-14's (length, floor)`);
    assert.ok(h152.max.y >= h14.max.y - .002 && h152.max.y <= h14.max.y + .03, `${quality}: the T-14 152's kit over the T-14's deck (${h152.max.y.toFixed(3)} v ${h14.max.y.toFixed(3)})`);
    for (const k of ['min', 'max']) assert.ok(Math.abs(h152[k].x) <= Math.abs(h14[k].x) + .02 && Math.abs(h152[k].x) >= Math.abs(h14[k].x) - .002, `${quality}: the T-14 152's kit beside the T-14's hull (x ${h152[k].x.toFixed(3)} v ${h14[k].x.toFixed(3)})`);
    // the 30 mm cannons beside the 152s are working stations that pitch in their cradles
    for (const [id, name] of [['object195', 'object195_2a42'], ['object477_molot', 'molot_gsh30']]) {
      const station = tanks[id].root.getObjectByName(name);
      assert.ok(station && station.userData.caliberMm === 30, `${quality}: ${id} carries its 30 mm station`);
      assert.ok(station.getObjectByName('auxiliaryWeaponPitch'), `${quality}: ${id}'s 30 mm pitches`);
    }
  } finally { for (const tank of Object.values(tanks)) tank.dispose(); }
}
// The 30 mm stations' arcs and depression tables hold against the built stock (tools/roof-station-arcs.mjs, the M551 TTS
// receipt's check 8, src/sim/roofStations.selftest.mjs): every degree of the arc is clear from level to full elevation,
// full depression outside the table, each table entry and the smaller of two neighbouring entries between them, and the
// arc ends within 4 degrees of the stock it keeps clear of
for (const [id, name] of [['object195', 'object195_2a42'], ['object477_molot', 'molot_gsh30']]) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, decor: true });
  try {
    tank.root.updateMatrixWorld(true);
    const station = tank.root.getObjectByName(name), profile = auxiliaryWeaponProfile(30, id), DEG = Math.PI / 180;
    const { probe } = stationProbe(tank.root, station), [lo, hi] = station.userData.yawArc, table = station.userData.depressionByYaw;
    const held = (yaw) => {
      if (yaw < table[0][0] || yaw > table.at(-1)[0]) return profile.depressionRad;
      const k = table.findIndex(([y]) => y >= yaw - 1e-9);
      return table[k][0] <= yaw + 1e-9 ? table[k][1] : Math.min(table[k - 1][1], table[k][1]);
    };
    for (let yaw = lo; yaw <= hi + 1e-9; yaw += DEG) {
      for (let pitch = 0; pitch <= profile.elevationRad + 1e-9; pitch += .05) assert.ok(!probe(yaw, pitch), `${name}: clear at ${(yaw / DEG).toFixed(0)} deg, +${pitch.toFixed(2)}`);
      assert.ok(!probe(yaw, -held(yaw)), `${name}: its held depression ${held(yaw)} rad is clear at ${(yaw / DEG).toFixed(0)} deg`);
    }
    for (const [yaw, depression] of table) {
      const [deepest] = stationDepression(tank.root, station, profile, [yaw / DEG]);
      assert.ok(depression <= deepest + 1e-9, `${name}: the table at ${(yaw / DEG).toFixed(0)} deg within the measured limit (${depression} v ${deepest})`);
    }
    const blockedNear = (from, sign) => { for (let k = 1; k <= 4; k++) for (let p = 0; p <= profile.elevationRad; p += .05) if (probe(from + sign * k * DEG, p)) return true; return false; };
    assert.ok(blockedNear(lo, -1) && blockedNear(hi, 1), `${name}: the arc ends within 4 degrees of the stock it keeps clear of`);
  } finally { tank.dispose(); }
}
console.log('russia152.selftest: the 152 mm line hits harder and reloads slower from fewer rounds; the Object 292 on the T-80U X hull, the T-14 152 on the T-14\'s; envelopes are the packet\'s; the 30 mm cannons work inside measured arcs and depression tables');
