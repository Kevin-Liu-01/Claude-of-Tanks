// planFallbacks.selftest.mjs — no battlefield places a flat plan builder (props census #4 and #13, lane B; the
// coordinator's rulings of 2026-10-14 and 2026-10-15).
//
// A plan builder is placed where a map's kit has no builder of the kind, and on Ironworks wherever its service court
// takes a donor: the court's six donors keep their plan builds whatever the kit (props.ts regionalDonor). The plan's
// warehouse, depot, shed, factory and fire station are fallbacks: each must either never be placed, or be one of the
// builders rebuilt to the standard (REBUILT, each pinned to a marker of its rebuild in its source: the plan factory's and
// warehouse's cut halls and the shed's frame). The allowlist names the kitless maps whose own kits land in 225 (goral on
// winter, tselina on steppe, nordland on fjord) for the fallbacks not rebuilt (the plan depot). It fails both ways: a map
// outside it placing a flat fallback, and a map on it that no longer needs its exception (prune it then).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP_IDS } from './mapIds.ts';
import { getMapConfig } from './index.ts';
import { resolveRegionalArchitecture } from './regional/index.ts';

const FALLBACKS = new Set(['warehouse', 'depot', 'shed', 'factory', 'firestation']);
/** fallbacks rebuilt to the standard: the source file and a marker of the rebuild in it */
const REBUILT = new Map([
  ['factory', ['urbanKit.ts', "tagCutHall(buckets, { w, d, h: wallH, t, holes: cut.holes, pieces: shell, bucket: 'stone', paint: null, units: cut.units });"]],
  ['warehouse', ['railKit.ts', "tagCutHall(buckets, { w, d, h: wallH, t, holes, pieces, bucket: steelClad ? 'structureMetal' : 'stone', paint: steelClad ? cladHex : null, units });"]],
  ['shed', ['railKit.ts', 'const under = (z: number): number => roofCenterY + Math.tan(roofAngle) * z - roofBottomOffset;']],
]);
for (const [kind, [file, marker]] of REBUILT) {
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  assert.ok(source.includes(marker), `the plan ${kind} is listed as rebuilt but ${file} no longer carries its rebuild (${marker.slice(0, 60)}…)`);
}
// the props.ts hook that cuts the catalog pass's openings on the rebuilt halls
const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
assert.equal(props.split('    settleCatalogCuts(tmp);\n').length, 3, 'props.ts settles the catalog cuts after both catalog passes (generated and replayed)');
/** map -> why it may still place a flat plan fallback (each entry is removed when its kit lands) */
const ALLOW = new Map([
  ['winter', 'looks-goral (225): the tartak takes the depot plots'],
  ['steppe', 'looks-tselina (225): the machine shed takes the depot plots'],
  ['fjord', 'looks-nordland (225): the lager takes the depot plots'],
]);

const placing = new Map(), donors = new Map();
for (const id of MAP_IDS) {
  const P = getMapConfig(id).props ?? {};
  const kit = P.architecture ? resolveRegionalArchitecture(P.architecture) : null;
  const kinds = [...(P.plan ?? []), ...(P.plannedSites ?? []).map((s) => s.structure), ...(P.townPlan ?? []).map((t) => t.structure)];
  // the service court's donors keep their plan builds whatever the kit
  const court = (P.foundryServiceCourt?.sites ?? []).map((s) => s.kind);
  const placed = [...new Set([...kinds.filter((k) => !kit?.builders?.[k]), ...court])].filter((k) => FALLBACKS.has(k));
  const flat = placed.filter((k) => !REBUILT.has(k));
  if (flat.length) placing.set(id, flat);
  if (court.length) donors.set(id, court.filter((k) => FALLBACKS.has(k)));
}
for (const [id, kinds] of placing) {
  assert.ok(ALLOW.has(id), `${id} places the plan's ${kinds.join(', ')} as flat builds (no kit builder, or a service-court donor): rebuild the builder to the standard, give the kit the builder, or (with a ruling) allowlist the map`);
}
for (const [id, why] of ALLOW) {
  assert.ok(placing.has(id), `${id} no longer places a flat plan fallback (${why}): remove its allowlist entry`);
}
console.log(`plan fallbacks: flat ones only on ${[...placing].map(([id, k]) => `${id} (${k.join(', ')})`).join('; ') || 'none'} (each allowlisted until its kit lands); `
  + `court donors on the rebuilt builders: ${[...donors].map(([id, k]) => `${id} (${k.join(', ')})`).join('; ') || 'none'}; rebuilt: ${[...REBUILT.keys()].join(', ')}`);
