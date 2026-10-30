#!/usr/bin/env node
// Measure the playable fleet's first-party hull/turret/track envelopes and
// publish the pure-data calibration consumed by combatAnatomy.ts.
//
//   node tools/gen-combat-anatomy.mjs          # regenerate the full fleet
//   node tools/gen-combat-anatomy.mjs --check  # fail when a tank changed
//   node tools/gen-combat-anatomy.mjs --crew-only [--ids=a,b]  # re-seat the crew in the committed calibrations
//
// Every row carries its crew seats (235, tools/crew-seat-fit.mjs): a P50 body per crew station, seated in its role's
// posture inside the shell this row measures, and (266) its module seats: the sketched modules placed around the crew
// in one priority order, inside their armour. --crew-only refits both against the committed rows without rebuilding a
// tank (the full regen writes the same seats for an unchanged tank).
//
// Both modes also hold every measured tank's belly pan, track bottom and combat hull box to
// docs/geometry-gate/sim-floors.json (tools/anatomy-floor-ledger.mjs): a move over 5 cm fails, naming the parts
// responsible, unless accepted with a reason (--accept-floor=<id>[,<id>]:<reason>, or COT_ACCEPT_FLOOR_DRIFT through
// an npm chain). The write mode still writes its outputs first, then exits 3, so the regen chain stops there.

import { createHash } from 'node:crypto';
import { uniqueIds } from './id-list.mjs';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { weaponCollisionReceipts } from './weapon-collision-receipts.mjs';
import { plateFittedCell } from './plate-fitted-cell.mjs';
import { rigidHullFrame, rigidTurretFrame } from './rigid-hull-frame.mjs';
import {
  acceptFloorRows, acceptHint, compareFloorRows, floorRowOf, formatFloorDrift, parseFloorAccepts, readCommittedCalibrations,
  readFloorLedger, seedFloorRows, writeFloorLedger,
} from './anatomy-floor-ledger.mjs';
import { FLEET_GROUP_BY_ID } from '../src/vehicles/fleetManifest.ts';
import {
  enableCombatAnatomyMeasurementMode,
} from '../src/vehicles/combatAnatomyMeasurementMode.ts';

// Opt out before the eager fleet factory evaluates. Otherwise each update
// measures its own prior generated ERA/module calibration and can drift on
// the following --check pass instead of describing the authored source.
enableCombatAnatomyMeasurementMode();
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { measureTurretRing, measureTurretSweep, turretRingRadius, TURRET_RING_SIDE_CAPS } = await import('../src/vehicles/turretRingWell.ts');
const { captureChieftain10Collision } = await import('./chieftain10-collision.mjs');
const { captureTos1aTagilCollision } = await import('./tos1a-tagil-collision.mjs');
const { captureArieteC2Collision } = await import('./ariete-c2-collision.mjs');
const { authoredCombatAnatomy, finalizeCombatAnatomy } = await import('../src/vehicles/combatAnatomy.ts');
const { combatAnatomyCalibration } = await import('../src/vehicles/combatAnatomyCalibrationRegistry.ts');
const { INTERNAL_LAYOUT_BY_TANK } = await import('../src/vehicles/internalLayoutRegistry.ts');
const { fitCrewSeats, placeModules } = await import('./crew-seat-fit.mjs');

const outPath = resolve('src/vehicles/combatAnatomyCalibrations.ts');
const groupOutputDir = resolve('src/vehicles/combatAnatomyGroups');
const loaderOutputPath = resolve('src/vehicles/combatAnatomyLoaders.generated.ts');
const check = process.argv.includes('--check');
const crewOnly = process.argv.includes('--crew-only');
if (check && crewOnly) throw new Error('[combat-anatomy] --crew-only writes seats: run --check after it');
// --ids=a,b re-measures only those tanks and keeps every other row as generated (a targeted lane update; the full
// regen and the gate's --check stay fleet-wide).
const onlyIds = (() => {
  const arg = process.argv.find((a) => a.startsWith('--ids='));
  return arg ? new Set(uniqueIds(arg.slice(6).split(',').filter(Boolean), 'gen-combat-anatomy --ids')) : null;
})();
const COMBAT_ANATOMY_CALIBRATIONS = check || onlyIds || crewOnly
  ? (await import('../src/vehicles/combatAnatomyCalibrations.ts')).COMBAT_ANATOMY_CALIBRATIONS
  : Object.freeze({});
const round = (value) => Number(value.toFixed(4));

// The tracks' ground contact as the builder lays it (src/sim/trackContact.ts; physics lane round 8): the flat run
// between the road wheels, its centre, the tracks' outer edge, the lowest gear surface, the belly pan and the rise of
// the sprocket and idler ends. The movement solve reads it wherever it runs; solo play used to read it off the drawn
// model while the host, its Worker and the matrix ran a default support line 1.5-2.5 m longer than the track.
function trackContactReceipt(contact, id) {
  if (!contact || !(contact.halfLenM > 0) || !(contact.halfWidM > 0)) throw new Error(`${id}: track contact missing`);
  const r = (value) => (value == null || !Number.isFinite(value) ? null : round(value));
  return {
    halfLenM: r(contact.halfLenM),
    halfWidM: r(contact.halfWidM),
    zCenterM: r(contact.zCenterM ?? 0),
    bottomYM: r(contact.bottomYM ?? 0),
    panYM: r(contact.panYM),
    endRise: contact.endRise
      ? { dzM: r(contact.endRise.dzM), frontM: r(contact.endRise.frontM), rearM: r(contact.endRise.rearM) }
      : null,
  };
}

// Geometry-derived combat shells are deliberately much coarser than the
// presentation meshes, but they are closed volumes rather than the old set
// of unrelated armor quads. Longitudinal convex cells preserve the changing
// cross-section of a bow, fighting compartment, turret cheeks and bustle
// while keeping the authoritative ray query small enough for live aiming.
const HULL_SLICE_TARGET_M = 0.78;
const TURRET_SLICE_TARGET_M = 0.62;
const MIN_SLICES = 5;
const MAX_HULL_SLICES = 11;
const MAX_TURRET_SLICES = 9;
const POINT_QUANTUM_M = 0.01;
const SUPPORT_DIRECTIONS = Object.freeze((() => {
  const directions = [];
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) {
        if (x === 0 && y === 0 && z === 0) continue;
        const length = Math.hypot(x, y, z);
        directions.push([x / length, y / length, z / length]);
      }
    }
  }
  return directions;
})());

function selectedObjects(root, names, role = null) {
  const objects = [];
  root.traverse((object) => {
    if (!object.geometry || !names.has(object.name)) return;
    if (object.material && object.material.colorWrite === false) return;
    if (role && object.userData?.combatHitboxRole !== role) return;
    objects.push(object);
  });
  return objects;
}

function localEnvelope(root, owner, names, role = null) {
  root.updateMatrixWorld(true);
  owner.updateMatrixWorld(true);
  const invOwner = owner.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  const hash = createHash('sha256');
  const objects = selectedObjects(root, names, role);
  for (const object of objects) {
    const position = object.geometry.getAttribute('position');
    if (!position) continue;
    object.geometry.computeBoundingBox();
    const relative = new THREE.Matrix4().multiplyMatrices(invOwner, object.matrixWorld);
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(relative));
    hash.update(object.name);
    hash.update(new Uint8Array(position.array.buffer, position.array.byteOffset, position.array.byteLength));
    hash.update(JSON.stringify(relative.elements.map(round)));
  }
  if (bounds.isEmpty()) return null;
  return {
    min: bounds.min.toArray().map(round),
    max: bounds.max.toArray().map(round),
    sourceHash: hash.digest('hex').slice(0, 16),
  };
}

function clipPolygonAxis(points, axis, boundary, keepGreater) {
  if (!points.length) return points;
  const out = [];
  let previous = points[points.length - 1];
  let previousInside = keepGreater
    ? previous[axis] >= boundary - 1e-7
    : previous[axis] <= boundary + 1e-7;
  for (const current of points) {
    const currentInside = keepGreater
      ? current[axis] >= boundary - 1e-7
      : current[axis] <= boundary + 1e-7;
    if (currentInside !== previousInside) {
      const denominator = current[axis] - previous[axis];
      const t = Math.abs(denominator) > 1e-12
        ? (boundary - previous[axis]) / denominator
        : 0;
      const point = [
        previous[0] + (current[0] - previous[0]) * t,
        previous[1] + (current[1] - previous[1]) * t,
        previous[2] + (current[2] - previous[2]) * t,
      ];
      point[axis] = boundary;
      out.push(point);
    }
    if (currentInside) out.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return out;
}

function quantizedPointKey(point) {
  return `${Math.round(point[0] / POINT_QUANTUM_M)},`
    + `${Math.round(point[1] / POINT_QUANTUM_M)},`
    + `${Math.round(point[2] / POINT_QUANTUM_M)}`;
}

function uniquePointCloud(points) {
  const unique = new Map();
  for (const point of points) {
    const key = quantizedPointKey(point);
    if (!unique.has(key)) unique.set(key, new THREE.Vector3(...point));
  }
  return [...unique.values()];
}

/** Points within this of a direction's support tie with it (a seated underside's plane, float noise). */
const SUPPORT_TIE_M = 1e-5;

/**
 * One extreme point per support direction. `seatedUnderside`: a seated turret's slice (turretSeatRace.ts lays its
 * underside on one plane), where the downward directions keep every corner of a tied face.
 */
function supportPointCloud(cloud, seatedUnderside = false) {
  if (cloud.length <= SUPPORT_DIRECTIONS.length) return cloud;
  const supported = new Map();
  const project = (point, direction) => point.x * direction[0] + point.y * direction[1] + point.z * direction[2];
  for (const direction of SUPPORT_DIRECTIONS) {
    let best = null;
    let bestProjection = -Infinity;
    for (const point of cloud) {
      const projection = project(point, direction);
      if (projection <= bestProjection) continue;
      bestProjection = projection;
      best = point;
    }
    if (!best) continue;
    // 251: the seat ties a seated underside's points at the downward supports; the first of them alone dropped the
    // face's other corners, so a seated slice lost a whole bottom edge (pt91a_twardy: its turret floor rose from 0.17 to
    // 0.50 m over the crew, who no longer fit). Every corner of the tied face stays. Elsewhere (box faces tie too) one
    // point a direction is kept, as the fleet's rows were measured.
    const tied = seatedUnderside && direction[1] < 0
      ? cloud.filter((point) => project(point, direction) >= bestProjection - SUPPORT_TIE_M) : [best];
    if (tied.length === 1) { supported.set(quantizedPointKey(best.toArray()), best); continue; }
    for (const across of SUPPORT_DIRECTIONS) {
      let corner = null, cornerProjection = -Infinity;
      for (const point of tied) {
        const projection = project(point, across);
        if (projection <= cornerProjection) continue;
        cornerProjection = projection;
        corner = point;
      }
      supported.set(quantizedPointKey(corner.toArray()), corner);
    }
  }
  return [...supported.values()];
}

function convexHullFromCloud(cloud) {
  try {
    return new ConvexHull().setFromPoints(cloud);
  } catch {
    return null;
  }
}

function indexedHullFaces(hull) {
  const vertices = [];
  const vertexMap = new Map();
  const faces = [];
  for (const face of hull.faces) {
    const indices = [];
    let edge = face.edge;
    do {
      const point = edge.head().point;
      const key = quantizedPointKey([point.x, point.y, point.z]);
      let index = vertexMap.get(key);
      if (index === undefined) {
        index = vertices.length;
        vertexMap.set(key, index);
        vertices.push([round(point.x), round(point.y), round(point.z)]);
      }
      indices.push(index);
      edge = edge.next;
    } while (edge !== face.edge);
    if (indices.length === 3 && new Set(indices).size === 3) faces.push(indices);
  }
  return { vertices, faces };
}

function pointBounds(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min: min.map(round), max: max.map(round) };
}

function convexCell(points, seatedUnderside = false) {
  let cloud = uniquePointCloud(points);
  if (cloud.length < 4) return null;

  // Presentation geometry contains millimetric bevels, fasteners and other
  // silhouette noise that would turn a combat slice into hundreds of tiny
  // planes. A deterministic 26-direction support hull keeps the real outer
  // extents and slopes while bounding every cell to a few dozen faces.
  cloud = supportPointCloud(cloud, seatedUnderside);
  const hull = convexHullFromCloud(cloud);
  if (!hull || !hull.faces.length) return null;
  const { vertices, faces } = indexedHullFaces(hull);
  if (vertices.length < 4 || faces.length < 4) return null;
  return { ...pointBounds(vertices), vertices, faces };
}

// 247: plate-fitted cells (tools/plate-fitted-cell.mjs) for these ids: faces on the armour's own plates instead of the
// support hull's 26-vertex facets (the 243 critics read K2's turret cheek as a red/green/orange patchwork).
const PLATE_FIT_IDS = new Set(['k2_black_panther']);

function trianglePolygon(object, triangle, relative, a, b, c, roofY) {
  const position = object.geometry.getAttribute('position');
  const index = object.geometry.index;
  const ia = index ? index.getX(triangle * 3) : triangle * 3;
  const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
  const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
  a.fromBufferAttribute(position, ia).applyMatrix4(relative);
  b.fromBufferAttribute(position, ib).applyMatrix4(relative);
  c.fromBufferAttribute(position, ic).applyMatrix4(relative);
  const polygon = [a.toArray(), b.toArray(), c.toArray()];
  return Number.isFinite(roofY) ? clipPolygonAxis(polygon, 1, roofY, false) : polygon;
}

function addPolygonToSlices(polygon, pointsBySlice, z0, z1, step) {
  if (polygon.length < 3) return;
  let triangleMinZ = Infinity;
  let triangleMaxZ = -Infinity;
  for (const point of polygon) {
    triangleMinZ = Math.min(triangleMinZ, point[2]);
    triangleMaxZ = Math.max(triangleMaxZ, point[2]);
  }
  const lastSlice = pointsBySlice.length - 1;
  const first = Math.max(0, Math.min(lastSlice, Math.floor((triangleMinZ - z0) / step)));
  const last = Math.max(0, Math.min(lastSlice, Math.floor((triangleMaxZ - z0) / step)));
  for (let slice = first; slice <= last; slice++) {
    const minimumZ = z0 + slice * step;
    const maximumZ = slice === lastSlice ? z1 : z0 + (slice + 1) * step;
    let clipped = clipPolygonAxis(polygon, 2, minimumZ, true);
    clipped = clipPolygonAxis(clipped, 2, maximumZ, false);
    if (clipped.length >= 3) pointsBySlice[slice].push(...clipped);
  }
}

/**
 * Build a watertight union of convex longitudinal cells from the exact
 * procedural armor mesh. Triangles are clipped at every slice boundary so
 * adjacent cells share an identical closed cross-section instead of relying
 * on loose AABBs or leaving the old quad seams between zones.
 */
// VEH-13 (2026-10-15): a main gun fixed in the hull (the Strv 103 family) draws into `hullGun`, its own bucket for the
// spare-link seat solver. 259: it is not hull armour. Inside the shell it ran the hull's last slices out to the muzzle,
// plating the barrel as glacis 2 m ahead of the nose, bridging the nose to the tube with a convex face in air, and
// stretching the calibrated zones to the muzzle (the Strv 103A's nose took side-armour labels). The barrel is traced as
// the gun (armor.gunBarrel), as on every turreted tank.
const PRIMARY_BUCKETS = { hull: ['hull'], turret: ['turret'] };

// Release 227, round 7 (2026-10-18; the critic's UAPL-R5C-5: "the main-armour polygon sits in front of the visible
// upper-glacis ERA ... these modules are bound but can never act first"): the T-72B3 family's hull bucket carries its
// fender sponsons beside the glacis plate, and a longitudinal slice's one convex cell bridged them, so the gameplay glacis
// of these three hulls stood 5-29 cm in front of the plate and of the new frontal ERA laid on it. Their slices are also
// cut at the glacis plate's edges (measured on the builds: the Zubrs' plate ends at |x| 1.105-1.110, Hetman II's at 1.125
// back to z 2.9 and at 1.0 round its nose, where its fender sponsons run on 20 cm past the plate), each band its own convex cell; every other hull keeps one cell a slice.
const HULL_LATERAL_CUTS = Object.freeze({
  t72b3m_hetman_ii: [-1.125, -.995, .995, 1.125],
  t72b3_zubr: [-1.104, 1.104],
  t72b3_zubr_ii: [-1.104, 1.104],
});

function collisionCells(root, owner, bucket, envelope, targetSliceM, maxSlices, lateralCuts = null, plateFit = false,
  seatedUnderside = false) {
  if (!envelope) return [];
  root.updateMatrixWorld(true);
  owner.updateMatrixWorld(true);
  const invOwner = owner.matrixWorld.clone().invert();
  const objects = selectedObjects(root, new Set(PRIMARY_BUCKETS[bucket] ?? [bucket]), 'armor');
  if (!objects.length) return [];

  const z0 = envelope.min[2];
  const z1 = envelope.max[2];
  const span = z1 - z0;
  const sliceCount = Math.max(MIN_SLICES, Math.min(maxSlices, Math.ceil(span / targetSliceM)));
  const step = span / sliceCount;
  const pointsBySlice = Array.from({ length: sliceCount }, () => []);
  const roofY = Number.isFinite(envelope.bodyRoofY) ? envelope.bodyRoofY + 0.012 : Infinity;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  // (lateral bands: the polygon clipped to each band between consecutive cuts, its own slices)
  const bands = lateralCuts ? [-Infinity, ...lateralCuts, Infinity] : null;
  const pointsByBand = bands ? bands.slice(1).map(() => Array.from({ length: sliceCount }, () => [])) : [pointsBySlice];
  for (const object of objects) {
    const position = object.geometry.getAttribute('position');
    if (!position) continue;
    const index = object.geometry.index;
    const relative = new THREE.Matrix4().multiplyMatrices(invOwner, object.matrixWorld);
    const triangleCount = index ? index.count / 3 : position.count / 3;
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const polygon = trianglePolygon(object, triangle, relative, a, b, c, roofY);
      if (!bands) { addPolygonToSlices(polygon, pointsBySlice, z0, z1, step); continue; }
      for (let k = 0; k < bands.length - 1; k++) {
        let clipped = Number.isFinite(bands[k]) ? clipPolygonAxis(polygon, 0, bands[k], true) : polygon;
        if (Number.isFinite(bands[k + 1])) clipped = clipPolygonAxis(clipped, 0, bands[k + 1], false);
        addPolygonToSlices(clipped, pointsByBand[k], z0, z1, step);
      }
    }
  }

  const cells = [];
  for (const slices of pointsByBand) for (const points of slices) {
    const cell = plateFit ? plateFittedCell(uniquePointCloud(points)) : convexCell(points, seatedUnderside);
    if (cell) cells.push(bands ? { ...cell, lateralBand: true } : cell);
  }
  return cells;
}

function receiptBoxes(root, owner, buckets, predicate = null) {
  root.updateMatrixWorld(true);
  owner.updateMatrixWorld(true);
  const invOwner = owner.matrixWorld.clone().invert();
  const meshes = new Map();
  root.traverse((object) => {
    if (!object.geometry || !buckets.has(object.name)) return;
    if (!meshes.has(object.name)) meshes.set(object.name, object);
  });
  const boxes = [];
  for (const receipt of root.userData.combatGeometryParts || []) {
    if (!buckets.has(receipt.bucket) || (predicate && !predicate(receipt))) continue;
    const mesh = meshes.get(receipt.bucket);
    if (!mesh) continue;
    const relative = new THREE.Matrix4().multiplyMatrices(invOwner, mesh.matrixWorld);
    const box = new THREE.Box3(
      new THREE.Vector3().fromArray(receipt.min),
      new THREE.Vector3().fromArray(receipt.max),
    ).applyMatrix4(relative);
    boxes.push({
      bucket: receipt.bucket,
      module: receipt.module || null,
      min: box.min.toArray(),
      max: box.max.toArray(),
    });
  }
  return boxes;
}

function primaryEnvelope(root, owner, bucket) {
  const names = new Set(PRIMARY_BUCKETS[bucket] ?? [bucket]);
  const exact = localEnvelope(root, owner, names, 'armor');
  if (!exact) return null;
  const parts = receiptBoxes(root, owner, names);
  if (parts.length < 2) return exact;
  let maxVolume = 0;
  for (const part of parts) {
    const volume = part.max.reduce(
      (product, value, axis) => product * Math.max(0, value - part.min[axis]), 1);
    maxVolume = Math.max(maxVolume, volume);
    part.volume = volume;
  }
  if (!(maxVolume > 0)) return exact;
  const primary = parts.filter((part) => part.volume >= maxVolume * 0.08);
  if (!primary.length) return exact;
  const bodyRoofY = Math.max(...primary.map((part) => part.max[1]));
  const cappedRoofY = Math.min(exact.max[1], bodyRoofY);
  const hash = createHash('sha256');
  hash.update(exact.sourceHash);
  hash.update(JSON.stringify(parts.map((part) => [part.min.map(round), part.max.map(round)])));
  hash.update(String(round(cappedRoofY)));
  return {
    min: exact.min,
    max: [exact.max[0], round(cappedRoofY), exact.max[2]],
    bodyRoofY: round(cappedRoofY),
    roofDetailMaxY: exact.max[1],
    sourceHash: hash.digest('hex').slice(0, 16),
  };
}

function boxGap(a, b) {
  let sum = 0;
  for (let axis = 0; axis < 3; axis++) {
    const gap = Math.max(0, a.min[axis] - b.max[axis], b.min[axis] - a.max[axis]);
    sum += gap * gap;
  }
  return Math.sqrt(sum);
}

function clusterBoxes(boxes, tolerance = 0.035) {
  const remaining = boxes.map((box) => ({
    min: box.min.slice(),
    max: box.max.slice(),
    bucket: box.bucket,
  }));
  const clusters = [];
  while (remaining.length) {
    const cluster = remaining.pop();
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = remaining.length - 1; index >= 0; index--) {
        if (boxGap(cluster, remaining[index]) > tolerance) continue;
        const next = remaining.splice(index, 1)[0];
        for (let axis = 0; axis < 3; axis++) {
          cluster.min[axis] = Math.min(cluster.min[axis], next.min[axis]);
          cluster.max[axis] = Math.max(cluster.max[axis], next.max[axis]);
        }
        changed = true;
      }
    }
    clusters.push({
      min: cluster.min.map(round),
      max: cluster.max.map(round),
      bucket: cluster.bucket,
    });
  }
  return clusters.sort((a, b) => a.min[2] - b.min[2] || a.min[0] - b.min[0]);
}

function structureReceipts(root, owner, frame) {
  const cupolaBucket = `${frame}Cupola`;
  const hatchBucket = `${frame}Hatch`;
  const boxes = receiptBoxes(root, owner, new Set([cupolaBucket, hatchBucket]));
  const rows = [];
  for (const [kind, bucket] of [['cupola', cupolaBucket], ['hatch', hatchBucket]]) {
    const clusters = clusterBoxes(boxes.filter((box) => box.bucket === bucket));
    clusters.forEach((cluster, index) => {
      const hash = createHash('sha256');
      hash.update(JSON.stringify(cluster));
      rows.push({
        kind,
        min: cluster.min,
        max: cluster.max,
        sourceHash: hash.digest('hex').slice(0, 16),
        index,
      });
    });
  }
  return rows;
}

function structureCollisionCells(root, owner, frame, structures) {
  if (!structures.length) return [];
  root.updateMatrixWorld(true);
  owner.updateMatrixWorld(true);
  const invOwner = owner.matrixWorld.clone().invert();
  const byKind = new Map([
    ['cupola', selectedObjects(root, new Set([`${frame}Cupola`]))],
    ['hatch', selectedObjects(root, new Set([`${frame}Hatch`]))],
  ]);
  const point = new THREE.Vector3();
  const rows = [];
  for (const structure of structures) {
    const points = [];
    for (const object of byKind.get(structure.kind) || []) {
      const position = object.geometry.getAttribute('position');
      if (!position) continue;
      const relative = new THREE.Matrix4().multiplyMatrices(invOwner, object.matrixWorld);
      for (let index = 0; index < position.count; index++) {
        point.fromBufferAttribute(position, index).applyMatrix4(relative);
        if (point.x < structure.min[0] - 0.025 || point.x > structure.max[0] + 0.025
            || point.y < structure.min[1] - 0.025 || point.y > structure.max[1] + 0.025
            || point.z < structure.min[2] - 0.025 || point.z > structure.max[2] + 0.025) continue;
        points.push(point.toArray());
      }
    }
    const cell = convexCell(points);
    if (!cell) continue;
    cell.structureKind = structure.kind;
    cell.structureIndex = structure.index;
    rows.push(cell);
  }
  return rows;
}

function moduleShapeReceipts(root, hullRig, turretRig, armorModules) {
  const rows = [];
  const receiptParts = root.userData.combatGeometryParts || [];
  const modules = new Set(receiptParts.map((part) => part.module).filter(Boolean));
  const damageOwner = new Map((armorModules || []).map((entry) => [
    entry.module,
    entry.gunFollow ? 'gunG' : entry.turretLocal ? 'turretG' : 'hullG',
  ]));
  for (const module of [...modules].sort()) {
    for (const [owner, turretLocal, parent] of [
      [hullRig, false, 'hullG'],
      [turretRig, true, 'turretG'],
      // Gun-follow combat volumes use turret-rest coordinates, just like
      // pitching armor plates; their runtime frame rotates about gunPivot.
      [turretRig, true, 'gunG'],
    ]) {
      // One canonical damage state owns each module. Vehicles can expose
      // additional passive vision blocks in the other articulation frame,
      // but those must not create an impossible second damage volume or a
      // receipt that the runtime cannot apply. Measure the visible geometry
      // in the authored module's frame only.
      if (damageOwner.has(module) && damageOwner.get(module) !== parent) continue;
      const buckets = new Set(receiptParts
        .filter((part) => part.module === module && part.parent === parent)
        .map((part) => part.bucket));
      if (!buckets.size) continue;
      const boxes = receiptBoxes(root, owner, buckets,
        (part) => part.module === module && part.parent === parent);
      const parts = clusterBoxes(boxes, 0.025).map(({ min, max }) => ({ min, max }));
      if (!parts.length) continue;
      const hash = createHash('sha256');
      hash.update(JSON.stringify(parts));
      rows.push({
        module,
        turretLocal,
        ...(parent === 'gunG' ? { gunFollow: true } : {}),
        parts,
        sourceHash: hash.digest('hex').slice(0, 16),
      });
    }
  }
  return rows;
}

// 258 (vehicles-hit-volume-fit-258): the build fits each zone's surfaces in its owner rig's own frame
// (tankFactoryCore eraVisualBindingReceipt), before the rig's scale; the combat frames carry none (rigid-hull-frame.mjs),
// so each point takes its owner rig's scale (hull rigs sit at the root's origin and turret rigs on their turret pivots,
// so the scale is about the frame's origin). Unscaled, the Challenger 2E's skirt ERA stood 19 cm inside the cassettes it
// draws and the Sheridan's 10 cm outside them.
function eraPlateReceipts(root, rigScales = {}) {
  const receipt = root.userData.eraVisualBindingReceipt;
  if (!receipt || !Array.isArray(receipt.plates)) return [];
  const scaled = (owner, point) => {
    const s = rigScales[owner];
    return s ? [point[0] * s.x, point[1] * s.y, point[2] * s.z] : point;
  };
  return receipt.plates
    .filter((plate) => plate.registered && plate.ownerMatches
      && plate.partCount > 0 && Array.isArray(plate.fittedSurfaces)
      && plate.fittedSurfaces.some((surface) => Array.isArray(surface) && surface.length >= 3))
    .map((plate) => ({
      name: plate.name,
      owner: plate.owner,
      surfaces: plate.fittedSurfaces.map(
        (surface) => surface.map((point) => scaled(plate.owner, point).map(round)),
      ),
      visualSectors: [...(plate.visualSectors || [])],
    }));
}

function receiptFor(id) {
  const create = () => createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const stockCapture = id === 'chieftain_mk10' ? captureChieftain10Collision(create)
    : id === 'tos1a_tagil' ? captureTos1aTagilCollision(create)
      : id === 'c2_ariete' ? captureArieteC2Collision(create) : null;
  const tank = stockCapture?.tank ?? create();
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    if (!hullRig || !turretRig) throw new Error(`${id}: articulation rigs missing`);
    // The turret ring as built (turretRingWell.ts measureTurretRing, its exterior pass), in the live rig_hull frame the
    // wreck compares it in, before the frame below is made rigid: the intact race (turretSeatRace.ts), a wreck's ring
    // plate and a hulk's well are drawn from it (2026-10-22), and with it the hull the turret traverses over, which the
    // turret's seat follows (measureTurretSweep). A ring measured past the hull's own sides keeps its cap (244).
    const armor = TANK_SPECS[id]?.armor;
    // 259: a variant that draws its donor's exact hull and turret (the PT-91M on the T-72BU: hullG.userData.pt91mDonor)
    // measures the ring with the donor's radius. The radius only guides the measure, yet it sets the deck it reads, and the
    // PT-91M's own (the T-72B3's ring refit to its 3.66 m kit width) seated the donor's turret 0.1 mm off the donor's.
    const coreDonor = hullRig.userData.pt91mDonor?.id;
    const ringArmor = (coreDonor && TANK_SPECS[coreDonor]?.armor) || armor;
    const ring = armor?.turretless ? null
      : measureTurretRing(hullRig, turretRig, turretRingRadius(ringArmor), { exterior: true, rimCap: TURRET_RING_SIDE_CAPS[id] });
    const turretRing = ring ? { ...ring, ...measureTurretSweep(hullRig, turretRig, ring) } : null;
    // the build seated its turret over the deck from the ring receipt of the row it read (turretSeatRace.ts's own test)
    const seatReceipt = combatAnatomyCalibration(id)?.turretRing;
    const seatedTurret = !!seatReceipt && seatReceipt.rimR > 0.3 && Number.isFinite(seatReceipt.deckY);
    // The Improved's narrowing lives on the hull rig's scale; combat coordinates have none (tools/rigid-hull-frame.mjs).
    // (the rigs' scales, before the frames below take them, for the ERA receipts the build fitted in the rigs' frames)
    const rigScales = { hull: hullRig.scale.clone(), turret: turretRig.scale.clone() };
    rigidHullFrame(tank, id);
    rigidTurretFrame(tank);
    // Only the explicitly structural armor buckets calibrate shell collision.
    // Painted equipment can share the same material, but its semantic role
    // keeps MGs, sights, antennas, launchers and stowage out of these bounds.
    // Cupolas remain in the structural hull/turret buckets and are included.
    const hull = primaryEnvelope(tank.root, hullRig, 'hull');
    let turret = primaryEnvelope(tank.root, turretRig, 'turret');
    if (turret) {
      const span = turret.max.map((value, axis) => value - turret.min[axis]);
      // Some casemate builders retain a tiny articulation cube named
      // `turret` solely as the gun-pivot owner. It is not a fighting
      // compartment and must not collapse every turret-local crew/module box
      // into that helper mesh (the ISU family is the canonical case).
      if (span[0] < 0.7 && span[1] < 0.4 && span[2] < 0.7) turret = null;
    }
    const trackL = localEnvelope(tank.root, hullRig, new Set(['gearTrackBandL']));
    const trackR = localEnvelope(tank.root, hullRig, new Set(['gearTrackBandR']));
    if (!hull) throw new Error(`${id}: main hull receipt missing`);
    if (!trackL || !trackR) throw new Error(`${id}: running-gear receipt missing`);
    const hullStructures = structureReceipts(tank.root, hullRig, 'hull');
    const turretStructures = structureReceipts(tank.root, turretRig, 'turret');
    return {
      hull,
      turret,
      hullCollision: stockCapture?.hullCollision ?? collisionCells(
        tank.root, hullRig, 'hull', hull, HULL_SLICE_TARGET_M, MAX_HULL_SLICES, HULL_LATERAL_CUTS[id] ?? null,
        PLATE_FIT_IDS.has(id),
      ),
      turretCollision: stockCapture?.turretCollision ?? (turret ? collisionCells(
        tank.root, turretRig, 'turret', turret, TURRET_SLICE_TARGET_M, MAX_TURRET_SLICES, null, PLATE_FIT_IDS.has(id),
        seatedTurret,
      ) : []),
      hullStructures,
      turretStructures,
      hullStructureCollision: structureCollisionCells(
        tank.root, hullRig, 'hull', hullStructures,
      ),
      turretStructureCollision: structureCollisionCells(
        tank.root, turretRig, 'turret', turretStructures,
      ),
      moduleShapes: moduleShapeReceipts(
        tank.root, hullRig, turretRig, TANK_SPECS[id]?.armor?.modules,
      ),
      eraPlates: eraPlateReceipts(tank.root, rigScales),
      ...(tank.root.userData.weaponGeometryParts?.length
        ? { externalWeapons: weaponCollisionReceipts(tank.root, hullRig, turretRig) } : {}),
      tracks: { left: trackL, right: trackR },
      trackContact: trackContactReceipt(tank.contactGeom, id),
      ...(turretRing ? { turretRing } : {}),
    };
  } finally {
    if (stockCapture) stockCapture.dispose();
    else tank.dispose();
  }
}

/** A module sketch with this share of its box outside its armour is reported as a data fix. */
const DATA_FIX_OUTSIDE_SHARE = 0.3;

/**
 * The internal placement of one measured row (266, tools/crew-seat-fit.mjs): the authored spec finalized against that
 * row, its crew seated in its shell inside the turret ring's limits, then its sketched modules placed around them.
 */
function seatsFor(id, calibration) {
  const probe = authoredCombatAnatomy(id);
  if (!probe) throw new Error(`[combat-anatomy] ${id}: no authored combat anatomy to seat the crew in`);
  finalizeCombatAnatomy(probe, calibration);
  const ring = calibration.turretRing ?? null;
  const crewSeats = fitCrewSeats(probe, INTERNAL_LAYOUT_BY_TANK[id]?.layoutKey ?? null, ring);
  const drawn = new Set((calibration.moduleShapes || []).map((receipt) => `${receipt.module}|${!!receipt.turretLocal}`));
  const { seats: moduleSeats, report } = placeModules(probe, crewSeats, { drawn, ring });
  // a sketch that lies largely outside its armour is wrong data: the pass keeps the part inside, and says so
  for (const entry of report) {
    if (entry.outside >= DATA_FIX_OUTSIDE_SHARE || entry.unplaced) {
      console.log(`[combat-anatomy] data fix: ${id} ${entry.module} (${entry.frame}) sketch ${entry.sketchedL} L, `
        + `${Math.round(entry.outside * 100)}% outside its armour, ${Math.round(entry.kept * 100)}% kept${entry.unplaced ? ', UNPLACED' : ''}`);
    }
  }
  return { crewSeats, moduleSeats };
}

const rows = {};
for (const id of onlyIds ?? []) if (!ALL_TANK_IDS.includes(id)) throw new Error(`[combat-anatomy] unknown id ${id}`);
for (const id of ALL_TANK_IDS) {
  if (onlyIds && !onlyIds.has(id) && COMBAT_ANATOMY_CALIBRATIONS[id]) { rows[id] = COMBAT_ANATOMY_CALIBRATIONS[id]; continue; }
  if (crewOnly) {
    if (!COMBAT_ANATOMY_CALIBRATIONS[id]) throw new Error(`[combat-anatomy] ${id}: --crew-only needs a committed calibration`);
    const { crewSeats: _previous, moduleSeats: _previousModules, ...measured } = COMBAT_ANATOMY_CALIBRATIONS[id];
    rows[id] = { ...measured, ...seatsFor(id, measured) };
    console.log(`[combat-anatomy] seated ${id}`);
    continue;
  }
  const measured = receiptFor(id);
  rows[id] = { ...measured, ...seatsFor(id, measured) };
  console.log(`[combat-anatomy] measured ${id}`);
}

const fileHeader = `// Generated by tools/gen-combat-anatomy.mjs. Do not hand-edit.\n`
  + `// Main armor and internal volumes are calibrated to these first-party geometry receipts.\n`;
const rowsByGroup = {};
for (const [id, calibration] of Object.entries(rows)) {
  const group = FLEET_GROUP_BY_ID[id] || 'core';
  (rowsByGroup[group] ||= {})[id] = calibration;
}
const groupNames = Object.keys(rowsByGroup).sort();
const groupBinding = (group) => `CALIBRATIONS_${group.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
const groupSources = Object.fromEntries(groupNames.map((group) => [
  join(groupOutputDir, `${group}.generated.ts`),
  fileHeader
    + `import type { CombatAnatomyCalibration } from '../combatAnatomyCalibrationRegistry.ts';\n\n`
    // Collision receipts are large numeric payloads. Keep generated modules
    // compact so download/parse cost is governed by data, not indentation.
    + `export const COMBAT_ANATOMY_CALIBRATIONS: Readonly<Record<string, CombatAnatomyCalibration>> = Object.freeze(${JSON.stringify(rowsByGroup[group])});\n`,
]));
const source = fileHeader
  + `import type { CombatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';\n`
  + groupNames.map((group) => `import { COMBAT_ANATOMY_CALIBRATIONS as ${groupBinding(group)} } from './combatAnatomyGroups/${group}.generated.ts';`).join('\n')
  + `\n\nexport const COMBAT_ANATOMY_CALIBRATIONS: Readonly<Record<string, CombatAnatomyCalibration>> = Object.freeze(Object.assign({},\n`
  + groupNames.map((group) => `  ${groupBinding(group)},`).join('\n')
  + `\n));\n`;
const loaderSource = `// Generated by tools/gen-combat-anatomy.mjs. Do not hand-edit.\n`
  + `// Explicit imports let Vite emit one immutable calibration chunk per visual family.\n\n`
  + `import type { CombatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';\n\n`
  + `type CalibrationGroupModule = { COMBAT_ANATOMY_CALIBRATIONS: Readonly<Record<string, CombatAnatomyCalibration>> };\n\n`
  + `export const COMBAT_ANATOMY_GROUP_LOADERS: Readonly<Record<string, () => Promise<CalibrationGroupModule>>> = Object.freeze({\n`
  + groupNames.map((group) => `  ${JSON.stringify(group)}: () => import('./combatAnatomyGroups/${group}.generated.ts'),`).join('\n')
  + `\n});\n`;
const outputs = {
  [outPath]: source,
  [loaderOutputPath]: loaderSource,
  ...groupSources,
};
const staleGroupPaths = existsSync(groupOutputDir)
  ? readdirSync(groupOutputDir)
    .filter((name) => name.endsWith('.generated.js') || name.endsWith('.generated.ts'))
    .map((name) => join(groupOutputDir, name))
    .filter((filePath) => !(filePath in outputs))
  : [];

// Sim floors (227, the guards stream): the 226 T-90M blade moved two tanks' combat hull floor and belly pan 22 cm
// through a routine-looking regen. Compare this run's measurement with the ledger before anything is written.
const measuredIds = ALL_TANK_IDS.filter((id) => !onlyIds || onlyIds.has(id));
const floorLedger = readFloorLedger();
const floorAccepts = parseFloorAccepts(process.argv, process.env, '--accept-floor=');
if (check && floorAccepts.length) throw new Error('[combat-anatomy] --accept-floor / COT_ACCEPT_FLOOR_DRIFT records new values: run it without --check');
const floorBy = process.env.COT_LANE || userInfo().username;
// The calibration on disk before this run writes: only an id it has never measured is new. A calibrated tank whose
// ledger row is missing is compared with that committed calibration and fails; it is never seeded (guards 229).
const committedFloorRows = readCommittedCalibrations();
const floorLedgerChanges = [];
if (!check) {
  const { changed } = acceptFloorRows(floorLedger, rows, floorAccepts, { by: floorBy });
  if (changed.length) floorLedgerChanges.push(`accepted ${changed.join(', ')}`);
  const { seeded } = seedFloorRows(floorLedger, rows, measuredIds, { committed: committedFloorRows, by: floorBy });
  if (seeded.length) floorLedgerChanges.push(`first rows for ${seeded.join(', ')}`);
  if (!onlyIds) {
    const gone = Object.keys(floorLedger.rows).filter((id) => !ALL_TANK_IDS.includes(id));
    for (const id of gone) delete floorLedger.rows[id];
    if (gone.length) floorLedgerChanges.push(`dropped rows of retired ids ${gone.join(', ')}`);
  }
}
const floorResult = compareFloorRows(
  floorLedger.rows,
  Object.fromEntries(measuredIds.map((id) => [id, floorRowOf(rows[id], id)])),
  { ids: measuredIds, fleetIds: onlyIds ? null : ALL_TANK_IDS, toleranceM: floorLedger.toleranceM },
);
const floorReport = [];
if (floorResult.drifts.size) {
  const { blameFloorDrift } = await import('./anatomy-floor-blame.mjs');
  floorReport.push(`[combat-anatomy] SIM FLOOR DRIFT: ${floorResult.drifts.size} tank(s) moved a sim floor or the combat hull box `
    + `by more than ${floorLedger.toleranceM * 100} cm against docs/geometry-gate/sim-floors.json:`);
  for (const [id, moved] of floorResult.drifts) {
    let culprits = null;
    try { culprits = blameFloorDrift(id, moved); } catch (error) { floorReport.push(`  ${id}: blame build failed: ${error.message}`); }
    floorReport.push(...formatFloorDrift(id, moved, culprits));
  }
  const drifting = [...floorResult.drifts.keys()];
  floorReport.push('  Fix the geometry (nothing below the belly line; equipment out of the structural buckets), or record an');
  floorReport.push(check
    ? `  intended move with the regen: node tools/gen-combat-anatomy.mjs --ids=${drifting.join(',')} --accept-floor=${drifting.join(',')}:'<what moved and why>'`
    : `  intended move: ${acceptHint(drifting)} (these outputs are written), or re-run with --accept-floor=`
      + `${drifting.join(',')}:'<what moved and why>' (COT_ACCEPT_FLOOR_DRIFT through an npm chain)`);
}
if (floorResult.missing.length) {
  floorReport.push(`[combat-anatomy] SIM FLOOR: no ledger row for ${floorResult.missing.join(', ')}: a calibrated tank's row `
    + 'is never re-seeded (the write mode seeds only an id the committed calibration has never measured); restore the row '
    + `from git, or record it: ${acceptHint(floorResult.missing)}`);
  // what the lost row would have caught: the fresh measurement against the committed calibration
  for (const id of floorResult.missing.filter((id) => committedFloorRows[id])) {
    const against = compareFloorRows({ [id]: floorRowOf(committedFloorRows[id], id) }, { [id]: floorRowOf(rows[id], id) },
      { ids: [id], toleranceM: floorLedger.toleranceM });
    const moved = against.drifts.get(id);
    floorReport.push(moved ? `  ${id} against its committed calibration:` : `  ${id}: within ${floorLedger.toleranceM * 100} cm of its committed calibration`);
    if (moved) floorReport.push(...formatFloorDrift(id, moved));
  }
}
if (floorResult.extra.length) floorReport.push(`[combat-anatomy] SIM FLOOR: ledger rows for ids no longer in the fleet: `
  + `${floorResult.extra.join(', ')} (node tools/anatomy-floor-drift.mjs --prune)`);

if (check) {
  for (const line of floorReport) console.error(line);
  const staleOutputs = Object.entries(outputs)
    .filter(([filePath, expected]) => !existsSync(filePath) || readFileSync(filePath, 'utf8') !== expected)
    .map(([filePath]) => filePath);
  if (staleOutputs.length || staleGroupPaths.length) {
    const changed = ALL_TANK_IDS.filter(
      (id) => JSON.stringify(COMBAT_ANATOMY_CALIBRATIONS[id]) !== JSON.stringify(rows[id]),
    );
    console.error('[combat-anatomy] stale calibration; run npm run tank:anatomy:update');
    console.error(`[combat-anatomy] changed receipts: ${changed.join(', ')}`);
    for (const filePath of [...staleOutputs, ...staleGroupPaths]) console.error(`  ${filePath}`);
    process.exit(2);
  }
  if (floorReport.length) process.exit(2);
  console.log(`[combat-anatomy] PASS — ${ALL_TANK_IDS.length} receipts across ${groupNames.length} demand groups are current; `
    + `${measuredIds.length} measured sim floors within ${floorLedger.toleranceM * 100} cm of their ledger rows`);
} else {
  mkdirSync(groupOutputDir, { recursive: true });
  for (const [filePath, contents] of Object.entries(outputs)) writeFileSync(filePath, contents);
  for (const filePath of staleGroupPaths) unlinkSync(filePath);
  console.log(`[combat-anatomy] wrote ${ALL_TANK_IDS.length} rows across ${groupNames.length} demand groups`);
  if (floorLedgerChanges.length) {
    writeFloorLedger(floorLedger);
    console.log(`[combat-anatomy] sim-floor ledger: ${floorLedgerChanges.join('; ')}`);
  }
  if (floorReport.length) {
    for (const line of floorReport) console.error(line);
    process.exit(3);
  }
}
