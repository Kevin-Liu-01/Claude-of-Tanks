/**
 * combat.selftest.mjs — standalone verification of the combat sim
 * (ARCHITECTURE.md §3.5.4). Run with: node src/sim/combat.selftest.mjs
 * Exits 0 quietly on pass, non-zero with messages on failure.
 * Uses inline fixtures only — no dependency on vehicles/specs.ts.
 */

import { Euler, Quaternion, Vector3 } from 'three';
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
} from './ballistics.ts';
import { tankPoseFromState, traceTank, queryAimArmor } from './armor.ts';
import {
  REPAIR_S,
  createCombatState,
  resolveShellHit,
  resolveHeBurst,
  tickFire,
  tickModuleRepairs,
  repairAllModules,
  selectShell,
  startReload,
  estimatePenRatio,
  blastRadiusM,
  isHeClass,
  ramDamage,
  mainWeaponModuleState,
} from './damage.ts';

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

function mkSideSplashArmor({ includeEngine = false, includeDriver = false } = {}) {
  return {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [mkPlate({
      name: 'side38', physicalMm: 38, keMm: 38, ceMm: 38,
      verts: [[-1.5, 0, 2], [1.5, 0, 2], [1.5, 2, 2], [-1.5, 2, 2]],
    })],
    turretPlates: [],
    modules: includeEngine
      ? [{ module: 'engine', min: [-0.6, 0.3, -0.5], max: [0.6, 1.5, 0.4], turretLocal: false }]
      : [],
    crew: includeDriver
      ? [{ crew: 'driver', min: [-0.4, 0.5, 0.5], max: [0.4, 1.2, 1.5], turretLocal: false }]
      : [],
  };
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

// --------------------------------------------- armor.ts geometry & frames --
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
  assert(hits[0].impactFrame === 'hull', 'hull plate records its authoritative articulation frame');
  near(hits[0].impactLocalX, 0, 1e-9, 'hull frame preserves exact local hit X');
  near(hits[0].impactLocalY, 1, 1e-9, 'hull frame preserves exact local hit Y');
  near(hits[0].impactLocalZ, 2, 1e-9, 'hull frame preserves exact local hit Z');
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

  // Full rollover pose: combat geometry must rotate with the same YXZ hull
  // attitude as the visible tank. An asymmetric plate makes a stale upright
  // hitbox unambiguous: roof-down it moves from +X to -X as well as below the
  // root, so only the visually occupied side may register a hit.
  const rolloverPlate = mkPlate({
    name: 'rollover_asymmetric',
    verts: [[0.3, 0.3, 2], [1.1, 0.3, 2], [1.1, 1.3, 2], [0.3, 1.3, 2]],
  });
  const rolloverModel = {
    boundingRadiusM: 4,
    hullPlates: [rolloverPlate],
    turretPlates: [],
    modules: [],
    crew: [],
  };
  const rolloverPose = tankPoseFromState(mkState({
    pos: V(0, 2, 0),
    visualRoll: Math.PI,
  }));
  const rolloverHits = traceTank(
    V(-0.7, 1.2, 10), V(-0.7, 1.2, -10), rolloverPose, rolloverModel,
  );
  assert(rolloverHits.some((hit) => hit.plate?.name === 'rollover_asymmetric'),
    'roof-down shell trace follows the visibly rotated armor');
  const staleUprightHits = traceTank(
    V(0.7, 1.2, 10), V(0.7, 1.2, -10), rolloverPose, rolloverModel,
  );
  assert(!staleUprightHits.some((hit) => hit.plate?.name === 'rollover_asymmetric'),
    'roof-down shell trace leaves no upright ghost hitbox');

  // Turret yaw: turret plate rotates with turretYaw, hull plates do not.
  const poseTur = tankPoseFromState(mkState({ turretYaw: Math.PI / 2 }));
  const hitsTur = traceTank(V(5, 1.8, 0), V(-5, 1.8, 0), poseTur, armorModel);
  const turHit = hitsTur.find((h) => h.kind === 'plate' && h.plate.name === 'turret_front');
  assert(!!turHit, 'rotated turret plate intersected from the side');
  if (turHit) {
    near(turHit.point.x, 1, 1e-6, 'turret plate world position honors turretYaw');
    assert(turHit.impactFrame === 'turret', 'turret hit retains turret-frame provenance');
    near(turHit.impactLocalX, 0, 1e-6, 'rotated turret hit local X stays centered');
    near(turHit.impactLocalY, 0.3, 1e-6, 'rotated turret hit local Y is exact');
    near(turHit.impactLocalZ, 1, 1e-6, 'rotated turret hit local Z stays on face');
    near(turHit.impactLocalNormalZ, 1, 1e-6, 'turret hit keeps local face normal');

    const spec = mkSpec({ armor: armorModel });
    const target = {
      id: 'rotated_turret_target', spec,
      state: mkState({ turretYaw: Math.PI / 2 }),
      combat: createCombatState(spec),
    };
    const shell = createShell(AP100, 'side_shooter', true, V(5, 1.8, 0), V(-1, 0, 0), 313);
    shell.prevPos.set(5, 1.8, 0);
    shell.pos.set(-5, 1.8, 0);
    const ev = resolveShellHit(shell, target, hitsTur, rngHalf);
    assert(ev.impactFrame === 'turret', 'resolved event preserves turret-frame provenance');
    near(ev.impactLocalPos[2], 1, 1e-6, 'resolved event preserves turret-local contact');
    near(ev.impactLocalNormal[2], 1, 1e-6, 'resolved event preserves turret-local normal');
    near(ev.impactLocalDir[2], -1, 1e-6, 'resolved event preserves turret-local shot direction');
    // Backward-compatible hull-local coordinates still describe the impact
    // in the shot-time hull pose for replay consumers.
    near(ev.localPos[0], 1, 1e-6, 'legacy event localPos remains hull-local');
  }

  // Gun barrel cylinder (external module 'gun').
  const hitsGun = traceTank(V(5, 1.9, 2), V(-5, 1.9, 2), pose0, armorModel);
  assert(hitsGun.some((h) => h.kind === 'module' && h.module === 'gun'), 'barrel cylinder intersected');

  // One gameplay module may have multiple visible components. The broad
  // min/max union remains useful metadata, but empty space between those
  // components must not become a damageable hit volume.
  const segmentedModel = {
    ...armorModel,
    modules: [{
      module: 'optics', min: [-1.5, 0.5, -0.3], max: [1.5, 1.5, 0.3],
      turretLocal: false,
      parts: [
        { min: [-1.5, 0.5, -0.3], max: [-1.0, 1.5, 0.3] },
        { min: [1.0, 0.5, -0.3], max: [1.5, 1.5, 0.3] },
      ],
    }],
  };
  const hitsModuleGap = traceTank(V(0, 1, 1), V(0, 1, -1), pose0, segmentedModel);
  assert(!hitsModuleGap.some((h) => h.kind === 'module' && h.module === 'optics'),
    'segmented module union gap is not damageable');
  const hitsModulePart = traceTank(V(1.2, 1, 1), V(1.2, 1, -1), pose0, segmentedModel);
  assert(hitsModulePart.some((h) => h.kind === 'module' && h.module === 'optics'),
    'segmented module component remains damageable');

  // Fleet anatomy v2: smooth internal volumes no longer inherit the empty
  // corners of their old broad AABB. The center remains damageable while a
  // ray through the containing box's upper-right corner correctly misses.
  const preciseModuleModel = {
    ...armorModel,
    modules: [{
      module: 'optics', min: [-1, 0, -0.5], max: [1, 2, 0.5], turretLocal: false,
      shapes: [{ kind: 'ellipsoid', center: [0, 1, 0], radii: [1, 1, 0.5] }],
    }],
  };
  const preciseCenter = traceTank(V(0, 1, 1), V(0, 1, -1), pose0, preciseModuleModel);
  assert(preciseCenter.some((h) => h.kind === 'module' && h.module === 'optics'),
    'ellipsoid module center remains damageable');
  const preciseCorner = traceTank(V(0.92, 1.92, 1), V(0.92, 1.92, -1), pose0, preciseModuleModel);
  assert(!preciseCorner.some((h) => h.kind === 'module' && h.module === 'optics'),
    'ellipsoid module removes false AABB corner hits');

  // Closed collision cells replace the loose main-plate envelope. This wedge
  // has an angled roof and produces an exact face normal/zone from a segment
  // that never intersects the legacy front quad.
  const wedgePlate = mkPlate({
    name: 'wedge_shell',
    verts: [[-1, 0, 1], [1, 0, 1], [1, 2, 1], [-1, 2, 1]],
    physicalMm: 80, keMm: 80, ceMm: 80,
  });
  const wedgeModel = {
    ...armorModel,
    hullPlates: [wedgePlate],
    turretPlates: [],
    modules: [],
    crew: [],
    collisionShells: {
      hull: [{
        min: [-1, 0, -1], max: [1, 2, 1], vertices: [],
        faces: [
          { normal: [1, 0, 0], constant: -1, plate: wedgePlate },
          { normal: [-1, 0, 0], constant: -1, plate: wedgePlate },
          { normal: [0, -1, 0], constant: 0, plate: wedgePlate },
          { normal: [0, 0, 1], constant: -1, plate: wedgePlate },
          { normal: [0, 0, -1], constant: -1, plate: wedgePlate },
          { normal: [0, 1, 0.5], constant: -2, plate: wedgePlate },
        ],
      }],
      turret: [],
    },
  };
  const wedgeHit = traceTank(V(0, 3, 0), V(0, -1, 0), pose0, wedgeModel)
    .find((h) => h.kind === 'plate');
  assert(wedgeHit && wedgeHit.plate === wedgePlate, 'closed convex shell supplies the main armor hit');
  near(wedgeHit.normal.y, 2 / Math.sqrt(5), 1e-4, 'closed shell preserves angled surface normal');

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

// -------------------------- MOVING REAR-IMPACT LOCALIZATION REGRESSION ---
// A rear hit on a tank that is still advancing must be localized against the
// impact-tick hull pose. Presentation can arrive after the target has moved;
// the resolved event remains pinned to the exact rear-plate intersection.
{
  const rearPlate = mkPlate({
    name: 'hull_rear', physicalMm: 45, keMm: 45, ceMm: 45,
    verts: [[1, 0, -2], [-1, 0, -2], [-1, 2, -2], [1, 2, -2]],
  });
  const armor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.4],
    gunBarrel: { lengthM: 3, radiusM: 0.07 },
    hullPlates: [rearPlate], turretPlates: [], modules: [], crew: [],
  };
  const spec = mkSpec({ armor });
  const impactPos = V(7, 0, 20.4);
  const target = {
    id: 'moving_rear_target', spec,
    state: mkState({ pos: impactPos.clone(), speed: 12 }),
    combat: createCombatState(spec),
  };
  const from = V(7, 1, 10);
  const to = V(7, 1, 30);
  const shell = createShell(AP100, 'rear_shooter', true, from, V(0, 0, 1), 991);
  shell.prevPos.copy(from);
  shell.pos.copy(to);
  const hits = traceTank(from, to, tankPoseFromState(target.state), armor);
  const ev = resolveShellHit(shell, target, hits, rngHalf);
  assert(ev.zone === 'hull_rear', `moving rear shot resolves the rear plate (got ${ev.zone})`);
  near(ev.localPos[0], 0, 1e-9, 'moving rear shot local X matches resolved intersection');
  near(ev.localPos[1], 1, 1e-9, 'moving rear shot local Y matches resolved intersection');
  near(ev.localPos[2], -2, 1e-9, 'moving rear shot local Z stays on rear plate');
  near(ev.pos[2], impactPos.z - 2, 1e-9, 'moving rear shot world point uses impact-tick pose');
  target.state.pos.z += 18; // card renders later, after the target advanced
  near(ev.localPos[2], -2, 1e-9, 'later target motion cannot drag the resolved rear marker');
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
  assert(shell.pos.toArray().join(',') === '0,1,2.02' && shell.prevPos.distanceTo(shell.pos) === 0,
    'ricochet repositions both sweep endpoints just outside the struck surface');
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

  const longTraceTarget = mkTarget();
  const longTraceShellSpec = mkShellSpec({
    name: '200 mm exact-boundary AP', caliberMm: 200,
    pen100Mm: 500, pen1000Mm: 500, moduleDmg: 100,
  });
  const longTraceEvent = resolveShellHit(
    mkShell(longTraceShellSpec, 100),
    longTraceTarget,
    [
      mkPlateHit(0.4, mkPlate({
        name: 'long_trace_entry', physicalMm: 50, keMm: 50, ceMm: 50,
      }), 0, V(0, 1, 2)),
      { t: 0.6, kind: 'module', module: 'engine', point: V(2, 1, 2) },
    ],
    seqRng([0.5, 0.5, 0.1, 0.5, 0.9]),
  );
  assert(longTraceEvent.modulesHit.some((hit) => hit.module === 'engine'),
    'a 200 mm shell reaches an internal module exactly at its 2 m caliber boundary');

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
  const armorModel = mkSideSplashArmor({ includeEngine: true, includeDriver: true });
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
  const armorModel = mkSideSplashArmor({ includeDriver: true });
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
  assert(Object.keys(wwii.crew).join(',') === 'commander,gunner,driver,loader',
    'default crew roster preserves all four canonical stations in order');
  assert(wwii.modules.turretRing?.state === 'ok',
    'default module roster includes the turret ring');
  assert(wwii.reloadChannels.length === 0 && wwii.reload === wwii.gunReload,
    'a gun without authored shells creates no phantom reload channel');
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

  const zeroPhysicalEvent = resolveShellHit(
    mkShell(AP100, 100),
    mkTarget(),
    [mkPlateHit(0.1, mkPlate({
      name: 'zero_physical_norm', physicalMm: 0, keMm: 100, ceMm: 100,
    }), 55)],
    seqRng([0.5, 0.5]),
  );
  near(zeroPhysicalEvent.effectiveMm, 100 / Math.cos(50 * Math.PI / 180) ** 1.4,
    1e-9, 'zero physical thickness cannot trigger divide-by-zero overmatch normalization');

  const exactNormEvent = resolveShellHit(
    mkShell(AP100, 100),
    mkTarget(),
    [mkPlateHit(0.1, mkPlate({
      name: 'exact_norm_threshold', physicalMm: 50, keMm: 50, ceMm: 50,
    }), 55)],
    seqRng([0.5, 0.5]),
  );
  near(exactNormEvent.effectiveMm, 50 / Math.cos(41 * Math.PI / 180) ** 1.4,
    1e-9, 'two-caliber equality activates the kinetic normalization boost');

  const exactRicochetEvent = resolveShellHit(
    mkShell(AP100, 100),
    mkTarget(),
    [mkPlateHit(0.1, mkPlate({
      name: 'exact_ricochet_angle', physicalMm: 100, keMm: 100, ceMm: 100,
    }), 70)],
    seqRng([0.5, 0.5]),
  );
  assert(exactRicochetEvent.kind === 'nonpen',
    'the exact ricochet angle remains contact; only steeper impacts ricochet');

  const lowRollShell = mkShell(AP100, 100);
  const lowRollTarget = mkTarget();
  const lowRollEvent = resolveShellHit(
    lowRollShell,
    lowRollTarget,
    [mkPlateHit(0.1, mkPlate({
      name: 'low_roll_face', physicalMm: 100, keMm: 100, ceMm: 100,
    }), 0)],
    seqRng([0, 0]),
  );
  near(lowRollEvent.penRollMm, 150, 1e-9,
    'minimum penetration roll is exactly 75% of average penetration');
  near(lowRollEvent.damage, 187.5, 1e-9,
    'minimum damage roll is exactly 75% of average damage');

  const moduleTrace = (target, module, rngValues, shellSpec = AP100) => resolveShellHit(
    mkShell(shellSpec, 100),
    target,
    [
      mkPlateHit(0.1, mkPlate({
        name: `${module}_entry`, physicalMm: 50, keMm: 50, ceMm: 50,
      }), 0, V(0, 1, 2)),
      { t: 0.2, tExit: 0.3, kind: 'module', module, point: V(0, 1, 1.5) },
    ],
    seqRng(rngValues),
  );

  const exactSaveTarget = mkTarget();
  const exactSaveEvent = moduleTrace(exactSaveTarget, 'radio', [0.5, 0.5, 0.45]);
  assert(exactSaveEvent.modulesHit.length === 0
    && exactSaveTarget.combat.modules.radio.hp === exactSaveTarget.combat.modules.radio.maxHp,
  'a module save roll exactly at its threshold is a successful save');

  const depletedModuleTarget = mkTarget();
  depletedModuleTarget.combat.modules.radio.hp = 0;
  depletedModuleTarget.combat.modules.radio.state = 'red';
  const depletedModuleEvent = moduleTrace(depletedModuleTarget, 'radio', [0.5, 0.5, 0.1]);
  assert(depletedModuleEvent.modulesHit.length === 0,
    'an already depleted module consumes its save roll but cannot be damaged again');

  const internalHeTarget = mkTarget();
  const internalHeEvent = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2), [], internalHeTarget,
    [
      mkPlateHit(0.1, mkPlate({
        name: 'internal_he_face', physicalMm: 100, keMm: 100, ceMm: 100,
      }), 0, V(0, 1, 2)),
      { t: 0.2, kind: 'module', module: 'engine', point: V(0, 1, 1.5) },
    ],
    seqRng([0.5, 0.5, 0.3]),
  )[0];
  assert(internalHeEvent.modulesHit.length === 0,
    'internal HE module saves use half odds rather than amplified odds');

  const engineTarget = mkTarget();
  const engineEvent = moduleTrace(engineTarget, 'engine', [0.5, 0.5, 0.1, 0.5, 0.1]);
  assert(engineEvent.fireStarted && engineTarget.combat.fire.burning
    && engineTarget.combat.fire.ticksLeft === 10,
  'damaging engine hit below the fire threshold starts the full default burn');

  const transmissionTarget = mkTarget();
  const transmissionEvent = moduleTrace(
    transmissionTarget, 'transmission', [0.5, 0.5, 0.1, 0.5, 0.1],
  );
  assert(transmissionEvent.fireStarted && transmissionTarget.combat.fire.burning,
    'damaging transmission hits use the documented engine-compartment fire roll');

  const inlineTarget = mkTarget();
  const inlineEvent = resolveShellHit(
    mkShell(AP100, 100),
    inlineTarget,
    [
      mkPlateHit(0.1, mkPlate({
        name: 'inline_entry', physicalMm: 50, keMm: 50, ceMm: 50,
      }), 0, V(0, 1, 2)),
      { t: 0.2, tExit: 0.24, kind: 'module', module: 'transmission', point: V(0, 1, 1.8) },
      { t: 0.4, tExit: 0.44, kind: 'module', module: 'engine', point: V(0, 1, 1.5) },
      { t: 0.7, tExit: 0.74, kind: 'module', module: 'fuelTank', point: V(0, 1, 1.1) },
    ],
    seqRng([
      0.5, 0.5,
      0.1, 0.5, 0.9,
      0.1, 0.5, 0.9,
      0.1, 0.5, 0.9,
    ]),
  );
  assert(inlineEvent.modulesHit.map((hit) => hit.module).join(',')
    === 'transmission,engine,fuelTank',
  'one penetrating path damages every intersected module in deterministic trace order');

  const autocannonTarget = mkTarget();
  const autocannon40 = mkShellSpec({
    name: '40 mm APFSDS', type: 'APFSDS', caliberMm: 40,
    pen100Mm: 500, pen1000Mm: 500, moduleDmg: 140,
  });
  const autocannonEvent = resolveShellHit(
    mkShell(autocannon40, 100),
    autocannonTarget,
    [
      mkPlateHit(0.1, mkPlate({
        name: 'autocannon_entry', physicalMm: 20, keMm: 20, ceMm: 20,
      }), 0, V(0, 1, 2)),
      { t: 0.5, tExit: 0.54, kind: 'module', module: 'turretRing', point: V(0, 1, 1.1) },
    ],
    seqRng([0.5, 0.5, 0.1, 0.5]),
  );
  assert(autocannonEvent.modulesHit.some((hit) => hit.module === 'turretRing'),
    'penetrating autocannon spall retains a useful minimum internal module reach');

  const casemateTarget = mkTarget();
  casemateTarget.combat.modules.gunMount = {
    hp: 0, maxHp: 120, state: 'red', repairT: 0,
  };
  assert(mainWeaponModuleState(casemateTarget.combat) === 'red',
    'a destroyed casemate gun mount disables the main weapon');
  casemateTarget.combat.modules.gunMount.state = 'yellow';
  assert(mainWeaponModuleState(casemateTarget.combat) === 'yellow',
    'a damaged casemate gun mount contributes the main-weapon accuracy penalty');

  assert(mainWeaponModuleState(null) === 'ok'
    && mainWeaponModuleState(undefined) === 'ok'
    && mainWeaponModuleState({}) === 'ok'
    && mainWeaponModuleState({ modules: {} }) === 'ok',
  'missing combat and module records retain a healthy main-weapon state');
  assert(mainWeaponModuleState({
    modules: { gun: { state: 'red' }, gunMount: { state: 'yellow' } },
  }) === 'red',
  'the worse barrel or mount state wins regardless of module traversal order');

  const thresholdFireTarget = mkTarget();
  const thresholdFireEvent = moduleTrace(
    thresholdFireTarget, 'engine', [0.5, 0.5, 0.1, 0.5, 0.15],
  );
  assert(!thresholdFireEvent.fireStarted && !thresholdFireTarget.combat.fire.burning,
    'engine fire roll exactly at the threshold does not ignite');

  const protectedEngineTarget = mkTarget();
  protectedEngineTarget.combat.equipMults = { engineFire: 0.5 };
  const protectedEngineEvent = moduleTrace(
    protectedEngineTarget, 'engine', [0.5, 0.5, 0.1, 0.5, 0.1],
  );
  assert(!protectedEngineEvent.fireStarted && !protectedEngineTarget.combat.fire.burning,
    'engine-fire equipment multiplier reduces ignition probability multiplicatively');

  const shortFireTarget = mkTarget();
  shortFireTarget.combat.equipMults = { fireTicks: 0.5 };
  const shortFireEvent = moduleTrace(
    shortFireTarget, 'engine', [0.5, 0.5, 0.1, 0.5, 0.01],
  );
  assert(shortFireEvent.fireStarted && shortFireTarget.combat.fire.ticksLeft === 5,
    'fire-duration equipment multiplier shortens the burn tick budget');

  const burningTarget = mkTarget();
  burningTarget.combat.fire.burning = true;
  burningTarget.combat.fire.ticksLeft = 3;
  const burningEvent = moduleTrace(
    burningTarget, 'engine', [0.5, 0.5, 0.1, 0.5, 0.01],
  );
  assert(!burningEvent.fireStarted && burningTarget.combat.fire.burning
    && burningTarget.combat.fire.ticksLeft === 10,
  'an already burning engine refreshes duration without emitting a second fire-start event');

  const persistentRedTarget = mkTarget();
  persistentRedTarget.combat.modules.engine.hp = 1;
  persistentRedTarget.combat.modules.engine.state = 'red';
  persistentRedTarget.combat.modules.engine.repairT = 4;
  moduleTrace(persistentRedTarget, 'engine', [0.5, 0.5, 0.1, 0.5, 0.9]);
  assert(persistentRedTarget.combat.modules.engine.repairT === 4,
    'additional damage to a red module preserves its in-progress repair timer');

  const freshRedTarget = mkTarget();
  freshRedTarget.combat.modules.engine.hp = 1;
  freshRedTarget.combat.modules.engine.state = 'yellow';
  freshRedTarget.combat.modules.engine.repairT = 4;
  moduleTrace(freshRedTarget, 'engine', [0.5, 0.5, 0.1, 0.5, 0.9]);
  assert(freshRedTarget.combat.modules.engine.state === 'red'
    && freshRedTarget.combat.modules.engine.repairT === 0,
  'a freshly red module starts a new repair timer at zero');

  const lightModuleDamage = mkShellSpec({
    name: 'light-module-damage', pen100Mm: 200, pen1000Mm: 200, moduleDmg: 10,
  });
  const recoveredStateTarget = mkTarget();
  recoveredStateTarget.combat.modules.engine.hp = 100;
  recoveredStateTarget.combat.modules.engine.state = 'yellow';
  recoveredStateTarget.combat.modules.engine.repairT = 5;
  moduleTrace(
    recoveredStateTarget, 'engine', [0.5, 0.5, 0.1, 0.5, 0.9], lightModuleDamage,
  );
  assert(recoveredStateTarget.combat.modules.engine.state === 'ok'
    && recoveredStateTarget.combat.modules.engine.repairT === 0,
  'a non-red module state clears stale repair progress');

  const crewTrace = (target, roll) => resolveShellHit(
    mkShell(AP100, 100),
    target,
    [
      mkPlateHit(0.1, mkPlate({
        name: 'crew_entry', physicalMm: 50, keMm: 50, ceMm: 50,
      }), 0, V(0, 1, 2)),
      { t: 0.2, tExit: 0.3, kind: 'crew', crew: 'driver', point: V(0, 1, 1.5) },
    ],
    seqRng([0.5, 0.5, roll]),
  );

  const inactiveCrewTarget = mkTarget();
  inactiveCrewTarget.combat.crew.driver = false;
  const inactiveCrewEvent = crewTrace(inactiveCrewTarget, 0.1);
  assert(inactiveCrewEvent.crewHit.length === 0,
    'an already incapacitated crew member cannot be hit again');

  const exactCrewTarget = mkTarget();
  const exactCrewEvent = crewTrace(exactCrewTarget, 0.33);
  assert(exactCrewEvent.crewHit.length === 0 && exactCrewTarget.combat.crew.driver,
    'direct crew roll exactly at the threshold is a successful save');

  const protectedCrewTarget = mkTarget();
  protectedCrewTarget.combat.equipMults = { crewHe: 0.5 };
  const protectedCrewEvent = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2), [], protectedCrewTarget,
    [
      mkPlateHit(0.1, mkPlate({
        name: 'protected_crew_face', physicalMm: 100, keMm: 100, ceMm: 100,
      }), 0, V(0, 1, 2)),
      { t: 0.2, kind: 'crew', crew: 'driver', point: V(0, 1, 1.5) },
    ],
    seqRng([0.5, 0.5, 0.075]),
  )[0];
  assert(protectedCrewEvent.crewHit.length === 0 && protectedCrewTarget.combat.crew.driver,
    'HE crew protection reduces incapacitation probability multiplicatively');

  const lastCrewTarget = mkTarget();
  lastCrewTarget.combat.crew = { driver: true };
  lastCrewTarget.combat.fire.burning = true;
  const lastCrewEvent = crewTrace(lastCrewTarget, 0.1);
  assert(lastCrewEvent.destroyed && lastCrewTarget.combat.destroyed
    && lastCrewTarget.combat.hp === 0 && !lastCrewTarget.combat.fire.burning,
  'incapacitating the final crew member destroys the tank and extinguishes fire');

  const emptyCrewTarget = mkTarget();
  emptyCrewTarget.combat.crew = {};
  const emptyCrewEvent = resolveShellHit(
    mkShell(AP100, 100),
    emptyCrewTarget,
    [mkPlateHit(0.1, mkPlate({
      name: 'empty_crew_nonpen', physicalMm: 300, keMm: 300, ceMm: 300,
    }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(!emptyCrewEvent.destroyed && !emptyCrewTarget.combat.destroyed
    && emptyCrewTarget.combat.hp === emptyCrewTarget.combat.maxHp,
  'an explicitly empty crew roster does not vacuously destroy the vehicle');

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
// repairT is a COUNT-UP accumulator (LOCKED, shared with game/state.ts
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

  // Replicate the game-loop repair ticker exactly (game/state.ts).
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

// ---------------- repair kits restore only damaged, present modules --------
{
  assert(repairAllModules(null).length === 0, 'repair kit safely ignores missing combat state');
  const combat = createCombatState(mkSpec());
  combat.modules.engine.hp = 0;
  combat.modules.engine.state = 'red';
  combat.modules.engine.repairT = 4;
  combat.modules.trackL.hp = 55;
  combat.modules.trackL.state = 'yellow';
  combat.modules.trackL.repairT = 2;
  combat.modules.gun = undefined; // tolerate a sparse authored module record
  const fixed = repairAllModules(combat);
  assert(fixed.length === 2 && fixed.includes('engine') && fixed.includes('trackL'),
    'repair kit reports every damaged module and skips ok/missing entries');
  assert(combat.modules.engine.hp === combat.modules.engine.maxHp
    && combat.modules.engine.state === 'ok' && combat.modules.engine.repairT === 0,
  'repair kit fully restores a destroyed module and clears its timer');
  assert(combat.modules.trackL.hp === combat.modules.trackL.maxHp
    && combat.modules.trackL.state === 'ok' && combat.modules.trackL.repairT === 0,
  'repair kit fully restores a yellow module');
  assert(repairAllModules(combat).length === 0, 'repair kit is a no-op when all modules are healthy');

  const missingModules = createCombatState(mkSpec());
  missingModules.modules = null;
  assert(repairAllModules(missingModules).length === 0,
    'repair kit safely ignores legacy combat state without a module record');
}

// -------------- overpenetration pays for the exit plate (armor doc §7) -----
// remainingPen must survive EVERYTHING, including the far-side armor. A shell
// with 9 mm to spare after the front plate dies inside a 40 mm rear plate; a
// shell with 100 mm to spare exits with 100 − 40 = 60 mm.
{
  const boxModel = {
    boundingRadiusM: 3.5,
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
  const expectedExitZ = 2 - (2 + Math.sqrt(3.5 * 3.5 - 0.2 * 0.2) + 0.05);
  near(shellA.pos.x, 0, 1e-9, 'carry-through exit preserves the shell ray X');
  near(shellA.pos.y, 1, 1e-9, 'carry-through exit preserves the shell ray Y');
  near(shellA.pos.z, expectedExitZ, 1e-9,
    'carry-through exit uses authored radius, target center, and clearance');
  near(shellA.prevPos.distanceTo(shellA.pos), 0, 1e-12,
    'carry-through resets the previous position to prevent a synthetic long sweep');

  // Marginal pen: penetrates the front, dies in the rear plate.
  const targetB = mkTarget({ armor: boxModel });
  const shellB = mkShell(BR365K, 500); // 109.2 mm ⇒ 9.2 mm after the front
  const hitsB = traceTank(V(0, 1, 10), V(0, 1, -10), pose0, boxModel);
  const evB = resolveShellHit(shellB, targetB, hitsB, rngHalf);
  assert(evB.kind === 'pen', `marginal overpen still pens the front (got ${evB.kind})`);
  near(targetB.combat.hp, 840, 1e-9, 'full damage applied inside');
  assert(shellB.dead === true, '9 mm remaining cannot exit an 80 mm-LOS rear plate');
  near(shellB.remainingPenMm, 0, 1e-9, 'pen zeroed by the exit plate');

  const rearVerts = (z) => [[1, 0, z], [-1, 0, z], [-1, 2, z], [1, 2, z]];
  const layeredExitModel = {
    ...boxModel,
    hullPlates: [
      mkPlate({ name: 'layered_entry', physicalMm: 50, keMm: 50, ceMm: 50 }),
      mkPlate({
        name: 'exit_era', kind: 'era', physicalMm: 1000, keMm: 1000, ceMm: 1000,
        verts: rearVerts(-2.2), era: { keReduction: 0.9, ceFlatMm: 1000 },
      }),
      mkPlate({
        name: 'exit_outer', physicalMm: 40, keMm: 40, ceMm: 40,
        verts: rearVerts(-2),
      }),
      mkPlate({
        name: 'exit_inner', kind: 'spaced', physicalMm: 30, keMm: 30, ceMm: 30,
        verts: rearVerts(-1.8),
      }),
    ],
  };
  const layeredExitTarget = mkTarget({ armor: layeredExitModel });
  const layeredExitShell = mkShell(AP100, 100);
  const layeredExitHits = traceTank(
    V(0, 1, 10), V(0, 1, -10), pose0, layeredExitModel,
  );
  const layeredExitEvent = resolveShellHit(
    layeredExitShell, layeredExitTarget, layeredExitHits, rngHalf,
  );
  assert(layeredExitEvent.kind === 'pen' && layeredExitShell.carriedThrough
    && !layeredExitShell.dead,
  'kinetic shell carries through a layered rear exit when structural residual penetration remains');
  near(layeredExitShell.remainingPenMm, 80, 0.5,
    'exit charge ignores ERA and subtracts every structural rear layer');
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

// -------- swept-step overshoot is charged only through the actual impact --
{
  const stageSweep = (shell, distM = 10) => {
    shell.prevPos.set(0, 1, 10);
    shell.pos.set(0, 1, 0);
    shell.distM = distM;
    return shell;
  };
  const impact = V(0, 1, 6); // 4 m from prevPos; 6 m of the 10 m sweep is unused.
  const thickMain = mkPlate({
    name: 'overshoot_main', physicalMm: 300, keMm: 300, ceMm: 300,
  });

  const stopped = stageSweep(mkShell(AP100, 100));
  const stoppedEvent = resolveShellHit(
    stopped, mkTarget(), [mkPlateHit(0.1, thickMain, 0, impact)], seqRng([0.5, 0.5]),
  );
  near(stopped.distM, 4, 1e-9, 'terminal live hit trims the unused swept-step distance');
  near(stoppedEvent.flightDistM, 4, 1e-9, 'terminal live event records distance through impact');

  const clamped = stageSweep(mkShell(AP100, 100), 2);
  resolveShellHit(
    clamped, mkTarget(), [mkPlateHit(0.1, thickMain, 0, impact)], seqRng([0.5, 0.5]),
  );
  near(clamped.distM, 0, 1e-9, 'swept-step correction cannot make flight distance negative');

  const skirt = mkPlate({
    name: 'overshoot_skirt', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
  });
  const pierced = stageSweep(mkShell(AP100, 100));
  const piercedEvent = resolveShellHit(
    pierced, mkTarget(), [mkPlateHit(0.1, skirt, 0, impact)], seqRng([0.5, 0.5]),
  );
  assert(piercedEvent.kind === 'screen_pierce' && !pierced.dead,
    'live skirt-only sweep remains a screen pierce');
  near(piercedEvent.flightDistM, 4, 1e-9,
    'screen-pierce event metadata is measured at the screen contact');
  near(pierced.distM, 10, 1e-9,
    'surviving screen pierce restores the remaining swept distance');

  const wreckTarget = () => {
    const target = mkTarget();
    target.combat.destroyed = true;
    target.combat.hp = 0;
    return target;
  };

  const wreckStopped = stageSweep(mkShell(AP100, 100));
  resolveShellHit(
    wreckStopped, wreckTarget(), [mkPlateHit(0.1, thickMain, 0, impact)],
    seqRng([0.5, 0.5]),
  );
  near(wreckStopped.distM, 4, 1e-9,
    'terminal wreck impact keeps distance trimmed to its contact point');

  const wreckPierced = stageSweep(mkShell(AP100, 100));
  const wreckPiercedEvent = resolveShellHit(
    wreckPierced, wreckTarget(), [mkPlateHit(0.1, skirt, 0, impact)],
    seqRng([0.5, 0.5]),
  );
  assert(wreckPiercedEvent.kind === 'screen_pierce' && !wreckPierced.dead,
    'wreck skirt-only sweep remains a surviving screen pierce');
  near(wreckPierced.distM, 10, 1e-9,
    'surviving wreck screen pierce restores the remaining swept distance');

  const wreckRicochet = stageSweep(mkShell(PZGR39, 100));
  const wreckRicochetEvent = resolveShellHit(
    wreckRicochet,
    wreckTarget(),
    [mkPlateHit(0.1, mkPlate({
      name: 'overshoot_ricochet', physicalMm: 45, keMm: 45, ceMm: 45,
    }), 75, impact)],
    seqRng([0.5, 0.5]),
  );
  assert(wreckRicochetEvent.kind === 'ricochet' && !wreckRicochet.dead,
    'wreck ricochet survives without being mislabeled as a screen pierce');
  near(wreckRicochet.distM, 4, 1e-9,
    'wreck ricochet does not restore distance beyond the impact point');
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
  assert(evA.pos.join(',') === '0,1,2' && evA.normal.join(',') === '0,0,1'
    && evA.effectiveMm === 100 && evA.penRollMm === 660,
  'wreck main-plate event retains exact impact and penetration metadata');

  // Steep plates still deflect off dead hulls.
  const wreckB = mkWreck();
  const shellB = mkShell(PZGR39, 300);
  const evB = resolveShellHit(shellB, wreckB, [mkPlateHit(0.4, mkPlate({ name: 'dead_side', physicalMm: 45, keMm: 45, ceMm: 45 }), 75)], rngHalf);
  assert(evB.kind === 'ricochet' && evB.targetId === null, `shells ricochet off wrecks (got ${evB.kind})`);
  assert(shellB.dead === false && shellB.bounces === 1, 'deflected shell keeps flying');
  assert(evB.pos.join(',') === '0,1,2' && evB.impactAngleDeg === 75
    && evB.effectiveMm === 0 && evB.penRollMm > 0,
  'wreck ricochet retains exact contact metadata');

  const cappedRicochet = mkShell(PZGR39, 300);
  cappedRicochet.bounces = 1;
  const cappedEvent = resolveShellHit(
    cappedRicochet,
    mkWreck(),
    [mkPlateHit(0.4, mkPlate({
      name: 'dead_second_bounce', physicalMm: 45, keMm: 45, ceMm: 45,
    }), 75)],
    rngHalf,
  );
  assert(cappedEvent.kind === 'ricochet' && cappedRicochet.bounces === 2 && cappedRicochet.dead,
    'the second kinetic wreck ricochet reaches the shared bounce cap');

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

  // resolveShellHit may also receive the wreck surface directly before the
  // caller fans the burst out to nearby live tanks. That path must retain the
  // actual contact point/normal while remaining an inert zero-damage event.
  const directHe = mkShell(OF471, 300);
  const directHeRng = seqRng([0.5, 0.5]);
  const directHeHit = mkPlateHit(
    0.25,
    mkPlate({ name: 'dead_he_face', physicalMm: 38, keMm: 38, ceMm: 38 }),
    0,
    V(0.2, 1.1, 2.3),
    V(0, 0, 1),
  );
  const directHeEvent = resolveShellHit(directHe, wreckD, [directHeHit], directHeRng);
  assert(directHeEvent.kind === 'he_splash' && directHeEvent.targetId === null,
    'direct HE contact on a wreck emits an inert detonation event');
  assert(directHeEvent.pos[0] === 0.2 && directHeEvent.pos[1] === 1.1
    && directHeEvent.pos[2] === 2.3, 'wreck HE event preserves contact position');
  assert(directHeEvent.normal[0] === 0 && directHeEvent.normal[1] === 0
    && directHeEvent.normal[2] === 1, 'wreck HE event preserves contact normal');
  assert(directHe.dead === true && directHeRng.consumed() === 2,
    'direct wreck HE consumes only the once-per-shot rolls');

  const moduleBeforePlate = mkShell(OF471, 300);
  const moduleBeforePlateEvent = resolveShellHit(
    moduleBeforePlate,
    wreckD,
    [
      { t: 0.1, kind: 'module', module: 'gun', point: V(9, 9, 9), external: true },
      directHeHit,
    ],
    seqRng([0.5, 0.5]),
  );
  assert(moduleBeforePlateEvent.pos.join(',') === '0.2,1.1,2.3'
    && moduleBeforePlateEvent.normal.join(',') === '0,0,1',
  'wreck HE contact prefers the first armor plate over an earlier non-plate intersection');
}

// -------- authored-plate seam compatibility is bounded and deterministic --
// Legacy armor without closed collision shells may report only an internal
// module/crew intersection at a tiny seam between visual quads. Charge the
// weakest authored main plate exactly once; modern closed shells suppress the
// compatibility path because their convex surface has no such gaps.
{
  const weakHull = mkPlate({
    name: 'weak_hull', physicalMm: 130, keMm: null, ceMm: 130,
  });
  delete weakHull.kind;
  const seamArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [
      mkPlate({ name: 'skirt', kind: 'external', physicalMm: 8, keMm: 8, ceMm: 8 }),
      { ...mkPlate({ name: 'zero_plate', physicalMm: 0, keMm: null, ceMm: 0 }), kind: undefined },
      weakHull,
    ],
    turretPlates: [mkPlate({ name: 'strong_turret', physicalMm: 180, keMm: 180, ceMm: 180 })],
    modules: [],
    crew: [],
  };
  const seamSpec = mkSpec({ armor: seamArmor });
  const internalHits = [
    {
      t: 0.2, tExit: 0.4, kind: 'module', module: 'ammoRack',
      point: V(0, 1, 1), barrel: false, external: false,
    },
    { t: 0.3, tExit: 0.5, kind: 'crew', crew: 'driver', point: V(0, 1, 0.5) },
  ];
  const seamTarget = {
    id: 'seam_target', spec: seamSpec, state: mkState(), combat: createCombatState(seamSpec),
  };
  const seamRng = seqRng([0.5, 0.5, 0.1, 0.5, 0.1]);
  const seamShell = mkShell(AP100, 100);
  const seamEvent = resolveShellHit(seamShell, seamTarget, internalHits, seamRng);
  assert(seamEvent.kind === 'pen' && seamEvent.zone === 'seam_weak_hull',
    'legacy seam hit charges the weakest authored main plate');
  near(seamEvent.effectiveMm, 130, 1e-9, 'legacy seam uses physical armor when KE RHAe is absent');
  near(seamEvent.damage, 250, 1e-9, 'penetrating seam applies the once-per-shot damage roll');
  assert(seamEvent.modulesHit.some((hit) => hit.module === 'ammoRack')
    && seamEvent.crewHit.includes('driver'), 'penetrating seam resolves internal module and crew hits');
  assert(seamRng.consumed() === 5, 'seam penetration preserves fixed module/crew RNG order');
  assert(seamEvent.plateKind === 'main' && seamTarget.combat.hp === 750 && seamShell.dead,
    'penetrating seam stamps structural classification, applies HP damage, and consumes the shell');

  weakHull.physicalMm = 5;
  const cachedTarget = {
    id: 'cached_seam', spec: seamSpec, state: mkState(), combat: createCombatState(seamSpec),
  };
  const cachedEvent = resolveShellHit(
    mkShell(BR365K, 100),
    cachedTarget,
    [{ t: 0.2, tExit: 0.4, kind: 'crew', crew: 'driver', point: V(0, 1, 1) }],
    seqRng([0.5, 0.5]),
  );
  assert(cachedEvent.kind === 'nonpen' && cachedEvent.effectiveMm === 130,
    'cached seam armor still blocks a weaker follow-up shell without internal rolls');
  weakHull.physicalMm = 130;

  const exactSeamSpec = mkShellSpec({
    name: 'exact-seam-pen', pen100Mm: 130, pen1000Mm: 130,
  });
  const exactSeamTarget = {
    id: 'exact_seam', spec: seamSpec, state: mkState(), combat: createCombatState(seamSpec),
  };
  const exactSeamShell = mkShell(exactSeamSpec, 100);
  const exactSeamEvent = resolveShellHit(
    exactSeamShell,
    exactSeamTarget,
    [{ t: 0.2, tExit: 0.4, kind: 'crew', crew: 'driver', point: V(0, 1, 1) }],
    seqRng([0.5, 0.5, 0.9]),
  );
  assert(exactSeamEvent.kind === 'pen' && exactSeamEvent.damage === exactSeamSpec.dmg
    && exactSeamTarget.combat.hp === 840 && exactSeamShell.dead,
  'legacy seam penetration succeeds at exact residual-to-armor equality');

  const seamProbe = (id, armor) => {
    delete armor._seamMm;
    delete armor._seamPlate;
    const spec = mkSpec({ armor });
    const target = { id, spec, state: mkState(), combat: createCombatState(spec) };
    return resolveShellHit(
      mkShell(AP100, 100),
      target,
      [{ t: 0.2, tExit: 0.4, kind: 'crew', crew: 'driver', point: V(0, 1, 1) }],
      seqRng([0.5, 0.5, 0.9]),
    );
  };
  const authoredKeArmor = {
    ...seamArmor,
    hullPlates: [mkPlate({
      name: 'authored_ke_seam', physicalMm: 500, keMm: 120, ceMm: 500,
    })],
    turretPlates: [mkPlate({
      name: 'strong_ke_turret', physicalMm: 600, keMm: 600, ceMm: 600,
    })],
  };
  const authoredKeEvent = seamProbe('authored_ke_seam_target', authoredKeArmor);
  assert(authoredKeEvent.kind === 'pen' && authoredKeEvent.effectiveMm === 120,
    'legacy seam charging uses authored kinetic RHAe instead of physical thickness');

  const turretOnlyArmor = {
    ...seamArmor,
    hullPlates: [mkPlate({
      name: 'turret_only_skirt', kind: 'external', physicalMm: 5, keMm: 5, ceMm: 5,
    })],
    turretPlates: [mkPlate({
      name: 'turret_only_main', physicalMm: 90, keMm: 90, ceMm: 90,
    })],
  };
  const turretOnlyEvent = seamProbe('turret_only_seam_target', turretOnlyArmor);
  assert(turretOnlyEvent.kind === 'pen' && turretOnlyEvent.zone === 'seam_turret_only_main'
    && turretOnlyEvent.effectiveMm === 90,
  'legacy seam charging scans turret armor when no main hull plate exists');

  const firstTie = mkPlate({
    name: 'first_equal_seam', physicalMm: 111, keMm: 100, ceMm: 111,
  });
  const secondTie = mkPlate({
    name: 'second_equal_seam', physicalMm: 222, keMm: 100, ceMm: 222,
  });
  const tieEvent = seamProbe('equal_seam_target', {
    ...seamArmor,
    hullPlates: [firstTie, secondTie],
    turretPlates: [],
  });
  assert(tieEvent.zone === 'seam_first_equal_seam' && tieEvent.physicalMm === 111,
    'equal seam ratings deterministically preserve the first authored plate');

  const defaultArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    modules: [], crew: [],
  };
  const defaultSpec = mkSpec({ armor: defaultArmor });
  const defaultTarget = {
    id: 'default_seam', spec: defaultSpec, state: mkState(), combat: createCombatState(defaultSpec),
  };
  const defaultEvent = resolveShellHit(
    mkShell(AP100, 100),
    defaultTarget,
    [{ t: 0.2, tExit: 0.4, kind: 'crew', crew: 'driver', point: V(0, 1, 1) }],
    seqRng([0.5, 0.5, 0.9]),
  );
  assert(defaultEvent.kind === 'pen' && defaultEvent.zone === 'seam_hull'
    && defaultEvent.effectiveMm === 40,
  'plate-less legacy fixtures use the documented 40 mm seam fallback');

  for (const collisionShells of [
    { hull: [{ faces: [] }], turret: [] },
    { hull: [], turret: [{ faces: [] }] },
    { hull: [{ faces: [] }] },
    { turret: [{ faces: [] }] },
  ]) {
    const closedArmor = { ...seamArmor, collisionShells };
    const closedSpec = mkSpec({ armor: closedArmor });
    const closedTarget = {
      id: 'closed_seam', spec: closedSpec, state: mkState(), combat: createCombatState(closedSpec),
    };
    const closedShell = mkShell(AP100, 100);
    const closedEvent = resolveShellHit(
      closedShell,
      closedTarget,
      [{ t: 0.2, tExit: 0.4, kind: 'crew', crew: 'driver', point: V(0, 1, 1) }],
      seqRng([0.5, 0.5]),
    );
    assert(closedEvent.kind === 'screen_pierce' && closedShell.dead === false,
      'closed hull/turret collision shells suppress legacy seam charging');
  }

  const emptyPartialArmor = { ...seamArmor, collisionShells: { hull: [] } };
  delete emptyPartialArmor._seamMm;
  delete emptyPartialArmor._seamPlate;
  const emptyPartialSpec = mkSpec({ armor: emptyPartialArmor });
  const emptyPartialTarget = {
    id: 'empty_partial_collision_shell', spec: emptyPartialSpec, state: mkState(),
    combat: createCombatState(emptyPartialSpec),
  };
  const emptyPartialEvent = resolveShellHit(
    mkShell(AP100, 100),
    emptyPartialTarget,
    [{ t: 0.2, tExit: 0.4, kind: 'crew', crew: 'driver', point: V(0, 1, 1) }],
    seqRng([0.5, 0.5, 0.9]),
  );
  assert(emptyPartialEvent.kind === 'pen',
    'an empty partial collision-shell record safely retains legacy seam compatibility');
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
// boxes external by default; damage.ts honors hit.external.
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

  // isHeClass is the LOCKED game-loop routing predicate (game/state.ts must
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

// ---------------- authoritative damage edge contracts ---------------------
{
  const heArmorInfo = {
    plate: mkPlate({ physicalMm: 100, keMm: 100, ceMm: 100 }),
    impactAngleDeg: 89,
    point: V(0, 1, 2),
    distM: 100,
  };
  near(estimatePenRatio(OF471, 100, heArmorInfo), 61 / (100 / Math.cos(89 * Math.PI / 180)), 1e-6,
    'HE never ricochets but still pays line-of-sight CE thickness');

  const zeroPlate = mkPlate({ physicalMm: 0, keMm: 0, ceMm: 0 });
  const estimatedWeakHeat = mkShellSpec({
    name: 'estimated-weak-heat', type: 'HEAT', pen100Mm: 50, pen1000Mm: 50,
  });
  const estimatedWeakAp = mkShellSpec({
    name: 'estimated-weak-ap', pen100Mm: 5, pen1000Mm: 5,
  });
  near(estimatePenRatio(AP100, 100, {
    plate: zeroPlate, impactAngleDeg: 0, point: V(0, 1, 2), distM: 100,
  }), 99, 0, 'zero-thickness single plate reports the unbounded penetration sentinel');

  const noEffectEra = mkPlate({
    name: 'no_effect_era', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10, era: null,
  });
  const estimateMain = mkPlate({ physicalMm: 50, keMm: 50, ceMm: 50 });
  const noEffectLayers = [
    mkPlateHit(0.1, noEffectEra, 0, V(0, 1, 2.5)),
    mkPlateHit(0.2, estimateMain, 0, V(0, 1, 2)),
  ];
  near(estimatePenRatio(AP100, 100, {
    plate: noEffectEra, impactAngleDeg: 0, point: V(0, 1, 2.5), distM: 100,
    layers: noEffectLayers,
  }), 4, 1e-9, 'ERA without an effect leaves estimated kinetic penetration unchanged');

  const onlyEraLayers = [mkPlateHit(0.1, noEffectEra, 0, V(0, 1, 2.5))];
  assert(estimatePenRatio(AP100, 100, {
    plate: noEffectEra, impactAngleDeg: 0, point: V(0, 1, 2.5), distM: 100,
    layers: onlyEraLayers,
  }) === 0, 'an all-ERA aim stack has no gating structural plate');

  const estimateStopEra = mkPlate({
    name: 'estimate_stop_era', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10,
    era: { keReduction: 0.25, ceFlatMm: 80 },
  });
  const stoppedLayers = [
    mkPlateHit(0.1, estimateStopEra, 0, V(0, 1, 2.5)),
    mkPlateHit(0.2, estimateMain, 0, V(0, 1, 2)),
  ];
  assert(estimatePenRatio(estimatedWeakHeat, 100, {
    plate: estimateStopEra, impactAngleDeg: 0, point: V(0, 1, 2.5), distM: 100,
    layers: stoppedLayers,
  }) === 0, 'estimated chemical jet stops when ERA consumes all penetration');

  const zeroMainLayers = [mkPlateHit(0.1, zeroPlate, 0, V(0, 1, 2))];
  assert(estimatePenRatio(AP100, 100, {
    plate: zeroPlate, impactAngleDeg: 0, point: V(0, 1, 2), distM: 100,
    layers: zeroMainLayers,
  }) === 99, 'zero-thickness layered main plate reports the unbounded sentinel');

  const estimateScreen = mkPlate({
    name: 'estimate_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
  });
  const screenLayers = [
    mkPlateHit(0.1, estimateScreen, 0, V(0, 1, 2.5)),
    mkPlateHit(0.2, estimateMain, 0, V(0, 1, 2)),
  ];
  assert(estimatePenRatio(estimatedWeakAp, 100, {
    plate: estimateScreen, impactAngleDeg: 0, point: V(0, 1, 2.5), distM: 100,
    layers: screenLayers,
  }) === 0, 'estimated spaced screen stops a shell that cannot clear it');

  const screenEraMainLayers = [
    mkPlateHit(0.1, estimateScreen, 0, V(0, 1, 3)),
    mkPlateHit(0.15, noEffectEra, 0, V(0, 1, 2.5)),
    mkPlateHit(0.2, estimateMain, 0, V(0, 1, 2)),
  ];
  near(estimatePenRatio(M830A1, 100, {
    plate: estimateScreen, impactAngleDeg: 0, point: V(0, 1, 3), distM: 100,
    layers: screenEraMainLayers,
  }), (600 - 10) * (1 - 0.5) / 50, 1e-9,
  'HEAT gap estimate skips intervening ERA when finding the next solid layer');

  const screenScreenMainLayers = [
    mkPlateHit(0.1, estimateScreen, 0, V(0, 1, 3)),
    mkPlateHit(0.15, mkPlate({
      name: 'inner_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
    }), 0, V(0, 1, 2.8)),
    mkPlateHit(0.2, estimateMain, 0, V(0, 1, 2)),
  ];
  near(estimatePenRatio(M830A1, 100, {
    plate: estimateScreen, impactAngleDeg: 0, point: V(0, 1, 3), distM: 100,
    layers: screenScreenMainLayers,
  }), (((600 - 10) * 0.9) - 10) * 0.6 / 50, 1e-9,
  'HEAT gap estimate stops at each solid spaced layer instead of skipping it');

  const angledScreen = mkPlateHit(
    0.1,
    mkPlate({ name: 'angled_screen', kind: 'spaced', physicalMm: 45, keMm: 45, ceMm: 45 }),
    75,
    V(0, 1, 2.5),
  );
  assert(estimatePenRatio(PZGR39, 100, {
    plate: angledScreen.plate,
    impactAngleDeg: angledScreen.impactAngleDeg,
    point: angledScreen.point,
    distM: 100,
    layers: [angledScreen, mkPlateHit(0.2, estimateMain, 0, V(0, 1, 2))],
  }) === 0, 'layered indicator applies the ricochet gate to a spaced pre-layer');

  const highPenSmallCaliber = mkShellSpec({
    name: 'high-pen-small-caliber', caliberMm: 40, pen100Mm: 1000, pen1000Mm: 1000,
  });
  assert(estimatePenRatio(highPenSmallCaliber, 100, {
    plate: angledScreen.plate,
    impactAngleDeg: angledScreen.impactAngleDeg,
    point: angledScreen.point,
    distM: 100,
    layers: [angledScreen, mkPlateHit(0.2, estimateMain, 0, V(0, 1, 2))],
  }) === 0,
  'a high-penetration shell still ricochets from an overmatch-ineligible pre-layer');

  const fallbackScreen = mkPlate({
    name: 'last_screen', kind: 'spaced', physicalMm: 20, keMm: 20, ceMm: 20,
  });
  near(estimatePenRatio(AP100, 100, {
    plate: fallbackScreen, impactAngleDeg: 0, point: V(0, 1, 2), distM: 100,
    layers: [mkPlateHit(0.1, fallbackScreen, 0, V(0, 1, 2))],
  }), 10, 1e-9, 'a screen-only stack uses its final solid layer as the aim gate');

  const leadingMain = mkPlate({
    name: 'leading_main', physicalMm: 50, keMm: 50, ceMm: 50,
  });
  near(estimatePenRatio(AP100, 100, {
    plate: leadingMain, impactAngleDeg: 0, point: V(0, 1, 3), distM: 100,
    layers: [
      mkPlateHit(0.1, leadingMain, 0, V(0, 1, 3)),
      mkPlateHit(0.2, fallbackScreen, 0, V(0, 1, 2)),
    ],
  }), 4, 1e-9, 'the first main plate remains the structural gate even with geometry behind it');

  near(estimatePenRatio(OF471, 100, {
    plate: estimateScreen, impactAngleDeg: 0, point: V(0, 1, 2.5), distM: 100,
    layers: screenLayers,
  }), 6.1, 1e-9, 'HE aim display evaluates the burst surface rather than the layered KE path');

  const layeredRicochet = mkPlateHit(
    0.1,
    mkPlate({ physicalMm: 45, keMm: 45, ceMm: 45 }),
    75,
    V(0, 1, 2),
  );
  assert(estimatePenRatio(PZGR39, 100, {
    plate: layeredRicochet.plate,
    impactAngleDeg: 75,
    point: layeredRicochet.point,
    distM: 100,
    layers: [layeredRicochet],
  }) === 0, 'layered indicator applies the ricochet gate to its structural plate');

  const sparseArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0],
    gunPivot: [0, 0, 0],
    gunBarrel: null,
    hullPlates: [],
    turretPlates: [],
    modules: [{ module: 'gun', min: [-1, 0, -1], max: [1, 1, 1], turretLocal: false }],
    crew: [],
  };
  const sparseSpec = mkSpec({ armor: sparseArmor });
  const sparseTarget = {
    id: 'sparse_target', spec: sparseSpec, state: mkState(), combat: createCombatState(sparseSpec),
  };
  const sparseEvent = resolveShellHit(
    mkShell(AP100, 100),
    sparseTarget,
    [{
      t: 0.2, tExit: 0.3, kind: 'module', module: 'engine',
      point: V(0, 1, 0), barrel: false, external: true,
    }],
    seqRng([0.5, 0.5]),
  );
  assert(sparseEvent.kind === 'screen_pierce' && sparseEvent.modulesHit.length === 0,
    'a sparse authored module record safely ignores absent module intersections');

  const gunExternalTarget = mkTarget();
  const gunExternalEvent = resolveShellHit(
    mkShell(AP100, 100),
    gunExternalTarget,
    [
      { t: 0.1, kind: 'module', module: 'gun', point: V(0.2, 1.8, 2.4) },
      mkPlateHit(0.2, mkPlate({
        name: 'gun_external_backstop', physicalMm: 300, keMm: 300, ceMm: 300,
      }), 0),
    ],
    seqRng([0.5, 0.5, 0.1, 0.5]),
  );
  assert(gunExternalEvent.modulesHit.some((hit) => hit.module === 'gun'),
    'gun intersections are external damage targets even without a redundant external flag');

  const noModuleDamage = mkShellSpec({
    name: 'caliber-fallback', caliberMm: 100, pen100Mm: 200, pen1000Mm: 200,
    moduleDmg: undefined,
  });
  const moduleTarget = mkTarget();
  const moduleEvent = resolveShellHit(
    mkShell(noModuleDamage, 100),
    moduleTarget,
    [
      mkPlateHit(0.2, mkPlate({ physicalMm: 50, keMm: 50, ceMm: 50 }), 0),
      { t: 0.3, tExit: 0.4, kind: 'module', module: 'optics', point: V(0, 1, 1) },
    ],
    seqRng([0.5, 0.5, 0.1, 0.5]),
  );
  assert(moduleEvent.modulesHit[0].dmg === 100,
    'module damage falls back to shell caliber when no explicit value is authored');

  const absentCrewTarget = mkTarget();
  const absentCrewEvent = resolveShellHit(
    mkShell(AP100, 100),
    absentCrewTarget,
    [
      mkPlateHit(0.2, mkPlate({ physicalMm: 50, keMm: 50, ceMm: 50 }), 0),
      { t: 0.3, tExit: 0.4, kind: 'crew', crew: 'radio_operator', point: V(0, 1, 1) },
    ],
    seqRng([0.5, 0.5, 0.1]),
  );
  assert(absentCrewEvent.crewHit.length === 0,
    'unrostered crew intersections consume their deterministic roll but do no damage');

  const eraTile = mkPlate({
    name: 'duplicate_era', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10,
    era: { keReduction: 0.25, ceFlatMm: 80 },
  });
  const tandem = mkShellSpec({
    name: 'tandem', type: 'HEAT', pen100Mm: 300, pen1000Mm: 300, tandem: true,
  });
  const tandemTarget = mkTarget();
  const tandemEvent = resolveShellHit(
    mkShell(tandem, 100),
    tandemTarget,
    [
      mkPlateHit(0.1, eraTile, 0, V(0, 1, 2.5)),
      mkPlateHit(0.15, eraTile, 0, V(0, 1, 2.4)),
      mkPlateHit(0.2, mkPlate({ physicalMm: 50, keMm: 50, ceMm: 50 }), 0),
    ],
    seqRng([0.5, 0.5]),
  );
  assert(tandemEvent.kind === 'pen' && tandemEvent.eraActivations.length === 1,
    'duplicate intersections with one ERA tile record one activation');
  assert(tandemEvent.zone === 'plate' && tandemEvent.plateKind === 'main',
    'tandem ERA bypass continues to the structural plate before stamping the penetration');
  assert(tandemEvent.eraActivations[0].plate === eraTile.name
    && tandemEvent.eraActivations[0].pos.join(',') === '0,1,2.5'
    && tandemEvent.eraActivations[0].normal.join(',') === '0,0,1',
  'ERA activation records complete tile contact coordinates and normal');

  const stoppedByEra = mkShellSpec({
    name: 'weak-heat', type: 'HEAT', pen100Mm: 50, pen1000Mm: 50,
  });
  const eraTarget = mkTarget();
  const eraShell = mkShell(stoppedByEra, 100);
  const eraEvent = resolveShellHit(
    eraShell,
    eraTarget,
    [mkPlateHit(0.1, mkPlate({
      name: 'heavy_era', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10,
      era: { keReduction: 0.25, ceFlatMm: 50 },
    }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(eraEvent.kind === 'era' && eraEvent.penRollMm === 0,
    'ERA that exhausts a chemical jet terminates it at the tile');
  assert(eraEvent.zone === 'heavy_era' && eraEvent.plateKind === 'era'
    && eraEvent.pos.join(',') === '0,1,2'
    && eraEvent.normal.join(',') === '0,0,1'
    && eraEvent.localPos.join(',') === '0,1,2'
    && eraEvent.eraActivations.length === 1
    && eraShell.dead,
  'ERA exhaustion event retains exact tile contact and shot metadata');

  const cappedLiveRicochet = mkShell(PZGR39, 100);
  cappedLiveRicochet.bounces = 1;
  const cappedLivePoint = V(0.6, 1.5, 2.2);
  const cappedLiveEvent = resolveShellHit(
    cappedLiveRicochet,
    mkTarget(),
    [mkPlateHit(0.1, mkPlate({
      name: 'live_second_bounce', physicalMm: 45, keMm: 45, ceMm: 45,
    }), 75, cappedLivePoint)],
    seqRng([0.5, 0.5]),
  );
  assert(cappedLiveEvent.kind === 'ricochet' && cappedLiveRicochet.bounces === 2
    && cappedLiveRicochet.dead
    && cappedLiveEvent.pos.join(',') === '0.6,1.5,2.2'
    && cappedLiveEvent.normal.join(',') === '0,0,1'
    && cappedLiveEvent.impactAngleDeg === 75
    && cappedLiveEvent.penRollMm > 0
    && cappedLiveEvent.zone === 'live_second_bounce'
    && cappedLiveEvent.localPos.join(',') === '0.6,1.5,2.2',
  'second live ricochet reaches the bounce cap with complete impact metadata');

  const invalidFrameHit = mkPlateHit(
    0.1,
    mkPlate({ name: 'invalid_articulation', physicalMm: 300, keMm: 300, ceMm: 300 }),
    0,
    V(0, 1, 2),
  );
  invalidFrameHit.impactFrame = 'hull';
  invalidFrameHit.impactLocalX = NaN;
  invalidFrameHit.impactLocalY = 1;
  invalidFrameHit.impactLocalZ = 2;
  const invalidFrameEvent = resolveShellHit(
    mkShell(AP100, 100), mkTarget(), [invalidFrameHit], seqRng([0.5, 0.5]),
  );
  assert(invalidFrameEvent.impactFrame === null && invalidFrameEvent.impactLocalPos === null,
    'non-finite articulation coordinates are rejected instead of leaking into hit events');

  const partialFrameHit = mkPlateHit(
    0.1,
    mkPlate({ name: 'partial_articulation', physicalMm: 300, keMm: 300, ceMm: 300 }),
    0,
    V(0, 1, 2),
  );
  Object.assign(partialFrameHit, {
    impactFrame: 'hull',
    impactLocalX: 0,
    impactLocalY: 1,
    impactLocalZ: 2,
    impactLocalNormalX: 0,
    impactLocalNormalY: NaN,
    impactLocalNormalZ: 1,
    impactLocalDirX: NaN,
    impactLocalDirY: 0,
    impactLocalDirZ: -1,
  });
  const partialFrameEvent = resolveShellHit(
    mkShell(AP100, 100), mkTarget(), [partialFrameHit], seqRng([0.5, 0.5]),
  );
  assert(partialFrameEvent.impactFrame === 'hull'
    && partialFrameEvent.impactLocalPos.join(',') === '0,1,2'
    && partialFrameEvent.impactLocalNormal === null
    && partialFrameEvent.impactLocalDir === null,
  'partial non-finite articulation vectors are omitted while valid local contact remains');

  const orientedState = mkState({
    pos: V(3, 2, -4), yaw: 0.4, visualPitch: 0.2, visualRoll: -0.3,
  });
  const orientedQuat = new Quaternion().setFromEuler(new Euler(
    -orientedState.visualPitch, orientedState.yaw, orientedState.visualRoll, 'YXZ',
  ));
  const orientedLocalPoint = V(0.6, 1.1, 2);
  const orientedWorldPoint = orientedLocalPoint.clone().applyQuaternion(orientedQuat)
    .add(orientedState.pos);
  const orientedWorldDir = V(0, 0, -1).applyQuaternion(orientedQuat);
  const orientedTarget = mkTarget();
  orientedTarget.state = orientedState;
  const orientedShell = mkShell(AP100, 100);
  orientedShell.vel.copy(orientedWorldDir);
  const orientedEvent = resolveShellHit(
    orientedShell,
    orientedTarget,
    [mkPlateHit(0.1, mkPlate({
      name: 'oriented_hull_face', physicalMm: 300, keMm: 300, ceMm: 300,
    }), 0, orientedWorldPoint)],
    seqRng([0.5, 0.5]),
  );
  near(orientedEvent.localPos[0], orientedLocalPoint.x, 1e-9,
    'YXZ hit localization restores local X under combined hull rotation');
  near(orientedEvent.localPos[1], orientedLocalPoint.y, 1e-9,
    'YXZ hit localization restores local Y under combined hull rotation');
  near(orientedEvent.localPos[2], orientedLocalPoint.z, 1e-9,
    'YXZ hit localization restores local Z under combined hull rotation');
  near(orientedEvent.localDir[0], 0, 1e-9, 'YXZ hit localization restores local direction X');
  near(orientedEvent.localDir[1], 0, 1e-9, 'YXZ hit localization restores local direction Y');
  near(orientedEvent.localDir[2], -1, 1e-9, 'YXZ hit localization restores local direction Z');

  const thresholdVelocityShell = mkShell(AP100, 100);
  thresholdVelocityShell.vel.set(Math.sqrt(1e-9), 0, 0);
  const thresholdVelocityEvent = resolveShellHit(
    thresholdVelocityShell,
    mkTarget(),
    [mkPlateHit(0.1, mkPlate({
      name: 'threshold_velocity_face', physicalMm: 300, keMm: 300, ceMm: 300,
    }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(thresholdVelocityEvent.localDir === null,
    'the exact near-zero velocity threshold omits unstable local direction metadata');

  const crewOnlyArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [], turretPlates: [], modules: [], crew: [],
    collisionShells: { hull: [{ faces: [] }], turret: [] },
  };
  const crewOnlySpec = mkSpec({ armor: crewOnlyArmor });
  const crewOnlyTarget = {
    id: 'crew_only_metadata', spec: crewOnlySpec, state: mkState(),
    combat: createCombatState(crewOnlySpec),
  };
  const crewOnlyEvent = resolveShellHit(
    mkShell(AP100, 100),
    crewOnlyTarget,
    [{ t: 0.1, kind: 'crew', crew: 'driver', point: V(0.2, 1.2, 1.5) }],
    seqRng([0.5, 0.5]),
  );
  assert(crewOnlyEvent.kind === 'screen_pierce' && crewOnlyEvent.zone === null,
    'crew-only contact cannot be mislabeled as an armor module zone');

  const wideBarrelShell = mkShell(mkShellSpec({
    name: 'wide-barrel-test', pen100Mm: 100, pen1000Mm: 100,
  }), 100);
  const wideBarrelEvent = resolveShellHit(
    wideBarrelShell,
    mkTarget(),
    [{
      t: 0.1, kind: 'module', module: 'gun', point: V(0, 1, 2),
      barrel: true, external: true, barrelRadiusM: 0.12,
    }],
    seqRng([0.5, 0.5, 0.9]),
  );
  assert(wideBarrelEvent.kind === 'screen_pierce' && wideBarrelShell.remainingPenMm === 40,
    'authored barrel radius controls the clamped barrel screen thickness');

  const invalidEquipTarget = mkTarget();
  invalidEquipTarget.combat.equipMults = { heSplash: false };
  const invalidEquipEvent = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2), [], invalidEquipTarget,
    [mkPlateHit(0.1, mkPlate({
      name: 'invalid_equipment_face', physicalMm: 100, keMm: 100, ceMm: 100,
    }), 0, V(0, 1, 2))],
    seqRng([0.5, 0.5]),
  )[0];
  near(invalidEquipEvent.damage, 115, 1e-9,
    'non-numeric equipment multipliers fall back to neutral combat behavior');

  const weakAp = mkShellSpec({
    name: 'weak-ap', pen100Mm: 5, pen1000Mm: 5, moduleDmg: undefined,
  });
  const barrelTarget = mkTarget();
  const barrelEvent = resolveShellHit(
    mkShell(weakAp, 100),
    barrelTarget,
    [{
      t: 0.1, tExit: 0.2, kind: 'module', module: 'gun',
      point: V(0, 1, 2), barrel: true, external: true,
    }],
    seqRng([0.5, 0.5, 0.9]),
  );
  assert(barrelEvent.kind === 'nonpen' && barrelEvent.zone === 'gun_barrel',
    'default-radius gun barrel stops a shell whose penetration is exhausted');

  const exactBarrelSpec = mkShellSpec({
    name: 'exact-barrel-pen', pen100Mm: 40, pen1000Mm: 40,
  });
  const exactBarrelTarget = mkTarget();
  const exactBarrelShell = mkShell(exactBarrelSpec, 100);
  const exactBarrelPoint = V(0.3, 1.7, 2.4);
  const exactBarrelEvent = resolveShellHit(
    exactBarrelShell,
    exactBarrelTarget,
    [
      {
        t: 0.1, tExit: 0.2, kind: 'module', module: 'gun', point: exactBarrelPoint,
        barrel: true, external: true,
      },
      mkPlateHit(0.2, mkPlate({
        name: 'after_exact_barrel', physicalMm: 5, keMm: 5, ceMm: 5,
      }), 0),
    ],
    seqRng([0.5, 0.5, 0.9]),
  );
  assert(exactBarrelEvent.kind === 'nonpen' && exactBarrelShell.dead
    && exactBarrelShell.remainingPenMm === 0
    && exactBarrelEvent.pos.join(',') === '0.3,1.7,2.4'
    && exactBarrelEvent.zone === 'gun_barrel'
    && exactBarrelTarget.combat.hp === exactBarrelTarget.combat.maxHp,
  'exact-zero barrel penetration terminates at the barrel before later armor');

  const screenTarget = mkTarget();
  const screenEvent = resolveShellHit(
    mkShell(weakAp, 100),
    screenTarget,
    [mkPlateHit(0.1, mkPlate({
      name: 'thick_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
    }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(screenEvent.kind === 'spaced_absorb' && screenEvent.effectiveMm === 10,
    'spaced armor reports the screen that exhausted the shell');

  const exactScreenSpec = mkShellSpec({
    name: 'exact-screen-pen', pen100Mm: 10, pen1000Mm: 10,
  });
  const exactScreenTarget = mkTarget();
  const exactScreenShell = mkShell(exactScreenSpec, 100);
  const exactScreenPoint = V(0.4, 1.4, 2.6);
  const exactScreenEvent = resolveShellHit(
    exactScreenShell,
    exactScreenTarget,
    [
      mkPlateHit(0.1, mkPlate({
        name: 'exact_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
      }), 0, exactScreenPoint),
      mkPlateHit(0.2, mkPlate({
        name: 'after_exact_screen', physicalMm: 1, keMm: 1, ceMm: 1,
      }), 0),
    ],
    seqRng([0.5, 0.5]),
  );
  assert(exactScreenEvent.kind === 'spaced_absorb' && exactScreenShell.dead
    && exactScreenShell.remainingPenMm === 0
    && exactScreenEvent.pos.join(',') === '0.4,1.4,2.6'
    && exactScreenEvent.zone === 'exact_screen'
    && exactScreenEvent.plateKind === 'spaced'
    && exactScreenEvent.localPos.join(',') === '0.4,1.4,2.6'
    && exactScreenTarget.combat.hp === exactScreenTarget.combat.maxHp,
  'exact-zero screen penetration terminates with complete screen metadata');

  const straddleTarget = mkTarget();
  const straddleEvent = resolveShellHit(
    mkShell(AP100, 100),
    straddleTarget,
    [
      { t: 0.1, kind: 'module', module: 'radio', point: V(0, 1, 1.5), external: false },
      { t: 0.2, tExit: 0.5, kind: 'crew', crew: 'driver', point: V(0, 1, 1.4) },
      { t: 0.22, tExit: 0.3, kind: 'crew', crew: 'loader', point: V(0, 1, 1.35) },
      {
        t: 0.25, tExit: 0.55, kind: 'module', module: 'optics',
        point: V(0, 1, 1.3), external: false,
      },
      mkPlateHit(0.3, mkPlate({ physicalMm: 50, keMm: 50, ceMm: 50 }), 0),
    ],
    seqRng([0.5, 0.5, 0.1, 0.1, 0.5]),
  );
  assert(straddleEvent.kind === 'pen' && straddleEvent.crewHit.includes('driver')
    && !straddleEvent.crewHit.includes('loader')
    && straddleEvent.modulesHit.some((hit) => hit.module === 'optics')
    && !straddleEvent.modulesHit.some((hit) => hit.module === 'radio'),
  'only internal volumes that straddle the penetrated plate receive module/crew rolls');

  const gapScreen = mkPlate({
    name: 'gap_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
  });
  const gapMain = mkPlate({
    name: 'gap_main', physicalMm: 300, keMm: 300, ceMm: 300,
  });
  const gapTarget = mkTarget();
  const gapEvent = resolveShellHit(
    mkShell(M830A1, 100),
    gapTarget,
    [
      mkPlateHit(0.1, gapScreen, 0, V(0, 1, 3)),
      { t: 0.15, kind: 'module', module: 'radio', point: V(100, 100, 100) },
      mkPlateHit(0.2, mkPlate({
        name: 'gap_era', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10,
        era: { keReduction: 0, ceFlatMm: 0 },
      }), 0, V(0, 1, 2.8)),
      mkPlateHit(0.3, gapMain, 0, V(0, 1, 2)),
    ],
    seqRng([0.5, 0.5]),
  );
  assert(gapEvent.kind === 'nonpen' && gapEvent.zone === gapMain.name,
    'HEAT air-gap decay skips module and ERA intersections before the next structural layer');

  const exactMainSpec = mkShellSpec({
    name: 'exact-main-pen', pen100Mm: 100, pen1000Mm: 100,
  });
  const exactMainTarget = mkTarget();
  const exactMainShell = mkShell(exactMainSpec, 100);
  const exactMainEvent = resolveShellHit(
    exactMainShell,
    exactMainTarget,
    [mkPlateHit(0.1, mkPlate({
      name: 'exact_main', physicalMm: 100, keMm: 100, ceMm: 100,
    }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(exactMainEvent.kind === 'pen' && exactMainEvent.damage === exactMainSpec.dmg
    && exactMainShell.dead && !exactMainShell.carriedThrough,
    'main armor is penetrated when residual penetration exactly equals effective thickness');

  const heatPenTarget = mkTarget();
  const heatPenShell = mkShell(M830A1, 100);
  const heatPenEvent = resolveShellHit(
    heatPenShell,
    heatPenTarget,
    [mkPlateHit(0.1, mkPlate({
      name: 'heat_pen_main', physicalMm: 50, keMm: 50, ceMm: 50,
    }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(heatPenEvent.kind === 'pen' && heatPenShell.dead && !heatPenShell.carriedThrough,
    'chemical penetrators never carry through a penetrated target');

  const repeatCarryTarget = mkTarget();
  const repeatCarryShell = mkShell(AP100, 100);
  repeatCarryShell.carriedThrough = true;
  const repeatCarryEvent = resolveShellHit(
    repeatCarryShell,
    repeatCarryTarget,
    [mkPlateHit(0.1, mkPlate({
      name: 'repeat_carry_main', physicalMm: 50, keMm: 50, ceMm: 50,
    }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(repeatCarryEvent.kind === 'pen' && repeatCarryShell.dead
    && repeatCarryShell.carriedThrough,
  'a shell may carry through at most one target');

  const twoMainTarget = mkTarget();
  const twoMainEvent = resolveShellHit(
    mkShell(AP100, 100),
    twoMainTarget,
    [
      mkPlateHit(0.1, mkPlate({
        name: 'first_main', physicalMm: 50, keMm: 50, ceMm: 50,
      }), 0, V(0, 1, 2)),
      mkPlateHit(0.2, mkPlate({
        name: 'second_main', physicalMm: 50, keMm: 50, ceMm: 50,
      }), 0, V(0, 1, 1.5)),
    ],
    seqRng([0.5, 0.5]),
  );
  assert(twoMainEvent.kind === 'pen' && twoMainTarget.combat.hp === 750,
    'multiple penetrated main layers apply hull damage only once');

  const blockedAfterPenTarget = mkTarget();
  const blockedAfterPenEvent = resolveShellHit(
    mkShell(AP100, 100),
    blockedAfterPenTarget,
    [
      mkPlateHit(0.1, mkPlate({
        name: 'entry_main', physicalMm: 50, keMm: 50, ceMm: 50,
      }), 0, V(0, 1, 2)),
      mkPlateHit(0.2, mkPlate({
        name: 'internal_backstop', physicalMm: 300, keMm: 300, ceMm: 300,
      }), 0, V(0, 1, 1.5)),
    ],
    seqRng([0.5, 0.5]),
  );
  assert(blockedAfterPenEvent.kind === 'pen' && blockedAfterPenTarget.combat.hp === 750,
    'a deeper plate stopping an already-penetrating shell cannot overwrite the penetration event');

  const spentNameTarget = mkTarget();
  spentNameTarget.combat.eraSpent.add('shared_spent_name');
  const spentNameEvent = resolveShellHit(
    mkShell(AP100, 100),
    spentNameTarget,
    [mkPlateHit(0.1, mkPlate({
      name: 'shared_spent_name', physicalMm: 50, keMm: 50, ceMm: 50,
    }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(spentNameEvent.kind === 'pen',
    'spent ERA names never suppress a structural plate with the same identifier');

  for (const module of ['gun', 'trackL', 'trackR']) {
    const externalOnlyTarget = mkTarget();
    const externalOnlyShell = mkShell(AP100, 100);
    const externalOnlyEvent = resolveShellHit(
      externalOnlyShell,
      externalOnlyTarget,
      [{ t: 0.1, kind: 'module', module, point: V(0, 1, 2) }],
      seqRng([0.5, 0.5, 0.9]),
    );
    assert(externalOnlyEvent.kind === 'screen_pierce' && !externalOnlyShell.dead,
      `${module} cannot trigger legacy internal-seam armor charging`);
  }

  const firstModulePoint = V(0.7, 1.6, 2.9);
  const trailingScreen = mkPlate({
    name: 'trailing_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
  });
  const mixedUndecidedShell = mkShell(AP100, 100);
  const mixedUndecidedEvent = resolveShellHit(
    mixedUndecidedShell,
    mkTarget(),
    [
      { t: 0.1, kind: 'module', module: 'gun', point: firstModulePoint },
      mkPlateHit(0.2, trailingScreen, 0, V(0, 1, 2.5)),
    ],
    seqRng([0.5, 0.5, 0.9]),
  );
  assert(mixedUndecidedEvent.kind === 'screen_pierce' && !mixedUndecidedShell.dead
    && mixedUndecidedEvent.pos.join(',') === '0.7,1.6,2.9'
    && mixedUndecidedEvent.zone === trailingScreen.name
    && mixedUndecidedEvent.plateKind === 'spaced'
    && mixedUndecidedEvent.localPos.join(',') === '0.7,1.6,2.9',
  'undecided trace preserves first contact position while classifying its first armor screen');

  const emptyKeShell = mkShell(AP100, 100);
  const emptyKeEvent = resolveShellHit(
    emptyKeShell, mkTarget(), [], seqRng([0.5, 0.5]),
  );
  assert(emptyKeEvent.kind === 'screen_pierce' && !emptyKeShell.dead
    && emptyKeEvent.pos.join(',') === '0,1.5,10'
    && emptyKeEvent.localPos === null && emptyKeEvent.zone === null
    && emptyKeEvent.flightDistM === 100 && !emptyKeEvent.destroyed,
  'empty kinetic trace continues without inventing impact localization');

  const emptyTarget = mkTarget();
  const emptyShell = mkShell(M830A1, 100);
  const emptyEvent = resolveShellHit(emptyShell, emptyTarget, [], seqRng([0.5, 0.5]));
  assert(emptyEvent.kind === 'nonpen' && emptyShell.dead === true,
    'an empty chemical trace terminates without inventing a plate or internal hit');

  const emptyHeShell = mkShell(OF471, 100);
  const emptyHeEvent = resolveShellHit(emptyHeShell, mkTarget(), [], seqRng([0.5, 0.5]));
  assert(emptyHeEvent.kind === 'nonpen' && emptyHeShell.dead === true,
    'an empty direct HE trace retains the canonical nonpenetration event kind');

  const bareEraTarget = mkTarget();
  const bareEraEvent = resolveShellHit(
    mkShell(AP100, 100),
    bareEraTarget,
    [
      mkPlateHit(0.1, mkPlate({
        name: 'inert_era', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10, era: null,
      }), 0),
      mkPlateHit(0.2, mkPlate({ physicalMm: 50, keMm: 50, ceMm: 50 }), 0),
    ],
    seqRng([0.5, 0.5]),
  );
  assert(bareEraEvent.kind === 'pen' && bareEraEvent.eraPlate === 'inert_era'
    && bareEraEvent.penRollMm === 200,
  'ERA without an authored effect records activation without changing kinetic penetration');

  const zeroVelocityTarget = mkTarget();
  const zeroVelocityShell = mkShell(AP100, 100);
  zeroVelocityShell.vel.set(0, 0, 0);
  const zeroVelocityEvent = resolveShellHit(
    zeroVelocityShell,
    zeroVelocityTarget,
    [mkPlateHit(0.2, mkPlate({ physicalMm: 250, keMm: 250, ceMm: 250 }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(zeroVelocityEvent.kind === 'nonpen' && zeroVelocityEvent.localDir === null,
    'zero-velocity diagnostic impacts omit an undefined local direction');

  const dimensionArmor = {
    boundingRadiusM: 2,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [mkPlate({ physicalMm: 50, keMm: 50, ceMm: 50 })],
    turretPlates: [], modules: [], crew: [],
  };
  const dimensionSpec = mkSpec({ armor: dimensionArmor, dims: { heightM: 3.2 } });
  const dimensionTarget = {
    id: 'dimension_target', spec: dimensionSpec, state: mkState(),
    combat: createCombatState(dimensionSpec),
  };
  const dimensionShell = mkShell(AP100, 100);
  const dimensionEvent = resolveShellHit(
    dimensionShell,
    dimensionTarget,
    [mkPlateHit(0.2, dimensionArmor.hullPlates[0], 0)],
    seqRng([0.5, 0.5]),
  );
  const dimensionExitZ = 2 - (2 + Math.sqrt(2 * 2 - 0.6 * 0.6) + 0.05);
  assert(dimensionEvent.kind === 'pen' && dimensionShell.carriedThrough,
    'carry-through geometry honors an explicitly authored vehicle height');
  near(dimensionShell.pos.z, dimensionExitZ, 1e-9,
    'carry-through exit geometry uses half the authored vehicle height');
}

// ---------------- wreck edge contacts remain inert -------------------------
{
  const wreck = mkTarget();
  wreck.combat.destroyed = true;
  wreck.combat.hp = 0;

  const emptyHe = mkShell(OF471, 100);
  const emptyHeEvent = resolveShellHit(emptyHe, wreck, [], seqRng([0.5, 0.5]));
  assert(emptyHeEvent.kind === 'he_splash' && emptyHeEvent.targetId === null
    && emptyHeEvent.destroyed === false && emptyHe.dead,
    'HE still detonates on an empty destroyed-target trace');

  const lowPen = mkShellSpec({ name: 'wreck-low-pen', pen100Mm: 5, pen1000Mm: 5 });
  const absorbed = mkShell(lowPen, 100);
  const absorbedEvent = resolveShellHit(
    absorbed,
    wreck,
    [mkPlateHit(0.1, mkPlate({
      name: 'dead_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
    }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(absorbedEvent.kind === 'spaced_absorb' && absorbed.dead,
    'wreck screen absorbs a shell that cannot clear it');

  const barrelShell = mkShell(lowPen, 100);
  const barrelEvent = resolveShellHit(
    barrelShell,
    wreck,
    [{
      t: 0.1, tExit: 0.2, kind: 'module', module: 'gun',
      point: V(0, 1, 2), barrel: true, external: true,
    }],
    seqRng([0.5, 0.5]),
  );
  assert(barrelEvent.kind === 'nonpen' && barrelShell.dead && barrelShell.remainingPenMm === 0,
    'wreck gun barrel remains inert physical cover');

  const heat = mkShell(M830A1, 100);
  const heatEvent = resolveShellHit(
    heat,
    wreck,
    [mkPlateHit(0.1, mkPlate({ physicalMm: 45, keMm: 45, ceMm: 45 }), 86)],
    seqRng([0.5, 0.5]),
  );
  assert(heatEvent.kind === 'ricochet' && heat.dead,
    'chemical ricochet from a wreck terminates the jet');

  const emptyJet = mkShell(M830A1, 100);
  const emptyJetEvent = resolveShellHit(emptyJet, wreck, [], seqRng([0.5, 0.5]));
  assert(emptyJetEvent.kind === 'nonpen' && emptyJet.dead,
    'an empty wreck trace terminates a chemical jet as a nonpenetration');

  const eraOnlyJet = mkShell(M830A1, 100);
  const eraOnlyEvent = resolveShellHit(
    eraOnlyJet,
    wreck,
    [mkPlateHit(0.1, mkPlate({
      name: 'dead_era', kind: 'era', physicalMm: 10, keMm: 10, ceMm: 10,
    }), 0)],
    seqRng([0.5, 0.5]),
  );
  assert(eraOnlyEvent.kind === 'spaced_absorb' && eraOnlyJet.dead,
    'a chemical jet crossing only a wreck ERA surface is spent as layered cover');

  const exactScreenSpec = mkShellSpec({
    name: 'wreck-exact-screen', pen100Mm: 10, pen1000Mm: 10,
  });
  const exactScreen = mkShell(exactScreenSpec, 100);
  const exactScreenPoint = V(0.25, 1.25, 2.5);
  const exactScreenEvent = resolveShellHit(
    exactScreen,
    wreck,
    [mkPlateHit(0.1, mkPlate({
      name: 'dead_exact_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
    }), 0, exactScreenPoint)],
    seqRng([0.5, 0.5]),
  );
  assert(exactScreenEvent.kind === 'spaced_absorb' && exactScreen.dead
    && exactScreenEvent.pos.join(',') === '0.25,1.25,2.5'
    && exactScreenEvent.effectiveMm === 10
    && exactScreenEvent.penRollMm === 10,
  'exactly exhausted wreck-screen penetration is terminal and retains screen metadata');

  const stoppedBeforeLater = mkShell(lowPen, 100);
  const stoppedBeforeLaterEvent = resolveShellHit(
    stoppedBeforeLater,
    wreck,
    [
      mkPlateHit(0.1, mkPlate({
        name: 'first_dead_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
      }), 0, V(0.3, 1.3, 2.5)),
      mkPlateHit(0.2, mkPlate({ name: 'unreached_dead_main' }), 0, V(0, 1, 2)),
    ],
    seqRng([0.5, 0.5]),
  );
  assert(stoppedBeforeLaterEvent.kind === 'spaced_absorb'
    && stoppedBeforeLaterEvent.pos.join(',') === '0.3,1.3,2.5',
  'terminal wreck-screen absorption stops traversal before later armor');

  const nonBarrelOnly = mkShell(M830A1, 100);
  const nonBarrelPoint = V(0.4, 1.4, 2.4);
  const nonBarrelEvent = resolveShellHit(
    nonBarrelOnly,
    wreck,
    [{ t: 0.1, kind: 'module', module: 'engine', point: nonBarrelPoint }],
    seqRng([0.5, 0.5]),
  );
  assert(nonBarrelEvent.kind === 'nonpen' && nonBarrelOnly.dead
    && nonBarrelEvent.pos.join(',') === '0.4,1.4,2.4',
  'a wreck trace containing only a non-barrel component is a nonpenetration, not spaced armor');

  const crewThenBarrel = mkShell(lowPen, 100);
  const barrelPoint = V(0.6, 1.6, 2.6);
  const crewThenBarrelEvent = resolveShellHit(
    crewThenBarrel,
    wreck,
    [
      { t: 0.05, kind: 'crew', crew: 'driver', point: V(9, 9, 9) },
      {
        t: 0.1, kind: 'module', module: 'gun', point: barrelPoint,
        barrel: true, external: true,
      },
    ],
    seqRng([0.5, 0.5]),
  );
  assert(crewThenBarrelEvent.kind === 'nonpen' && crewThenBarrel.dead
    && crewThenBarrelEvent.pos.join(',') === '0.6,1.6,2.6',
  'wreck traversal ignores crew/non-barrel internals and terminates on the actual barrel');

  const piercedBarrel = mkShell(AP100, 100);
  const piercedBarrelEvent = resolveShellHit(
    piercedBarrel,
    wreck,
    [{
      t: 0.1, kind: 'module', module: 'gun', point: V(0, 1, 2),
      barrel: true, external: true,
    }],
    seqRng([0.5, 0.5]),
  );
  assert(piercedBarrelEvent.kind === 'screen_pierce' && !piercedBarrel.dead
    && piercedBarrel.remainingPenMm === 160,
  'a high-penetration kinetic round crosses an inert barrel after paying its screen value');

  const clippedModule = mkShell(AP100, 100);
  const clippedModuleEvent = resolveShellHit(
    clippedModule,
    wreck,
    [{ t: 0.1, kind: 'module', module: 'engine', point: V(0, 1, 2) }],
    seqRng([0.5, 0.5]),
  );
  assert(clippedModuleEvent.kind === 'screen_pierce' && !clippedModule.dead
    && clippedModule.remainingPenMm === 200,
  'a non-barrel wreck component cannot consume kinetic penetration as armor');

  const zeroPenSpec = mkShellSpec({
    name: 'wreck-zero-pen', pen100Mm: 0, pen1000Mm: 0,
  });
  const zeroPen = mkShell(zeroPenSpec, 100);
  const zeroPenEvent = resolveShellHit(zeroPen, wreck, [], seqRng([0.5, 0.5]));
  assert(zeroPenEvent.kind === 'nonpen' && zeroPen.dead && zeroPen.remainingPenMm === 0,
    'zero-penetration kinetic ammunition cannot screen-pierce an empty wreck trace');
}

// ---------------- HE nearest-surface and direct-target edges ---------------
{
  const linkedPlate = mkPlate({
    name: 'linked_face', physicalMm: 100, keMm: 100, ceMm: 100,
    moduleLink: 'trackL',
  });
  const linkedArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [linkedPlate],
    turretPlates: [],
    modules: [
      { module: 'trackL', min: [-0.2, 0.8, 1.8], max: [0.2, 1.2, 2.2], turretLocal: false },
      { module: 'engine', min: [40, 40, 40], max: [41, 41, 41], turretLocal: false },
    ],
    crew: [],
  };
  const linkedSpec = mkSpec({ armor: linkedArmor });
  const linkedTarget = {
    id: 'linked_he', spec: linkedSpec, state: mkState(), combat: createCombatState(linkedSpec),
  };
  const linkedShell = mkShell(OF471, 100);
  const linkedEvents = resolveHeBurst(
    linkedShell,
    V(0, 1, 2),
    [linkedTarget],
    linkedTarget,
    [mkPlateHit(0.1, linkedPlate, 0, V(0, 1, 2))],
    seqRng([0.5, 0.5, 0.1, 0.5]),
  );
  assert(linkedEvents.length === 1 && linkedEvents[0].kind === 'he_splash'
    && linkedEvents[0].modulesHit.filter((hit) => hit.module === 'trackL').length === 1,
  'direct HE module link rolls once and the authored blast sweep deduplicates it');

  const nullArmorSpec = mkSpec({ armor: null });
  const nullArmorTarget = {
    id: 'fallback_he', spec: nullArmorSpec, state: mkState(), combat: createCombatState(nullArmorSpec),
  };
  const fallbackEvents = resolveHeBurst(
    mkShell(OF471, 100),
    V(0, 1, 2),
    [],
    nullArmorTarget,
    [
      mkPlateHit(0.1, mkPlate({ physicalMm: 100, keMm: 100, ceMm: 100 }), 0),
      { t: 0.2, tExit: 0.3, kind: 'module', module: 'engine', point: V(20, 20, 20) },
    ],
    seqRng([0.5, 0.5]),
  );
  assert(fallbackEvents.length === 1 && fallbackEvents[0].modulesHit.length === 0,
    'fallback HE sweep ignores ray intersections outside the blast sphere');

  const thinPlate = mkPlate({
    name: 'thin_he_face', physicalMm: 10, keMm: 10, ceMm: 10,
  });
  const thinArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [thinPlate], turretPlates: [], modules: [], crew: [],
  };
  const thinSpec = mkSpec({ armor: thinArmor });
  const thinTarget = {
    id: 'direct_he_pen', spec: thinSpec, state: mkState(), combat: createCombatState(thinSpec),
  };
  const directPenEvents = resolveHeBurst(
    mkShell(OF471, 100),
    V(0, 1, 2),
    [thinTarget],
    thinTarget,
    [
      mkPlateHit(0.1, thinPlate, 0, V(0, 1, 2)),
      { t: 0.2, tExit: 0.3, kind: 'module', module: 'engine', point: V(0, 1, 1.5) },
      { t: 0.25, tExit: 0.35, kind: 'crew', crew: 'driver', point: V(0, 1, 1.25) },
      { t: 0.9, tExit: 1, kind: 'module', module: 'engine', point: V(0, 1, -10) },
    ],
    seqRng([0.5, 0.5, 0.1, 0.5, 0.9, 0.1]),
  );
  assert(directPenEvents.length === 1 && directPenEvents[0].kind === 'he_pen'
    && directPenEvents[0].modulesHit.some((hit) => hit.module === 'engine')
    && directPenEvents[0].crewHit.includes('driver'),
  'direct HE penetration resolves nearby internals, then stops at the caliber travel limit');

  // Direct HE screen accounting must use only deeper structural layers: ignore
  // stale/unsorted intersections, non-plates and ERA, then stop at main armor.
  const externalScreen = mkPlate({
    name: 'he_external_screen', kind: 'external', physicalMm: 10, keMm: 10, ceMm: 10,
  });
  const deeperScreen = mkPlate({
    name: 'he_deeper_screen', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
  });
  const deeperMain = mkPlate({
    name: 'he_deeper_main', physicalMm: 20, keMm: 20, ceMm: 20,
  });
  const stackTarget = mkTarget({ armor: null });
  const stackEvent = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2), [], stackTarget,
    [
      mkPlateHit(0.2, externalScreen, 0, V(0, 1, 2)),
      mkPlateHit(0.1, mkPlate({ physicalMm: 500, keMm: 500, ceMm: 500 }), 0, V(0, 1, 1.9)),
      { t: 0.25, kind: 'module', module: 'engine', point: V(100, 100, 100) },
      mkPlateHit(0.3, mkPlate({ kind: 'era', physicalMm: 600, keMm: 600, ceMm: 600 }), 0, V(0, 1, 1.8)),
      mkPlateHit(0.4, deeperScreen, 0, V(0, 1, 1.5)),
      mkPlateHit(0.5, deeperMain, 0, V(0, 1, 1)),
      mkPlateHit(0.6, mkPlate({ physicalMm: 700, keMm: 700, ceMm: 700 }), 0, V(0, 1, 0.5)),
    ],
    seqRng([0.5, 0.5]),
  )[0];
  const stackedDamage = 0.5 * OF471.dmg * (1 - 1 / blastRadiusM(OF471.caliberMm))
    - 1.1 * 40;
  near(stackEvent.damage, stackedDamage, 1e-9,
    'direct HE external screen counts deeper non-ERA armor through the first main plate');
  near(stackTarget.combat.hp, stackTarget.combat.maxHp - stackedDamage, 1e-9,
    'direct HE surface damage is applied to target HP');
  assert(stackEvent.pos.join(',') === '0,1,2'
    && stackEvent.zone === externalScreen.name
    && stackEvent.plateKind === 'external'
    && stackEvent.physicalMm === 10
    && stackEvent.nominalMm === 10
    && stackEvent.localPos.join(',') === '0,1,2',
  'direct HE surface event stamps impact and shot metadata');

  const mainFace = mkPlate({
    name: 'he_main_face', physicalMm: 100, keMm: 100, ceMm: 100,
  });
  const mainTarget = mkTarget({ armor: null });
  const mainEvent = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2), [], mainTarget,
    [
      mkPlateHit(0.2, mainFace, 0, V(0, 1, 2)),
      mkPlateHit(0.3, mkPlate({ physicalMm: 700, keMm: 700, ceMm: 700 }), 0, V(0, 1, 1)),
    ],
    seqRng([0.5, 0.5]),
  )[0];
  near(mainEvent.damage, 0.5 * OF471.dmg - 1.1 * 100, 1e-9,
    'main armor does not absorb unrelated deeper plates in direct HE resolution');

  const spentEra = mkPlate({
    name: 'he_already_spent_era', kind: 'era', physicalMm: 50, keMm: 50, ceMm: 50,
  });
  const spentEraTarget = mkTarget({ armor: null });
  spentEraTarget.combat.eraSpent.add(spentEra.name);
  const spentEraEvent = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2), [], spentEraTarget,
    [
      mkPlateHit(0.1, spentEra, 0, V(0, 1, 2.2)),
      mkPlateHit(0.2, mkPlate({ physicalMm: 100, keMm: 100, ceMm: 100 }), 0, V(0, 1, 2)),
    ],
    seqRng([0.5, 0.5]),
  )[0];
  assert(spentEraEvent.eraPlate === null && spentEraEvent.eraActivations.length === 0,
    'direct HE does not reactivate or report an already-spent ERA tile');

  const boundaryPlate = mkPlate({
    name: 'he_pen_boundary_face', physicalMm: 10, keMm: 10, ceMm: 10,
  });
  const boundaryCrew = ['driver', 'loader', 'gunner', 'commander', 'radio', 'assistant', 'bow'];
  const boundaryArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [boundaryPlate], turretPlates: [], modules: [],
    crew: boundaryCrew.map((crew) => ({
      crew, min: [-0.1, 0.9, 1.9], max: [0.1, 1.1, 2.1], turretLocal: false,
    })),
  };
  const boundarySpec = mkSpec({ armor: boundaryArmor });
  const boundaryTarget = {
    id: 'he_pen_boundaries', spec: boundarySpec, state: mkState(),
    combat: createCombatState(boundarySpec),
  };
  const boundaryPoint = V(0, 1, 2);
  const postPenLimitM = Math.max(1.25, OF471.caliberMm * 10 / 1000);
  const boundaryEvent = resolveHeBurst(
    mkShell(OF471, 100), boundaryPoint, [], boundaryTarget,
    [
      mkPlateHit(0.1, boundaryPlate, 0, boundaryPoint),
      { t: 0.05, kind: 'crew', crew: 'driver', point: V(0, 1, 2) },
      { t: 0.06, tExit: 0.1, kind: 'crew', crew: 'loader', point: V(0, 1, 2) },
      { t: 0.07, tExit: 0.2, kind: 'crew', crew: 'gunner', point: V(5, 1, 2) },
      { t: 0.1, tExit: 0.2, kind: 'crew', crew: 'commander', point: V(6, 1, 2) },
      { t: 0.2, tExit: 0.21, kind: 'crew', crew: 'radio', point: V(postPenLimitM, 1, 2) },
      { t: 0.3, tExit: 0.4, kind: 'crew', crew: 'assistant', point: V(postPenLimitM + 0.01, 1, 2) },
      { t: 0.4, tExit: 0.5, kind: 'crew', crew: 'bow', point: V(0, 1, 2) },
    ],
    seqRng([0.5, 0.5, 0.05, 0.05, 0.05]),
  )[0];
  assert(boundaryEvent.crewHit.join(',') === 'gunner,commander,radio',
    'HE post-penetration sweep honors overlap, entry and exact travel boundaries');
  assert(boundaryEvent.kind === 'he_pen'
    && boundaryEvent.damage === OF471.dmg
    && boundaryTarget.combat.hp === boundaryTarget.combat.maxHp - OF471.dmg
    && boundaryEvent.targetHpAfter === boundaryTarget.combat.hp,
  'direct HE penetration applies full alpha and final HP bookkeeping');
  assert(boundaryEvent.pos.join(',') === '0,1,2'
    && boundaryEvent.normal.join(',') === '0,0,1'
    && boundaryEvent.effectiveMm === 10
    && boundaryEvent.penRollMm === 61
    && boundaryEvent.zone === boundaryPlate.name
    && boundaryEvent.plateKind === 'main'
    && boundaryEvent.physicalMm === 10
    && boundaryEvent.nominalMm === 10
    && boundaryEvent.localPos.join(',') === '0,1,2'
    && boundaryEvent.localDir.join(',') === '0,0,-1',
  'direct HE penetration stamps complete impact and local shot metadata');

  const exactPenPlate = mkPlate({
    name: 'he_exact_pen_face', physicalMm: 61, keMm: 61, ceMm: 61,
  });
  const exactPenTarget = mkTarget({ armor: null });
  const exactPenEvent = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2), [], exactPenTarget,
    [mkPlateHit(0.1, exactPenPlate, 0, V(0, 1, 2))],
    seqRng([0.5, 0.5]),
  )[0];
  assert(exactPenEvent.kind === 'he_pen' && exactPenEvent.damage === OF471.dmg,
    'HE penetration succeeds when residual penetration exactly equals effective armor');

  const noDirectHits = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2), [], thinTarget, null, seqRng([0.5, 0.5]),
  );
  assert(noDirectHits.length === 0, 'live direct target without an intersection emits no direct event');

  const deadDirect = mkTarget({ armor: thinArmor });
  deadDirect.combat.destroyed = true;
  deadDirect.combat.hp = 0;
  const deadNoHits = resolveHeBurst(
    mkShell(OF471, 100), V(1, 2, 3), [], deadDirect, null, seqRng([0.5, 0.5]),
  );
  assert(deadNoHits.length === 1 && deadNoHits[0].targetId === null
    && deadNoHits[0].normal[1] === 1,
  'destroyed direct target without a plate keeps the default detonation normal');

  const emptyArmor = {
    boundingRadiusM: 4,
    turretPivot: null,
    gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [], turretPlates: [], modules: [], crew: [],
  };
  const emptySpec = mkSpec({ armor: emptyArmor });
  const emptyTarget = {
    id: 'empty_he_geometry', spec: emptySpec, state: mkState(), combat: createCombatState(emptySpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [emptyTarget], null, null, seqRng([0.5, 0.5]),
  ).length === 0, 'HE splash falls back safely when hull geometry has no AABB or plate');

  const frontArmor = {
    boundingRadiusM: undefined,
    turretPivot: null,
    gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [
      mkPlate({ name: 'skip_era', kind: 'era' }),
      mkPlate({ name: 'front_surface', physicalMm: 100, keMm: 100, ceMm: 100 }),
    ],
    turretPlates: [], modules: [], crew: [],
  };
  const frontSpec = mkSpec({ armor: frontArmor });
  const frontTarget = {
    id: 'front_he_geometry', spec: frontSpec, state: mkState(), combat: createCombatState(frontSpec),
  };
  resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2), [frontTarget], null, null, seqRng([0.5, 0.5]),
  );
  resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2.0000005), [frontTarget], null, null, seqRng([0.5, 0.5]),
  );

  const pointArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [{
      ...mkPlate({ name: 'line_only' }),
      verts: [[-1, 0, 2], [-0.25, 0, 2], [0.25, 0, 2], [1, 0, 2]],
    }],
    turretPlates: [], modules: [], crew: [],
  };
  const pointSpec = mkSpec({ armor: pointArmor });
  const pointTarget = {
    id: 'point_he_geometry', spec: pointSpec, state: mkState(), combat: createCombatState(pointSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [pointTarget], null, null, seqRng([0.5, 0.5]),
  ).length === 0, 'nearest-point fallback tolerates an AABB whose degenerate plate cannot be traced');

  const farTarget = {
    id: 'far_he_target', spec: frontSpec, state: mkState({ pos: V(100, 0, 0) }),
    combat: createCombatState(frontSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 0), [farTarget], null, null, seqRng([0.5, 0.5]),
  ).length === 0, 'HE broadphase rejects a tank outside the blast radius');

  const distantPlate = mkPlate({
    name: 'distant_surface', physicalMm: 100, keMm: 100, ceMm: 100,
    verts: [[-1, 0, 10], [1, 0, 10], [1, 2, 10], [-1, 2, 10]],
  });
  const looseArmor = {
    boundingRadiusM: 100,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [distantPlate], turretPlates: [], modules: [], crew: [],
  };
  const looseSpec = mkSpec({ armor: looseArmor });
  const looseTarget = {
    id: 'loose_he_bound', spec: looseSpec, state: mkState(), combat: createCombatState(looseSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 20), [looseTarget], null, null, seqRng([0.5, 0.5]),
  ).length === 0, 'exact HE surface distance rejects a loose authored bounding sphere');

  const thickPlate = mkPlate({
    name: 'thick_splash', physicalMm: 1000, keMm: 1000, ceMm: 1000,
  });
  const thickArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [thickPlate], turretPlates: [], modules: [], crew: [],
  };
  const thickSpec = mkSpec({ armor: thickArmor });
  const thickTarget = {
    id: 'zero_he_damage', spec: thickSpec, state: mkState(), combat: createCombatState(thickSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [thickTarget], null, null, seqRng([0.5, 0.5]),
  ).length === 0, 'fully absorbed splash with no component effects emits no event');

  const splashLinkedTarget = {
    id: 'linked_he_splash', spec: linkedSpec, state: mkState(), combat: createCombatState(linkedSpec),
  };
  const splashLinkedEvents = resolveHeBurst(
    mkShell(OF471, 100),
    V(0, 1, 4),
    [splashLinkedTarget],
    null,
    null,
    seqRng([0.5, 0.5, 0.1, 0.5]),
  );
  assert(splashLinkedEvents.length === 1
    && splashLinkedEvents[0].modulesHit.some((hit) => hit.module === 'trackL'),
  'nearby HE splash applies a linked external module at full odds exactly once');
}

// ---------------- HE spatial routing and metadata contracts ----------------
{
  const front = mkPlate({
    name: 'he_contract_front', physicalMm: 38, keMm: 38, ceMm: 38,
    verts: [[-1.5, 0, 2], [1.5, 0, 2], [1.5, 2, 2], [-1.5, 2, 2]],
  });
  const armor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [front], turretPlates: [], modules: [], crew: [],
  };
  const spec = mkSpec({ armor });

  const dead = { id: 'dead_direct_he', spec, state: mkState(), combat: createCombatState(spec) };
  dead.combat.destroyed = true;
  dead.combat.hp = 0;
  const deadPoint = V(0.25, 1.25, 2);
  const deadEvents = resolveHeBurst(
    mkShell(OF471, 100),
    V(1, 2, 3),
    [],
    dead,
    [mkPlateHit(0.1, front, 0, deadPoint, V(0, 0, 1))],
    seqRng([0.5, 0.5]),
  );
  assert(deadEvents.length === 1
    && deadEvents[0].targetId === null
    && deadEvents[0].pos.join(',') === '1,2,3'
    && deadEvents[0].normal.join(',') === '0,0,1',
  'a destroyed direct target records the burst point and struck-plate normal without damage');

  const thin = mkPlate({
    name: 'he_contract_thin', physicalMm: 10, keMm: 10, ceMm: 10,
    verts: front.verts,
  });
  const thinArmor = { ...armor, hullPlates: [thin] };
  const thinSpec = mkSpec({ armor: thinArmor });
  const directPen = {
    id: 'he_direct_pen_contract', spec: thinSpec, state: mkState(), combat: createCombatState(thinSpec),
  };
  const protectedNeighbor = {
    id: 'he_pen_neighbor', spec, state: mkState(), combat: createCombatState(spec),
  };
  const directPenEvents = resolveHeBurst(
    mkShell(OF471, 100),
    V(0, 1, 2),
    [directPen, protectedNeighbor],
    directPen,
    [mkPlateHit(0.1, thin, 0, V(0, 1, 2))],
    seqRng([0.5, 0.5]),
  );
  assert(directPenEvents.length === 1 && directPenEvents[0].kind === 'he_pen'
    && protectedNeighbor.combat.hp === protectedNeighbor.combat.maxHp,
  'a direct HE penetration contains the blast and cannot splash a neighboring tank');

  const surfacePlate = mkPlate({
    name: 'he_contract_surface', physicalMm: 100, keMm: 100, ceMm: 100, verts: front.verts,
  });
  const surfaceArmor = { ...armor, hullPlates: [surfacePlate] };
  const surfaceSpec = mkSpec({ armor: surfaceArmor });
  const directSurface = {
    id: 'he_direct_surface_contract', spec: surfaceSpec, state: mkState(),
    combat: createCombatState(surfaceSpec),
  };
  const surfaceNeighbor = {
    id: 'he_surface_neighbor', spec, state: mkState(), combat: createCombatState(spec),
  };
  const directSurfaceEvents = resolveHeBurst(
    mkShell(OF471, 100),
    V(0, 1, 4),
    [directSurface, surfaceNeighbor],
    directSurface,
    [mkPlateHit(0.1, surfacePlate, 0, V(0, 1, 2))],
    seqRng([0.5, 0.5]),
  );
  assert(directSurfaceEvents.length === 2
    && directSurfaceEvents.some((event) => event.targetId === directSurface.id)
    && directSurfaceEvents.some((event) => event.targetId === surfaceNeighbor.id),
  `a direct surface burst is emitted once for its target and still splashes other nearby tanks (${directSurfaceEvents.map((event) => `${event.targetId}:${event.kind}`).join(',')})`);

  const hesh = mkShellSpec({
    name: 'contract HESH', type: 'HESH', caliberMm: 122,
    pen100Mm: 61, pen1000Mm: 61, dmg: 450, moduleDmg: 122, velocityMps: 770,
  });
  const metadataTarget = {
    id: 'he_metadata', spec, state: mkState(), combat: createCombatState(spec),
  };
  metadataTarget.combat.equipMults = { heSplash: 0.5 };
  const metadataShell = mkShell(hesh, 100);
  metadataShell.prevPos.set(0, 1, 10);
  metadataShell.pos.set(0, 1, 0);
  metadataShell.distM = 10;
  const metadataEvents = resolveHeBurst(
    metadataShell, V(0, 1, 4), [metadataTarget], null, null, seqRng([0.5, 0.5]),
  );
  const metadata = metadataEvents[0];
  near(metadataShell.distM, 6, 1e-9, 'HE burst trims the unused final sweep from flight distance');
  near(metadata.damage, (0.5 * 450 * (1 - 2 / blastRadiusM(122)) - 1.1 * 38) * 1.25 * 0.5,
    1e-6, 'HESH spall and equipment splash multipliers compose multiplicatively');
  assert(metadata.pos.join(',') === '0,1,2'
    && metadata.normal.join(',') === '0,0,1'
    && metadata.zone === front.name
    && metadata.plateKind === 'main'
    && metadata.physicalMm === 38
    && metadata.nominalMm === 38
    && metadata.localPos.join(',') === '0,1,2',
  'area splash stamps exact impact, armor, zone, and hull-local metadata');
  near(metadata.localDir[0], 0, 1e-9, 'HE metadata local direction X');
  near(metadata.localDir[1], 0, 1e-9, 'HE metadata local direction Y');
  near(metadata.localDir[2], -1, 1e-9, 'HE metadata local direction Z');

  const thickLinked = mkPlate({
    name: 'he_module_only', physicalMm: 1000, keMm: 1000, ceMm: 1000,
    moduleLink: 'trackL', verts: front.verts,
  });
  const linkedArmor = {
    ...armor,
    hullPlates: [thickLinked],
    modules: [{
      module: 'trackL', min: [-0.2, 0.8, 1.8], max: [0.2, 1.2, 2.2], turretLocal: false,
    }],
  };
  const linkedSpec = mkSpec({ armor: linkedArmor });
  const linked = {
    id: 'he_module_only_target', spec: linkedSpec, state: mkState(), combat: createCombatState(linkedSpec),
  };
  const moduleOnly = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [linked], null, null,
    seqRng([0.5, 0.5, 0.1, 0.5]),
  );
  assert(moduleOnly.length === 1 && moduleOnly[0].damage === 0
    && moduleOnly[0].modulesHit.length === 1,
  'zero-hull-damage splash still emits an event when it damages a module');

  const crewArmor = {
    ...armor,
    hullPlates: [mkPlate({
      name: 'he_crew_only', physicalMm: 1000, keMm: 1000, ceMm: 1000, verts: front.verts,
    })],
    crew: [{ crew: 'driver', min: [-0.2, 0.8, 1.8], max: [0.2, 1.2, 2.2], turretLocal: false }],
  };
  const crewSpec = mkSpec({ armor: crewArmor });
  const crewOnlyTarget = {
    id: 'he_crew_only_target', spec: crewSpec, state: mkState(), combat: createCombatState(crewSpec),
  };
  const crewOnly = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [crewOnlyTarget], null, null,
    seqRng([0.5, 0.5, 0.05]),
  );
  assert(crewOnly.length === 1 && crewOnly[0].damage === 0
    && crewOnly[0].crewHit.join(',') === 'driver',
  'zero-hull-damage splash still emits an event when it incapacitates crew');

  const missingPlatesArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: undefined, turretPlates: [], modules: [], crew: [],
  };
  const missingPlatesSpec = mkSpec({ armor: missingPlatesArmor });
  const missingPlates = {
    id: 'he_missing_hull_plates', spec: missingPlatesSpec, state: mkState(),
    combat: createCombatState(missingPlatesSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [missingPlates], null, null, seqRng([0.5, 0.5]),
  ).length === 0, 'HE nearest-surface lookup tolerates an absent hull-plate collection');

  const extremeEra = mkPlate({
    name: 'he_extreme_era', kind: 'era',
    verts: [[-50, 0, 100], [50, 0, 100], [50, 2, 100], [-50, 2, 100]],
  });
  const eraEnvelopeArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [extremeEra, front], turretPlates: [], modules: [], crew: [],
  };
  const eraEnvelopeSpec = mkSpec({ armor: eraEnvelopeArmor });
  const eraEnvelopeTarget = {
    id: 'he_era_envelope', spec: eraEnvelopeSpec, state: mkState(),
    combat: createCombatState(eraEnvelopeSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(2.5, 1, 3), [eraEnvelopeTarget], null, null,
    seqRng([0.5, 0.5]),
  )[0]?.zone === front.name, 'ERA geometry cannot distort or replace the solid-hull nearest surface');

  const yawed = {
    id: 'he_yawed_target', spec, state: mkState({ yaw: Math.PI / 2 }), combat: createCombatState(spec),
  };
  const yawedEvents = resolveHeBurst(
    mkShell(OF471, 100), V(3, 1, -2.5), [yawed], null, null, seqRng([0.5, 0.5]),
  );
  assert(yawedEvents.length === 1, 'nearest-surface HE trace follows the yawed hull frame');
  near(yawedEvents[0].pos[0], 2, 0.02, 'yawed nearest HE impact world X');
  near(yawedEvents[0].pos[2], -1.49, 0.02, 'yawed nearest HE impact world Z');
  near(yawedEvents[0].localPos[0], 1.49, 0.02, 'yawed nearest HE impact preserves local corner X');
  near(yawedEvents[0].localPos[2], 2, 0.02, 'yawed nearest HE impact remains on local front');

  const negativeYawCorner = {
    id: 'he_yawed_negative_corner', spec, state: mkState({ yaw: Math.PI / 2 }),
    combat: createCombatState(spec),
  };
  const negativeYawEvents = resolveHeBurst(
    mkShell(OF471, 100), V(3, 1, 2.5), [negativeYawCorner], null, null,
    seqRng([0.5, 0.5]),
  );
  assert(negativeYawEvents.length === 1, 'nearest-surface HE trace retains the opposite yawed corner');
  near(negativeYawEvents[0].localPos[0], -1.49, 0.02,
    'opposite yawed corner uses the inset minimum hull extent');

  const closeCornerTarget = {
    id: 'he_close_corner', spec, state: mkState(), combat: createCombatState(spec),
  };
  const closeCornerEvents = resolveHeBurst(
    mkShell(OF471, 100), V(1.6, 1, 2.1), [closeCornerTarget], null, null,
    seqRng([0.5, 0.5]),
  );
  assert(closeCornerEvents.length === 1 && closeCornerEvents[0].zone === front.name,
    'short nearest-point rays extend far enough to cross the selected armor face');

  const highPlate = mkPlate({
    name: 'he_high_center', physicalMm: 38, keMm: 38, ceMm: 38,
    verts: [[-1.5, 9, 2], [1.5, 9, 2], [1.5, 11, 2], [-1.5, 11, 2]],
  });
  const highArmor = { ...armor, boundingRadiusM: 1, turretPivot: [0, 10, 0], hullPlates: [highPlate] };
  const highSpec = mkSpec({ armor: highArmor });
  const highTarget = {
    id: 'he_high_center_target', spec: highSpec, state: mkState(), combat: createCombatState(highSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(0, 10, 4), [highTarget], null, null, seqRng([0.5, 0.5]),
  ).length === 1, 'HE broadphase centers on the authored vertical tank pivot');

  const rear = mkPlate({
    name: 'he_contract_rear', physicalMm: 38, keMm: 38, ceMm: 38,
    verts: [[1.5, 0, -2], [-1.5, 0, -2], [-1.5, 2, -2], [1.5, 2, -2]],
  });
  const boxArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [front, rear], turretPlates: [], modules: [], crew: [],
  };
  const boxSpec = mkSpec({ armor: boxArmor });
  const rearTarget = {
    id: 'he_rear_aabb_target', spec: boxSpec, state: mkState(), combat: createCombatState(boxSpec),
  };
  const rearEvents = resolveHeBurst(
    mkShell(OF471, 100), V(2.5, 1, -3), [rearTarget], null, null, seqRng([0.5, 0.5]),
  );
  assert(rearEvents.length === 1 && rearEvents[0].zone === rear.name,
    'nearest-point AABB retains the hull rear extent for rear-corner bursts');
  const frontTarget = {
    id: 'he_front_aabb_target', spec: boxSpec, state: mkState(), combat: createCombatState(boxSpec),
  };
  const frontEvents = resolveHeBurst(
    mkShell(OF471, 100), V(2.5, 1, 3), [frontTarget], null, null, seqRng([0.5, 0.5]),
  );
  assert(frontEvents.length === 1 && frontEvents[0].zone === front.name,
    'nearest-point AABB retains the hull front extent for front-corner bursts');

  const narrowPlate = mkPlate({
    name: 'he_narrow_plate', physicalMm: 10, keMm: 10, ceMm: 10,
    verts: [[-0.005, 0, 2], [0.005, 0, 2], [0.005, 2, 2], [-0.005, 2, 2]],
  });
  const narrowArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [narrowPlate], turretPlates: [], modules: [], crew: [],
  };
  const narrowSpec = mkSpec({ armor: narrowArmor });
  const narrowTarget = {
    id: 'he_narrow_target', spec: narrowSpec, state: mkState(), combat: createCombatState(narrowSpec),
  };
  const narrowEvents = resolveHeBurst(
    mkShell(OF471, 100), V(1, 1, 4), [narrowTarget], null, null, seqRng([0.5, 0.5]),
  );
  assert(narrowEvents.length === 1, 'sub-inset-width armor still has a stable nearest point');
  near(narrowEvents[0].pos[0], 0, 1e-9, 'sub-inset-width nearest point collapses to its midpoint');

  const diagonalTarget = {
    id: 'he_diagonal_direction', spec, state: mkState(), combat: createCombatState(spec),
  };
  const diagonalEvents = resolveHeBurst(
    mkShell(OF471, 100), V(2.5, 1, 3), [diagonalTarget], null, null, seqRng([0.5, 0.5]),
  );
  assert(diagonalEvents.length === 1
    && diagonalEvents[0].localDir[0] < -0.6
    && diagonalEvents[0].localDir[2] < -0.6,
  'diagonal splash metadata derives its direction from this exact burst and plate pair');

  const authoredBoundPlate = mkPlate({
    name: 'he_authored_bound_surface', physicalMm: 38, keMm: 38, ceMm: 38,
    verts: [[-1.5, 0, 10], [1.5, 0, 10], [1.5, 2, 10], [-1.5, 2, 10]],
  });
  const authoredBoundArmor = {
    boundingRadiusM: 100,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [authoredBoundPlate], turretPlates: [], modules: [], crew: [],
  };
  const authoredBoundSpec = mkSpec({ armor: authoredBoundArmor });
  const authoredBoundTarget = {
    id: 'he_authored_bound_target', spec: authoredBoundSpec, state: mkState(),
    combat: createCombatState(authoredBoundSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 12), [authoredBoundTarget], null, null,
    seqRng([0.5, 0.5]),
  ).length === 1, 'HE broadphase honors a non-default authored bounding radius');

  const broadphasePlate = mkPlate({
    name: 'he_broadphase_authority', physicalMm: 10, keMm: 10, ceMm: 10,
    moduleLink: 'trackL',
    verts: [[-8, 0, 2], [-6, 0, 2], [-6, 2, 2], [-8, 2, 2]],
  });
  const broadphaseArmor = {
    boundingRadiusM: 2,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [broadphasePlate], turretPlates: [],
    modules: [{ module: 'trackL', min: [-8, 0, 1.8], max: [-6, 2, 2.2], turretLocal: false }],
    crew: [],
  };
  const broadphaseSpec = mkSpec({ armor: broadphaseArmor });
  const broadphaseTarget = {
    id: 'he_broadphase_reject', spec: broadphaseSpec, state: mkState({ pos: V(7, 0, 0) }),
    combat: createCombatState(broadphaseSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [broadphaseTarget], null, null,
    seqRng([0.5, 0.5]),
  ).length === 0, 'authored bounding sphere remains the authoritative HE broadphase gate');

  const farLinkedPlate = mkPlate({
    name: 'he_far_linked_surface', physicalMm: 1000, keMm: 1000, ceMm: 1000,
    moduleLink: 'trackL',
    verts: [[-1, 0, 10], [1, 0, 10], [1, 2, 10], [-1, 2, 10]],
  });
  const farLinkedArmor = {
    boundingRadiusM: 100,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [farLinkedPlate], turretPlates: [],
    modules: [{ module: 'trackL', min: [-1, 0, 9.8], max: [1, 2, 10.2], turretLocal: false }],
    crew: [],
  };
  const farLinkedSpec = mkSpec({ armor: farLinkedArmor });
  const farLinkedTarget = {
    id: 'he_exact_surface_reject', spec: farLinkedSpec, state: mkState(),
    combat: createCombatState(farLinkedSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 20), [farLinkedTarget], null, null,
    seqRng([0.5, 0.5]),
  ).length === 0, 'exact surface range rejects even component-linked armor beyond the blast');

  const exactRadiusTarget = {
    id: 'he_exact_radius_target', spec: linkedSpec, state: mkState(), combat: createCombatState(linkedSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100),
    V(0, 1, 2 + blastRadiusM(122)),
    [exactRadiusTarget],
    null,
    null,
    seqRng([0.5, 0.5]),
  ).length === 0, 'an exact-radius surface is outside the open HE blast volume');

  const directEraTarget = {
    id: 'he_direct_era_only', spec: eraEnvelopeSpec, state: mkState(),
    combat: createCombatState(eraEnvelopeSpec),
  };
  assert(resolveHeBurst(
    mkShell(OF471, 100),
    V(0, 1, 100),
    [],
    directEraTarget,
    [mkPlateHit(0.1, extremeEra, 0, V(0, 1, 100))],
    seqRng([0.5, 0.5]),
  ).length === 0, 'an ERA-only direct trace is not a structural HE impact event');

  const fallbackEra = mkPlate({
    name: 'he_fallback_era', kind: 'era',
    verts: [[-1.5, 0, 2.5], [1.5, 0, 2.5], [1.5, 2, 2.5], [-1.5, 2, 2.5]],
  });
  const fallbackMain = mkPlate({
    name: 'he_fallback_main', physicalMm: 38, keMm: 38, ceMm: 38, verts: front.verts,
  });
  const fallbackArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [], turretPlates: [fallbackEra, fallbackMain],
    modules: [{ module: 'trackL', min: [-0.2, 0.8, 2.7], max: [0.2, 1.2, 2.9], turretLocal: false }],
    crew: [],
  };
  const fallbackSpec = mkSpec({ armor: fallbackArmor });
  const fallbackTarget = {
    id: 'he_center_fallback_target', spec: fallbackSpec, state: mkState(),
    combat: createCombatState(fallbackSpec),
  };
  const fallbackResult = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [fallbackTarget], null, null,
    rngHalf,
  );
  assert(fallbackResult.length === 1 && fallbackResult[0].zone === fallbackMain.name,
    'center fallback skips module and ERA intersections before selecting structural armor');

  const nearestEraArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [fallbackEra, fallbackMain], turretPlates: [], modules: [], crew: [],
  };
  const nearestEraSpec = mkSpec({ armor: nearestEraArmor });
  const nearestEraTarget = {
    id: 'he_nearest_era_target', spec: nearestEraSpec, state: mkState(),
    combat: createCombatState(nearestEraSpec),
  };
  const nearestEraResult = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [nearestEraTarget], null, null,
    seqRng([0.5, 0.5]),
  );
  assert(nearestEraResult.length === 1 && nearestEraResult[0].zone === fallbackMain.name,
    'nearest-point trace skips a live ERA tile when choosing the structural splash plate');

  const pitch = 0.35;
  const pitchedBurst = V(2.5, 1, 3).applyEuler(new Euler(-pitch, 0, 0, 'YXZ'));
  const pitchedTarget = {
    id: 'he_pitched_target', spec, state: mkState({ visualPitch: pitch }),
    combat: createCombatState(spec),
  };
  const pitchedEvents = resolveHeBurst(
    mkShell(OF471, 100), pitchedBurst, [pitchedTarget], null, null, seqRng([0.5, 0.5]),
  );
  assert(pitchedEvents.length === 1, 'nearest-surface HE trace follows the pitched hull frame');
  near(pitchedEvents[0].localPos[0], 1.49, 0.02, 'pitched nearest HE impact local X');
  near(pitchedEvents[0].localPos[1], 1, 0.02, 'pitched nearest HE impact local Y');
  near(pitchedEvents[0].localPos[2], 2, 0.02, 'pitched nearest HE impact local Z');
}

// ---------------- HE blast component sweep contracts ----------------------
{
  const sweepFront = mkPlate({
    name: 'he_sweep_front', physicalMm: 100, keMm: 100, ceMm: 100,
    verts: [[-1.5, 0, 2], [1.5, 0, 2], [1.5, 2, 2], [-1.5, 2, 2]],
  });
  const duplicateArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [sweepFront], turretPlates: [],
    modules: [
      { module: 'engine', min: [-0.4, 0.6, 1.2], max: [0.4, 1.4, 1.8], turretLocal: false },
      { module: 'engine', min: [-0.4, 0.6, 0.6], max: [0.4, 1.4, 1.1], turretLocal: false },
    ],
    crew: [],
  };
  const duplicateSpec = mkSpec({ armor: duplicateArmor });
  const duplicateTarget = {
    id: 'he_duplicate_module', spec: duplicateSpec, state: mkState(),
    combat: createCombatState(duplicateSpec),
  };
  const duplicateEvents = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [duplicateTarget], null, null,
    seqRng([0.5, 0.5, 0.1, 0.5, 0.9]),
  );
  assert(duplicateEvents.length === 1
    && duplicateEvents[0].modulesHit.filter((hit) => hit.module === 'engine').length === 1,
  'multiple authored volumes for one module consume one HE damage roll');

  const radius = blastRadiusM(122);
  const boundaryArmor = {
    boundingRadiusM: 4,
    turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
    hullPlates: [sweepFront], turretPlates: [],
    modules: [{
      module: 'trackL',
      min: [radius - 0.1, 0.9, 3.9], max: [radius + 0.1, 1.1, 4.1],
      turretLocal: false,
    }],
    crew: [],
  };
  const boundarySpec = mkSpec({ armor: boundaryArmor });
  const boundaryTarget = {
    id: 'he_boundary_module', spec: boundarySpec, state: mkState(),
    combat: createCombatState(boundarySpec),
  };
  const boundaryEvents = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [boundaryTarget], null, null,
    seqRng([0.5, 0.5, 0, 0.5]),
  );
  assert(boundaryEvents[0].modulesHit[0]?.module === 'trackL'
    && boundaryEvents[0].modulesHit[0]?.dmg === 122,
  'an external module centered exactly on the blast radius is included at full damage');

  const gunArmor = {
    ...boundaryArmor,
    modules: [{
      module: 'gun', min: [-0.1, 0.9, 3.9], max: [0.1, 1.1, 4.1],
      turretLocal: false, external: false,
    }],
  };
  const gunSpec = mkSpec({ armor: gunArmor });
  const gunTarget = {
    id: 'he_gun_external', spec: gunSpec, state: mkState(), combat: createCombatState(gunSpec),
  };
  const gunEvents = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [gunTarget], null, null,
    seqRng([0.5, 0.5, 0, 0.5]),
  );
  assert(gunEvents[0].modulesHit[0]?.module === 'gun'
    && gunEvents[0].modulesHit[0]?.dmg === 122,
  'gun components receive full external HE damage even when the authored box omits that flag');

  const crewArmor = {
    ...boundaryArmor,
    modules: [],
    crew: [{ crew: 'driver', min: [-0.2, 0.8, 1.4], max: [0.2, 1.2, 1.8], turretLocal: false }],
  };
  const crewSpec = mkSpec({ armor: crewArmor });
  const crewTarget = {
    id: 'he_reduced_crew_odds', spec: crewSpec, state: mkState(), combat: createCombatState(crewSpec),
  };
  const crewEvents = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 4), [crewTarget], null, null,
    seqRng([0.5, 0.5, 0.2]),
  );
  assert(crewEvents.length === 1 && crewEvents[0].crewHit.length === 0
    && crewTarget.combat.crew.driver,
  'HE blast uses reduced crew-incapacitation odds instead of direct-penetration odds');

  const fallbackTarget = mkTarget({ armor: null });
  const fallbackHits = [
    mkPlateHit(0.1, sweepFront, 0, V(0, 1, 2)),
    {
      t: 0.2, kind: 'module', module: 'trackL', external: true,
      point: V(radius, 1, 2),
    },
    { t: 0.3, kind: 'crew', crew: 'driver', point: V(0, 1, 1.5) },
  ];
  const fallbackEvents = resolveHeBurst(
    mkShell(OF471, 100), V(0, 1, 2), [], fallbackTarget, fallbackHits,
    seqRng([0.5, 0.5, 0, 0.5, 0.2]),
  );
  assert(fallbackEvents.length === 1
    && fallbackEvents[0].modulesHit[0]?.dmg === 122
    && fallbackEvents[0].crewHit.length === 0,
  'fallback HE sweep includes exact-radius external modules at full damage and reduced crew odds');

  for (const armorOverrides of [
    { modules: [], crew: [] },
    { modules: undefined, crew: undefined },
  ]) {
    const sparseArmor = {
      boundingRadiusM: 4,
      turretPivot: [0, 1, 0], gunPivot: [0, 0, 0], gunBarrel: null,
      hullPlates: [sweepFront], turretPlates: [],
      ...armorOverrides,
    };
    const sparseSpec = mkSpec({ armor: sparseArmor });
    const sparse = {
      id: `he_sparse_${String(armorOverrides.modules)}`,
      spec: sparseSpec,
      state: mkState(),
      combat: createCombatState(sparseSpec),
    };
    const sparseEvents = resolveHeBurst(
      mkShell(OF471, 100),
      V(0, 1, 2),
      [],
      sparse,
      [
        mkPlateHit(0.1, sweepFront, 0, V(0, 1, 2)),
        { t: 0.2, kind: 'module', module: 'trackL', external: true, point: V(0, 1, 1.5) },
      ],
      seqRng([0.5, 0.5, 0, 0.5]),
    );
    assert(sparseEvents[0].modulesHit[0]?.module === 'trackL',
      'sparse armor records use ray intersections as the HE component fallback');
  }
}

// ---------------- module repair and fire terminal edges --------------------
{
  assert(tickModuleRepairs(null, 1).length === 0,
    'module repair ticker safely ignores missing combat state');
  const destroyed = createCombatState(mkSpec());
  destroyed.destroyed = true;
  assert(tickModuleRepairs(destroyed, 20).length === 0,
    'destroyed tanks do not auto-repair modules');

  const repairing = createCombatState(mkSpec());
  repairing.modules.gun = undefined;
  repairing.modules.engine.state = 'red';
  repairing.modules.engine.hp = 0;
  repairing.modules.engine.repairT = 1;
  assert(tickModuleRepairs(repairing, 1).length === 0
    && repairing.modules.engine.state === 'red',
  'red module remains disabled before the repair duration');
  const repaired = tickModuleRepairs(repairing, 20);
  assert(repaired.length === 1 && repaired[0] === 'engine'
    && repairing.modules.engine.state === 'yellow',
  'repair ticker restores a red module to yellow on the ready edge');

  assert(tickFire({}, rngHalf).destroyed === false,
    'fire ticker safely ignores entities without combat state');
  assert(tickFire({}, rngHalf).extinguished === false,
    'an entity without a fire cannot report a spurious extinguish event');
  const fireTarget = createCombatState(mkSpec());
  fireTarget.fire.burning = true;
  fireTarget.fire.ticksLeft = 2;
  fireTarget.modules.engine = undefined;
  fireTarget.modules.fuelTank.hp = 0;
  fireTarget.modules.ammoRack.hp = 5;
  const terminal = tickFire({ combat: fireTarget }, () => 0.9);
  assert(terminal.destroyed && terminal.extinguished && fireTarget.hp === 0,
    'fire cooking a nearly destroyed ammo rack detonates and extinguishes the tank');
  assert(fireTarget.modules.fuelTank.state === 'ok',
    'an already depleted module is not reprocessed by a later fire tick');

  const burnout = createCombatState(mkSpec());
  burnout.fire.burning = true;
  burnout.fire.ticksLeft = 1;
  const burnedOut = tickFire({ combat: burnout }, () => 0.9);
  assert(burnedOut.extinguished && burnout.fire.ticksLeft === 0,
    'the last fire tick decrements to zero and extinguishes immediately');

  const threshold = createCombatState(mkSpec());
  threshold.fire.burning = true;
  threshold.fire.ticksLeft = 3;
  const thresholdTick = tickFire({ combat: threshold }, () => 0.12);
  assert(!thresholdTick.extinguished && threshold.fire.burning,
    'the exact extinguish threshold is excluded by the strict probability comparison');

  const engineOnly = createCombatState(mkSpec());
  engineOnly.fire.burning = true;
  engineOnly.fire.ticksLeft = 3;
  engineOnly.modules.engine.hp = 5;
  engineOnly.modules.ammoRack.hp = engineOnly.modules.ammoRack.maxHp;
  const engineTick = tickFire({ combat: engineOnly }, () => 0.9);
  assert(!engineTick.destroyed && engineOnly.modules.engine.state === 'red',
    'fire destroying the engine cannot be misreported as an ammo-rack detonation');

  const acceleratedRepair = createCombatState(mkSpec());
  acceleratedRepair.equipMults = { repair: 2 };
  acceleratedRepair.modules.engine.hp = 0;
  acceleratedRepair.modules.engine.state = 'red';
  acceleratedRepair.modules.engine.repairT = 0;
  const accelerated = tickModuleRepairs(acceleratedRepair, REPAIR_S / 2);
  assert(accelerated.length === 1 && accelerated[0] === 'engine'
    && acceleratedRepair.modules.engine.state === 'yellow'
    && acceleratedRepair.modules.engine.repairT === 0,
  'repair multiplier reaches the exact ready boundary and reports the repaired module');
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
  assert(ramDamage(40, 0, 8).total === ramDamage(40, 40, 8).total,
    'ram: zero victim mass uses the standard fallback mass');
  assert(ramDamage(45, 45, 2.5).total > 0,
    'ram: the exact minimum closing speed is a damaging collision');
  const invalid = ramDamage(45, 45, NaN);
  assert(invalid.total === 0 && invalid.toA === 0 && invalid.toB === 0,
    'ram: non-finite closing speed cannot poison combat state');
  assert(Number.isFinite(ramDamage(45, 45, Infinity).total),
    'ram: infinite closing speed remains capped');
}

// Invalid HE metadata must fail safe without leaking NaN through blast
// falloff, damage, HP, or network snapshots.
{
  assert(blastRadiusM(-30) === 1, 'HE: negative caliber clamps to minimum blast radius');
  assert(blastRadiusM(0) === 1, 'HE: zero caliber clamps to minimum blast radius');
  assert(blastRadiusM(NaN) === 1, 'HE: non-finite caliber clamps to minimum blast radius');
  near(blastRadiusM(122), 4.0884, 1e-3, 'HE: valid caliber blast radius is unchanged');
}

// ------------------------------------------------------------------ report --
if (failures > 0) {
  console.error(`combat.selftest: ${failures}/${checks} assertions FAILED`);
  process.exit(1);
}
console.info(`combat.selftest: ${checks} assertions passed`);
