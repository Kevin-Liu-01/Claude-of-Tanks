import * as THREE from 'three';
import { getSpec } from '../src/vehicles/specs.ts';
import { createWreckTurretDriver } from '../src/vehicles/wreckTurretDriver.ts';
import { wreckTurretProfile } from '../src/sim/wreckTurrets.ts';
const spec = getSpec('t90m');
const prof = wreckTurretProfile(spec);
const root = new THREE.Group(); root.position.set(190, 3.04, 391); root.rotation.set(0, 250 * Math.PI / 180, 0, 'YXZ');
const turret = new THREE.Group(); turret.position.set(prof.pivot[0], prof.pivot[1], prof.pivot[2]); turret.rotation.y = 20 * Math.PI / 180; root.add(turret);
const gun = new THREE.Group(); turret.add(gun);
const scene = new THREE.Scene(); scene.add(root);
let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const landings = [];
const d = createWreckTurretDriver({ spec, root, turret, gun, ground: () => (x, z) => 3.04, random: rnd, trail() {}, landing: (x, y, z, s) => landings.push([x.toFixed(2), y.toFixed(2), z.toFixed(2), s.toFixed(2)]) });
d.begin(true, turret.position.clone(), 0);
const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
for (let f = 0; f <= 60; f++) {
  const age = f * 0.1;
  d.update(age, f === 0 ? 0 : 0.1);
  turret.updateWorldMatrix(true, false); turret.matrixWorld.decompose(p, q, s);
  if (f % 2 === 0) console.log(age.toFixed(1), 'y', p.y.toFixed(2), 'x', p.x.toFixed(2), 'z', p.z.toFixed(2));
}
console.log('landings', JSON.stringify(landings));
