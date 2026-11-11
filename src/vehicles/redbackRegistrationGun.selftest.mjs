// redbackRegistrationGun.selftest.mjs — the AS21 Redback's gun is the Puma S1's registration-time gun, whenever its pack
// evaluates (2026-11-08 implicit-state-machine sweep, round 8 s5-04). Copyright © 2026 Kevin B. Liu.
//
// The fleet registers in phases (fleetRegistration.ts): every spec pack evaluates on import (a clone copies its donor as
// it stands), then the passes run: the balance pass rebalances the SPz Wotan, the IFV sync copies its combat into the
// Puma S1, and later passes tune and seal. The Redback is cloned from the Puma S1 and keeps the Puma's registration-time
// gun on purpose (australiaSpecs.ts: on the Puma's final gun it lost every tier VI duel). Only import placement held
// that: a realm that evaluates australiaSpecs.ts after the passes (a pack made lazy, a facade that imports the
// registration first) cloned the synchronized Puma, and the Redback silently changed balance. It is built now on the
// snapshot ifvReplicaSpecs.ts takes as the Puma registers (PUMA_S1_REGISTRATION_GUN).
//
// A child realm imports every module fleetRegistration.ts imports except the Australian pack (read from its source, so
// the list follows the registration), runs the two passes that move the Puma (the balance pass, the IFV sync), then
// imports australiaSpecs.ts: the Redback's gun equals the Puma's gun as it registered (Spike LR2 rename aside). This
// realm runs the real registration: the Redback's combat leaves that no later pass sets are the same record.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VEHICLES = new URL('./', import.meta.url);
const at = (name) => new URL(name, VEHICLES).href;

/** The gun-level and per-round combat leaves the Redback is balanced on (names aside: its HEAT is renamed). */
const GUN_LEAVES = ['caliberMm', 'reloadS', 'aimTimeS', 'baseAccuracy'];
const ROUND_LEAVES = ['type', 'caliberMm', 'dmg', 'pen100Mm', 'pen1000Mm', 'pen2000Mm', 'velocityMps', 'moduleDmg', 'count',
  'reloadS', 'guided', 'launcherTubes'];
const leaves = (gun, gunLeaves = GUN_LEAVES) => ({
  gun: Object.fromEntries(gunLeaves.map((key) => [key, gun[key]])),
  rounds: gun.shells.map((round) => Object.fromEntries(ROUND_LEAVES.map((key) => [key, round[key]]))),
});

if (process.argv[2] === '--late-realm') {
  // ---- the child: the Australian pack evaluates after the passes that move its donor
  const source = readFileSync(new URL('fleetRegistration.ts', VEHICLES), 'utf8');
  const modules = [...source.matchAll(/^import (?:[^'"]*? from )?'\.\/([\w.]+\.ts)';/gm)].map((match) => match[1]);
  assert.ok(modules.includes('australiaSpecs.ts') && modules.includes('ifvReplicaSpecs.ts'), 'the registration names both packs');
  const { TANK_SPECS } = await import(at('specs.ts'));
  for (const name of modules) if (name !== 'australiaSpecs.ts') await import(at(name));
  assert.equal(TANK_SPECS.redback, undefined, 'the Australian pack has not evaluated yet');
  const registered = structuredClone(TANK_SPECS.puma_s1.gun);
  const { applyFleetBalancePass } = await import(at('fleetBalancePass.ts'));
  const ifv = await import(at('ifvReplicaSpecs.ts'));
  applyFleetBalancePass(TANK_SPECS);
  ifv.synchronizeIfvReplicaCombatMetadata();
  const synced = structuredClone(TANK_SPECS.puma_s1.gun);
  await import(at('australiaSpecs.ts'));
  process.stdout.write(JSON.stringify({ registered, synced, redback: TANK_SPECS.redback.gun,
    snapshot: ifv.PUMA_S1_REGISTRATION_GUN ?? null }));
  process.exit(0);
}

const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--late-realm'],
  { encoding: 'utf8', maxBuffer: 8 << 20, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048' } });
assert.equal(child.status, 0, `the late realm ran:\n${child.stderr}`);
const late = JSON.parse(child.stdout);

// ---- the case is live: the passes move the Puma's gun
assert.notDeepEqual(leaves(late.synced), leaves(late.registered), 'the balance pass and the IFV sync change the Puma S1\'s gun');
// ---- the late realm: the Redback takes the Puma's registration-time gun, not the synchronized one
assert.deepEqual(leaves(late.redback), leaves(late.registered),
  'a Redback cloned after the IFV sync still carries the Puma S1\'s registration-time gun (it carried the synchronized Puma\'s)');
assert.deepEqual(late.redback.shells.filter((round) => round.type === 'HEAT').map((round) => round.name), ['Spike LR2']);
assert.deepEqual(late.snapshot, late.registered, 'ifvReplicaSpecs.ts exports the Puma S1\'s gun as it registered');

// ---- this realm: the real registration (the pack evaluates before the passes, as fleetRegistration.ts orders it)
const { TANK_SPECS } = await import(at('specs.ts'));
await import(at('fleetRegistration.ts'));
const { PUMA_S1_REGISTRATION_GUN } = await import(at('ifvReplicaSpecs.ts'));
assert.ok(Object.isFrozen(PUMA_S1_REGISTRATION_GUN) && Object.isFrozen(PUMA_S1_REGISTRATION_GUN.shells)
  && PUMA_S1_REGISTRATION_GUN.shells.every(Object.isFrozen), 'the snapshot is frozen through');
assert.deepEqual(structuredClone(PUMA_S1_REGISTRATION_GUN), late.registered, 'both realms register the same Puma S1 gun');
// (the tactical role pass tunes baseAccuracy and the bloom; nothing later sets the gun's reload, aim time or rounds)
const unpassed = ['caliberMm', 'reloadS', 'aimTimeS'];
assert.deepEqual(leaves(TANK_SPECS.redback.gun, unpassed), leaves(late.registered, unpassed),
  'the registered Redback carries the Puma S1\'s registration-time rounds');
assert.notDeepEqual(leaves(TANK_SPECS.puma_s1.gun, unpassed), leaves(late.registered, unpassed), 'while the Puma S1 is synchronized');
console.log('redbackRegistrationGun.selftest: the Redback carries the Puma S1\'s registration-time gun whether its pack evaluates before or after the passes');
