// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// The renderer probe page: the same scene (scene.mjs) drawn by three.js WebGLRenderer (what the game ships), three.js
// WebGPURenderer and wgpu on WebGPU (Rust compiled to WebAssembly, ../src/lib.rs), each on its own 1280 × 720 canvas.
// Rounds alternate the renderers (A B C C B A); each block draws `frames` frames back to back, then waits for its GPU
// to finish (a 1-pixel readback for WebGL, onSubmittedWorkDone for WebGPU), so a block's time is its GPU throughput;
// the time spent in the draw calls alone is its CPU cost. Results land in #out and window.__probe.
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import init, { create_probe } from '../pkg/cot_wgpu_probe.js';
import { buildScene, CAMERA, LIGHT } from './scene.mjs';

const params = new URLSearchParams(location.search);
const W = 1280, H = 720;
const tanks = Number(params.get('tanks') ?? 18), detail = Number(params.get('detail') ?? 40);
const frames = Number(params.get('frames') ?? 60), rounds = Number(params.get('rounds') ?? 5);
const out = document.getElementById('out');
const lines = [navigator.userAgent];
const show = (line) => { lines.push(line); out.textContent = lines.join('\n'); };

function canvas() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H; c.style.width = '320px'; c.style.height = '180px';
  document.body.append(c);
  return c;
}

function threeScene(scene) {
  const root = new THREE.Scene();
  root.background = new THREE.Color(0.62, 0.72, 0.82);
  const geometry = (g) => {
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
    b.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
    b.setIndex(new THREE.BufferAttribute(g.indices, 1));
    return b;
  };
  const ground = new THREE.Mesh(geometry(scene.terrain), new THREE.MeshLambertMaterial({ color: new THREE.Color(0.42, 0.5, 0.32) }));
  ground.castShadow = ground.receiveShadow = true;
  root.add(ground);
  const tankGeometry = geometry(scene.tank);
  const meshes = [];
  for (let i = 0; i < scene.poses.length / 4; i++) {
    const m = new THREE.Mesh(tankGeometry, new THREE.MeshLambertMaterial({ color: new THREE.Color(...scene.colors.subarray(i * 3, i * 3 + 3)) }));
    m.position.set(scene.poses[i * 4], scene.poses[i * 4 + 1], scene.poses[i * 4 + 2]);
    m.castShadow = m.receiveShadow = true;
    meshes.push(m);
    root.add(m);
  }
  root.add(new THREE.AmbientLight(0xffffff, 0.3));
  const light = new THREE.DirectionalLight(0xffffff, 0.7);
  const d = new THREE.Vector3(...LIGHT.dir).normalize();
  light.position.copy(d).multiplyScalar(-LIGHT.distance);
  light.castShadow = true;
  Object.assign(light.shadow.camera, { left: -LIGHT.half, right: LIGHT.half, top: LIGHT.half, bottom: -LIGHT.half, near: LIGHT.near, far: LIGHT.far });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.mapSize.set(LIGHT.mapSize, LIGHT.mapSize);
  root.add(light, light.target);
  const camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, W / H, CAMERA.near, CAMERA.far);
  camera.position.set(...CAMERA.eye);
  camera.lookAt(...CAMERA.target);
  const pose = (t) => meshes.forEach((m, i) => { m.rotation.y = scene.poses[i * 4 + 3] + t * 0.4; });
  return { root, camera, pose };
}

async function makeWebGL(scene) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvas(), antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const s = threeScene(scene), gl = renderer.getContext(), pixel = new Uint8Array(4);
  return {
    name: 'three.js WebGLRenderer',
    frame: (t) => { s.pose(t); renderer.render(s.root, s.camera); },
    settle: async () => { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); },
  };
}

async function makeThreeWebGPU(scene) {
  const renderer = new WebGPURenderer({ canvas: canvas(), antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error('three.js WebGPURenderer fell back to WebGL');
  const s = threeScene(scene);
  return {
    name: 'three.js WebGPURenderer',
    frame: (t) => { s.pose(t); renderer.render(s.root, s.camera); },
    settle: () => renderer.backend.device.queue.onSubmittedWorkDone(),
  };
}

async function makeWgpu(scene) {
  const probe = await create_probe(canvas(), scene.terrain.positions, scene.terrain.normals, scene.terrain.indices,
    scene.tank.positions, scene.tank.normals, scene.tank.indices, scene.poses, scene.colors);
  return { name: 'wgpu (Rust, WebAssembly)', frame: (t) => probe.frame(t), settle: () => probe.settle() };
}

const median = (list) => [...list].sort((a, b) => a - b)[list.length >> 1];
try {
  await init({ module_or_path: new URL('cot_wgpu_probe_bg.wasm', import.meta.url) });
  const scene = buildScene({ tanks, detail });
  show(`scene: ${tanks} tanks (detail ${detail}, ${(scene.tank.indices.length / 3).toLocaleString()} triangles each), ${tanks + 1} draws and ${scene.triangles.toLocaleString()} triangles a pass, 2048² shadow map, ${W} × ${H}; ${rounds} rounds of ${frames} frames`);
  const renderers = [];
  for (const make of [makeWebGL, makeThreeWebGPU, makeWgpu]) {
    try { renderers.push(await make(scene)); } catch (error) { show(`${make.name}: unavailable (${error.message})`); }
  }
  let t = 0;
  for (const r of renderers) { for (let i = 0; i < 30; i++) r.frame(t += 1 / 60); await r.settle(); }
  const stats = new Map(renderers.map((r) => [r, { cpu: [], total: [] }]));
  for (let round = 0; round < rounds; round++) {
    for (const r of [...renderers, ...[...renderers].reverse()]) {
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) r.frame(t += 1 / 60);
      const t1 = performance.now();
      await r.settle();
      const t2 = performance.now();
      stats.get(r).cpu.push((t1 - t0) / frames);
      stats.get(r).total.push((t2 - t0) / frames);
    }
  }
  const results = renderers.map((r) => ({ renderer: r.name, frameMs: +median(stats.get(r).total).toFixed(3), cpuMs: +median(stats.get(r).cpu).toFixed(3) }));
  for (const r of results) show(`${r.renderer}: ${r.frameMs} ms a frame (GPU-bound throughput), ${r.cpuMs} ms of it in the draw calls (CPU)`);
  window.__probe = { results, tanks, detail, triangles: scene.triangles };
  show('DONE');
} catch (error) {
  show(`ERROR ${error.stack ?? error}`);
}
