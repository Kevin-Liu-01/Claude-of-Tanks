/**
 * combat.selftest.mjs — standalone verification of the combat sim
 * (ARCHITECTURE.md §3.5.4). Run with: node src/sim/combat.selftest.mjs
 * Exits 0 quietly on pass, non-zero with messages on failure.
 * Uses inline fixtures only — no dependency on vehicles/specs.js.
 */

import { Vector3 } from 'three';
import {
  GRAVITY_SCALE,
  SHELL_MAX_LIFETIME_S,
  createShell,
  stepShell,
  penAtDistanceMm,
  aimElevationRad,
  applyDispersion,
} from './ballistics.js';
import { tankPoseFromState, traceTank, queryAimArmor } from './armor.js';
import {
  createCombatState,
  resolveShellHit,
  resolveHeBurst,
  tickFire,
  selectShell,
  startReload,
  estimatePenRatio,
  blastRadiusM,
} from './damage.js';

// ---------------------------------------------------------------- harness --
let failures = 0;
let checks = 0;

function assert(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

function near(actual, expected, tol, msg) {
  assert(
    Math.abs(actual - expected) <= tol,
    `${msg} — expected ${expected} ±${tol}, got ${actual}`
  );
}

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const rngHalf = () => 0.5; // ±25% rolls become exactly 1.0×

function seqRng(values) {
  let i = 0;
  const fn = () => {
    if (i >= values.length) throw new Error(`seqRng overrun after ${values.length} values`);
    return values[i++];
  };
  fn.consumed = () => i;
  return fn;
}

// --------------------------------------------------------------- fixtures --
const V = (x, y, z) => new Vector3(x, y, z);

function mkShellSpec(over) {
  return {
    name: 'fixture',
    type: 'AP',
    caliberMm: 85,
    pen100Mm: 119,
    pen1000Mm: 97,
    dmg: 160,
    velocityMps: 792,
    moduleDmg: 85,
    tracer: 'AP',
    ...over,
  };
}

const BR365K = mkShellSpec({ name: 'BR-365K' });
const PZGR39 = mkShellSpec({ name: 'PzGr.39', caliberMm: 88, pen100Mm: 145, pen1000Mm: 127, dmg: 220, velocityMps: 773, moduleDmg: 88 });
const BR471 = mkShellSpec({ name: 'BR-471', caliberMm: 122, pen100Mm: 175, pen1000Mm: 145, dmg: 390, velocityMps: 795, moduleDmg: 122 });
const M830A1 = mkShellSpec({ name: 'M830A1', type: 'HEAT', caliberMm: 120, pen100Mm: 600, pen1000Mm: 600, dmg: 480, velocityMps: 1400, moduleDmg: 120 });
const BM60 = mkShellSpec({ name: '3BM60', type: 'APFSDS', caliberMm: 125, pen100Mm: 660, pen1000Mm: 654, dmg: 560, velocityMps: 1750, moduleDmg: 125 });
const OF471 = mkShellSpec({ name: 'OF-471 HE', type: 'HE', caliberMm: 122, pen100Mm: 61, pen1000Mm: 61, dmg: 450, velocityMps: 770, moduleDmg: 122 });
const AP100 = mkShellSpec({ name: 'AP-100', caliberMm: 100, pen100Mm: 200, pen1000Mm: 200, dmg: 250, velocityMps: 900, moduleDmg: 100 });

function mkPlate(over) {
  return {
    name: 'plate',
    verts: [[-1, 0, 2], [1, 0, 2], [1, 2, 2], [-1, 2, 2]], // faces +Z
    physicalMm: 100,
    keMm: 100,
    ceMm: 100,
    kind: 'main',
    era: null,
    moduleLink: null,
    gunFollow: false,
    ...over,
  };
}

function mkPlateHit(t, plate, angleDeg, point = V(0, 1, 2), normal = V(0, 0, 1)) {
  return { t, kind: 'plate', plate, point, normal, impactAngleDeg: angleDeg };
}

function mkState(over) {
  return {
    pos: V(0, 0, 0),
    yaw: 0,
    speed: 0,
    visualPitch: 0,
    visualRoll: 0,
    turretYaw: 0,
    gunPitch: 0,
    ...over,
  };
}

function mkSpec(over) {
  return {
    id: 'fixture_tank',
    name: 'Fixture',
    nation: 'none',
    era: 'ww2',
    class: 'medium',
    hp: 1000,
    gun: { caliberMm: 85, reloadS: 6, baseAccuracy: 0.36, aimTimeS: 2 },
    armor: null,
    ...over,
  };
}

function mkTarget(specOver) {
  const spec = mkSpec(specOver);
  return { id: 'target_1', spec, state: mkState(), combat: createCombatState(spec) };
}

function mkShell(shellSpec, distM = 100) {
  const s = createShell(shellSpec, 'attacker_1', true, V(0, 1.5, 10), V(0, 0, -1), 1);
  s.ageS = distM / shellSpec.velocityMps;
  return s;
}

// ------------------------------------------------------- ballistics basics --
{
  const s = mkShell(BR365K, 0);
  s.ageS = 0;
  const dt = 1 / 60;
  stepShell(s, dt);
  near(s.prevPos.z, 10, 1e-9, 'stepShell records prevPos');
  near(s.pos.z, 10 - 792 * dt, 1e-6, 'stepShell integrates position');
  near(s.vel.y, -9.81 * GRAVITY_SCALE * dt, 1e-9, 'stepShell applies scaled gravity');
  s.ageS = SHELL_MAX_LIFETIME_S + 0.01;
  stepShell(s, dt);
  assert(s.dead === true, 'shell despawns past max lifetime');

  near(penAtDistanceMm(BR365K, 50), 119, 1e-9, 'pen clamped below 100 m');
  near(penAtDistanceMm(BR365K, 2000), 97, 1e-9, 'pen clamped beyond 1000 m');

  const g = 9.81 * GRAVITY_SCALE;
  near(
    aimElevationRad(500, 792),
    0.5 * Math.asin((g * 500) / (792 * 792)),
    1e-12,
    'aimElevationRad matches 0.5·asin(gd/v²)'
  );

  const dirA = V(0, 0, 1);
  const sigma = 0.002;
  applyDispersion(dirA, sigma, mulberry32(42));
  near(dirA.length(), 1, 1e-9, 'applyDispersion keeps dir unit length');
  assert(dirA.angleTo(V(0, 0, 1)) <= 2 * sigma * Math.sqrt(2) + 1e-6, 'dispersion within 2σ circle');
  const dirB = V(0, 0, 1);
  applyDispersion(dirB, 999, sigma, mulberry32(42)); // 4-slot doc form
  near(dirB.angleTo(dirA), 0, 1e-9, '3-arg and 4-arg dispersion forms agree');
}

// --------------------------------------------- armor.js geometry & frames --
{
  const armorModel = {
    boundingRadiusM: 4,
    turretPivot: [0, 1.5, 0],
    gunPivot: [0, 0.4, 0.5],
    gunBarrel: { lengthM: 4, radiusM: 0.1 },
    hullPlates: [
      mkPlate({ name: 'front', physicalMm: 100 }),
      mkPlate({ name: 'rear', physicalMm: 40, keMm: 40, ceMm: 40, verts: [[1, 0, -2], [-1, 0, -2], [-1, 2, -2], [1, 2, -2]] }),
    ],
    turretPlates: [
      mkPlate({ name: 'turret_front', physicalMm: 120, keMm: 120, ceMm: 120, verts: [[-0.5, 0, 1], [0.5, 0, 1], [0.5, 0.6, 1], [-0.5, 0.6, 1]] }),
    ],
    modules: [{ module: 'engine', min: [-0.6, 0.3, -1.8], max: [0.6, 1.1, -0.6], turretLocal: false }],
    crew: [{ crew: 'driver', min: [-0.4, 0.5, 0.8], max: [0.2, 1.2, 1.6], turretLocal: false }],
  };
  const pose0 = tankPoseFromState(mkState());

  // Straight front shot: front plate then driver, sorted by t.
  const hits = traceTank(V(0, 1, 10), V(0, 1, -10), pose0, armorModel);
  assert(hits.length >= 3, `front trace finds plate+crew+rear (got ${hits.length})`);
  assert(hits[0].kind === 'plate' && hits[0].plate.name === 'front', 'first hit is the front plate');
  near(hits[0].impactAngleDeg, 0, 0.01, 'head-on impact angle is 0');
  near(hits[0].point.z, 2, 1e-6, 'front plate hit point at z=2');
  near(hits[0].normal.z, 1, 1e-6, 'front plate world normal +Z');
  assert(hits.some((h) => h.kind === 'crew' && h.crew === 'driver'), 'driver box intersected');
  assert(!hits.some((h) => h.kind === 'plate' && h.plate.name === 'rear'), 'rear plate exit (back face) ignored');
  for (let i = 1; i < hits.length; i++) assert(hits[i].t >= hits[i - 1].t, 'hits sorted by t');

  // Hull yaw: tank faces +X; front plate now at world x=+2.
  const poseYaw = tankPoseFromState(mkState({ yaw: Math.PI / 2 }));
  const hitsYaw = traceTank(V(10, 1, 0), V(-10, 1, 0), poseYaw, armorModel);
  assert(hitsYaw.length > 0 && hitsYaw[0].plate && hitsYaw[0].plate.name === 'front', 'yawed hull front plate found');
  near(hitsYaw[0].point.x, 2, 1e-6, 'yawed front plate at world x=2');
  near(hitsYaw[0].impactAngleDeg, 0, 0.01, 'yawed head-on angle 0');

  // Turret yaw: turret plate rotates with turretYaw, hull plates do not.
  const poseTur = tankPoseFromState(mkState({ turretYaw: Math.PI / 2 }));
  const hitsTur = traceTank(V(5, 1.8, 0), V(-5, 1.8, 0), poseTur, armorModel);
  const turHit = hitsTur.find((h) => h.kind === 'plate' && h.plate.name === 'turret_front');
  assert(!!turHit, 'rotated turret plate intersected from the side');
  if (turHit) near(turHit.point.x, 1, 1e-6, 'turret plate world position honors turretYaw');

  // Gun barrel cylinder (external module 'gun').
  const hitsGun = traceTank(V(5, 1.9, 2), V(-5, 1.9, 2), pose0, armorModel);
  assert(hitsGun.some((h) => h.kind === 'module' && h.module === 'gun'), 'barrel cylinder intersected');

  // queryAimArmor returns the first main/spaced plate with range.
  const aim = queryAimArmor(V(0, 1, 10), V(0, 0, -1), 30, pose0, armorModel);
  assert(!!aim && aim.plate.name === 'front', 'queryAimArmor finds front plate');
  if (aim) near(aim.distM, 8, 1e-3, 'queryAimArmor distance');

  // ERA filtering via eraSpent.
  const eraModel = {
    ...armorModel,
    hullPlates: [
      mkPlate({ name: 'era_tile', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10, era: { keReduction: 0.25, ceFlatMm: 600 }, verts: [[-1, 0, 2.4], [1, 0, 2.4], [1, 2, 2.4], [-1, 2, 2.4]] }),
      ...armorModel.hullPlates,
    ],
  };
  const withEra = traceTank(V(0, 1, 10), V(0, 1, -10), pose0, eraModel, new Set());
  assert(withEra.some((h) => h.kind === 'plate' && h.plate.name === 'era_tile'), 'live ERA tile traced');
  const spent = traceTank(V(0, 1, 10), V(0, 1, -10), pose0, eraModel, new Set(['era_tile']));
  assert(!spent.some((h) => h.kind === 'plate' && h.plate.name === 'era_tile'), 'spent ERA tile skipped');
}

// ---------------------------------------------------- REQUIRED ASSERT §1 ---
// T-34-85 BR-365K at 500 m vs Tiger I 100 mm driver plate head-on ⇒ pen.
{
  near(penAtDistanceMm(BR365K, 500), 109.2, 0.5, '§1 pen at 500 m ≈ 109.2');
  const target = mkTarget();
  const shell = mkShell(BR365K, 500);
  const hits = [mkPlateHit(0.4, mkPlate({ name: 'driver_plate' }), 0)];
  const ev = resolveShellHit(shell, target, hits, rngHalf);
  assert(ev.kind === 'pen', `§1 head-on 100 mm ⇒ pen (got ${ev.kind})`);
  near(ev.penRollMm, 109.22, 0.6, '§1 pen roll ≈ 109.2 (rng 0.5 ⇒ ×1.0)');
  near(ev.effectiveMm, 100, 0.01, '§1 effective thickness 100 mm at 0°');
  near(ev.damage, 160, 1e-9, '§1 full damage on pen');
  near(target.combat.hp, 840, 1e-9, '§1 target hp reduced');
  assert(shell.dead === true, '§1 shell consumed on pen');
}

// ---------------------------------------------------- REQUIRED ASSERT §2 ---
// Same shell vs Tiger upper hull 100 mm at raw 55° ⇒ eff ≈ 187 ⇒ nonpen.
{
  const target = mkTarget();
  const shell = mkShell(BR365K, 500);
  const hits = [mkPlateHit(0.4, mkPlate({ name: 'upper_hull' }), 55)];
  const ev = resolveShellHit(shell, target, hits, rngHalf);
  assert(ev.kind === 'nonpen', `§2 55° on 100 mm ⇒ nonpen (got ${ev.kind})`);
  // AP norm 5° ⇒ 50° eff angle; 100/cos(50°)^1.4 = 185.7 (doc's "≈187").
  near(ev.effectiveMm, 185.7, 2.0, '§2 effective ≈ 186 mm');
  near(ev.damage, 0, 1e-9, '§2 zero damage on nonpen');
  near(target.combat.hp, 1000, 1e-9, '§2 hp untouched');
}

// ---------------------------------------------------- REQUIRED ASSERT §3 ---
// Tiger PzGr.39 88 mm at raw 75° vs 45 mm ⇒ ricochet (88 < 3×45).
{
  const target = mkTarget();
  const shell = mkShell(PZGR39, 300);
  const hits = [mkPlateHit(0.4, mkPlate({ name: 'side', physicalMm: 45, keMm: 45, ceMm: 45 }), 75)];
  const ev = resolveShellHit(shell, target, hits, rngHalf);
  assert(ev.kind === 'ricochet', `§3 75° vs 45 mm ⇒ ricochet (got ${ev.kind})`);
  assert(shell.dead === false && shell.bounces === 1, '§3 shell alive after first bounce');
  assert(shell.vel.z > 0, '§3 velocity deflected off the +Z plate');
  near(ev.damage, 0, 1e-9, '§3 ricochet deals no damage');
  assert(shell.penRollDone && shell.remainingPenMm > 0, '§3 full pen retained through bounce');
}

// ---------------------------------------------------- REQUIRED ASSERT §4 ---
// IS-2 BR-471 122 mm vs 25 mm roof at 80° ⇒ overmatch, eff ≈ 41.5 ⇒ pen.
{
  const target = mkTarget();
  const shell = mkShell(BR471, 100);
  const hits = [mkPlateHit(0.4, mkPlate({ name: 'roof', physicalMm: 25, keMm: 25, ceMm: 25 }), 80)];
  const ev = resolveShellHit(shell, target, hits, rngHalf);
  assert(ev.kind === 'pen', `§4 122 mm vs 25 mm roof at 80° ⇒ pen (got ${ev.kind})`);
  // norm = 5·1.4·122/25 = 34.16° ⇒ effAngle 45.84° ⇒ 25/cos^1.4 ≈ 41.5.
  near(ev.effectiveMm, 41.5, 0.5, '§4 overmatched effective ≈ 41.5 mm');
}

// ---------------------------------------------------- REQUIRED ASSERT §5 ---
// HEAT 600 mm CE through 10 mm skirt + 0.5 m gap ⇒ (600−10)·0.75 = 442.5:
// beats a 300 mm CE side, bounces off an 800 mm CE turret.
{
  const skirt = () => mkPlate({ name: 'skirt', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10, verts: [[-1, 0, 2.5], [1, 0, 2.5], [1, 2, 2.5], [-1, 2, 2.5]] });
  const targetA = mkTarget();
  const shellA = mkShell(M830A1, 100);
  const hitsA = [
    mkPlateHit(0.2, skirt(), 0, V(0, 1, 2.5)),
    mkPlateHit(0.3, mkPlate({ name: 'side', physicalMm: 80, keMm: 300, ceMm: 300 }), 0, V(0, 1, 2.0)),
  ];
  const evA = resolveShellHit(shellA, targetA, hitsA, rngHalf);
  assert(evA.kind === 'pen', `§5 442.5 mm remaining vs 300 CE ⇒ pen (got ${evA.kind})`);
  near(evA.penRollMm, 442.5, 0.01, '§5 remaining pen after skirt+gap = (600−10)·0.75');

  const targetB = mkTarget();
  const shellB = mkShell(M830A1, 100);
  const hitsB = [
    mkPlateHit(0.2, skirt(), 0, V(0, 1, 2.5)),
    mkPlateHit(0.3, mkPlate({ name: 'turret', physicalMm: 250, keMm: 700, ceMm: 800 }), 0, V(0, 1, 2.0)),
  ];
  const evB = resolveShellHit(shellB, targetB, hitsB, rngHalf);
  assert(evB.kind === 'nonpen', `§5 442.5 mm remaining vs 800 CE ⇒ nonpen (got ${evB.kind})`);
  near(targetB.combat.hp, 1000, 1e-9, '§5 no damage on the failed HEAT hit');
}

// ---------------------------------------------------- REQUIRED ASSERT §6 ---
// ERA: 3BM60 on a Relikt tile (keReduction 0.25) ⇒ pen ×0.75, tile spent,
// second hit on the same tile unaffected.
{
  const eraPlate = mkPlate({ name: 'relikt_7', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10, era: { keReduction: 0.25, ceFlatMm: 600 }, verts: [[-1, 0, 2.6], [1, 0, 2.6], [1, 2, 2.6], [-1, 2, 2.6]] });
  const mainPlate = () => mkPlate({ name: 'glacis', physicalMm: 220, keMm: 490, ceMm: 900 });
  const target = mkTarget({ era: 'modern', hp: 2000 });

  const shellA = mkShell(BM60, 100);
  const evA = resolveShellHit(shellA, target, [mkPlateHit(0.2, eraPlate, 0, V(0, 1, 2.6)), mkPlateHit(0.3, mainPlate(), 0)], rngHalf);
  near(evA.penRollMm, 495, 0.01, '§6 660 ×0.75 = 495 after ERA');
  assert(evA.kind === 'pen', `§6 495 vs 490 KE ⇒ pen (got ${evA.kind})`);
  assert(target.combat.eraSpent.has('relikt_7'), '§6 tile recorded in eraSpent');
  assert(evA.eraPlate === 'relikt_7', '§6 event carries popped tile name');

  const shellB = mkShell(BM60, 100);
  const evB = resolveShellHit(shellB, target, [mkPlateHit(0.2, eraPlate, 0, V(0, 1, 2.6)), mkPlateHit(0.3, mainPlate(), 0)], rngHalf);
  assert(evB.kind === 'pen' && evB.eraPlate === null, '§6 spent tile ignored on second hit');
  near(evB.penRollMm, 660, 0.01, '§6 second rod keeps full 660 mm');
}

// ---------------------------------------------------- REQUIRED ASSERT §7 ---
// HE splash: 122 mm HE (dmg roll 450) bursting 2 m from a 38 mm side plate.
{
  near(blastRadiusM(122), 4.09, 0.05, '§7 blast radius of 122 mm ≈ 4.09 m');
  const armorModel = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [mkPlate({ name: 'side38', physicalMm: 38, keMm: 38, ceMm: 38, verts: [[-1.5, 0, 2], [1.5, 0, 2], [1.5, 2, 2], [-1.5, 2, 2]] })],
    turretPlates: [],
    modules: [],
    crew: [{ crew: 'driver', min: [-0.4, 0.5, 0.5], max: [0.4, 1.2, 1.5], turretLocal: false }],
  };
  const spec = mkSpec({ armor: armorModel });
  const entity = { id: 'he_victim', spec, state: mkState(), combat: createCombatState(spec) };
  const shell = mkShell(OF471, 300);
  const events = resolveHeBurst(shell, V(0, 1, 4), [entity], null, null, rngHalf);
  assert(events.length === 1, `§7 one splash event (got ${events.length})`);
  const ev = events[0];
  assert(ev.kind === 'he_splash', `§7 kind he_splash (got ${ev.kind})`);
  // 0.5·450·(1 − 2/4.089) − 1.1·38 ≈ 73.2
  near(ev.damage, 73.2, 1.0, '§7 splash damage ≈ 73.2');
  near(entity.combat.hp, 1000 - ev.damage, 1e-9, '§7 hp reduced by splash');
  assert(shell.dead === true, '§7 HE shell consumed by burst');
}

// ---------------------------------------------------- REQUIRED ASSERT §8 ---
// Module path: forced save-fail ⇒ engine −moduleDmg, fire roll consumed,
// RNG order pen → dmg → (save, moduleDmg, fire).
{
  const target = mkTarget();
  const shell = mkShell(AP100, 100);
  const hits = [
    mkPlateHit(0.4, mkPlate({ name: 'front50', physicalMm: 50, keMm: 50, ceMm: 50 }), 0, V(0, 1, 2)),
    { t: 0.45, kind: 'module', module: 'engine', point: V(0, 1, 1.5) },
  ];
  const rng = seqRng([0.5, 0.5, 0.1, 0.5, 0.9]); // pen, dmg, save(fail⇒hit), moduleDmg, fire
  const ev = resolveShellHit(shell, target, hits, rng);
  assert(ev.kind === 'pen', `§8 penetrating hit (got ${ev.kind})`);
  assert(rng.consumed() === 5, `§8 exactly 5 rng draws incl. fire roll (got ${rng.consumed()})`);
  near(target.combat.modules.engine.hp, 60, 1e-9, '§8 engine 160 − 100 moduleDmg = 60');
  assert(target.combat.modules.engine.state === 'yellow', '§8 engine at 37.5% ⇒ yellow');
  assert(ev.modulesHit.length === 1 && ev.modulesHit[0].module === 'engine' && ev.modulesHit[0].newState === 'yellow', '§8 modulesHit reports engine yellow');
  assert(ev.fireStarted === false, '§8 fire roll 0.9 ≥ 0.15 ⇒ no fire');
  near(target.combat.hp, 750, 1e-9, '§8 hull damage applied');

  // Same geometry, module beyond the 10×caliber sweep ⇒ save roll not taken.
  const target2 = mkTarget();
  const shell2 = mkShell(AP100, 100);
  const hits2 = [
    mkPlateHit(0.4, mkPlate({ name: 'front50', physicalMm: 50, keMm: 50, ceMm: 50 }), 0, V(0, 1, 2)),
    { t: 0.6, kind: 'module', module: 'engine', point: V(0, 1, 0.5) }, // 1.5 m > 1.0 m limit
  ];
  const rng2 = seqRng([0.5, 0.5]);
  resolveShellHit(shell2, target2, hits2, rng2);
  assert(rng2.consumed() === 2, '§8 sweep limit stops module rolls at 10×caliber');

  // Crew saving throw on the internal ray.
  const target3 = mkTarget();
  const shell3 = mkShell(AP100, 100);
  const hits3 = [
    mkPlateHit(0.4, mkPlate({ name: 'front50', physicalMm: 50, keMm: 50, ceMm: 50 }), 0, V(0, 1, 2)),
    { t: 0.45, kind: 'crew', crew: 'gunner', point: V(0, 1, 1.5) },
  ];
  const rng3 = seqRng([0.5, 0.5, 0.2]); // pen, dmg, crew save (0.2 < 0.33 ⇒ hit)
  const ev3 = resolveShellHit(shell3, target3, hits3, rng3);
  assert(ev3.crewHit.length === 1 && ev3.crewHit[0] === 'gunner', '§8 gunner knocked out');
  assert(target3.combat.crew.gunner === false, '§8 crew state persisted');
}

// ------------------------------------------------- combat-state machinery --
{
  const wwii = createCombatState(mkSpec());
  near(wwii.modules.engine.maxHp, 160, 1e-9, 'WWII engine 160 HP');
  assert(wwii.crew.loader === true, 'default crew includes loader');
  const modern = createCombatState(mkSpec({ era: 'modern', armor: { crew: [{ crew: 'commander' }, { crew: 'gunner' }, { crew: 'driver' }] } }));
  near(modern.modules.engine.maxHp, 400, 1e-9, 'modern module HP ×2.5');
  assert(!('loader' in modern.crew), 'crew roster follows armor model (no loader)');

  const spec = mkSpec();
  const cs = createCombatState(spec);
  startReload(cs, spec);
  near(cs.reload.t, 6, 1e-9, 'reload starts at spec time');
  cs.crew.loader = false;
  startReload(cs, spec);
  near(cs.reload.t, 9, 1e-9, 'dead loader ⇒ reload ×1.5');
  cs.reload.t = 0;
  selectShell(cs, 2);
  assert(cs.shellSlot === 2 && cs.reload.t === cs.reload.totalS, 'shell switch restarts the load');
  selectShell(cs, 2);
  assert(cs.shellSlot === 2, 'same-slot select is a no-op');

  // Fire ticks: hull + module burn, extinguish roll.
  const spec2 = mkSpec();
  const entity = { spec: spec2, combat: createCombatState(spec2) };
  entity.combat.fire.burning = true;
  entity.combat.fire.ticksLeft = 10;
  const t1 = tickFire(entity, rngHalf);
  near(t1.damage, 5, 1e-9, 'fire tick = 0.5% max HP');
  near(entity.combat.hp, 995, 1e-9, 'fire hull damage applied');
  near(entity.combat.modules.engine.hp, 150, 1e-9, 'fire chews engine module');
  assert(t1.extinguished === false && entity.combat.fire.burning === true, 'fire keeps burning on 0.5 roll');
  const t2 = tickFire(entity, () => 0.05);
  assert(t2.extinguished === true && entity.combat.fire.burning === false, 'low roll extinguishes');

  // estimatePenRatio: green head-on, red at strong angle, 0 on ricochet.
  const flat = { plate: mkPlate({}), impactAngleDeg: 0, point: V(0, 1, 2), distM: 100 };
  near(estimatePenRatio(BR365K, 100, flat), 1.19, 0.01, 'pen ratio 119/100 head-on');
  const angled = { plate: mkPlate({}), impactAngleDeg: 55, point: V(0, 1, 2), distM: 100 };
  near(estimatePenRatio(BR365K, 100, angled), 119 / 185.66, 0.01, 'pen ratio at 55°');
  const rico = { plate: mkPlate({ physicalMm: 45, keMm: 45, ceMm: 45 }), impactAngleDeg: 75, point: V(0, 1, 2), distM: 100 };
  near(estimatePenRatio(PZGR39, 100, rico), 0, 1e-9, 'ricochet ⇒ ratio 0');
  near(estimatePenRatio(BR365K, 100, null), 0, 1e-9, 'no plate ⇒ ratio 0');

  // Ammo rack detonation destroys the tank outright.
  const target = mkTarget();
  const shell = mkShell(AP100, 100);
  target.combat.modules.ammoRack.hp = 40; // one hit from cooking off
  const hits = [
    mkPlateHit(0.4, mkPlate({ name: 'front50', physicalMm: 50, keMm: 50, ceMm: 50 }), 0, V(0, 1, 2)),
    { t: 0.45, kind: 'module', module: 'ammoRack', point: V(0, 1, 1.5) },
  ];
  const rng = seqRng([0.5, 0.5, 0.1, 0.5]); // pen, dmg, save(0.1<0.27), moduleDmg
  const ev = resolveShellHit(shell, target, hits, rng);
  assert(ev.ammoRacked === true && ev.destroyed === true, 'ammo rack red ⇒ detonation');
  near(target.combat.hp, 0, 1e-9, 'detonation zeroes HP');
  assert(target.combat.destroyed === true, 'combat state marks destruction');
}

// ------------------------------------------------------------------ report --
if (failures > 0) {
  console.error(`combat.selftest: ${failures}/${checks} assertions FAILED`);
  process.exit(1);
}
console.info(`combat.selftest: ${checks} assertions passed`);
