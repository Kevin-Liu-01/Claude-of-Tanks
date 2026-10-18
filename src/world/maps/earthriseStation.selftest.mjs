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
import { APOLLO_SITE, EARTHRISE_STATION, EXCAVATION_FRONT, ISRU_PLANT, RELAY_REPEATERS, STATION_DOMES } from './earthriseStation.ts';
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

// (round 2, 2026-10-18; the blind critics: "no hero landmark that reads at this height", "the comm tower is a spindly
// mast") the relay mast, the station's landmark: its head 40 m and more over the apron's corner, 10 m and more over anything
// else on the valley floor
let mastNote = '';
{
  const mill = seated.find((b) => b.kind === 'mill'), gy = field.getHeightAt(mill.x, mill.z);
  let top = -Infinity, others = -Infinity;
  dressing.group.updateMatrixWorld(true);
  dressing.group.traverse((o) => {
    const pos = o.isMesh ? o.geometry?.attributes?.position : null;
    if (!pos || o.isInstancedMesh) return;
    const e = o.matrixWorld.elements;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (Math.hypot(wx - mill.x, wz - mill.z) < 6) top = Math.max(top, wy);
      else if (Math.hypot(wx, wz) < 200) others = Math.max(others, wy - field.getHeightAt(wx, wz));
    }
  });
  assert.ok(top - gy >= 40, `the relay mast's head ${(top - gy).toFixed(1)} m over its pad (40 m and more)`);
  assert.ok(top - gy > others + 10, `the mast stands 10 m and more over anything else on the floor (${others.toFixed(1)} m)`);
  mastNote = `the relay mast ${(top - gy).toFixed(1)} m (the next tallest ${others.toFixed(1)} m), `;
}

// the set pieces
const lm = ud.landmarks;
assert.equal(lm.skipped, 0, `no set piece skipped (${JSON.stringify(lm.pieces.filter((p) => p.status !== 'placed'))})`);
const placed = lm.pieces.filter((p) => p.status === 'placed').map((p) => p.kind).sort();
assert.deepEqual(placed, ['apolloSite', 'isruWorks', 'isruWorks', 'relayRepeater', 'relayRepeater', 'solarTower', 'solarTower', 'solarTower', 'solarTower', 'stationDome', 'stationDome'],
  'Challenger\'s site, the works and its front, the two solar towers on the scarps, the station\'s two power masts (round 2), its two commons and the deployments\' two relay repeaters (round 3)');

// (round 3, 2026-10-18; the blind judge from the aerial: "no strong hero landmark", "loose, with large empty gaps between
// buildings and few roads or cables linking them") the commons: a rotation pair, each 30 m and more of its footprint off
// every objective disc, its main airlock to the hub; the station's tracks: rotation pairs, laid across the open ground,
// every plot's door on one (within 4 m of a track's line), each commons' airlock and every deployment's pads linked
assert.equal(STATION_DOMES.length, 2);
assert.ok(Math.hypot(STATION_DOMES[0].x + STATION_DOMES[1].x, STATION_DOMES[0].z + STATION_DOMES[1].z) < 0.01, 'the commons a rotation pair');
for (const d of STATION_DOMES) {
  const toHub = Math.atan2(-d.x, -d.z) * 180 / Math.PI, back = ((((d.yawDeg + 180) - toHub) % 360) + 540) % 360 - 180;
  assert.ok(Math.abs(back) < 1, `the commons at (${d.x}, ${d.z}): its main airlock (local -z) to the hub`);
  for (const zone of layout.zones) assert.ok(Math.hypot(d.x - zone.x, d.z - zone.z) - 17.8 * Math.SQRT2 >= 30, `the commons at (${d.x}, ${d.z}): 30 m off the zone at (${zone.x}, ${zone.z})`);
}
const lines = P.groundMarkings.lines, tracks = lines.filter((l) => l.paint === 'track');
assert.ok(tracks.length >= 24, `the station's tracks (${tracks.length})`);
assert.ok(lines.filter((l) => l.paint === 'track' || l.paint === 'rut').every((l) => l.unpaved === true), 'every track across the open ground');
const key = (pts) => pts.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join(' ');
const trackKeys = new Set(tracks.map((l) => key(l.points)));
const unpaired = tracks.filter((l) => !trackKeys.has(key(l.points.map(([x, z]) => [-x, -z]))));
assert.ok(unpaired.length <= 1, `the tracks in rotation pairs (the oxygen works' spur alone): ${unpaired.map((l) => key(l.points)).join(' | ')}`);
const segD = (x, z, [ax, az], [bx, bz]) => { const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez, t = l2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)) : 0; return Math.hypot(x - ax - ex * t, z - az - ez * t); };
const trackDist = (x, z) => Math.min(...tracks.flatMap((l) => l.points.slice(1).map((p, i) => segD(x, z, l.points[i], p))));
const HALF = { barn: 6.4, cottage: 4.4, schoolhouse: 8.2, gantry: 2.9, containerRow: 4.3, mill: 3.4, chapel: 4.8, farmhouse: 5.6 };
for (const site of EARTHRISE_STATION) {
  const a = site.yawDeg * Math.PI / 180, h = HALF[site.structure] + 0.8, dx = site.x + Math.sin(a) * h, dz = site.z + Math.cos(a) * h;
  const d = trackDist(dx, dz);
  assert.ok(d <= 4, `${site.structure} at (${site.x}, ${site.z}): its door ${d.toFixed(1)} m from a track (4 m)`);
}
for (const [x, z] of [[config.spawns.player.x, config.spawns.player.z], [-config.spawns.player.x, -config.spawns.player.z]]) {
  assert.ok(trackDist(x, z) <= 10, `the deployment's pads at (${x}, ${z}) on their track over the scarp`);
}
// the relay repeaters: a rotation pair on the scarps' crests beside the deployments' tracks, their dishes to the hub
assert.ok(RELAY_REPEATERS.length === 2 && Math.hypot(RELAY_REPEATERS[0].x + RELAY_REPEATERS[1].x, RELAY_REPEATERS[0].z + RELAY_REPEATERS[1].z) < 0.01, 'the repeaters a rotation pair');
for (const r of RELAY_REPEATERS) {
  const d = trackDist(r.x, r.z), toHub = Math.atan2(-r.x, -r.z) * 180 / Math.PI, off = ((((r.yawDeg + 180) - toHub) % 360) + 540) % 360 - 180;
  assert.ok(d >= 7 && d <= 15, `the repeater at (${r.x}, ${r.z}) ${d.toFixed(1)} m off its track (7-15 m: beside it, its guys clear of it)`);
  assert.ok(Math.abs(off) < 1, `the repeater at (${r.x}, ${r.z}): its dish to the hub`);
}
// the landers' blast under the pad's paint: the soot first, every streak on the pad
const soot = lines.filter((l) => l.paint === 'soot');
assert.ok(soot.length >= 30 && lines.indexOf(soot[soot.length - 1]) < lines.findIndex((l) => l.paint === 'white'), 'the blast laid under the paint');
assert.ok(soot.every((l) => l.points.every(([x, z]) => Math.max(Math.abs(x), Math.abs(z)) < 33)), 'the blast on the pad');
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
  + `${mastNote}the works in their lunar forms (${built.join(', ')}), ${families.size} kinds of object`);
