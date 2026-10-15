// planFallbacks.selftest.mjs — no battlefield places the plan's warehouse, depot or shed (props census #4, lane B
// 2026-10-14; the coordinator's ruling): the regional kits draw those plots everywhere a kit stands, and the three
// kitless maps that still fall back to the plan builders (railKit makeWarehouse, villageKit makeDepot, railKit makeShed)
// are the ones whose kits land in 225 (goral on winter, tselina on steppe, nordland on fjord). The allowlist fails both
// ways: a map outside it placing a fallback, and a map on it that no longer needs its exception (prune it then).
import assert from 'node:assert/strict';
import { MAP_IDS } from './mapIds.ts';
import { getMapConfig } from './index.ts';
import { resolveRegionalArchitecture } from './regional/index.ts';

const FALLBACKS = new Set(['warehouse', 'depot', 'shed']);
/** map -> why it may still place a plan fallback (each entry is removed when its kit lands) */
const ALLOW = new Map([
  ['winter', 'looks-goral (225): the tartak and the board store take the depot and warehouse plots'],
  ['steppe', 'looks-tselina (225): the grain store and the machine shed take the warehouse, depot and shed plots'],
  ['fjord', 'looks-nordland (225): the lager takes the warehouse and depot plots'],
]);

const placing = new Map();
for (const id of MAP_IDS) {
  const P = getMapConfig(id).props ?? {};
  const kit = P.architecture ? resolveRegionalArchitecture(P.architecture) : null;
  const kinds = [...(P.plan ?? []), ...(P.plannedSites ?? []).map((s) => s.structure), ...(P.townPlan ?? []).map((t) => t.structure)];
  const fallbacks = [...new Set(kinds.filter((k) => FALLBACKS.has(k) && !kit?.builders?.[k]))];
  if (fallbacks.length) placing.set(id, fallbacks);
}
for (const [id, kinds] of placing) {
  assert.ok(ALLOW.has(id), `${id} places the plan's ${kinds.join(', ')} (no kit builder for them): give its kit the builders, or (with a ruling) allowlist it`);
}
for (const [id, why] of ALLOW) {
  assert.ok(placing.has(id), `${id} no longer places a plan warehouse/depot/shed (${why}): remove its allowlist entry`);
}
console.log(`plan fallbacks: ${[...placing].map(([id, k]) => `${id} (${k.join(', ')})`).join('; ') || 'none'} — each allowlisted until its kit lands`);
