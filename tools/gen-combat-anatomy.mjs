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
import { createTank } from '../src/vehicles/tankFactory.js';
import { ALL_TANK_IDS } from '../src/vehicles/specs.js';
import { COMBAT_ANATOMY_CALIBRATIONS } from '../src/vehicles/combatAnatomyCalibrations.js';

const outPath = resolve('src/vehicles/combatAnatomyCalibrations.js');
const check = process.argv.includes('--check');
const round = (value) => Number(value.toFixed(4));

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
    return {
      hull,
      turret,
      hullStructures: structureReceipts(tank.root, hullRig, 'hull'),
      turretStructures: structureReceipts(tank.root, turretRig, 'turret'),
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
  `export const COMBAT_ANATOMY_CALIBRATIONS = Object.freeze(${JSON.stringify(rows, null, 2)});\n`;

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
