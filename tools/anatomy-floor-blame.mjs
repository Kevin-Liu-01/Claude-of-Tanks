// Name the parts behind a sim-floor drift (tools/anatomy-floor-ledger.mjs). Builds ONE tank, the way
// tools/gen-combat-anatomy.mjs measures it (measurement mode, proceduralOnly, geometryReceipt), with a part census
// that records where each part was authored, then lists the live parts beyond the recorded floor or extent with
// their builder call site, e.g. `hull part, y 0.190 ... at buildT90MProryvNative2026@profiles/t90.ts:7681`.
// Only drifting ids are built, so the gates pay nothing when no floor moved.

import * as THREE from 'three';
import { enableCombatAnatomyMeasurementMode } from '../src/vehicles/combatAnatomyMeasurementMode.ts';
import { authorSite, parseStackFrames, rankFloorCulprits } from './anatomy-floor-ledger.mjs';
import { rigidHullFrame } from './rigid-hull-frame.mjs';

// Before the fleet factory evaluates (gen-combat-anatomy's rule): measure the authored geometry, never the previous
// generated calibration. Harmless when gen-combat-anatomy already enabled it.
enableCombatAnatomyMeasurementMode();
const { createTank } = await import('../src/vehicles/tankFactory.ts');

// The structural buckets that calibrate the combat hull box (gen-combat-anatomy PRIMARY_BUCKETS.hull).
const STRUCTURAL_HULL_BUCKETS = new Set(['hull', 'hullGun']);

function captureFrames() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  const stack = new Error().stack || '';
  Error.stackTraceLimit = limit;
  return parseStackFrames(stack);
}

const boxKey = (min, max) => [...min, ...max].map((value) => value.toFixed(6)).join(',');

function visibleBelow(object, root) {
  for (let current = object; current && current !== root; current = current.parent) if (!current.visible) return false;
  return true;
}

const writesColor = (material) => (Array.isArray(material) ? material : [material]).some((m) => m && m.colorWrite !== false);

/**
 * The live parts of `id` in both frames, each with its author site. `parts[i].hull` / `.root` hold
 * `{ min, max }` in the hull rig frame and the tank root frame.
 */
function floorParts(id, { create = createTank } = {}) {
  const census = [];
  const tank = create(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    partCensus: (bucket, part) => census.push({ bucket, part, ...authorSite(captureFrames()) }),
  });
  try {
    rigidHullFrame(tank, id);
    const root = tank.root;
    const hullRig = root.getObjectByName('rig_hull');
    if (!hullRig) throw new Error(`${id}: articulation rigs missing`);
    root.updateMatrixWorld(true);
    const invHull = hullRig.matrixWorld.clone().invert();
    const invRoot = root.matrixWorld.clone().invert();
    const meshes = new Map();
    root.traverse((object) => { if (object.geometry && !meshes.has(object.name)) meshes.set(object.name, object); });
    // A census part keeps its geometry object to the end, so its final bounding box (the one the receipt copied) keys it.
    const sites = new Map();
    for (const entry of census) {
      if (!entry.part.boundingBox) entry.part.computeBoundingBox();
      const box = entry.part.boundingBox;
      if (!box || box.isEmpty()) continue;
      const key = boxKey(box.min.toArray(), box.max.toArray());
      if (!sites.has(key)) sites.set(key, entry);
    }
    const meshInfo = new Map();
    const infoFor = (mesh) => {
      if (meshInfo.has(mesh)) return meshInfo.get(mesh);
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld));
      // restPoseContact.centerSpanningMeshBottomY: a mesh whose box crosses the centreline offers a belly-pan floor
      const colour = writesColor(mesh.material);
      const info = {
        centreSpanning: bounds.min.x < -0.2 && bounds.max.x > 0.2,
        visible: colour && visibleBelow(mesh, root),
        // gen-combat-anatomy selectedObjects: a colour-writing mesh of the bucket with the armour hit role
        structural: STRUCTURAL_HULL_BUCKETS.has(mesh.name) && colour && mesh.userData?.combatHitboxRole === 'armor',
      };
      meshInfo.set(mesh, info);
      return info;
    };
    const parts = [];
    for (const receipt of root.userData.combatGeometryParts || []) {
      const mesh = meshes.get(receipt.bucket);
      if (!mesh) continue;
      const info = infoFor(mesh);
      const local = new THREE.Box3(new THREE.Vector3().fromArray(receipt.min), new THREE.Vector3().fromArray(receipt.max));
      const hullBox = local.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(invHull, mesh.matrixWorld));
      const rootBox = local.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld));
      const site = sites.get(boxKey(receipt.min, receipt.max));
      parts.push({
        bucket: receipt.bucket,
        module: receipt.module || null,
        site: site?.site ?? null,
        caller: site?.caller ?? null,
        structural: info.structural,
        centreSpanning: info.centreSpanning,
        visible: info.visible,
        hull: { min: hullBox.min.toArray(), max: hullBox.max.toArray() },
        root: { min: rootBox.min.toArray(), max: rootBox.max.toArray() },
      });
    }
    // gen-combat-anatomy primaryEnvelope: the hull roof is capped at the top of the parts holding at least 8 % of the
    // largest structural part's volume, so only those can move it
    const volume = (part) => part.hull.max.reduce((product, value, axis) => product * Math.max(0, value - part.hull.min[axis]), 1);
    const maxVolume = Math.max(0, ...parts.filter((part) => part.structural).map(volume));
    for (const part of parts) part.primary = part.structural && volume(part) >= maxVolume * 0.08;
    return parts;
  } finally {
    tank.dispose();
  }
}

/**
 * The culprits for each moved field of one id: `Map<fieldKey, { parts, note }>`. `moved` is the list
 * compareFloorRows reports for that id.
 */
export function blameFloorDrift(id, moved, options = {}) {
  const parts = floorParts(id, options);
  const culprits = new Map();
  for (const { field, from, to } of moved) {
    const framed = parts.map((part) => ({ ...part, ...part[field.frame] }));
    culprits.set(field.key, rankFloorCulprits(field, from, to, framed));
  }
  return culprits;
}

