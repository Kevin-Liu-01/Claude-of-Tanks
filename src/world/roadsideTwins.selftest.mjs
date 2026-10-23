// roadsideTwins.selftest.mjs — (the destructible-kits lane, 2026-10-11, ported by the maps-restyle lane 2026-10-22; the coordinator's fairness ask: map revival's
// railyard r3 failed fairness 26-14 on four untwinned roadside light buildings and two untwinned hulks near the centre)
// A map that declares props.rotationalCentre stands its roadside light buildings and random hulks in 180-degree twins:
// built in Node (the shards' seeds), every light building the roadside pass placed and every hulk on the map has a
// twin of its kind (a hulk its donor) at its seat turned about the centre, yawed half round; the pass places the first
// half of the kinds (rounded up); the paired beats' wrecks share a donor; and the twin paths are gated on the
// declaration, so a map without one draws exactly as before (collisionManifestDrift holds every undeclared map's shard).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWorldCollisionData } from '../../tools/headlessWorldCollision.mjs';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';

const LIGHT = new Set(Object.keys(DESTRUCTIBLE_BUILDING_TYPES));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// the declarations, each at the point its beats pair about (the maps-restyle lane, 2026-10-22: Sirocco Wadi first, its
// item 77 pass; the other paired maps declare with their own passes)
const declared = MAP_IDS.filter((id) => getMapConfig(id).props?.rotationalCentre);
for (const id of ['desert']) assert.ok(declared.includes(id), `${id} declares its rotation centre`);
for (const id of declared) {
  const cfg = getMapConfig(id), [cx, cz] = cfg.props.rotationalCentre;
  const beats = cfg.props.tacticalBeats ?? [];
  for (const b of beats) {
    assert.ok(beats.some((o) => Math.hypot(2 * cx - b.x - o.x, 2 * cz - b.z - o.z) < 1), `${id}: its beats pair about [${cx}, ${cz}]`);
  }
  assert.ok(!cfg.props.townLightPlan, `${id}: a recorded light plan would win over the twin pass (none here)`);
}

// one map built: every light building of the roadside pass and every hulk twinned
{
  const id = 'desert', cfg = getMapConfig(id), [cx, cz] = cfg.props.rotationalCentre;
  const beats = cfg.props.tacticalBeats ?? [];
  let light = [], hulks = [];
  await buildWorldCollisionData(id, { inspect: ({ dressing }) => {
    light = (dressing.destructibles ?? []).filter((r) => LIGHT.has(r.kind) && r.slot >= 0)
      .filter((r) => !beats.some((b) => Math.hypot(r.x - b.x, r.z - b.z) < 4))
      .map((r) => ({ kind: r.kind, x: r.x, z: r.z, yaw: r.yaw }));
    hulks = (dressing.tankWreckSpots ?? []).map((s) => ({ kind: s.specId, x: s.x, z: s.z, yaw: s.yaw }));
  } });
  const twinned = (r, list) => list.some((o) => o !== r && o.kind === r.kind
    && Math.hypot(o.x - (2 * cx - r.x), o.z - (2 * cz - r.z)) < 0.3 && Math.abs(wrap(o.yaw - r.yaw - Math.PI)) < 1e-3);
  const kinds = cfg.props.destructibleBuildings;
  assert.equal(light.length, 2 * Math.ceil(kinds.length / 2), `${id}: the first half of its ${kinds.length} kinds, each a pair (${light.length} placed)`);
  assert.deepEqual([...new Set(light.map((r) => r.kind))].sort(), kinds.slice(0, Math.ceil(kinds.length / 2)).sort(), `${id}: the pairs are the list's first half`);
  for (const r of light) assert.ok(twinned(r, light), `${id}: ${r.kind} at ${r.x.toFixed(1)}, ${r.z.toFixed(1)} has its twin`);
  assert.ok(hulks.length >= 4, `${id}: hulks placed (${hulks.length})`);
  for (const r of hulks) assert.ok(twinned(r, hulks), `${id}: the ${r.kind} hulk at ${r.x.toFixed(1)}, ${r.z.toFixed(1)} has its twin`);
}

// the twin paths are gated on the declaration (an undeclared map takes the old code untouched)
{
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  assert.match(props, /\n\s*if \(P\.rotationalCentre\) \{\n\s*const \[cx, cz\] = P\.rotationalCentre;/, 'the light pass twins only on a declaring map');
  assert.match(props, /const twinCentre = P\.rotationalCentre \?\? null;/, 'the hulk pass reads the same declaration');
  assert.match(props, /if \(twinCentre && !wreckSpotIsClear\(2 \* twinCentre\[0\] - px, 2 \* twinCentre\[1\] - pz\)\) return;/,
    'a road kill on a declaring map needs its twin\'s spot clear as well');
  assert.match(props, /const twin = seatWreck\(baked, 2 \* cx - seat\.x, 2 \* cz - seat\.z, seat\.yaw \+ Math\.PI, true\);/,
    'a hulk\'s twin seats exactly at its first turned, or the pair is refused');
}
console.log(`roadsideTwins.selftest: ${declared.length} maps declare their rotation centres (their beats pair there); Desert built: its roadside light buildings the first half of its kinds in twins, every hulk twinned; the twin paths gated on the declaration`);
