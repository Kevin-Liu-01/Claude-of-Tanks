// src/world/vegetation.js — instanced grass + trees with GPU wind.
// Contract: docs/ARCHITECTURE.md §3.2; visuals per docs/research/graphics-aaa.md §8.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { _LAYOUT } from './terrain.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const HALF = 512;
const CHUNKS = 8, CHUNK_SIZE = 128;
const GRASS_PER_CHUNK = 2400;
const GRASS_FULL_DIST = 46, GRASS_FADE_END = 84;
const TREE_NEAR_IN = 112, TREE_NEAR_OUT = 128; // hysteresis band

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

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

function makeGrassCardTexture(rng) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const grad = ctx.createLinearGradient(0, s, 0, 0);
  grad.addColorStop(0, '#3a5a1d');
  grad.addColorStop(0.55, '#5d8229');
  grad.addColorStop(1, '#93b34e');
  const dryGrad = ctx.createLinearGradient(0, s, 0, 0);
  dryGrad.addColorStop(0, '#6d6330');
  dryGrad.addColorStop(1, '#bfae63');
  for (let b = 0; b < 18; b++) {
    const dry = rng() < 0.22;
    ctx.fillStyle = dry ? dryGrad : grad;
    const bx = 18 + rng() * (s - 36);
    const bw = 10 + rng() * 11;
    const tipX = bx + (rng() - 0.5) * 90;
    const tipY = 6 + rng() * 60;
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
    if (d[i + 3] < 24) { d[i] = 96; d[i + 1] = 126; d[i + 2] = 58; }
  }
  ctx.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeTreeSprite(rng, species) {
  const w = 128, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#4b3a28';
  ctx.fillRect(w / 2 - 5, h * 0.62, 10, h * 0.38);
  if (species === 'pine') {
    for (let layer = 0; layer < 5; layer++) {
      const ly = h * 0.06 + layer * h * 0.155;
      const lw = w * (0.16 + layer * 0.14);
      ctx.fillStyle = `rgb(${(20 + layer * 3) | 0},${(42 + layer * 5) | 0},${(18 + layer * 3) | 0})`;
      ctx.beginPath();
      ctx.moveTo(w / 2, ly - h * 0.05);
      for (let k = 0; k <= 10; k++) {
        const fx = w / 2 - lw / 2 + (lw * k) / 10;
        const fy = ly + h * 0.14 + (rng() - 0.5) * h * 0.05 - Math.abs(k - 5) * h * 0.004;
        ctx.lineTo(fx, fy);
      }
      ctx.closePath();
      ctx.fill();
    }
  } else {
    for (let blob = 0; blob < 7; blob++) {
      const bx = w / 2 + (rng() - 0.5) * w * 0.62;
      const by = h * 0.30 + (rng() - 0.5) * h * 0.30;
      const br = w * (0.20 + rng() * 0.14);
      const shade = 34 + rng() * 26;
      ctx.fillStyle = `rgb(${(shade * 0.72) | 0},${shade + 34 | 0},${(shade * 0.62) | 0})`;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  { // flood transparent texels with foliage tone (see makeGrassCardTexture)
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 24) { d[i] = 30; d[i + 1] = 52; d[i + 2] = 26; }
    }
    ctx.putImageData(id, 0, 0);
  }
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

function buildCardGeometry(w, h) {
  const p1 = new THREE.PlaneGeometry(w, h);
  p1.translate(0, h / 2, 0);
  const p2 = p1.clone();
  p2.rotateY(Math.PI / 2);
  const geo = mergeGeometries([p1, p2], false);
  const nrm = geo.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0); // ground-consistent lighting
  return geo;
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
  const grassTex = makeGrassCardTexture(rng);
  const gp1 = new THREE.PlaneGeometry(0.85, 0.62, 1, 3);
  gp1.translate(0, 0.31, 0);
  const gp2 = gp1.clone();
  gp2.rotateY(Math.PI / 2);
  const grassGeo = mergeGeometries([gp1, gp2], false);
  {
    const nrm = grassGeo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  }
  const grassMat = new THREE.MeshStandardMaterial({
    map: grassTex, alphaTest: 0.34, side: THREE.DoubleSide,
    roughness: 0.92, metalness: 0.0,
  });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uGrassFar = { value: GRASS_FADE_END };
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nuniform vec3 uCamPos;\nuniform float uGrassFar;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 giw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float gfade = 1.0 - smoothstep(uGrassFar - 10.0, uGrassFar, distance(giw.xyz, uCamPos));
        transformed *= gfade;
        float sway = uv.y * uv.y;
        float phase = giw.x * 0.35 + giw.z * 0.28;
        transformed.x += sway * (0.12 * sin(uWindTime * 1.6 + phase) + 0.05 * sin(uWindTime * 3.7 + phase * 2.3));
        transformed.z += sway * 0.08 * cos(uWindTime * 1.3 + phase);
      }`);
    forceUpNormal(shader);
  };
  grassMat.customProgramCacheKey = () => 'world-grass-wind-v1';

  const grassChunks = [];
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _pv = new THREE.Vector3();
  const _sv = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) {
    const crng = mulberry32((seed ^ (cx * 73856093) ^ (cz * 19349663)) >>> 0);
    const x0 = -HALF + cx * CHUNK_SIZE, z0 = -HALF + cz * CHUNK_SIZE;
    const mats = [];
    const cols = [];
    for (let i = 0; i < GRASS_PER_CHUNK; i++) {
      const x = x0 + crng() * CHUNK_SIZE, z = z0 + crng() * CHUNK_SIZE;
      const roll = crng(), yaw = crng() * Math.PI * 2;
      const sxz = 0.75 + crng() * 0.55;
      let sy = 0.60 + crng() * 0.85;
      const hueJ = crng(), lumJ = crng();
      if (Math.max(Math.abs(x), Math.abs(z)) > 474) continue;
      const gt = heightField.getGroundType(x, z);
      if (gt === 'hard' || heightField._roadDist(x, z) < 5.2) continue;
      let dry = 0;
      if (gt === 'soft') { if (roll > 0.3) continue; sy *= 1.5; dry = 0.5; } // sparse marsh reeds
      if (heightField._villageMask(x, z) > 0.35 && roll > 0.15) continue;
      if (heightField.getNormalAt(x, z).y < 0.80) continue;
      const y = heightField.getHeightAt(x, z);
      _q.setFromAxisAngle(_up, yaw);
      _m4.compose(_pv.set(x, y - 0.02, z), _q, _sv.set(sxz, sy, sxz));
      mats.push(_m4.clone());
      _c.setHSL(0.235 + (hueJ - 0.5) * 0.05 - dry * 0.06, 0.30 - dry * 0.08, 0.58 + (lumJ - 0.5) * 0.22);
      cols.push(_c.clone());
    }
    if (mats.length === 0) continue;
    const mesh = new THREE.InstancedMesh(grassGeo, grassMat, mats.length);
    for (let i = 0; i < mats.length; i++) {
      mesh.setMatrixAt(i, mats[i]);
      mesh.setColorAt(i, cols[i]);
    }
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // visibility handled per-chunk in update()
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    grassChunks.push({ mesh, total: mats.length, cx: x0 + CHUNK_SIZE / 2, cz: z0 + CHUNK_SIZE / 2 });
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
  treeMat.customProgramCacheKey = () => 'world-tree-wind-v1';

  const pineSprite = makeTreeSprite(mulberry32(seed + 11), 'pine');
  const oakSprite = makeTreeSprite(mulberry32(seed + 12), 'oak');
  const pineFarMat = new THREE.MeshStandardMaterial({ map: pineSprite, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 });
  const oakFarMat = new THREE.MeshStandardMaterial({ map: oakSprite, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 });
  pineFarMat.onBeforeCompile = forceUpNormal;
  pineFarMat.customProgramCacheKey = () => 'world-treecard-v1';
  oakFarMat.onBeforeCompile = forceUpNormal;
  oakFarMat.customProgramCacheKey = () => 'world-treecard-v1';

  const geoVariants = {
    pine: [buildPineGeometry(mulberry32(seed + 21)), buildPineGeometry(mulberry32(seed + 22))],
    oak: [buildOakGeometry(mulberry32(seed + 23)), buildOakGeometry(mulberry32(seed + 24))],
  };
  const cardGeo = { pine: buildCardGeometry(3.5, 5.6), oak: buildCardGeometry(4.6, 5.4) };

  // placement: clusters + lone trees
  const clusters = [];
  const trees = []; // { x,z,y,species,variant, mat: Matrix4, near: bool }
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
  function addTree(x, z, species) {
    if (!siteOk(x, z, 0)) return false;
    const y = heightField.getHeightAt(x, z);
    const sc = 1.15 + rng() * 0.75;
    _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
    _m4.compose(_pv.set(x, y - 0.06, z), _q, _sv.set(sc, sc * (0.9 + rng() * 0.2), sc));
    trees.push({ x, z, species, variant: (rng() * 2) | 0, mat: _m4.clone(), near: false });
    treeObstacles.push({ min: [x - 0.55, y, z - 0.55], max: [x + 0.55, y + 3.2 * sc, z + 0.55] });
    return true;
  }
  let attempts = 0;
  while (clusters.length < 14 && attempts++ < 400) {
    const x = (rng() * 2 - 1) * 430, z = (rng() * 2 - 1) * 430;
    if (!siteOk(x, z, 6)) continue;
    let far = true;
    for (const c of clusters) if (Math.hypot(x - c.x, z - c.z) < c.r + 55) { far = false; break; }
    if (!far) continue;
    const r = 18 + rng() * 24;
    const species = rng() < 0.55 ? 'pine' : 'oak';
    const n = 7 + (rng() * 15) | 0;
    let placed = 0;
    for (let i = 0; i < n * 3 && placed < n; i++) {
      const a = rng() * Math.PI * 2, rr = r * Math.sqrt(rng());
      const sp = rng() < 0.8 ? species : (species === 'pine' ? 'oak' : 'pine');
      if (addTree(x + Math.cos(a) * rr, z + Math.sin(a) * rr, sp)) placed++;
    }
    if (placed > 2) clusters.push({ x, z, r });
  }
  for (let i = 0, placed = 0; i < 220 && placed < 30; i++) { // lone trees
    const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
    if (addTree(x, z, rng() < 0.5 ? 'pine' : 'oak')) placed++;
  }

  // near/far instanced meshes (partition rewritten on camera movement, hysteresis)
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
    pine: new THREE.InstancedMesh(cardGeo.pine, pineFarMat, trees.length),
    oak: new THREE.InstancedMesh(cardGeo.oak, oakFarMat, trees.length),
  };
  for (const sp of ['pine', 'oak']) {
    farMeshes[sp].castShadow = false;
    farMeshes[sp].receiveShadow = false;
    farMeshes[sp].frustumCulled = false;
    farMeshes[sp].count = 0;
    farMeshes[sp].matrixAutoUpdate = false;
    group.add(farMeshes[sp]);
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
        m.setMatrixAt(counts[t.species][t.variant]++, t.mat);
      } else {
        farMeshes[t.species].setMatrixAt(farCounts[t.species]++, t.mat);
      }
    }
    for (const sp of ['pine', 'oak']) {
      for (let vi = 0; vi < 2; vi++) {
        const m = nearMeshes[sp][vi];
        m.count = counts[sp][vi];
        m.instanceMatrix.needsUpdate = true;
        m.visible = m.count > 0;
      }
      farMeshes[sp].count = farCounts[sp];
      farMeshes[sp].instanceMatrix.needsUpdate = true;
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
      else if (d < GRASS_FADE_END) frac = 0.4;
      const count = Math.floor(gc.total * frac);
      gc.mesh.visible = count > 0;
      if (count > 0) gc.mesh.count = count;
    }
    if (_lastCam.distanceToSquared(camPos) > 9) {
      _lastCam.copy(camPos);
      repartitionTrees(camPos);
    }
  }

  function setWindTime(t) { uWindTime.value = t; }

  return { group, update, setWindTime, treeObstacles, _clusters: clusters };
}
