// Fleet-wide deterministic balance pass. Applied once after every spec pack
// has registered and before combat anatomy is finalized.

import { scaleNonExternalArmor } from './fleetSpecRegistry.ts';
import type { FleetTankSpec, TankSpecRegistry } from './specContracts.ts';

const appliedRegistries = new WeakSet<object>();

function spec(registry: TankSpecRegistry, id: string): FleetTankSpec {
  const value = registry[id];
  if (!value) throw new Error(`Fleet balance pass is missing ${id}`);
  return value;
}

function primary(
  registry: TankSpecRegistry,
  id: string,
  values: { damage?: number; pen100?: number; pen1000?: number; pen2000?: number },
): void {
  const round = spec(registry, id).gun.shells[0];
  if (values.damage != null) round.dmg = values.damage;
  if (values.pen100 != null) round.pen100Mm = values.pen100;
  if (values.pen1000 != null) round.pen1000Mm = values.pen1000;
  if (values.pen2000 != null) round.pen2000Mm = values.pen2000;
}

function armor(registry: TankSpecRegistry, id: string, factor: number): void {
  scaleNonExternalArmor(spec(registry, id), factor);
}

/**
 * 235 (turretRigScale.ts): these turrets' combat cells were measured at 1/scale until the builders' turret squash moved
 * off rig_turret. The cells now match the drawn turret, and its true face slopes change how much of a frontal shot the
 * turret stops. Each factor scales the turret's frontal zones (the main cheek, wedge, front, mantlet and gun-notch
 * plates, KE and CE), so that the share of frontal turret hits a tier-typical APFSDS fails to penetrate is back within
 * 10 % of what it was (0.8, 1.0 and 1.2 x the tier's median MBT pen100). Side plates are left as they were: the side-on
 * gains come from ricochets on the true cheek slopes, and thinner sides would not undo them.
 */
const TURRET_FRONT_COMPENSATION: Readonly<Record<string, number>> = Object.freeze({
  t90am: 0.857, fv4034: 1.427, challenger2: 1.251, challenger2e: 1.361, ua_challenger2: 1.361,
  merkava1b: 0.932, merkava3c: 0.852,
});
const TURRET_FRONT_ZONE = /cheek|wedge|front|mantlet|gun_notch/i;

/** Scales a turret's mantlet and gun-notch plates (KE and CE) alone. */
function mantlet(registry: TankSpecRegistry, id: string, factor: number): void {
  for (const plate of spec(registry, id).armor.turretPlates) {
    if (plate.kind !== 'main' || !/mantlet|gun_notch/i.test(plate.name)) continue;
    plate.keMm = Math.round(plate.keMm * factor);
    plate.ceMm = Math.round(plate.ceMm * factor);
  }
}

function turretFront(registry: TankSpecRegistry, id: string, factor: number): void {
  for (const plate of spec(registry, id).armor.turretPlates) {
    if (plate.kind !== 'main' || !TURRET_FRONT_ZONE.test(plate.name) || /side|cupola/i.test(plate.name)) continue;
    plate.keMm = Math.round(plate.keMm * factor);
    plate.ceMm = Math.round(plate.ceMm * factor);
  }
}

/** Gives a vehicle drawn on another's shell that shell's main plates (KE and CE, by plate name); add-on plates stay. */
function mainArmorFrom(registry: TankSpecRegistry, id: string, shellId: string): void {
  const shell = spec(registry, shellId).armor;
  const own = spec(registry, id).armor;
  for (const [plates, shellPlates] of [[own.hullPlates, shell.hullPlates], [own.turretPlates, shell.turretPlates]]) {
    for (const plate of plates) {
      if (plate.kind !== 'main') continue;
      const match = shellPlates.find((candidate) => candidate.kind === 'main' && candidate.name === plate.name);
      if (!match) throw new Error(`${id}: ${shellId} has no main plate ${plate.name}`);
      plate.keMm = match.keMm;
      plate.ceMm = match.ceMm;
    }
  }
}

/** Apply the reviewed 2026-09 full-fleet balance revision exactly once. */
export function applyFleetBalancePass(registry: TankSpecRegistry): void {
  if (appliedRegistries.has(registry)) return;
  appliedRegistries.add(registry);

  // Next-generation MBTs.
  {
    const tank = spec(registry, 'm1a3');
    Object.assign(tank, {
      hp: 2750, topSpeedKmh: 72, reverseSpeedKmh: 34,
      hullTraverseDegS: 44, turretTraverseDegS: 48,
    });
    Object.assign(tank.gun, { reloadS: 21, baseAccuracy: 0.25, aimTimeS: 1.45 });
    Object.assign(tank.gun.autoloader!, { intraClipS: 2.5, fullReloadS: 21 });
    primary(registry, 'm1a3', { damage: 570, pen100: 930, pen1000: 846, pen2000: 760 });
    Object.assign(tank.gun.shells[1], {
      dmg: 600, pen100Mm: 950, pen1000Mm: 950, reloadS: 3, count: 4,
    });
    armor(registry, 'm1a3', 0.88);
  }
  {
    const tank = spec(registry, 'challenger3_proto');
    Object.assign(tank, { hp: 2650, topSpeedKmh: 62, reverseSpeedKmh: 24 });
    Object.assign(tank.gun, { reloadS: 5.9, baseAccuracy: 0.24, aimTimeS: 1.6 });
    primary(registry, 'challenger3_proto', { pen100: 880, pen1000: 810, pen2000: 730 });
  }
  {
    // release 262: the 2021 demonstrator a step under the prototype: DM63A1 for DM73, the Challenger 2's 1,200 hp; its
    // field fit shares the package (its remote M2 is its own auxiliary weapon, a tonne heavier and a shade slower)
    for (const id of ['challenger3_td', 'challenger3_td_rws']) {
      const tank = spec(registry, id);
      Object.assign(tank, { hp: 2550, topSpeedKmh: id === 'challenger3_td' ? 59 : 58, reverseSpeedKmh: 22 });
      Object.assign(tank.gun, { reloadS: 6.1, baseAccuracy: 0.245, aimTimeS: 1.65 });
      primary(registry, id, { pen100: 850, pen1000: 780, pen2000: 700 });
    }
  }
  {
    const tank = spec(registry, 'challenger3');
    Object.assign(tank, { hp: 2780, topSpeedKmh: 60, reverseSpeedKmh: 24 });
    // 2026-10-25: aim 1.5 -> 1.65 s, inside the modern Tier X fire-control ceiling, still a step over the prototype
    Object.assign(tank.gun, { reloadS: 5.7, baseAccuracy: 0.22, aimTimeS: 1.65 });
    primary(registry, 'challenger3', { pen100: 900, pen1000: 820, pen2000: 740 });
  }

  // T-90 family.
  {
    const tank = spec(registry, 't90_1992');
    Object.assign(tank, {
      hp: 2550, enginePowerHp: 1050, topSpeedKmh: 65, reverseSpeedKmh: 12,
      hullTraverseDegS: 42, turretTraverseDegS: 38,
    });
    Object.assign(tank.gun, { reloadS: 6.1, baseAccuracy: 0.31, aimTimeS: 1.85 });
    primary(registry, 't90_1992', { damage: 550, pen100: 840, pen1000: 780, pen2000: 700 });
    armor(registry, 't90_1992', 1.15);
  }
  {
    const tank = spec(registry, 't90m_proryv');
    Object.assign(tank, { hp: 2900, reverseSpeedKmh: 14 });
    Object.assign(tank.gun, { reloadS: 6.1, baseAccuracy: 0.3, aimTimeS: 1.7 });
    primary(registry, 't90m_proryv', { pen100: 880, pen1000: 820, pen2000: 740 });
    armor(registry, 't90m_proryv', 1.05);
  }

  // British Cold War troughs.
  {
    const tank = spec(registry, 'chieftain_mk9');
    Object.assign(tank, {
      hp: 2100, enginePowerHp: 900, topSpeedKmh: 50, reverseSpeedKmh: 13,
      hullTraverseDegS: 30, turretTraverseDegS: 28,
    });
    Object.assign(tank.gun, { reloadS: 6.2, baseAccuracy: 0.28, aimTimeS: 1.85 });
    primary(registry, 'chieftain_mk9', { damage: 510, pen100: 700, pen1000: 640, pen2000: 580 });
    armor(registry, 'chieftain_mk9', 1.5);
  }
  {
    const tank = spec(registry, 'centurion5_2');
    Object.assign(tank, {
      hp: 1900, enginePowerHp: 850, topSpeedKmh: 48, reverseSpeedKmh: 15,
      hullTraverseDegS: 32, turretTraverseDegS: 30,
    });
    Object.assign(tank.gun, { reloadS: 6.6, baseAccuracy: 0.3, aimTimeS: 2 });
    primary(registry, 'centurion5_2', { pen100: 570, pen1000: 525, pen2000: 480 });
    armor(registry, 'centurion5_2', 1.12);
  }
  {
    const tank = spec(registry, 'fv4034');
    tank.hp = 2100;
    tank.gun.reloadS = 7.4;
    armor(registry, 'fv4034', 0.9);
  }

  // K2 progression.
  {
    const tank = spec(registry, 'xk2_black_panther');
    tank.hp = 2700;
    tank.gun.reloadS = 5.7;
    primary(registry, 'xk2_black_panther', { pen100: 890, pen1000: 815, pen2000: 740 });
    armor(registry, 'xk2_black_panther', 1.3);
  }
  {
    const tank = spec(registry, 'k2b');
    Object.assign(tank, { hp: 2600, enginePowerHp: 1100 });
    tank.gun.reloadS = 5.2;
    primary(registry, 'k2b', { pen100: 890, pen1000: 815, pen2000: 740 });
    armor(registry, 'k2b', 1.25);
  }

  // Cold War peer ceilings and family sidegrades.
  {
    const tank = spec(registry, 'merkava1b');
    Object.assign(tank, { hp: 1600, enginePowerHp: 1100 });
    tank.gun.reloadS = 8.1;
    primary(registry, 'merkava1b', { damage: 490, pen100: 560, pen1000: 515, pen2000: 470 });
    armor(registry, 'merkava1b', 0.35);
  }
  {
    const tank = spec(registry, 't62_1975');
    tank.hp = 1850;
    tank.gun.reloadS = 6.6;
    primary(registry, 't62_1975', { damage: 430, pen100: 580, pen1000: 530, pen2000: 480 });
    armor(registry, 't62_1975', 1.1);
  }
  {
    const tank = spec(registry, 'm48a5_patton');
    Object.assign(tank, { hp: 2050, enginePowerHp: 900, topSpeedKmh: 50, reverseSpeedKmh: 18 });
    Object.assign(tank.gun, { reloadS: 7, baseAccuracy: 0.3, aimTimeS: 1.8 });
    primary(registry, 'm48a5_patton', { damage: 450, pen100: 580, pen1000: 535, pen2000: 490 });
  }
  Object.assign(spec(registry, 'm60a1'), {
    hp: 2100, enginePowerHp: 900, topSpeedKmh: 52, reverseSpeedKmh: 18,
  });
  Object.assign(spec(registry, 'm60a3'), { enginePowerHp: 950, reverseSpeedKmh: 18 });
  {
    const tank = spec(registry, 'm60a2');
    Object.assign(tank, { enginePowerHp: 900, reverseSpeedKmh: 18 });
    tank.gun.reloadS = 9;
    tank.gun.shells[0].reloadS = 9;
    Object.assign(tank.gun.shells[1], {
      dmg: 720, pen100Mm: 875, pen1000Mm: 875, reloadS: 3, count: 10,
    });
    tank.gun.shells[2].reloadS = 9;
  }
  {
    const tank = spec(registry, 't80');
    Object.assign(tank, {
      hp: 1850, enginePowerHp: 1200, reverseSpeedKmh: 14,
      hullTraverseDegS: 46, turretTraverseDegS: 40,
    });
    Object.assign(tank.gun, { reloadS: 7.2, baseAccuracy: 0.34, aimTimeS: 2 });
    armor(registry, 't80', 0.92);
  }
  {
    const tank = spec(registry, 't80b');
    Object.assign(tank, {
      enginePowerHp: 1250, reverseSpeedKmh: 14,
      hullTraverseDegS: 46, turretTraverseDegS: 40,
    });
    Object.assign(tank.gun, { reloadS: 7, baseAccuracy: 0.34, aimTimeS: 2 });
    armor(registry, 't80b', 0.95);
  }
  Object.assign(spec(registry, 'type90_kyumaru'), {
    enginePowerHp: 1550, topSpeedKmh: 74, reverseSpeedKmh: 34,
    hullTraverseDegS: 48, turretTraverseDegS: 44,
  });
  {
    const tank = spec(registry, 't90a_2004');
    Object.assign(tank, { hp: 2250, hullTraverseDegS: 42, turretTraverseDegS: 38 });
    Object.assign(tank.gun, { reloadS: 6.8, baseAccuracy: 0.33, aimTimeS: 2 });
  }
  Object.assign(spec(registry, 'm1a1'), {
    enginePowerHp: 1600, topSpeedKmh: 69, reverseSpeedKmh: 28,
    hullTraverseDegS: 46, turretTraverseDegS: 44,
  });
  {
    const tank = spec(registry, 'type59');
    Object.assign(tank, {
      hp: 1700, enginePowerHp: 650, topSpeedKmh: 55, reverseSpeedKmh: 12,
      hullTraverseDegS: 44, turretTraverseDegS: 40,
    });
    tank.gun.reloadS = 6.8;
    primary(registry, 'type59', { pen100: 520, pen1000: 475, pen2000: 430 });
  }
  {
    // 262: the T-55A shares the Type 59's chassis and gun (profiles/t54Family.ts), so it takes the same package
    const tank = spec(registry, 't55a');
    Object.assign(tank, {
      hp: 1700, enginePowerHp: 650, topSpeedKmh: 55, reverseSpeedKmh: 12,
      hullTraverseDegS: 44, turretTraverseDegS: 40,
    });
    tank.gun.reloadS = 6.8;
    primary(registry, 't55a', { pen100: 520, pen1000: 475, pen2000: 430 });
  }
  {
    const tank = spec(registry, 'amx30');
    Object.assign(tank, { hp: 1650, reverseSpeedKmh: 20 });
    Object.assign(tank.gun, { reloadS: 6.2, baseAccuracy: 0.29, aimTimeS: 1.7 });
    primary(registry, 'amx30', { damage: 400, pen100: 500, pen1000: 460, pen2000: 420 });
  }

  // IFVs: tune cannon, missile, protection and mobility as one package.
  {
    const tank = spec(registry, 'spz_puma');
    tank.hp = 2000;
    Object.assign(tank.gun, { reloadS: 0.4, baseAccuracy: 0.29, aimTimeS: 1.35 });
    Object.assign(tank.gun.shells[0], {
      dmg: 64, pen100Mm: 165, pen1000Mm: 150, pen2000Mm: 135, reloadS: 0.4,
    });
    tank.gun.shells[2].reloadS = 0.4;
    armor(registry, 'spz_puma', 0.85);
  }
  {
    const tank = spec(registry, 'bmp3_rok');
    Object.assign(tank, { hp: 1700, enginePowerHp: 550 });
    Object.assign(tank.gun, { reloadS: 0.45, baseAccuracy: 0.29, aimTimeS: 1.3 });
    Object.assign(tank.gun.shells[0], {
      dmg: 60, pen100Mm: 165, pen1000Mm: 150, pen2000Mm: 135, reloadS: 0.45,
    });
    Object.assign(tank.gun.shells[1], {
      dmg: 500, pen100Mm: 780, pen1000Mm: 780, pen2000Mm: 780,
    });
    armor(registry, 'bmp3_rok', 2);
  }
  {
    const tank = spec(registry, 'spz_wotan');
    tank.hp = 2750;
    Object.assign(tank.gun, { reloadS: 0.38, baseAccuracy: 0.25, aimTimeS: 1.1 });
    Object.assign(tank.gun.shells[0], {
      dmg: 82, pen100Mm: 210, pen1000Mm: 192, pen2000Mm: 174, reloadS: 0.38,
    });
    Object.assign(tank.gun.shells[1], {
      dmg: 720, pen100Mm: 1000, pen1000Mm: 1000,
      reloadS: 2.8, count: 6, velocityMps: 240,
    });
    tank.gun.shells[2].reloadS = 0.38;
    armor(registry, 'spz_wotan', 0.9);
  }
  {
    const tank = spec(registry, 'bmpt_t90');
    // owner 2026-09-18: the missile load is never below one round per launcher tube — the T-90 BMPT carries two quad
    // Ataka racks (eight tubes, guidedLauncherTubes.selftest). Eight rounds at the old 3.0 s cadence pushed the reviewed
    // Puma S1 duel to 0.167 (band 0.2–0.8); inside the IFV launcher band (2–3 s, afvBalance.selftest) 2.9 s sits at 0.5
    // with even damage traded (.qa-dev/bmpt-balance-tune.mjs sweep, 2026-09-18).
    Object.assign(tank.gun.shells[1], { dmg: 500, reloadS: 2.9, count: 8 });
  }
  {
    const tank = spec(registry, 'fv510_milan');
    Object.assign(tank, { hp: 1750, enginePowerHp: 650 });
    Object.assign(tank.gun, { reloadS: 0.6, baseAccuracy: 0.29, aimTimeS: 1.3 });
    Object.assign(tank.gun.shells[0], {
      dmg: 88, pen100Mm: 120, pen1000Mm: 108, pen2000Mm: 96, reloadS: 0.6,
    });
    Object.assign(tank.gun.shells[2], {
      dmg: 520, pen100Mm: 850, pen1000Mm: 850, pen2000Mm: 850,
    });
  }
  {
    const tank = spec(registry, 'ua_m2a3_bradley');
    Object.assign(tank, {
      hp: 2150, enginePowerHp: 670, topSpeedKmh: 61, reverseSpeedKmh: 22,
    });
    Object.assign(tank.gun, { reloadS: 0.38, baseAccuracy: 0.29, aimTimeS: 1.3 });
    Object.assign(tank.gun.shells[0], {
      dmg: 68, pen100Mm: 165, pen1000Mm: 150, pen2000Mm: 135, reloadS: 0.38,
    });
    armor(registry, 'ua_m2a3_bradley', 1.3);
  }
  {
    const tank = spec(registry, 'raiju_ifv');
    tank.hp = 2700;
    Object.assign(tank.gun, { reloadS: 0.46, baseAccuracy: 0.23, aimTimeS: 0.95 });
    Object.assign(tank.gun.shells[0], {
      dmg: 120, pen100Mm: 240, pen1000Mm: 220, pen2000Mm: 200, reloadS: 0.46,
    });
    Object.assign(tank.gun.shells[1], {
      dmg: 720, pen100Mm: 950, pen1000Mm: 950,
    });
    tank.gun.shells[2].reloadS = 0.46;
    armor(registry, 'raiju_ifv', 1.08);
  }

  // Strong but no longer runaway peer packages.
  {
    const tank = spec(registry, 'leo2a4');
    tank.hp = 2300;
    tank.gun.reloadS = 6.1;
    armor(registry, 'leo2a4', 0.78);
  }
  {
    const tank = spec(registry, 'leo2a4m');
    tank.hp = 2725;
    tank.gun.reloadS = 6.1;
    armor(registry, 'leo2a4m', 0.96);
  }
  {
    const tank = spec(registry, 'leo2a4m_can');
    tank.hp = 2500;
    tank.gun.reloadS = 6.2;
    primary(registry, 'leo2a4m_can', { damage: 510, pen100: 720, pen1000: 665, pen2000: 610 });
    armor(registry, 'leo2a4m_can', 1.2);
  }
  {
    const tank = spec(registry, 'type10b');
    tank.gun.reloadS = 5.2;
    primary(registry, 'type10b', { damage: 540, pen100: 900, pen1000: 820, pen2000: 740 });
  }

  // Shared Soviet-derived fire-control floor. These retain looser handling
  // than Western peers without falling outside the complete tier envelope.
  for (const id of [
    'pt91a_twardy', 'pt91m', 't64bv1', 't72b3m_2022', 't72m1_jaguar', 't64bv_donbas', 't64bm1m', 't64bv', 't64b1v_2022', 'pt64_tur',
  ]) {
    Object.assign(spec(registry, id).gun, { baseAccuracy: 0.33, aimTimeS: 2 });
  }
  Object.assign(spec(registry, 'object148_proto').gun, { baseAccuracy: 0.29, aimTimeS: 1.8 });

  // Last, over every armour scale above: the turret shapes 235 corrected keep their frontal protection.
  for (const [id, factor] of Object.entries(TURRET_FRONT_COMPENSATION)) turretFront(registry, id, factor);
}

/** Sets a cannon's cadence: the gun's reload and every unguided round's. */
function cannonReload(registry: TankSpecRegistry, id: string, reloadS: number): void {
  const gun = spec(registry, id).gun;
  gun.reloadS = reloadS;
  for (const round of gun.shells) if (!round.guided) round.reloadS = reloadS;
}

/**
 * 2026-10-25 (owner: "properly label next gen vs modern"; taxonomy.ts): the IFVs relabelled modern leave the
 * next-generation envelope for their modern Tier X peers (balanceAudit.ts). The KF41 Lynx, the CV90 Mk IV and the Type 89
 * took the Raijū's next-generation cannon package by combat-donor synchronization: they keep its rounds at the modern
 * IFV cadence, the KF41's 35 mm pierces like the SPz Wotan's, and the Type 89's older 35 mm KDE round and the Borsuk's and
 * LRMV's 30 mm pierce like the Marder 2's. The CV90 Mk IV concept's 50 mm cycles slower and pierces a little less, still
 * the modern group's strongest round. Runs after the donor synchronization (fleetRegistration.ts), which would copy the
 * Raijū's package back, and before the tactical role balance.
 */
export function applyModernEraFold(registry: TankSpecRegistry): void {
  for (const id of ['kf41_lynx', 'cv90_mk4', 'type89']) cannonReload(registry, id, 0.55);
  cannonReload(registry, 'cv90_mk4_concept', 0.66);
  primary(registry, 'cv90_mk4_concept', { pen100: 280, pen1000: 258, pen2000: 236 });
  primary(registry, 'kf41_lynx', { pen100: 210, pen1000: 192, pen2000: 174 });
  for (const id of ['type89', 'lrmv_lynx', 'borsuk']) primary(registry, id, { pen100: 185, pen1000: 170, pen2000: 155 });
  // no longer the Raijū's tuning, so no longer its balance peer
  delete spec(registry, 'type89').balancePeerOf;
}

/**
 * 2026-10-26 (258): matchmaking reads the shown tier (tier.ts), so the audit groups every vehicle with its shown-tier
 * peers (balanceAudit.ts). Six sat just under a peer floor there; each is lifted just over it, to about two thirds of its
 * group's median: the BMPT Terminator 2's 30 mm and the Marder 1A3's 20 mm rounds, the Centurion 5/2's and Merkava 2B's
 * engines, the T-80BV's aim and the Upiór's hull and round. Runs with the era fold, before the tactical role balance.
 */
export function applyShownTierFloors(registry: TankSpecRegistry): void {
  primary(registry, 'bmpt_terminator2', { pen100: 125, pen1000: 112, pen2000: 100 });
  primary(registry, 'marder1a3', { pen100: 76, pen1000: 68, pen2000: 60 });
  spec(registry, 'centurion5_2').enginePowerHp = 880;
  spec(registry, 'merkava2b').enginePowerHp = 1060;
  const t80bv = spec(registry, 't80bv');
  t80bv.gun.aimTimeS = Math.round(t80bv.gun.aimTimeS * 0.93 * 100) / 100;
  spec(registry, 'upior').hp = 1820;
  primary(registry, 'upior', { pen100: 158, pen1000: 143, pen2000: 128 });
}

/**
 * 2026-10-26 (259, Main's IV/VII balance round): same-tier fairness at the shown tiers IV and VII, measured by the
 * same-tier MBT round robin on the balance range (balanceSimulation.ts: six seeds, both range ends, 120 m, the
 * centre-of-mass aim). That aim meets a low Soviet-pattern turret on its mantlet or its sloped roof and a taller Western
 * tank on its glacis, so the Soviet line bounced while every Western round went through.
 * - Tier IV: the T-64BV, T-72M1, PT-91M and T-80B take a thicker mantlet, the pen to bite a Western glacis, a quicker
 *   autoloader and hull. The FV4034's turret compensation and the Chieftain Mk 9's armour bonus, both set against the
 *   251 tier-8 rounds, are trimmed; the Mk 10, its second-wave rebuild, keeps its cycle and hull. The C1 pre-series
 *   takes the Chieftain's round.
 * - Tier VII: the C2 Ariete pair brought Tier X armour (the 251 table) down to VII and is trimmed to it. The C2 keeps
 *   its cadence over the C1 (arieteModernSpecs) and fires its prototype's rounds, so the Hetmans' Relikt cheeks no
 *   longer shut it out; the prototype cycles slower and (261) carries 2,200 HP. The T-72B3 Sich's weaker donor hull takes hull and a quicker
 *   autoloader; the Husarz and the Wilk take hull.
 * Runs after the shown-tier floors, before the tactical role balance.
 */
export function applySameTierFairness(registry: TankSpecRegistry): void {
  // Tier IV: the Soviet-pattern 125 mm line against the Chieftain, the FV4034 and the C1 pre-series
  // 262: the T-64BM1M and the T-64B1V mod. 2022 join the Soviet-pattern line at IV with the mod. 2017's footing
  for (const id of ['t64bv_donbas', 't64bm1m', 't64b1v_2022', 'pt64_tur', 't72m1_jaguar', 'pt91m', 't80b']) mantlet(registry, id, 1.45);
  for (const id of ['t64bv_donbas', 't64bm1m', 't64b1v_2022', 'pt64_tur', 't72m1_jaguar']) {
    primary(registry, id, { pen100: 780, pen1000: 709, pen2000: 639 });
    spec(registry, id).hp = 2150;
  }
  primary(registry, 'pt91m', { pen100: 790, pen1000: 730, pen2000: 647 });
  primary(registry, 't80b', { pen100: 760, pen1000: 691, pen2000: 622 });
  for (const id of ['pt91m', 't80b']) spec(registry, id).hp = 2300;
  spec(registry, 't80b').gun.aimTimeS = 1.85;
  for (const id of ['t64bv_donbas', 't64bm1m', 't64b1v_2022', 'pt64_tur', 't72m1_jaguar']) cannonReload(registry, id, 6.2);
  cannonReload(registry, 't80b', 6.2);
  cannonReload(registry, 'pt91m', 6.0);
  // the FV4034's turret compensation (TURRET_FRONT_COMPENSATION) was set against the 251 tier-8 median round
  turretFront(registry, 'fv4034', 0.85);
  spec(registry, 'fv4034').hp = 2000;
  // the Mk 9's 1.5 armour (applyFleetBalancePass) made it a protected Tier VIII MBT; at IV it keeps 1.32
  armor(registry, 'chieftain_mk9', 0.88);
  // the Mk 10 is the Mk 9's second-wave rebuild and keeps its weapon and hull (sourceXSecondWave)
  for (const id of ['chieftain_mk9', 'chieftain_mk10']) {
    cannonReload(registry, id, 7.0);
    spec(registry, id).hp = 2000;
  }
  cannonReload(registry, 't80bv', 7.4);
  spec(registry, 't80bv').hp = 2100;
  cannonReload(registry, 'leo2a3', 6.4);
  // 260 (a balance trim, not fidelity): IV fairness; no sourced period round defeats the basic package's turret front
  turretFront(registry, 'leo2a3', 0.9);
  primary(registry, 'c1_ariete_preserie', { pen100: 700, pen1000: 637, pen2000: 573 });
  cannonReload(registry, 'c1_ariete_preserie', 6.0);
  spec(registry, 'c1_ariete_preserie').hp = 2300;

  // Tier VII: the C2 Ariete pair against the modernized T-72B3/T-80U line
  armor(registry, 'c2_ariete', 0.65);
  spec(registry, 'c2_ariete').hp = 2400;
  // the C2 fires its prototype's rounds (Main ruling 2026-10-26: the 120/44 takes standard NATO rounds and no new-round
  // procurement is named; arieteModernSpecs.selftest cites it). Copied before the prototype's cadence below, so the C2
  // keeps its own 5.4 s cycle.
  spec(registry, 'c2_ariete').gun.shells = structuredClone(spec(registry, 'c2_ariete_proto').gun.shells);
  cannonReload(registry, 'c2_ariete_proto', 6.3);
  spec(registry, 'c2_ariete_proto').gun.aimTimeS = 1.6;
  armor(registry, 'c2_ariete_proto', 0.7);
  // 261 (Main's carried pairs: 12-0 over the T-90 with consumables, 0.83 over the Wilk): its 2,600 HP was the C2's
  // and more; 2,200, under the production C2, lets the T-90's and the B3 line's rounds kill it in four hits, not five.
  // Its row over 48 games (24 seeds) 10/14 -> 14/14 fair; no armour trim (259 ruling) and its rounds stay the C2's.
  spec(registry, 'c2_ariete_proto').hp = 2200;
  spec(registry, 't72b3_sich').hp = 2850;
  // the gun's cadence only: its rounds stay the T-90SM's (ammunitionFlow) and carry none of their own
  spec(registry, 't72b3_sich').gun.reloadS = 6.0;
  for (const id of ['t80u_husarz', 't72b3m_wilk']) spec(registry, id).hp = 2650;

  // 263 (Main's ruling, the balance lane's minimal levers for 263's new balanceMatchups reds; FAIRNESS-263's other
  // levers go to the owner): the C1 Ariete's ~730 mm gun face topped VI at 0.92 and shut out the XK2 on the move
  // (k2-tier9-mobile-peer 0); its gun and hull stay its serie-1 donor's (sourceXSecondWave), so its mantlet and turret
  // front take the trim.
  mantlet(registry, 'c1_ariete', 0.6);
  turretFront(registry, 'c1_ariete', 0.85);
  // the FV4030/6's sleek turret read its gun face under every VIII round (tier9-rifled-peers' FV row 0.105): x1.4
  // holds it (0.538). The Challenger 1 marks on the Mk 3's build sit in band unlevered (the Mk 2 v 2A4M CAN 0.625).
  mantlet(registry, 'challenger_x_sleek', 1.4);
  // the Challenger 1 Mk 1, Mk 2 and Mk 3 share the Mk 3's turret, whose sloped gun-face cells read the 624 mm slot and
  // the 682 mm cheeks at ~1,020 mm effective (0.87-0.88, 8-9 of 34 in band); x0.7 brings the three to 0.55 (16 of 34)
  for (const id of ['challenger1_mk1', 'challenger1_mk2', 'challenger1_mk3']) turretFront(registry, id, 0.7);

  // 264 (Main's ruling): the Leopard 2A6 UA is drawn on the source-measured 2A6's shell, but kept its Leopard 2A6M
  // donor's plates (x1.06), HP and cadence: about 1.72x the 2A6's KE on the same cells, so it topped IX at 0.86 (6 of 35
  // in band). It takes the 2A6's main plates, HP and loader cadence (same gun and rounds); its Kontakt-1 kit stays its
  // own. 0.60, 22 of 35 in band, as the 2A6 (0.60).
  mainArmorFrom(registry, 'leo2a6_ua', 'leo2a6');
  spec(registry, 'leo2a6_ua').hp = spec(registry, 'leo2a6').hp;
  cannonReload(registry, 'leo2a6_ua', spec(registry, 'leo2a6').gun.reloadS);
}

