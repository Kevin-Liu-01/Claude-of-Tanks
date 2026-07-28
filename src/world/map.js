// src/world/map.js — composes terrain meshes + vegetation + props into the World.
// Contract: docs/ARCHITECTURE.md §2.7 (World shape), §3.2 (layout rules).
// Which battlefield gets built is driven by a map config (src/world/maps/*):
// createMap(engineCtx, { mapId }) — 'verdant' | 'desert' | 'winter' | 'urban'.

import * as THREE from 'three';
import { createHeightField, buildTerrainMeshes } from './terrain.js';
import { createVegetation } from './vegetation.js';
import { createProps } from './props.js';
import { getMapConfig } from './maps/index.js';

const _pt = new THREE.Vector3();
const _bisA = new THREE.Vector3();

// slab-method ray vs AABB; returns entry t (>= 0) and entry-face normal, or null
function rayAABB(origin, dir, aabb, maxDist, outNormal) {
  let tmin = 0, tmax = maxDist;
  let axis = -1, sign = 1;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? origin.x : a === 1 ? origin.y : origin.z;
    const d = a === 0 ? dir.x : a === 1 ? dir.y : dir.z;
    const lo = aabb.min[a], hi = aabb.max[a];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
      continue;
    }
    const inv = 1 / d;
    let t0 = (lo - o) * inv, t1 = (hi - o) * inv;
    let s = -1;
    if (t0 > t1) { const tt = t0; t0 = t1; t1 = tt; s = 1; }
    if (t0 > tmin) { tmin = t0; axis = a; sign = s; }
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return -1;
  }
  if (axis >= 0) {
    outNormal.set(0, 0, 0);
    outNormal.setComponent(axis, sign);
  } else {
    outNormal.copy(dir).multiplyScalar(-1); // started inside the box
  }
  return tmin;
}

/**
 * Build the full battlefield world for a map config and add it to the scene.
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {{mapId?:string, seed?:number}} [opts] world options
 * @returns {object} World (ARCHITECTURE §2.7) + {mapId, config}
 */
export function createMap(engineCtx, { mapId = 'verdant', seed = 1337 } = {}) {
  const config = getMapConfig(mapId);
  const heightField = createHeightField(seed, config);
  const terrain = buildTerrainMeshes(heightField, engineCtx, config);
  const vegetation = createVegetation(heightField, engineCtx, 2001, config);
  const props = createProps(heightField, engineCtx, 2002, config);
  const layout = heightField._layout;

  const group = new THREE.Group();
  group.name = 'world-' + config.id;
  group.add(terrain, vegetation.group, props.group);
  engineCtx.scene.add(group);

  const obstacles = [...props.obstacles, ...vegetation.treeObstacles];

  const sp = layout.spawns;
  const spawnPoints = {
    player: {
      pos: [sp.player.x, heightField.getHeightAt(sp.player.x, sp.player.z), sp.player.z],
      yaw: sp.player.yaw,
    },
    enemies: sp.enemies.map((e) => ({
      pos: [e.x, heightField.getHeightAt(e.x, e.z), e.z],
      yaw: e.yaw,
    })),
  };

  const _aabbNrm = new THREE.Vector3();
  const _bestNrm = new THREE.Vector3();

  /**
   * Cheap world raycast: heightfield ray-march + prop AABB slab tests.
   * @param {THREE.Vector3} origin ray origin (world)
   * @param {THREE.Vector3} dir unit direction
   * @param {number} maxDist maximum distance, meters
   * @returns {null|{point:THREE.Vector3,normal:THREE.Vector3,dist:number,kind:('terrain'|'prop')}}
   */
  function raycast(origin, dir, maxDist) {
    // props first — they bound the terrain march
    let best = Infinity, bestKind = null;
    for (const c of props.colliders) {
      const t = rayAABB(origin, dir, c, Math.min(maxDist, best), _aabbNrm);
      if (t >= 0 && t < best) { best = t; bestKind = 'prop'; _bestNrm.copy(_aabbNrm); }
    }
    // terrain march with adaptive step + bisection refinement
    let terrainT = -1;
    let t = 0;
    let clearance = origin.y - heightField.getHeightAt(origin.x, origin.z);
    if (clearance <= 0) {
      terrainT = 0;
    } else {
      const limit = Math.min(maxDist, best);
      let prevT = 0;
      while (t < limit) {
        const step = Math.min(Math.max(clearance * 0.5, 0.5), 2.0);
        prevT = t;
        t = Math.min(t + step, limit);
        _pt.copy(dir).multiplyScalar(t).add(origin);
        if (dir.y > 0 && _pt.y > heightField.maxY + 2) break; // rising above all terrain
        clearance = _pt.y - heightField.getHeightAt(_pt.x, _pt.z);
        if (clearance <= 0) {
          let lo = prevT, hi = t;
          for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) * 0.5;
            _bisA.copy(dir).multiplyScalar(mid).add(origin);
            if (_bisA.y - heightField.getHeightAt(_bisA.x, _bisA.z) <= 0) hi = mid; else lo = mid;
          }
          terrainT = (lo + hi) * 0.5;
          break;
        }
        if (t >= limit) break;
      }
    }
    let hitT, kind;
    if (terrainT >= 0 && terrainT < best) { hitT = terrainT; kind = 'terrain'; }
    else if (bestKind && best <= maxDist) { hitT = best; kind = 'prop'; }
    else return null;
    const point = new THREE.Vector3().copy(dir).multiplyScalar(hitT).add(origin);
    const normal = kind === 'terrain'
      ? heightField.getNormalAt(point.x, point.z).clone()
      : _bestNrm.clone();
    return { point, normal, dist: hitT, kind };
  }

  return {
    mapId: config.id,
    config,
    heightField,
    raycast,
    /** @returns {Array<{min:number[],max:number[]}>} static obstacle AABBs */
    getObstacles: () => obstacles,
    spawnPoints,
    /** @returns {{roads:Array, buildings:Array, treeClusters:Array, waterOrSoft:Array}} minimap features */
    getMinimapFeatures: () => ({
      roads: layout.roads.map((nodes) => nodes.map(([x, z]) => [x, z])),
      buildings: props.features.buildings.map((b) => ({ ...b })),
      treeClusters: vegetation._clusters.map((c) => ({ x: c.x, z: c.z, r: c.r })),
      waterOrSoft: [...layout.marshes, ...layout.lakes].map((m) => ({ x: m.x, z: m.z, r: m.r })),
    }),
    /**
     * Per-frame world update: terrain LOD swap + vegetation wind/density.
     * @param {number} dt seconds
     * @param {THREE.Vector3} cameraPos world camera position
     */
    update(dt, cameraPos) {
      terrain.userData.updateLOD(cameraPos);
      vegetation.update(dt, cameraPos);
    },
    /** Freeze hook for screenshots. @param {number} t wind time, seconds */
    setWindTime(t) { vegetation.setWindTime(t); },
    /**
     * Sniper near-grass suppression passthrough (see vegetation.setSniperFade).
     * @param {number} f target fade 0..1
     * @param {boolean} [immediate=false] snap instead of easing
     */
    setSniperFade(f, immediate = false) { vegetation.setSniperFade(f, immediate); },
    group,
  };
}
