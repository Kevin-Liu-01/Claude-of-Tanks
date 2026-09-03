#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BALANCE_SCENARIOS } from '../src/vehicles/balanceScenarios.ts';
import { runBalanceSeries } from '../src/vehicles/balanceSimulation.ts';
import {
  FLEET_BALANCE_REVISION,
  sustainedPrimaryDpm,
} from '../src/vehicles/balanceAudit.ts';
import { TANK_SPECS } from '../src/vehicles/specs.ts';
import { tankTier } from '../src/vehicles/tier.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptPath = path.join(root, 'docs', 'balance', 'deterministic-matchups.json');
const update = process.argv.includes('--update');
const check = process.argv.includes('--check');
const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
};
const numericArg = (name, { integer = false, minimum = 0 } = {}) => {
  const raw = argValue(name);
  if (raw == null) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || (integer && !Number.isInteger(value))) {
    throw new Error(`--${name} must be ${integer ? 'an integer' : 'a number'} >= ${minimum}`);
  }
  return value;
};

if (process.argv.includes('--help')) {
  console.log(`Usage:
  node tools/balance-matchups.mjs
  node tools/balance-matchups.mjs --check | --update
  node tools/balance-matchups.mjs --a=<tank-id> --b=<tank-id> [options]

Custom series options:
  --seeds=101,211       deterministic seeds (each runs from both range ends)
  --distance=120        starting separation in metres
  --duration=90         maximum duel duration in seconds
  --advance-to=60       drive toward the opponent until this separation
  --a-shell=1           A ammunition slot, one-based
  --b-shell=1           B ammunition slot, one-based`);
  process.exit(0);
}

const customA = argValue('a');
const customB = argValue('b');
if (customA != null || customB != null) {
  if (update || check) throw new Error('custom --a/--b series cannot be combined with --check or --update');
  if (!customA || !customB) throw new Error('custom series requires both --a=<tank-id> and --b=<tank-id>');
  if (!TANK_SPECS[customA]) throw new Error(`unknown tank id for --a: ${customA}`);
  if (!TANK_SPECS[customB]) throw new Error(`unknown tank id for --b: ${customB}`);
  const seedsRaw = argValue('seeds');
  const seeds = seedsRaw == null ? undefined : seedsRaw.split(',').map((value) => Number(value));
  if (seeds?.length === 0 || seeds?.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error('--seeds must be a comma-separated list of non-negative integers');
  }
  const aShell = numericArg('a-shell', { integer: true, minimum: 1 });
  const bShell = numericArg('b-shell', { integer: true, minimum: 1 });
  const customReceipt = {
    schemaVersion: 1,
    simulation: {
      fixedStepHz: 60,
      range: 'flat obstacle-free hard terrain',
      orientationsPerSeed: 2,
    },
    series: runBalanceSeries({
      aId: customA,
      bId: customB,
      seeds,
      distanceM: numericArg('distance', { minimum: 1 }),
      durationS: numericArg('duration', { minimum: 1 }),
      advanceToM: numericArg('advance-to', { minimum: 1 }),
      aShellSlot: aShell == null ? undefined : aShell - 1,
      bShellSlot: bShell == null ? undefined : bShell - 1,
    }),
  };
  process.stdout.write(`${JSON.stringify(customReceipt, null, 2)}\n`);
  process.exit(0);
}

const maximumArmor = (plates, channel) => Math.max(0, ...plates
  .filter((plate) => plate.kind !== 'external')
  .map((plate) => Number(plate[channel]) || 0));
const revisedVehicles = Object.keys(FLEET_BALANCE_REVISION).sort().map((id) => {
  const spec = TANK_SPECS[id];
  const primary = spec.gun.shells[0];
  return {
    id,
    revision: FLEET_BALANCE_REVISION[id],
    tier: tankTier(id),
    era: spec.era,
    role: spec.role,
    hp: spec.hp,
    powerWeight: round(spec.enginePowerHp / spec.weightTons),
    speedKmh: [spec.topSpeedKmh, spec.reverseSpeedKmh],
    traverseDegS: [spec.hullTraverseDegS, spec.turretTraverseDegS],
    primary: {
      damage: primary.dmg,
      penetrationMm: [primary.pen100Mm, primary.pen1000Mm, primary.pen2000Mm ?? null],
      reloadS: spec.gun.reloadS,
      sustainedDpm: round(sustainedPrimaryDpm(spec)),
      accuracy: spec.gun.baseAccuracy,
      aimTimeS: spec.gun.aimTimeS,
    },
    armorCeilingsMm: {
      hullKe: maximumArmor(spec.armor.hullPlates, 'keMm'),
      turretKe: maximumArmor(spec.armor.turretPlates, 'keMm'),
    },
    guidedWeapons: spec.gun.shells.filter((round) => round.guided === true).map((round) => ({
      name: round.name,
      damage: round.dmg,
      penetrationMm: round.pen100Mm,
      reloadS: round.reloadS ?? spec.gun.reloadS,
      count: round.count ?? null,
      velocityMps: round.velocityMps,
    })),
  };
});
const scenarios = BALANCE_SCENARIOS.map(({ id, purpose, minAScore, maxAScore, ...options }) => ({
  id,
  purpose,
  band: [minAScore ?? 0, maxAScore ?? 1],
  ...runBalanceSeries(options),
}));
const receipt = {
  schemaVersion: 1,
  simulation: {
    fixedStepHz: 60,
    range: 'flat obstacle-free hard terrain',
    orientationsPerSeed: 2,
    systems: ['gun laying', 'dispersion', 'armor', 'modules', 'fire', 'ammunition', 'damage'],
  },
  revisedVehicles,
  scenarios,
};
const serialized = `${JSON.stringify(receipt, null, 2)}\n`;

if (update) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, serialized);
  console.log(`balance-matchups: updated ${path.relative(root, receiptPath)} ` +
    `(${revisedVehicles.length} revisions, ${scenarios.length} scenarios)`);
} else if (check) {
  const existing = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath, 'utf8') : '';
  if (existing !== serialized) {
    console.error('balance-matchups: deterministic receipt is stale; run npm run balance:update');
    process.exitCode = 1;
  } else {
    console.log(`balance-matchups: receipt current ` +
      `(${revisedVehicles.length} revisions, ${scenarios.length} scenarios)`);
  }
} else {
  process.stdout.write(serialized);
}
