// physics lane scratch (edge stand): the composer path (wreckTurretDriver's local body) over many seeded launches on
// flat ground with the hull box, per tank: how long a turret stands on its side/end (tilt 35–145°, slow) before it
// falls, and where it comes to rest.   node edge-stats.mjs [--ids=t90m,m1a2,kv2] [--n=200] [--verbose=seed]
import * as THREE from 'three';
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wreckTurretProfile } = await import('../src/sim/wreckTurrets.ts');
const { createWreckTurretDriver } = await import('../src/vehicles/wreckTurretDriver.ts');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const ids = arg('ids', 't90m,m1a2,kv2').split(',');
const n = Number(arg('n', '200'));
const verbose = arg('verbose', null);
const mulberry = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const up = new THREE.Vector3(), q = new THREE.Quaternion(), qPrev = new THREE.Quaternion(), p = new THREE.Vector3(), pPrev = new THREE.Vector3();
const out = {};
for (const id of ids) {
  const spec = TANK_SPECS[id];
  const prof = wreckTurretProfile(spec, 1);
  const stands = [], rests = { base: 0, roof: 0, side: 0, end: 0, moving: 0 }, frozenOnEdge = [], apexes = [], dists = []; let onHull = 0, seatedLevel = 0, endStands = [];
  for (let seed = 1; seed <= n; seed++) {
    const root = new THREE.Group(); root.rotation.y = (seed * 0.6180339) % 1 * Math.PI * 2; root.updateMatrixWorld(true);
    const turret = new THREE.Group(); turret.position.set(prof.pivot[0], prof.pivot[1], prof.pivot[2]); turret.rotation.y = ((seed * 0.414) % 1 - 0.5) * 2;
    const gun = new THREE.Group(); turret.add(gun); root.add(turret);
    const rnd = mulberry(seed * 7919);
    const drv = createWreckTurretDriver({ spec, root, turret, gun, ground: () => () => 0, random: rnd, trail() {}, landing() {} });
    drv.begin(true, turret.position.clone(), null);
    let standStart = -1, longest = 0, landed = false, lastTilt = 0, maxY = 0, endStart = -1, endLongest = 0;
    const y0 = prof.pivot[1];
    const fps = 60, frames = 9 * fps;
    const log = [];
    for (let f = 0; f <= frames; f++) {
      const age = f / fps;
      drv.update(age, f === 0 ? 0 : 1 / fps);
      turret.updateMatrixWorld(true);
      turret.matrixWorld.decompose(p, q, new THREE.Vector3());
      up.set(0, 1, 0).applyQuaternion(q);
      const tilt = Math.acos(Math.max(-1, Math.min(1, up.y))) * 180 / Math.PI;
      const v = f ? p.distanceTo(pPrev) * fps : 0;
      const w = f ? 2 * Math.acos(Math.min(1, Math.abs(q.dot(qPrev)))) * fps : 0;
      maxY = Math.max(maxY, p.y);
      if (!landed && f > 10 && p.y < maxY - 0.5) landed = true;
      const standing = landed && tilt > 35 && tilt < 145 && v < 0.8 && w < 1.2;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const onEnd = landed && Math.abs(fwd.y) > 0.8 && v < 0.8 && w < 1.2;
      if (onEnd && endStart < 0) endStart = age;
      if (!onEnd && endStart >= 0) { endLongest = Math.max(endLongest, age - endStart); endStart = -1; }
      if (standing && standStart < 0) standStart = age;
      if (!standing && standStart >= 0) { longest = Math.max(longest, age - standStart); standStart = -1; }
      lastTilt = tilt;
      if (verbose && Number(verbose) === seed && f % 6 === 0) log.push(`${age.toFixed(2)} y ${p.y.toFixed(2)} tilt ${tilt.toFixed(0)} v ${v.toFixed(2)} w ${w.toFixed(2)}`);
      pPrev.copy(p); qPrev.copy(q);
    }
    if (standStart >= 0) { const d = 9 - standStart; longest = Math.max(longest, d); frozenOnEdge.push(seed); }
    if (endStart >= 0) endLongest = Math.max(endLongest, 9 - endStart);
    endStands.push(endLongest);
    apexes.push(maxY - y0);
    { const hp = new THREE.Vector3(prof.hullCenter[0], 0, prof.hullCenter[2]).applyMatrix4(root.matrixWorld); dists.push(Math.hypot(p.x - hp.x, p.z - hp.z));
      const local = p.clone().applyMatrix4(root.matrixWorld.clone().invert());
      const deck = Math.abs(local.x - prof.hullCenter[0]) <= prof.hullHalf[0] + 0.3 && Math.abs(local.z - prof.hullCenter[2]) <= prof.hullHalf[2] + 0.3 && local.y > prof.hullCenter[1] + prof.hullHalf[1] - 0.3;
      if (deck) { onHull++; if (lastTilt < 12) seatedLevel++; } }
    stands.push(longest);
    if (process.argv.includes("--detail") && longest > 0.5) { const zx = new THREE.Vector3(0, 0, 1).applyQuaternion(q); const xx = new THREE.Vector3(1, 0, 0).applyQuaternion(q); console.log(`  ${id} seed ${seed}: longest ${longest.toFixed(2)} s, final tilt ${lastTilt.toFixed(1)}, x.y ${xx.y.toFixed(3)} z.y ${zx.y.toFixed(3)}, y ${p.y.toFixed(2)}, ${standStart >= 0 ? 'still standing' : 'fell'}`); }
    if (lastTilt < 35) rests.base++; else if (lastTilt > 145) rests.roof++;
    else {
      // side (the turret's x axis near vertical) or end (its z axis near vertical: standing on the bustle or the face)
      const zx = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      if (Math.abs(zx.y) > 0.7) rests.end++; else rests.side++;
    }
    if (verbose && Number(verbose) === seed) console.log(log.join('\n'));
  }
  stands.sort((a, b) => a - b);
  const pct = (x) => stands[Math.min(stands.length - 1, Math.floor(stands.length * x))].toFixed(2);
  const srt = (a) => a.slice().sort((x, y) => x - y); const qq = (a, x) => srt(a)[Math.min(a.length - 1, Math.floor(a.length * x))].toFixed(1);
  out[id] = { n, standP50: pct(0.5), standP90: pct(0.9), standMax: stands[stands.length - 1].toFixed(2), over1s: stands.filter((s) => s > 1).length, over05s: stands.filter((s) => s > 0.5).length, endOver05s: endStands.filter((s) => s > 0.5).length, endMax: Math.max(...endStands).toFixed(2), rests, standingAtEnd: frozenOnEdge.length,
    apex: `${qq(apexes, 0.1)}/${qq(apexes, 0.5)}/${qq(apexes, 0.9)}`, dist: `${qq(dists, 0.1)}/${qq(dists, 0.5)}/${qq(dists, 0.9)}`, onHull, seatedLevel };
  console.log(id, JSON.stringify(out[id]), 'standing at 9 s:', frozenOnEdge.slice(0, 12).join(' '));
}
