// gunshipLens.selftest.mjs — the AC-130's guns beside its own gimbal lens (lane ac130-barrels-230, 2026-10-21; the owner:
// "the missile, cannons, and autocannnonn launchers should be sort of visible with thembneinng blaced "behind" teh
// "camera" but barrels are visible so we can see them fire and recoil, and the tracers and missile trace and smoke and
// other stuff should look like theyre cominng from behindd the "camerA"").
// The regression (release 229, the AC-130 lane's rounds 1-3): the lens drew no gun and nothing at a shot (gunshipMuzzleFx
// returned in the lens), its rounds lit 45 m out of the screen's centre and the missile's smoke faded within 70 m of the
// glass, so every round appeared from nowhere mid-air. Asserted here:
//   1. the lens guns (game/gunshipAirframe.ts): each muzzle inside the frame near its edge, each barrel running out of
//      the frame, laid on the screen's centre; the same screen place at every zoom and aspect; recoil and run-out; heat
//      only in a heat lens, crossing the heat lens's threshold only once fired; every material on the cascade setup.
//   2. the runtime (fx/effects.ts createFx): the camera on an AC-130's gimbal point poses them; a shot recoils its gun;
//      its tracer is drawn from that gun's muzzle on a straight line to the aim point (not lit 45 m out of the centre);
//      the missile leaves its rail; any other camera (an external pose) draws no lens guns.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { buildGunshipLensGuns, LENS_GUNS, LENS_GUN_PLACE } from '../game/gunshipAirframe.ts';
import { GUNSHIP_WEAPONS } from '../sim/matchRuleset.ts';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const ORBIT = new THREE.Vector3(0, 240, 90), AIM = new THREE.Vector3(0, 0, 0);
function lensCamera(fov = 55, aspect = 1.6) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.5, 4000);
  camera.position.set(ORBIT.x, ORBIT.y + 0.12, ORBIT.z);
  camera.lookAt(AIM);
  camera.updateMatrixWorld(true);
  return camera;
}
const ndc = (p, camera) => p.clone().project(camera);
const meshesOf = (root, gun) => { const out = []; root.getObjectByName(`ac130-lens-${gun}`).traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
/** the share of a mesh's vertices inside the frame and whether any lies outside it (or behind the near plane) */
function frameShare(mesh, camera) {
  const p = mesh.geometry.getAttribute('position'), v = new THREE.Vector3(), e = new THREE.Vector3();
  let inside = 0, outside = 0;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    e.copy(v).applyMatrix4(camera.matrixWorldInverse);
    const n = v.project(camera);
    if (e.z < -camera.near && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1) inside++; else outside++;
  }
  return { inside: inside / p.count, outside };
}

// ---- 1. the lens guns ----
const setup = [];
const lens = buildGunshipLensGuns({ setup: (m) => setup.push(m), release: () => {} });
{
  const camera = lensCamera();
  assert.equal(lens.root.visible, false, 'hidden until posed on a lens');
  lens.pose(camera, 1 / 60, false);
  assert.equal(lens.root.visible, true);
  const materials = new Set();
  lens.root.traverse((o) => { if (o.isMesh) { materials.add(o.material); assert.equal(o.castShadow, false, `${o.name} casts no shadow on the ground`); } });
  for (const m of materials) {
    assert.ok(setup.includes(m), `${m.name} joins the cascade setup`);
    assert.ok(m.isMeshStandardMaterial && m.vertexColors && m.metalness === 0.32 && m.roughness === 0.6,
      `${m.name}: the airframe's lit program (its covered compile serves the guns)`);
  }
  const m = new THREE.Vector3(), d = new THREE.Vector3(), at = {};
  for (const gun of LENS_GUNS) {
    assert.ok(lens.muzzle(gun, m, d), `${gun}: a muzzle once posed`);
    const n = ndc(m, camera);
    at[gun] = n;
    assert.ok(Math.abs(n.x) < 0.95 && Math.abs(n.y) < 0.95 && n.z > -1 && n.z < 1, `${gun}: its muzzle in the frame (${n.x.toFixed(2)}, ${n.y.toFixed(2)})`);
    assert.ok(Math.abs(n.x) > 0.6, `${gun}: by the frame's side, clear of the sight and the weapons console`);
    const mount = ndc(lens.root.getObjectByName(`ac130-lens-${gun}`).getWorldPosition(new THREE.Vector3()), camera);
    assert.ok(Math.abs(mount.x - LENS_GUN_PLACE[gun][0]) < 0.01 && Math.abs(mount.y - LENS_GUN_PLACE[gun][1]) < 0.01, `${gun}: its mount at its place`);
    const far = ndc(m.clone().addScaledVector(d, 250), camera);
    assert.ok(Math.hypot(far.x, far.y) < 0.08, `${gun}: laid on the screen's centre (${far.x.toFixed(3)}, ${far.y.toFixed(3)})`);
    for (const mesh of meshesOf(lens.root, gun)) {
      const share = frameShare(mesh, camera);
      if (/barrel|round/.test(mesh.name)) {
        assert.ok(share.inside > 0.15, `${mesh.name}: visible in the frame (${(share.inside * 100).toFixed(0)} % of its points)`);
        assert.ok(share.outside > 0, `${mesh.name}: runs out of the frame (its breech behind the lens)`);
      }
    }
  }
  assert.ok(at.cannon.x < 0 && at.missile.x < 0 && at.howitzer.x > 0 && at.missile.y > at.cannon.y,
    'the 30 mm low on the left, the missile rail above it, the howitzer on the right');
  // the same screen place at every zoom (the lens's 55 / zoom) and on a phone's wider screen
  for (const [fov, aspect] of [[55 / 6, 1.6], [55 / 2.4, 2.16], [55, 2.16]]) {
    const c = lensCamera(fov, aspect);
    lens.pose(c, 1 / 60, false);
    assert.ok(Math.abs(lens.scale - Math.tan(THREE.MathUtils.degToRad(fov) / 2) / Math.tan(THREE.MathUtils.degToRad(27.5))) < 1e-9);
    for (const gun of LENS_GUNS) {
      lens.muzzle(gun, m, d);
      const n = ndc(m, c);
      assert.ok(Math.abs(n.x - at[gun].x) < 0.02 && Math.abs(n.y - at[gun].y) < 0.02,
        `${gun} at fov ${fov.toFixed(1)}, aspect ${aspect}: held at its place (${n.x.toFixed(3)}, ${n.y.toFixed(3)})`);
      const far = ndc(m.clone().addScaledVector(d, 250), c);
      assert.ok(Math.hypot(far.x, far.y) < 0.08, `${gun} at fov ${fov.toFixed(1)}: still laid on the centre`);
    }
  }
}
// recoil: the 30 mm's kick and return, the howitzer's slam and run-out, the missile leaving its rail
{
  const camera = lensCamera();
  const barrel = (gun) => lens.root.getObjectByName(`ac130-lens-${gun}-${gun === 'missile' ? 'round' : 'barrel'}`);
  const run = (s, heat = false) => { for (let t = 0; t < s - 1e-9; t += 1 / 60) lens.pose(camera, 1 / 60, heat); };
  lens.pose(camera, 1 / 60, false);
  assert.equal(barrel('cannon').position.z, 0, 'at rest');
  lens.fire('cannon'); lens.pose(camera, 1 / 60, false);
  assert.ok(barrel('cannon').position.z > 0.05, `the 30 mm kicks back (${barrel('cannon').position.z.toFixed(3)} lens m)`);
  run(0.2);
  assert.ok(barrel('cannon').position.z < 0.005, 'and returns before its next round (0.14 s)');
  lens.fire('howitzer'); lens.pose(camera, 1 / 30, false);
  assert.ok(barrel('howitzer').position.z > 0.6, `the howitzer slams back (${barrel('howitzer').position.z.toFixed(2)} lens m)`);
  run(0.4);
  const mid = barrel('howitzer').position.z;
  assert.ok(mid > 0.05 && mid < 0.75, `and runs out (${mid.toFixed(2)})`);
  run(1);
  assert.equal(barrel('howitzer').position.z, 0, 'home');
  lens.fire('missile'); lens.pose(camera, 1 / 60, false);
  assert.equal(barrel('missile').visible, false, 'the missile has left its rail');
  run(7.2);
  assert.equal(barrel('missile').visible, true, 'the next round is on the rail once the launcher is ready (7 s)');
  // heat: only a heat lens sees it; a resting gun under the grade's 1.55 threshold (engine/post.ts thermalHeat), a firing
  // barrel over it, cooling
  lens.pose(camera, 1 / 60, true);
  const hot = barrel('howitzer').material;
  assert.ok(hot.emissive.r > 0.5 && hot.emissive.r < 1.55, `a cool gun in the heat lens (${hot.emissive.r.toFixed(2)})`);
  for (let i = 0; i < 4; i++) { lens.fire('howitzer'); run(0.5, true); }
  assert.ok(hot.emissive.r > 1.55, `a firing barrel reads hot (${hot.emissive.r.toFixed(2)})`);
  lens.pose(camera, 1 / 60, false);
  assert.equal(hot.emissive.r, 0, 'no glow in the daylight lens');
  lens.hide();
  assert.equal(lens.root.visible, false);
  assert.equal(lens.muzzle('cannon', new THREE.Vector3()), false, 'no muzzle once hidden');
}

// ---- 2. the runtime ----
const cascade = [];
const scene = new THREE.Scene();
const camera = lensCamera();
Object.assign(camera.userData, { thermalFlight: true, aerialPilotId: null, flightVision: 0, sensorVision: 0 });
const gunship = { id: 'pilot', team: 'alpha', aerial: { kind: 'gunship', active: true, x: ORBIT.x, y: ORBIT.y, z: ORBIT.z },
  state: { pos: ORBIT.clone(), yaw: 0 }, visual: { root: new THREE.Group() }, spec: { id: 'm1a1_abrams_hc', nation: 'USA', gun: { caliberMm: 120, shells: [] } } };
const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: (m) => cascade.push(m), releaseShadowMaterial: () => {} },
  { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) },
  { seed: 3, resolveEntity: (id) => (id === 'pilot' ? gunship : null), auxiliaryEntities: () => [gunship] });
scene.add(fx.group);
const handlers = new Map();
const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; }, off() {},
  emit(n, p) { for (const f of handlers.get(n) ?? []) f(p); } };
fx.bindBus(bus);
const subject = (id) => (id === 'pilot' ? gunship : null);
const frame = (shells = []) => fx.update(1 / 60, shells, camera, subject);
frame();
for (let i = 0; i < 20 && !fx.group.getObjectByName('AC-130 lens guns'); i++) await new Promise((r) => setTimeout(r, 10));
frame();
const guns = fx.group.getObjectByName('AC-130 lens guns');
assert.ok(guns, 'the gimbal lens loads the guns (from the airframe\'s chunk)');
assert.equal(guns.visible, true, 'posed on the lens');
for (const m of new Set([...guns.children.flatMap((g) => g.children.map((c) => c.material))])) assert.ok(cascade.includes(m), `${m.name} on the battle's cascades`);
const dir = AIM.clone().sub(ORBIT).normalize();
const range = ORBIT.y / -dir.y;
const shot = (id, i, extra) => ({ shellId: id, shooterId: 'pilot', isPlayer: true, timeS: 10, rocket: false, feedbackPredicted: false,
  muzzlePos: [ORBIT.x, ORBIT.y, ORBIT.z], dir: [dir.x, dir.y, dir.z], muzzleIndex: -1, recoilScale: 1, ...GUNSHIP_WEAPONS[i] && {
    shellType: GUNSHIP_WEAPONS[i].type, shellName: GUNSHIP_WEAPONS[i].name, weaponSound: GUNSHIP_WEAPONS[i].soundProfile,
    caliberMm: GUNSHIP_WEAPONS[i].caliberMm, velocityMps: GUNSHIP_WEAPONS[i].velocityMps, guided: GUNSHIP_WEAPONS[i].guided === true }, ...extra });
const round = (id, i, d) => ({ id, shooterId: 'pilot', isPlayer: true, dead: false, distM: d, ageS: d / GUNSHIP_WEAPONS[i].velocityMps,
  pos: ORBIT.clone().addScaledVector(dir, d), prevPos: ORBIT.clone().addScaledVector(dir, Math.max(0, d - 15)),
  vel: dir.clone().multiplyScalar(GUNSHIP_WEAPONS[i].velocityMps), spec: GUNSHIP_WEAPONS[i] });
{
  // the 30 mm: the gun beside the lens kicks; its round is drawn from its muzzle, a straight line to the aim point
  const muzzle = new THREE.Vector3();
  const cannon = guns.getObjectByName('ac130-lens-cannon');
  muzzle.set(0, 0, 0).applyMatrix4(cannon.matrixWorld);
  const muzzleNdc = ndc(muzzle, camera);
  bus.emit('shell:fired', shot(700, 0));
  frame([round(700, 0, 20)]);
  assert.ok(guns.getObjectByName('ac130-lens-cannon-barrel').position.z > 0.03, 'the shot recoils the 30 mm beside the lens');
  const tracers = fx.group.getObjectByName('Projectile tracers').geometry;
  assert.ok(tracers.instanceCount >= 1, 'from its lens a 30 mm round 20 m out is drawn (it was not before: lit 45 m out)');
  const head = tracers.getAttribute('aHead'), tail = tracers.getAttribute('aTail');
  const tailAt = new THREE.Vector3(tail.getX(0), tail.getY(0), tail.getZ(0));
  const t = ndc(tailAt, camera);
  assert.ok(Math.hypot(t.x - muzzleNdc.x, t.y - muzzleNdc.y) < 0.1 && t.x < -0.6 && t.y < -0.15,
    `its streak starts at the gun, low on the left (${t.x.toFixed(2)}, ${t.y.toFixed(2)}; the muzzle ${muzzleNdc.x.toFixed(2)}, ${muzzleNdc.y.toFixed(2)})`);
  // the drawn line: muzzle to the aim point, every frame of the flight on it
  const line = AIM.clone().sub(muzzle).normalize();
  for (const d of [20, 80, 160, 0.95 * range]) {
    frame([round(700, 0, d)]);
    const h = new THREE.Vector3(head.getX(0), head.getY(0), head.getZ(0));
    const off = h.clone().sub(muzzle);
    const miss = off.clone().sub(line.clone().multiplyScalar(off.dot(line))).length();
    assert.ok(miss < 0.05 + 0.002 * d, `${d.toFixed(0)} m out the round is on the line from the muzzle to the aim (${miss.toFixed(3)} m off it)`);
  }
  frame([]);
  frame([]);
}
{
  // the missile: off the rail beside the lens (its round there leaves), its body drawn where the rail's round was
  const rail = new THREE.Vector3();
  guns.getObjectByName('ac130-lens-missile').localToWorld(rail.set(0, 0, 0.8));
  bus.emit('shell:fired', shot(701, 2));
  frame([round(701, 2, 0.05)]);
  assert.equal(guns.getObjectByName('ac130-lens-missile-round').visible, false, 'the rail\'s round has left');
  const bodies = fx.group.getObjectByName('fx-missile-body-hellfire');
  assert.ok(bodies && bodies.count >= 1, 'the hellfire body draws');
  const mtx = new THREE.Matrix4(), at = new THREE.Vector3();
  bodies.getMatrixAt(0, mtx);
  at.setFromMatrixPosition(mtx);
  const a = ndc(at, camera), r = ndc(rail, camera);
  assert.ok(Math.hypot(a.x - r.x, a.y - r.y) < 0.2 && a.x < -0.5, `it leaves the rail on the left (${a.x.toFixed(2)}, ${a.y.toFixed(2)}; the rail ${r.x.toFixed(2)}, ${r.y.toFixed(2)})`);
  frame([]);
}
{
  // an external pose (the ending's orbit, a replay): no lens guns
  camera.position.set(60, 8, 220); camera.lookAt(ORBIT); camera.updateMatrixWorld(true);
  frame();
  assert.equal(guns.visible, false, 'a camera off the gimbal point draws no lens guns');
  camera.position.set(ORBIT.x, ORBIT.y + 0.12, ORBIT.z); camera.lookAt(AIM); camera.updateMatrixWorld(true);
  camera.userData.thermalFlight = false;
  frame();
  assert.equal(guns.visible, false, 'nor one the aerial camera is not driving');
}
console.log('gunshipLens: the guns beside the gimbal lens (placed, held at every zoom, recoiling, hot in the heat lens), their shots, tracers and missile leaving their muzzles passed');
