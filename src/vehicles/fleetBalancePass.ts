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
    const tank = spec(registry, 'challenger_3');
    Object.assign(tank, { hp: 2650, topSpeedKmh: 62, reverseSpeedKmh: 24 });
    Object.assign(tank.gun, { reloadS: 5.9, baseAccuracy: 0.24, aimTimeS: 1.6 });
    primary(registry, 'challenger_3', { pen100: 880, pen1000: 810, pen2000: 730 });
  }
  {
    const tank = spec(registry, 'challenger_3x');
    Object.assign(tank, { hp: 2780, topSpeedKmh: 60, reverseSpeedKmh: 24 });
    Object.assign(tank.gun, { reloadS: 5.7, baseAccuracy: 0.22, aimTimeS: 1.5 });
    primary(registry, 'challenger_3x', { pen100: 900, pen1000: 820, pen2000: 740 });
  }

  // T-90 family.
  {
    const tank = spec(registry, 't90');
    Object.assign(tank, {
      hp: 2550, enginePowerHp: 1050, topSpeedKmh: 65, reverseSpeedKmh: 12,
      hullTraverseDegS: 42, turretTraverseDegS: 38,
    });
    Object.assign(tank.gun, { reloadS: 6.1, baseAccuracy: 0.31, aimTimeS: 1.85 });
    primary(registry, 't90', { damage: 550, pen100: 840, pen1000: 780, pen2000: 700 });
    armor(registry, 't90', 1.15);
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
    const tank = spec(registry, 'chieftain_mk10');
    Object.assign(tank, {
      hp: 2100, enginePowerHp: 900, topSpeedKmh: 50, reverseSpeedKmh: 13,
      hullTraverseDegS: 30, turretTraverseDegS: 28,
    });
    Object.assign(tank.gun, { reloadS: 6.2, baseAccuracy: 0.28, aimTimeS: 1.85 });
    primary(registry, 'chieftain_mk10', { damage: 510, pen100: 700, pen1000: 640, pen2000: 580 });
    armor(registry, 'chieftain_mk10', 1.5);
  }
  {
    const tank = spec(registry, 'centurion5');
    Object.assign(tank, {
      hp: 1900, enginePowerHp: 850, topSpeedKmh: 48, reverseSpeedKmh: 15,
      hullTraverseDegS: 32, turretTraverseDegS: 30,
    });
    Object.assign(tank.gun, { reloadS: 6.6, baseAccuracy: 0.3, aimTimeS: 2 });
    primary(registry, 'centurion5', { pen100: 570, pen1000: 525, pen2000: 480 });
    armor(registry, 'centurion5', 1.12);
  }
  {
    const tank = spec(registry, 'fv4034');
    tank.hp = 2100;
    tank.gun.reloadS = 7.4;
    armor(registry, 'fv4034', 0.9);
  }

  // K2 progression.
  {
    const tank = spec(registry, 'k2');
    tank.hp = 2700;
    tank.gun.reloadS = 5.7;
    primary(registry, 'k2', { pen100: 890, pen1000: 815, pen2000: 740 });
    armor(registry, 'k2', 1.3);
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
    const tank = spec(registry, 't62mv1');
    tank.hp = 1850;
    tank.gun.reloadS = 6.6;
    primary(registry, 't62mv1', { damage: 430, pen100: 580, pen1000: 530, pen2000: 480 });
    armor(registry, 't62mv1', 1.1);
  }
  {
    const tank = spec(registry, 'm48');
    Object.assign(tank, { hp: 2050, enginePowerHp: 900, topSpeedKmh: 50, reverseSpeedKmh: 18 });
    Object.assign(tank.gun, { reloadS: 7, baseAccuracy: 0.3, aimTimeS: 1.8 });
    primary(registry, 'm48', { damage: 450, pen100: 580, pen1000: 535, pen2000: 490 });
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
  Object.assign(spec(registry, 'type90'), {
    enginePowerHp: 1550, topSpeedKmh: 74, reverseSpeedKmh: 34,
    hullTraverseDegS: 48, turretTraverseDegS: 44,
  });
  {
    const tank = spec(registry, 't90a');
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
    const tank = spec(registry, 'spz_puma_s1');
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
    armor(registry, 'spz_puma_s1', 0.9);
  }
  {
    const tank = spec(registry, 'bmpt_t90');
    Object.assign(tank.gun.shells[1], { dmg: 500, reloadS: 3, count: 6 });
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
    const tank = spec(registry, 'type89_light_tiger');
    tank.hp = 2700;
    Object.assign(tank.gun, { reloadS: 0.46, baseAccuracy: 0.23, aimTimeS: 0.95 });
    Object.assign(tank.gun.shells[0], {
      dmg: 120, pen100Mm: 240, pen1000Mm: 220, pen2000Mm: 200, reloadS: 0.46,
    });
    Object.assign(tank.gun.shells[1], {
      dmg: 720, pen100Mm: 950, pen1000Mm: 950,
    });
    tank.gun.shells[2].reloadS = 0.46;
    armor(registry, 'type89_light_tiger', 1.08);
  }

  // Strong but no longer runaway peer packages.
  {
    const tank = spec(registry, 'leo2a6');
    tank.hp = 2300;
    tank.gun.reloadS = 6.1;
    armor(registry, 'leo2a6', 0.78);
  }
  {
    const tank = spec(registry, 'leo2a5_a5nl');
    tank.hp = 2725;
    tank.gun.reloadS = 6.1;
    armor(registry, 'leo2a5_a5nl', 0.96);
  }
  {
    const tank = spec(registry, 'leo2a4m');
    tank.hp = 2500;
    tank.gun.reloadS = 6.2;
    primary(registry, 'leo2a4m', { damage: 510, pen100: 720, pen1000: 665, pen2000: 610 });
    armor(registry, 'leo2a4m', 1.2);
  }
  {
    const tank = spec(registry, 'type10b');
    tank.gun.reloadS = 5.2;
    primary(registry, 'type10b', { damage: 540, pen100: 900, pen1000: 820, pen2000: 740 });
  }

  // Shared Soviet-derived fire-control floor. These retain looser handling
  // than Western peers without falling outside the complete tier envelope.
  for (const id of [
    'pt91_twardy', 'pt91m', 't64bv1', 't72b3m', 't72m1_jaguar', 'ua_t64bv',
  ]) {
    Object.assign(spec(registry, id).gun, { baseAccuracy: 0.33, aimTimeS: 2 });
  }
  Object.assign(spec(registry, 't14').gun, { baseAccuracy: 0.29, aimTimeS: 1.8 });
}
