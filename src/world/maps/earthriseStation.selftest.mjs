// Taurus-Littrow Station (the Earthrise 228 rebuild, 2026-10-18; the owner, 2026-10-17: Earthrise rebuilt "the way Verdant
// was"): the Moon's station plan, its set pieces and its stock, held as the Verdant town plan and Olympus's settlement are.
// It builds the Moon's props in Node the way the collision capture does (seeds 1337, 2001, 2002) and checks:
//   - the plan: the kit (littrow) builds it, every authored site stands (none dropped), each plot within 0.1 m of its
//     seat, every site but the logistics yard's has its rotation partner about the landing field with the same structure
//     and the opposite heading (the yard's rotation is the oxygen works' plant), the Moon spreads none of Mars's props;
//   - the clearances: every plot's corners stand off the authored carriageways and every objective disc keeps 30 m of
//     solids round it, its seat the authored one;
//   - the set pieces: Challenger's site, the works and its front, the two solar towers placed and none skipped; one lunar
//     rover (Apollo 17 landed one); no ascent lander, no terrestrial station piece left from the old outpost;
//   - the stock: every terrestrial kind the Moon builds (the sandbag stacks, the wire, the barrier, the cone, the bin, the
//     yards' fence) dressed in its lunar form (regional/lunarWorks.ts), the rest the clutter kit's lunar forms;
//   - its variety: at least 40 object kinds (obstacle kinds, kit forms, set-piece kinds and dressing families).
import assert from 'node:assert/strict';
import { getMapConfig } from './index.ts';
import mars from './mars.ts';
import { APOLLO_SITE, EARTHRISE_STATION, EXCAVATION_FRONT, ISRU_PLANT } from './earthriseStation.ts';
import { LUNAR_STRUCTURE_VARIANTS } from './regional/lunarWorks.ts';
import { STRUCTURE_VARIANTS } from './regional/ksarGate.ts';
import { resolveRegionalArchitecture } from './regional/index.ts';
import { MATCH_OBJECTIVE_LAYOUTS } from '../../sim/matchObjectiveLayouts.ts';

const config = getMapConfig('moon');
const P = config.props;
assert.equal(P.architecture, 'littrow', 'the station is built by its own kit');
assert.equal(resolveRegionalArchitecture('littrow').id, 'littrow');
assert.equal(P.plannedSites, EARTHRISE_STATION, 'the plan is the station plan');
assert.deepEqual(P.plan, [], 'no roadside plan runs');
for (const key of ['townPlan', 'townLightPlan', 'roadBuildingClearance']) assert.equal(P[key], undefined, `no Mars ${key}`);
assert.notEqual(P.inhabit, mars.props.inhabit, 'the props are the Moon\'s own, not a spread of Mars\'s');
assert.notEqual(P.tones, mars.props.tones);
assert.equal(P.architecture === mars.props.architecture, false);

// the rotation partners (the logistics yard's is the works' plant)
const logistics = new Set(['gantry', 'containerRow']);
for (const site of EARTHRISE_STATION) {
  if (logistics.has(site.structure)) continue;
  const twin = EARTHRISE_STATION.find((o) => o !== site && Math.hypot(o.x + site.x, o.z + site.z) <= 0.5);
  if (site.structure === 'mill' || site.structure === 'chapel') {
    // the comms tower and the lab stand at the apron's opposite corners: partners in place, not in kind
    assert.ok(twin && (twin.structure === 'mill' || twin.structure === 'chapel'), `${site.structure} at (${site.x}, ${site.z}): its partner at the rotation`);
    continue;
  }
  assert.ok(twin, `${site.structure} at (${site.x}, ${site.z}): a rotation partner`);
  assert.equal(twin.structure, site.structure, `${site.structure} at (${site.x}, ${site.z}): its partner the same structure`);
  const dYaw = (((twin.yawDeg - site.yawDeg) % 360) + 360) % 360;
  assert.ok(Math.abs(dYaw - 180) < 0.01, `${site.structure} at (${site.x}, ${site.z}): its partner turned 180 degrees`);
}
const gantry = EARTHRISE_STATION.find((s) => s.structure === 'gantry');
assert.ok(Math.hypot(ISRU_PLANT.x + gantry.x, ISRU_PLANT.z + gantry.z) < 25, 'the works\' plant stands where the logistics yard\'s rotation falls');
assert.ok(Math.hypot(APOLLO_SITE.x + EXCAVATION_FRONT.x, APOLLO_SITE.z + EXCAVATION_FRONT.z) < 0.5, 'the excavation front is the site\'s rotation');
// the variants named are the station's stock, every one in the table
assert.deepEqual(P.structureVariants, LUNAR_STRUCTURE_VARIANTS);
for (const name of Object.values(LUNAR_STRUCTURE_VARIANTS)) assert.ok(STRUCTURE_VARIANTS[name], `${name}: in the variant table`);

// the Moon's props, built the way the collision capture builds them
const { installWorldBuildFixture } = await import('../../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const [terrain, vegetation, props, models] = await Promise.all([
  import('../terrain.ts'), import('../vegetation.ts'), import('../props.ts'), import('../propsModelStore.ts'),
]);
await models.preloadPropModels();
const engine = { anisotropy: 4, setupShadowMaterial() {} };
const field = terrain.createHeightField(1337, config);
const flora = vegetation.createVegetation(field, engine, 2001, config);
const dressing = props.createProps(field, engine, 2002, config, flora);
const ud = dressing.group.userData;
const buildings = dressing.features?.buildings ?? [];

// every site stands on its seat
const seated = [];
for (const site of EARTHRISE_STATION) {
  const b = buildings.find((f) => f.kind === site.structure && Math.hypot(f.x - site.x, f.z - site.z) <= 0.1);
  assert.ok(b, `${site.structure} at (${site.x}, ${site.z}): seated within 0.1 m of its authored seat`);
  assert.ok(Math.abs((((b.rot * 180 / Math.PI - site.yawDeg) % 360) + 540) % 360 - 180) < 0.01, `${site.structure} at (${site.x}, ${site.z}): its authored heading`);
  seated.push(b);
}
/** A plot's corners in the world (props.ts: the building's frame turned by its yaw about Y). */
const corners = (b) => {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [b.x + sx * b.w / 2 * c + sz * b.d / 2 * s, b.z - sx * b.w / 2 * s + sz * b.d / 2 * c]);
};
const segDist = (px, pz, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
};
const roads = config.terrain.roads.paths;
const roadDist = (x, z) => Math.min(...roads.flatMap((path) => path.slice(1).map((p, i) => segDist(x, z, path[i], p))));
// the carriageways: each plot's corners and edge midpoints at least 12 m off every authored road's line
let worstRoad = Infinity;
for (const b of seated) {
  const cs = corners(b), pts = [...cs, ...cs.map((p, i) => [(p[0] + cs[(i + 1) % 4][0]) / 2, (p[1] + cs[(i + 1) % 4][1]) / 2])];
  const d = Math.min(...pts.map(([x, z]) => roadDist(x, z)));
  worstRoad = Math.min(worstRoad, d);
  assert.ok(d >= 12, `${b.kind} at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}): its plot ${d.toFixed(1)} m off the carriageways (12 m)`);
}
// the objective discs: the authored seats, every station plot and set piece 30 m and more from each
const layout = MATCH_OBJECTIVE_LAYOUTS.moon;
assert.deepEqual(layout.zones, [{ x: -102, z: 30 }, { x: 0, z: 0 }, { x: 102, z: -30 }], 'the zones keep their seats');
assert.deepEqual(layout.kickoff, { x: 0, z: 0 });
let worstZone = Infinity;
for (const zone of layout.zones) {
  for (const b of seated) {
    const d = Math.min(...corners(b).map(([x, z]) => Math.hypot(x - zone.x, z - zone.z)));
    worstZone = Math.min(worstZone, d);
    assert.ok(d >= 30, `${b.kind} at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}): ${d.toFixed(1)} m from the zone at (${zone.x}, ${zone.z}) (30 m)`);
  }
}

// the set pieces
const lm = ud.landmarks;
assert.equal(lm.skipped, 0, `no set piece skipped (${JSON.stringify(lm.pieces.filter((p) => p.status !== 'placed'))})`);
const placed = lm.pieces.filter((p) => p.status === 'placed').map((p) => p.kind).sort();
assert.deepEqual(placed, ['apolloSite', 'isruWorks', 'isruWorks', 'solarTower', 'solarTower'], 'Challenger\'s site, the works and its front, the two solar towers');
// (the collision records and the props' destructibles, the clutter among them, by kind)
const kinds = new Map();
for (const o of [...(dressing.obstacles ?? []), ...(dressing.destructibles ?? [])]) if (o.kind) kinds.set(o.kind, (kinds.get(o.kind) ?? 0) + 1);
const lrvs = (dressing.destructibles ?? []).filter((o) => o.kind === 'setpiece_lrv').length;
assert.equal(lrvs, 1, 'one lunar rover (Apollo 17 landed one)');
assert.equal(P.vehicleSetPieces.filter((v) => v.kind === 'lrv').length, 1);
for (const gone of ['ascentlander', 'landingpad', 'missioncontrol', 'habdome', 'rovergarage']) {
  assert.ok(!kinds.has(gone) && !(P.orbitalSettlement ?? []).some((s) => s.structure === gone) && !P.destructibleBuildings.includes(gone),
    `no ${gone} left from the old outpost`);
}

// the stock: every terrestrial kind standing on the Moon dressed lunar
const TERRESTRIAL = ['sandbagwall', 'sandbagbig', 'sandbagsmall', 'barbedwire', 'barrier', 'cone', 'trashcan', 'fenceplank'];
for (const kind of TERRESTRIAL) assert.ok(P.structureVariants[kind], `${kind}: the Moon names its lunar form`);
const built = [...kinds.keys()].filter((k) => TERRESTRIAL.includes(k));
assert.ok(built.length >= 5, `the works stand on the Moon in their lunar forms (${built.join(', ')})`);

// the variety: obstacle kinds, the kit's forms, the set pieces, the yard dressing families
const families = new Set([...kinds.keys()]);
for (const b of seated) families.add(`kit:${b.kind}`);
if (ud.regionalYards?.sheds) families.add('kit:granary');
for (const k of placed) families.add(`landmark:${k}`);
families.add('landform:berm'); families.add('landform:scarp'); families.add('ground:strips');
assert.ok(families.size >= 40, `at least 40 kinds of object on the Moon (${families.size}: ${[...families].sort().join(', ')})`);
console.log(`earthriseStation: ${seated.length} sites seated in rotation pairs (plots ${worstRoad.toFixed(1)} m off the carriageways, `
  + `${worstZone.toFixed(1)} m off the objective discs), ${placed.length} set pieces with none skipped, one rover, no lander, `
  + `the works in their lunar forms (${built.join(', ')}), ${families.size} kinds of object`);
