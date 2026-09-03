import assert from 'node:assert/strict';
import {
  DESTRUCTIBLE_BUILDING_TYPES, STRUCTURE_BUILDERS, STRUCTURE_CATALOG,
} from './maps/structureKit.ts';
import { makeWaterTower } from './maps/railKit.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';

function seeded(seed = 0x51a7c7) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = STRUCTURE_CATALOG.map(({ id }) => id);
assert.equal(ids.length, 35, 'thirty-five new building types are registered');
assert.equal(new Set(ids).size, ids.length, 'new building ids are unique');
assert.equal(Object.keys(STRUCTURE_BUILDERS).length, 15, 'fifteen heavyweight merged buildings');
assert.equal(Object.keys(DESTRUCTIBLE_BUILDING_TYPES).length, 20,
  'twenty light buildings have destruction states');

const HIGH_RISE_IDS = [
  'megatower', 'arcology', 'needletower', 'broadcasttower', 'terracetower',
];
const highRiseDimensions = new Map();
const lightPitchedFamilies = new Set();
const crownParts = [];

let connectedHeavyStructures = 0;
function boundsGap(a, b) {
  const dx = Math.max(0, b.min.x - a.max.x, a.min.x - b.max.x);
  const dy = Math.max(0, b.min.y - a.max.y, a.min.y - b.max.y);
  const dz = Math.max(0, b.min.z - a.max.z, a.min.z - b.max.z);
  return Math.hypot(dx, dy, dz);
}

for (const [id, build] of Object.entries(STRUCTURE_BUILDERS)) {
  const buckets = Object.fromEntries(
    ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked']
      .map((key) => [key, []]),
  );
  const info = build(seeded(), buckets, 'plaster');
  assert.ok(info.w > 5 && info.d > 5 && info.h > 4, `${id}: authored building dimensions`);
  const geos = Object.values(buckets).flat();
  assert.ok(geos.length >= 10, `${id}: detailed multi-part geometry`);
  for (const geo of geos) {
    assert.ok(geo.attributes.position.count > 0, `${id}: valid geometry`);
    geo.computeBoundingBox();
    if (geo.userData.structureSpire) crownParts.push({ id, geo, ...geo.userData.structureSpire });
  }
  // Authoring-time connectivity census: every visible part must overlap or
  // sit within a realistic fixture tolerance of the primary structure. This
  // catches unsupported balconies, rails, crown slabs and facade hardware
  // before the material buckets erase their individual identity by merging.
  const connected = new Set([0]);
  const pending = [0];
  while (pending.length) {
    const current = pending.pop();
    for (let candidate = 0; candidate < geos.length; candidate++) {
      if (connected.has(candidate)) continue;
      if (boundsGap(geos[current].boundingBox, geos[candidate].boundingBox) > 0.12) continue;
      connected.add(candidate);
      pending.push(candidate);
    }
  }
  assert.equal(connected.size, geos.length, `${id}: no disconnected or floating authored part`);
  if (HIGH_RISE_IDS.includes(id)) {
    assert.ok(info.h >= 48, `${id}: skyline-scale crown height`);
    assert.ok(geos.length >= 100, `${id}: detailed four-sided facade and crown assembly`);
    assert.ok(buckets.glass.length >= 24, `${id}: facade glazing covers more than one elevation`);
    assert.ok(buckets.roof.length + buckets.dark.length >= 7 && buckets.dark.length >= 4,
      `${id}: connected roof silhouette has crown and structural detail`);
    highRiseDimensions.set(id, `${info.w.toFixed(1)}:${info.d.toFixed(1)}:${info.h.toFixed(1)}`);
  }
  const supported = geos.filter((geo) => geo.userData.structureSupport);
  if (supported.length) {
    connectedHeavyStructures++;
    assert.ok(supported.length >= 13, `${id}: connected exterior fixture set`);
    assert.ok(supported.every((geo) => geo.userData.structureSupport.gap <= 0.065),
      `${id}: no authored exterior part floats from its declared support`);
  }
}
assert.equal(highRiseDimensions.size, HIGH_RISE_IDS.length,
  'every authored skyscraper participates in the skyline quality gate');
assert.ok(new Set(highRiseDimensions.values()).size >= 4,
  'skyscraper families keep visibly distinct proportions and crown heights');
assert.ok(connectedHeavyStructures >= 9,
  'at least nine heavyweight families use the connected exterior authoring contract');

function endpointCenter(geo, upper) {
  const position = geo.attributes.position;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < position.count; i++) {
    minY = Math.min(minY, position.getY(i));
    maxY = Math.max(maxY, position.getY(i));
  }
  const y = upper ? maxY : minY;
  const epsilon = Math.max(1e-5, (maxY - minY) * 0.03);
  let x = 0, z = 0, count = 0;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getY(i) - y) > epsilon) continue;
    x += position.getX(i);
    z += position.getZ(i);
    count++;
  }
  assert.ok(count > 0, 'spire endpoint sample contains vertices');
  return { x: x / count, z: z / count };
}

const waterTowerBuckets = Object.fromEntries(
  ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'baked']
    .map((key) => [key, []]),
);
makeWaterTower(seeded(), waterTowerBuckets);
const waterTowerLegs = waterTowerBuckets.dark.slice(0, 4);
assert.equal(waterTowerLegs.length, 4, 'water tower exposes four support legs');
for (const leg of waterTowerLegs) {
  const bottom = endpointCenter(leg, false);
  const top = endpointCenter(leg, true);
  assert.ok(Math.hypot(bottom.x, bottom.z) > Math.hypot(top.x, top.z) + 0.25,
    'water tower legs flare outward at the ground and converge under the tank');
}

const broadcastLegs = crownParts.filter((part) => part.style === 'broadcast' && part.role === 'leg');
assert.equal(broadcastLegs.length, 8, 'both broadcast buildings expose four audited mast legs');
for (const part of broadcastLegs) {
  const bottom = endpointCenter(part.geo, false);
  const top = endpointCenter(part.geo, true);
  const bottomRadius = Math.hypot(bottom.x - part.centerX, bottom.z - part.centerZ);
  const topRadius = Math.hypot(top.x - part.centerX, top.z - part.centerZ);
  assert.ok(bottomRadius > topRadius + 0.25,
    `${part.id}: broadcast mast has a wide supported base and narrows upward`);
}

const forkedBlades = crownParts.filter((part) => part.style === 'forked' && part.role === 'blade');
const forkedFinials = crownParts.filter((part) => part.style === 'forked' && part.role === 'finial');
assert.equal(forkedBlades.length, 4, 'both forked buildings expose two audited crown blades');
assert.equal(forkedFinials.length, 4, 'each forked blade has one audited finial');
for (const blade of forkedBlades) {
  const bottom = endpointCenter(blade.geo, false);
  const top = endpointCenter(blade.geo, true);
  assert.ok(Math.abs(bottom.x - blade.centerX) > Math.abs(top.x - blade.centerX) + 0.25,
    `${blade.id}: forked crown blade narrows toward its tip`);
  const finial = forkedFinials.find((part) => part.id === blade.id && part.sideX === blade.sideX);
  assert.ok(finial, `${blade.id}: forked crown blade retains its finial`);
  const finialBase = endpointCenter(finial.geo, false);
  assert.ok(Math.abs(top.x - finialBase.x) <= 0.08,
    `${blade.id}: forked crown finial is seated on the blade tip`);
}

assert.equal(crownParts.filter((part) => part.style === 'needle' && part.role === 'needle').length, 2,
  'both civic needle crowns participate in the orientation audit');

for (const [id, meta] of Object.entries(DESTRUCTIBLE_BUILDING_TYPES)) {
  assert.equal(meta.id, id, `${id}: registry id matches`);
  assert.equal(meta.cls, 'break', `${id}: persistent swap-to-debris destruction`);
  assert.equal(meta.contact, 'ob', `${id}: tank collision participates`);
  assert.equal(meta.collider, true, `${id}: shell/LOS cover while intact`);
  assert.ok(['structureWood', 'structureCanvas', 'structureMetal'].includes(meta.surfaceMaterial),
    `${id}: destructible building selects a textured surface family`);
  assert.ok(meta.instanceTintStrength >= 0.03 && meta.instanceTintStrength <= 0.08,
    `${id}: restrained zero-draw-call instance variation`);
  assert.ok(meta.hw > 1 && meta.hl > 1 && meta.h > 3, `${id}: building-scale footprint`);
  const intact = meta.build(seeded());
  const broken = meta.broken(seeded(0x71f00d));
  intact.computeBoundingBox();
  const bounds = intact.boundingBox;
  const visualHalfWidth = (bounds.max.x - bounds.min.x) * 0.5;
  const visualHalfLength = (bounds.max.z - bounds.min.z) * 0.5;
  assert.ok(meta.hw <= visualHalfWidth + 0.10,
    `${id}: movement collision width does not exceed intact structure geometry`);
  assert.ok(meta.hl <= visualHalfLength + 0.10,
    `${id}: movement collision length does not exceed intact structure geometry`);
  const connectivity = intact.userData.structureConnectivity;
  assert.equal(connectivity.id, id, `${id}: connectivity receipt follows the family id`);
  assert.equal(connectivity.connected, connectivity.parts,
    `${id}: every authored intact part belongs to a building or grounded support chain`);
  assert.ok(connectivity.groundSupported >= 1,
    `${id}: the intact assembly has at least one physical ground contact`);
  assert.ok(connectivity.parts >= 5, `${id}: connectivity covers a detailed assembly`);
  assert.ok(connectivity.maxConnectionGap <= connectivity.epsilon,
    `${id}: connections stay inside the fixture tolerance`);
  for (const pitch of intact.userData.skillionRoofPitches || []) {
    assert.ok(pitch.drop > 0.01, `${id}: porch/lean-to roof descends away from its wall`);
    lightPitchedFamilies.add(id);
  }
  for (const [state, geo] of [['intact', intact], ['broken', broken]]) {
    const { position, color, uv } = geo.attributes;
    assert.ok(position.count >= 120, `${id}: ${state} geometry is detailed`);
    if (state === 'broken') assert.ok(position.count >= 684,
      `${id}: persistent wreck includes collapsed panels and surviving frame`);
    assert.equal(color.count, position.count,
      `${id}: ${state} geometry carries baked colors for one-draw-call rendering`);
    assert.equal(uv.count, position.count,
      `${id}: ${state} geometry carries tiled UVs for its surface texture`);
    geo.computeBoundingBox();
    assert.ok(Number.isFinite(geo.boundingBox.min.x) && Number.isFinite(geo.boundingBox.max.z),
      `${id}: ${state} bounds are finite`);
  }
}

for (const id of [
  'fieldhut', 'leanto', 'fishershack', 'alpinerefuge', 'stilthouse',
  'checkpointhut', 'securityoffice', 'corneroffice',
]) {
  assert.ok(lightPitchedFamilies.has(id), `${id}: wall roof has a verified orientation receipt`);
}

const used = new Set();
for (const mapId of MAP_IDS) {
  const props = getMapConfig(mapId).props;
  const mapTypes = [
    ...props.plan.filter((id) => STRUCTURE_BUILDERS[id]),
    ...(props.destructibleBuildings || []),
  ];
  assert.ok(mapTypes.length >= 4, `${mapId}: at least four new structure beats`);
  assert.equal(new Set(props.destructibleBuildings || []).size,
    (props.destructibleBuildings || []).length, `${mapId}: no repeated light-building family`);
  for (const id of mapTypes) {
    assert.ok(ids.includes(id), `${mapId}: ${id} is a registered new structure`);
    used.add(id);
  }
}
assert.deepEqual([...used].sort(), [...ids].sort(),
  'all thirty-five new structure types are deliberately assigned to maps');

console.log('structureKit.selftest: 35 new types; 20 destructible; all maps covered');
