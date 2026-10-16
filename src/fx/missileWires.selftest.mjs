// missileWires.selftest.mjs — FX lane 10-14 (the owner: "make sure the actual tow from tow missiles is attached to the
// tow launcher if it has a missile with string"). A wire-guided round pays out a wire from its launcher's tube to its
// tail for the whole flight: laid where the tail passed, sinking slowly, pulled straight at both ends, its fixed end on
// the launcher's tube as the vehicle drives and the turret slews; it parts at the missile when the round strikes or
// self-destructs, drops slack to the ground and fades out there. Only the wire-guided families carry one.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Vector3, PerspectiveCamera } from 'three';
import '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { isUnguidedRocket } from '../sim/launcherPolicy.ts';
import { MISSILE_LOOKS, missileLookFor } from './missileLooks.ts';
import { createMissileWires, WIRE_LAY_M, WIRE_POINTS, WIRE_SLOTS } from './missileWires.ts';
import { createSceneLightUniforms } from './sceneLight.ts';

// ---- 1. the family table: who flies on a wire ----------------------------------------------------------------------
const wired = (name, sound = null) => missileLookFor(name, sound, false).wires;
for (const n of ['BGM-71E TOW-2A', 'BGM-71F TOW-2B', '9M113M Konkurs-M', '9M111 Fagot', '9M115 Metis', '9M131 Metis-M',
  'HJ-8', 'MILAN 2', 'HOT 3', '9M14 Malyutka', 'Type 79 Jyu-MAT']) {
  assert.ok(wired(n) > 0, `${n} is wire-guided: it pays out a wire`);
}
assert.equal(wired('BGM-71E TOW-2A'), 2, 'a TOW pays out two wires');
for (const n of ['FGM-148 Javelin', 'Spike LR', 'Spike LR2 MELLS', 'Type 01 Jyu-MAT Kai', 'Kornet guided missile',
  '9M120-1 Ataka-T', '9M117M1 Arkan', 'MGM-51C Shillelagh ATGM', 'HJ-10 guided missile', 'FIM-92 Stinger',
  'XM1210 MRM-H Hypersonic GATGM', 'Viper micro-missile', '9M-695 Tandem']) {
  assert.equal(wired(n), 0, `${n} flies without a wire (fire-and-forget, beam-riding, radio or IR command)`);
}
assert.equal(missileLookFor('9M-695 Blast', 'konkurs-launch', true).wires, 0, "a rack's rockets carry no wire");
const families = new Set(Object.values(MISSILE_LOOKS).filter((l) => l.wires > 0).map((l) => l.family));
assert.deepEqual([...families].sort(), ['mclos', 'saclos_old', 'saclos_wire'], 'the wire belongs to the wire-guided families');
// every wire-guided round in the fleet resolves to a wired look
let fleetWired = 0;
for (const [id, spec] of Object.entries(TANK_SPECS)) {
  for (const s of spec.gun?.shells ?? []) {
    if (!s || s.guided !== true || isUnguidedRocket(spec.gun, s)) continue;
    if (/TOW|Konkurs|MILAN|Malyutka|Type 79/i.test(s.name ?? '')) {
      assert.ok(missileLookFor(s.name, s.soundProfile, false).wires > 0, `${id} ${s.name}: wired`);
      fleetWired++;
    }
  }
}
assert.ok(fleetWired >= 8, `the fleet's wire-guided rounds (${fleetWired})`);

// ---- 2. the wire itself ---------------------------------------------------------------------------------------------
const light = createSceneLightUniforms();
const w = createMissileWires(light);
const flat = () => 0;
assert.equal(w.mesh.visible, false, 'nothing drawn while no wire lives');
assert.ok(w.mesh.material.transparent && !w.mesh.material.depthWrite, 'a blended line, no depth write');
assert.equal(w.mesh.material.uniforms.uSunCol, light.uSunCol, 'lit by the time of day');
const pts = (slot, strand = 0) => {
  const a = w.strandPoints(slot, strand), out = [];
  for (let i = 0; i < a.length; i += 4) out.push(a.slice(i, i + 4));
  return out;
};
// a TOW fired from a tube 2.4 m up, flying +x at 195 m/s, 60 frames a second for 3 s
const s = w.begin(11, 2, 0, 2.4, 0, 0);
assert.equal(w.slotOf(11), s);
let now = 0, x = 0;
for (let f = 1; f <= 180; f++) {
  now = f / 60; x = 195 * now;
  w.tail(s, x, 2.6, 0, now);
  w.update(now, flat);
}
assert.equal(w.mesh.visible, true, 'drawn while it lives');
let p = pts(s);
assert.ok(p.length >= 20, `laid along the flight (${p.length} points)`);
assert.ok(Math.hypot(p[0][0], p[0][1] - 2.4, p[0][2]) < 1e-6, 'its fixed end on the tube');
const last = p.at(-1);
assert.ok(Math.abs(last[0] - x) < 1e-6 && Math.abs(last[1] - 2.6) < 1e-6, 'its free end on the missile\'s tail, this frame');
for (let k = 1; k < p.length; k++) assert.ok(p[k][0] >= p[k - 1][0] - 1e-6, 'in order from the tube out to the missile');
// it sinks where it was laid long ago and stays taut near both ends
const mid = p.reduce((b, q) => (Math.abs(q[0] - 0.35 * x) < Math.abs(b[0] - 0.35 * x) ? q : b));
const lineY = 2.4 + (2.6 - 2.4) * (mid[0] / x);
assert.ok(mid[1] < lineY - 0.3 && mid[1] > lineY - 1.6, `the older wire sags a little (${(lineY - mid[1]).toFixed(2)} m)`);
const nearTail = p.at(-2);
assert.ok(2.6 - nearTail[1] < 0.15, 'pulled straight by the missile over its last metres');
assert.ok(p.length <= WIRE_POINTS + 1, 'within its buffer');
// two strands, side by side
const p2 = pts(s, 1);
assert.equal(p2.length, p.length, 'a TOW draws both its wires');
assert.ok(Math.abs(p2[5][2] - p[5][2]) > 0.04, 'the two wires ride apart');

// ---- 3. the launcher drives and slews: the wire's end goes with it --------------------------------------------------
w.anchor(s, 3, 2.5, -1.5);
w.update(now, flat);
p = pts(s);
assert.ok(Math.hypot(p[0][0] - 3, p[0][1] - 2.5, p[0][2] + 1.5) < 1e-6, 'the fixed end follows the tube');
assert.ok(Math.abs(p[1][2] - pts(s)[1][2]) < 1e-9 && p[1][2] < -0.5, 'the near stretch swings with it');
assert.ok(Math.abs(p.at(-3)[2]) < 0.05, 'the far wire stays where it was laid');

// ---- 4. a long flight never cuts the wire short ---------------------------------------------------------------------
for (let f = 181; f <= 360; f++) { now = f / 60; x = 195 * now; w.tail(s, x, 2.6, 0, now); w.update(now, flat); }
p = pts(s);
assert.ok(p.length <= WIRE_POINTS + 1 && Math.hypot(p[0][0] - 3, p[0][1] - 2.5) < 1e-6 && Math.abs(p.at(-1)[0] - x) < 1e-6,
  `a 1.2 km flight: still tube to tail in ${p.length} points (older points merged, none dropped)`);
let gap = 0;
for (let k = 1; k < p.length; k++) gap = Math.max(gap, p[k][0] - p[k - 1][0]);
assert.ok(gap < (x / (WIRE_POINTS / 2)) * 1.5, `an even resolution, no long straight cut in the laid wire (largest stretch ${gap.toFixed(1)} m of ${x.toFixed(0)})`);

// ---- 5. the missile strikes: the wire parts there, goes slack, lies on the ground and fades out -----------------------
w.cut(s, now);
const cutAt = now;
const yAt = (t) => { w.update(t, flat); return pts(s); };
const justCut = yAt(cutAt + 0.02);
assert.ok(Math.abs(justCut.at(-1)[0] - x) < 1e-6, 'parted where the missile was');
const settled = yAt(cutAt + 1.8);
assert.ok(settled.slice(1).every((q) => q[1] <= 0.031 + 1e-9 || q[1] < 1.2), 'slack, it drops');
assert.ok(settled.every((q) => q[1] >= 0.03 - 1e-9), 'and lies on the ground, never through it');
assert.equal(w.stats().parted, 1);
yAt(cutAt + 3.0);
assert.ok(pts(s)[0][3] < 1, 'fading out');
yAt(cutAt + 4.0);
assert.equal(w.slotOf(11), -1, 'gone');
assert.equal(w.mesh.visible, false, 'and nothing drawn');

// ---- 6. slots, time shifts, reset -----------------------------------------------------------------------------------
for (let i = 0; i < WIRE_SLOTS; i++) w.begin(100 + i, 1, i, 2, 0, 10);
const reused = w.begin(999, 1, 0, 2, 0, 11);
assert.ok(reused >= 0 && w.slotOf(100) === -1, 'all taken: the oldest wire gives way');
w.tail(reused, 30, 2, 0, 11.2); w.tail(reused, 60, 2, 0, 11.4); w.update(12.5, flat);
const before = JSON.stringify(pts(reused));
w.shiftTime(5); w.update(17.5, flat);
assert.equal(JSON.stringify(pts(reused)), before, 'a time shift moves every laid time (the same wire 5 s later on the shifted clock)');
w.reset();
assert.equal(w.stats().live + w.stats().parted, 0, 'reset clears every wire');
assert.equal(w.mesh.visible, false);

// ---- 7. the live runtime: a TOW's wire on its launcher; a Kornet's none ----------------------------------------------
const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
globalThis.document = { createElement: (tag) => { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
const { createFx } = await import('./effects.ts');
const { createBus } = await import('../game/state.ts');
const { disposeObject3DResources } = await import('../engine/resourceLifetime.ts');
const ground = { getHeightAt: () => 0, getGroundType: () => 'medium', getNormalAt: () => new Vector3(0, 1, 0) };
// a launcher: its tube mouth rides on the hull (driving +z) and a turret (slewing)
const launcherState = { z: 0, yaw: 0 };
const shooter = {
  spec: { id: 'm2a2_bradley', gun: TANK_SPECS.m2a2_bradley.gun },
  state: { pos: new Vector3() },
  visual: {
    root: { isObject3D: true },
    setDestroyed() {},
    gunMuzzleWorld(out, index, launcher) {
      const side = launcher ? (index === 1 ? 0.45 : 0.15) : 0;
      return out.set(-1.2 + Math.cos(launcherState.yaw) * side, 2.6, launcherState.z + Math.sin(launcherState.yaw) * side);
    },
  },
};
let fx;
try {
  fx = createFx({ anisotropy: 1 }, ground, { seed: 7, resolveEntity: (id) => (id === 'bradley' ? shooter : null) });
  const bus = createBus(); fx.bindBus(bus);
  const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 3000); camera.position.set(-30, 6, 40); camera.lookAt(80, 2, 0);
  camera.updateMatrixWorld();
  const named = (n) => { let o = null; fx.group.traverse((c) => { if (!o && c.name === n) o = c; }); return o; };
  const mesh = named('fx-missile-wires');
  assert.ok(mesh, 'the runtime draws wires');
  const drawn = () => {
    const a = mesh.geometry.getAttribute('aP'), out = [];
    for (let v = 0; v < a.count; v += 2) if (a.getW(v) > 0) out.push([a.getX(v), a.getY(v), a.getZ(v)]);
    return out;
  };
  const fly = (name, sound, speed, frames, steer) => {
    fx.resetAll();
    const muzzle = shooter.visual.gunMuzzleWorld(new Vector3(), 1, true);
    bus.emit('shell:fired', { shellId: 4242, shooterId: 'bradley', muzzleIndex: 1, muzzlePos: [muzzle.x, muzzle.y, muzzle.z],
      dir: [1, 0, 0], caliberMm: 152, shellType: 'HEAT', shellName: name, weaponSound: sound });
    const shell = { id: 4242, shooterId: 'bradley', pos: muzzle.clone(), prevPos: muzzle.clone(), vel: new Vector3(speed, 0, 0),
      distM: 0, ageS: 0, spec: { guided: true, tracer: 'ATGM', name, soundProfile: sound, type: 'HEAT' } };
    for (let f = 0; f < frames; f++) {
      const dt = 1 / 60;
      shell.prevPos.copy(shell.pos); shell.pos.x += speed * dt; shell.distM += speed * dt; shell.ageS += dt;
      steer?.(f);
      fx.update(dt, [shell], camera);
    }
    return shell;
  };
  const shell = fly('BGM-71E TOW-2A', 'tow-launch', 195, 90, (f) => { launcherState.z = f * 0.12; launcherState.yaw = f * 0.02; });
  const line = drawn();
  assert.ok(line.length >= 2 * 10, `a TOW in flight draws its two wires (${line.length} points)`);
  const tube = shooter.visual.gunMuzzleWorld(new Vector3(), 1, true);
  const ends = line.filter((q) => Math.hypot(q[0] - tube.x, q[1] - tube.y, q[2] - tube.z) < 0.08);
  assert.ok(ends.length >= 1, 'the wire starts on the launcher\'s tube where it is now (the hull drove 10.7 m, the turret slewed)');
  assert.ok(line.some((q) => Math.abs(q[0] - (shell.pos.x - 0.65 - 0.625 * MISSILE_LOOKS.tow.bodyLen)) < 0.05),
    'and ends on the missile\'s tail');
  bus.emit('shell:hit', { shellId: 4242, pos: [shell.pos.x, 2, 0], normal: [-1, 0, 0], caliberMm: 152, kind: 'pen' });
  fx.update(1 / 60, [], camera);
  assert.ok(drawn().length > 0 && mesh.visible && fx.group.userData.softParticles.isActive(),
    'parted, it still draws while it settles (the late pass stays on for it)');
  for (let f = 0; f < 60 * 5; f++) fx.update(1 / 60, [], camera);
  assert.equal(drawn().length, 0, 'struck: the wire parted, settled and faded out');
  const src = await (await import('node:fs/promises')).readFile(new URL('./effects.ts', import.meta.url), 'utf8');
  assert.match(src, /\|\| wires\.mesh\.visible/, 'a live or settling wire keeps the late FX pass on (post.ts skips it otherwise)');
  fly('Kornet guided missile', 'spike-launch', 240, 40);
  assert.equal(drawn().length, 0, 'a Kornet rides its laser beam: no wire');
  fly('Spike LR', 'spike-launch', 117, 40);
  assert.equal(drawn().length, 0, 'a Spike is fire-and-forget: no wire');
} finally {
  if (fx) { fx.resetAll(); disposeObject3DResources(fx.group); }
  if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else delete globalThis.document;
}
console.log('missileWires: wire-guided families only; laid along the flight, sagging, taut at both ends, fixed to the live tube; never cut short; parts, drops and fades on impact; slots, time, reset');
