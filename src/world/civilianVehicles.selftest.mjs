import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CIVILIAN_VEHICLE_CLUSTER_COUNT,
  CIVILIAN_VEHICLE_RECEIPTS,
  CIVILIAN_VEHICLES_PER_CLUSTER,
  civilianVehicleOverrides,
  civilianVehiclePalette,
  pickCivilianVehicleKind,
  pickCivilianVehicleKindForPlacement,
  visibleCivilianVehicleCount,
} from './maps/civilianVehicleKit.ts';
import { LEGACY_CONTACT_BANDS, LEGACY_DRAWS } from './maps/civilianVehicleLegacy.ts';
import { DEFAULT_FLEET, FLEETS, fleetForMap } from './maps/vehicleFleets.ts';
import { DESTRUCTIBLE_TYPES, civilianVehicleTypes } from './maps/inhabitKit.ts';
import { MAP_IDS } from './maps/index.ts';

// The map-vehicles lane (2026-10-05): the eight roles keep their records — the placement boxes, the legacy contact
// band every pool refits its obstacles to, the legacy builders' draws from the destructible stream — while each map's
// fleet builds them as real types. Every fleet's every role is held to the role's box (a canvas tilt or a box van may
// rise over the record by the role's allowance), the tier budgets, the surface stream (the paint mask on the intact
// body only) and the stream budget.

function seeded(seed) {
  const next = () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    next.calls++;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  next.calls = 0;
  return next;
}

const kinds = Object.keys(CIVILIAN_VEHICLE_RECEIPTS);
assert.deepEqual([...kinds].sort(), [
  'jeep', 'pickup', 'sedan', 'truck', 'truckbox', 'truckflatbed', 'van', 'wagon',
], 'vehicle kit exposes the eight placement roles');

for (const [kind, receipt] of Object.entries(CIVILIAN_VEHICLE_RECEIPTS)) {
  const metadata = DESTRUCTIBLE_TYPES[kind];
  assert.ok(metadata, `${kind} is registered as a world destructible`);
  assert.equal(metadata.mat, 'vehicle', `${kind} uses the shared textured vehicle PBR material`);
  assert.equal(metadata.build, receipt.build, `${kind} registry keeps the kit's default builder`);
  assert.equal(metadata.broken, receipt.broken, `${kind} registry keeps the kit's default burnt builder`);
  assert.equal(metadata.contactBand, LEGACY_CONTACT_BANDS[kind], `${kind} refits to the legacy contact band (collision unchanged)`);
  assert.equal(metadata.hw, receipt.halfWidth, `${kind}: the record's half-width is the role box's`);
  assert.equal(metadata.hl, receipt.halfLength, `${kind}: the record's half-length is the role box's`);
  assert.equal(metadata.h, receipt.height, `${kind}: the record's height is the role box's`);
}

const DESKTOP_BUDGET = 9000, MOBILE_BUDGET = 3600;
function checkRole(label, kind, geometry, burnt, mobile) {
  const receipt = CIVILIAN_VEHICLE_RECEIPTS[kind];
  for (const attribute of ['position', 'normal', 'uv', 'color', 'surf']) {
    assert.ok(geometry.getAttribute(attribute), `${label}: carries ${attribute}`);
  }
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    assert.ok(Number.isFinite(positions.getX(index)) && Number.isFinite(positions.getY(index))
      && Number.isFinite(positions.getZ(index)), `${label}: finite positions`);
  }
  const triangles = geometry.index.count / 3;
  assert.ok(triangles <= (mobile ? MOBILE_BUDGET : Math.min(DESKTOP_BUDGET, receipt.triangleBudget)),
    `${label}: ${triangles} triangles within the ${mobile ? 'mobile' : 'desktop'} budget`);
  geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  assert.ok(Math.abs(b.min.y) < 0.001, `${label}: the tyres (or the burnt rims) stand on the ground plane (${b.min.y})`);
  assert.ok(Math.max(-b.min.x, b.max.x) <= receipt.halfWidth + 0.001, `${label}: inside the role's width`);
  assert.ok(Math.max(-b.min.z, b.max.z) <= receipt.halfLength + 0.001, `${label}: inside the role's length`);
  assert.ok(b.max.y <= receipt.height + receipt.rise + 0.001, `${label}: under the role's height and allowance`);
  const surf = geometry.getAttribute('surf');
  let painted = 0, glossy = 0;
  for (let index = 0; index < surf.count; index++) {
    if (surf.getZ(index) > 0.5) painted++;
    if (surf.getX(index) < 0.15) glossy++;
  }
  if (burnt) {
    assert.equal(painted, 0, `${label}: a burnt body keeps no livery`);
    assert.equal(glossy, 0, `${label}: a burnt body keeps no gloss (the glass is gone)`);
  } else {
    assert.ok(painted > 50, `${label}: the body paint carries the paint mask`);
    assert.ok(glossy > 10, `${label}: glass or chrome reads glossy`);
  }
  const colors = geometry.getAttribute('color');
  const zones = new Set();
  for (let index = 0; index < colors.count; index += Math.max(1, Math.floor(colors.count / 160))) {
    zones.add(`${colors.getX(index).toFixed(2)}:${colors.getY(index).toFixed(2)}:${colors.getZ(index).toFixed(2)}`);
  }
  assert.ok(zones.size >= 6, `${label}: distinct paint, glass, rubber, lamp and metal zones`);
}

// every map's fleet, both tiers: the builders, the stream budget, the liveries
const checkedFleets = new Set();
for (const mapId of MAP_IDS) {
  const fleet = fleetForMap(mapId);
  assert.ok(fleet && FLEETS[fleet.id] === fleet, `${mapId} dresses in a catalogued fleet`);
  const types = civilianVehicleTypes(mapId, false);
  for (const kind of kinds) {
    assert.equal(types[kind].contactBand, LEGACY_CONTACT_BANDS[kind], `${mapId}/${kind}: same contact band`);
    assert.equal(types[kind].hw, DESTRUCTIBLE_TYPES[kind].hw, `${mapId}/${kind}: same record`);
    assert.equal(typeof types[kind].instancePaint, 'function', `${mapId}/${kind}: liveries`);
  }
  if (checkedFleets.has(fleet.id)) continue;
  checkedFleets.add(fleet.id);
  for (const mobile of [false, true]) {
    const overrides = civilianVehicleOverrides(mapId, mobile);
    for (const kind of kinds) {
      for (const burnt of [false, true]) {
        const rng = seeded(0x91a7);
        const geometry = (burnt ? overrides[kind].broken : overrides[kind].build)(rng);
        assert.equal(rng.calls, LEGACY_DRAWS[kind][burnt ? 'broken' : 'build'],
          `${fleet.id}/${kind}${burnt ? '/burnt' : ''}: spends the legacy builder's draws from the stream`);
        checkRole(`${fleet.id}/${kind}${burnt ? '/burnt' : ''}${mobile ? '/mobile' : ''}`, kind, geometry, burnt, mobile);
        geometry.dispose();
      }
      // the shadow passes draw a stand-in on desktop tiers: the coarse build, positions only, at most half the body's
      // triangles, fitted inside the body's own box and spending nothing from the stream; the mobile body casts itself
      if (mobile) assert.equal(overrides[kind].shadowBuild, undefined, `${fleet.id}/${kind}/mobile: the coarse body casts itself`);
      else {
        const rng = seeded(0x91a7), body = overrides[kind].build(rng), calls = rng.calls;
        const caster = overrides[kind].shadowBuild();
        assert.equal(rng.calls, calls, `${fleet.id}/${kind}: the shadow stand-in draws nothing from the stream`);
        assert.deepEqual(Object.keys(caster.attributes), ['position'], `${fleet.id}/${kind}: the stand-in carries positions only`);
        assert.ok(caster.index.count <= body.index.count * 0.5,
          `${fleet.id}/${kind}: stand-in ${caster.index.count / 3} triangles <= half the body's ${body.index.count / 3}`);
        body.computeBoundingBox(); caster.computeBoundingBox();
        const bb = body.boundingBox, cb = caster.boundingBox;
        for (const axis of ['x', 'y', 'z']) {
          assert.ok(cb.min[axis] >= bb.min[axis] - 0.03 && cb.max[axis] <= bb.max[axis] + 0.03,
            `${fleet.id}/${kind}: the stand-in stays inside the body's box on ${axis}`);
        }
        assert.ok(Math.abs(cb.min.y) < 0.03, `${fleet.id}/${kind}: the stand-in stands on the ground (${cb.min.y})`);
        body.dispose(); caster.dispose();
      }
      // a livery is one of the role's paints (faded or fresh), the same for the same place
      const a = new THREE.Color(), b = new THREE.Color();
      overrides[kind].instancePaint(a, 12.5, -40.25, 3);
      overrides[kind].instancePaint(b, 12.5, -40.25, 3);
      assert.ok(a.equals(b), `${fleet.id}/${kind}: a copy's livery is deterministic`);
      const swatches = fleet.roles[kind].paints.map((hex) => new THREE.Color(hex));
      assert.ok(swatches.some((c) => ['r', 'g', 'b'].every((ch) => a[ch] >= c[ch] * 0.879 && a[ch] <= c[ch] * 1.041)),
        `${fleet.id}/${kind}: the livery comes from the role's paints`);
    }
  }
}
assert.ok(checkedFleets.has(DEFAULT_FLEET), 'the default fleet is exercised');

for (const [mapId, expectedLight, expectedHeavy] of [
  ['urban', ['sedan', 'van', 'pickup', 'wagon', 'jeep'], ['truckbox', 'truckflatbed', 'truck']],
  ['verdant', ['wagon', 'pickup', 'jeep', 'sedan', 'van'], ['truckflatbed', 'truck', 'truckbox']],
  ['desert', ['pickup', 'jeep', 'van', 'wagon', 'sedan'], ['truck', 'truckflatbed', 'truckbox']],
]) {
  const lightRolls = expectedLight.map((_, index) => (index + 0.5) / expectedLight.length);
  const heavyRolls = expectedHeavy.map((_, index) => (index + 0.5) / expectedHeavy.length);
  assert.deepEqual(lightRolls.map((roll) => pickCivilianVehicleKind(mapId, 'light', roll)), expectedLight,
    `${mapId} gets its deterministic five-family light-traffic vocabulary`);
  assert.deepEqual(heavyRolls.map((roll) => pickCivilianVehicleKind(mapId, 'heavy', roll)), expectedHeavy,
    `${mapId} gets its deterministic three-family heavy-traffic vocabulary`);
  assert.deepEqual(expectedLight.map((_, index) =>
    pickCivilianVehicleKindForPlacement(mapId, 'light', index, 0.01)), expectedLight,
  `${mapId} visibly places all five light silhouettes before any repeat`);
  assert.deepEqual(expectedHeavy.map((_, index) =>
    pickCivilianVehicleKindForPlacement(mapId, 'heavy', index, 0.99)), expectedHeavy,
  `${mapId} visibly places all three heavy silhouettes before any repeat`);
}

for (const mapId of MAP_IDS) {
  assert.equal(new Set(civilianVehiclePalette(mapId, 'light')).size, 5,
    `${mapId}: all five light vehicle bodies are eligible`);
  assert.equal(new Set(civilianVehiclePalette(mapId, 'heavy')).size, 3,
    `${mapId}: all three heavy vehicle bodies are eligible`);
}

assert.equal(pickCivilianVehicleKind('urban', 'light', -4), 'sedan',
  'variant selection clamps malformed low rolls');
assert.equal(pickCivilianVehicleKind('urban', 'light', 8), 'jeep',
  'variant selection clamps malformed high rolls');
assert.equal(visibleCivilianVehicleCount(undefined, 'heavy'), 6,
  'maps without an authored heavy count still place two full palette cycles');
assert.equal(visibleCivilianVehicleCount(1, 'light'), 10,
  'small legacy light budgets grow to two full five-body palette cycles');
assert.equal(visibleCivilianVehicleCount(12, 'light'), 12,
  'larger authored traffic budgets are preserved');
assert.equal(CIVILIAN_VEHICLE_CLUSTER_COUNT, 2,
  'every battlefield reserves two grouped traffic pockets');
assert.equal(CIVILIAN_VEHICLES_PER_CLUSTER, 4,
  'each grouped traffic pocket has enough vehicles to read as a convoy or parking row');

console.log(`civilianVehicles.selftest: ${MAP_IDS.length} maps on ${checkedFleets.size} fleets, both tiers, burnt states, `
  + 'legacy records, contact bands and stream draws, liveries, shadow stand-ins, footprints and budgets passed');
