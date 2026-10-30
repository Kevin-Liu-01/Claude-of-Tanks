// Child of tools/test-diff.mjs balanceInputs: one tree's per-id balance inputs as JSON on stdout. First-party tooling:
// Kevin B. Liu.
//
//   node tools/test-balance-inputs-child.mjs <root>   -> { id: { tier, digests: { armour, gun, hp, mobility, size, role } } }
//
// It imports only the tree's spec registry and tier table (no builder, no tank build), as the changed-only rows child does.
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BALANCE_FIELDS } from './test-diff.mjs';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, '..'));
const load = (path) => import(pathToFileURL(join(root, path)).href);
await load('src/vehicles/fleetRegistration.ts');
const { TANK_SPECS, ALL_TANK_IDS } = await load('src/vehicles/specs.ts');
const { tankTier } = await load('src/vehicles/tier.ts');
const digest = (value) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
const out = {};
for (const id of ALL_TANK_IDS) {
  const spec = TANK_SPECS[id];
  if (!spec) continue;
  out[id] = { tier: tankTier(id), digests: Object.fromEntries(Object.entries(BALANCE_FIELDS)
    .map(([name, fields]) => [name, digest(fields.map((field) => spec[field]))])) };
}
process.stdout.write(JSON.stringify(out));
