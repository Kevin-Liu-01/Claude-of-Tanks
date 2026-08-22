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
  solveBallisticGunLay,
  shellGravityMps2,
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
  isHeClass,
  ramDamage,
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
    role: 'medium',
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

  // Optional far anchor: modern rods quote pen at 2 km (M829A4: 750 mm).
  // Specs carrying pen2000Mm get a second linear segment 1000→2000 m so the
  // quoted value lands at 2 km instead of freezing at the 1000 m figure.
  const m829a4 = mkShellSpec({ name: 'M829A4', type: 'APFSDS', caliberMm: 120, pen100Mm: 916, pen1000Mm: 833, pen2000Mm: 750, velocityMps: 1670 });
  near(penAtDistanceMm(m829a4, 100), 916, 1e-9, 'far-anchor spec: 100 m anchor intact');
  near(penAtDistanceMm(m829a4, 1000), 833, 1e-9, 'far-anchor spec: 1000 m anchor intact');
  near(penAtDistanceMm(m829a4, 1500), 791.5, 1e-9, 'far-anchor spec: 1.5 km interpolates 1000→2000');
  near(penAtDistanceMm(m829a4, 2000), 750, 1e-9, 'far-anchor spec: quoted 2 km pen delivered at 2 km');
  near(penAtDistanceMm(m829a4, 3000), 750, 1e-9, 'far-anchor spec: clamped beyond 2 km');

  const g = 9.81 * GRAVITY_SCALE;
  near(
    aimElevationRad(500, 792),
    0.5 * Math.asin((g * 500) / (792 * 792)),
    1e-12,
    'aimElevationRad matches 0.5·asin(gd/v²)'
  );

  // The physical bore is the firing contract. Gravity may curve an unguided
  // shell after launch, but firing must never invisibly steer it above the
  // articulated barrel in order to force an impact through the camera plus.
  const ballisticAim = V(0, 7, 300);
  const ballisticMuzzle = V(0, 2, 0);
  const directDir = ballisticAim.clone().sub(ballisticMuzzle).normalize();
  const boreOwnedShell = createShell(
    BR365K, 'attacker_1', true, ballisticMuzzle, directDir, 98,
  );
  near(boreOwnedShell.vel.clone().normalize().angleTo(directDir), 0, 1e-12,
    'ordinary trigger-time launch preserves the caller-owned physical bore');

  // Bots may request a ballistic lay before firing, but the resulting angle
  // is commanded through their physical gun rather than injected into a shell.
  const botLay = V();
  assert(solveBallisticGunLay(botLay, ballisticMuzzle, ballisticAim, BR365K),
    'bot ballistic gun-lay solution is reachable');
  const flightS = 300 / (BR365K.velocityMps * Math.hypot(botLay.x, botLay.z));
  const solvedY = ballisticMuzzle.y + botLay.y * BR365K.velocityMps * flightS -
    0.5 * shellGravityMps2(BR365K) * flightS * flightS;
  near(solvedY, ballisticAim.y, 1e-8,
    'explicit bot gun lay crosses its requested impact point');

  const guided = mkShellSpec({ name: 'fixture ATGM', velocityMps: 180, guided: true });
  near(shellGravityMps2(guided), 0, 0,
    'guided shell is not given an artificial gravity arc');
  const guidedEntity = createShell(guided, 'attacker_1', true, ballisticMuzzle, directDir, 99);
  stepShell(guidedEntity, 1);
  near(guidedEntity.vel.y, directDir.y * guided.velocityMps, 1e-9,
    'guided shell remains on its center-reticle flight line');

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
  // Armor doc §7: an overpenetrating KE shell exits with remainingPen and may
  // hit a second vehicle — one carry-through max.
  assert(shell.dead === false && shell.carriedThrough === true, '§1 overpen KE shell carries through');
  near(shell.remainingPenMm, 9.22, 0.6, '§1 remaining pen retained after exit');
  const target2 = mkTarget();
  const ev2 = resolveShellHit(shell, target2, [mkPlateHit(0.4, mkPlate({ name: 'thin', physicalMm: 5, keMm: 5, ceMm: 5 }), 0)], rngHalf);
  assert(ev2.kind === 'pen', 'carry-through shell still resolves vs second tank');
  assert(shell.dead === true, 'carry-through capped at one exit');
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

// ------------- ricochet exit still finalizes earlier module damage ----------
// A spaced screen with a moduleLink crossed BEFORE the bouncing plate can
// red-line an ammo rack on this very trace; the ricochet return path must
// re-evaluate destruction instead of leaving a detonated tank alive.
{
  const target = mkTarget();
  target.combat.modules.ammoRack.hp = 40; // one hit from cooking off
  const shell = mkShell(PZGR39, 300);
  const hits = [
    mkPlateHit(0.2, mkPlate({ name: 'sponson_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10, moduleLink: 'ammoRack' }), 0, V(0, 1, 2.5)),
    mkPlateHit(0.4, mkPlate({ name: 'side45', physicalMm: 45, keMm: 45, ceMm: 45 }), 75),
  ];
  const rng = seqRng([0.5, 0.5, 0.1, 0.5]); // pen, dmg, rack save (0.1 < 0.27), rack moduleDmg
  const ev = resolveShellHit(shell, target, hits, rng);
  assert(ev.kind === 'ricochet', `screen-then-steep-plate still ricochets (got ${ev.kind})`);
  assert(ev.ammoRacked === true, 'linked rack went red before the bounce');
  assert(ev.destroyed === true && target.combat.destroyed === true, 'ricochet exit finalizes the detonation');
  near(target.combat.hp, 0, 1e-9, 'detonation zeroes HP on the ricochet path');
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

// -------------------------------------------- HE vs spaced armor (doc §7) --
// A skirted side must take LESS HE damage than a bare side: the absorption
// term stacks screen + main plate and the splash decays over the air gap.
{
  const skirtHits = [
    mkPlateHit(0.2, mkPlate({ name: 'skirt', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10 }), 0, V(0, 1, 2.5)),
    mkPlateHit(0.3, mkPlate({ name: 'side', physicalMm: 80, keMm: 80, ceMm: 80 }), 0, V(0, 1, 2.0)),
  ];
  const skirted = mkTarget();
  const evs = resolveHeBurst(mkShell(OF471, 300), V(0, 1, 2.5), [], skirted, skirtHits, rngHalf);
  assert(evs.length === 1 && evs[0].kind === 'he_splash', 'HE on skirt is a surface burst');
  // 0.5·450·(1 − 0.5/4.089) − 1.1·(10+80) ≈ 98.5
  near(evs[0].damage, 98.5, 1.5, 'HE damage attenuated by skirt+side+gap');

  const bare = mkTarget();
  const bareHits = [mkPlateHit(0.3, mkPlate({ name: 'side', physicalMm: 80, keMm: 80, ceMm: 80 }), 0, V(0, 1, 2.0))];
  const evsBare = resolveHeBurst(mkShell(OF471, 300), V(0, 1, 2.0), [], bare, bareHits, rngHalf);
  // 0.5·450 − 1.1·80 = 137
  near(evsBare[0].damage, 137, 1e-6, 'HE damage on the bare side');
  assert(evs[0].damage < evsBare[0].damage, 'side skirts EAT HE, never amplify it');
}

// ------------------------- HE non-pen direct hit reaches internal modules --
// Armor doc §8 step 3: HE always runs module/crew splash checks even without
// hull damage — at half chance/half damage for internals.
{
  const target = mkTarget();
  const hits = [
    mkPlateHit(0.3, mkPlate({ name: 'front', physicalMm: 100, keMm: 100, ceMm: 100 }), 0, V(0, 1, 2)),
    { t: 0.4, kind: 'module', module: 'engine', point: V(0, 1, 1.0) },
    { t: 0.5, kind: 'crew', crew: 'driver', point: V(0, 1, 0.5) },
  ];
  // pen, dmg, engine save (0.2 < 0.45·0.5), moduleDmg, fire, crew (0.05 < 0.1)
  const rng = seqRng([0.5, 0.5, 0.2, 0.5, 0.9, 0.05]);
  const evs = resolveHeBurst(mkShell(OF471, 300), V(0, 1, 2), [], target, hits, rng);
  assert(rng.consumed() === 6, `HE non-pen rolls internal module+crew (consumed ${rng.consumed()})`);
  // moduleDmg = 122 · 1.0 · 0.5 (half effect) ⇒ engine 160 − 61 = 99
  near(target.combat.modules.engine.hp, 99, 1e-6, 'HE non-pen module damage at half effect');
  assert(evs[0].crewHit.includes('driver'), 'HE non-pen can injure crew at 10%');
}

// ----------------------------- HE area splash injures crew & modules (§6) --
{
  const armorModel = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [mkPlate({ name: 'side38', physicalMm: 38, keMm: 38, ceMm: 38, verts: [[-1.5, 0, 2], [1.5, 0, 2], [1.5, 2, 2], [-1.5, 2, 2]] })],
    turretPlates: [],
    modules: [{ module: 'engine', min: [-0.6, 0.3, -0.5], max: [0.6, 1.5, 0.4], turretLocal: false }],
    crew: [{ crew: 'driver', min: [-0.4, 0.5, 0.5], max: [0.4, 1.2, 1.5], turretLocal: false }],
  };
  const spec = mkSpec({ armor: armorModel });
  const entity = { id: 'splash_victim', spec, state: mkState(), combat: createCombatState(spec) };
  const shell = mkShell(OF471, 300);
  // pen, dmg, then blast-SPHERE order (modules in model order, then crew):
  // engine save (0.1 < 0.45·0.5), moduleDmg, fire, driver crew (0.05 < 0.1).
  const rng = seqRng([0.5, 0.5, 0.1, 0.5, 0.9, 0.05]);
  const events = resolveHeBurst(shell, V(0, 1, 4), [entity], null, null, rng);
  assert(events.length === 1, `area splash produces one event (got ${events.length})`);
  assert(events[0].crewHit.includes('driver'), 'area splash injures crew at 10%');
  near(entity.combat.modules.engine.hp, 99, 1e-6, 'area splash internal module at half chance/half damage');
  assert(rng.consumed() === 6, `area splash consumes crew+module rolls (consumed ${rng.consumed()})`);
}

// ----------- HE AREA splash: side skirts EAT splash on this path too --------
// Armor doc §7: spaced armor absorbs HE splash almost completely. The area
// path must stack skirt + main plate and attenuate over the gap exactly like
// the direct-hit path — a 10 mm skirt must never make a near-miss WORSE than
// the bare 80 mm side (the pre-fix bug priced absorption off the skirt alone).
{
  const sideVerts = [[-1.5, 0, 2], [1.5, 0, 2], [1.5, 2, 2], [-1.5, 2, 2]];
  const skirtVerts = [[-1.5, 0, 2.5], [1.5, 0, 2.5], [1.5, 2, 2.5], [-1.5, 2, 2.5]];
  const mkModel = (withSkirt) => ({
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [
      ...(withSkirt ? [mkPlate({ name: 'skirt', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10, verts: skirtVerts })] : []),
      mkPlate({ name: 'side80', physicalMm: 80, keMm: 80, ceMm: 80, verts: sideVerts }),
    ],
    turretPlates: [],
    modules: [],
    crew: [],
  });
  const skirtSpec = mkSpec({ armor: mkModel(true) });
  const skirted = { id: 'skirted', spec: skirtSpec, state: mkState(), combat: createCombatState(skirtSpec) };
  const evsS = resolveHeBurst(mkShell(OF471, 300), V(0, 1, 4), [skirted], null, null, rngHalf);
  assert(evsS.length === 1 && evsS[0].kind === 'he_splash', `skirted area splash resolves (got ${evsS.length && evsS[0] ? evsS[0].kind : 'none'})`);
  // burst→skirt 1.5 m + 0.5 m gap = 2.0 m; armor 10+80:
  // 0.5·450·(1 − 2/4.089) − 1.1·90 ≈ 16.0
  near(evsS[0].damage, 16.0, 1.5, 'area splash stacks skirt + main + gap');

  const bareSpec = mkSpec({ armor: mkModel(false) });
  const bare = { id: 'bare', spec: bareSpec, state: mkState(), combat: createCombatState(bareSpec) };
  const evsB = resolveHeBurst(mkShell(OF471, 300), V(0, 1, 4), [bare], null, null, rngHalf);
  // dist 2.0 m, armor 80: 0.5·450·(1 − 2/4.089) − 1.1·80 ≈ 27.0
  near(evsB[0].damage, 27.0, 1.5, 'bare-side area splash unchanged');
  assert(evsS[0].damage < evsB[0].damage, 'AREA path: side skirts EAT HE splash, never amplify it');
}

// ------------- HE area splash measures to the NEAREST armor point -----------
// A burst off a hull CORNER whose burst→center ray misses every plate (or
// crosses a far one) must still splash: the query clamps the burst point to
// the hull AABB and traces toward that nearest surface point.
{
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
  const entity = { id: 'corner_victim', spec, state: mkState(), combat: createCombatState(spec) };
  // Burst off the front-right corner: the ray to the hull center (0,1,0)
  // crosses z=2 at x≈1.67 — OUTSIDE the plate — so the old center-ray query
  // produced no splash at all. Nearest point on the AABB is (≈1.49, 1, 2),
  // 1.42 m away: 0.5·450·(1 − 1.42/4.089) − 1.1·38 ≈ 105.
  const shell = mkShell(OF471, 300);
  const events = resolveHeBurst(shell, V(2.5, 1, 3), [entity], null, null, rngHalf);
  assert(events.length === 1, `corner burst splashes via nearest point (got ${events.length} events)`);
  if (events.length === 1) {
    assert(events[0].kind === 'he_splash', `corner burst kind he_splash (got ${events[0].kind})`);
    near(events[0].damage, 105, 2.0, 'corner splash damage priced at the nearest plate');
  }

  // Sanity: a straight-on burst must match the classic formula exactly
  // (nearest-point and center-ray agree when the burst faces the plate).
  const entityB = { id: 'front_victim', spec: mkSpec({ armor: armorModel }), state: mkState(), combat: null };
  entityB.combat = createCombatState(entityB.spec);
  const evsB = resolveHeBurst(mkShell(OF471, 300), V(0, 1, 4), [entityB], null, null, rngHalf);
  near(evsB[0].damage, 73.2, 1.0, 'head-on splash unchanged by the nearest-point query');
}

// ------------------- HE burst on the gun barrel still splashes the target --
{
  const armorModel = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [mkPlate({ name: 'side38', physicalMm: 38, keMm: 38, ceMm: 38, verts: [[-1.5, 0, 2], [1.5, 0, 2], [1.5, 2, 2], [-1.5, 2, 2]] })],
    turretPlates: [],
    modules: [],
    crew: [],
  };
  const spec = mkSpec({ armor: armorModel });
  const entity = { id: 'barrel_victim', spec, state: mkState(), combat: createCombatState(spec) };
  const shell = mkShell(OF471, 300);
  const barrelOnly = [{ t: 0.3, kind: 'module', module: 'gun', point: V(0, 1.9, 3) }];
  const events = resolveHeBurst(shell, V(0, 1.9, 3), [entity], entity, barrelOnly, rngHalf);
  assert(events.length === 1 && events[0].kind === 'he_splash', 'barrel-only HE hit falls back to splash');
  assert(events[0].damage > 0, `barrel-only HE burst damages the tank (got ${events[0].damage})`);
}

// ------------------ HEAT gap decay measured to the NEXT layer, not 'main' --
// skirt → track screen → hull: each gap counted once. (600−10)·(1−0.05·2)
// = 531; −20 ⇒ 511; ·(1−0.05·3) = 434.35 vs 300 CE ⇒ pen.
{
  const target = mkTarget();
  const shell = mkShell(M830A1, 100);
  const hits = [
    mkPlateHit(0.2, mkPlate({ name: 'skirt', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10 }), 0, V(0, 1, 2.5)),
    mkPlateHit(0.25, mkPlate({ name: 'track', kind: 'spaced', physicalMm: 20, keMm: 20, ceMm: 20 }), 0, V(0, 1, 2.3)),
    mkPlateHit(0.3, mkPlate({ name: 'side', physicalMm: 80, keMm: 300, ceMm: 300 }), 0, V(0, 1, 2.0)),
  ];
  const ev = resolveShellHit(shell, target, hits, rngHalf);
  assert(ev.kind === 'pen', `stacked-screen HEAT still pens 300 CE (got ${ev.kind})`);
  near(ev.penRollMm, 434.35, 0.1, 'each air gap decays HEAT exactly once');
}

// --------------------------- damage roll made once per shot (armor doc §6) --
{
  const targetA = mkTarget();
  const shell = mkShell(PZGR39, 300);
  const rng = seqRng([0.5, 0.5]); // pen, dmg — nothing more for both tanks
  const evA = resolveShellHit(shell, targetA, [mkPlateHit(0.4, mkPlate({ name: 'side', physicalMm: 45, keMm: 45, ceMm: 45 }), 75)], rng);
  assert(evA.kind === 'ricochet', 'first tank ricochets');
  const targetB = mkTarget();
  const evB = resolveShellHit(shell, targetB, [mkPlateHit(0.4, mkPlate({ name: 'front50', physicalMm: 50, keMm: 50, ceMm: 50 }), 0)], rng);
  assert(evB.kind === 'pen', 'deflected shell pens second tank');
  near(evB.damage, 220, 1e-9, 'cached dmg roll reused after ricochet');
  assert(rng.consumed() === 2, `no re-rolls on second resolution (consumed ${rng.consumed()})`);
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

// ----------------- red modules stay red for the full repair duration -------
// repairT is a COUNT-UP accumulator (LOCKED, shared with game/state.js
// tickRepairs: `m.repairT += dt; if (m.repairT >= 10) → yellow`). A fresh red
// must start at 0 so the module stays red for ~10 s of simulated ticks.
{
  const target = mkTarget();
  const shell = mkShell(AP100, 100);
  const hits = [
    mkPlateHit(0.4, mkPlate({ name: 'front50', physicalMm: 50, keMm: 50, ceMm: 50 }), 0, V(0, 1, 2)),
    { t: 0.45, kind: 'module', module: 'trackL', point: V(0, 1, 1.5) },
  ];
  resolveShellHit(shell, target, hits, rngHalf); // moduleDmg 100 ⇒ track 0 HP
  const m = target.combat.modules.trackL;
  assert(m.state === 'red', `track destroyed ⇒ red (got ${m.state})`);
  near(m.repairT, 0, 1e-9, 'fresh red arms repairT at 0 (count-up)');

  // Replicate the game-loop repair ticker exactly (game/state.js).
  const dt = 1 / 60;
  const MODULE_REPAIR_S = 10;
  let repairedAtS = -1;
  for (let i = 1; i <= 660; i++) {
    if (m.state !== 'red') break;
    m.repairT += dt;
    if (m.repairT >= MODULE_REPAIR_S) {
      m.repairT = 0;
      m.hp = m.maxHp * 0.5;
      m.state = 'yellow';
      repairedAtS = i * dt;
    }
    if (i === 540) assert(m.state === 'red', 'track still red after 9 s of ticks');
  }
  assert(m.state === 'yellow', 'track auto-repairs to yellow eventually');
  assert(repairedAtS >= MODULE_REPAIR_S - dt, `repair takes ~10 s (took ${repairedAtS.toFixed(2)} s)`);
  near(m.hp, m.maxHp * 0.5, 1e-9, 'repair restores to 50%');
}

// -------------- overpenetration pays for the exit plate (armor doc §7) -----
// remainingPen must survive EVERYTHING, including the far-side armor. A shell
// with 9 mm to spare after the front plate dies inside a 40 mm rear plate; a
// shell with 100 mm to spare exits with 100 − 40 = 60 mm.
{
  const boxModel = {
    boundingRadiusM: 4,
    turretPivot: [0, 1.5, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [
      mkPlate({ name: 'front', physicalMm: 100 }),
      mkPlate({ name: 'rear', physicalMm: 40, keMm: 40, ceMm: 40, verts: [[1, 0, -2], [-1, 0, -2], [-1, 2, -2], [1, 2, -2]] }),
    ],
    turretPlates: [],
    modules: [],
    crew: [],
  };
  const pose0 = tankPoseFromState(mkState());

  // Big pen: exits, minus the rear plate's 40 mm.
  const targetA = mkTarget({ armor: boxModel });
  const shellA = mkShell(AP100, 100); // 200 mm pen at 100 m, rngHalf ⇒ ×1.0
  const hitsA = traceTank(V(0, 1, 10), V(0, 1, -10), pose0, boxModel);
  const evA = resolveShellHit(shellA, targetA, hitsA, rngHalf);
  assert(evA.kind === 'pen', `overpen test: front plate penned (got ${evA.kind})`);
  assert(shellA.dead === false && shellA.carriedThrough === true, 'shell with pen to spare exits the far side');
  near(shellA.remainingPenMm, 60, 0.5, 'exit costs the rear plate: 100 − 40 = 60 mm');

  // Marginal pen: penetrates the front, dies in the rear plate.
  const targetB = mkTarget({ armor: boxModel });
  const shellB = mkShell(BR365K, 500); // 109.2 mm ⇒ 9.2 mm after the front
  const hitsB = traceTank(V(0, 1, 10), V(0, 1, -10), pose0, boxModel);
  const evB = resolveShellHit(shellB, targetB, hitsB, rngHalf);
  assert(evB.kind === 'pen', `marginal overpen still pens the front (got ${evB.kind})`);
  near(targetB.combat.hp, 840, 1e-9, 'full damage applied inside');
  assert(shellB.dead === true, '9 mm remaining cannot exit an 80 mm-LOS rear plate');
  near(shellB.remainingPenMm, 0, 1e-9, 'pen zeroed by the exit plate');
}

// ------------- pen indicator aggregates the whole layered stack ------------
// queryAimArmor returns `layers`; estimatePenRatio must price skirt + gap +
// main (and ERA) exactly like resolution, not just the first spaced plate.
{
  const pose0 = tankPoseFromState(mkState());
  const skirted = {
    boundingRadiusM: 4,
    turretPivot: [0, 1.5, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [
      mkPlate({ name: 'skirt', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10, verts: [[-1, 0, 2.5], [1, 0, 2.5], [1, 2, 2.5], [-1, 2, 2.5]] }),
      mkPlate({ name: 'side', physicalMm: 80, keMm: 80, ceMm: 300 }),
    ],
    turretPlates: [],
    modules: [],
    crew: [],
  };
  const q = queryAimArmor(V(0, 1, 10), V(0, 0, -1), 30, pose0, skirted);
  assert(!!q && q.plate.name === 'skirt', 'aim query still reports the first solid surface');
  assert(q.layers && q.layers.length === 2, `aim query carries the full stack (got ${q && q.layers ? q.layers.length : 0})`);
  // AP: (200 − 10) / 80 = 2.375 — NOT 200/10 = 20 vs the bare skirt.
  near(estimatePenRatio(AP100, 100, q), 2.375, 0.01, 'AP indicator prices skirt + main');
  // HEAT: (600 − 10) · (1 − 0.05·5) = 442.5 over the 0.5 m gap, vs 300 CE.
  near(estimatePenRatio(M830A1, 100, q), 442.5 / 300, 0.01, 'HEAT indicator applies gap decay');

  const eraModel = {
    ...skirted,
    hullPlates: [
      mkPlate({ name: 'era', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10, era: { keReduction: 0.25, ceFlatMm: 600 }, verts: [[-1, 0, 2.6], [1, 0, 2.6], [1, 2, 2.6], [-1, 2, 2.6]] }),
      mkPlate({ name: 'glacis', physicalMm: 220, keMm: 490, ceMm: 900 }),
    ],
  };
  const qe = queryAimArmor(V(0, 1, 10), V(0, 0, -1), 30, pose0, eraModel);
  assert(!!qe && qe.layers.length === 2, 'ERA tile included in the aim stack');
  // 660 × 0.75 = 495 vs 490 KE ⇒ barely green, matching live resolution.
  near(estimatePenRatio(BM60, 100, qe), 495 / 490, 0.01, 'indicator prices average ERA cut');
  // Spent ERA is excluded when the caller passes eraSpent.
  const qs = queryAimArmor(V(0, 1, 10), V(0, 0, -1), 30, pose0, eraModel, new Set(['era']));
  near(estimatePenRatio(BM60, 100, qs), 660 / 490, 0.01, 'spent tile drops out of the estimate');
}

// -------------- APFSDS overmatches with rodDiameter×3, not bore (§11.3) ----
{
  // 125 mm bore ⇒ effective overmatch caliber 75 mm: 75 < 3×30 ⇒ a 30 mm
  // plate at 80° now RICOCHETS a rod (bore-caliber overmatch wrongly ate it).
  const targetA = mkTarget();
  const shellA = mkShell(BM60, 100);
  const evA = resolveShellHit(shellA, targetA, [mkPlateHit(0.4, mkPlate({ name: 'skirt30', physicalMm: 30, keMm: 30, ceMm: 30 }), 80)], rngHalf);
  assert(evA.kind === 'ricochet', `rod vs 30 mm at 80°: 75 < 90 ⇒ ricochet (got ${evA.kind})`);

  // 20 mm roof: 75 ≥ 60 ⇒ no ricochet, and the 2× norm boost uses 75 mm too:
  // norm = 2·1.4·75/20 = 10.5° ⇒ eff = 20/cos(69.5°) ≈ 57.1.
  const targetB = mkTarget();
  const shellB = mkShell(BM60, 100);
  const evB = resolveShellHit(shellB, targetB, [mkPlateHit(0.4, mkPlate({ name: 'roof20', physicalMm: 20, keMm: 20, ceMm: 20 }), 80)], rngHalf);
  assert(evB.kind === 'pen', `rod vs 20 mm roof: 3× overmatch holds (got ${evB.kind})`);
  near(evB.effectiveMm, 57.1, 0.5, 'norm boost computed from the 75 mm effective caliber');

  // Explicit per-spec override wins.
  const fatRod = mkShellSpec({ name: 'fat_rod', type: 'APFSDS', caliberMm: 125, pen100Mm: 660, pen1000Mm: 654, dmg: 560, velocityMps: 1750, effectiveOvermatchCaliberMm: 90 });
  const targetC = mkTarget();
  const evC = resolveShellHit(mkShell(fatRod, 100), targetC, [mkPlateHit(0.4, mkPlate({ name: 'skirt30', physicalMm: 30, keMm: 30, ceMm: 30 }), 80)], rngHalf);
  assert(evC.kind === 'pen', `effectiveOvermatchCaliberMm 90 ≥ 90 suppresses ricochet (got ${evC.kind})`);
}

// -------------- HE on ERA adds the tile's thickness to splash armor --------
{
  const target = mkTarget();
  const shell = mkShell(OF471, 300);
  const hits = [
    mkPlateHit(0.2, mkPlate({ name: 'k5_tile', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10, era: { keReduction: 0.2, ceFlatMm: 400 } }), 0, V(0, 1, 2.5)),
    mkPlateHit(0.3, mkPlate({ name: 'side80', physicalMm: 80, keMm: 80, ceMm: 80 }), 0, V(0, 1, 2.0)),
  ];
  const ev = resolveShellHit(shell, target, hits, rngHalf);
  assert(ev.kind === 'he_splash', `HE on ERA bursts on the surface (got ${ev.kind})`);
  assert(ev.eraPlate === 'k5_tile', 'HE pops the tile');
  assert(target.combat.eraSpent.has('k5_tile'), 'tile recorded as spent');
  // 0.5·450 − 1.1·(80 + 10) = 126 — the tile thickens the splash armor.
  near(ev.damage, 126, 1e-6, 'ERA tile thickness joins the absorption term');
}

// ------- external modules take full odds in the HE blast sweep (§6) --------
{
  const target = mkTarget();
  const shell = mkShell(OF471, 300);
  const hits = [
    { t: 0.2, kind: 'module', module: 'gun', point: V(0, 1, 3) },
    mkPlateHit(0.3, mkPlate({ name: 'front100', physicalMm: 100, keMm: 100, ceMm: 100 }), 0, V(0, 1, 2)),
  ];
  // pen, dmg, gun save 0.3 (< 0.33 full odds; ≥ 0.165 at the old half odds),
  // gun moduleDmg 0.5 ⇒ 122 at FULL damage scale ⇒ gun 150 − 122 = 28.
  const rng = seqRng([0.5, 0.5, 0.3, 0.5]);
  const ev = resolveShellHit(shell, target, hits, rng);
  assert(ev.kind === 'he_splash', `HE non-pen on 100 mm (got ${ev.kind})`);
  assert(rng.consumed() === 4, `gun rolled in the blast sweep (consumed ${rng.consumed()})`);
  near(target.combat.modules.gun.hp, 28, 1e-6, 'external gun at full odds/full damage in the blast');
  assert(ev.modulesHit.some((m) => m.module === 'gun'), 'gun damage reported');
}

// -------------- pen falloff uses true arc length, not age × muzzleV --------
{
  const s = createShell(BR365K, 'a', true, V(0, 50, 0), V(0, 0, -1), 9);
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) stepShell(s, dt);
  assert(s.distM > 792 && s.distM < 794, `distM accumulates arc length (got ${s.distM.toFixed(2)})`);

  // ensurePenRoll consumes the accumulated distance when present.
  const target = mkTarget();
  const shell = mkShell(BR365K, 100);
  shell.distM = 2000; // lobbed arc: far beyond the straight-line estimate
  const ev = resolveShellHit(shell, target, [mkPlateHit(0.4, mkPlate({ name: 'thin', physicalMm: 50, keMm: 50, ceMm: 50 }), 0)], rngHalf);
  near(ev.penRollMm, 97, 0.01, 'pen roll priced at the true 2000 m arc (clamped pen1000)');
}

// ---------------- wrecks are inert cover: absorb, deflect, no damage --------
// Destroyed hulls stay in the broadphase; shells must NOT pass through them.
// Wreck hits deal no damage, roll no modules/crew (only the once-per-shot
// pen+dmg rolls are consumed) and carry targetId null.
{
  const mkWreck = () => {
    const t = mkTarget();
    t.combat.destroyed = true;
    t.combat.hp = 0;
    return t;
  };

  // Main plate swallows the shell with a clang.
  const wreckA = mkWreck();
  const shellA = mkShell(BM60, 100); // 660 mm pen — still absorbed
  const rngA = seqRng([0.5, 0.5]);
  const evA = resolveShellHit(shellA, wreckA, [mkPlateHit(0.4, mkPlate({ name: 'dead_front' }), 0)], rngA);
  assert(evA.kind === 'nonpen', `wreck main plate absorbs the shell (got ${evA.kind})`);
  assert(evA.targetId === null, 'wreck events carry no targetId');
  near(evA.damage, 0, 1e-9, 'wreck takes no damage');
  assert(shellA.dead === true, 'shell dies in the wreck');
  assert(rngA.consumed() === 2, `wreck hit rolls nothing beyond pen+dmg (consumed ${rngA.consumed()})`);
  assert(evA.modulesHit.length === 0 && evA.crewHit.length === 0, 'no module/crew rolls on a wreck');

  // Steep plates still deflect off dead hulls.
  const wreckB = mkWreck();
  const shellB = mkShell(PZGR39, 300);
  const evB = resolveShellHit(shellB, wreckB, [mkPlateHit(0.4, mkPlate({ name: 'dead_side', physicalMm: 45, keMm: 45, ceMm: 45 }), 75)], rngHalf);
  assert(evB.kind === 'ricochet' && evB.targetId === null, `shells ricochet off wrecks (got ${evB.kind})`);
  assert(shellB.dead === false && shellB.bounces === 1, 'deflected shell keeps flying');

  // A kinetic shell clipping only a wreck's skirt keeps flying minus the screen.
  const wreckC = mkWreck();
  const shellC = mkShell(AP100, 100); // 200 mm pen
  const evC = resolveShellHit(shellC, wreckC, [mkPlateHit(0.2, mkPlate({ name: 'dead_skirt', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10 }), 0, V(0, 1, 2.5))], rngHalf);
  assert(evC.kind === 'screen_pierce', `wreck skirt graze pierces (got ${evC.kind})`);
  assert(shellC.dead === false, 'shell survives the wreck skirt');
  near(shellC.remainingPenMm, 190, 0.01, 'wreck screen still costs its thickness');

  // HE detonates ON the wreck surface and splashes live tanks around it.
  const armorModel = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [mkPlate({ name: 'side38', physicalMm: 38, keMm: 38, ceMm: 38, verts: [[-1.5, 0, 2], [1.5, 0, 2], [1.5, 2, 2], [-1.5, 2, 2]] })],
    turretPlates: [],
    modules: [],
    crew: [],
  };
  const wreckSpec = mkSpec({ armor: armorModel });
  const wreckD = { id: 'wreck_d', spec: wreckSpec, state: mkState(), combat: createCombatState(wreckSpec) };
  wreckD.combat.destroyed = true;
  wreckD.combat.hp = 0;
  const liveSpec = mkSpec({ armor: armorModel });
  const live = { id: 'live_bystander', spec: liveSpec, state: mkState({ pos: V(0, 0, -2) }), combat: createCombatState(liveSpec) };
  const heShell = mkShell(OF471, 300);
  const wreckHits = traceTank(V(0, 1, 10), V(0, 1, -10), tankPoseFromState(wreckD.state), armorModel);
  const events = resolveHeBurst(heShell, V(0, 1, 2), [wreckD, live], wreckD, wreckHits, rngHalf);
  assert(events.length === 2, `wreck detonation + live splash (got ${events.length})`);
  assert(events[0].kind === 'he_splash' && events[0].targetId === null && events[0].damage === 0, 'burst on the wreck is a zero-damage detonation event');
  near(events[1].damage, 73.2, 1.0, 'live bystander splashed from the wreck-surface burst');
  near(wreckD.combat.hp, 0, 1e-9, 'wreck takes no splash damage');
  assert(heShell.dead === true, 'HE shell consumed on the wreck');
}

// -------- kinetic screen pierce: skirt-only grazes do not eat the shell -----
// Armor doc §7: the shell subtracts the screen and continues. Only a 'main'
// plate (or exhausted pen) may despawn a kinetic round; HEAT jets are spent
// by the first surface they strike.
{
  const target = mkTarget();
  const shell = mkShell(AP100, 100); // 200 mm pen
  const rng = seqRng([0.5, 0.5]);
  const ev = resolveShellHit(shell, target, [mkPlateHit(0.2, mkPlate({ name: 'skirt_edge', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10 }), 0, V(0, 1, 2.5))], rng);
  assert(ev.kind === 'screen_pierce', `skirt-only KE graze pierces (got ${ev.kind})`);
  assert(shell.dead === false, 'kinetic shell keeps flying past the skirt');
  near(shell.remainingPenMm, 190, 0.01, 'screen thickness subtracted from the live shell');
  near(target.combat.hp, 1000, 1e-9, 'screen pierce deals no hull damage');

  const targetB = mkTarget();
  const heat = mkShell(M830A1, 100);
  const evB = resolveShellHit(heat, targetB, [mkPlateHit(0.2, mkPlate({ name: 'skirt_edge', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10 }), 0, V(0, 1, 2.5))], rngHalf);
  assert(evB.kind === 'spaced_absorb', `HEAT jet is spent on the screen (got ${evB.kind})`);
  assert(heat.dead === true, 'HEAT does not survive a screen-only crossing');
}

// ------------- gun barrel acts as spaced armor (armor doc §4/§7) ------------
{
  // Barrel graze + marginal plate: 200 − 40 (r=0.08 ⇒ 40 mm) = 160 < 170 ⇒
  // the barrel screen turns a would-be pen into a nonpen.
  const target = mkTarget();
  const shell = mkShell(AP100, 100);
  const hits = [
    { t: 0.2, kind: 'module', module: 'gun', external: true, barrel: true, barrelRadiusM: 0.08, point: V(0, 1.9, 3) },
    mkPlateHit(0.5, mkPlate({ name: 'front170', physicalMm: 170, keMm: 170, ceMm: 170 }), 0, V(0, 1, 2)),
  ];
  const ev = resolveShellHit(shell, target, hits, rngHalf); // gun save 0.5 ≥ 0.33 ⇒ no gun dmg
  assert(ev.kind === 'nonpen', `barrel screen absorbs 40 mm before the plate (got ${ev.kind})`);
  near(target.combat.hp, 1000, 1e-9, 'no damage through the barrel-screened plate');

  // Barrel-only graze with pen to spare: shell survives (no misleading clang).
  const targetB = mkTarget();
  const shellB = mkShell(AP100, 100);
  const rngB = seqRng([0.5, 0.5, 0.1, 0.5]); // pen, dmg, gun save (hit), gun dmg
  const evB = resolveShellHit(shellB, targetB, [
    { t: 0.2, kind: 'module', module: 'gun', external: true, barrel: true, barrelRadiusM: 0.08, point: V(0, 1.9, 3) },
  ], rngB);
  assert(evB.kind === 'screen_pierce', `barrel graze pierces, shell flies on (got ${evB.kind})`);
  assert(shellB.dead === false, 'shell alive after clipping the barrel');
  near(shellB.remainingPenMm, 160, 0.01, 'barrel costs its screen value');
  assert(evB.modulesHit.some((m) => m.module === 'gun'), 'gun-damage save still rolls on the graze');
}

// ----- external module boxes (optics) damageable without penetration --------
// Armor doc §12: tracks, gun, viewports are external. traceTank flags optics
// boxes external by default; damage.js honors hit.external.
{
  const target = mkTarget();
  const shell = mkShell(AP100, 100);
  const hits = [
    { t: 0.2, kind: 'module', module: 'optics', external: true, point: V(0, 2.2, 1) },
  ];
  const rng = seqRng([0.5, 0.5, 0.2, 0.5]); // pen, dmg, optics save (0.2 < 0.45), moduleDmg
  const ev = resolveShellHit(shell, target, hits, rng);
  assert(ev.modulesHit.some((m) => m.module === 'optics'), 'optics damaged without hull penetration');
  assert(target.combat.modules.optics.state === 'red', 'periscope shot knocks out the viewport');
  near(target.combat.hp, 1000, 1e-9, 'external optics hit deals no hull damage');
}

// ---------------- HE blast sweep is sphere-based, not ray-based -------------
// An engine box OFF the burst→center ray but inside blastRadius must still
// roll its save (shells doc §6, armor doc §8 step 3).
{
  const armorModel = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [mkPlate({ name: 'side38', physicalMm: 38, keMm: 38, ceMm: 38, verts: [[-1.5, 0, 2], [1.5, 0, 2], [1.5, 2, 2], [-1.5, 2, 2]] })],
    turretPlates: [],
    // Offset to +X: the burst→center ray runs along x=0 and misses this box;
    // its center (1.1, 0.9, 1.0) is ~3.2 m from the burst — inside 4.09 m.
    modules: [{ module: 'engine', min: [0.8, 0.3, 0.5], max: [1.4, 1.5, 1.5], turretLocal: false }],
    crew: [],
  };
  const spec = mkSpec({ armor: armorModel });
  const entity = { id: 'sphere_victim', spec, state: mkState(), combat: createCombatState(spec) };
  const rng = seqRng([0.5, 0.5, 0.1, 0.5, 0.9]); // pen, dmg, engine save, moduleDmg, fire
  const events = resolveHeBurst(mkShell(OF471, 300), V(0, 1, 4), [entity], null, null, rng);
  assert(events.length === 1, `off-ray sphere splash produced an event (got ${events.length})`);
  near(entity.combat.modules.engine.hp, 99, 1e-6, 'off-ray engine rolled at half chance/half damage');
  assert(rng.consumed() === 5, `sphere sweep consumed the engine rolls (consumed ${rng.consumed()})`);
}

// --------------------------- HESH (shells doc §1, §5, §6) -------------------
{
  const L31 = mkShellSpec({ name: 'L31A7', type: 'HESH', caliberMm: 120, pen100Mm: 150, pen1000Mm: 150, dmg: 480, velocityMps: 670 });

  // Never ricochets; non-pen splash gets the 1.25 spall bonus:
  // (0.5·480 − 1.1·200) · 1.25 = 25.
  const target = mkTarget();
  const shell = mkShell(L31, 300);
  const ev = resolveShellHit(shell, target, [mkPlateHit(0.4, mkPlate({ name: 'thick', physicalMm: 200, keMm: 200, ceMm: 200 }), 80)], rngHalf);
  assert(ev.kind === 'he_splash', `HESH bursts instead of ricocheting at 80° (got ${ev.kind})`);
  near(ev.damage, 25, 1e-6, 'HESH spall bonus ×1.25 on the through-armor splash');
  assert(shell.dead === true, 'HESH consumed on impact');

  // Full pen on thin armor behaves like HE full pen: full alpha.
  const targetB = mkTarget();
  const evB = resolveShellHit(mkShell(L31, 300), targetB, [mkPlateHit(0.4, mkPlate({ name: 'thin', physicalMm: 100, keMm: 100, ceMm: 100 }), 0)], rngHalf);
  assert(evB.kind === 'he_pen', `150 mm HESH pens 100 mm (got ${evB.kind})`);
  near(targetB.combat.hp, 520, 1e-9, 'full HESH alpha on penetration');

  // Unknown shell types fail loudly instead of TypeError-ing mid-battle.
  let threw = false;
  try {
    resolveShellHit(mkShell(mkShellSpec({ type: 'BEEHIVE' }), 100), mkTarget(), [mkPlateHit(0.4, mkPlate({}), 0)], rngHalf);
  } catch (e) {
    threw = /unknown shell type/.test(String(e && e.message));
  }
  assert(threw, 'unknown shell type raises a clear error');

  // isHeClass is the LOCKED game-loop routing predicate (game/state.js must
  // burst-resolve any type where this is true — string-comparing 'HE' would
  // leave HESH detonating nowhere and splashing no one).
  assert(isHeClass('HE') === true, 'isHeClass: HE routes to burst resolution');
  assert(isHeClass('HESH') === true, 'isHeClass: HESH routes to burst resolution');
  assert(isHeClass('AP') === false && isHeClass('APCR') === false, 'isHeClass: kinetic rounds excluded');
  assert(isHeClass('APFSDS') === false && isHeClass('HEAT') === false, 'isHeClass: rods and jets excluded');
  let threwHe = false;
  try {
    isHeClass('BEEHIVE');
  } catch (e) {
    threwHe = /unknown shell type/.test(String(e && e.message));
  }
  assert(threwHe, 'isHeClass fails loudly on unknown types');
}

// ------------------- tandem warheads bypass ERA (armor doc §11.2) -----------
{
  const tandem = mkShellSpec({ name: 'tandem_atgm', type: 'HEAT', caliberMm: 152, pen100Mm: 700, pen1000Mm: 700, dmg: 600, velocityMps: 300, tandem: true });
  const eraPlate = mkPlate({ name: 'k5_glacis', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10, era: { keReduction: 0.2, ceFlatMm: 600 }, verts: [[-1, 0, 2.6], [1, 0, 2.6], [1, 2, 2.6], [-1, 2, 2.6]] });
  const target = mkTarget({ era: 'modern', hp: 2000 });
  const hits = [mkPlateHit(0.2, eraPlate, 0, V(0, 1, 2.6)), mkPlateHit(0.3, mkPlate({ name: 'glacis', physicalMm: 220, keMm: 490, ceMm: 650 }), 0)];
  const ev = resolveShellHit(mkShell(tandem, 100), target, hits, rngHalf);
  assert(ev.kind === 'pen', `tandem HEAT ignores the ERA cut: 700 vs 650 CE (got ${ev.kind})`);
  near(ev.penRollMm, 700, 0.01, 'precursor pops the tile, main charge keeps full pen');
  assert(target.combat.eraSpent.has('k5_glacis') && ev.eraPlate === 'k5_glacis', 'tile still detonates once');

  // Indicator agrees (estimatePenRatio prices tandem the same way).
  const q = { plate: hits[1].plate, impactAngleDeg: 0, point: V(0, 1, 2), distM: 100, layers: hits };
  near(estimatePenRatio(tandem, 100, q), 700 / 650, 0.01, 'pen indicator honors tandem bypass');
}

// ------- fuel tanks burn ONLY when destroyed (armor doc §9/§10 authority) ----
// 'No debuff while yellow; red = guaranteed fire (100%)'. The fire draw is
// still consumed on every damaging fuel hit for fixed replay RNG order, but
// its value is ignored for fuel tanks: yellow never ignites, red always does.
{
  const target = mkTarget();
  const mkHits = () => [
    mkPlateHit(0.4, mkPlate({ name: 'front50', physicalMm: 50, keMm: 50, ceMm: 50 }), 0, V(0, 1, 2)),
    { t: 0.45, kind: 'module', module: 'fuelTank', point: V(0, 1, 1.5) },
  ];
  // pen, dmg, save (0.1 < 0.45 ⇒ hit), moduleDmg, fire draw 0.01 (would have
  // ignited at the old 45% coin flip — must NOT ignite while yellow).
  const rng1 = seqRng([0.5, 0.5, 0.1, 0.5, 0.01]);
  const ev1 = resolveShellHit(mkShell(AP100, 100), target, mkHits(), rng1);
  assert(rng1.consumed() === 5, `fuel hit still consumes the fire draw (consumed ${rng1.consumed()})`);
  assert(target.combat.modules.fuelTank.state === 'yellow', `fuel tank 120−100 ⇒ yellow (got ${target.combat.modules.fuelTank.state})`);
  assert(ev1.fireStarted === false && target.combat.fire.burning === false, 'yellow fuel tank NEVER ignites (no 45% coin flip)');

  // Second hit drives it red: guaranteed fire even on a 0.99 fire draw.
  const rng2 = seqRng([0.5, 0.5, 0.1, 0.5, 0.99]);
  const ev2 = resolveShellHit(mkShell(AP100, 100), target, mkHits(), rng2);
  assert(target.combat.modules.fuelTank.state === 'red', 'second hit destroys the fuel tank');
  assert(ev2.fireStarted === true && target.combat.fire.burning === true, 'destroyed fuel tank ignites at 100%');
}

// ------------- ammo rack yellow adds +50% reload time (armor doc §9) --------
{
  const spec = mkSpec();
  const cs = createCombatState(spec);
  cs.modules.ammoRack.hp = cs.modules.ammoRack.maxHp * 0.4;
  cs.modules.ammoRack.state = 'yellow';
  startReload(cs, spec);
  near(cs.reload.t, 9, 1e-9, 'yellow ammo rack ⇒ reload ×1.5');
  cs.crew.loader = false;
  startReload(cs, spec);
  near(cs.reload.t, 13.5, 1e-9, 'dead loader stacks with yellow rack (×2.25)');
  cs.crew.loader = true;
  cs.modules.ammoRack.hp = cs.modules.ammoRack.maxHp;
  cs.modules.ammoRack.state = 'ok';
  startReload(cs, spec);
  near(cs.reload.t, 6, 1e-9, 'repaired rack reloads at spec time again');
}

// ------- shot-info nominalMm reports the rating the pen check used ----------
// KE events stamp keMm; CE **and HE-class** events stamp ceMm — on a modern
// composite (ce ≫ ke) the damage log must show the number the math tested.
{
  const composite = () => mkPlate({ name: 'comp', physicalMm: 220, keMm: 490, ceMm: 900 });
  const evK = resolveShellHit(mkShell(BM60, 100), mkTarget({ era: 'modern', hp: 2000 }), [mkPlateHit(0.4, composite(), 0)], rngHalf);
  near(evK.nominalMm, 490, 1e-9, 'KE shot-info stamps the KE rating');
  const evC = resolveShellHit(mkShell(M830A1, 100), mkTarget({ era: 'modern', hp: 2000 }), [mkPlateHit(0.4, composite(), 0)], rngHalf);
  near(evC.nominalMm, 900, 1e-9, 'HEAT shot-info stamps the CE rating');
  const evH = resolveShellHit(mkShell(OF471, 300), mkTarget({ era: 'modern', hp: 2000 }), [mkPlateHit(0.4, composite(), 0)], rngHalf);
  near(evH.nominalMm, 900, 1e-9, 'HE-class shot-info stamps the CE rating it tested');
}

// -------- ERA tiles are ricochet-checked before spending (armor doc §12) ----
// A HEAT jet grazing a tile past 85° deflects WITHOUT detonating it; KE with
// 3× overmatch vs the thin tile still suppresses ricochet and spends it.
{
  const mkTile = () => mkPlate({ name: 'k5_graze', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10, era: { keReduction: 0.25, ceFlatMm: 600 }, verts: [[-1, 0, 2.6], [1, 0, 2.6], [1, 2, 2.6], [-1, 2, 2.6]] });
  const mkMain = () => mkPlate({ name: 'glacis', physicalMm: 220, keMm: 490, ceMm: 900 });

  const targetA = mkTarget({ era: 'modern', hp: 2000 });
  const jet = mkShell(M830A1, 100);
  const hitsA = [mkPlateHit(0.2, mkTile(), 86, V(0, 1, 2.6)), mkPlateHit(0.3, mkMain(), 0)];
  const evA = resolveShellHit(jet, targetA, hitsA, rngHalf);
  assert(evA.kind === 'ricochet', `HEAT at 86° deflects off the ERA tile (got ${evA.kind})`);
  assert(evA.eraPlate === null && !targetA.combat.eraSpent.has('k5_graze'), 'grazed tile NOT detonated');
  assert(jet.dead === true, 'deflected HEAT jet despawns');
  near(targetA.combat.hp, 2000, 1e-9, 'tile graze deals no damage');
  // Indicator agrees with resolution on the graze.
  const q = { plate: hitsA[1].plate, impactAngleDeg: 0, point: V(0, 1, 2), distM: 100, layers: hitsA };
  near(estimatePenRatio(M830A1, 100, q), 0, 1e-9, 'estimatePenRatio mirrors the tile ricochet');

  // KE: 100 mm ≥ 3×10 mm tile ⇒ no ricochet even at 86°; tile spends as before.
  const targetB = mkTarget({ era: 'modern', hp: 2000 });
  const hitsB = [mkPlateHit(0.2, mkTile(), 86, V(0, 1, 2.6)), mkPlateHit(0.3, mkPlate({ name: 'thin_main', physicalMm: 100, keMm: 100, ceMm: 100 }), 0)];
  const evB = resolveShellHit(mkShell(AP100, 100), targetB, hitsB, rngHalf);
  assert(targetB.combat.eraSpent.has('k5_graze'), '3× overmatched KE still spends the tile');
  assert(evB.kind === 'pen', `200·0.75 = 150 vs 100 mm main ⇒ pen (got ${evB.kind})`);
}

// -------------------- TRACK-HITBOX prisms (armor.trackShapes, 2026-08-06) ---
// Owner order: track hitboxes must follow the REAL \____/ band silhouette.
// specs.attachTrackShapes derives convex prisms from the as-built running
// gear; traceTank rolls rays against them INSTEAD of the legacy full-length
// rectangle plate + AABB pair (which stay in the model for their non-ray
// consumers). Models without trackShapes (everything above) keep the legacy
// path — these checks pin the new one.
{
  // \____/ silhouette: flat ground run z∈[-2.8,2.8] at y=0.05, approach/
  // departure ramps to raised end wraps topping at y=1.05 (convex CCW).
  const poly = [
    [-2.8, 0.05], [2.8, 0.05], [3.5, 0.7], [3.5, 1.05], [-3.5, 1.05], [-3.5, 0.7],
  ];
  const mkTrackArmor = () => ({
    boundingRadiusM: 4.5,
    turretPivot: [0, 1.8, 0],
    gunPivot: [0, 0.3, 0.5],
    gunBarrel: null,
    hullPlates: [
      // legacy authored pair — must be SKIPPED for rays once prisms exist
      mkPlate({ name: 'track_R', kind: 'external', physicalMm: 20, keMm: 20, ceMm: 20, moduleLink: 'trackR', verts: [[1.35, 0.15, 3.5], [1.35, 0.15, -3.5], [1.35, 1.1, -3.5], [1.35, 1.1, 3.5]] }),
      mkPlate({ name: 'hull_side_R', physicalMm: 60, keMm: 60, ceMm: 60, verts: [[0.9, 0.1, 3.4], [0.9, 0.1, -3.4], [0.9, 1.6, -3.4], [0.9, 1.6, 3.4]] }),
    ],
    turretPlates: [],
    modules: [
      { module: 'trackR', min: [0.9, 0, -3.5], max: [1.5, 1.1, 3.5], turretLocal: false },
      { module: 'trackL', min: [-1.5, 0, -3.5], max: [-0.9, 1.1, 3.5], turretLocal: false },
    ],
    crew: [],
    trackShapes: [
      { module: 'trackR', x0: 0.9, x1: 1.5, poly: poly.map((p) => [p[0], p[1]]), plate: { name: 'track_R', physicalMm: 20, keMm: 20, ceMm: 20, kind: 'external', era: null, moduleLink: 'trackR', gunFollow: false } },
      { module: 'trackL', x0: -1.5, x1: -0.9, poly: poly.map((p) => [p[0], p[1]]), plate: { name: 'track_L', physicalMm: 20, keMm: 20, ceMm: 20, kind: 'external', era: null, moduleLink: 'trackL', gunFollow: false } },
    ],
  });
  const pose0 = tankPoseFromState(mkState());

  // Side shot at mid-run track height: prism plate at the OUTER band face
  // (x=1.5, true +X normal), module span record, legacy rectangle skipped.
  const armorT = mkTrackArmor();
  const hits = traceTank(V(10, 0.5, 0), V(-10, 0.5, 0), pose0, armorT);
  const pr = hits.find((h) => h.kind === 'plate' && h.plate.name === 'track_R');
  assert(!!pr, 'prism: side shot crosses the trackR screen');
  if (pr) {
    near(pr.point.x, 1.5, 1e-6, 'prism: screen met at the OUTER band face (x=1.5)');
    near(pr.normal.x, 1, 1e-6, 'prism: side-face normal +X');
    near(pr.impactAngleDeg, 0, 0.01, 'prism: flat side impact angle 0°');
  }
  const mr = hits.find((h) => h.kind === 'module' && h.module === 'trackR');
  assert(!!mr, 'prism: trackR module span reported');
  if (mr) {
    assert(mr.external === false, 'prism: module record stays internal (legacy AABB parity)');
    assert(mr.tExit > mr.t, 'prism: module span carries entry AND exit');
  }
  assert(hits.filter((h) => h.kind === 'plate' && h.plate.name === 'track_R').length === 1,
    'prism: legacy full-length rectangle plate NOT double-reported');
  assert(hits.some((h) => h.kind === 'module' && h.module === 'trackL'),
    'prism: far-side trackL span still crossed (through-shot)');

  // The r6 dead-zone: under the raised end (z=3.3, y=0.3) the old rectangle
  // pair reported track; the real band is 30+ cm higher — nothing there now.
  const hitsGap = traceTank(V(10, 0.3, 3.3), V(-10, 0.3, 3.3), pose0, mkTrackArmor());
  assert(!hitsGap.some((h) => (h.kind === 'plate' && h.plate.moduleLink === 'trackR') || (h.kind === 'module' && h.module === 'trackR')),
    'prism: shot UNDER the raised end no longer reads track');
  assert(hitsGap.some((h) => h.kind === 'plate' && h.plate.name === 'hull_side_R'),
    'prism: that shot still reaches the hull side behind');

  // ...but through the raised wrap itself (y=0.9) the track IS there.
  const hitsWrap = traceTank(V(10, 0.9, 3.3), V(-10, 0.9, 3.3), pose0, mkTrackArmor());
  assert(hitsWrap.some((h) => h.kind === 'plate' && h.plate.name === 'track_R'),
    'prism: raised end-wheel wrap still tracks');

  // End-on shot into the approach ramp: entry through the ANGLED facet —
  // the normal carries the real ramp slope (the rising underside faces
  // forward-DOWN: nz>0, ny<0), never the old flat vertical rectangle.
  const hitsRamp = traceTank(V(1.2, 0.28, 10), V(1.2, 0.28, -10), pose0, mkTrackArmor());
  const ramp = hitsRamp.find((h) => h.kind === 'plate' && h.plate.name === 'track_R');
  assert(!!ramp, 'prism: end-on shot enters through the approach ramp facet');
  if (ramp) {
    assert(ramp.normal.z > 0.3 && ramp.normal.y < -0.3, 'prism: ramp facet normal carries the true slope');
    assert(ramp.impactAngleDeg > 20 && ramp.impactAngleDeg < 70,
      `prism: ramp impact angle is oblique (got ${ramp.impactAngleDeg.toFixed(1)}°)`);
  }

  // Segment starting INSIDE the prism: module span from t=0, no phantom
  // entry plate (no meaningful surface was crossed).
  const hitsIn = traceTank(V(1.2, 0.5, 0), V(10, 0.5, 0), pose0, mkTrackArmor());
  assert(!hitsIn.some((h) => h.kind === 'plate' && h.plate.name === 'track_R'),
    'prism: start-inside segment reports no entry screen');
  const mIn = hitsIn.find((h) => h.kind === 'module' && h.module === 'trackR');
  assert(!!mIn && mIn.t === 0, 'prism: start-inside segment still spans the module from t=0');

  // Full resolution through the prism: screen absorb + track roll + main pen
  // (the legacy flow, now on the real shape).
  const spec = mkSpec({ armor: mkTrackArmor() });
  const entity = { id: 'prism_victim', spec, state: mkState(), combat: createCombatState(spec) };
  const shell = mkShell(AP100, 100);
  const rng = seqRng([0.5, 0.5, 0.2, 0.5, 0.2, 0.5]); // pen, dmg, trackR save+dmg (+straddle save+dmg)
  const hitsRes = traceTank(V(10, 0.5, 0), V(-10, 0.5, 0), tankPoseFromState(entity.state), spec.armor);
  const ev = resolveShellHit(shell, entity, hitsRes, rng);
  assert(ev.kind === 'pen', `prism: side shot pens hull behind the track screen (got ${ev.kind})`);
  assert(ev.modulesHit.some((m) => m.module === 'trackR'), 'prism: track screen crossing rolled track damage');
  near(ev.penRollMm, 180, 1e-9, 'prism: decisive-plate pen roll = 200 minus the 20 mm track screen');
}

// ------------------------------------------------------------- ramming ----
{
  const eq = ramDamage(45, 45, 8); // two mediums, ~29 km/h closing
  near(eq.total, 0.2 * 64 * 22.5, 1e-9, 'ram: equal-mass total = K*c^2*mRed');
  near(eq.toB, eq.total * 0.5, 1e-9, 'ram: equal masses split the pool evenly to the victim');
  near(eq.toA, eq.total * 0.5 * 0.65, 1e-9, 'ram: rammer keeps the attacker discount');
  const hv = ramDamage(65, 20, 12); // heavy rams a light
  assert(hv.toB > hv.toA * 4, 'ram: heavy-on-light deals far more than it takes');
  const bump = ramDamage(45, 45, 2.0);
  assert(bump.total === 0 && bump.toA === 0 && bump.toB === 0,
    'ram: sub-threshold parking bump is free');
  const cap = ramDamage(70, 70, 40);
  near(cap.total, 900, 1e-9, 'ram: freight-train collisions cap at RAM_MAX_TOTAL');
  const fb = ramDamage(0, -5, 8);
  assert(fb.total > 0 && isFinite(fb.toA) && isFinite(fb.toB),
    'ram: missing masses fall back sanely');
  assert(ramDamage(45, 45, -8).total === ramDamage(45, 45, 8).total,
    'ram: closing speed sign is ignored');
}

// ------------------------------------------------------------------ report --
if (failures > 0) {
  console.error(`combat.selftest: ${failures}/${checks} assertions FAILED`);
  process.exit(1);
}
console.info(`combat.selftest: ${checks} assertions passed`);
