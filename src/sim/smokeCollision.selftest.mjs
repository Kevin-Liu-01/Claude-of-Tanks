// smokeCollision.selftest (the hitbox lane, 2026-10-09): smoke canisters respect hitboxes. The owner: "rn, smoke can go
// into buildings instead of bouncing off them. make smoke canisters ... respect hitboxes".
//   1. A canister fired at a house's wall bounces off it and rests outside; without the world (before) it flew in.
//   2. A canister lobbed onto the roof rests on the roof, and its cloud stands on the roof, not in the rooms under it.
//   3. A salvo fired at a house from close in: every canister rests outside it, no point of any flight is inside it, and
//      the clouds stay out of it: a sight line inside the house is clear (before: blocked), one outside is blocked; the
//      media tier's puffs (lobes at rest, bodies, wisps, hazes) all stand outside it.
//   4. The wire: the packed receipt carries the bounces, the walls and the banks; a client's restored screen lands every
//      canister within 2.5 cm of the authority's and blocks the same sight lines. The same request draws the same salvo.
//   5. A real house of a real shard (Verdant, the match's own collision): canisters fired at its wall bounce off it.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeadlessCollisionWorld } from '../world/headlessCollisionWorld.ts';
import { createSmokeCanister, smokeCanisterPosition, SMOKE_CANISTER_RADIUS_M } from './smokeBallistics.ts';
import { smokeBlocks, smokeBankCount, smokeClip, smokeVolume, SMOKE_DURATION_S } from './smokeScreen.ts';
import { requestAuxiliary } from './auxiliarySystems.ts';
import { packSmokeScreen, restoreSmokeScreen } from './smokeReceipt.ts';

const UP = new THREE.Vector3(0, 1, 0);
const flatField = { getHeightAt: () => 0, getHeightAtFast: () => 0, getNormalAt: () => UP, maxY: 0, minY: 0 };
const ground = () => 0;
// a house: x 10..18, z -4..4, walls to 5 m (one solid record, as a structure's shell bands stand for its walls)
const HOUSE = { x0: 10, x1: 18, z0: -4, z1: 4, top: 5 };
const box = { b: [HOUSE.x0, 0, HOUSE.z0, HOUSE.x1, HOUSE.top, HOUSE.z1], k: 'structure' };
const world = createHeadlessCollisionWorld({ heightField: flatField, manifest: { obstacles: [box], colliders: [box] } });
const inside = (p, pad = 0) => p.x > HOUSE.x0 + pad && p.x < HOUSE.x1 - pad && p.z > HOUSE.z0 + pad && p.z < HOUSE.z1 - pad && p.y < HOUSE.top - pad;
const at = (shot, t) => smokeCanisterPosition(shot, t, { x: 0, y: 0, z: 0 });
/** Every point of a flight, every 5 ms. */
const flight = (shot) => Array.from({ length: Math.ceil(shot[6] / 0.005) + 1 }, (_, i) => at(shot, Math.min(shot[6], i * 0.005)));

// ---- 1. a canister at the wall ----------------------------------------------------------------------------------------
{
  const origin = { x: 4, y: 2, z: 0.5 }, direction = { x: 1, y: 0.25, z: 0.1 };
  const before = createSmokeCanister(origin, direction, ground);
  assert.ok(flight(before).some((p) => inside(p)), 'before: without the world the canister flies into the house');
  const shot = createSmokeCanister(origin, direction, ground, world);
  assert.ok(shot.length >= 14, `it struck the wall and bounced (${(shot.length - 7) / 7} bounces)`);
  const strike = at(shot, shot[7]);
  assert.ok(Math.abs(strike.x - (HOUSE.x0 - SMOKE_CANISTER_RADIUS_M)) < 0.05, `it leaves the wall at its face (${strike.x.toFixed(3)})`);
  assert.ok(shot[11] < 0, 'it leaves the wall moving away from it');
  assert.ok(!flight(shot).some((p) => inside(p)), 'no point of its flight is inside the house');
  const rest = at(shot, shot[6]);
  assert.ok(rest.x < HOUSE.x0 && Math.abs(rest.y - SMOKE_CANISTER_RADIUS_M) < 0.01, `it rests on the ground in front of the wall (${rest.x.toFixed(2)}, ${rest.y.toFixed(3)})`);
  assert.deepEqual(createSmokeCanister(origin, direction, ground, world), shot, 'the same launch, the same receipt');
}

// ---- 2. a canister on the roof ----------------------------------------------------------------------------------------
{
  const shot = createSmokeCanister({ x: 6, y: 2, z: 0 }, { x: 0.3, y: 1, z: 0 }, ground, world);
  const rest = at(shot, shot[6]);
  assert.ok(rest.x > HOUSE.x0 && rest.x < HOUSE.x1 && Math.abs(rest.y - (HOUSE.top + SMOKE_CANISTER_RADIUS_M)) < 0.02,
    `a lobbed canister rests on the roof (${rest.x.toFixed(2)}, ${rest.y.toFixed(3)})`);
  // its cloud stands on the roof: give it a bounce group so the screen reads its rest as a surface over the ground
  const roofShot = [...shot, shot[6], rest.x, rest.y, rest.z, 0, 0, 0];
  const screen = { x: rest.x, y: rest.y, z: rest.z, yaw: 0, born: 0, canisters: [roofShot], banks: [0] };
  const v = smokeVolume(screen, roofShot[6] + 4, -2, {}, ground);
  assert.ok(v.y > HOUSE.top, `the roof's cloud stands on the roof (${v.y.toFixed(2)} m), not in the rooms under it`);
}

// ---- 3. a salvo fired at a house from close in ------------------------------------------------------------------------
const tank = (specId = 'leo2a6') => ({ id: specId, team: 'player', spec: { id: specId, dims: { heightM: 2.6 }, armor: { turretPivot: [0, 1.5, 0] } },
  state: { pos: { x: 2, y: 0, z: 0 }, yaw: Math.PI / 2, turretYaw: 0, visualPitch: 0, visualRoll: 0 }, combat: {} });
const shooter = tank();
assert.ok(requestAuxiliary(shooter, 'smoke', 0, ground, world), 'the salvo launches');
const screen = shooter.combat.auxiliary.smoke;
const legacyShooter = tank();
requestAuxiliary(legacyShooter, 'smoke', 0, ground);
const legacy = legacyShooter.combat.auxiliary.smoke;
let bounced = 0;
for (const shot of screen.canisters) {
  if (shot.length > 7) bounced++;
  assert.ok(!flight(shot).some((p) => inside(p)), 'no canister of the salvo flies into the house');
  assert.ok(!inside(at(shot, shot[6]), -0.05), 'every canister rests outside the house');
}
// every canister whose flight (without the world) entered the house struck its wall instead
const wouldEnter = legacy.canisters.map((shot) => flight(shot).some((p) => inside(p)));
wouldEnter.forEach((enters, i) => { if (enters) assert.ok(screen.canisters[i].length > 7, `canister ${i}, which flew into the house before, bounced off its wall`); });
assert.ok(wouldEnter.some(Boolean), 'before: without the world part of the salvo flew through the house');
assert.ok(bounced >= 3, `the salvo bounced off the wall (${bounced}/${screen.canisters.length}; ${wouldEnter.filter(Boolean).length} flew in before)`);
assert.ok(screen.clip?.some((c) => c), 'the banks read the wall');
const full = Math.max(...screen.canisters.map((s) => s[6])) + 3;
// the same canisters' banks without the walls they read (the cloud before this change: an ellipsoid through the wall)
const unwalled = { ...screen, clip: undefined };
const inHouse = [[{ x: 12, y: 1.6, z: -3 }, { x: 12, y: 1.6, z: 3 }], [{ x: 11, y: 2.4, z: 0 }, { x: 17, y: 2.4, z: 0 }], [{ x: 14, y: 1.2, z: -3.5 }, { x: 14, y: 3, z: 3.5 }]];
for (const [a, b] of inHouse) {
  assert.equal(smokeBlocks([unwalled], a, b, full, ground), true, 'before: the same banks without their walls filled the house');
  assert.equal(smokeBlocks([screen], a, b, full, ground), false, 'a sight line inside the house is clear of the screen');
}
assert.equal(smokeBlocks([screen], { x: 7.5, y: 1.8, z: -12 }, { x: 7.5, y: 1.8, z: 12 }, full, ground), true, 'the screen still hides the ground in front of the house');
assert.equal(smokeBlocks([screen], { x: 0, y: 1.8, z: 0 }, { x: 30, y: 1.8, z: 0 }, full, ground), true, 'and the tank from the house');
// the media tier's puffs stand outside it
{
  const { makeVolumePuff } = await import('../fx/volumeMedia.ts');
  const { createAuxiliaryPresentation } = await import('../fx/auxiliaryPresentation.ts');
  const clock = { now: 0 }, puffs = [];
  const C = {
    rand: Math.random, groundY: () => 0,
    media: (m) => puffs.push({ x: m.x, y: m.y, z: m.z, vx: m.vx, vy: m.vy, vz: m.vz, drag: m.drag, windK: m.windK, size: m.size1 }),
    chunk() {}, flash() {}, fire() {}, sparks() {}, jet() {}, shockRing() {}, lightPulse() {}, glow() {}, distBoost: () => 1, tier: 1,
    m: makeVolumePuff(), k: {},
    lp: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 1, rot: 0, rotVel: 0, col0: [1, 1, 1], col1: [1, 1, 1], alpha: 1, grav: 0, birthOffset: 0 },
    ls: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.03, grav: -18, col: [1, 1, 1], alpha: 1, seed: 0, birthOffset: 0 },
    lj: { pos: [0, 0, 0], axis: [0, 1, 0], life: 0.1, width: 0.5, len0: 0.5, len1: 3, seed: 0, col: [1, 1, 1], alpha: 1, birthOffset: 0 },
  };
  const parent = new THREE.Group();
  const fx = createAuxiliaryPresentation(parent, { entities: () => [], time: () => clock.now, ground, report() {}, flash() {}, smoke() {}, blast: C });
  fx.setNetworkScreens([screen]);
  for (; clock.now <= SMOKE_DURATION_S + 1; clock.now += 1 / 30) fx.update();
  for (const object of parent.children) { object.geometry?.dispose(); object.material?.dispose(); }
  let settled = 0, worstOverlap = 0;
  // how far a puff's disc (its final size) reaches past the house's walls, in plan (m)
  const overlap = (x, z, size) => {
    const dx = Math.max(HOUSE.x0 - x, 0, x - HOUSE.x1), dz = Math.max(HOUSE.z0 - z, 0, z - HOUSE.z1);
    return size / 2 - Math.hypot(dx, dz);
  };
  for (const p of puffs) {
    // where it is born, and where a lobe comes to rest (its offset v/k)
    assert.ok(!inside(p, 0.05), `no puff is born inside the house (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
    if (p.windK === 0 && p.drag >= 1) {
      settled++;
      const r = { x: p.x + p.vx / p.drag, y: p.y + p.vy / p.drag, z: p.z + p.vz / p.drag };
      assert.ok(!inside(r, 0.05), `no lobe settles inside the house (${r.x.toFixed(2)}, ${r.z.toFixed(2)})`);
      worstOverlap = Math.max(worstOverlap, overlap(r.x, r.z, p.size));
    } else worstOverlap = Math.max(worstOverlap, overlap(p.x, p.z, p.size));
  }
  // (2026-10-10, the strips' high view: 10 m puffs by the wall spread over the roof) a puff by a wall is held to its room
  assert.ok(worstOverlap < 1.6, `no puff spreads more than 1.6 m past the house's walls (${worstOverlap.toFixed(2)} m)`);
  assert.ok(puffs.length > 40 && settled > smokeBankCount(screen), `the screen still draws its wall (${puffs.length} puffs, ${settled} lobes)`);
}

// ---- 4. the wire --------------------------------------------------------------------------------------------------------
{
  const packed = packSmokeScreen(screen);
  assert.ok(packed.paths?.some((p) => p) && packed.clip?.some((c) => c) && packed.banks, 'the receipt carries the bounces, the walls and the banks');
  const restored = restoreSmokeScreen(JSON.parse(JSON.stringify(packed)));
  for (let i = 0; i < screen.canisters.length; i++) {
    const a = at(screen.canisters[i], screen.canisters[i][6]), b = at(restored.canisters[i], restored.canisters[i][6]);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.025, `a client lands canister ${i} within 2.5 cm of the authority (${Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z).toFixed(4)})`);
  }
  for (const [a, b] of [...inHouse, [{ x: 7.5, y: 1.8, z: -12 }, { x: 7.5, y: 1.8, z: 12 }]]) {
    assert.equal(smokeBlocks([restored], a, b, full, ground), smokeBlocks([screen], a, b, full, ground), 'the client blocks the sight lines the authority does');
  }
  const twin = tank();
  requestAuxiliary(twin, 'smoke', 0, ground, world);
  assert.deepEqual(twin.combat.auxiliary.smoke, screen, 'the same request draws the same salvo');
  // the open field sends nothing new on the wire
  const open = tank();
  requestAuxiliary(open, 'smoke', 0, ground, createHeadlessCollisionWorld({ heightField: flatField, manifest: { obstacles: [], colliders: [] } }));
  const openPacked = packSmokeScreen(open.combat.auxiliary.smoke);
  assert.ok(!openPacked.paths && !openPacked.clip && !openPacked.banks, 'an open-field salvo packs as before');
  assert.deepEqual(open.combat.auxiliary.smoke.canisters, legacy.canisters.map((s) => s), 'and flies as before');
}

// ---- 5. a real house of a real shard ------------------------------------------------------------------------------------
{
  const { createDedicatedWorldCollision } = await import('../../server/dedicatedWorldCollision.ts');
  const real = createDedicatedWorldCollision('verdant');
  const field = real.heightField;
  const g = (x, z) => field.getHeightAt(x, z);
  // a structure standing alone: fire at its wall from 9 m out, square on, at 1.5 m
  // (a building: a structure group's movement record; its walls are its shell bands, which the ray meets) from each side
  const records = real.getObstacles().filter((r) => r.structureIdx != null && r.max[0] - r.min[0] > 4 && r.max[2] - r.min[2] > 4);
  let tried = 0, struck = 0, entered = 0;
  const started = performance.now();
  for (const r of records) {
    if (tried >= 30) break;
    const cx = (r.min[0] + r.max[0]) / 2, cz = (r.min[2] + r.max[2]) / 2;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // 9 m out from the face the shot points at, square on, at 1.5 m over the ground there
      const x0 = dx ? (dx > 0 ? r.min[0] - 9 : r.max[0] + 9) : cx, z0 = dz ? (dz > 0 ? r.min[2] - 9 : r.max[2] + 9) : cz;
      const y0 = g(x0, z0) + 1.5;
      const toWall = real.raycast(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(dx, 0, dz), 9.5);
      if (!toWall || toWall.kind === 'terrain' || toWall.dist < 7) continue; // the ground, or something nearer
      tried++;
      const shot = createSmokeCanister({ x: x0, y: y0, z: z0 }, { x: dx, y: 0.2, z: dz }, g, real);
      if (shot.length > 7) struck++;
      const rest = at(shot, shot[6]);
      const past = (rest.x - x0) * dx + (rest.z - z0) * dz;
      const across = Math.abs((rest.x - x0) * dz - (rest.z - z0) * dx);
      if (past > toWall.dist + 0.3 && across < 2) entered++;
      break;
    }
  }
  const ms = (performance.now() - started) / Math.max(1, tried);
  assert.ok(tried >= 5, `Verdant's houses tried (${tried})`);
  assert.ok(struck >= tried * 0.8, `canisters bounce off Verdant's walls (${struck}/${tried})`);
  assert.equal(entered, 0, 'none rests past a wall it struck');
  console.log(`smokeCollision.selftest: a canister bounces off a house's wall and rests outside (before: inside); a lobbed one rests on the roof `
    + `with its cloud on it; a salvo at a house: ${bounced}/${screen.canisters.length} bounced, none inside, sight inside the house clear (before: `
    + `blocked), outside blocked, every media puff outside; the wire carries bounces and walls (client within 2.5 cm, same sight lines); `
    + `Verdant: ${struck}/${tried} canisters bounced off real walls, ${ms.toFixed(1)} ms a canister`);
}
