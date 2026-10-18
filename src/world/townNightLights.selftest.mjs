// townNightLights.selftest.mjs — a night-capable town still lights at night (the looks lane, 227; the coordinator: "Steinburg
// at night has no lit windows and no warm lamp pools on the square", live in 226). Steinburg's planned rows (10-15,
// steinburgRows.ts) returned from the street-row pass before its furniture, so the lampposts down both pavements — the
// destructible lamps whose bulbs and pools the night lighting drives — were never laid. Here:
//  1. every dwelling of the town kits (the Franconian: Steinburg; the Hessian and Lorraine towns beside it) emits lit
//     panes — curtain glass whose outward face carries the night emission mask — on the desktop build;
//  2. a town map's lamp records exist: Steinburg's props lay the street lamps (destructible 'lamp' instances, their
//     masked bulbs) and its rows' lit panes, beside the planned rows (props.townRowFurniture).
import assert from 'node:assert/strict';
import { ARCHITECTURE_STYLES, buildRegionalParts } from './maps/regional/index.ts';
import { streamFrom } from './maps/regional/geometry.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';
import { buildWorldCollisionData } from '../../tools/headlessWorldCollision.mjs';

const litVertices = (geometry) => {
  const mask = geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
  let lit = 0;
  if (mask) for (let i = 0; i < mask.count; i++) if (mask.getX(i) > 0) lit++;
  return lit;
};

// 1. the town kits' dwellings light their windows
const DWELLINGS = {
  franconian: ['rowhouse', 'cottage', 'farmhouse', 'tavern', 'schoolhouse', 'cornershop', 'palas'],
  hessian: ['cottage', 'farmhouse', 'tavern', 'schoolhouse', 'cornershop'],
  lorrain: ['rowhouse', 'cottage', 'farmhouse', 'tavern', 'schoolhouse', 'cornershop'],
};
let dwellings = 0;
for (const [kit, ids] of Object.entries(DWELLINGS)) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === kit);
  assert.ok(style, `${kit}: a regional kit`);
  for (const id of ids) {
    assert.ok(style.builders[id], `${kit}/${id}: a builder of the kit`);
    let lit = 0;
    for (const seed of [11, 29, 47, 83]) {
      const [w, d, h] = [7 + (seed % 5), 9 + (seed % 7), 6];
      const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
        wallBucket: 'plaster', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'townNightLights', snowCap: false, tier: 'desktop' },
      streamFrom(seed * 3 + 5));
      for (const g of parts.curtain ?? []) lit += litVertices(g);
      for (const list of Object.values(parts)) for (const g of list) g.dispose();
    }
    assert.ok(lit > 0, `${kit}/${id}: its windows light at night (lit pane vertices over four seeds: ${lit})`);
    dwellings++;
  }
}

// 2. Steinburg's lamp records and lit rows
let lamps = 0, panes = 0;
await buildWorldCollisionData('urban', { inspect: ({ dressing }) => {
  dressing.group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'destructible-lamp' && o.isInstancedMesh) lamps += o.count;
    if (o.name === 'props-bucket-curtain') panes += litVertices(o.geometry);
  });
} });
// (226 before the planned rows: 20 lamps; the planned rows without their furniture: 2, the town's own fixtures)
assert.ok(lamps >= 18, `Steinburg's street lamps stand down its pavements (${lamps} lamp instances; the planned rows without their furniture laid 2)`);
assert.ok(panes >= 6000, `Steinburg's rows light their windows (${panes} lit pane vertices)`);

console.log(`townNightLights.selftest: ${dwellings} town dwellings light their panes; Steinburg ${lamps} street lamps, ${panes} lit pane vertices`);
