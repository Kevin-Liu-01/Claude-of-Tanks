// src/world/map.js — composes terrain meshes + vegetation + props into the World.
// Contract: docs/ARCHITECTURE.md §2.7 (World shape), §3.2 (layout rules).
// Which battlefield gets built is driven by a map config (src/world/maps/*):
// createMap(engineCtx, { mapId }) — 'verdant' | 'desert' | 'winter' | 'urban'.

import * as THREE from 'three';
import { createHeightField, buildTerrainMeshes, buildTerrainMeshesAsync } from './terrain.js';
import { createVegetation, createVegetationAsync } from './vegetation.js';
import { createProps, createPropsAsync } from './props.js';
import { getMapConfig } from './maps/index.js';
import { createObstacleGrid, rayCollisionRecord } from './collision.js';

const _pt = new THREE.Vector3();
const _bisA = new THREE.Vector3();

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
  return assembleWorld(engineCtx, config, heightField, terrain, vegetation, props);
}

/**
 * BOOT DEFERRAL: same world, built one subsystem per animation frame so a
 * loading bar can report real progress and keep animating instead of freezing
 * for the whole build. main.js uses this for the pre-battle load; the
 * synchronous {@link createMap} stays the path for screenshot-contract map
 * switches (which must not span frames).
 *
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {{mapId?:string, seed?:number}} [opts] world options
 * @param {?function(string, number): (Promise<void>|void)} [onStep] called
 *   BEFORE each subsystem with (label, fractionComplete); await it to yield
 * @returns {Promise<object>} World (ARCHITECTURE §2.7) + {mapId, config}
 */
export async function createMapAsync(engineCtx, { mapId = 'verdant', seed = 1337 } = {},
  onStep = null) {
  const config = getMapConfig(mapId);
  const step = async (label, f) => { if (onStep) await onStep(label, f); };
  // perf-r3 (play-session probe): the old five-yield build left each
  // subsystem ATOMIC — 1.5-2.4 s tasks that pinned the loading bar (and
  // fused into a single ~29 s task on a loaded machine). Each subsystem now
  // drains its chunked twin, yielding through `step` after every slice so
  // the bar creeps THROUGH a subsystem instead of jumping between them.
  const sub = (label, f0, f1) => (done, total) =>
    step(label, f0 + (f1 - f0) * (done / Math.max(1, total)));
  await step('Surveying terrain', 0.0);
  const heightField = createHeightField(seed, config);
  await step('Building terrain meshes', 0.34);
  const terrain = await buildTerrainMeshesAsync(heightField, engineCtx, config,
    sub('Building terrain meshes', 0.34, 0.58));
  await step('Planting vegetation', 0.58);
  const vegetation = await createVegetationAsync(heightField, engineCtx, 2001, config,
    sub('Planting vegetation', 0.58, 0.82));
  await step('Placing structures', 0.82);
  const props = await createPropsAsync(heightField, engineCtx, 2002, config,
    sub('Placing structures', 0.82, 0.96));
  await step('Sealing the battlefield', 0.96);
  return assembleWorld(engineCtx, config, heightField, terrain, vegetation, props);
}

/**
 * Wire built subsystems into the World facade and add it to the scene. Shared
 * by {@link createMap} and {@link createMapAsync} so both produce an identical
 * world object.
 * @returns {object} World (ARCHITECTURE §2.7)
 */
function assembleWorld(engineCtx, config, heightField, terrain, vegetation, props) {
  const layout = heightField._layout;

  const group = new THREE.Group();
  group.name = 'world-' + config.id;
  group.add(terrain, vegetation.group, props.group);
  engineCtx.scene.add(group);
  // perf-governor r1 (discoverthreejs "matrixAutoUpdate = false for static
  // objects"): every world dynamic goes through instanceMatrix writes or
  // shader uniforms — no object-level transform under this group ever changes
  // after build (breaks/crushes zero-scale INSTANCES; the grass carpet
  // re-parks instances; wind is vertex-shader). Freeze the whole subtree so
  // the per-frame updateMatrixWorld walk stops recomposing hundreds of
  // static matrices.
  group.updateMatrixWorld(true);
  group.traverse((o) => { o.matrixAutoUpdate = false; });

  const obstacles = [...props.obstacles, ...vegetation.treeObstacles];
  // Static spatial broad phases: movement queries only the handful of props
  // around a hull, and a shell/LOS ray only the cells spanned by its segment.
  // The narrow phase still uses the authored OBB/circle/convex footprint.
  const queryObstacles = createObstacleGrid(obstacles);
  const queryColliders = createObstacleGrid(props.colliders);
  const rayCandidates = [];

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
   * Cheap world raycast: heightfield ray-march + tight prop-shape tests.
   * @param {THREE.Vector3} origin ray origin (world)
   * @param {THREE.Vector3} dir unit direction
   * @param {number} maxDist maximum distance, meters
   * @returns {null|{point:THREE.Vector3,normal:THREE.Vector3,dist:number,kind:('terrain'|'prop')}}
   */
  // perf-r3b: the march samples terrain height dozens of times per ray and
  // LOS/spotting fires many rays per frame — the baked 1 m grid (≤ ~1 cm from
  // analytic, tighter than the rendered mesh itself) serves it. Spawn seating
  // above keeps the exact analytic query.
  const hAtF = heightField.getHeightAtFast || heightField.getHeightAt;

  function raycast(origin, dir, maxDist) {
    // props first — they bound the terrain march
    let best = Infinity, bestKind = null;
    const ex = origin.x + dir.x * maxDist;
    const ez = origin.z + dir.z * maxDist;
    queryColliders(
      Math.min(origin.x, ex), Math.min(origin.z, ez),
      Math.max(origin.x, ex), Math.max(origin.z, ez), rayCandidates);
    for (const c of rayCandidates) {
      // DESTRUCTIBLES r1: a destroyed wall segment / truck stops blocking
      // shells and AI line-of-sight — its collider is flagged dead in place
      // (O(1) rematch restore) rather than spliced out.
      if (c.dead) continue;
      const t = rayCollisionRecord(origin, dir, c, Math.min(maxDist, best), _aabbNrm);
      if (t >= 0 && t < best) { best = t; bestKind = 'prop'; _bestNrm.copy(_aabbNrm); }
    }
    // terrain march with adaptive step + bisection refinement
    let terrainT = -1;
    let t = 0;
    let clearance = origin.y - hAtF(origin.x, origin.z);
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
        clearance = _pt.y - hAtF(_pt.x, _pt.z);
        if (clearance <= 0) {
          let lo = prevT, hi = t;
          for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) * 0.5;
            _bisA.copy(dir).multiplyScalar(mid).add(origin);
            if (_bisA.y - hAtF(_bisA.x, _bisA.z) <= 0) hi = mid; else lo = mid;
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
    /** Allocation-free local obstacle broad phase; caller owns `out`. */
    queryObstacles,
    /**
     * SPOTTING WIRING: vegetation concealment discs for src/sim/spotting.js.
     * @returns {Array<{x:number,z:number,r:number,add:number}>}
     */
    getConcealment: () => vegetation.concealers || [],
    // effects_combat r1: crushable props (telegraph poles + world-dressing r1
    // 'loop'-class small clutter) — hull overlap in main.js triggers
    // crushProp (hinge-topple / debris swap) + fx.propCrush splinters.
    crushables: props.crushables || [],
    crushProp: (i, dx, dz, speedMps = 0) => props.crushProp && props.crushProp(i, dx, dz, speedMps),
    // world-dressing r1: destructible small-prop records (probes/debug —
    // gameplay paths run through crushObstacle/crushProp/the fx seam)
    destructibles: props.destructibles || [],
    // DESTRUCTIBLES r1: baked real-tank wreck placements (probes/debug)
    tankWreckSpots: props.tankWreckSpots || [],
    // gameplay_feel r6: crushable OBSTACLE records. state.js's collider
    // queues the hull overrun, marks the record `crushed`, then calls this
    // for the world-side fall/break. Tree trunks (treeIdx, vegetation.js)
    // hinge-topple; world-dressing r1 destructible props (propIdx, props.js
    // — fences, carts, stalls, bales, lamps...) topple or swap to debris via
    // the same seam.
    crushObstacle: (ob, dx, dz, speedMps = 0) => {
      if (!ob) return false;
      if (ob.treeIdx != null && vegetation.crushTree) return vegetation.crushTree(ob, dx, dz);
      // DESTRUCTIBLES r1: the overrun speed rides through so debris inherits
      // the hull's velocity (props.js breakRecord scales the throw).
      if (ob.propIdx != null && props.crushDestructible) return props.crushDestructible(ob.propIdx, dx, dz, speedMps, 'ram');
      return false;
    },
    // DESTRUCTIBLES r1: rematch hook — startBattle restores every broken/
    // toppled destructible of the (cached, reused) world to its intact state.
    resetDestructibles: () => {
      if (props.resetDestructibles) props.resetDestructibles();
      if (vegetation.resetToppled) vegetation.resetToppled();
    },
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
     * @param {THREE.Vector3|null} [cameraFwd] unit camera forward — drives the
     *   scoped grass center-cone clear-out
     * @param {THREE.Vector3|null} [focusPos] chase-camera focus — non-null
     *   enables the tree occlusion fade along focus→camera
     */
    update(dt, cameraPos, cameraFwd = null, focusPos = null) {
      terrain.userData.updateLOD(cameraPos);
      vegetation.update(dt, cameraPos, cameraFwd, focusPos);
      if (props.updateProps) props.updateProps(dt); // pole hinge-topple anims
    },
    /** Freeze hook for screenshots. @param {number} t wind time, seconds */
    setWindTime(t) { vegetation.setWindTime(t); },
    /**
     * Sniper near-grass suppression passthrough (see vegetation.setSniperFade).
     * @param {number} f target fade 0..1
     * @param {boolean} [immediate=false] snap instead of easing
     * @param {number} [fovDeg] live camera FOV — high zoom (≤15°) switches the
     *   scope-corridor foliage fade from screen-door dither to a binary cut
     * @param {number} [aimDistM] live server-aim distance (rig.aimDist) — the
     *   scope-ray foliage corridor is culled out to this distance (r5)
     */
    setSniperFade(f, immediate = false, fovDeg = null, aimDistM = null) {
      vegetation.setSniperFade(f, immediate, fovDeg, aimDistM);
    },
    group,
  };
}
