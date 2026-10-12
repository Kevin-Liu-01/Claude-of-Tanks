// physics lane scratch (edge stand): one composer launch traced against the hull box: where the turret's COM is over
// the deck, its lowest corners, which corners touch (deck or ground).
import * as THREE from 'three';
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wreckTurretProfile } = await import('../src/sim/wreckTurrets.ts');
const { createWreckTurretDriver } = await import('../src/vehicles/wreckTurretDriver.ts');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const id = arg('id', 'm1a2'), seed = Number(arg('seed', '14')), from = Number(arg('from', '0')), to = Number(arg('to', '6'));
const mulberry = (s) => { let a = s >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const spec = TANK_SPECS[id];
const prof = wreckTurretProfile(spec, 1);
const root = new THREE.Group(); root.rotation.y = (seed * 0.6180339) % 1 * Math.PI * 2; root.updateMatrixWorld(true);
const turret = new THREE.Group(); turret.position.set(prof.pivot[0], prof.pivot[1], prof.pivot[2]); turret.rotation.y = ((seed * 0.414) % 1 - 0.5) * 2;
const gun = new THREE.Group(); turret.add(gun); root.add(turret);
const drv = createWreckTurretDriver({ spec, root, turret, gun, ground: () => () => 0, random: mulberry(seed * 7919), trail() {}, landing() {} });
drv.begin(true, turret.position.clone(), null);
const inv = root.matrixWorld.clone().invert();
const hc = prof.hullCenter, hh = prof.hullHalf, tc = prof.turretCenter, th = prof.turretHalf;
console.log(`hull box centre ${hc.map((v) => v.toFixed(2))} half ${hh.map((v) => v.toFixed(2))} (top y ${(hc[1] + hh[1]).toFixed(2)}); turret box centre ${tc.map((v) => v.toFixed(2))} half ${th.map((v) => v.toFixed(2))}`);
const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Vector3();
for (let f = 0; f <= to * 60; f++) {
  const age = f / 60;
  drv.update(age, f ? 1 / 60 : 0);
  if (age < from || f % 6) continue;
  turret.updateMatrixWorld(true);
  const m = turret.matrixWorld.clone();
  // corners in the hull's frame
  const corners = [];
  for (let k = 0; k < 8; k++) {
    c.set(tc[0] + (k & 1 ? 1 : -1) * th[0], tc[1] + (k & 2 ? 1 : -1) * th[1], tc[2] + (k & 4 ? 1 : -1) * th[2]).applyMatrix4(m).applyMatrix4(inv);
    corners.push(c.clone());
  }
  const low = corners.map((v, k) => ({ k, y: v.y, x: v.x, z: v.z })).sort((a, b) => a.y - b.y).slice(0, 4);
  const com = new THREE.Vector3(tc[0], tc[1], tc[2]).applyMatrix4(m).applyMatrix4(inv);
  const onDeck = (v) => Math.abs(v.x - hc[0]) <= hh[0] + 0.05 && Math.abs(v.z - hc[2]) <= hh[2] + 0.05;
  m.decompose(p, q, s);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  console.log(`${age.toFixed(1)} tilt ${(Math.acos(up.y) * 57.3).toFixed(0)} boxC (${com.x.toFixed(2)}, ${com.y.toFixed(2)}, ${com.z.toFixed(2)}) ${onDeck(com) ? 'over deck' : 'off deck'} | low: ${low.map((l) => `${l.k}:${l.y.toFixed(2)}@(${l.x.toFixed(1)},${l.z.toFixed(1)})`).join(' ')}`);
}
