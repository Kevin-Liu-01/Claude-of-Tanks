// Frontline Assault's battlefield variant on the authority (destruction core lane, 2026-10-08; the coordinator's layout
// identity ruling): every client builds the map with its trench system carved and its works dressed (world/map.ts
// 'assault-trenches'), and the authority now plays exactly that — the variant's own collision manifest
// (`<map>@assault-trenches.json`, built in Node from the variant's config) over the variant's own height field, in the
// dedicated host and in the browser host alike. Before, both built the base map: hulls on uncarved ground, the sectors
// at the axis fractions instead of on the carved lines, and none of the trench works' records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';
import { createAuthoritativeMatch } from '../../sim/authoritativeMatch.ts';
import { terrainVariantFor, matchRulesetFor } from '../../sim/matchRuleset.ts';
import { GAME_MODE_IDS } from '../../sim/matchModes.ts';
import { assaultTrenchCarveDepth } from '../../sim/assaultLines.ts';
import { createHeightField } from '../../world/terrain.ts';
import { getMapConfig } from '../../world/maps/index.ts';
import { loadCollisionWorld, collisionManifestFileName } from './worldCollision.ts';
import { createAuthorityObstacles } from '../presentation/authorityObstacles.ts';

const MAP = 'verdant';
const VARIANT = 'assault-trenches';

// ---- the mode table names the variant; no other mode plays one
for (const mode of GAME_MODE_IDS) {
  assert.equal(terrainVariantFor(mode), mode === 'frontline_assault' ? VARIANT : null, `${mode}'s variant`);
  assert.equal(matchRulesetFor(mode).terrainVariant, terrainVariantFor(mode));
}

// ---- the dedicated host: the variant's manifest over the variant's field
const base = createDedicatedWorldCollision(MAP);
const trenches = createDedicatedWorldCollision(MAP, { variant: VARIANT });
const plan = trenches.heightField.assaultTrenchLines;
assert.ok(plan?.lines?.length >= 1 && plan.sectors?.length === 3, 'the variant field carries the trench plan (its sectors index-aligned)');
assert.equal(base.heightField.assaultTrenchLines ?? null, null, 'the base field carries none');
const reference = createHeightField(1337, { ...getMapConfig(MAP), assaultTrenches: true });
let carved = 0;
for (const line of plan.lines) {
  for (const t of [-0.4, 0, 0.4]) {
    const x = line.x + line.lx * line.halfLengthM * t, z = line.z + line.lz * line.halfLengthM * t;
    assert.equal(trenches.heightField.getHeightAt(x, z), reference.getHeightAt(x, z), 'the variant field is the clients\'');
    if (assaultTrenchCarveDepth(x, z, plan) > 0.5) {
      carved++;
      assert.ok(base.heightField.getHeightAt(x, z) - trenches.heightField.getHeightAt(x, z) > 0.5, 'the trench is dug');
    }
  }
}
assert.ok(carved >= 3, `points on the trench floors (${carved})`);
const kinds = (world) => world.getObstacles().reduce((count, r) => ({ ...count, [r.kind]: (count[r.kind] ?? 0) + 1 }), {});
const variantKinds = kinds(trenches), baseKinds = kinds(base);
assert.ok((variantKinds.barbedwire ?? 0) > (baseKinds.barbedwire ?? 0) && (variantKinds.sandbagwall ?? 0) > (baseKinds.sandbagwall ?? 0),
  `the trench works' records (wire ${baseKinds.barbedwire ?? 0} -> ${variantKinds.barbedwire}, sandbag walls ${baseKinds.sandbagwall ?? 0} -> ${variantKinds.sandbagwall})`);

// ---- the authority on it: the sectors on the carved lines (the plan lays its lines at the axis fractions, so the base
// world's fallback stands at the same points: what it lacked was the dug ground and the works round them)
const players = [
  { id: 'a', specId: 'm1a2', team: 'alpha' },
  { id: 'b', specId: 't90m', team: 'bravo' },
];
const sectors = (world) => {
  const match = createAuthoritativeMatch({ mapId: MAP, seed: 4, countdownS: 0, gameMode: 'frontline_assault', worldCollision: world, players });
  return match.modeController.state.zones.map((zone) => [zone.x, zone.z]);
};
const onVariant = sectors(trenches), onBase = sectors(base);
// a sector the terrain dropped is null in the plan, and the authority places that one at its axis fraction
const carvedSectors = plan.sectors;
assert.equal(onVariant.length, carvedSectors.length);
let onLines = 0;
onVariant.forEach(([x, z], i) => {
  if (!carvedSectors[i]) { assert.ok(Math.hypot(x - onBase[i][0], z - onBase[i][1]) < 1e-6, `sector ${i + 1}: no line, the fraction`); return; }
  onLines++;
  assert.ok(Math.hypot(x - carvedSectors[i].x, z - carvedSectors[i].z) < 1e-6, `sector ${i + 1} on its carved line`);
});
assert.ok(onLines >= 1, `sectors on carved lines (${onLines})`);

// ---- the browser host: the same manifest and field, fetched as the build serves them
const directory = new URL('../../../server/world-collision-manifests/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', directory), 'utf8'));
const entry = index.variants?.[VARIANT]?.[MAP];
assert.ok(entry, 'the index lists the variant');
const served = new Map([
  ['/mp-collision/index.json', readFileSync(new URL('index.json', directory))],
  [`/mp-collision/${collisionManifestFileName(MAP, entry.sha256, VARIANT)}`, readFileSync(new URL(`${MAP}@${VARIANT}.json`, directory))],
]);
assert.equal(collisionManifestFileName(MAP, entry.sha256, VARIANT), `${MAP}@${VARIANT}.${entry.sha256.slice(0, 12)}.json`);
const fetchImpl = async (url) => {
  const bytes = served.get(url);
  return { ok: !!bytes, status: bytes ? 200 : 404, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    json: async () => JSON.parse(bytes.toString('utf8')) };
};
const hosted = await loadCollisionWorld(MAP, '/mp-collision', { fetchImpl, variant: VARIANT });
assert.equal(hosted.getObstacles().length, trenches.getObstacles().length, 'the browser host plays the same records');
assert.ok(hosted.getObstacles().every((r, i) => r.kind === trenches.getObstacles()[i].kind
  && r.min.every((v, k) => v === trenches.getObstacles()[i].min[k])));
for (const [x, z] of carvedSectors.filter(Boolean).map((s) => [s.x, s.z])) {
  assert.equal(hosted.heightField.getHeightAt(x, z), trenches.heightField.getHeightAt(x, z), 'over the same carved field');
}
const core = readFileSync(new URL('./matchHostCore.ts', import.meta.url), 'utf8');
assert.match(core, /loadCollisionWorld\(config\.mapId, config\.manifestBase, \{ variant: terrainVariantFor\(config\.mode\) \}\)/,
  'the browser host builds the mode\'s variant');
const actor = readFileSync(new URL('../../../server/match/matchActor.ts', import.meta.url), 'utf8');
assert.match(actor, /createDedicatedWorldCollision\(mapId, \{ retain: true, variant: terrainVariantFor\(mode\) \}\)/, 'and the dedicated actor');
// the clients choose the battlefield from the same table (no mode literal: the solo battle and the network session)
const main = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
const session = readFileSync(new URL('../session/browserComposition.ts', import.meta.url), 'utf8');
assert.equal((main.match(/pendingTerrainVariant = terrainVariantFor\(/g) ?? []).length, 2, 'the solo battle reads the mode\'s variant');
assert.match(session, /const terrainVariant: TerrainVariant = terrainVariantFor\(active\.mode\)/, 'and the network session');
for (const source of [main, session]) assert.doesNotMatch(source, /'frontline_assault' \? 'assault-trenches'/);

// ---- a client's variant world shares the authority's indices now, a phone's too (it places what the desktop places)
assert.equal(createAuthorityObstacles({ layoutTier: 'desktop', terrainVariant: VARIANT, getObstacles: () => [] }).shared, true);
assert.equal(createAuthorityObstacles({ layoutTier: 'mobile', terrainVariant: VARIANT, getObstacles: () => [] }).shared, true);

console.log(`frontlineVariant: Frontline plays '${VARIANT}' (no other mode a variant); the dedicated and browser hosts build `
  + `${MAP}'s variant manifest (${trenches.getObstacles().length} obstacles, wire ${variantKinds.barbedwire}, sandbag walls `
  + `${variantKinds.sandbagwall}) over the carved field (${carved} trench-floor points checked), and the authority's `
  + `sectors sit on the carved lines (${onLines} of ${onVariant.length}; a dropped line keeps its fraction) PASS`);
