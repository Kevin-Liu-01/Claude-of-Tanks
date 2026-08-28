// src/world/terrain.js — 1 km simplex heightfield + chunked LOD meshes + splat-blended
// procedural PBR ground material. Pure part (createHeightField) is node-runnable.
// Contract: docs/ARCHITECTURE.md §2.7, §3.2; visuals per docs/research/graphics-aaa.md §6–7.

import * as THREE from 'three';
import {
  initialTerrainLods,
  terrainLodForDistance,
  warmTerrainLodBuilds,
} from './terrainLodPolicy.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { applySourcedTerrain } from './sourcedTextures.js';
import { buildHorizonRing } from './maps/horizon.js';
// MOBILE r1: central tier texture scale (desktop returns sizes unchanged)
import { texSize } from '../engine/quality.ts';
import { registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const HALF = 512;
const MAP_SIZE = 1024;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

// ---------------------------------------------------------------------------
// Map layout — seed-independent composition (roads, village, spawns, marshes,
// lakes, drivable corridors), built from a map config (src/world/maps/*).
// Shared by the other world modules via heightField._layout.
// ---------------------------------------------------------------------------

function buildCountryRoads() {
  const roadA = []; // roughly N-S, curving through the village
  for (let z = -HALF; z <= HALF; z += 32) {
    roadA.push([10 + 26 * Math.sin(z * 0.0062) + 8 * Math.sin(z * 0.017 + 2.1), z]);
  }
  const roadB = []; // roughly E-W
  for (let x = -HALF; x <= HALF; x += 32) {
    roadB.push([x, 46 + 34 * Math.sin(x * 0.0043 + 1.0) + 7 * Math.sin(x * 0.013 - 0.6)]);
  }
  return [roadA, roadB];
}

// straight-ish grid streets (urban): N-S lines at xs[], E-W lines at zs[].
// maps r1 (ADDITIVE): an entry may be an OBJECT {at, lo?, hi?} clipping the
// line's along-axis extent (coastal roads must END at the shore, not pave
// across the bay). Plain numbers keep the classic full-map span.
function buildGridRoads(grid) {
  const roads = [];
  const jit = grid.jitter ?? 2.5;
  const parse = (e) => (typeof e === 'number'
    ? { at: e, lo: -HALF, hi: HALF }
    : { at: e.at, lo: e.lo ?? -HALF, hi: e.hi ?? HALF });
  for (let gi = 0; gi < grid.xs.length; gi++) {
    const { at: gx, lo, hi } = parse(grid.xs[gi]);
    const line = [];
    for (let z = lo; z <= hi; z += 32) {
      line.push([gx + Math.sin(z * 0.011 + gi * 2.3) * jit, z]);
    }
    roads.push(line);
  }
  for (let gi = 0; gi < grid.zs.length; gi++) {
    const { at: gz, lo, hi } = parse(grid.zs[gi]);
    const line = [];
    for (let x = lo; x <= hi; x += 32) {
      line.push([x, gz + Math.sin(x * 0.011 + gi * 1.7) * jit]);
    }
    roads.push(line);
  }
  return roads;
}

// Authored route networks for maps whose identity depends on something more
// legible than the shared country cross or an infinite street grid. Designers
// provide a few control points; this resamples them to the same ~32 m spacing
// as the legacy roads so road-distance queries and prop placement keep their
// established cost/behavior.
function buildPathRoads(paths) {
  const roads = [];
  for (const path of paths || []) {
    if (!Array.isArray(path) || path.length < 2) continue;
    const line = [];
    for (let pi = 0; pi < path.length - 1; pi++) {
      const [ax, az] = path[pi], [bx, bz] = path[pi + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 32));
      for (let step = 0; step < steps; step++) {
        const t = step / steps;
        line.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      }
    }
    line.push([...path[path.length - 1]]);
    roads.push(line);
  }
  return roads;
}

const DEFAULT_TERRAIN = {
  hillScale: 1.0,
  microScale: 1.0,
  rimH: 24, // tall enough that the rim crest hides the fogged outer floor
  village: { x0: -60, x1: 80, z0: -40, z1: 120, cx: 10, cz: 40, feather: 42, flatten: 0.85 },
  marshes: [
    { x: 220, z: -140, r: 38 },
    { x: -190, z: -210, r: 48 },
    { x: -330, z: 330, r: 30 },
  ],
  lakes: [],           // [{x,z,r,depth}] — flattened frozen/ice sheets
  frozenMarshes: false, // marsh/lake ground reads 'hard' (ice) instead of 'soft'
  dunes: null,          // {amp} — long ridged sand dunes
  mesas: null,          // {amp, thr0, thr1} — flat-topped plateaus
  // Broad authored tactical forms. These are analytical (no meshes or draw
  // calls) and are shared by the rendered and headless height fields.
  // ridge: {kind:'ridge',x,z,length,width,height,yawDeg}; knoll/basin use
  // {rx,rz,height,yawDeg}. Negative height creates a basin.
  landforms: [],
  roads: 'country',     // 'country' | {grid?,paths?}; both may be combined
};

const DEFAULT_SPAWNS = {
  player: { x: 14, z: -78 },
  enemies: [
    { x: -30, z: 320 }, { x: 140, z: 350 }, { x: 265, z: 235 }, { x: -215, z: 270 },
    { x: -330, z: 140 }, { x: 330, z: 130 }, { x: 15, z: 430 },
  ],
};

/**
 * Build the seed-independent layout object for a map config.
 * @param {?object} cfg map config (src/world/maps/*) or null for defaults
 * @returns {{village:object,marshes:Array,lakes:Array,spawns:object,roads:Array}}
 */
export function createLayout(cfg) {
  const t = { ...DEFAULT_TERRAIN, ...(cfg && cfg.terrain ? cfg.terrain : {}) };
  t.landforms = (t.landforms || []).map((form) => {
    const yaw = THREE.MathUtils.degToRad(form.yawDeg || 0);
    return { ...form, _c: Math.cos(yaw), _s: Math.sin(yaw) };
  });
  const village = { ...DEFAULT_TERRAIN.village, ...(t.village || {}) };
  const spawnsSrc = (cfg && cfg.spawns) || DEFAULT_SPAWNS;
  const player = { ...spawnsSrc.player };
  const enemies = spawnsSrc.enemies.map((e) => ({ ...e }));
  // Deployment orientation is tactical, not decorative: both spawn zones
  // face the opposing zone. The former "face the village" rule pointed some
  // far-side arcs away from their opponents (and network authority then
  // inverted that yaw a second time). Allies inherit the player yaw; each
  // enemy pad faces the player-team centroid directly.
  let enemyCx = 0, enemyCz = 0;
  for (const enemy of enemies) { enemyCx += enemy.x; enemyCz += enemy.z; }
  enemyCx /= enemies.length || 1;
  enemyCz /= enemies.length || 1;
  player.yaw = Math.atan2(enemyCx - player.x, enemyCz - player.z);
  for (const enemy of enemies) {
    enemy.yaw = Math.atan2(player.x - enemy.x, player.z - enemy.z);
  }
  let roads;
  if (t.roads === 'country' || !t.roads) {
    roads = buildCountryRoads();
  } else {
    roads = [];
    if (t.roads.grid) roads.push(...buildGridRoads(t.roads.grid));
    if (t.roads.paths) roads.push(...buildPathRoads(t.roads.paths));
    if (roads.length === 0) roads = buildCountryRoads();
  }
  return {
    village,
    // maps r1 (ADDITIVE): per-marsh carve depth `dip` (m). Default 2.6 = the
    // classic soggy bowl every pre-existing map bakes; river maps author
    // shallow fordable channels by chaining small-dip marshes along a curve.
    marshes: (t.marshes || []).map((m) => ({ dip: 2.6, ...m })),
    lakes: (t.lakes || []).map((l) => ({ ...l })),
    spawns: { player, enemies },
    roads,
    terrain: t,
  };
}

// squared point-to-segment distance, returning t of the projection
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return { d: Math.sqrt(ex * ex + ez * ez), t };
}

/** Pure analytical height contribution for an authored tactical landform. */
export function sampleLandformHeight(form, x, z) {
  const dx = x - form.x, dz = z - form.z;
  const c = form._c ?? Math.cos(THREE.MathUtils.degToRad(form.yawDeg || 0));
  const s = form._s ?? Math.sin(THREE.MathUtils.degToRad(form.yawDeg || 0));
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const height = form.height || 0;
  if (form.kind === 'ridge') {
    const half = Math.max(1, (form.length || 100) * 0.5);
    const width = Math.max(1, form.width || 45);
    const along = 1 - smoothstep(half * 0.72, half, Math.abs(lx));
    const across = 1 - smoothstep(width * 0.22, width, Math.abs(lz));
    // A wide crown plus a softer shoulder reads as a natural fold and keeps
    // tanks stable on the crest; the squared falloff avoids cliff walls.
    const shoulder = across * across * (3 - 2 * across);
    return height * along * shoulder;
  }
  const rx = Math.max(1, form.rx || form.r || 70);
  const rz = Math.max(1, form.rz || form.r || rx);
  const q = Math.sqrt((lx * lx) / (rx * rx) + (lz * lz) / (rz * rz));
  const w = 1 - smoothstep(0.12, 1, q);
  return height * w * w * (3 - 2 * w);
}

// ---------------------------------------------------------------------------
// createHeightField — PURE, node-runnable
// ---------------------------------------------------------------------------

/**
 * Build the deterministic heightfield for the 1024 m map.
 * @param {number} [seed=1337] terrain seed (mulberry32)
 * @param {?object} [cfg=null] map config (src/world/maps/*); null = classic verdant
 * @returns {{getHeightAt:function(number,number):number,
 *   getNormalAt:function(number,number):THREE.Vector3,
 *   getGroundType:function(number,number):('hard'|'medium'|'soft'),
 *   getWaterMaskAt:function(number,number):number,
 *   size:number, minY:number, maxY:number}} HeightField (ARCHITECTURE §2.7)
 */
export function createHeightField(seed = 1337, cfg = null) {
  const layout = createLayout(cfg);
  const T = layout.terrain;
  const _VILLAGE = layout.village;
  const _MARSHES = layout.marshes;
  const _LAKES = layout.lakes;
  const _SPAWN_PLAYER = layout.spawns.player;
  const _SPAWN_ENEMIES = layout.spawns.enemies;
  const noi = new SimplexNoise({ random: mulberry32((seed ^ 0x9e3779b9) >>> 0) });

  // --- base noise: fBm detail + domain-warped ridge, and a smooth variant ---
  function core(x, z) {
    const wx = noi.noise(x * 0.0016 + 13.7, z * 0.0016 - 4.2) * 80;
    const wz = noi.noise(x * 0.0016 - 27.1, z * 0.0016 + 9.3) * 80;
    let rr = 1 - Math.abs(noi.noise((x + wx) * 0.0026 + 51, (z + wz) * 0.0026 - 33));
    const ridge = rr * rr * 6.5;
    const o0 = noi.noise(x * 0.0038 + 101, z * 0.0038 - 71) * 8.5;
    const o1 = noi.noise(x * 0.0079 - 11, z * 0.0079 + 177) * 4.1;
    let d = ridge + o0 + o1;
    d += noi.noise(x * 0.0152 + 301, z * 0.0152 + 41) * 1.9;
    d += noi.noise(x * 0.0313 - 222, z * 0.0313 - 97) * 0.85;
    d += noi.noise(x * 0.064 + 77, z * 0.064 + 13) * 0.35;
    d += noi.noise(x * 0.131 - 8, z * 0.131 + 259) * 0.14;
    const s = ridge * 0.5 + o0 + o1 * 0.45;
    return { d, s };
  }

  // --- precomputed field grid: road distance/elevation + corridor weight ---
  const GN = 257, CELL = MAP_SIZE / (GN - 1); // 4 m cells
  const gRoadDist = new Float32Array(GN * GN).fill(1e9);
  const gRoadElev = new Float32Array(GN * GN);
  const gSegRoad = new Int16Array(GN * GN);
  const gSegIdx = new Int16Array(GN * GN);
  const gSegT = new Float32Array(GN * GN);
  const gCorridor = new Float32Array(GN * GN);

  const roads = layout.roads;
  const corridors = [_SPAWN_PLAYER, ..._SPAWN_ENEMIES].map(
    (s) => [s.x, s.z, _VILLAGE.cx, _VILLAGE.cz]
  );

  for (let gz = 0; gz < GN; gz++) {
    const z = gz * CELL - HALF;
    for (let gx = 0; gx < GN; gx++) {
      const x = gx * CELL - HALF;
      const i = gz * GN + gx;
      for (let r = 0; r < roads.length; r++) {
        const nodes = roads[r];
        for (let s = 0; s < nodes.length - 1; s++) {
          const { d, t } = segDist(x, z, nodes[s][0], nodes[s][1], nodes[s + 1][0], nodes[s + 1][1]);
          if (d < gRoadDist[i]) { gRoadDist[i] = d; gSegRoad[i] = r; gSegIdx[i] = s; gSegT[i] = t; }
        }
      }
      let cw = 0;
      for (const c of corridors) {
        const { d } = segDist(x, z, c[0], c[1], c[2], c[3]);
        cw = Math.max(cw, 1 - smoothstep(8, 30, d));
      }
      gCorridor[i] = cw;
    }
  }

  function gridSample(arr, x, z) {
    const gx = clamp((x + HALF) / CELL, 0, GN - 1.0001);
    const gz = clamp((z + HALF) / CELL, 0, GN - 1.0001);
    const x0 = gx | 0, z0 = gz | 0, fx = gx - x0, fz = gz - z0;
    const i = z0 * GN + x0;
    const a = arr[i] + (arr[i + 1] - arr[i]) * fx;
    const b = arr[i + GN] + (arr[i + GN + 1] - arr[i + GN]) * fx;
    return a + (b - a) * fz;
  }

  function sampleMesaNoise(x, z) {
    const mwp = noi.noise(x * 0.0009 + 77, z * 0.0009 - 31) * 95;
    return noi.noise((x + mwp) * 0.0014 - 310,
      (z - mwp * 0.8) * 0.0014 + 208) * 0.5 + 0.5;
  }

  const villageY = core(_VILLAGE.cx, _VILLAGE.cz).s;

  function villageMask(x, z) {
    const dx = Math.max(_VILLAGE.x0 - x, x - _VILLAGE.x1, 0);
    const dz = Math.max(_VILLAGE.z0 - z, z - _VILLAGE.z1, 0);
    return (1 - smoothstep(0, _VILLAGE.feather, Math.hypot(dx, dz))) * (_VILLAGE.flatten ?? 0.85);
  }

  const padYs = new Float64Array(8); // filled below (player + 7 enemies)
  const padPts = [_SPAWN_PLAYER, ..._SPAWN_ENEMIES];
  const lakeLevels = new Float64Array(Math.max(1, _LAKES.length)); // filled below

  function heightAt(x, z, padsOn, roadsOn, lakesOn = true) {
    x = clamp(x, -HALF, HALF); z = clamp(z, -HALF, HALF);
    const { d, s } = core(x, z);
    const cw = gridSample(gCorridor, x, z);
    let h = (d + (s - d) * (cw * 0.72)) * T.hillScale;
    const vm = villageMask(x, z);
    // village.relief (r6): fraction of the smooth terrain variation kept
    // inside the flattened settlement rect. Default 0.10 (near-billiard).
    // The urban map raises it so the town sits on gentle elevation drift
    // (1-3 m across the grid) instead of a perfectly flat pancake.
    if (vm > 0) h += (villageY * T.hillScale + (s - villageY) * (_VILLAGE.relief ?? 0.10) - h) * vm;
    let marshW = 0;
    for (const m of _MARSHES) {
      const md = Math.hypot(x - m.x, z - m.z);
      if (md < m.r) {
        const t = 1 - md / m.r;
        h -= m.dip * t * t * (3 - 2 * t); // dip normalized to 2.6 in createLayout
        marshW = Math.max(marshW, t);
      }
    }
    // map-specific macro forms: long ridged sand dunes / flat-topped mesas —
    // both attenuated on drive corridors and in the village so play flows.
    // r9 SPAWN CLEARANCE: macro landforms also fade out around every spawn
    // pad — a mesa wall rising through the 9-22 m pad blend used to notch a
    // flat shelf into the cliff face with the spawned tank half-EMBEDDED in
    // the rock (desert establishing shot: green hull sunk in the mesa flank).
    let spawnClear = 1;
    if (T.dunes || T.mesas || T.landforms.length) {
      for (let p = 0; p < padPts.length; p++) {
        const pd = Math.hypot(x - padPts[p].x, z - padPts[p].z);
        if (pd < 90) spawnClear = Math.min(spawnClear, smoothstep(36, 90, pd));
      }
    }
    if (T.dunes) {
      // r5 terrain_environment: ASYMMETRIC dune profile. Real transverse
      // dunes ramp gently up the windward side and drop on a steep slip face
      // downwind of the brink; the old symmetric ridge^3 read as featureless
      // blobby mounds (critique). Compare the ridge field against a sample
      // ~16 m UPWIND (global wind [0.8,0.6], matching the splat rippleDir):
      // windward faces (higher than upwind) fill toward the crest, lee faces
      // (lower than upwind) drop away faster — a slip-face brink. A short
      // ~24 m crest-ripple octave roughens the brink line so dune tops stop
      // reading as airbrushed domes from the establishing camera.
      const dn = 1 - Math.abs(noi.noise(x * 0.0021 + 402, z * 0.0046 + 91));
      const dnu = 1 - Math.abs(noi.noise((x - 12.8) * 0.0021 + 402, (z - 9.6) * 0.0046 + 91));
      const dn2 = noi.noise(x * 0.0064 - 55, z * 0.0064 + 233) * 0.5 + 0.5;
      // Two already-required samples across the wind axis form one broad dune mass instead
      // of cubing a single zero-crossing into a needle ridge. Smoothstep
      // gives both the toe and crest a zero derivative; the smaller skew
      // retains a readable lee face without a razor brink. Keeping this to
      // the original pair preserves the terrain hot-loop noise budget.
      const dnb = dn * 0.62 + dnu * 0.38;
      const dnub = dnu * 0.65 + dn * 0.35;
      const dnc = dnb * dnb * (3 - 2 * dnb);
      const dnuc = dnub * dnub * (3 - 2 * dnub);
      const skew = clamp((dnc - dnuc) * 2.0, -0.28, 0.28);
      let duneH = dnc * T.dunes.amp * (0.7 + dn2 * 0.5) * (1 + skew * 0.55);
      duneH += smoothstep(0.55, 0.95, dnc) * noi.noise(x * 0.041 + 17, z * 0.041 - 63)
        * 0.45 * T.dunes.amp * 0.08;
      h += duneH * (1 - cw * 0.7) * (1 - vm) * spawnClear;
    }
    if (T.mesas) {
      // domain-warped mesa field (r5): unwarped blobs read as lumpy noise
      // mounds; the warp stretches outlines into the irregular embayed
      // escarpment plan real tablelands show from above
      const mn = sampleMesaNoise(x, z);
      // real mesa profile: near-vertical cliff wall, flat cap, plus a smaller
      // second tier so big buttes read stepped. Wall band widened 0.28 -> 0.42
      // and tier2 widened (r5): the old widths crossed the full 38 m rise
      // within ~one far-LOD vertex (5.3 m), leaving single-vertex facet
      // spikes on the escarpment edges (the crimson spike artifact).
      const band = (T.mesas.thr1 - T.mesas.thr0);
      // Some maps want sheer tableland walls; village-adjacent desert mesas
      // need a longer talus shoulder so a threshold island cannot collapse
      // into a one-cell triangular spike. Both controls are map-authored and
      // preserve the legacy profile when omitted.
      const wallWidth = T.mesas.wallWidth ?? 0.42;
      const tierWidth = T.mesas.tierWidth ?? 0.045;
      const wall = smoothstep(T.mesas.thr0, T.mesas.thr0 + band * wallWidth, mn);
      const tier2 = smoothstep(T.mesas.thr1 + 0.04, T.mesas.thr1 + 0.04 + tierWidth, mn);
      const tierScale = T.mesas.tierScale ?? 0.45;
      const capNoise = 0.97 + 0.03 * noi.noise(x * 0.012 + 31, z * 0.012 - 74);
      // Never cut the entire mesa height out along a synthetic spawn-to-town
      // corridor: several converging corridors otherwise leave thin wedges
      // of full-height rock between them. Those wedges were the dark shark-
      // fin hills visible behind Sirocco's village. The actual roadbed still
      // grades the final surface below; this floor only keeps the surrounding
      // landform continuous.
      const corridorFloor = T.mesas.corridorFloor ?? 0;
      const corridorProtect = 1 - cw * (1 - corridorFloor);
      h += (wall + tier2 * tierScale) * T.mesas.amp * capNoise
        * corridorProtect * (1 - vm) * (1 - marshW) * spawnClear;
    }
    // Authored macro composition: broad ridge lines, knolls, slag heaps,
    // levees and shallow basins break the expansion maps into distinct lanes
    // without adding a single render object. Roads are grounded later in the
    // pipeline; the weights here merely keep their approaches readable.
    for (let li = 0; li < T.landforms.length; li++) {
      const form = T.landforms[li];
      const corridorScale = form.corridorScale ?? 0.62;
      const settlementScale = form.settlementScale ?? 0.45;
      const wetScale = form.wetScale ?? 0.30;
      const protect = (1 - cw * (1 - corridorScale))
        * (1 - vm * (1 - settlementScale))
        * (1 - marshW * (1 - wetScale));
      h += sampleLandformHeight(form, x, z) * spawnClear * protect;
    }
    // tactical micro-terrain: berm crests + shallow scrapes every ~70-110 m so
    // the open midfield offers hull-down folds instead of a flat golf course.
    // Attenuated (not zeroed) on drive corridors so they stay drivable, and
    // suppressed in the village/marshes.
    {
      const f1 = noi.noise(x * 0.0104 + 610, z * 0.0104 - 320);
      const f2 = noi.noise(x * 0.0233 - 105, z * 0.0233 + 77);
      let crest = 1 - Math.abs(f1);
      crest *= crest;
      let micro = smoothstep(0.42, 0.92, crest) * (2.1 + f2 * 0.8) // berms/ridgelines
        - smoothstep(0.55, 0.92, f2) * 1.5;                        // shallow depressions
      micro *= (1 - cw * 0.55) * (1 - vm) * (1 - marshW) * T.microScale;
      h += micro;
    }
    // r3 terrain_environment: near-field micro-relief — 3-8 m humps, scrapes
    // and settling (~10-25 cm) so the ground stops reading as a smooth
    // blanket under every prop and tank. Small enough not to disturb play;
    // suppressed in the village and softened in marshes. Roads/pads flatten
    // over it via their blends below.
    {
      const m1 = noi.noise(x * 0.143 + 88, z * 0.143 - 141);
      const m2 = noi.noise(x * 0.317 - 260, z * 0.317 + 33);
      h += (m1 * 0.16 + m2 * 0.07) * (1 - vm) * (1 - marshW * 0.7) * T.microScale;
    }
    const rim = smoothstep(430, HALF, Math.max(Math.abs(x), Math.abs(z)));
    h += rim * rim * T.rimH;
    // frozen/ice lakes: pull the terrain to a flat sheet at the lake level.
    // The flat sheet runs almost to the shore (0.94 r), and the grade toward
    // the surrounding terrain extends well OUTSIDE the sheet (1.32 r): the
    // lake level tracks the lowest shore, so on the uphill side the raw
    // terrain can sit 10+ m above the sheet — graded over ~35 m that is a
    // snowy bank; over the old few-meter band it was a sheer quarry wall.
    if (lakesOn) {
      for (let li = 0; li < _LAKES.length; li++) {
        const lk = _LAKES[li];
        const ld = Math.hypot(x - lk.x, z - lk.z);
        if (ld < lk.r * 1.32) {
          const w = smoothstep(lk.r * 1.32, lk.r * 0.94, ld);
          h += (lakeLevels[li] - h) * w;
        }
      }
    }
    if (padsOn) {
      for (let p = 0; p < padPts.length; p++) {
        const pd = Math.hypot(x - padPts[p].x, z - padPts[p].z);
        if (pd < 22) h += (padYs[p] - h) * (1 - smoothstep(9, 22, pd));
      }
    }
    if (roadsOn) {
      const rd = gridSample(gRoadDist, x, z);
      // wide feather: the roadbed melts into the terrain instead of sitting
      // proud on an embankment shelf
      if (rd < 14) h += (gridSample(gRoadElev, x, z) - h) * (1 - smoothstep(3.8, 14, rd));
      // r3 terrain_environment: roadside berm + drainage ditch profile — a
      // low graded shoulder hump (~25 cm) and a shallow ditch beyond it,
      // both wandering in strength along the road, so the carriageway reads
      // built into the landscape instead of painted onto a smooth blanket
      if (rd > 4 && rd < 22) {
        const bermA = 0.5 + 0.5 * noi.noise(x * 0.031 + 71, z * 0.031 - 44);
        const berm = Math.exp(-(((rd - 7.0) / 1.9) ** 2)) * 0.26 * bermA;
        const ditch = -Math.exp(-(((rd - 11.5) / 2.4) ** 2)) * 0.20 * (1 - bermA * 0.5);
        h += (berm + ditch) * (1 - vm) * (1 - marshW);
      }
    }
    return h;
  }

  // --- road node elevations: pre-road height sampled + smoothed + junction blend ---
  const nodeElev = roads.map((nodes) => nodes.map(([nx, nz]) => heightAt(nx, nz, false, false)));
  for (const elev of nodeElev) {
    for (let pass = 0; pass < 4; pass++) {
      const prev = elev.slice();
      for (let i = 1; i < elev.length - 1; i++) elev[i] = prev[i - 1] * 0.25 + prev[i] * 0.5 + prev[i + 1] * 0.25;
    }
  }
  // blend every road pair to a common elevation at their crossing
  for (let ra = 0; ra < roads.length; ra++) for (let rb = ra + 1; rb < roads.length; rb++) {
    let jA = 0, jB = 0, best = 1e9;
    for (let a = 0; a < roads[ra].length; a++) for (let b = 0; b < roads[rb].length; b++) {
      const dd = Math.hypot(roads[ra][a][0] - roads[rb][b][0], roads[ra][a][1] - roads[rb][b][1]);
      if (dd < best) { best = dd; jA = a; jB = b; }
    }
    if (best > 40) continue; // roads never actually cross
    const jElev = (nodeElev[ra][jA] + nodeElev[rb][jB]) * 0.5;
    for (let k = -3; k <= 3; k++) {
      const w = (1 - Math.abs(k) / 4) * 0.85;
      if (nodeElev[ra][jA + k] !== undefined) nodeElev[ra][jA + k] += (jElev - nodeElev[ra][jA + k]) * w;
      if (nodeElev[rb][jB + k] !== undefined) nodeElev[rb][jB + k] += (jElev - nodeElev[rb][jB + k]) * w;
    }
  }
  for (let i = 0; i < GN * GN; i++) {
    const e = nodeElev[gSegRoad[i]];
    const s = gSegIdx[i];
    gRoadElev[i] = e[s] + (e[s + 1] - e[s]) * gSegT[i];
  }

  // --- lake sheet levels (pipeline without lakes/pads), then spawn pads ---
  for (let li = 0; li < _LAKES.length; li++) {
    const lk = _LAKES[li];
    let lo = Infinity;
    // sample the SHORELINE ring (not 0.6 r): the sheet sits just below the
    // lowest bank point, so bank height stays ~depth everywhere instead of
    // stacking the full cross-lake terrain drop onto the near shore
    for (let a = 0; a < 12; a++) {
      const hh = heightAt(lk.x + Math.cos(a * 0.5236) * lk.r * 0.95,
        lk.z + Math.sin(a * 0.5236) * lk.r * 0.95, false, false, false);
      if (hh < lo) lo = hh;
    }
    // maps r1 (ADDITIVE): lk.level pins the sheet elevation absolutely — a
    // multi-circle SEA must share one waterline (per-circle auto levels step
    // where the sheets overlap). Default stays the auto shoreline formula.
    lakeLevels[li] = lk.level ?? (Math.min(lo, heightAt(lk.x, lk.z, false, false, false)) - (lk.depth ?? 1.4));
  }
  for (let p = 0; p < padPts.length; p++) padYs[p] = heightAt(padPts[p].x, padPts[p].z, false, true);

  const getHeightAt = (x, z) => heightAt(x, z, true, true);

  // perf-r3b (CPU profile): every height query runs the full 9-octave simplex
  // stack — a live battle makes ~3.9 k queries per FRAME (LOS ray marches, AI
  // terrain probes), ~2.4 ms of every frame on the probe box. Hot NON-GEOMETRY
  // consumers read this lazily-baked 1 m bilinear grid instead (≤ ~1 cm from
  // the analytic surface — far tighter than the rendered mesh's own 2.7 m
  // discretization of the same function). Everything that SEATS visible
  // geometry (wheel conform, spawns, staged captures, world builders) keeps
  // the exact analytic getHeightAt above, so frozen screenshot/metrology
  // contracts are untouched. Deployment tiles are warmed behind the battle
  // loading veil. Any later first-touch tile is only 16 m (17x17 queries),
  // bounding an unexpected route change to one quarter of the former 32 m
  // bake while returning the exact same bilinear samples.
  const FGN = MAP_SIZE + 1;                 // 1 m verts, 1025^2 ≈ 4.2 MB
  const FTILE = 16;                          // bake granularity (cells)
  const FTN = Math.ceil(MAP_SIZE / FTILE);   // tiles per axis
  const fGrid = new Float32Array(FGN * FGN);
  const fBaked = new Uint8Array(FTN * FTN);
  function bakeFastTile(tx, tz) {
    const x0 = tx * FTILE, z0 = tz * FTILE;
    const x1 = Math.min(MAP_SIZE, x0 + FTILE), z1 = Math.min(MAP_SIZE, z0 + FTILE);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        fGrid[gz * FGN + gx] = heightAt(gx - HALF, gz - HALF, true, true);
      }
    }
    fBaked[tz * FTN + tx] = 1;
  }
  function getHeightAtFast(x, z) {
    const gx = clamp(x + HALF, 0, MAP_SIZE - 1e-4);
    const gz = clamp(z + HALF, 0, MAP_SIZE - 1e-4);
    const x0 = gx | 0, z0 = gz | 0;
    const tx = (x0 / FTILE) | 0, tz = (z0 / FTILE) | 0;
    // each tile bakes its far border row/col inclusively, so the bilinear
    // read below never leaves this tile's baked region
    if (!fBaked[tz * FTN + tx]) bakeFastTile(tx, tz);
    const fx = gx - x0, fz = gz - z0;
    const i = z0 * FGN + x0;
    const a = fGrid[i] + (fGrid[i + 1] - fGrid[i]) * fx;
    const b = fGrid[i + FGN] + (fGrid[i + FGN + 1] - fGrid[i + FGN]) * fx;
    return a + (b - a) * fz;
  }

  /**
   * Bake fast-grid tiles around known deployment points. This is a generator
   * so loading-screen callers can yield between tiles and preserve progress
   * paints on constrained devices. Each point may provide `radiusM`.
   */
  function* warmFastTilesAround(points) {
    const queued = new Set();
    for (const point of points || []) {
      if (!point) continue;
      const radius = Math.max(0, Number(point.radiusM) || 0);
      const gx0 = clamp(finiteCoord(point.x) + HALF - radius, 0, MAP_SIZE - 1e-4);
      const gz0 = clamp(finiteCoord(point.z) + HALF - radius, 0, MAP_SIZE - 1e-4);
      const gx1 = clamp(finiteCoord(point.x) + HALF + radius, 0, MAP_SIZE - 1e-4);
      const gz1 = clamp(finiteCoord(point.z) + HALF + radius, 0, MAP_SIZE - 1e-4);
      const tx0 = ((gx0 | 0) / FTILE) | 0;
      const tz0 = ((gz0 | 0) / FTILE) | 0;
      const tx1 = ((gx1 | 0) / FTILE) | 0;
      const tz1 = ((gz1 | 0) / FTILE) | 0;
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) queued.add(tz * FTN + tx);
      }
    }
    for (const key of queued) {
      const tx = key % FTN;
      const tz = (key / FTN) | 0;
      if (fBaked[key]) continue;
      bakeFastTile(tx, tz);
      yield key;
    }
  }

  function finiteCoord(value) {
    return Number.isFinite(value) ? value : 0;
  }

  const _scratchN = new THREE.Vector3();
  const NEPS = 1.2;
  function getNormalAt(x, z) {
    const hl = getHeightAt(x - NEPS, z), hr = getHeightAt(x + NEPS, z);
    const hd = getHeightAt(x, z - NEPS), hu = getHeightAt(x, z + NEPS);
    return _scratchN.set(hl - hr, 2 * NEPS, hd - hu).normalize();
  }

  function getGroundType(x, z) {
    if (gridSample(gRoadDist, x, z) < 4.3) return 'hard';
    for (const lk of _LAKES) {
      // maps r1 (ADDITIVE): terrain.softLakes = liquid-water sheets (coastal
      // shallows) drive as bogged 'soft' ground; default stays 'hard' (ice).
      if (Math.hypot(x - lk.x, z - lk.z) < lk.r * 0.95) return T.softLakes ? 'soft' : 'hard';
    }
    for (const m of _MARSHES) {
      const md = Math.hypot(x - m.x, z - m.z);
      if (md < m.r && 1 - md / m.r > 0.35) return T.frozenMarshes ? 'hard' : 'soft';
    }
    return 'medium';
  }

  /**
   * Return the authored liquid-water coverage at a world-space point.
   *
   * This deliberately mirrors the sea/lake splat inputs instead of sampling
   * pixels or allocating a surface descriptor. Battle hot paths use it for
   * track wakes, so the query stays numeric, deterministic and allocation
   * free. Frozen marshes/lakes remain solid ground even when they reuse the
   * wetness channel for ice rendering.
   *
   * @returns {number} 0 for dry/ice, otherwise a 0..1 liquid coverage mask
   */
  function getWaterMaskAt(x, z) {
    if (T.frozenMarshes || !cfg?.splat?.seaLake) return 0;
    for (let i = 0; i < _LAKES.length; i++) {
      const lk = _LAKES[i];
      const radius = Math.max(0.001, lk.r * 0.95);
      const d = Math.hypot(x - lk.x, z - lk.z);
      if (d < radius) return Math.max(0, Math.min(1, (radius - d) / Math.max(2, radius * 0.08)));
    }
    for (let i = 0; i < _MARSHES.length; i++) {
      const m = _MARSHES[i];
      const radius = Math.max(0.001, m.r);
      const d = Math.hypot(x - m.x, z - m.z);
      // The shader's water body is the marsh core (same threshold used by
      // getGroundType); feather the final few metres for bank transitions.
      const core = 1 - d / radius;
      if (core > 0.35) return Math.max(0, Math.min(1, (core - 0.35) / 0.12));
    }
    return 0;
  }

  // vegetation/prop exclusion: open water/ice + marsh cores
  function noVeg(x, z) {
    for (const lk of _LAKES) {
      if (Math.hypot(x - lk.x, z - lk.z) < lk.r * 1.04) return true;
    }
    for (const m of _MARSHES) {
      if (T.frozenMarshes && Math.hypot(x - m.x, z - m.z) < m.r) return true;
      // maps r1 (ADDITIVE): river maps keep the CHANNEL clear — tufts spawned
      // mid-stream read as flooded stubble. The outer soft band keeps its
      // sparse bank reeds. Default off => pre-existing maps unchanged.
      if (T.clearMarshVeg && Math.hypot(x - m.x, z - m.z) < m.r * 0.55) return true;
    }
    return false;
  }

  // --- min/max over a coarse scan ---
  let minY = Infinity, maxY = -Infinity;
  for (let gz = 0; gz <= 128; gz++) for (let gx = 0; gx <= 128; gx++) {
    const h = getHeightAt(gx * 8 - HALF, gz * 8 - HALF);
    if (h < minY) minY = h; if (h > maxY) maxY = h;
  }

  // r6 terrain_environment: LANDFORM weight — 1 where the MESA field (and the
  // rocky map rim) shapes the terrain, 0 on dunes/flats. The splat shader's
  // slope-driven sandstone takeover keyed on steepness alone, so every steep
  // DUNE slip face inherited the bedded sandstone layer and rendered as
  // horizontal terracing (the "heightmap quantization" critique). Baked to a
  // small mask (createSplatMaterial) so rock/strata live only on real mesas.
  const mesaWeight = T.mesas ? (x, z) => {
    const mn = sampleMesaNoise(x, z);
    const band = (T.mesas.thr1 - T.mesas.thr0);
    // low edge pulled 0.55 band below thr0: the talus apron at the mesa foot
    // keeps its rock identity, the open dune field beyond it does not
    const wall = smoothstep(T.mesas.thr0 - band * 0.55,
      T.mesas.thr0 + band * (T.mesas.wallWidth ?? 0.42), mn);
    const rim = smoothstep(408, 468, Math.max(Math.abs(x), Math.abs(z)));
    return Math.max(wall, rim);
  } : null;

  return {
    getHeightAt, getHeightAtFast, warmFastTilesAround, getNormalAt, getGroundType,
    getWaterMaskAt,
    size: MAP_SIZE, minY, maxY,
    _roadDist: (x, z) => gridSample(gRoadDist, x, z),
    _villageMask: villageMask,
    _noVeg: noVeg,
    _layout: layout,
    _mesaW: mesaWeight,
  };
}

// ---------------------------------------------------------------------------
// applyTone — per-map HSL retint of a generated RGBA pixel buffer (alpha kept:
// it packs roughness in the terrain layers, coverage in foliage cards).
// ---------------------------------------------------------------------------
const _toneCol = new THREE.Color();
const _toneHsl = { h: 0, s: 0, l: 0 };
/**
 * Retint pixels in place through an HSL transform.
 * @param {Uint8ClampedArray} px RGBA buffer
 * @param {?function(number,number,number):number[]} fn (h,s,l) => [h,s,l]
 * @returns {Uint8ClampedArray} the same buffer
 */
export function applyTone(px, fn) {
  if (!fn) return px;
  for (let i = 0; i < px.length; i += 4) {
    _toneCol.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    _toneCol.getHSL(_toneHsl);
    const [h, s, l] = fn(_toneHsl.h, _toneHsl.s, _toneHsl.l);
    _toneCol.setHSL(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1));
    px[i] = _toneCol.r * 255; px[i + 1] = _toneCol.g * 255; px[i + 2] = _toneCol.b * 255;
  }
  return px;
}

// ---------------------------------------------------------------------------
// Procedural PBR texture layers (browser-only; called from buildTerrainMeshes)
// ---------------------------------------------------------------------------

function canvasToTexture(px, s, { srgb = false, anisotropy = 16, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  c.getContext('2d').putImageData(new ImageData(px, s, s), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function normalFromHeight(h, s, strength, anisotropy) {
  const px = new Uint8ClampedArray(s * s * 4);
  const H = (x, y) => h[((y + s) % s) * s + ((x + s) % s)];
  const v = new THREE.Vector3();
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    v.set(-dx * strength, -dy * strength, 1).normalize();
    const i = (y * s + x) * 4;
    px[i] = v.x * 127.5 + 127.5; px[i + 1] = v.y * 127.5 + 127.5; px[i + 2] = v.z * 127.5 + 127.5; px[i + 3] = 255;
  }
  return canvasToTexture(px, s, { anisotropy });
}

// tileable simplex on a torus; integer fu/fv keep it seamless
function torusNoise(noi, u, v, fu, fv, off) {
  const a = u * Math.PI * 2 * fu, b = v * Math.PI * 2 * fv;
  const r1 = fu * 0.55, r2 = fv * 0.55;
  return noi.noise4d(Math.cos(a) * r1 + off, Math.sin(a) * r1 - off * 0.7,
    Math.cos(b) * r2 + off * 1.3, Math.sin(b) * r2 + off * 0.35);
}

// CPU twin of the splat shader's uNoise samples (seed 3011 matches
// makeShaderNoiseTexture in createSplatMaterial). Lets vegetation placement
// read the same dirt-patch/clump fields the ground shader blends with, so
// grass thins out exactly where the terrain shows dirt.
let _splatFields = null; // { a, b: Float32Array } — see splatFields()
// PERF (performance_budget r6): the CPU twin used to evaluate ~10 analytic
// torusNoise (4D simplex) calls per query; vegetation scatter makes 1.18 M
// queries per boot (measured) = 10.6 M noise4d + ~42 M sin/cos — ~1.5-2 s of
// every load. The GPU never sees those analytic values: the splat shader
// samples the SAME two field formulas from the 256^2 uNoise texture,
// bilinearly, 8-bit quantized. Bake the two fields ONCE into Float32 grids
// (identical formulas, identical seed, identical rng stream) and serve BOTH
// consumers: sampleSplatNoise becomes 5 bilinear grid reads — the exact
// sampling model the shader applies, at float precision — and
// makeShaderNoiseTexture quantizes the same arrays into its RGBA bytes
// (bit-identical texture to the old analytic bake). The analytic->bilinear
// delta on these smooth fields only flips statistically-marginal tuft
// placements; grass<->dirt correlation is exact-by-construction now.
const SPLAT_FIELD_S = 256;
function splatFields() {
  if (_splatFields) return _splatFields;
  const s = SPLAT_FIELD_S;
  const noi = new SimplexNoise({ random: mulberry32(3011) });
  const a = new Float32Array(s * s);
  const b = new Float32Array(s * s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s, j = y * s + x;
      a[j] = torusNoise(noi, u, v, 4, 4, 3) * 0.6 + torusNoise(noi, u, v, 9, 9, 27) * 0.4;
      b[j] = torusNoise(noi, u, v, 2, 2, 55) * 0.7 + torusNoise(noi, u, v, 5, 5, 91) * 0.3;
    }
  }
  _splatFields = { a, b };
  return _splatFields;
}
// bilinear + wrap at texel centers — the sampling GL applies to the repeat-
// wrapped uNoise texture, so the CPU twin sees what the shader sees.
function fieldSample(g, u, v) {
  const s = SPLAT_FIELD_S;
  let x = u * s - 0.5, y = v * s - 0.5;
  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  // SPLAT_FIELD_S is a power of two and callers pass wrapped coordinates.
  // Masking keeps the exact repeat-wrap result while avoiding four modulo
  // operations for each of the millions of grass-scatter grid reads.
  const mask = s - 1;
  x0 &= mask; y0 &= mask;
  const x1 = (x0 + 1) & mask, y1 = (y0 + 1) & mask;
  const g00 = g[y0 * s + x0], g10 = g[y0 * s + x1];
  const g01 = g[y1 * s + x0], g11 = g[y1 * s + x1];
  return g00 + (g10 - g00) * fx + (g01 - g00) * fy + (g00 - g10 - g01 + g11) * fx * fy;
}
function wrapUnit(t) { return t - Math.floor(t); }
export function sampleSplatNoise(x, z, out = null) {
  const f = splatFields();
  // r6: mirror the shader's domain warp (wOff in splatCompute) — the dirt/
  // clump fields are sampled at WARPED coordinates on the GPU, so vegetation
  // thinning must read the same warped fields or grass and dirt de-correlate
  const uw = wrapUnit(x * 0.0009 + 0.53), vw = wrapUnit(z * 0.0009 + 0.17);
  const wr = fieldSample(f.a, uw, vw);
  const wg = fieldSample(f.b, uw, vw);
  const wx = x + wr * 0.5 * 48, wz = z + wg * 0.5 * 48;
  const n1 = fieldSample(f.a, wrapUnit(wx * 0.0117), wrapUnit(wz * 0.0117));
  const n2 = fieldSample(f.b, wrapUnit(wx * 0.0031 + 0.41), wrapUnit(wz * 0.0031 + 0.13));
  // mA: the CPU twin of the shader's meadowA field — the dry-straw patchwork
  // tint. Grass tufts read it so the blade carpet carries the same yellow-
  // brown patches the ground albedo shows. r7: TWO-SCALE composite matching
  // the shader (0.0121 .r x0.62 + 0.00779 .g x0.38 — the 83 m repeat break).
  const mA = fieldSample(f.a, wrapUnit(wx * 0.0121 + 0.63), wrapUnit(wz * 0.0121 + 0.29)) * 0.62
    + fieldSample(f.b, wrapUnit(wx * 0.00779 + 0.19), wrapUnit(wz * 0.00779 + 0.71)) * 0.38;
  const result = out || {};
  result.n1 = n1 * 0.5 + 0.5;
  result.n2 = n2 * 0.5 + 0.5;
  result.mA = mA * 0.5 + 0.5;
  return result;
}

const _col = new THREE.Color();
function _css(h, s, l) { _col.setHSL(h, s, l); return _col.getStyle(); }

// draw a canvas path callback at all 9 wrap offsets so the tile stays seamless
function drawWrapped(ctx, s, fn) {
  for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
    ctx.save();
    ctx.translate(ox, oy);
    fn();
    ctx.restore();
  }
}

// Painted grass layer: noise macro base + thousands of individual blade
// strokes so the near field reads as turf, not single-frequency speckle.
function makeGrassLayer(seed, anisotropy, tone = null) {
  const s = texSize(256); // loading-speed r1: sourced 1K set replaces this fallback
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x7f4a);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  // macro base: soil showing through + moss/dry patches at 3-7 tile frequency
  const base = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      const macro = torusNoise(noi, u, v, 3, 3, 11) * 0.6 + torusNoise(noi, u, v, 7, 7, 23) * 0.4;
      const fine = torusNoise(noi, u, v, 43, 43, 61) * 0.5 + 0.5;
      const m01 = macro * 0.5 + 0.5;
      // r7 terrain_environment: MIXED STRAW/OLIVE/SOIL base instead of one
      // spring green (critique: "one saturated spring green... pull grass
      // albedo toward WoT's mixed straw/olive/brown range"). Wider dry band
      // (0.54 start), a soil-through family on the low end of the macro
      // field, and the living green pulled toward olive.
      const dry = smoothstep(0.54, 0.88, m01);
      const soil = smoothstep(0.34, 0.10, m01); // bare-earth showing through
      _col.setHSL(
        0.192 + macro * 0.030 - dry * 0.075 - soil * 0.085,
        0.245 - dry * 0.075 - soil * 0.10,
        0.16 + m01 * 0.07 + fine * 0.05 - soil * 0.015);
      base.data[j] = _col.r * 255; base.data[j + 1] = _col.g * 255; base.data[j + 2] = _col.b * 255;
      base.data[j + 3] = 255;
    }
  }
  ctx.putImageData(base, 0, 0);
  // blade strokes: short curved tapers in varied greens + scattered dry blades
  // r7: dry share 0.14 -> 0.24 and living hue pulled toward olive with a
  // wider spread — the blade carpet must mix straw into the green, not read
  // as one lawn tone (ground-cover critique)
  ctx.lineCap = 'round';
  for (let b = 0; b < 3400; b++) {
    const x = rng() * s, y = rng() * s;
    const dry = rng() < 0.24;
    const lum = 0.16 + rng() * 0.17 + (dry ? 0.12 : 0);
    ctx.strokeStyle = dry
      ? _css(0.10 + rng() * 0.035, 0.26 + rng() * 0.08, lum)
      : _css(0.175 + rng() * 0.075, 0.26 + rng() * 0.13, lum);
    ctx.lineWidth = 1.1 + rng() * 1.4;
    const len = 7 + rng() * 12;
    const a = rng() * Math.PI * 2;
    const bend = (rng() - 0.5) * 8;
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
        y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
        x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  // tiny clover/weed dots
  for (let b = 0; b < 420; b++) {
    const x = rng() * s, y = rng() * s, r = 1 + rng() * 2;
    ctx.fillStyle = _css(0.26 + rng() * 0.05, 0.4, 0.2 + rng() * 0.16);
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  const out = ctx.getImageData(0, 0, s, s);
  const px = new Uint8ClampedArray(out.data);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const g = px[i * 4 + 1] / 255;
    hgt[i] = g;
    px[i * 4 + 3] = clamp(0.90 - g * 0.10, 0.03, 1) * 255; // roughness in alpha (0.80-0.90: low-gloss turf sheen so sun angle reads)
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 2.4, anisotropy), // lighting_post r2: stronger micro-normal
  };
}

// Painted dirt layer: clods + drawn pebbles + cracks — real macro structure
// for the sub-10 m ground and the road gravel pass.
function makeDirtLayer(seed, anisotropy, tone = null) {
  const s = texSize(256); // loading-speed r1: sourced 1K set replaces this fallback
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x2e91);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const base = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      const clods = torusNoise(noi, u, v, 4, 4, 7) * 0.65 + torusNoise(noi, u, v, 9, 9, 31) * 0.35;
      const grain = torusNoise(noi, u, v, 47, 47, 3) * 0.5 + 0.5;
      const c01 = clods * 0.5 + 0.5;
      _col.setHSL(0.077 + clods * 0.014, 0.25 - grain * 0.05, 0.16 + c01 * 0.10 + grain * 0.045);
      base.data[j] = _col.r * 255; base.data[j + 1] = _col.g * 255; base.data[j + 2] = _col.b * 255;
      base.data[j + 3] = 255;
    }
  }
  ctx.putImageData(base, 0, 0);
  // soft clod shading blobs
  for (let b = 0; b < 110; b++) {
    const x = rng() * s, y = rng() * s;
    const rw = 8 + rng() * 22, rh = rw * (0.5 + rng() * 0.7), rot = rng() * Math.PI;
    const dark = rng() < 0.5;
    ctx.globalAlpha = 0.14 + rng() * 0.14;
    ctx.fillStyle = _css(0.075 + rng() * 0.015, 0.24, dark ? 0.12 : 0.30);
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  // cracks: dark meandering polylines
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = rng() * s, y = rng() * s;
    let a = rng() * Math.PI * 2;
    ctx.strokeStyle = _css(0.07, 0.25, 0.075 + rng() * 0.035);
    ctx.lineWidth = 0.9 + rng() * 1.2;
    const segs = 4 + (rng() * 5) | 0;
    const ptsX = [x], ptsY = [y];
    for (let q = 0; q < segs; q++) {
      a += (rng() - 0.5) * 1.2;
      x += Math.cos(a) * (7 + rng() * 12);
      y += Math.sin(a) * (7 + rng() * 12);
      ptsX.push(x); ptsY.push(y);
    }
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
    });
  }
  // pebbles with a contact-shadow offset
  for (let b = 0; b < 640; b++) {
    const x = rng() * s, y = rng() * s, r = 0.8 + Math.pow(rng(), 1.8) * 3.2;
    const lum = 0.2 + rng() * 0.2;
    const sh = _css(0.075, 0.2, 0.08);
    const fill = _css(0.075 + rng() * 0.02, 0.10 + rng() * 0.12, lum);
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.arc(x + r * 0.4, y + r * 0.5, r, 0, Math.PI * 2);
      ctx.fillStyle = sh;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    });
  }
  const out = ctx.getImageData(0, 0, s, s);
  const px = new Uint8ClampedArray(out.data);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const l = (px[i * 4] * 0.45 + px[i * 4 + 1] * 0.4 + px[i * 4 + 2] * 0.15) / 255;
    hgt[i] = l;
    px[i * 4 + 3] = clamp(0.98 - l * 0.09, 0.03, 1) * 255;
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 3.0, anisotropy),
  };
}

// Lake-ice layer (winter): pale blue-grey sheet with darker depth blotches,
// dark meandering pressure-crack lines, faint wind-blown snow drift streaks.
// Roughness (packed in alpha) is LOW on clear ice, high on the drifts, so the
// sheet picks up sun/sky specular and reads as ice, not mud.
function makeIceLayer(seed, anisotropy) {
  const s = texSize(256); // loading-speed r1: distant/fallback terrain tile
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x1cE5);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const base = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      // r6: depth field pushed to LOWER frequency (2/5 was 3/7, fine 23 -> 11)
      // — the old texel-scale variation resolved as salt-speckle from the
      // establishing camera; a sheet needs broad clear-ice fields
      const depth = torusNoise(noi, u, v, 2, 2, 9) * 0.6 + torusNoise(noi, u, v, 5, 5, 41) * 0.4;
      const fine = torusNoise(noi, u, v, 11, 11, 77) * 0.5 + 0.5;
      const d01 = depth * 0.5 + 0.5;
      const deep = smoothstep(0.45, 0.88, 1 - d01); // dark water under thin ice
      // r5: GRAY-WHITE ice, not swimming-pool blue. Real lake ice under an
      // overcast sky is a desaturated gray sheet with faint blue-green depth
      // cues — the old s=0.15..0.25 base (then squared by the shader's
      // self-multiplying macro overlay) rendered a garish saturated blue
      // ellipse that clashed with the sepia sky. Keep the value step below
      // the 0.8+ snow albedo so the sheet still reads as a lake.
      // r6: saturation halved again (0.045+0.05 -> 0.025+0.03) — even the
      // r5 sheet compounded into garish blue speckle at range
      // r9: VALUE contrast up, saturation still low — the sheet read as a
      // slightly-blue snow patch; darker clear-ice fields (0.58 base, deeper
      // 0.19 depth drop) separate ICE from the 0.8+ snow albedo around it
      // while staying grey enough to sit under the overcast sky
      // terrain_environment r3: darker still (0.44 base, 0.24 drop) with a
      // touch more blue-green — the sheet needs real VALUE separation from
      // the snowfield so the new fresnel sky sheen has something to play
      // against; at 0.58 it read as a pale stain with no material identity
      // r4: 0.44/0.24 -> 0.37/0.27 — the engine's bright winter fill washes
      // the sheet toward white, so the authored fields must sit DARKER for
      // any ice identity to survive to screen (critique: "matte pale splat")
      _col.setHSL(0.535 + depth * 0.015, 0.055 + deep * 0.06,
        0.37 - deep * 0.27 + fine * 0.03);
      base.data[j] = _col.r * 255; base.data[j + 1] = _col.g * 255; base.data[j + 2] = _col.b * 255;
      base.data[j + 3] = 255;
    }
  }
  ctx.putImageData(base, 0, 0);
  // pressure cracks: long forking dark polylines with a bright refrozen edge
  ctx.lineCap = 'round';
  function crack(x, y, a, segs, w) {
    const ptsX = [x], ptsY = [y];
    for (let q = 0; q < segs; q++) {
      a += (rng() - 0.5) * 0.9;
      x += Math.cos(a) * (14 + rng() * 22);
      y += Math.sin(a) * (14 + rng() * 22);
      ptsX.push(x); ptsY.push(y);
    }
    drawWrapped(ctx, s, () => {
      // dark stress shadow under a BRIGHT refrozen core: from distance real
      // pressure cracks read as white veins across darker ice (the old dark-
      // core version read as mud cracks). Both desaturated (r5).
      ctx.strokeStyle = _css(0.58, 0.10, 0.36);
      ctx.lineWidth = w + 2.2;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
      ctx.strokeStyle = _css(0.575, 0.05, 0.93);
      ctx.lineWidth = w;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    if (segs > 3 && rng() < 0.7) crack(ptsX[2], ptsY[2], a + (rng() < 0.5 ? 0.9 : -0.9), segs - 2, w * 0.7);
  }
  // r6: more, WIDER cracks — at the 5 m detail tile the old 1.4 px veins
  // mip away by 100 m; 2.2-3.8 px survive into the macro re-projection
  for (let k = 0; k < 13; k++) crack(rng() * s, rng() * s, rng() * Math.PI * 2, 5 + (rng() * 4) | 0, 2.2 + rng() * 1.6);
  // wind-blown snow drift streaks, one global direction
  const dir = 0.6;
  for (let k = 0; k < 60; k++) {
    const x = rng() * s, y = rng() * s;
    const len = 30 + rng() * 90, wdt = 2 + rng() * 7;
    ctx.globalAlpha = 0.10 + rng() * 0.22;
    ctx.strokeStyle = _css(0.58, 0.04, 0.88);
    ctx.lineWidth = wdt;
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(dir) * len * 0.5, y + Math.sin(dir) * len * 0.5 + (rng() - 0.5) * 8,
        x + Math.cos(dir) * len, y + Math.sin(dir) * len);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  const out = ctx.getImageData(0, 0, s, s);
  const px = new Uint8ClampedArray(out.data);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const l = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.45 + px[i * 4 + 2] * 0.25) / 255;
    hgt[i] = l * 0.5 + 0.25;
    // bright texels = snow drift (rough); dark clear ice = glossy
    const snowy = smoothstep(0.72, 0.9, l);
    px[i * 4 + 3] = clamp(0.10 + snowy * 0.72, 0.05, 1) * 255;
  }
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 0.8, anisotropy),
  };
}

// Open-water layer (maps r1, ADDITIVE — coastal sea / river channels, routed
// by cfg.splat.seaLake). Authored DARK so the fresnel sky sheen and foam have
// value range to play against: broad swell fields (long-wavelength tone
// drift), fine wind chop, darker deep-water blotches and sparse pale foam
// streaks. Roughness (packed in alpha) runs LOW on open water — the splat
// shader's marsh-gloss + fresnel terms give it the specular water identity —
// and high on the foam streaks so they read matte.
function makeSeaLayer(seed, anisotropy, tone = null) {
  const s = texSize(256); // loading-speed r1: distant/fallback terrain tile
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x5EA1);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const base = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      // swell: long-wavelength anisotropic fields (stretched u) so the tone
      // drift reads as rolling water, not blobs; chop: fine isotropic octave
      const swell = torusNoise(noi, u, v, 2, 3, 19) * 0.6 + torusNoise(noi, u, v, 5, 7, 47) * 0.4;
      const chop = torusNoise(noi, u, v, 23, 23, 83) * 0.5 + 0.5;
      const s01 = swell * 0.5 + 0.5;
      const deep = smoothstep(0.60, 0.90, 1 - s01); // dark deep-water fields
      _col.setHSL(
        0.545 - s01 * 0.035,             // teal -> blue-green drift
        0.30 + deep * 0.10 - chop * 0.05,
        0.135 + s01 * 0.075 - deep * 0.05 + chop * 0.025);
      base.data[j] = _col.r * 255; base.data[j + 1] = _col.g * 255; base.data[j + 2] = _col.b * 255;
      base.data[j + 3] = 255;
    }
  }
  ctx.putImageData(base, 0, 0);
  // wind-lane foam streaks: sparse pale curved strokes, one global direction
  const dir = 0.5;
  ctx.lineCap = 'round';
  for (let k = 0; k < 42; k++) {
    const x = rng() * s, y = rng() * s;
    const len = 24 + rng() * 70, wdt = 1.2 + rng() * 2.6;
    ctx.globalAlpha = 0.07 + rng() * 0.14;
    ctx.strokeStyle = _css(0.52, 0.10, 0.62 + rng() * 0.2);
    ctx.lineWidth = wdt;
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(dir) * len * 0.5, y + Math.sin(dir) * len * 0.5 + (rng() - 0.5) * 10,
        x + Math.cos(dir) * len, y + Math.sin(dir) * len);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  const out = ctx.getImageData(0, 0, s, s);
  const px = new Uint8ClampedArray(out.data);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const l = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.45 + px[i * 4 + 2] * 0.25) / 255;
    hgt[i] = l * 0.6 + 0.2; // gentle wave-relief normal source
    // pale texels = foam lanes (matte); dark open water = glossy
    const foamy = smoothstep(0.40, 0.62, l);
    px[i * 4 + 3] = clamp(0.08 + foamy * 0.70, 0.05, 1) * 255;
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 1.0, anisotropy),
  };
}

// Stratified sandstone layer (r7, desert cliffs). The generic rock layer —
// and the sourced Rock063 set that replaced it — both read as swirly
// Perlin-marble smears on the canyon walls ("wet-sand swirls" critique).
// This layer is authored as SEDIMENT: near-horizontal beds of variable
// thickness with per-bed tone/hue, thin dark marker beds, ledge relief at
// the bed boundaries and only granular (never swirly) fine texture. The
// splat shader's wall projection maps v to world height, so the beds land
// horizontal on every cliff face regardless of orientation.
function makeSandstoneLayer(seed, anisotropy, tone = null) {
  const s = texSize(256); // loading-speed r1: distant/fallback terrain tile
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x5a4d);
  // bed table: resistant ledges, soft recessed beds, occasional dark markers
  const beds = [];
  {
    let y = 0;
    while (y < s) {
      const marker = rng() < 0.16;
      // r4: thicker beds (20-80 -> 34-110 px) — the old thin-bed ladder
      // repeated every couple of meters on the walls and read as marble veins
      const th = marker ? 4 + rng() * 6 : 34 + rng() * 76;
      beds.push({
        y0: y, y1: y + th, marker,
        tone: rng(),            // per-bed lightness
        hueJ: rng(),            // per-bed hue drift (tan <-> rust)
        hard: rng(),            // resistance -> ledge relief
      });
      y += th;
    }
  }
  function bedAt(yw) {
    for (const b of beds) if (yw >= b.y0 && yw < b.y1) return b;
    return beds[beds.length - 1];
  }
  const px = new Uint8ClampedArray(s * s * 4);
  const hgt = new Float32Array(s * s);
  for (let yy = 0; yy < s; yy++) {
    for (let xx = 0; xx < s; xx++) {
      const u = xx / s, v = yy / s, i = yy * s + xx, j = i * 4;
      // gentle boundary wobble — LOW turbulence, long wavelength; this is
      // the only warp in the layer, so beds stay legible strata
      // r4: 4.2/1.6 -> 2.2/0.8 — the deeper wobble bent the beds into the
      // "marble-vein" waviness the desert critique flagged; near-straight
      // beds read as sediment
      const wob = torusNoise(noi, u, v, 2, 2, 7) * 2.2 + torusNoise(noi, u, v, 6, 6, 33) * 0.8;
      const yw = ((yy + wob) % s + s) % s;
      const bed = bedAt(yw);
      const bedT = (yw - bed.y0) / Math.max(1, bed.y1 - bed.y0);
      // distance to nearest bed boundary (px) -> recess/shadow line
      const dEdge = Math.min(yw - bed.y0, bed.y1 - yw);
      const seam = 1 - clamp(dEdge / 3.2, 0, 1);
      // granular grain only — isotropic, two octaves, small amplitude
      const grain = torusNoise(noi, u, v, 38, 38, 61) * 0.5 + 0.5;
      const grain2 = torusNoise(noi, u, v, 13, 13, 99) * 0.5 + 0.5;
      // broad along-bed tone drift so a bed is not one flat stripe
      const drift = torusNoise(noi, u, v * 0.15, 3, 1, 145) * 0.5 + 0.5;
      // r4: sat 0.42+0.12 -> 0.33+0.08 — the saturated ochre beds were the
      // PINK cast in the "contour-band marbling" read
      let hue = 0.062 + bed.hueJ * 0.022 - 0.006 * grain2;
      let sat = 0.33 + bed.hueJ * 0.08 - grain * 0.06;
      let lum = bed.marker
        ? 0.185 + bed.tone * 0.05
        : 0.315 + bed.tone * 0.20 + (bedT - 0.5) * 0.03 + grain * 0.05 + (drift - 0.5) * 0.07;
      lum *= 1 - seam * 0.38; // shadowed parting line at every bed boundary
      _col.setHSL(hue, clamp(sat, 0, 1), clamp(lum, 0.04, 0.75));
      px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255;
      // relief: hard beds ledge out, soft/marker beds recess, seams notch
      let hn = 0.40 + bed.hard * 0.42 + grain * 0.10 - (bed.marker ? 0.26 : 0);
      hn -= seam * 0.30;
      hgt[i] = clamp(hn, 0, 1);
      px[j + 3] = clamp(0.86 - grain * 0.06, 0.45, 1) * 255; // matte rough
    }
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 2.6, anisotropy),
  };
}

function makeGroundLayer(seed, kind, anisotropy, tone = null, roughMul = 1) {
  const s = texSize(256); // loading-speed r1: sourced 1K set replaces this fallback
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const px = new Uint8ClampedArray(s * s * 4);
  const hgt = new Float32Array(s * s);
  let nStrength = 2.0;
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, i = y * s + x, j = i * 4;
      let rough = 0.9, hn = 0.5;
      if (kind === 'rock') {
        const tone = torusNoise(noi, u, v, 3, 3, 17) * 0.5 + 0.5;
        const r1 = 1 - Math.abs(torusNoise(noi, u, v, 6, 6, 41));
        const r2 = 1 - Math.abs(torusNoise(noi, u, v, 15, 15, 8));
        const ridge = r1 * 0.62 + r2 * 0.38;
        const crack = smoothstep(0.86, 0.985, ridge);
        hn = 0.72 - crack * 0.62 + (tone - 0.5) * 0.34;
        _col.setHSL(0.082, 0.055 + tone * 0.035, (0.40 + tone * 0.14) * (1 - crack * 0.45));
        rough = 0.76 + crack * 0.12 - tone * 0.06;
        nStrength = 3.0;
      } else { // mud
        const macro = torusNoise(noi, u, v, 3, 3, 29) * 0.5 + 0.5;
        const rip = torusNoise(noi, u, v, 42, 42, 13) * 0.5 + 0.5;
        const puddle = smoothstep(0.56, 0.76, macro);
        hn = macro * 0.55 + rip * 0.18 - puddle * 0.28 + 0.25;
        _col.setHSL(0.068, 0.27 - puddle * 0.12, 0.145 + (1 - puddle) * 0.075 + rip * 0.028);
        // matte floor ~0.74: puddle texels used to dip to 0.46 and bloomed
        // into white glitter patches under the sun at grazing angles
        rough = 0.84 - puddle * 0.10;
        nStrength = 1.5;
      }
      hn = clamp(hn, 0, 1);
      hgt[i] = hn;
      const cav = 0.72 + 0.28 * hn; // cavity darkening baked into albedo
      px[j] = _col.r * cav * 255; px[j + 1] = _col.g * cav * 255; px[j + 2] = _col.b * cav * 255;
      // 0.45 floor: 0.03 was mirror-glossy — at grazing view·sun geometry the
      // GGX lobe blew the whole sun-facing midground to white sparkle (flyby)
      px[j + 3] = clamp(rough * roughMul, 0.45, 1) * 255; // roughness packed in albedo alpha
    }
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, nStrength, anisotropy),
  };
}

// R = road core, G = wheel ruts, B = marsh wetness, A = village worn ground.
// 2 texels/m: the rut lanes and road borders actually resolve instead of
// smearing into 1-texel airbrush mush.
function makeMaskTexture(seedNoi, layout, landformW = null) {
  const _VILLAGE = layout.village;
  const _MARSHES = [...layout.marshes, ...layout.lakes]; // lakes share the wet/ice channel
  // MOBILE r1: tier-scaled mask (features derive from T = s/MAP_SIZE, so the
  // bake is resolution-relative; mobile trades 0.5 m/texel road-edge crispness
  // for a 16 MB saving on its ~192 MB budget)
  // Loading-speed r1: the mask covers a 1024 m battlefield; 512² gives one
  // texel per 2 m, still finer than the rendered terrain grid (~2.7 m).
  // The former 2048² bake spent 16x the pixels on sub-grid information.
  const s = texSize(512), T = s / MAP_SIZE;
  // r6 terrain_environment: landform (mesa/rim) weight pre-sampled on a
  // coarse grid (the field is ~700 m wavelength; 4 m texels bilerped) so the
  // 2048^2 mask bake stays cheap — B channel carries it on landformW maps.
  let landGrid = null;
  const LG = 257, LCELL = MAP_SIZE / (LG - 1);
  if (landformW) {
    landGrid = new Float32Array(LG * LG);
    for (let gz = 0; gz < LG; gz++) {
      for (let gx = 0; gx < LG; gx++) {
        landGrid[gz * LG + gx] = clamp(landformW(gx * LCELL - HALF, gz * LCELL - HALF), 0, 1);
      }
    }
  }
  function landAt(x, z) {
    const gx = clamp((x + HALF) / LCELL, 0, LG - 1.0001);
    const gz = clamp((z + HALF) / LCELL, 0, LG - 1.0001);
    const x0 = gx | 0, z0 = gz | 0, fx = gx - x0, fz = gz - z0;
    const i = z0 * LG + x0;
    const a = landGrid[i] + (landGrid[i + 1] - landGrid[i]) * fx;
    const b = landGrid[i + LG] + (landGrid[i + LG + 1] - landGrid[i + LG]) * fx;
    return a + (b - a) * fz;
  }
  const dist = new Float32Array(s * s).fill(1e9);
  for (const nodes of layout.roads) {
    for (let sg = 0; sg < nodes.length - 1; sg++) {
      const [ax, az] = nodes[sg], [bx, bz] = nodes[sg + 1];
      const x0 = clamp(Math.floor((Math.min(ax, bx) - 14 + HALF) * T), 0, s - 1);
      const x1 = clamp(Math.ceil((Math.max(ax, bx) + 14 + HALF) * T), 0, s - 1);
      const z0 = clamp(Math.floor((Math.min(az, bz) - 14 + HALF) * T), 0, s - 1);
      const z1 = clamp(Math.ceil((Math.max(az, bz) + 14 + HALF) * T), 0, s - 1);
      for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
        const { d } = segDist(tx / T - HALF, tz / T - HALF, ax, az, bx, bz);
        const i = tz * s + tx;
        if (d < dist[i]) dist[i] = d;
      }
    }
  }
  const px = new Uint8ClampedArray(s * s * 4);
  for (let tz = 0; tz < s; tz++) {
    const z = tz / T - HALF;
    for (let tx = 0; tx < s; tx++) {
      const x = tx / T - HALF, i = tz * s + tx, j = i * 4;
      const d = dist[i];
      if (d < 13) {
        // edge wobble + a slow width modulation so the road narrows/widens
        // along its length instead of running at one constant gauge
        const wob = seedNoi.noise(x * 0.055, z * 0.055) * 0.8 + seedNoi.noise(x * 0.21, z * 0.21) * 0.35;
        const wid = seedNoi.noise(x * 0.011 + 41, z * 0.011 - 17) * 1.5;
        let core = 1 - smoothstep(3.3 + wob + wid, 4.4 + wob + wid, d);
        // center grass strip between the wheel tracks
        core *= 0.34 + 0.66 * smoothstep(0.25, 0.95, d + wob * 0.12);
        px[j] = core * 255;
        // twin compacted wheel ruts, gaussian profile at +-1.55 m; amplitude
        // wanders along the road so the striping never repeats identically
        const rutAmp = 0.55 + 0.45 * (seedNoi.noise(x * 0.019 - 3, z * 0.019 + 8) * 0.5 + 0.5);
        const rut = Math.exp(-Math.pow((d - 1.55) / 0.55, 2));
        px[j + 1] = rut * core * 245 * rutAmp;
      }
      let marsh = 0;
      for (const m of _MARSHES) {
        const md = Math.hypot(x - m.x, z - m.z);
        if (md < m.r + 24) {
          if (m.depth !== undefined) { // lake: ice sheet with a drifted-snow bank
            // ends AT the flat sheet edge (0.94 r): letting it spill to 1.02 r
            // dressed the graded snow banks in glossy blue ice
            const re = m.r * (1 + 0.04 * seedNoi.noise(x * 0.03 + 7, z * 0.03 - 3));
            marsh = Math.max(marsh, 1 - smoothstep(re * 0.80, re * 0.96, md));
          } else {
            const re = m.r * (1 + 0.18 * seedNoi.noise(x * 0.02 + 7, z * 0.02 - 3));
            marsh = Math.max(marsh, 1 - smoothstep(re * 0.45, re, md));
          }
        }
      }
      px[j + 2] = (landGrid ? landAt(x, z) : marsh) * 255;
      const dx = Math.max(_VILLAGE.x0 - x, x - _VILLAGE.x1, 0);
      const dz = Math.max(_VILLAGE.z0 - z, z - _VILLAGE.z1, 0);
      const vm = 1 - smoothstep(0, 26, Math.hypot(dx, dz));
      if (vm > 0) {
        const patch = 0.45 + 0.55 * (seedNoi.noise(x * 0.045 - 19, z * 0.045 + 8) * 0.5 + 0.5);
        px[j + 3] = vm * patch * 0.8 * 255;
      }
    }
  }
  // DataTexture, NOT canvas: this texture carries DATA in its channels with
  // alpha (village wear) near 0 over most of the map — the 2D canvas backing
  // store is premultiplied, so putImageData ZEROES the road/rut/marsh RGB
  // wherever alpha == 0. Every mask-driven feature (road core texture, ruts,
  // the winter lake ICE channel) silently vanished through the canvas path.
  const t = new THREE.DataTexture(new Uint8Array(px.buffer), s, s, THREE.RGBAFormat);
  // flipY=false: row 0 (z=-512) must land at V=0 — mUV.y=(z+512)/1024. (The
  // old canvas path uploaded flipped, i.e. z-MIRRORED — verified live: the
  // lake's mask disc rendered at (x,+z) instead of (x,-z).)
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function makeShaderNoiseTexture(seed) {
  // seed stays 3011: the RG channels quantize the SAME Float32 fields the
  // CPU twin (sampleSplatNoise) samples — shared bake, see splatFields().
  const s = SPLAT_FIELD_S;
  const { a, b } = splatFields();
  const px = new Uint8ClampedArray(s * s * 4);
  for (let j = 0; j < s * s; j++) {
    px[j * 4] = (a[j] * 0.5 + 0.5) * 255;
    px[j * 4 + 1] = (b[j] * 0.5 + 0.5) * 255;
    px[j * 4 + 2] = 128; px[j * 4 + 3] = 255;
  }
  // r5: aniso 16 (was 1) — this texture feeds UNCONDITIONAL albedo terms
  // (0.90 + n2*0.20, far mottling, meadow tints). At aniso 1 every steep face
  // seen at a grazing angle smeared those terms into long downslope "rain
  // streak" strands — the furry mesa-flank artifact.
  return canvasToTexture(px, s, { anisotropy: 16 });
}

// ---------------------------------------------------------------------------
// Splat material
// ---------------------------------------------------------------------------

function _mustReplace(src, anchor, replacement) {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/terrain: shader anchor missing: ${anchor}`);
  return out;
}

const SPLAT_COMMON_FRAG = /* glsl */`
varying vec3 vWPos;
varying vec3 vWNormal;
uniform sampler2D uAlbG, uAlbD, uAlbR, uAlbM;
uniform sampler2D uNrmG, uNrmD, uNrmR, uNrmM;
uniform sampler2D uMask, uNoise;
uniform vec3 uTintA, uTintB, uTintC, uRoadTint;
uniform float uMarshGloss;
uniform float uMicroAmp, uStrata, uRoadTex, uTownWear, uIceDrift, uMidRelief, uFieldPatch;
uniform vec3 uRipple; // xy = wind dir, z = ripple normal amplitude
uniform float uSandMacro; // r3: desert macro variation (gravel basins / scour sheets)
uniform vec3 uIceSky;     // r3: fresnel sky tint reflected by clear lake ice
uniform float uMidFar;    // r3: far edge of the mid-relief dapple band (m)
uniform float uRockGate;  // r6: 1 = slope-rock takeover keyed to the mask-B landform weight (desert mesas)
uniform float uSea;       // maps r1: 1 = M layer is OPEN WATER (sea/river), 0 = legacy mud/ice
uniform float uSeaFoam;   // maps r1: surf/whitecap strength (0 disables)
uniform vec2 uSeaRamp;    // maps r1: fM band that ramps to open water (sea wide, river tight)
vec3 gSplatAlbedo; float gSplatRough; vec3 gSplatNrm; float gSplatFar; float gSplatSteepAtt;
float gSeaFoam; // maps r1: foam coverage this fragment (mattes the water gloss)
// r7 axis-triplanar wall basis (set in splatCompute): two FIXED world-axis
// projections + a pow-sharpened blend weight. The r6 tangent projection built
// its U axis from the interpolated normal — on undulating cliff walls that
// frame rotated per-fragment, dragging the sample coordinate back and forth
// across the face (the melted-taffy smear on the desert mesas).
vec2 gWallUVx; vec2 gWallUVz; float gWallW;
float gTileMix; // r8 anti-tiling: stochastic rotation-blend weight (set in splatCompute)
float gCliffJ;  // r8: per-cliff jitter field (set with the wall basis)
vec4 splatSamp(sampler2D t, vec2 uv, float df, float mb) {
  vec4 nearS = texture2D(t, uv, mb);
  if (df < 0.004) return nearS;
  // r5 terrain_environment: the far variant re-samples the SAME hand-painted
  // blade-stroke sheet at 0.2317x scale — its 7-12 px curved strokes became
  // half-meter Van Gogh brush swirls across the whole 45-160 m band (the
  // "painterly swirl" critique on the player_view midfield). A constant
  // +1.6 mip bias melts the stroke shapes into isotropic tonal breakup while
  // the macro clump variation the far variant exists for survives.
  vec4 farS = texture2D(t, uv * 0.2317 + vec2(0.5), mb + 1.6);
  // r8: past the mid ring, ease the far variant toward its tile MEAN (deep
  // mip). The 16x anisotropic sampler otherwise keeps the ~18 m repeat's
  // blade/clod features crisp to the horizon, where they resolve as periodic
  // stipple rows on bright sand/snow albedo (mb tracks farM: 0 inside 90 m,
  // 2 by 330 m -> mean weight 0..0.66).
  // r6: mean weight floor 0.18 -> 0.30 — the far variant's 2-6 m macro blobs
  // repeated on the 18 m tile grid as a visible mottled-blotch print across
  // the 50-150 m midground (critique); softer far contrast + the uncorrelated
  // octave in splatCompute carry that band instead
  farS = mix(farS, texture2D(t, uv * 0.2317 + vec2(0.5), 6.0), min(0.30 + mb * 0.33, 0.74));
  return mix(nearS, farS, df);
}
// r8 anti-tiling ground samplers: every ground layer tiles at ONE fixed world
// period (4.2 m near / 18 m far variant) — from the establishing camera the
// repeats compress into periodic stipple ROWS and the far variant's macro
// blobs stamp a hard-edged patchwork grid (worst on the winter snow set).
// Blend a second sampling of the SAME texture, rotated ~42 deg and rescaled
// x1.16 with an offset, masked by the warped ~10-20 m noise patches (n1w):
// no world-periodic feature survives more than ~one tile in any direction.
const mat2 TILEROT = mat2(0.7431, 0.6691, -0.6691, 0.7431);
vec4 groundSamp(sampler2D t, vec2 uv, float df, float mb) {
  vec4 sA = splatSamp(t, uv, df, mb);
  vec4 sB = splatSamp(t, TILEROT * uv * 1.16 + vec2(0.37, 0.61), df, mb);
  return mix(sA, sB, gTileMix);
}
// normal-map variant: the rotated sample's tangent-space xy must be counter-
// rotated back into the world frame or its bump lighting points 42 deg off
vec4 groundNrm(sampler2D t, vec2 uv, float df, float mb) {
  vec4 sA = splatSamp(t, uv, df, mb);
  vec4 sB = splatSamp(t, TILEROT * uv * 1.16 + vec2(0.37, 0.61), df, mb);
  vec2 nB = sB.xy * 2.0 - 1.0;
  sB.xy = vec2(0.7431 * nB.x + 0.6691 * nB.y, -0.6691 * nB.x + 0.7431 * nB.y) * 0.5 + 0.5;
  return mix(sA, sB, gTileMix);
}
vec4 wallSamp(sampler2D t, float sc, float df, float mb) {
  return mix(splatSamp(t, gWallUVx * sc, df, mb), splatSamp(t, gWallUVz * sc, df, mb), gWallW);
}
vec3 wallTex(sampler2D t, float sc) {
  return mix(texture2D(t, gWallUVx * sc).xyz, texture2D(t, gWallUVz * sc).xyz, gWallW);
}
float wallNoiseG(float sc, vec2 off) {
  return mix(texture2D(uNoise, gWallUVx * sc + off).g, texture2D(uNoise, gWallUVz * sc + off).g, gWallW);
}
void splatCompute() {
  vec3 wp = vWPos;
  vec3 wn = normalize(vWNormal);
  vec2 mUV = (wp.xz + 512.0) * (1.0 / 1024.0);
  vec4 mk = texture2D(uMask, mUV);
  // r6 terrain_environment: on landform-gated maps (desert) the mask B
  // channel carries the MESA/RIM weight instead of marsh/ice — decode it and
  // zero the marsh weight so none of the wet/ice paths fire on sand.
  float mkB = mk.b;
  float rockGate = 1.0;
  if (uRockGate > 0.5) {
    rockGate = smoothstep(0.10, 0.45, mkB);
    mkB = 0.0;
  }
  float camDist = distance(wp, cameraPosition);
  // FOV-aware detail distance: meters-per-pixel footprint normalized to the
  // 60-deg/1080p arcade view, so x8 sniper zoom re-resolves near-scale
  // detail instead of magnifying the blurred far variant (hud_ui r2).
  // min() keeps wide establishing shots byte-identical (footprint >= camDist
  // there); only narrow-FOV (zoomed) frames take the shorter effective
  // distance.
  float effDist = min(camDist, length(fwidth(wp.xz)) * 935.0);
  float df = smoothstep(45.0, 160.0, effDist);
  float farM = smoothstep(90.0, 330.0, effDist);
  // detail fade: positive mip bias at range kills the single-frequency
  // speckle shimmer that anisotropic filtering keeps resolving
  float mipB = farM * 2.0;
  vec2 uv = wp.xz;
  float n1 = texture2D(uNoise, uv * 0.0117).r;
  float n1h = texture2D(uNoise, uv * 0.047).r; // high-freq edge breaker
  float n2 = texture2D(uNoise, uv * 0.0031 + vec2(0.41, 0.13)).g;
  // r6 DOMAIN WARP for every macro-variation threshold below: thresholding
  // the bilinear-filtered 256px noise texture directly bakes axis-aligned
  // staircase borders into the dirt/meadow patches (the checkerboard blotch
  // artifact at 10-40 m). Warping the sample coordinates by a smooth low-
  // frequency vector field makes every patch border organic. CPU twin:
  // sampleSplatNoise in this file MUST keep the same warp so vegetation
  // thinning stays aligned with the visible dirt.
  vec2 wOff = (texture2D(uNoise, uv * 0.0009 + vec2(0.53, 0.17)).rg - 0.5) * 48.0;
  vec2 uvW = uv + wOff;
  float n1w = texture2D(uNoise, uvW * 0.0117).r;
  float n2w = texture2D(uNoise, uvW * 0.0031 + vec2(0.41, 0.13)).g;
  // r8: rotation-blend mask for the anti-tiling ground samplers — the warped
  // ~10-20 m n1w patches are aperiodic at exactly the scale the detail tiles
  // repeat, so neither sampling's period can line up across more than a tile
  gTileMix = smoothstep(0.36, 0.64, n1w);
  float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
  // distance-attenuated edge breaker: full crispness near the camera, eased
  // toward its mean at range so the road blend never shows dither stipple
  // at 50-100 m
  float n1hs = mix(n1h, 0.5, farM * 0.85);
  // road masks: crisp noise-broken compacted core + wider soft dirt shoulder
  float roadCore = smoothstep(0.38, 0.70, mk.r + (n1hs - 0.5) * 0.30);
  float shoulder = smoothstep(0.04, 0.60, mk.r + (n1hs - 0.5) * 0.20);
  float rut = mk.g * (0.62 + 0.38 * n1hs);
  // r7: the road mask is an XZ projection — where a road runs along a mesa
  // rim it painted its compacted-earth tint DOWN the cliff face below as a
  // vertical light streak; no road holds on a >30-deg face
  {
    float notCliff = 1.0 - smoothstep(0.28, 0.45, slope);
    roadCore *= notCliff; shoulder *= notCliff; rut *= notCliff;
  }
  // dirt patches: noise-broken threshold => small worn patches with ragged
  // edges instead of giant airbrushed smears. r6: warped samples + slightly
  // softer band — the hard 0.62-0.78 step on unwarped texels was the
  // axis-aligned checkerboard tell beside the player tank
  // r4 terrain_environment: worn band widened (0.60-0.82 -> 0.55-0.80) and
  // weight 0.62 -> 0.74 — the gameplay-camera near field read as one uniform
  // green noise carpet with "no macro albedo variation" (critique); more
  // visible dirt/dry-patch breakup is the cheapest macro signal at 5-60 m
  // r7: 0.74 -> 0.84 — bare-dirt splats must read as real ground breakup
  // between the road decals (ground-cover critique), not a faint stain
  float worn = smoothstep(0.55, 0.80, n2w + (n1w - 0.5) * 0.45);
  float fD = clamp(max(worn * 0.84, max(shoulder, mk.a * uTownWear * (0.35 + 0.65 * n1))), 0.0, 1.0);
  float fM = mkB;
  // marsh/ice sheets only live on near-flat ground: without this the graded
  // banks around a frozen lake inherit the sheet's glossy blue ice response
  // and read as icy walls — anything steeper than ~10 deg is snow bank
  fM *= 1.0 - smoothstep(0.03, 0.08, slope);
  // >>> maps r1 (ADDITIVE, uSea-gated — uSea is 0 on every pre-existing map,
  // so fMs == fM and everything below is bit-identical there). Open-water
  // mode splits fM's wide shore ramp into: a bare sand/mud apron (seaSand,
  // fed from the D layer), a surf waterline, and the open-water weight fMs.
  gSeaFoam = 0.0;
  float fMs = fM;
  float seaSand = 0.0;
  if (uSea > 0.5) {
    fMs = smoothstep(uSeaRamp.x, uSeaRamp.y, fM);
    seaSand = smoothstep(0.02, uSeaRamp.x, fM) * (1.0 - fMs);
  }
  // <<< maps r1 ---------------------------------------------------------------
  // r6 terrain_environment LANDFORM ROCK GATE (rockGate, decoded above): with
  // uRockGate on (desert), the slope-driven rock/sandstone takeover only
  // fires where the mask-B landform weight says the terrain IS mesa/rim rock.
  // Slope alone cannot tell a mesa wall from a dune slip face, so every steep
  // DUNE face used to inherit the BEDDED sandstone layer and print horizontal
  // terracing — the critique's "heightmap quantization" bands on the dunes.
  // Dunes now stay sand at any slope (the steep-sand ripple/grain pass below
  // carries their detail).
  // r5: breakup widened 0.07 -> 0.16 — the moderate-slope band used to hold
  // 30-60% rock alpha EVERYWHERE, dusting whole hill flanks with uniform
  // speckle fur; with stronger noise the same band resolves into distinct
  // rock outcrop patches separated by clean ground
  float fR = smoothstep(0.095, 0.235, slope + (n1 - 0.5) * 0.16) * rockGate;
  // rock takeover on steep faces: cliff walls and cut banks always read as
  // rock. r3: WIDE, noise-dithered band — the old razor 0.32-0.50 threshold
  // cut giant hard-edged maroon swaths diagonally across the dunes; the low-
  // freq n1 term wanders the boundary while n1hs keeps near-field raggedness
  fR = max(fR, smoothstep(0.28, 0.58, slope + (n1 - 0.5) * 0.10 + (n1hs - 0.5) * 0.08) * rockGate);
  // ...except inside marsh/ice sheet margins: lake banks are snow/soil
  // slumps, and the pale winter rock on them read as a glassy blue cliff
  // wall ringing the frozen lake
  fR *= 1.0 - mkB * 0.85;
  // r6: any face steep enough for the wall-plane projection below is FULLY
  // rock — partial-fR bands left the planar-projected sand layer showing
  // through mid-flank, and its UV stretch was the residual melted-wax smear
  // r8: 0.18-0.40 -> 0.14-0.34 (with the matching steepW change below) — the
  // 15-30 deg mesa flank band still held planar XZ sand UVs and its texture
  // stretched downslope as taffy; wall projection now owns faces from ~28 deg
  // r4 terrain_environment: 0.14-0.34 -> 0.20-0.42 — at 0.14 every moderate
  // DUNE flank flipped to the banded sandstone layer and carried its beds as
  // "pink contour marbling on sand" (desert critique). Rock now takes over
  // from ~37 deg; the 30-37 deg band stays sand (ripples own it).
  fR = max(fR, smoothstep(0.20, 0.42, slope) * (1.0 - mkB * 0.85) * 0.95 * rockGate);
  // triplanar side projection on steep faces: planar XZ UVs smear vertically
  // down cliff walls (the classic heightmap-stretch tell on the mesa cliffs)
  // — resample the rock layer in the wall's own plane and take it over as
  // the slope rises, so cliffs read as stratified rock instead of dragged
  // paint
  float steepW = smoothstep(0.20, 0.42, slope) * (1.0 - mkB * 0.85) * rockGate; // r4: tracks the fR band (marbling fix); r6: landform-gated
  // r7: SHARPENED AXIS TRIPLANAR replaces the r6 tangent projection. The
  // tangent frame was derived from the interpolated normal, so on undulating
  // walls it rotated per-fragment and the sample coordinate wandered — the
  // melted-taffy smear. Two fixed world-axis projections keep every texel
  // anchored in world space; pow(|n|,6) weights keep the crossover band on
  // diagonal faces narrow enough to be invisible on self-similar rock.
  {
    float wSx = pow(abs(wn.x) + 1e-5, 6.0);
    float wSz = pow(abs(wn.z) + 1e-5, 6.0);
    gWallW = wSz / (wSx + wSz);
    gWallUVx = vec2(wp.z * sign(wn.x), -wp.y);
    gWallUVz = vec2(-wp.x * sign(wn.z), -wp.y);
    // r8 per-cliff bed de-sync: the sandstone layer's bed sequence repeats
    // every ~6.5 m of altitude and every face at the same world height showed
    // the SAME stripes ("uniform synthetic strata on every cliff"). A slow
    // world-XZ field (constant down a vertical column, drifting along the
    // wall run) offsets the V coordinate and stretches bed thickness ±13%
    // per cliff, so bed sequences undulate and never sync between faces.
    float cliffJ = texture2D(uNoise, wp.xz * 0.0013 + vec2(0.57, 0.23)).g;
    float cliffJ2 = texture2D(uNoise, wp.xz * 0.0047 + vec2(0.91, 0.13)).r;
    float wallVScale = 0.87 + cliffJ * 0.26;
    float wallVOff = cliffJ * 9.7 + cliffJ2 * 2.3;
    gWallUVx.y = gWallUVx.y * wallVScale + wallVOff;
    gWallUVz.y = gWallUVz.y * wallVScale + wallVOff;
    gCliffJ = cliffJ;
  }
  // r5 terrain_environment: TRUE TRIPLANAR for the GROUND layers, decoupled
  // from the rock takeover. The 24-45 deg dune/mesa-flank band stayed sand
  // (fR/steepW only start at ~37 deg) but kept PLANAR XZ UVs — the 16x aniso
  // sampler dutifully resolved the 1/cos-stretched texels into long downslope
  // strands: the "vertical corduroy" striations on every desert dune face
  // (top critique item). From ~28 deg the base layer re-samples in the two
  // fixed wall planes (same texture, world-anchored), so steep sand reads as
  // bedded sand instead of dragged paint. MATERIAL choice keeps its own
  // thresholds; only the PROJECTION switches early.
  float triW = smoothstep(0.12, 0.30, slope);
  float projW = max(steepW, triW); // gate for every planar-projected extra
  vec4 a = groundSamp(uAlbG, uv * 0.240, df, mipB);
  vec4 n = groundNrm(uNrmG, uv * 0.240, df, mipB);
  // r5 anti-tiling: the ground texture's clump pattern repeats at ONE fixed
  // world scale, so every distance ring shows same-size dark blobs — the
  // "camo carpet" read. Re-sample the same layer at a ~2.3x coarser scale and
  // blend it in over ~35 m noise patches: the characteristic pattern scale
  // now wanders across the map instead of stamping uniformly.
  {
    float scMix = smoothstep(0.40, 0.78, texture2D(uNoise, uvW * 0.0071 + vec2(0.23, 0.51)).g);
    if (scMix > 0.003) {
      a = mix(a, groundSamp(uAlbG, uv * 0.1043, df, mipB), scMix * 0.7);
      n = mix(n, groundNrm(uNrmG, uv * 0.1043, df, mipB), scMix * 0.7);
    }
  }
  if (triW > 0.003) {
    a = mix(a, wallSamp(uAlbG, 0.240, df, mipB), triW);
    n = mix(n, wallSamp(uNrmG, 0.240, df, mipB), triW);
  }
  // dirt patches are an XZ-projected field — on slopes they compressed into
  // downslope smears ("dirt/grime streaks" critique); steep faces run clean
  fD *= 1.0 - triW * 0.7;
  a = mix(a, groundSamp(uAlbD, uv * 0.210, df, mipB), fD); n = mix(n, groundNrm(uNrmD, uv * 0.210, df, mipB), fD);
  if (seaSand > 0.003) { // maps r1: bare shoreline apron under the surf line
    a = mix(a, groundSamp(uAlbD, uv * 0.210, df, mipB), seaSand);
    n = mix(n, groundNrm(uNrmD, uv * 0.210, df, mipB), seaSand);
  }
  a = mix(a, groundSamp(uAlbM, uv * 0.190, df, mipB), fMs); n = mix(n, groundNrm(uNrmM, uv * 0.190, df, mipB), fMs);
  // rock layer: pre-blend planar/wall by triW so the partial-fR band (24-45
  // deg) never lays stretched planar rock over the triplanar sand
  {
    vec4 aR = groundSamp(uAlbR, uv * 0.155, df, mipB);
    vec4 nR = groundNrm(uNrmR, uv * 0.155, df, mipB);
    if (triW > 0.003) {
      aR = mix(aR, wallSamp(uAlbR, 0.155, df, mipB), triW);
      nR = mix(nR, wallSamp(uNrmR, 0.155, df, mipB), triW);
    }
    a = mix(a, aR, fR); n = mix(n, nR, fR);
  }
  // wall-coherent low-freq noise: the planar n2 field is near-degenerate down
  // a vertical face (grazing-angle gradient = wavy banding along cliff tops)
  float n2Wall = wallNoiseG(0.0031, vec2(0.41, 0.13));
  if (steepW > 0.001) {
    vec4 aS = wallSamp(uAlbR, 0.155, df, mipB);
    vec4 nS = wallSamp(uNrmR, 0.155, df, mipB);
    a = mix(a, aS, steepW);
    n = mix(n, nS, steepW);
  }
  // meadow macro variation, three scales (~80 m, ~230 m, ~600 m): dry-straw
  // patches, dark clover, and broad field-to-field tone shifts so open ground
  // never reads as one continuous green wash at any distance
  // r7 terrain_environment: meadowA is a TWO-SCALE composite. The single
  // 0.0121 sample of the 256-texel noise repeats every ~83 m and the dry-
  // straw patchwork visibly restamped on that period (critique: "mottle
  // pattern visibly repeats, ~50-70 m period"). A second incommensurate
  // scale (~128 m, other channel) breaks the period; CPU twin
  // (sampleSplatNoise) mirrors this exactly for grass/dirt correlation.
  float meadowA = texture2D(uNoise, uvW * 0.0121 + vec2(0.63, 0.29)).r * 0.62
                + texture2D(uNoise, uvW * 0.00779 + vec2(0.19, 0.71)).g * 0.38;
  float meadowB = texture2D(uNoise, uvW * 0.0043 + vec2(0.11, 0.87)).g;
  float meadowC = texture2D(uNoise, uvW * 0.0016 + vec2(0.37, 0.55)).r;
  // strength capped ~0.30-0.35 with n1 edge breakup so patch borders are
  // ragged at the ~10 m scale — full-strength smoothstep bands read as a
  // broken cloud-shadow projector in wide shots. DARK-CLOVER (uTintB, the
  // only darkening tint) capped at ~0.22 (lighting_post r1): stacked with
  // canopy shadows + grade contrast the old 0.34 max read as amorphous
  // dark masses / a broken cloud-shadow projector in battlefield.png.
  // r7: meadow tints are planar-projected — on cliff walls they stretched
  // into full-height tint stripes (a big taffy-smear contributor); gate them
  // off steep faces and let the wall macro octave below carry the variation
  float meadowG = (1.0 - fD) * (1.0 - projW);
  // r4: tint strengths raised ~30% (A 0.22+0.18 -> 0.28+0.20, B 0.14+0.08 ->
  // 0.17+0.09, C 0.16+0.14 -> 0.21+0.16) — the macro dry-straw/clover fields
  // were too subtle to register from the chase camera and the ground read as
  // one continuous green wash (critique: "no macro albedo variation")
  // r7: band recentred for the two-scale composite's lower variance + one
  // more strength step — the dry-straw fields must read from the chase cam
  a.rgb = mix(a.rgb, a.rgb * uTintA, smoothstep(0.52, 0.80, meadowA) * (0.33 + 0.20 * n1) * meadowG);
  a.rgb = mix(a.rgb, a.rgb * uTintB, smoothstep(0.58, 0.85, 1.0 - meadowB) * (0.17 + 0.09 * n1) * meadowG);
  a.rgb = mix(a.rgb, a.rgb * uTintC, smoothstep(0.52, 0.9, meadowC) * (0.21 + 0.16 * n1) * meadowG);
  a.rgb *= mix(0.93 + meadowC * 0.14, 1.0, projW);
  // mid-frequency relief + mottle (25-450 m): stroke-free bump from the
  // SMOOTH noise field gradient (texture normals reused at giant scales read
  // as scratch marks), so the midground never collapses into smooth felt
  {
    // r3: far edge is per-map (uMidFar; desert extends it to ~820 m so the
    // dapple carries the open erg past the old 480 m cutoff)
    float dMid = smoothstep(20.0, 55.0, effDist) * (1.0 - smoothstep(uMidFar * 0.46, uMidFar, effDist));
    vec2 uvA = uv * 0.017;
    float ha = texture2D(uNoise, uvA).r;
    vec2 ga = vec2(texture2D(uNoise, uvA + vec2(0.006, 0.0)).r - ha,
                   texture2D(uNoise, uvA + vec2(0.0, 0.006)).r - ha);
    vec2 uvB = uv * 0.0052;
    float hb = texture2D(uNoise, uvB).g;
    vec2 gb = vec2(texture2D(uNoise, uvB + vec2(0.005, 0.0)).g - hb,
                   texture2D(uNoise, uvB + vec2(0.0, 0.005)).g - hb);
    // uMidRelief: per-map scale — bright low-sun sand turns this dapple into
    // a leopard-spot shadow field, so the desert runs it well under 1.0 and
    // leans on the anisotropic wind ripples for mid-frequency character
    // r5 terrain_environment: planar-noise dapple gated off slopes — its
    // gradient is meaningless down a face and printed streaks (corduroy kin)
    float dapG = 1.0 - triW * 0.85;
    n.xy -= (ga * 1.4 + gb * 2.0) * dMid * uMidRelief * dapG;
    float midN2 = texture2D(uNoise, uv * 0.0089 + vec2(0.71, 0.23)).g;
    a.rgb *= 1.0 + ((ha - 0.5) * 0.09 * dMid
                 + (midN2 - 0.5) * 0.12 * smoothstep(30.0, 90.0, camDist)) * uMidRelief * dapG;
    // rock gets its own coarse relief so cliff faces stay craggy at range —
    // wall-plane sample takes over on steep faces (r5). Mix the SAMPLES, not
    // the coordinates: coordinate blending smeared diagonal fur across every
    // partially-steep slope.
    vec3 dnRa = texture2D(uNrmR, uv * 0.041).xyz;
    vec3 dnRb = wallTex(uNrmR, 0.041);
    vec3 dnR = mix(dnRa, dnRb, steepW) * 2.0 - 1.0;
    n.xy += dnR.xy * fR * 0.9 * dMid;
  }
  // horizontal strata banding on steep faces (mesa cliff walls), world-Y driven
  // r4 terrain_environment: band start 0.24 -> 0.36 slope (~31 deg -> ~40 deg)
  // — moderate DUNE flanks fell inside the old band and carried the sin-bed
  // stripes as "pink contour-band marbling over the sand" (desert critique);
  // strata now live only on genuine cliff faces
  if (uStrata > 0.001) {
    float steep = smoothstep(0.36, 0.58, slope) * rockGate; // r6: beds only on real mesa rock
    // r7: bed phase warped by the WALL-plane noise, not planar n2 — planar
    // n2 is sampled at grazing angles down a vertical face, so its rapid
    // horizontal gradient sheared the beds into wavy taffy along cliff tops.
    // n2Wall drifts slowly ALONG the wall: beds wander gently, stay bedded.
    // r8: per-cliff frequency/phase modulation — the fixed 1.9/0.57 wp.y
    // frequencies printed the SAME band ladder on every face at equal
    // altitude ("uniform synthetic strata"); gCliffJ wanders the frequency
    // ±30% and slides the phase several radians per cliff, and the band
    // amplitude itself breathes so some faces are strongly bedded, others
    // nearly massive rock.
    float bedF = 0.76 + gCliffJ * 0.60;
    float band = sin(wp.y * 1.9 * bedF + n2Wall * 2.2 + gCliffJ * 9.3) * 0.55
               + sin(wp.y * 0.57 * bedF + n2Wall * 1.9 + gCliffJ * 5.1) * 0.45;
    a.rgb *= 1.0 + band * uStrata * steep * (0.65 + gCliffJ * 0.7);
    // pale caprock marker beds: wide constant-altitude stripes that survive
    // distance where the fine beds mip away
    float bed = smoothstep(0.55, 0.9, sin(wp.y * 0.23 * bedF + n2Wall * 1.1 + 0.8 + gCliffJ * 3.7));
    a.rgb = mix(a.rgb, a.rgb * vec3(1.16, 1.12, 1.04), bed * steep * 0.4);
    // r8 per-cliff color drift: warm iron-stained faces vs paler washed faces
    // r4: 0.5 -> 0.30 and flush 0.22 -> 0.12 — the stacked warm shifts were
    // the residual PINK cast in the marbled-cliff read
    a.rgb = mix(a.rgb, a.rgb * vec3(1.07, 0.985, 0.91), steep * gCliffJ * 0.30);
    a.rgb = mix(a.rgb, a.rgb * vec3(1.03, 0.95, 0.88), steep * 0.12); // baked iron-oxide faces
    // r7 macro-variation octave (wall-space): breaks the uniform band print
    // into distinct rock masses / weathered faces along the wall run
    float wallMac = wallNoiseG(0.011, vec2(0.19, 0.67));
    a.rgb *= 1.0 + (wallMac - 0.5) * 0.30 * steep;
  }
  // far-cliff detail rescue: the mip-biased macro fade flattens steep rock
  // faces past ~300 m into featureless sheets — re-project the rock layer at
  // a coarse world scale + its normals so distant mesa/cut walls stay craggy
  {
    float farRock = fR * farM;
    if (farRock > 0.003) {
      // wall-plane sample takes over on steep faces (r5). Mix SAMPLES, not
      // coordinates — coordinate blending smeared diagonal fur streaks across
      // every partially-steep slope (the gold "furry" mesa flanks).
      vec4 rr = vec4(mix(texture2D(uAlbR, uv * 0.031).rgb, wallTex(uAlbR, 0.031), steepW), 1.0);
      // LUMINANCE-only modulation at reduced strength (r3): the rgb multiply
      // compounded the rock tint with itself and saturated far walls toward
      // maroon; value-only variation keeps the crag without the color drift
      float rrL = dot(rr.rgb, vec3(0.36, 0.42, 0.22));
      a.rgb = mix(a.rgb, a.rgb * (0.80 + rrL * 0.40), farRock * 0.45);
      vec3 rn = mix(texture2D(uNrmR, uv * 0.019).xyz, wallTex(uNrmR, 0.019), steepW) * 2.0 - 1.0;
      // 0.55 (r5, was 0.9): under a low sun the full-strength coarse normals
      // rendered far flanks as glittery fur instead of crag
      n.xy += rn.xy * farRock * 0.55;
    }
  }
  // wind-aligned sand ripples: anisotropic normal waves instead of dot noise.
  // Two wavelengths: ~2 m gameplay-range ripples + ~11 m dune-face waves that
  // still resolve in establishing shots.
  if (uRipple.z > 0.001) {
    float rphase = dot(uv, uRipple.xy);
    // r8: the ~11 m dune-face wave now fades by 300 m (was 420) and its
    // amplitude is modulated by a ~150 m noise field — past ~300 m the sin
    // rows compressed to a few px apart and aliased into uniform horizontal
    // moire stripe rows across the whole midground (part of the desert
    // "stipple row" artifact); the modulation stops the surviving band from
    // printing one continuous corduroy field
    float rMod = 0.55 + 0.9 * texture2D(uNoise, uv * 0.0064 + vec2(0.83, 0.41)).g;
    float rw = (sin(rphase * 2.9 + texture2D(uNoise, uv * 0.019).r * 7.0)
                  * (1.0 - smoothstep(40.0, 150.0, camDist))
              + sin(rphase * 0.55 + texture2D(uNoise, uv * 0.006).g * 4.0) * 1.1
                  * (1.0 - smoothstep(110.0, 300.0, camDist)) * rMod)
              * uRipple.z * (1.0 - fR) * (1.0 - triW * 0.9);
    n.xy += uRipple.xy * rw;
    // r3 terrain_environment: DUNE BEDFORMS that survive the establishing
    // shot. Both ripple octaves above die by 300 m, so the whole central
    // bowl rendered as one blown cream sheet from the wide camera. A ~26 m
    // wind-transverse wave carried in ALBEDO (normals mip away out there):
    // shadowed slip faces vs lit crests, amplitude wandering on a ~150-300 m
    // field so the waves read as dune trains, not corduroy. Ramps IN past
    // 60 m (the fine ripples own the near field) and never fades out.
    float bedPhase = rphase * 0.24 + texture2D(uNoise, uv * 0.0021 + vec2(0.19, 0.57)).g * 5.0;
    float bedMod = smoothstep(0.30, 0.72, texture2D(uNoise, uvW * 0.0035 + vec2(0.67, 0.23)).r);
    float bed = sin(bedPhase);
    float bedW = min(uRipple.z * 2.2, 1.0) * bedMod * (1.0 - fR) * (1.0 - roadCore)
               * (1.0 - triW) * smoothstep(60.0, 170.0, effDist);
    // r4: 0.105 -> 0.15 — the dune trains must survive the establishing shot
    // (the mid-map otherwise reads as one blown "whipped cream" sheet)
    a.rgb *= 1.0 + bed * 0.15 * bedW;
    n.xy += uRipple.xy * bed * 0.55 * bedW;
    // r6 terrain_environment STEEP-SAND DETAIL: both planar ripple octaves
    // above are gated OFF steep faces (their planar UVs stretch), and with
    // the landform rock gate the dunes no longer borrow the sandstone layer
    // — so steep slip faces would render as bare smooth sand (the critique's
    // "near-textureless bright faces"). Re-project sand grain + avalanche
    // flow in the two fixed WALL planes (samples mixed, never coordinates):
    // fine granular normal, down-slope flow streak, and a gentle slip-face
    // albedo darkening so lit faces keep surface definition.
    float sandFaceW = triW * (1.0 - fR);
    if (sandFaceW > 0.01) {
      vec3 wg1 = texture2D(uNrmG, gWallUVx * 0.55).xyz;
      vec3 wg2 = texture2D(uNrmG, gWallUVz * 0.55).xyz;
      vec3 wgn = mix(wg1, wg2, gWallW) * 2.0 - 1.0;
      // r7: fade 320 -> 560 m — the 300-500 m dune flanks lost every detail
      // pass at once and any residual shading isoline printed bare (part of
      // the "terracing" read); the wall-plane grain now carries those faces
      n.xy += wgn.xy * 0.65 * sandFaceW * (1.0 - smoothstep(160.0, 560.0, effDist));
      // slope-aligned ripple detail on the same faces: anisotropic waves in
      // the wall frame (V = world height, so crests run along the contour —
      // real wind ripples on a slip face) mask any residual banding
      {
        float wRip = mix(sin(gWallUVx.y * 7.3 + texture2D(uNoise, gWallUVx * 0.05).r * 4.0),
                         sin(gWallUVz.y * 7.3 + texture2D(uNoise, gWallUVz * 0.05).r * 4.0), gWallW);
        float wRipW = sandFaceW * (1.0 - smoothstep(200.0, 620.0, effDist)) * 0.30;
        vec2 hDir = wn.xz / max(length(wn.xz), 1e-4); // fall-line in the map plane
        a.rgb *= 1.0 + wRip * 0.12 * wRipW;
        n.xy += hDir * wRip * wRipW;
      }
      // avalanche flow tongues: value streaks running down the fall line
      // (variation ALONG the wall run = vertical flow structure)
      float flow = mix(
        sin(gWallUVx.x * 1.7 + texture2D(uNoise, gWallUVx * 0.06).r * 5.0),
        sin(gWallUVz.x * 1.7 + texture2D(uNoise, gWallUVz * 0.06).r * 5.0), gWallW);
      float wgA = mix(texture2D(uAlbG, gWallUVx * 0.10, 1.0).g,
                      texture2D(uAlbG, gWallUVz * 0.10, 1.0).g, gWallW);
      a.rgb *= (1.0 + flow * 0.05 * sandFaceW) * (0.88 + wgA * 0.24 * sandFaceW + (1.0 - sandFaceW) * 0.12);
      a.rgb *= 1.0 - sandFaceW * 0.07; // slip-face definition vs the blown flats
    }
  }
  // r3 terrain_environment: desert macro sheet variation — the bowl between
  // the mesas was near-uniform pale cream at establishing range. Broad
  // (~120-400 m) warped fields: darker granular gravel-lag basins and pale
  // wind-scoured sheets, gated off rock/road so the landforms keep their own
  // material response.
  if (uSandMacro > 0.001) {
    float smA = texture2D(uNoise, uvW * 0.0024 + vec2(0.13, 0.83)).r;
    float smB = texture2D(uNoise, uvW * 0.0009 + vec2(0.77, 0.31)).g;
    float openW = (1.0 - fR) * (1.0 - roadCore) * (1.0 - projW) * uSandMacro;
    float gravelW = smoothstep(0.56, 0.82, smA + (n1 - 0.5) * 0.24) * openW;
    float grainG = texture2D(uNoise, uv * 0.11 + vec2(0.41, 0.09)).r;
    vec3 gravelCol = a.rgb * vec3(0.80, 0.755, 0.70) * (0.90 + grainG * 0.20);
    a.rgb = mix(a.rgb, gravelCol, gravelW * 0.8);
    a.a = mix(a.a, max(a.a, 0.92), gravelW * 0.5); // lag surfaces run matte
    float scourW = smoothstep(0.60, 0.90, smB) * openW * (1.0 - gravelW);
    a.rgb = mix(a.rgb, a.rgb * vec3(1.055, 1.035, 1.0), scourW * 0.55);
    // r6: brightest-texel shoulder — open sand at ~1.2+ linear tonemapped to
    // blown paper (critique: "bright sand faces partially blown out"); trim
    // only the top of the albedo range so texture survives the ACES shoulder
    float sandLum = dot(a.rgb, vec3(0.34, 0.42, 0.24));
    a.rgb *= 1.0 - smoothstep(0.60, 0.95, sandLum) * 0.10 * uSandMacro;
  }
  // r6 terrain_environment: UNCORRELATED mid-band octave. Every macro term
  // above keys off the SAME two noise fields (n1/n2 and their warps), and the
  // far-variant tile repeats at ~18 m — together the 50-150 m midground read
  // as one repeating mottled-blotch print (critique). A third pair of fields
  // at fresh offsets/scales (~34 m and ~13 m), band-limited to 35-260 m,
  // decorrelates the repeat without touching the near field.
  {
    float decoW = smoothstep(35.0, 90.0, effDist) * (1.0 - smoothstep(160.0, 260.0, effDist))
      * (1.0 - fM) * (1.0 - roadCore);
    if (decoW > 0.004) {
      float dcA = texture2D(uNoise, uv * 0.0293 + vec2(0.83, 0.07)).r;
      float dcB = texture2D(uNoise, uv * 0.0741 + vec2(0.29, 0.63)).g;
      a.rgb *= 1.0 + ((dcA - 0.5) * 0.11 + (dcB - 0.5) * 0.07) * decoW;
    }
  }
  // 0-48 m detail pass: layered micro normals + albedo speckle + road gravel
  float dNear = 1.0 - smoothstep(18.0, 48.0, camDist);
  if (dNear > 0.001) {
    vec3 dn = texture2D(uNrmD, uv * 1.07).xyz * 2.0 - 1.0;
    n.xy += dn.xy * 0.85 * dNear;
    float micro = texture2D(uNoise, uv * 0.171).r;
    a.rgb *= 1.0 + (micro - 0.5) * 0.30 * dNear * uMicroAmp;
    vec4 grav = texture2D(uAlbR, uv * 0.83);
    a.rgb = mix(a.rgb, grav.rgb * vec3(1.02, 0.96, 0.86), roadCore * 0.42 * dNear);
    // sub-10 m second octave: clod/blade relief right under the camera
    // r6 terrain_environment: band widened (5-15 -> 6-26 m) and the octave
    // now carries ALBEDO as well as normal — the 5-20 m meadow read as one
    // smeared macro-noise wash with "no visible detail" (critique). The
    // ~0.9 m re-projection of the ground layer is the blade/clod-scale
    // signal that resolves right in front of the hull.
    float dNear2 = 1.0 - smoothstep(6.0, 26.0, camDist);
    if (dNear2 > 0.001) {
      vec3 dn2 = texture2D(uNrmG, uv * 2.71).xyz * 2.0 - 1.0;
      n.xy += dn2.xy * 0.75 * dNear2;
      // zero-mean albedo octave: deep-mip sample = local tile mean, so the
      // modulation is exposure-neutral on every map palette (sand vs turf)
      float gl2 = dot(texture2D(uAlbG, uv * 2.71).rgb, vec3(0.36, 0.42, 0.22));
      float glM = dot(texture2D(uAlbG, uv * 2.71, 6.0).rgb, vec3(0.36, 0.42, 0.22));
      a.rgb *= 1.0 + clamp((gl2 - glM) * 1.5, -0.22, 0.26) * dNear2;
    }
  }
  {
    // compacted earth road: two-track profile — lightened compacted core,
    // dark wheel ruts, damp borders. uRoadTex (0..1) cross-fades to PAVED
    // town streets: the rock layer (cobble/sett) laid across the full
    // carriageway at every distance, ruts nearly gone.
    float dW = roadCore * 0.9 * (1.0 - uRoadTex);
    // pull the compacted core toward NEUTRAL packed earth: tint, then
    // partially desaturate so the carriageway never glows orange against
    // the graded green field
    vec3 roadCol = a.rgb * uRoadTint + vec3(0.014, 0.010, 0.006);
    roadCol = mix(roadCol, vec3(dot(roadCol, vec3(0.34, 0.45, 0.21))), 0.26);
    a.rgb = mix(a.rgb, roadCol, dW);
    // r6: paved rut wear 0.10 -> 0.30 — town streets need visible dark
    // wheel-wear lanes or the carriageway reads as one clean bright sheet
    // terrain_environment r2: the mask G channel mip-averages away past
    // ~250 m and distant roads collapsed into uniform beige ribbons — boost
    // the surviving rut signal with distance so the two-track read holds
    a.rgb *= 1.0 - min(rut * (1.0 + farM * 0.9), 1.0) * mix(0.55, 0.30, uRoadTex);
    if (uRoadTex > 0.01) {
      // r5: HARDER pavement edge (0.10-0.26 with less noise wobble) — paved
      // town streets end at a kerb line, they do not alpha-fade into lawn.
      // Patch/repair tone variation breaks the uniform sett sheet.
      // r6: harder pavement edge (0.15-0.24, noise wobble halved) — the wide
      // noise-feathered 0.10-0.26 ramp read as water-eroded banks; a paved
      // street must end on a near-kerb line
      float paveCore = smoothstep(0.15, 0.24, mk.r + (n1hs - 0.5) * 0.025) * uRoadTex;
      vec4 pav = splatSamp(uAlbR, uv * 0.31, df, mipB);
      vec4 pnn = splatSamp(uNrmR, uv * 0.31, df, mipB);
      float pvar = texture2D(uNoise, uv * 0.037 + vec2(0.77, 0.19)).r; // NB: "patch" is a reserved word in GLSL ES
      // r6: 0.86+0.26 -> 0.72+0.22 — the near-white sett sheet under a blue
      // sky ambient read as a frozen canal; darker worn stone keeps the
      // street below the facade value range
      pav.rgb *= 0.72 + smoothstep(0.35, 0.75, pvar) * 0.22;
      a.rgb = mix(a.rgb, pav.rgb * uRoadTint, paveCore * 0.94);
      a.a = mix(a.a, pav.a, paveCore * 0.85);
      n = mix(n, pnn, paveCore * 0.85);
      // gutter shading: a darkened seam just inside the pavement edge gives
      // the street a built profile even before the kerb geometry resolves
      float gutter = smoothstep(0.06, 0.20, mk.r) * (1.0 - smoothstep(0.22, 0.42, mk.r));
      a.rgb *= 1.0 - gutter * 0.18 * uRoadTex;
    }
  }
  // r4: 0.09 -> 0.16 + a dusty desaturation pull — road shoulders must read
  // as worn verge (tracked dirt spilling off the carriageway), not clean lawn
  // running flush to the wheel ruts (critique: "no decals along road edges")
  // r7: NOISE-RAGGED edge band + gravel spill — the road met the grass as
  // one uniform soft feather (decal-ecosystem critique); the worn verge now
  // breaks up on the ~6 m noise and scatters gravel speckle off the
  // carriageway shoulder
  float edgeBand = shoulder * (1.0 - roadCore) * (0.55 + 0.90 * n1hs);
  a.rgb *= 1.0 - edgeBand * 0.16;
  a.rgb = mix(a.rgb, vec3(dot(a.rgb, vec3(0.34, 0.45, 0.21))) * vec3(1.06, 1.0, 0.88), edgeBand * 0.22);
  {
    float gravSpill = shoulder * (1.0 - roadCore) * smoothstep(0.58, 0.9, n1h)
      * (1.0 - smoothstep(30.0, 90.0, effDist));
    if (gravSpill > 0.004) {
      vec4 gravE = texture2D(uAlbR, uv * 0.83);
      a.rgb = mix(a.rgb, gravE.rgb * vec3(1.02, 0.97, 0.88), gravSpill * 0.5);
    }
  }
  // rut relief from the mask G gradient (visible well past the near ring)
  {
    float texel = 1.4 / 1024.0;
    vec2 rutG;
    rutG.x = texture2D(uMask, mUV + vec2(texel, 0.0)).g - texture2D(uMask, mUV - vec2(texel, 0.0)).g;
    rutG.y = texture2D(uMask, mUV + vec2(0.0, texel)).g - texture2D(uMask, mUV - vec2(0.0, texel)).g;
    // r2: attenuation eased (1-df -> 1-df*0.55) so rut relief survives into
    // the midfield instead of dying at the 160 m detail fade
    n.xy += rutG * 0.9 * (1.0 - df * 0.55);
  }
  // wind-blown snow drifts across the ice sheet + snowbank shoreline blend
  // (maps r1: the whole sheet block reads fMs — identical to fM everywhere
  // uSea is 0, i.e. on every pre-existing map)
  float driftW = 0.0;
  if (uIceDrift > 0.001 && fMs > 0.02) {
    // macro ice re-projection: the detail ice layer tiles every ~5 m, so its
    // cracks/depth blotches average away by 150 m and the whole sheet read
    // as snowfield in establishing shots — overlay the same texture at a
    // ~75 m tile so pressure cracks and dark clear-ice patches survive at
    // range and the lake reads as ICE from the wide camera
    // LUMINANCE-only macro modulation (r5): multiplying the sheet by its own
    // RGB squared the blue saturation — the garish swimming-pool ellipse.
    // Value variation alone keeps the gray-white ice albedo authored in the
    // layer while the cracks/depth blotches still read at range.
    vec4 iceMacro = texture2D(uAlbM, uv * 0.0134);
    float iceLum = dot(iceMacro.rgb, vec3(0.30, 0.45, 0.25));
    // r6: macro contrast up (0.55+0.80 -> 0.45+1.00) so the 75 m-scale
    // pressure cracks and clear-ice fields dominate at range...
    // r4: 0.45+1.00 -> 0.36+1.18 — one more contrast step (see makeIceLayer)
    a.rgb = mix(a.rgb, a.rgb * (0.36 + iceLum * 1.18), fMs * 0.9);
    // ...and DESATURATE the sheet with distance: the 5 m detail tile can only
    // resolve as blue salt-speckle from the establishing camera — pull the
    // far sheet toward a cool gray so it reads as one ice surface with crack
    // veins, not a blue static field
    float iceGrey = dot(a.rgb, vec3(0.30, 0.45, 0.25));
    a.rgb = mix(a.rgb, vec3(iceGrey) * vec3(0.965, 1.0, 1.05), fMs * farM * 0.6 * (1.0 - uSea));
    float drift = smoothstep(0.52, 0.78,
      texture2D(uNoise, uv * 0.021 + vec2(0.31, 0.77)).r + (n1h - 0.5) * 0.30);
    float bank = 1.0 - smoothstep(0.25, 0.75, fMs); // shoreline band drifts hardest
    driftW = clamp(drift * uIceDrift * (0.48 + bank * 0.52), 0.0, 1.0) * fMs;
    // maps r1: sand/mud shoals belong in the SHALLOWS — deep-water "drift"
    // read as pale mottling across the whole sheet (uSea=0: multiplier 1)
    driftW *= mix(1.0, 0.30 + bank * 0.70, uSea);
    if (uSea > 0.5) { // maps r1: open water "drifts" are sand shoals, not snow
      a = mix(a, groundSamp(uAlbD, uv * 0.210, df, mipB), driftW * 0.85);
      n = mix(n, groundNrm(uNrmD, uv * 0.210, df, mipB), driftW * 0.85);
    } else {
      a = mix(a, groundSamp(uAlbG, uv * 0.240, df, mipB), driftW);
      n = mix(n, groundNrm(uNrmG, uv * 0.240, df, mipB), driftW);
    }
    // r6: pressure ridges — concentric normal waves + a bright refrozen crest
    // following the shoreline contour (fM isolines via the mask-B gradient).
    // Real lake ice buckles against its banks; the flat noise disc was the
    // last tell. Ridges fade where snow drifts bury the sheet.
    float ridgeBand = smoothstep(0.08, 0.38, fMs) * (1.0 - smoothstep(0.55, 0.88, fMs))
      * (1.0 - uSea); // maps r1: pressure ridges are an ICE feature
    if (ridgeBand > 0.004) {
      float texelR = 2.0 / 1024.0;
      vec2 gM;
      gM.x = texture2D(uMask, mUV + vec2(texelR, 0.0)).b - texture2D(uMask, mUV - vec2(texelR, 0.0)).b;
      gM.y = texture2D(uMask, mUV + vec2(0.0, texelR)).b - texture2D(uMask, mUV - vec2(0.0, texelR)).b;
      float gl = length(gM);
      if (gl > 1e-5) {
        vec2 gd = gM / gl;
        // ~14 cycles across the shore ramp (the first 44 aliased into a
        // moire groove pattern from the establishing camera); n1 breaks the
        // ring phase so buckle lines wander instead of tracing isolines
        float ridge = sin(fMs * 14.0 + n1h * 2.2 + n1 * 4.0) * ridgeBand * (1.0 - driftW);
        n.xy += gd * ridge * 0.45;
        a.rgb *= 1.0 + max(ridge, 0.0) * 0.07;
      }
    }
    // r3 terrain_environment: FRESNEL sky sheen on clear ice — the sheet had
    // no view-dependent response at all and read as a flat blue stain. At the
    // near-grazing establishing camera the clear-ice fields now pick up the
    // cold sky tint (drifted snow stays matte), which together with the
    // lowered roughness floor below gives the lake a real ice identity.
    // (first cut at 0.55 toward a bright tint WASHED the sheet whiter than
    // the snow — the sheen must stay a cool mid-tone glaze over DARK ice)
    // r6 terrain_environment: BLUE DEPTH GRADIENT — the sheet read as one
    // flat single-tone disc (critique). Deep water under the interior ice
    // darkens and cools it; the drifted shore band stays snow-toned. Plus a
    // macro normal waviness from the ice layer's own normal map so the
    // fresnel/sun response breaks into streaks instead of one flat sheen.
    {
      float deepW = smoothstep(0.45, 0.95, fMs) * (1.0 - driftW);
      // maps r1: open water deepens toward a darker blue-green (uSea-gated);
      // ice keeps its pale blue depth cue
      vec3 deepTint = mix(vec3(0.74, 0.86, 1.05), vec3(0.34, 0.56, 0.66), uSea);
      a.rgb *= mix(vec3(1.0), deepTint, deepW * mix(0.5, 0.72, uSea));
      vec3 iceN = texture2D(uNrmM, uv * 0.0134).xyz * 2.0 - 1.0;
      n.xy += iceN.xy * 0.5 * fMs * (1.0 - driftW);
    }
    {
      vec3 vDirIce = normalize(cameraPosition - wp);
      float fresI = pow(1.0 - clamp(dot(vDirIce, wn), 0.0, 1.0), 3.0);
      float clearIce = fMs * (1.0 - driftW);
      // r4: 0.30 -> 0.48 — the sheet still read as a matte pale splat from
      // the establishing camera; a stronger grazing sky sheen (plus the 0.14
      // roughness floor below) finally gives it a specular ice identity
      // lighting_post r4: 0.48 -> 0.62 — winter.js envIntensity dropped
      // 0.60 -> 0.32 to kill the albedo-independent pale wash on props; the
      // ice sheet keeps its DIRECTIONAL sheen by leaning harder on its own
      // fresnel term instead of the scene-wide env (ice vs snow separation).
      // maps r1: open water runs the sheen a step weaker than clear ice —
      // at establishing grazing angles the full 0.62 painted the whole
      // sea/river pale sky-grey (uSea=0 keeps the winter value exactly)
      // Liquid water should reflect the sky without becoming a white sheet.
      // The sea keeps the same draw path as ice, but uses a lower-energy
      // grazing glaze so the authored depth and chop remain visible.
      a.rgb = mix(a.rgb, uIceSky, fresI * clearIce * mix(0.62, 0.24, uSea));
    }
    // >>> maps r1 (uSea-gated): surf line + sparse whitecaps. The surf band
    // rides the RAW fM ramp (it peaks just shoreward of where fMs starts),
    // broken by two noise octaves so the foam edge is ragged, never a ring.
    if (uSea > 0.5 && uSeaFoam > 0.001) {
      // the surf band hugs the fMs waterline whatever ramp the map runs
      float surfBand = smoothstep(0.012, 0.10, fMs) * (1.0 - smoothstep(0.30, 0.62, fMs));
      float fno = texture2D(uNoise, uv * 0.045 + vec2(0.63, 0.17)).r * 0.55
                + texture2D(uNoise, uv * 0.17 + vec2(0.29, 0.83)).g * 0.45;
      float foam = surfBand * smoothstep(0.42, 0.78, fno + (n1h - 0.5) * 0.20) * uSeaFoam;
      float caps = fMs * smoothstep(0.87, 0.97, texture2D(uNoise, uvW * 0.031 + vec2(0.51, 0.07)).r)
                 * 0.45 * uSeaFoam * (1.0 - farM * 0.6);
      gSeaFoam = clamp(foam + caps, 0.0, 1.0);
      a.rgb = mix(a.rgb, vec3(0.68, 0.80, 0.84), gSeaFoam * 0.72);
    }
    // <<< maps r1 -------------------------------------------------------------
  }
  // r7: the unconditional macro term reads the PLANAR n2 field — degenerate
  // down vertical faces, it printed full-height value stripes (taffy smear);
  // steep faces take the wall-coherent sample instead
  a.rgb *= 0.90 + mix(n2, n2Wall, projW) * 0.20;
  // wet/dark shoreline band where ground meets a marsh or ice sheet: the
  // sheet blends into darkened damp banks instead of ending on a hard seam
  // maps r1: in open-water mode the damp band hugs the waterline instead of
  // spanning the whole beach apron (which would read as one wet smear)
  float shoreW = uSea > 0.5
    ? smoothstep(0.16, 0.36, fM) * (1.0 - smoothstep(0.48, 0.78, fM))
    : smoothstep(0.04, 0.30, fM) * (1.0 - smoothstep(0.55, 0.95, fM));
  a.rgb *= 1.0 - shoreW * 0.30 * (1.0 - driftW);
  // >>> terrain_environment r2: agrarian field patchwork + far turf relief. --
  // The 150-800 m band used to collapse into one smooth green wash (the bald
  // "gumdrop" midground hills behind the village): by 330 m every detail
  // layer is mip-faded flat and the soft meadow tints carry no structure.
  // (a) per-plot crop-tone variation on a ~92 m warped grid with darker
  //     field-margin lines (hedgerow/verge read from the air),
  // (b) straight mowing/crop strips inside each plot (~20 m pitch),
  // (c) a coarse re-projection of the grass layer's normal+albedo (same trick
  //     as the far-cliff rescue) so distant hills shade like turf-covered
  //     terrain instead of smooth clay.
  {
    // r4: band pulled in 70-150 -> 40-110 m — plowed/mowed field patches must
    // be visible from the gameplay camera, not only in establishing shots
    float fieldW = uFieldPatch * smoothstep(40.0, 110.0, effDist)
      * (1.0 - fD) * (1.0 - fM) * (1.0 - shoulder) * (1.0 - fR) * (1.0 - projW)
      * (1.0 - mk.a);
    if (fieldW > 0.004) {
      vec2 plotUv = uvW * (1.0 / 92.0);
      vec2 pid = floor(plotUv);
      float pr = texture2D(uNoise, pid * 0.1371 + vec2(0.29, 0.71)).r;
      float pg = texture2D(uNoise, pid * 0.2117 + vec2(0.61, 0.37)).g;
      // per-plot crop tone: hay-gold / dark clover / neutral pasture
      float cropSel = smoothstep(0.40, 0.72, pr);
      vec3 cropTint = mix(vec3(1.0),
        pg > 0.5 ? vec3(1.10, 1.04, 0.80) : vec3(0.84, 0.94, 0.82),
        cropSel * 0.55);
      a.rgb *= mix(vec3(1.0), cropTint, fieldW);
      // straight mowing strips: direction + pitch vary per plot
      float mAng = pr * 6.2832 + pg * 2.1;
      vec2 mdir = vec2(cos(mAng), sin(mAng));
      float strip = sin(dot(uv, mdir) * (0.24 + pg * 0.22));
      a.rgb *= 1.0 + strip * 0.05 * fieldW * (0.35 + cropSel);
      // darker margin line along plot borders
      vec2 fr2 = abs(fract(plotUv) - 0.5);
      float margin = smoothstep(0.44, 0.492, max(fr2.x, fr2.y));
      a.rgb *= 1.0 - margin * 0.10 * fieldW;
    }
    // coarse turf relief at range (all maps): the far band keeps macro
    // normal structure where the per-texel detail normals have faded out
    float farG = farM * (1.0 - fR) * (1.0 - fM) * (1.0 - projW);
    if (farG > 0.003) {
      // 1.5: SPLAT_NORMAL_FRAG rolls detail normals to ~0.29 strength in the
      // far band — pre-compensate so the coarse relief survives out there
      vec3 gnF = texture2D(uNrmG, uv * 0.021).xyz * 2.0 - 1.0;
      n.xy += gnF.xy * farG * 1.5;
      float gLum = dot(texture2D(uAlbG, uv * 0.0137).rgb, vec3(0.36, 0.42, 0.22));
      a.rgb *= mix(1.0, 0.86 + gLum * 0.30, farG * 0.55);
    }
  }
  // <<< terrain_environment r2 ------------------------------------------------
  // distant mottling: forest-floor/heather patches keep far hills from reading
  // as one flat green wash
  float mot = texture2D(uNoise, uv * 0.0022 + vec2(0.17, 0.71)).g;
  // r7: planar-projected far mottling gated off steep faces (vertical stripes)
  float motG = farM * (1.0 - projW);
  // r8: darkening 0.20 -> 0.13 with a wider, later ramp — at 0.20 the term
  // stamped muddy cloud-shadow blotches across mid-distance sand/meadow
  a.rgb *= 1.0 - motG * 0.13 * smoothstep(0.55, 0.95, mot);
  a.rgb *= 1.0 + motG * 0.13 * smoothstep(0.55, 0.85, n1) * (1.0 - smoothstep(0.48, 0.82, mot));
  // >>> gameplay_feel r4: grazing-view meadow rescue. ------------------------
  // Driving toward rising ground the chase/scope camera sees the meadow at a
  // few degrees of incidence: the projected pixel footprint stretches far
  // past the 16x aniso budget, the sampler mip-blurs everything along the
  // compressed (view) axis, and the smooth-noise meadow tint bands smear
  // into kilometer-long "aurora" streaks — the whole face collapses to a
  // featureless green wall (r4 drive critique, drive_chase.png: 85% of the
  // frame). Slope alone is NOT the trigger (the r4 wall measures ~6-15 deg);
  // VIEW GRAZING is. Fix: where the view grazes the surface, resample the
  // grass layer in a view-aligned surface basis with the texture COUNTER-
  // STRETCHED along the compressed axis — content elongates toward the
  // camera exactly like real grass read at grazing, and its cross-view
  // frequency stays resolvable by the sampler at any incidence. Gated off
  // roads/dirt/marsh/rock and off the near field (< ~35 m resolves fine).
  {
    vec3 vDirN = normalize(cameraPosition - wp);
    float dNV = saturate(dot(vDirN, wn));
    // r6 terrain_environment: band tightened 0.16-0.40 -> 0.07-0.22. The
    // rescue exists for NEAR-TANGENT chase views (dNV < ~0.1, where the 16x
    // aniso sampler genuinely runs out); at 0.40 it was still partially
    // active for the ~30-70 deg establishing camera and its counter-
    // stretched resample printed the directional "combed fabric" weave
    // across the 80-150 m midground (the mottled-blotch critique).
    float grazeW = (1.0 - smoothstep(0.07, 0.22, dNV))
                 * smoothstep(30.0, 70.0, camDist)
                 * (1.0 - smoothstep(320.0, 480.0, camDist))
                 * (1.0 - projW)
                 * (1.0 - fD) * (1.0 - fM) * (1.0 - roadCore) * (1.0 - fR);
    if (grazeW > 0.004) {
      // surface basis: e1 = cross-view tangent (fine axis), e2 = down-view
      // tangent (compressed axis, counter-stretched ~4.5:1)
      vec3 e1 = normalize(cross(wn, vDirN));
      vec3 e2 = cross(e1, wn);
      // r2: counter-stretch eased 0.22 -> 0.32 — the 4.5:1 stretch printed a
      // visible directional combing band across the 60-130 m midfield
      // r3 terrain_environment: eased again 0.32 -> 0.48 (~2:1) — the r2
      // stretch still resolved as an anisotropic combed smear right of the
      // road in player_view; a gentler counter-stretch plus ISOTROPIC value
      // breakup (planar-warped n1w below) keeps the grazing rescue without
      // printing a directional texture band
      vec2 uvG = vec2(dot(wp, e1), dot(wp, e2) * 0.58);
      vec4 aG = splatSamp(uAlbG, uvG * 0.240, df, 0.0);
      vec4 nG = splatSamp(uNrmG, uvG * 0.240, df, 0.0);
      // value breakup in the SAME stretched space (replaces the smeared
      // planar tint bands instead of re-projecting them)
      float n1G = texture2D(uNoise, uvG * 0.0117).r;
      float n2G = texture2D(uNoise, uvG * 0.0031 + vec2(0.41, 0.13)).g;
      aG.rgb *= (0.88 + n1G * 0.18) * (0.94 + n2G * 0.12);
      // isotropic planar patch tone re-applied over the stretched sample so
      // the band cannot read as one combed direction
      aG.rgb *= 0.92 + n1w * 0.16;
      // r2: 0.80 -> 0.62 — full-strength replacement stamped its own combed
      // texture band; a partial blend keeps the planar patchwork visible
      // r3: 0.62 -> 0.48, same reasoning one more step
      float gMix = grazeW * 0.38;
      a = mix(a, aG, gMix);
      n = mix(n, nG, gMix);
    }
    // steep NEAR faces (a genuine 15-30 deg climb face inside ~60 m) also
    // get their blade/clod relief back in the face's own plane — this is
    // what restores grass detail right in front of the hull on a climb.
    float faceW = smoothstep(0.02, 0.085, slope) * (1.0 - steepW)
                * (1.0 - smoothstep(20.0, 60.0, camDist))
                * (1.0 - fD) * (1.0 - fM) * (1.0 - roadCore) * (1.0 - fR);
    if (faceW > 0.004) {
      vec2 hn2 = wn.xz / max(length(wn.xz), 1e-4);
      vec2 uvFace = vec2(dot(wp.xz, vec2(-hn2.y, hn2.x)),
                         dot(wp.xz, hn2) / max(wn.y, 0.30));
      vec3 dnF = texture2D(uNrmD, uvFace * 1.07).xyz * 2.0 - 1.0;
      n.xy += dnF.xy * 0.85 * faceW;
    }
  }
  // <<< gameplay_feel r4 -----------------------------------------------------
  gSplatAlbedo = a.rgb;
  float iceW = clamp(fMs * uMarshGloss * 1.3, 0.0, 1.0) * (1.0 - driftW);
  float rough0 = clamp(a.a * (1.0 - roadCore * 0.12) * (1.0 + rut * 0.1)
    * (1.0 - fMs * uMarshGloss * (1.0 - driftW)), 0.05, 1.0);
  // ice roughness floor: at 0.05 the grazing-angle Fresnel term mirrors the
  // bright sky across the whole sheet and buries the crack/depth albedo —
  // ~0.45 keeps a satin sheen while the ice texture stays legible from the
  // near-grazing establishing camera
  // r6: 0.45 -> 0.30 — under the overcast winter sky the 0.45 floor killed
  // the sheet's specular response entirely (flat noise disc critique); 0.30
  // gives a believable satin ice sheen while the macro cracks stay legible
  // r9: 0.30 -> 0.20 — with the raised winter envIntensity the sheet still
  // read matte from the establishing camera; 0.20 picks up a real sky sheen
  // on the clear-ice fields while drifted snow (driftW) stays matte
  // terrain_environment r3: 0.20 -> 0.17 — pairs with the fresnel sky tint
  // above; the clear-ice fields need a genuine specular identity (0.13 let
  // the bright overcast env reflection blow the sheet out to snow-white)
  // r4: 0.17 -> 0.14 — one step glossier with the stronger fresnel term
  // maps r1: water is choppier than clear ice — a higher roughness floor
  // stops the sun's GGX lobe washing the whole sheet bright (uSea=0: 0.14)
  rough0 = max(rough0, iceW * mix(0.14, 0.54, uSea));
  rough0 = max(rough0, gSeaFoam * 0.88); // maps r1: foam is matte (0 off sea maps)
  // Dry terrain stays truly matte. The previous 0.78 floor left a broad GGX
  // sun lobe on dirt/snow at grazing angles, making the ground look wet even
  // when its albedo and normal detail were correct. Ice and open water keep
  // their authored response through iceW; every dry texel is >= 0.92.
  gSplatRough = max(rough0, 0.92 * (1.0 - iceW) + shoreW * -0.04);
  gSplatNrm = n.xyz * 2.0 - 1.0;
  gSplatFar = farM;
  // steep faces beyond gameplay range: their per-texel normal shading is the
  // strand-noise generator under a low sun — hand the shading to the
  // geometric normal early (from ~50 m out) on cliffs specifically
  gSplatSteepAtt = smoothstep(0.20, 0.45, slope) * smoothstep(50.0, 160.0, camDist) * 0.62;
}
`;

const SPLAT_NORMAL_FRAG = /* glsl */`
{
  vec3 dN = gSplatNrm;
  vec3 gN = normalize(vWNormal);
  // r5: detail-normal strength falls off with distance (0.9 -> ~0.30 by the
  // far band). Past ~300 m per-texel normal shading cannot resolve — on
  // steep faces under a low sun it rendered as high-contrast bright/dark
  // strand noise ("furry" mesa flanks); the geometric normal carries the
  // far shading instead.
  float dk = 0.9 * (1.0 - max(gSplatFar * 0.68, gSplatSteepAtt));
  vec3 wN = normalize(vec3(gN.x + dN.x * dk, max(gN.y, 0.02), gN.z + dN.y * dk));
  normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
}
`;

function createSplatMaterial(engineCtx, layout, splatCfg, mapId = 'verdant', landformW = null) {
  const S = splatCfg || {};
  // r6 terrain_environment: the mesa/rim landform weight rides the MASK's
  // BLUE channel on maps that provide landformW (desert — it has no marshes
  // or lakes, so B is free there). A dedicated sampler blew the 16-unit
  // fragment texture limit; uRockGate tells the shader how to read B.
  // r5: terrain layers get the FULL 16x anisotropy regardless of the global
  // default — the 4x cap was the root of the long "rain streak" smears down
  // every steep face seen at grazing angles (mesa flanks, cut banks): past a
  // 4:1 footprint the sampler can only blur along the compressed axis.
  const aniso = Math.max(16, engineCtx.anisotropy ?? 4);
  const layers = {
    G: makeGrassLayer(3000, aniso, S.grassTone || null),
    D: makeDirtLayer(3001, aniso, S.dirtTone || null),
    // r7: cfg.splat.sandstone routes the R layer to the stratified
    // sedimentary painter (desert cliffs). The sourced Rock063 set is
    // disabled for that map in sourcedTextures.js — its wavy metamorphic
    // structure was the "wet-sand swirl" artifact on every canyon wall.
    R: S.sandstone
      ? makeSandstoneLayer(3002, aniso, S.rockTone || null)
      : makeGroundLayer(3002, 'rock', aniso, S.rockTone || null),
    M: S.iceLake
      ? makeIceLayer(3003, aniso)
      : S.seaLake // maps r1 (ADDITIVE): open-water sheet (coastal sea / rivers)
        ? makeSeaLayer(3003, aniso, S.mudTone || null)
        : makeGroundLayer(3003, 'mud', aniso, S.mudTone || null, S.mudRough ?? 1),
  };
  // Deep-hunt 2026-07: sourced CC0 PBR sets (ambientCG/Poly Haven, see
  // docs/ATTRIBUTION.md) replace the procedural layer textures in place when
  // available; procedural stays the synchronous fallback behind the flag in
  // sourcedTextures.js and on any load failure.
  const sourcedTexturesReady = applySourcedTerrain(mapId, layers, S);
  const maskNoi = new SimplexNoise({ random: mulberry32(3010) });
  const mask = makeMaskTexture(maskNoi, layout, landformW);
  const noiseTex = makeShaderNoiseTexture(3011);
  const tintA = S.tintA || [1.16, 1.08, 0.76];
  const tintB = S.tintB || [0.78, 0.90, 0.72];
  const tintC = S.tintC || [1.10, 1.04, 0.84];
  // neutral packed-earth default (the old 1.20/1.12/0.96 pushed roads orange)
  const roadTint = S.roadTint || [1.08, 1.04, 0.96];

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0 });
  // r3: DoubleSide — at chunk borders where LOD levels disagree on a steep
  // cliff edge, the higher chunk's skirt ribbon can face AWAY from a camera
  // looking across the boundary; the culled backface opened a fog-bright
  // sliver through the desert canyon pass (battlefield_desert center).
  mat.side = THREE.DoubleSide;
  const splatHook = (shader) => {
    shader.uniforms.uAlbG = { value: layers.G.albedo };
    shader.uniforms.uAlbD = { value: layers.D.albedo };
    shader.uniforms.uAlbR = { value: layers.R.albedo };
    shader.uniforms.uAlbM = { value: layers.M.albedo };
    shader.uniforms.uNrmG = { value: layers.G.normal };
    shader.uniforms.uNrmD = { value: layers.D.normal };
    shader.uniforms.uNrmR = { value: layers.R.normal };
    shader.uniforms.uNrmM = { value: layers.M.normal };
    shader.uniforms.uMask = { value: mask };
    shader.uniforms.uNoise = { value: noiseTex };
    shader.uniforms.uTintA = { value: new THREE.Vector3(...tintA) };
    shader.uniforms.uTintB = { value: new THREE.Vector3(...tintB) };
    shader.uniforms.uTintC = { value: new THREE.Vector3(...tintC) };
    shader.uniforms.uRoadTint = { value: new THREE.Vector3(...roadTint) };
    shader.uniforms.uMarshGloss = { value: S.marshGloss ?? 0 };
    shader.uniforms.uMicroAmp = { value: S.microAmp ?? 1 };
    shader.uniforms.uStrata = { value: S.strata ?? 0 };
    shader.uniforms.uRoadTex = { value: S.pavedRoads ? 1 : clamp(S.roadTexMix ?? 0, 0, 1) };
    shader.uniforms.uTownWear = { value: S.townWear ?? 1 };
    shader.uniforms.uIceDrift = { value: (S.iceLake || S.seaLake) ? (S.iceDrift ?? 0.85) : 0 };
    // maps r1 (ADDITIVE, uSea-gated in the shader — 0 on every pre-existing
    // map): open-water mode. Remaps the wide marsh-mask shore ramp into a
    // bare sand/mud apron + surf line + open-water weight; the "drift" field
    // becomes sand shoals (D layer) instead of snow (G layer).
    shader.uniforms.uSea = { value: S.seaLake ? 1 : 0 };
    shader.uniforms.uSeaFoam = { value: S.seaLake ? (S.seaFoam ?? 0.8) : 0 };
    shader.uniforms.uSeaRamp = { value: new THREE.Vector2(...(S.seaRamp || [0.40, 0.78])) };
    shader.uniforms.uMidRelief = { value: S.midRelief ?? 1 };
    // r2: agrarian field patchwork — only sensible on temperate farmland maps
    shader.uniforms.uFieldPatch = { value: S.fieldPatch ?? 0 };
    // r3: desert macro sheet variation + ice fresnel sky tint
    shader.uniforms.uSandMacro = { value: S.sandMacro ?? 0 };
    shader.uniforms.uIceSky = { value: new THREE.Vector3(...(S.iceSky || [0.66, 0.72, 0.82])) };
    shader.uniforms.uMidFar = { value: S.midReliefFar ?? 480 };
    // r6: landform rock gate — 1 = rock/strata keyed to the mask-B landform
    // weight (desert), 0 = slope-only legacy behavior (B stays marsh/ice)
    shader.uniforms.uRockGate = { value: landformW ? 1 : 0 };
    {
      const rd = S.rippleDir || [0.8, 0.6];
      const rl = Math.hypot(rd[0], rd[1]) || 1;
      shader.uniforms.uRipple = {
        value: new THREE.Vector3(rd[0] / rl, rd[1] / rl, S.rippleAmp ?? 0),
      };
    }
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\n' + SPLAT_COMMON_FRAG);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <map_fragment>',
      'splatCompute();\ndiffuseColor.rgb *= gSplatAlbedo;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <roughnessmap_fragment>',
      'float roughnessFactor = roughness * gSplatRough;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>',
      SPLAT_NORMAL_FRAG);
  };
  engineCtx.setupShadowMaterial(mat, splatHook);
  mat.customProgramCacheKey = () => 'world-terrain-splat-v21';
  mat.userData.sourcedTexturesReady = sourcedTexturesReady;
  return mat;
}

// ---------------------------------------------------------------------------
// Chunked LOD terrain meshes
// ---------------------------------------------------------------------------

const CHUNKS = 8, CHUNK_SIZE = MAP_SIZE / CHUNKS;
const LOD_SEGS = [96, 48, 24];
// r3: 2.5 -> 6.5 — on the 38 m desert mesa walls the far-LOD (5.3 m verts)
// vs near-LOD height mismatch across a chunk border exceeded the old skirt
// and the gap flashed the fog-bright backdrop through as a white sliver in
// the canyon pass (battlefield_desert center). Deeper skirts cover the
// worst cliff-edge mismatch at every LOD pairing.
const SKIRT_DROP = 6.5;

// r7 terrain_environment TERRACING FIX: one FINE height grid per chunk (the
// LOD0 resolution, 1.33 m step) serves position AND normal sampling for all
// three LODs. The old per-LOD grids computed central-difference normals at
// the LOD's own step — 2.7/5.3 m on the mid/far LODs — and on high-curvature
// dune brinks/mesa shoulders the O(step^2 * curvature) normal error alternates
// sign row to row, printing horizontal Mach-band terraces along every contour
// (the desert critique's "heightfield quantization stair-step isolines").
// Normals now come from 1.33 m central differences at every LOD, so coarse
// meshes shade like the true surface; positions are unchanged (same heightAt
// values at the same world coords). Bonus: 9.8k height evaluations per chunk
// instead of 12.1k — boot gets slightly faster.
const FINE_SEGS = 96; // must equal LOD_SEGS[0]; strides 1/2/4 stay integral
function* buildFineGridSteps(hf, cx0, cz0, progress = null) {
  const stepF = CHUNK_SIZE / FINE_SEGS;
  const pn = FINE_SEGS + 3; // +1 vertex row, +2 padding rows
  const hgrid = new Float64Array(pn * pn);
  for (let gz = 0; gz < pn; gz++) {
    for (let gx = 0; gx < pn; gx++) {
      hgrid[gz * pn + gx] = hf.getHeightAt(
        cx0 + (gx - 1) * stepF, cz0 + (gz - 1) * stepF,
      );
    }
    // One near chunk performs almost ten thousand procedural height samples.
    // On a throttled CPU that previously became a 0.4-1.1 s atomic task even
    // though the outer terrain builder yielded between chunks. Expose exact
    // row checkpoints to the async builder; the synchronous/capture path just
    // drains the same generator and receives byte-identical arrays.
    if (progress && (gz & 7) === 7) {
      yield [progress.done + 0.3 * (gz + 1) / pn, progress.total, false];
    }
  }
  return { hgrid, pn, stepF };
}

function buildFineGrid(hf, cx0, cz0) {
  const g = buildFineGridSteps(hf, cx0, cz0);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/**
 * Every chunk at one LOD has identical triangle topology. Keep exactly one
 * immutable index attribute per resolution inside a battlefield instead of
 * allocating/uploading the same array for every chunk. The largest grid is
 * under 10k vertices, so Uint16 is exact and halves the old Uint32 footprint.
 *
 * The pool is intentionally world-local: disposing one cached battlefield
 * can never invalidate a buffer still referenced by another world.
 */
export function acquireTerrainChunkIndex(pool, segs) {
  const cached = pool.get(segs);
  if (cached) {
    cached.references++;
    return cached.attribute;
  }
  const n = segs + 1;
  const perim = 4 * segs;
  const ring = [];
  for (let gx = 0; gx < segs; gx++) ring.push(gx);
  for (let gz = 0; gz < segs; gz++) ring.push(gz * n + (n - 1));
  for (let gx = segs; gx > 0; gx--) ring.push((n - 1) * n + gx);
  for (let gz = segs; gz > 0; gz--) ring.push(gz * n);
  const idx = new Uint16Array(segs * segs * 6 + perim * 6);
  let ii = 0;
  for (let gz = 0; gz < segs; gz++) {
    for (let gx = 0; gx < segs; gx++) {
      const a = gz * n + gx, b = a + 1, c = a + n, d = c + 1;
      idx[ii++] = a; idx[ii++] = c; idx[ii++] = b;
      idx[ii++] = b; idx[ii++] = c; idx[ii++] = d;
    }
  }
  for (let k = 0; k < perim; k++) {
    const t0 = ring[k], t1 = ring[(k + 1) % perim];
    const s0 = n * n + k, s1 = n * n + ((k + 1) % perim);
    idx[ii++] = t0; idx[ii++] = s0; idx[ii++] = t1;
    idx[ii++] = t1; idx[ii++] = s0; idx[ii++] = s1;
  }
  const attribute = new THREE.BufferAttribute(idx, 1);
  pool.set(segs, { attribute, references: 1 });
  return attribute;
}

function terrainIndexPoolReceipt(pool) {
  let references = 0;
  let uniqueBytes = 0;
  let logicalBytes = 0;
  for (const record of pool.values()) {
    const bytes = record.attribute.array.byteLength;
    references += record.references;
    uniqueBytes += bytes;
    logicalBytes += bytes * record.references;
  }
  return {
    attributes: pool.size,
    references,
    uniqueBytes,
    logicalUint16Bytes: logicalBytes,
    avoidedBytes: logicalBytes - uniqueBytes,
    previousUint32Bytes: logicalBytes * 2,
    totalBytesAvoided: logicalBytes * 2 - uniqueBytes,
  };
}

function* buildChunkGeometrySteps(hf, cx0, cz0, segs, fine, progress = null,
  indexPool = null) {
  const n = segs + 1, step = CHUNK_SIZE / segs;
  const stride = FINE_SEGS / segs;
  const hgrid = fine?.hgrid || null;
  const pn = fine?.pn || 0;
  const stepF = fine?.stepF || CHUNK_SIZE / FINE_SEGS;
  const perim = 4 * segs;
  const vcount = n * n + perim;
  const pos = new Float32Array(vcount * 3);
  const nrm = new Float32Array(vcount * 3);
  const inv2e = 1 / (2 * stepF);
  let vi = 0;
  for (let gz = 0; gz < n; gz++) {
    for (let gx = 0; gx < n; gx++) {
      const wx = cx0 + gx * step, wz = cz0 + gz * step;
      const fi = hgrid ? (gz * stride + 1) * pn + (gx * stride + 1) : 0;
      const h = hgrid ? hgrid[fi] : hf.getHeightAt(wx, wz);
      pos[vi * 3] = wx; pos[vi * 3 + 1] = h; pos[vi * 3 + 2] = wz;
      const hl = hgrid ? hgrid[fi - 1] : hf.getHeightAt(wx - stepF, wz);
      const hr = hgrid ? hgrid[fi + 1] : hf.getHeightAt(wx + stepF, wz);
      const hd = hgrid ? hgrid[fi - pn] : hf.getHeightAt(wx, wz - stepF);
      const hu = hgrid ? hgrid[fi + pn] : hf.getHeightAt(wx, wz + stepF);
      const nx = (hl - hr) * inv2e, nz = (hd - hu) * inv2e;
      const il = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      nrm[vi * 3] = nx * il; nrm[vi * 3 + 1] = il; nrm[vi * 3 + 2] = nz * il;
      vi++;
    }
    if (progress && (gz & 7) === 7) {
      yield [progress.done + 0.8, progress.total, false];
    }
  }
  // perimeter vertex indices in ring order (S, E, N, W edges)
  const ring = [];
  for (let gx = 0; gx < segs; gx++) ring.push(gx);                       // z=min, x asc
  for (let gz = 0; gz < segs; gz++) ring.push(gz * n + (n - 1));         // x=max, z asc
  for (let gx = segs; gx > 0; gx--) ring.push((n - 1) * n + gx);         // z=max, x desc
  for (let gz = segs; gz > 0; gz--) ring.push(gz * n);                   // x=min, z desc
  // content_breadth r3: skirt normals point OUTWARD-DOWN instead of copying
  // the (mostly up-facing) top-vertex normal. A skirt revealed through an
  // LOD T-junction crack used to shade like fully sunlit flat ground — on a
  // shadowed dune face that rendered as a blown-white sliver (the desert
  // establishing-shot artifact at the z=250 chunk border). Wall-like normals
  // shade a revealed skirt as a dark seam line instead, and the splat
  // shader's slope response paints it as rock/cliff material.
  const ccx = cx0 + CHUNK_SIZE / 2, ccz = cz0 + CHUNK_SIZE / 2;
  for (let k = 0; k < perim; k++) {
    const src = ring[k], dst = n * n + k;
    pos[dst * 3] = pos[src * 3]; pos[dst * 3 + 1] = pos[src * 3 + 1] - SKIRT_DROP; pos[dst * 3 + 2] = pos[src * 3 + 2];
    let ox = pos[src * 3] - ccx, oz = pos[src * 3 + 2] - ccz;
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol; oz /= ol;
    // outward + strong down bias: crack-revealed skirts read as shaded seams
    const oy = -0.55, oil = 1 / Math.hypot(ox, oy, oz);
    nrm[dst * 3] = ox * oil; nrm[dst * 3 + 1] = oy * oil; nrm[dst * 3 + 2] = oz * oil;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(acquireTerrainChunkIndex(indexPool || new Map(), segs));
  geo.computeBoundingSphere();
  return geo;
}

function buildChunkGeometry(hf, cx0, cz0, segs, fine, indexPool) {
  const g = buildChunkGeometrySteps(hf, cx0, cz0, segs, fine, null, indexPool);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

// ---------------------------------------------------------------------------
// Horizon mountain ring — per-map styled skylines with baked sun shading,
// altitude-banded rock detail texture, snow caps and aerial perspective.
// Lives in ./maps/horizon.js (imported above); do NOT reintroduce the old
// inline low-poly ring here — the map configs (cfg.horizon.style/snowline/
// banding/treeline) target the styled builder.
// ---------------------------------------------------------------------------

/**
 * Build the chunked-LOD terrain mesh group with the splat-blended PBR material.
 * The returned group exposes `group.userData.updateLOD(camPos)` for map.js.
 * @param {object} heightField HeightField from createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {?object} [cfg=null] map config (uses cfg.splat for the palette)
 * @returns {THREE.Group} terrain chunk group
 */
export function buildTerrainMeshes(heightField, engineCtx, cfg = null) {
  const g = terrainBuildSteps(heightField, engineCtx, cfg);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/**
 * perf-r3 (play-session probe): chunked twin of {@link buildTerrainMeshes} —
 * the one-call build was a single ~2.4 s task behind the loading bar (64
 * chunk grids x 3 LODs in one gulp). Awaits `tick(done, total)` after every
 * chunk ROW so the loading screen keeps painting and its bar can creep.
 * Byte-identical output: both wrappers drain the same generator.
 * @param {?function(number, number): (Promise<void>|void)} tick
 */
export async function buildTerrainMeshesAsync(heightField, engineCtx, cfg = null, tick = null,
  fineSlices = false, streamOpts = null) {
  const g = terrainBuildSteps(heightField, engineCtx, cfg, streamOpts);
  let r = g.next();
  while (!r.done) {
    if (tick && (fineSlices || r.value[2])) await tick(r.value[0], r.value[1]);
    r = g.next();
  }
  return r.value;
}

function* terrainBuildSteps(heightField, engineCtx, cfg, streamOpts = null) {
  const group = new THREE.Group();
  group.name = 'terrain';
  group.add(buildHorizonRing(engineCtx, cfg, 1337));
  yield [0, CHUNKS * CHUNKS + 2, true]; // horizon ring built — splat bake gets its own slice
  const mat = createSplatMaterial(engineCtx, heightField._layout, cfg ? cfg.splat : null,
    (cfg && cfg.id) || 'verdant', heightField._mesaW || null);
  const chunks = [];
  const terrainIndexPool = new Map();
  // Alternative LOD geometries are retained in `chunks` even when another
  // level is mounted on the mesh. Register the complete live set so world
  // eviction releases uploaded dormant buffers as well as the visible tree.
  const retainedLodGeometries = new Set();
  registerRetainedObject3DResources(group, { geometries: retainedLodGeometries });
  const streamFarLods = streamOpts?.streamFarLods === true;
  const focus = streamOpts?.focus || heightField._layout?.spawns?.player || { x: 0, z: 0 };
  let initialGeometryCount = 0;
  let initialFineGridCount = 0;
  yield [1, CHUNKS * CHUNKS + 2, true]; // splat canvas bake done
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const cx0 = -HALF + cx * CHUNK_SIZE, cz0 = -HALF + cz * CHUNK_SIZE;
      const ccx = cx0 + CHUNK_SIZE / 2, ccz = cz0 + CHUNK_SIZE / 2;
      const openingDistance = Math.hypot(focus.x - ccx, focus.z - ccz);
      const initialLevels = streamFarLods
        ? initialTerrainLods(openingDistance) : [0, 1, 2];
      // A far-only chunk computes the same height and fine-step normals just
      // at its 25×25 visible vertices; avoid paying for a dormant 99×99 grid.
      // Near/mid levels still share one fine grid, preserving their exact
      // cross-LOD shading and avoiding duplicate samples.
      const needsFineGrid = !streamFarLods || initialLevels.some((level) => level < 2);
      const progress = {
        done: 2 + cz * CHUNKS + cx,
        total: CHUNKS * CHUNKS + 2,
      };
      const fine = needsFineGrid
        ? yield* buildFineGridSteps(heightField, cx0, cz0, progress) : null;
      if (fine) initialFineGridCount++;
      const lods = [null, null, null];
      for (const level of initialLevels) {
        lods[level] = yield* buildChunkGeometrySteps(
          heightField, cx0, cz0, LOD_SEGS[level], fine, progress, terrainIndexPool,
        );
        retainedLodGeometries.add(lods[level]);
        initialGeometryCount++;
      }
      const openingLevel = streamFarLods ? initialLevels[0] : 2;
      const mesh = new THREE.Mesh(lods[openingLevel], mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      chunks.push({
        mesh, lods,
        fine: streamFarLods && initialLevels.length < LOD_SEGS.length ? fine : null,
        level: openingLevel, cx: ccx, cz: ccz, cx0, cz0,
      });
      yield [2 + cz * CHUNKS + cx + 1, CHUNKS * CHUNKS + 2, cx === CHUNKS - 1];
    }
  }
  const streamStats = {
    enabled: streamFarLods,
    totalGeometryCount: CHUNKS * CHUNKS * LOD_SEGS.length,
    initialGeometryCount,
    initialFineGridCount,
    streamedGeometryCount: 0,
  };
  let streamFrame = 0;
  const buildStreamJob = (job) => {
    const c = chunks[job.index];
    if (!c.fine && job.level < 2) {
      c.fine = buildFineGrid(heightField, c.cx0, c.cz0);
    }
    c.lods[job.level] = buildChunkGeometry(
      heightField, c.cx0, c.cz0, LOD_SEGS[job.level], c.fine, terrainIndexPool,
    );
    retainedLodGeometries.add(c.lods[job.level]);
    if (c.lods.every(Boolean)) c.fine = null;
    streamStats.streamedGeometryCount++;
    streamStats.indexPool = terrainIndexPoolReceipt(terrainIndexPool);
    const d = Math.hypot(streamCameraX - c.cx, streamCameraZ - c.cz);
    const want = terrainLodForDistance(d, c.level);
    if (want === job.level) {
      c.level = want;
      c.mesh.geometry = c.lods[want];
    }
  };
  let streamCameraX = 0;
  let streamCameraZ = 0;
  const warmStreamJobs = (camPos, maxJobs) => {
    if (!streamFarLods || !camPos) return 0;
    streamCameraX = camPos.x;
    streamCameraZ = camPos.z;
    return warmTerrainLodBuilds(
      chunks, streamCameraX, streamCameraZ, maxJobs, buildStreamJob,
    );
  };
  group.userData.updateLOD = (camPos) => {
    for (const c of chunks) {
      const d = Math.hypot(camPos.x - c.cx, camPos.z - c.cz);
      const want = terrainLodForDistance(d, c.level);
      if (want !== c.level && c.lods[want]) {
        c.level = want;
        c.mesh.geometry = c.lods[want];
      }
    }
    // One geometry every four rendered updates spreads the remaining visual
    // detail over following seconds instead of replacing the old load stall
    // with a burst on the first playable frame.
    if (!streamFarLods || (++streamFrame & 3) !== 0) return;
    warmStreamJobs(camPos, 1);
  };
  // Countdown warm seam: the ordinary update path deliberately builds at
  // most one geometry every four live frames. Deployment can instead call
  // this with a one-job budget between painted countdown frames, completing
  // the same exact meshes before controls unlock without a quality change.
  group.userData.warmStreaming = warmStreamJobs;
  group.userData.streamingStats = streamStats;
  streamStats.indexPool = terrainIndexPoolReceipt(terrainIndexPool);
  group.userData.sourcedTexturesReady = mat.userData.sourcedTexturesReady;
  return group;
}
