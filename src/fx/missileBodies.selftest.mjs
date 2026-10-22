// missileBodies.selftest.mjs — (FX lane, 2026-10-15; the coordinator's brief: calibre-true Kornet / TOW / Spike-style
// bodies with fins, a nozzle and a seeker nose, matched to each launcher's tube, on the wire and the trail) every guided
// round in the fleet flies its family's airframe at its own calibre; the airframes carry their families' features; the
// pool draws per airframe without allocating; the wire, the beacon and the trail all leave from the drawn tail.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { MISSILE_LOOKS, missileLookFor } from './missileLooks.ts';
import { MISSILE_AIRFRAMES, airframeOf, buildAirframeGeometry, createMissileBodies, missileBodyDims, missileTailM } from './missileBodies.ts';
import { createSceneLightUniforms } from './sceneLight.ts';

// ---- 1. one airframe per look, every guided round in the fleet at its calibre ----------------------------------------
for (const id of Object.keys(MISSILE_LOOKS)) assert.ok(MISSILE_AIRFRAMES[id], `${id}: an airframe`);
const dims = [0, 0];
let rounds = 0;
for (const spec of Object.values(TANK_SPECS)) {
  for (const r of spec?.gun?.shells ?? []) {
    if (!r?.guided) continue;
    rounds++;
    const look = missileLookFor(r.name, r.soundProfile, false);
    missileBodyDims(look.id, r.caliberMm, dims);
    assert.ok(Math.abs(dims[0] - r.caliberMm * 0.94 / 1000) < 1e-9, `${spec.id} ${r.name}: the body fills its ${r.caliberMm} mm tube`);
    assert.ok(dims[1] > 0.5 && dims[1] < 2.6, `${spec.id} ${r.name}: a missile's length (${dims[1].toFixed(2)} m)`);
  }
}
assert.ok(rounds >= 30, `the fleet's guided rounds (${rounds})`);
// the published sizes
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(3)} vs ${b}`);
near(missileTailM('tow', 152), 1.52, 0.03, 'TOW-2A with its probe out');
near(missileTailM('kornet', 152), 1.2, 0.02, 'Kornet');
near(missileTailM('konkurs', 135), 1.165, 0.02, 'Konkurs');
near(missileTailM('spike', 130), 1.2, 0.02, 'Spike LR');
near(missileTailM('hellfire', 178), 1.63, 0.02, 'Hellfire');
near(missileTailM('mclos', 125), 0.86, 0.02, 'Malyutka');
near(missileTailM('rocket', 220), 3.3, 0.02, "TOS-1A's rocket");
near(missileTailM('kornet', 70), 0.55, 0.01, 'a 70 mm round of the same airframe scales with its calibre');
missileBodyDims('tow', 0, dims);
near(dims[0], 0.152 * 0.94, 1e-9, 'no calibre: the family\'s own');
missileBodyDims('tow', 9999, dims);
near(dims[0], 0.152 * 0.94, 1e-9, 'an absurd calibre: the family\'s own');
assert.equal(airframeOf('nonesuch').id, 'konkurs');

// ---- 2. the airframes carry their families' features ------------------------------------------------------------------
const features = (id) => {
  const g = buildAirframeGeometry(MISSILE_AIRFRAMES[id]);
  const pos = g.attributes.position.array, nrm = g.attributes.normal.array, part = g.attributes.aPart.array;
  let glass = 0, dark = 0, maxR = 0, minZ = 0, maxZ = -1, probeR = 1;
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    assert.ok(Number.isFinite(x + y + z), `${id}: finite positions`);
    const nl = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
    assert.ok(Math.abs(nl - 1) < 1e-3, `${id}: unit normals`);
    if (part[i * 4 + 3] > 0.9) glass++;
    if (part[i * 4] < 0.3 && part[i * 4 + 3] < 0.5) dark++;
    maxR = Math.max(maxR, Math.hypot(x, y));
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    // the body's radius just behind the nose (calibres), on the tip's first 4 % of the length
    if (z < -0.005 && z > -0.04) probeR = Math.min(probeR, Math.hypot(x, y) || 1);
  }
  return { tris: pos.length / 9, glass, dark, maxR, minZ, maxZ, probeR };
};
for (const id of Object.keys(MISSILE_AIRFRAMES)) {
  const a = MISSILE_AIRFRAMES[id], f = features(id);
  near(f.maxZ, 0, 1e-6, `${id}: the nose at the round`);
  near(f.minZ, -1, 1e-6, `${id}: the tail a length behind (the instance scales z by the length)`);
  const span = Math.max(...a.fins.map((s) => s.span)) / 2;
  near(f.maxR, span, 0.06, `${id}: fins out to their published span`);
  assert.equal(f.glass > 0, a.nose === 'seeker', `${id}: a glass seeker dome only on a seeker nose`);
  assert.ok(f.dark > 0, `${id}: a dark nozzle and beacon at the tail`);
  assert.ok(f.tris < 2400, `${id}: a light airframe (${f.tris} triangles)`);
}
assert.ok(MISSILE_AIRFRAMES.tow.nose === 'probe' && MISSILE_AIRFRAMES.tow.probe[0] >= 2 && MISSILE_AIRFRAMES.tow.fins.length === 2
  && MISSILE_AIRFRAMES.tow.sideNozzles > 0, 'TOW-2A: the extended probe, mid wings and tail fins, side nozzles');
assert.ok(MISSILE_AIRFRAMES.kornet.fins.some((s) => s.n === 2 && s.root[1] < 3) && MISSILE_AIRFRAMES.kornet.fins.some((s) => s.n === 4 && s.root[1] >= 7.5),
  'Kornet: two nose canards and four folding tail wings');
assert.ok(MISSILE_AIRFRAMES.spike.nose === 'seeker' && MISSILE_AIRFRAMES.hellfire.nose === 'seeker', 'Spike and Hellfire: seeker domes');
assert.ok(MISSILE_AIRFRAMES.mclos.fins[0].span >= 3, "Malyutka's broad wings");
assert.ok(features('tow').probeR < 0.25, "TOW's probe is thin at its tip");

// ---- 3. the pool: per airframe, capacity-bound, lit by the scene's rig, no allocation in write -------------------------
{
  const light = createSceneLightUniforms();
  const b = createMissileBodies(light, 3);
  assert.equal(b.material.uniforms.uSunDir, light.uSunDir, 'the scene light is shared, not copied');
  const meshes = b.group.children;
  assert.equal(meshes.length, Object.keys(MISSILE_AIRFRAMES).length, 'one instanced mesh per airframe');
  assert.ok(meshes.every((m) => m.material === b.material), 'one program for every airframe');
  const nose = new THREE.Vector3(10, 2, 0), dir = new THREE.Vector3(1, 0, 0);
  b.begin();
  for (let i = 0; i < 4; i++) assert.equal(b.write('tow', nose, dir, 0, 0.143, 1.52, 0x4a4f43), i < 3, `TOW ${i}: within capacity`);
  assert.equal(b.write('spike', nose, dir, 0, 0.12, 1.2, 0x55594a), true);
  b.end();
  const tow = meshes.find((m) => m.name === 'fx-missile-body-tow'), spike = meshes.find((m) => m.name === 'fx-missile-body-spike');
  assert.equal(tow.count, 3); assert.equal(spike.count, 1); assert.equal(b.count, 4);
  assert.ok(meshes.filter((m) => m.visible).length === 2, 'an airframe with nothing in flight draws nothing');
  // the instance: nose at the round, the tail a length back along the flight
  const m = new THREE.Matrix4(); tow.getMatrixAt(0, m);
  const tail = new THREE.Vector3(0, 0, -1).applyMatrix4(m), tip = new THREE.Vector3(0, 0, 0).applyMatrix4(m);
  near(tip.x, 10, 1e-6, 'the nose at the round'); near(tail.x, 10 - 1.52, 1e-6, 'the tail its length behind');
  b.reset();
  assert.ok(meshes.every((m) => !m.visible && m.count === 0), 'reset clears every airframe');
  const src = await readFile(new URL('./missileBodies.ts', import.meta.url), 'utf8');
  const write = src.slice(src.indexOf('    write(lookId, nose, dir, roll'), src.indexOf('    end() {'));
  assert.doesNotMatch(write, /new |\[\]|\{\s*\}/, 'write allocates nothing');
}

// ---- 4. the wiring: every frame's body, its beacon, its wire and its trail leave from the drawn tail ------------------
{
  const fx = await readFile(new URL('./effects.ts', import.meta.url), 'utf8');
  assert.match(fx, /bodies\.write\(look\.id, shellPos, direction, roll, _bodyDims\[0\], _bodyDims\[1\], look\.bodyHex\);/);
  assert.match(fx, /_atgmFlareObject\.position\.copy\(shellPos\)\.addScaledVector\(direction, -\(_bodyDims\[1\] \+ 0\.04\)\);/, 'the beacon at the tail');
  assert.match(fx, /trail\.calMm = shell\.spec\?\.caliberMm \|\| \(at \? at\[3\] \?\? 0 : 0\) \|\| calibreByShooter\.get/,
    "the round's calibre: its spec, else its shot event's, else its launcher's round");
  assert.match(fx, /trail\.tailM = missileBodyDims\(trail\.look\.id, trail\.calMm, _bodyDims\)\[1\];/);
  assert.match(fx, /const back = trail\.tailM \?\? 1\.3;\n    wires\.tail\(/, 'the wire leaves the drawn tail');
  assert.match(fx, /const motorBack = trail\.tailM \?\? 1\.3;/, 'the trail is born at the drawn tail');
  // (ac130-fx-228 r2) along the drawn axis (_mDir: a gunship missile curving off its wing pylon onto its line); (ac130-
  // barrels-230) at the drawn body's size (bodyK: off the lens's rail its rail round's size, 1 for every other round)
  assert.match(fx, /const tailM = \(trail\.tailM \?\? 1\.3\) \* bodyK;\n    _mHead\.copy\(_mPos\)\.addScaledVector\(_mDir, -tailM\);/, 'the motor glow at the drawn tail');
  assert.match(fx, /let bodyK = 1;/, 'every round but the lens rail\'s at its own size');
  assert.doesNotMatch(fx, /0\.65 \+ 0\.625 \* look\.bodyLen/, 'no offset of the old cylinder is left');
  assert.match(fx, /for \(const id of Object\.keys\(MISSILE_AIRFRAMES\)\) writeGuidedBody\(pos, dir, MISSILE_LOOKS\[id\] \?\? MISSILE_LOOKS\.konkurs\);/,
    'the covered warm draws every airframe (their buffers upload under the cover)');
  assert.match(fx, /const roll = look\.spinHz \? Math\.PI \* 2 \* look\.spinHz \* \(timed \? t : 0\) \+ seedU \* 6\.2831853 : Math\.PI \/ 4;/,
    'a roll-stabilised round rolls with its tracer\'s helix (missileSpin\'s phase)');
}
console.log(`missileBodies: ${rounds} guided rounds at their calibres on ${Object.keys(MISSILE_AIRFRAMES).length} airframes (probes, canards, wings, tail fins, seeker domes, side nozzles), one program, the wire, beacon and trail from the drawn tail`);
