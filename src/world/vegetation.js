// src/world/vegetation.js — instanced grass + trees with GPU wind.
// Contract: docs/ARCHITECTURE.md §3.2; visuals per docs/research/graphics-aaa.md §8.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { _LAYOUT, sampleSplatNoise } from './terrain.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const HALF = 512;
const CHUNKS = 8, CHUNK_SIZE = 128;
const GRASS_PER_CHUNK = 5200;
const GRASS_FULL_DIST = 64, GRASS_FADE_END = 112;
const TREE_NEAR_IN = 260, TREE_NEAR_OUT = 290; // hysteresis band (full-detail radius)

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function smoothstepJs(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function _mustReplace(src, anchor, replacement) {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/vegetation: shader anchor missing: ${anchor}`);
  return out;
}

// Cards use up-facing normals for ground-consistent lighting; undo the
// DOUBLE_SIDED faceDirection flip so backfaces don't light from below.
function forceUpNormal(shader) {
  shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <normal_fragment_begin>',
    '#include <normal_fragment_begin>\nnormal = normalize( vNormal );\nnonPerturbedNormal = normal;');
}

// ---------------------------------------------------------------------------
// Canvas textures (grass blade card, tree billboard sprites)
// ---------------------------------------------------------------------------

// Two tuft variants: 0 = lush meadow tuft, 1 = drier mixed tuft. Colors are kept
// desaturated/olive so tufts multiply per-instance tint into the terrain hue
// instead of popping neon against it.
function makeGrassCardTexture(rng, variant) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const grad = ctx.createLinearGradient(0, s, 0, 0);
  grad.addColorStop(0, '#2c3d15');
  grad.addColorStop(0.55, '#48601f');
  grad.addColorStop(1, '#6f7f39');
  const dryGrad = ctx.createLinearGradient(0, s, 0, 0);
  dryGrad.addColorStop(0, '#54492a');
  dryGrad.addColorStop(1, '#948853');
  const dryChance = variant === 0 ? 0.16 : 0.42;
  const nBlades = variant === 0 ? 24 : 19;
  for (let b = 0; b < nBlades; b++) {
    const dry = rng() < dryChance;
    ctx.fillStyle = dry ? dryGrad : grad;
    const bx = 14 + rng() * (s - 28);
    const bw = 7 + rng() * 9;
    const tipX = bx + (rng() - 0.5) * (variant === 0 ? 80 : 120);
    const tipY = 6 + rng() * 76;
    const cpX = bx + (tipX - bx) * (0.25 + rng() * 0.3);
    const cpY = s - (s - tipY) * (0.45 + rng() * 0.2);
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2, s);
    ctx.quadraticCurveTo(cpX - bw * 0.3, cpY, tipX, tipY);
    ctx.quadraticCurveTo(cpX + bw * 0.3, cpY, bx + bw / 2, s);
    ctx.closePath();
    ctx.fill();
  }
  // flood transparent texels with a mid grass tone so mip averaging doesn't
  // darken distant blades toward black (non-premultiplied-alpha bleed)
  const id = ctx.getImageData(0, 0, s, s);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 24) { d[i] = 66; d[i + 1] = 82; d[i + 2] = 38; }
  }
  ctx.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------
// Tree geometry (composed BufferGeometry, vertex colors + aFlex wind weight)
// ---------------------------------------------------------------------------

const _c = new THREE.Color();

function paintAttributes(geo, color, flexFn, rng = null, speckle = 0) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const flex = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const j = rng ? 1 + (rng() - 0.5) * 2 * speckle : 1;
    col[i * 3] = color.r * j; col[i * 3 + 1] = color.g * j; col[i * 3 + 2] = color.b * j;
    flex[i] = flexFn ? flexFn(pos.getX(i), pos.getY(i), pos.getZ(i)) : 0;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aFlex', new THREE.BufferAttribute(flex, 1));
  return geo;
}

function jitterRadial(geo, rng, amount) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 1e-4) {
      const f = 1 + (rng() - 0.5) * 2 * amount;
      pos.setX(i, x * f); pos.setZ(i, z * f);
      pos.setY(i, pos.getY(i) + (rng() - 0.5) * amount * 0.8);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function buildPineGeometry(rng) {
  const parts = [];
  const trunkH = 2.4;
  const trunk = new THREE.CylinderGeometry(0.15, 0.30, trunkH, 7, 1);
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.075, 0.32, 0.16 + rng() * 0.05, THREE.SRGBColorSpace);
  parts.push(paintAttributes(trunk, _c.clone(), () => 0));
  const levels = [
    { y: 1.25, r: 1.55, h: 1.7 }, { y: 2.25, r: 1.25, h: 1.55 },
    { y: 3.2, r: 0.95, h: 1.4 }, { y: 4.1, r: 0.58, h: 1.3 },
  ];
  const topY = 5.4;
  for (const lv of levels) {
    const cone = new THREE.ConeGeometry(lv.r * (0.92 + rng() * 0.16), lv.h, 11, 2);
    jitterRadial(cone, rng, 0.20);
    cone.translate(0, lv.y + lv.h / 2, 0);
    _c.setHSL(0.345 + rng() * 0.02, 0.36 + rng() * 0.08, 0.16 + rng() * 0.05, THREE.SRGBColorSpace);
    parts.push(paintAttributes(cone, _c.clone(), (x, y) => Math.pow(clamp(y / topY, 0, 1), 1.6), rng, 0.16));
  }
  // mergeGeometries requires uniform indexing (icosahedron blobs are non-indexed)
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

function buildOakGeometry(rng) {
  const parts = [];
  const trunkH = 2.7;
  const trunk = new THREE.CylinderGeometry(0.21, 0.38, trunkH, 7, 2);
  const tp = trunk.attributes.position; // slight lean
  for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + tp.getY(i) * 0.06);
  trunk.computeVertexNormals();
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.07, 0.28, 0.185 + rng() * 0.05, THREE.SRGBColorSpace);
  parts.push(paintAttributes(trunk, _c.clone(), () => 0));
  const crownY = 3.5, crownTop = 5.2;
  for (let b = 0; b < 6; b++) {
    const blob = new THREE.IcosahedronGeometry(1.0 + rng() * 0.55, 1);
    jitterRadial(blob, rng, 0.22);
    const a = (b / 6) * Math.PI * 2 + rng();
    blob.scale(1.15, 0.85, 1.15);
    blob.translate(Math.cos(a) * (0.55 + rng() * 0.7), crownY + (rng() - 0.35) * 1.2, Math.sin(a) * (0.55 + rng() * 0.7));
    _c.setHSL(0.30 + rng() * 0.035, 0.36 + rng() * 0.08, 0.19 + rng() * 0.06, THREE.SRGBColorSpace);
    parts.push(paintAttributes(blob, _c.clone(), (x, y) => Math.pow(clamp(y / crownTop, 0, 1), 1.4), rng, 0.18));
  }
  // mergeGeometries requires uniform indexing (icosahedron blobs are non-indexed)
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// Low-poly LOD trees: real opaque geometry (no alpha cards, no sorting artifacts,
// correct silhouettes from every angle) — cheap enough to instance across the map.
function buildPineLowGeometry(rng) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.30, 2.0, 5, 1);
  trunk.translate(0, 1.0, 0);
  _c.setHSL(0.075, 0.30, 0.15, THREE.SRGBColorSpace);
  parts.push(paintAttributes(trunk, _c.clone(), () => 0));
  const cone = new THREE.ConeGeometry(1.45, 4.6, 7, 2);
  jitterRadial(cone, rng, 0.15);
  cone.translate(0, 1.1 + 2.3, 0);
  _c.setHSL(0.34, 0.35, 0.155, THREE.SRGBColorSpace);
  parts.push(paintAttributes(cone, _c.clone(), (x, y) => Math.pow(clamp(y / 5.6, 0, 1), 1.6), rng, 0.14));
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

function buildOakLowGeometry(rng) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.20, 0.36, 2.4, 5, 1);
  trunk.translate(0, 1.2, 0);
  _c.setHSL(0.07, 0.26, 0.17, THREE.SRGBColorSpace);
  parts.push(paintAttributes(trunk, _c.clone(), () => 0));
  for (let b = 0; b < 2; b++) {
    const blob = new THREE.IcosahedronGeometry(1.55 + rng() * 0.4, 1);
    jitterRadial(blob, rng, 0.24);
    blob.scale(1.2, 0.85, 1.2);
    blob.translate((rng() - 0.5) * 1.1, 3.3 + (rng() - 0.4) * 0.9, (rng() - 0.5) * 1.1);
    _c.setHSL(0.295 + rng() * 0.03, 0.36, 0.175, THREE.SRGBColorSpace);
    parts.push(paintAttributes(blob, _c.clone(), (x, y) => Math.pow(clamp(y / 5.0, 0, 1), 1.4), rng, 0.16));
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// Dark, squat canopy blob used for hedgerow/field bushes.
function buildBushGeometry(rng) {
  const parts = [];
  for (let b = 0; b < 3; b++) {
    const blob = new THREE.IcosahedronGeometry(0.55 + rng() * 0.35, 1);
    jitterRadial(blob, rng, 0.30);
    blob.scale(1.35, 0.72, 1.35);
    blob.translate((rng() - 0.5) * 0.9, 0.42 + rng() * 0.22, (rng() - 0.5) * 0.9);
    _c.setHSL(0.29 + rng() * 0.04, 0.33, 0.135 + rng() * 0.045, THREE.SRGBColorSpace);
    parts.push(paintAttributes(blob, _c.clone(), () => 0.25, rng, 0.20));
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// ---------------------------------------------------------------------------
// createVegetation
// ---------------------------------------------------------------------------

/**
 * Create instanced grass and trees with GPU wind.
 * @param {object} heightField HeightField from terrain.createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {number} [seed=2001] vegetation seed
 * @returns {{group:THREE.Group, update:function(number,THREE.Vector3):void,
 *   setWindTime:function(number):void, treeObstacles:Array<{min:number[],max:number[]}>}}
 */
export function createVegetation(heightField, engineCtx, seed = 2001) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'vegetation';
  const v = _LAYOUT.village;

  const uWindTime = { value: 0 };
  const uCamPos = { value: new THREE.Vector3(0, 0, 0) };

  // ---- grass ----
  // Two tuft variants (texture + proportions), noise-clustered placement, and a
  // per-instance tint sampled from the same splat noise the terrain shader uses
  // so tufts inherit the ground hue instead of floating on top of it.
  const grassWindHook = (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uGrassFar = { value: GRASS_FADE_END };
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nuniform vec3 uCamPos;\nuniform float uGrassFar;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 giw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float gfade = 1.0 - smoothstep(uGrassFar - 14.0, uGrassFar, distance(giw.xyz, uCamPos));
        transformed *= gfade;
        float sway = uv.y * uv.y;
        float phase = giw.x * 0.35 + giw.z * 0.28;
        transformed.x += sway * (0.12 * sin(uWindTime * 1.6 + phase) + 0.05 * sin(uWindTime * 3.7 + phase * 2.3));
        transformed.z += sway * 0.08 * cos(uWindTime * 1.3 + phase);
      }`);
    forceUpNormal(shader);
  };
  const grassVariants = [];
  for (let gv = 0; gv < 2; gv++) {
    const tex = makeGrassCardTexture(mulberry32(seed + 41 + gv), gv);
    const w = gv === 0 ? 0.85 : 1.10, h = gv === 0 ? 0.62 : 0.50;
    const gp1 = new THREE.PlaneGeometry(w, h, 1, 3);
    gp1.translate(0, h / 2, 0);
    const gp2 = gp1.clone();
    gp2.rotateY(Math.PI / 2);
    const geo = mergeGeometries([gp1, gp2], false);
    const nrm = geo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.34, side: THREE.DoubleSide,
      roughness: 0.94, metalness: 0.0,
    });
    engineCtx.setupShadowMaterial(mat, grassWindHook); // receives CSM shadows
    mat.customProgramCacheKey = () => 'world-grass-wind-v2';
    grassVariants.push({ geo, mat });
  }

  const grassChunks = [];
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _pv = new THREE.Vector3();
  const _sv = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) {
    const crng = mulberry32((seed ^ (cx * 73856093) ^ (cz * 19349663)) >>> 0);
    const x0 = -HALF + cx * CHUNK_SIZE, z0 = -HALF + cz * CHUNK_SIZE;
    const mats = [[], []];
    const cols = [[], []];
    for (let i = 0; i < GRASS_PER_CHUNK; i++) {
      const x = x0 + crng() * CHUNK_SIZE, z = z0 + crng() * CHUNK_SIZE;
      const roll = crng(), yaw = crng() * Math.PI * 2;
      const sxz = 0.72 + crng() * 0.65;
      let sy = 0.55 + crng() * 0.90;
      const hueJ = crng(), lumJ = crng(), varJ = crng(), clJ = crng();
      if (Math.max(Math.abs(x), Math.abs(z)) > 474) continue;
      const gt = heightField.getGroundType(x, z);
      if (gt === 'hard' || heightField._roadDist(x, z) < 4.6) continue;
      let dry = 0;
      if (gt === 'soft') { if (roll > 0.3) continue; sy *= 1.5; dry = 0.5; } // sparse marsh reeds
      if (heightField._villageMask(x, z) > 0.35 && roll > 0.15) continue;
      if (heightField.getNormalAt(x, z).y < 0.80) continue;
      // cluster + splat-aware thinning: bald on dirt patches, dense in meadows
      const sn = sampleSplatNoise(x, z);
      const dirtPatch = smoothstepJs(0.60, 0.80, sn.n2 + (sn.n1 - 0.5) * 0.22);
      if (dirtPatch > 0.35 && clJ < dirtPatch * 0.9) { dry = Math.max(dry, 0.55); }
      if (dirtPatch > 0.6 && roll < 0.75) continue;
      const clump = sn.n1; // mid-frequency clumping
      if (clump < 0.42 && clJ > 0.25 + clump) continue;
      const vv = varJ < (0.75 - dry * 0.5) ? 0 : 1;
      const y = heightField.getHeightAt(x, z);
      _q.setFromAxisAngle(_up, yaw);
      _m4.compose(_pv.set(x, y - 0.02, z), _q, _sv.set(sxz, sy, sxz));
      mats[vv].push(_m4.clone());
      // tint multiplies the (already olive) card: keep it near-unity, hue-shifted
      // toward the terrain palette, drier/browner on dirt patches
      _c.setHSL(
        0.225 + (hueJ - 0.5) * 0.04 - dry * 0.085,
        0.42 - dry * 0.16,
        0.52 + (lumJ - 0.5) * 0.18 + dry * 0.06,
      );
      cols[vv].push(_c.clone());
    }
    const chunkMeshes = [];
    for (let vv = 0; vv < 2; vv++) {
      if (mats[vv].length === 0) continue;
      const mesh = new THREE.InstancedMesh(grassVariants[vv].geo, grassVariants[vv].mat, mats[vv].length);
      for (let i = 0; i < mats[vv].length; i++) {
        mesh.setMatrixAt(i, mats[vv][i]);
        mesh.setColorAt(i, cols[vv][i]);
      }
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // visibility handled per-chunk in update()
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      chunkMeshes.push({ mesh, total: mats[vv].length });
    }
    if (chunkMeshes.length > 0) {
      grassChunks.push({ meshes: chunkMeshes, cx: x0 + CHUNK_SIZE / 2, cz: z0 + CHUNK_SIZE / 2 });
    }
  }

  // ---- trees ----
  const treeWindHook = (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nattribute float aFlex;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 tiw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = tiw.x * 0.043 + tiw.z * 0.051;
        float amp = aFlex * 0.14;
        transformed.x += amp * (sin(uWindTime * 1.15 + ph) + 0.45 * sin(uWindTime * 2.63 + ph * 1.7));
        transformed.z += amp * 0.7 * cos(uWindTime * 0.97 + ph * 1.3);
      }`);
  };
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0 });
  engineCtx.setupShadowMaterial(treeMat, treeWindHook);
  treeMat.customProgramCacheKey = () => 'world-tree-wind-v2';

  const geoVariants = {
    pine: [buildPineGeometry(mulberry32(seed + 21)), buildPineGeometry(mulberry32(seed + 22))],
    oak: [buildOakGeometry(mulberry32(seed + 23)), buildOakGeometry(mulberry32(seed + 24))],
  };
  const lowGeo = {
    pine: buildPineLowGeometry(mulberry32(seed + 25)),
    oak: buildOakLowGeometry(mulberry32(seed + 26)),
  };

  // placement: clusters + lone trees + horizon rim forest
  const clusters = [];
  const trees = []; // { x,z,species,variant, mat: Matrix4, tint: Color, near: bool }
  const treeObstacles = [];
  function siteOk(x, z, margin) {
    if (Math.max(Math.abs(x), Math.abs(z)) > 455) return false;
    if (x > v.x0 - 24 && x < v.x1 + 24 && z > v.z0 - 24 && z < v.z1 + 24) return false;
    if (heightField._roadDist(x, z) < 9 + margin) return false;
    if (heightField.getGroundType(x, z) === 'soft') return false;
    for (const s of [_LAYOUT.spawns.player, ..._LAYOUT.spawns.enemies]) {
      if (Math.hypot(x - s.x, z - s.z) < 26) return false;
    }
    return heightField.getNormalAt(x, z).y > 0.82;
  }
  function pushTree(x, z, species, scMin, scMax, withObstacle) {
    const y = heightField.getHeightAt(x, z);
    const sc = scMin + rng() * (scMax - scMin);
    _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
    _m4.compose(_pv.set(x, y - 0.06, z), _q, _sv.set(sc, sc * (0.9 + rng() * 0.2), sc));
    _c.setRGB(0.72 + rng() * 0.40, 0.78 + rng() * 0.36, 0.70 + rng() * 0.32); // per-tree tint
    trees.push({ x, z, species, variant: (rng() * 2) | 0, mat: _m4.clone(), tint: _c.clone(), near: false });
    if (withObstacle) {
      treeObstacles.push({ min: [x - 0.55, y, z - 0.55], max: [x + 0.55, y + 3.2 * sc, z + 0.55] });
    }
  }
  function addTree(x, z, species) {
    if (!siteOk(x, z, 0)) return false;
    pushTree(x, z, species, 1.15, 1.9, true);
    return true;
  }
  let attempts = 0;
  while (clusters.length < 22 && attempts++ < 700) {
    const x = (rng() * 2 - 1) * 430, z = (rng() * 2 - 1) * 430;
    if (!siteOk(x, z, 6)) continue;
    let far = true;
    for (const c of clusters) if (Math.hypot(x - c.x, z - c.z) < c.r + 42) { far = false; break; }
    if (!far) continue;
    const r = 18 + rng() * 26;
    const species = rng() < 0.55 ? 'pine' : 'oak';
    const n = 10 + (rng() * 18) | 0;
    let placed = 0;
    for (let i = 0; i < n * 3 && placed < n; i++) {
      const a = rng() * Math.PI * 2, rr = r * Math.sqrt(rng());
      const sp = rng() < 0.8 ? species : (species === 'pine' ? 'oak' : 'pine');
      if (addTree(x + Math.cos(a) * rr, z + Math.sin(a) * rr, sp)) placed++;
    }
    if (placed > 2) clusters.push({ x, z, r });
  }
  for (let i = 0, placed = 0; i < 380 && placed < 55; i++) { // lone trees
    const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
    if (addTree(x, z, rng() < 0.5 ? 'pine' : 'oak')) placed++;
  }
  // horizon rim forest: clusters on the raised map border so distant ridgelines
  // carry tree silhouettes instead of reading as bare green blobs
  for (let c = 0; c < 26; c++) {
    const a = (c / 26) * Math.PI * 2 + rng() * 0.22;
    const rad = 448 + rng() * 46;
    const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
    if (Math.max(Math.abs(cx), Math.abs(cz)) > 502) continue;
    const species = rng() < 0.7 ? 'pine' : 'oak';
    const n = 6 + (rng() * 9) | 0;
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * 44, z = cz + (rng() - 0.5) * 44;
      if (Math.max(Math.abs(x), Math.abs(z)) > 506) continue;
      pushTree(x, z, rng() < 0.85 ? species : 'oak', 1.5, 2.5, false);
    }
  }

  // near/far instanced meshes (partition rewritten on camera movement, hysteresis)
  // far LOD = low-poly opaque geometry: correct silhouettes, no alpha-card artifacts
  const nearMeshes = {};
  for (const sp of ['pine', 'oak']) {
    nearMeshes[sp] = geoVariants[sp].map((g) => {
      const m = new THREE.InstancedMesh(g, treeMat, trees.length);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      m.matrixAutoUpdate = false;
      group.add(m);
      return m;
    });
  }
  const farMeshes = {
    pine: new THREE.InstancedMesh(lowGeo.pine, treeMat, trees.length),
    oak: new THREE.InstancedMesh(lowGeo.oak, treeMat, trees.length),
  };
  for (const sp of ['pine', 'oak']) {
    farMeshes[sp].castShadow = true;
    farMeshes[sp].receiveShadow = true;
    farMeshes[sp].frustumCulled = false;
    farMeshes[sp].count = 0;
    farMeshes[sp].matrixAutoUpdate = false;
    group.add(farMeshes[sp]);
  }

  // ---- bushes (hedgerow / field-edge cover, purely visual) ----
  {
    const bushGeos = [buildBushGeometry(mulberry32(seed + 31)), buildBushGeometry(mulberry32(seed + 32))];
    const bushPlacements = [[], []];
    function addBush(x, z) {
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) return;
      if (heightField._roadDist(x, z) < 6) return;
      if (heightField.getGroundType(x, z) === 'soft') return;
      if (heightField.getNormalAt(x, z).y < 0.78) return;
      const y = heightField.getHeightAt(x, z);
      const sc = 0.8 + rng() * 1.3;
      _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
      _m4.compose(_pv.set(x, y - 0.05, z), _q, _sv.set(sc, sc * (0.8 + rng() * 0.3), sc));
      bushPlacements[(rng() * 2) | 0].push(_m4.clone());
    }
    for (const c of clusters) { // fringe bushes around each tree cluster
      const n = 4 + (rng() * 6) | 0;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, rr = c.r * (1.05 + rng() * 0.5);
        addBush(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr);
      }
    }
    for (let i = 0; i < 130; i++) { // scattered field bushes, roadside bias
      const x = (rng() * 2 - 1) * 455, z = (rng() * 2 - 1) * 455;
      const rd = heightField._roadDist(x, z);
      if (rd > 26 && rng() > 0.30) continue; // favor road fringes
      addBush(x, z);
    }
    for (let bv = 0; bv < 2; bv++) {
      if (bushPlacements[bv].length === 0) continue;
      const m = new THREE.InstancedMesh(bushGeos[bv], treeMat, bushPlacements[bv].length);
      for (let i = 0; i < bushPlacements[bv].length; i++) {
        m.setMatrixAt(i, bushPlacements[bv][i]);
        _c.setRGB(0.75 + rng() * 0.35, 0.80 + rng() * 0.30, 0.75 + rng() * 0.25);
        m.setColorAt(i, _c);
      }
      m.castShadow = true;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.computeBoundingSphere();
      group.add(m);
    }
  }

  const _lastCam = new THREE.Vector3(1e9, 0, 0);
  function repartitionTrees(camPos) {
    for (const t of trees) {
      const d = Math.hypot(t.x - camPos.x, t.z - camPos.z);
      if (t.near) { if (d > TREE_NEAR_OUT) t.near = false; }
      else if (d < TREE_NEAR_IN) t.near = true;
    }
    const counts = { pine: [0, 0], oak: [0, 0] };
    const farCounts = { pine: 0, oak: 0 };
    for (const t of trees) {
      if (t.near) {
        const m = nearMeshes[t.species][t.variant];
        const i = counts[t.species][t.variant]++;
        m.setMatrixAt(i, t.mat);
        m.setColorAt(i, t.tint);
      } else {
        const m = farMeshes[t.species];
        const i = farCounts[t.species]++;
        m.setMatrixAt(i, t.mat);
        m.setColorAt(i, t.tint);
      }
    }
    for (const sp of ['pine', 'oak']) {
      for (let vi = 0; vi < 2; vi++) {
        const m = nearMeshes[sp][vi];
        m.count = counts[sp][vi];
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.visible = m.count > 0;
      }
      farMeshes[sp].count = farCounts[sp];
      farMeshes[sp].instanceMatrix.needsUpdate = true;
      if (farMeshes[sp].instanceColor) farMeshes[sp].instanceColor.needsUpdate = true;
      farMeshes[sp].visible = farCounts[sp] > 0;
    }
  }

  function update(dt, camPos) {
    uWindTime.value += dt;
    uCamPos.value.copy(camPos);
    for (const gc of grassChunks) {
      const d = Math.max(0, Math.hypot(camPos.x - gc.cx, camPos.z - gc.cz) - CHUNK_SIZE * 0.71);
      let frac = 0;
      if (d < GRASS_FULL_DIST) frac = 1;
      else if (d < GRASS_FADE_END) frac = 0.45;
      for (const cm of gc.meshes) {
        const count = Math.floor(cm.total * frac);
        cm.mesh.visible = count > 0;
        if (count > 0) cm.mesh.count = count;
      }
    }
    if (_lastCam.distanceToSquared(camPos) > 9) {
      _lastCam.copy(camPos);
      repartitionTrees(camPos);
    }
  }

  function setWindTime(t) { uWindTime.value = t; }

  return { group, update, setWindTime, treeObstacles, _clusters: clusters };
}
