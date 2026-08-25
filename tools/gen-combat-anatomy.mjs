#!/usr/bin/env node
// Measure the playable fleet's first-party hull/turret/track envelopes and
// publish the pure-data calibration consumed by combatAnatomy.js.
//
//   node tools/gen-combat-anatomy.mjs          # regenerate the full fleet
//   node tools/gen-combat-anatomy.mjs --check  # fail when a tank changed

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { createTank } from '../src/vehicles/tankFactory.js';
import { ALL_TANK_IDS } from '../src/vehicles/specs.js';
import { COMBAT_ANATOMY_CALIBRATIONS } from '../src/vehicles/combatAnatomyCalibrations.js';

const outPath = resolve('src/vehicles/combatAnatomyCalibrations.js');
const check = process.argv.includes('--check');
const round = (value) => Number(value.toFixed(4));

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

function convexCell(points) {
  const unique = new Map();
  for (const point of points) {
    const key = quantizedPointKey(point);
    if (!unique.has(key)) unique.set(key, new THREE.Vector3(...point));
  }
  let cloud = [...unique.values()];
  if (cloud.length < 4) return null;

  // Presentation geometry contains millimetric bevels, fasteners and other
  // silhouette noise that would turn a combat slice into hundreds of tiny
  // planes. A deterministic 26-direction support hull keeps the real outer
  // extents and slopes while bounding every cell to a few dozen faces.
  if (cloud.length > SUPPORT_DIRECTIONS.length) {
    const supported = new Map();
    for (const direction of SUPPORT_DIRECTIONS) {
      let best = null;
      let bestProjection = -Infinity;
      for (const point of cloud) {
        const projection = point.x * direction[0] + point.y * direction[1] + point.z * direction[2];
        if (projection > bestProjection) {
          bestProjection = projection;
          best = point;
        }
      }
      if (best) supported.set(quantizedPointKey(best.toArray()), best);
    }
    cloud = [...supported.values()];
  }

  let hull;
  try {
    hull = new ConvexHull().setFromPoints(cloud);
  } catch {
    return null;
  }
  if (!hull.faces.length) return null;

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
  if (vertices.length < 4 || faces.length < 4) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of vertices) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min: min.map(round), max: max.map(round), vertices, faces };
}

/**
 * Build a watertight union of convex longitudinal cells from the exact
 * procedural armor mesh. Triangles are clipped at every slice boundary so
 * adjacent cells share an identical closed cross-section instead of relying
 * on loose AABBs or leaving the old quad seams between zones.
 */
function collisionCells(root, owner, bucket, envelope, targetSliceM, maxSlices) {
  if (!envelope) return [];
  root.updateMatrixWorld(true);
  owner.updateMatrixWorld(true);
  const invOwner = owner.matrixWorld.clone().invert();
  const objects = selectedObjects(root, new Set([bucket]), 'armor');
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

  for (const object of objects) {
    const position = object.geometry.getAttribute('position');
    if (!position) continue;
    const index = object.geometry.index;
    const relative = new THREE.Matrix4().multiplyMatrices(invOwner, object.matrixWorld);
    const triangleCount = index ? index.count / 3 : position.count / 3;
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const ia = index ? index.getX(triangle * 3) : triangle * 3;
      const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
      const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(relative);
      b.fromBufferAttribute(position, ib).applyMatrix4(relative);
      c.fromBufferAttribute(position, ic).applyMatrix4(relative);
      let polygon = [a.toArray(), b.toArray(), c.toArray()];
      if (Number.isFinite(roofY)) polygon = clipPolygonAxis(polygon, 1, roofY, false);
      if (polygon.length < 3) continue;
      let triMinZ = Infinity;
      let triMaxZ = -Infinity;
      for (const point of polygon) {
        triMinZ = Math.min(triMinZ, point[2]);
        triMaxZ = Math.max(triMaxZ, point[2]);
      }
      const first = Math.max(0, Math.min(sliceCount - 1, Math.floor((triMinZ - z0) / step)));
      const last = Math.max(0, Math.min(sliceCount - 1, Math.floor((triMaxZ - z0) / step)));
      for (let slice = first; slice <= last; slice++) {
        const minZ = z0 + slice * step;
        const maxZ = slice === sliceCount - 1 ? z1 : z0 + (slice + 1) * step;
        let clipped = clipPolygonAxis(polygon, 2, minZ, true);
        clipped = clipPolygonAxis(clipped, 2, maxZ, false);
        if (clipped.length >= 3) pointsBySlice[slice].push(...clipped);
      }
    }
  }

  const cells = [];
  for (const points of pointsBySlice) {
    const cell = convexCell(points);
    if (cell) cells.push(cell);
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
  const exact = localEnvelope(root, owner, new Set([bucket]), 'armor');
  if (!exact) return null;
  const parts = receiptBoxes(root, owner, new Set([bucket]));
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

function moduleShapeReceipts(root, hullRig, turretRig) {
  const rows = [];
  const receiptParts = root.userData.combatGeometryParts || [];
  const modules = new Set(receiptParts.map((part) => part.module).filter(Boolean));
  for (const module of [...modules].sort()) {
    for (const [owner, turretLocal, parent] of [
      [hullRig, false, 'hullG'],
      [turretRig, true, 'turretG'],
    ]) {
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
        parts,
        sourceHash: hash.digest('hex').slice(0, 16),
      });
    }
  }
  return rows;
}

function receiptFor(id) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    if (!hullRig || !turretRig) throw new Error(`${id}: articulation rigs missing`);
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
      hullCollision: collisionCells(
        tank.root, hullRig, 'hull', hull, HULL_SLICE_TARGET_M, MAX_HULL_SLICES,
      ),
      turretCollision: turret ? collisionCells(
        tank.root, turretRig, 'turret', turret, TURRET_SLICE_TARGET_M, MAX_TURRET_SLICES,
      ) : [],
      hullStructures,
      turretStructures,
      hullStructureCollision: structureCollisionCells(
        tank.root, hullRig, 'hull', hullStructures,
      ),
      turretStructureCollision: structureCollisionCells(
        tank.root, turretRig, 'turret', turretStructures,
      ),
      moduleShapes: moduleShapeReceipts(tank.root, hullRig, turretRig),
      tracks: { left: trackL, right: trackR },
    };
  } finally {
    tank.dispose();
  }
}

const rows = {};
for (const id of ALL_TANK_IDS) {
  rows[id] = receiptFor(id);
  console.log(`[combat-anatomy] measured ${id}`);
}

const source = `// Generated by tools/gen-combat-anatomy.mjs. Do not hand-edit.\n` +
  `// Main armor and internal volumes are calibrated to these first-party geometry receipts.\n` +
  // The collision receipts are large numeric payloads. Keep the generated
  // module compact so boot parsing is governed by data, not indentation.
  `export const COMBAT_ANATOMY_CALIBRATIONS = Object.freeze(${JSON.stringify(rows)});\n`;

if (check) {
  const current = readFileSync(outPath, 'utf8');
  if (current !== source) {
    const changed = ALL_TANK_IDS.filter(
      (id) => JSON.stringify(COMBAT_ANATOMY_CALIBRATIONS[id]) !== JSON.stringify(rows[id]),
    );
    console.error('[combat-anatomy] stale calibration; run npm run tank:anatomy:update');
    console.error(`[combat-anatomy] changed receipts: ${changed.join(', ')}`);
    process.exit(2);
  }
  console.log(`[combat-anatomy] PASS — ${ALL_TANK_IDS.length} playable geometry receipts are current`);
} else {
  writeFileSync(outPath, source);
  console.log(`[combat-anatomy] wrote ${ALL_TANK_IDS.length} rows -> ${outPath}`);
}
