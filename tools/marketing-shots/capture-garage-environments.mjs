#!/usr/bin/env node
// Capture the three Garage environment pictures of the public field manual
// (site/docs.html "Interface" figures and docs/GARAGE-ENVIRONMENTS.md): free-camera
// views of the current Verdant Motor Pool with no interface, rendered at 2x and
// encoded to 1280x577 WebP beside a manifest.json.
//
//   verdant-workshop-floor  the selected hero (M1A3 Abrams) on the turntable, the workshop behind it
//   abrams-service-bay      the M1A2 welding/running-gear exhibit beside the FLAMMABLE canister station
//   burlak-service-bay      the T-90A Burlak on jack stands, turret lifted under the gantry
//
// Usage (from the repository root):
//   nice -n 10 node tools/marketing-shots/capture-garage-environments.mjs [--out=<dir>] [--raw=<dir>]
//     [--views=verdant-workshop-floor,...] [--hero=m1a3] [--quality=ultra]
//     [--lock-timeout-min=60] [--vite-cache=<dir>]
//
// --out defaults to public/media/garage-environments-r2 (the published names); pass a scratch
// directory for a dry run. --raw holds the 2560x1154 PNG masters (default shots/garage-environments/raw,
// or <out>/raw when --out is given). --vite-cache points Vite's dependency cache somewhere other than
// node_modules/.vite (useful when node_modules is shared with another checkout).
//
// Order of work: the process lowers itself to nice 10, takes the shared FIFO capture lock
// (tools/capture-lock.mjs) and only then starts an in-process Vite server and headless Chromium
// (--use-gl=angle). One page boots the Garage on the requested destination, stages the hero, builds the
// complete workshop, hides every DOM element except the renderer canvas, pins the frame in shot mode and
// places a free camera per view through the rig's external pose (the same port the Garage showroom and
// the __SHOTS recipes use). The browser, server and lock are released before the CPU-only WebP encoding
// (cwebp -q 86 -m 6 -sharp_yuv, 2:1 resize) and the manifest. The Garage owns no depth of field, so the
// pictures are deep focus; the owner ruled on 2026-10-11 that the Garages hold no people.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { getPriority, setPriority } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureLock } from '../capture-lock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const TOOL = 'tools/marketing-shots/capture-garage-environments.mjs';
const PUBLIC_DIR = join(ROOT, 'public/media/garage-environments-r2');

// Published size and the 2x master it is reduced from.
const OUTPUT = Object.freeze({ width: 1280, height: 577 });
const DEVICE_SCALE = 2;
const WEBP_ARGS = Object.freeze(['-m', '6', '-q', '86', '-sharp_yuv']);
const CWEBP = process.env.CWEBP || 'cwebp';
const NICE = 10;

// The Verdant Motor Pool is the enclosed 46 m hall (src/ui/garageStage.ts: walls at +/-23 m, roof at 10 m).
// A camera is kept inside it, in Garage-local metres (origin = turntable centre).
const VERDANT_HALL = Object.freeze({ halfM: 22.2, minY: 0.6, maxY: 8.8 });

/**
 * The three published views. `azimuthDeg` is measured from the subject's bow toward its LEFT flank (+) or its
 * RIGHT flank (-) (vehicle forward is local +Z, so its left flank faces local +X); 40 degrees toward the left
 * flank is the canonical Garage side (src/game/garagePresentationPose.ts), with the bow toward screen-left.
 * `heightM` and `lookHeightM` are above the Garage floor. The camera distance is solved so the subject's
 * oriented box spans `fill` of the frame width, then the camera slides sideways until the box centre sits at
 * `screenX` (NDC). Subjects are looked up in the live scene graph, so a moved bay keeps its framing.
 */
export const GARAGE_ENVIRONMENT_VIEWS = Object.freeze([
  Object.freeze({
    name: 'verdant-workshop-floor',
    title: 'Verdant Motor Pool: the hero on the illuminated service platform',
    variant: 'verdant_motor_pool',
    subject: Object.freeze({ kind: 'hero' }),
    camera: Object.freeze({ azimuthDeg: 40, heightM: 3.0, lookHeightM: 1.55, fovDeg: 40, fill: 0.40, screenX: 0.04 }),
    bounds: VERDANT_HALL,
  }),
  Object.freeze({
    name: 'abrams-service-bay',
    title: 'Abrams service bay: running-gear work beside the FLAMMABLE canister station',
    variant: 'verdant_motor_pool',
    subject: Object.freeze({ kind: 'exhibit', object: 'dressing_tank_b', specId: 'm1a2' }),
    camera: Object.freeze({ azimuthDeg: -38, heightM: 2.8, lookHeightM: 1.5, fovDeg: 40, fill: 0.46, screenX: -0.06 }),
    bounds: VERDANT_HALL,
  }),
  Object.freeze({
    name: 'burlak-service-bay',
    title: 'Burlak service bay: hull on jack stands, turret lifted under the gantry',
    variant: 'verdant_motor_pool',
    subject: Object.freeze({ kind: 'exhibit', object: 'dressing_tank_a', specId: 't90a_burlak' }),
    camera: Object.freeze({ azimuthDeg: 30, heightM: 3.2, lookHeightM: 1.8, fovDeg: 40, fill: 0.46, screenX: 0.05 }),
    bounds: VERDANT_HALL,
  }),
]);

// ------------------------------------------------------------------------------------------------ options

const argv = process.argv.slice(2);
function option(name, fallback = '') {
  const prefix = `--${name}=`;
  const direct = argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
}
const outArg = option('out');
const outDir = resolve(outArg || PUBLIC_DIR);
const rawDir = resolve(option('raw') || (outArg ? join(outDir, 'raw') : join(ROOT, 'shots/garage-environments/raw')));
const viteCacheDir = option('vite-cache') ? resolve(option('vite-cache')) : '';
const heroId = option('hero', 'm1a3');
const quality = option('quality', 'ultra');
const lockTimeoutMs = Math.max(1, Number(option('lock-timeout-min', '60')) || 60) * 60 * 1000;
const viewFilter = option('views').split(',').map((name) => name.trim()).filter(Boolean);
const views = viewFilter.length
  ? GARAGE_ENVIRONMENT_VIEWS.filter((view) => viewFilter.includes(view.name))
  : [...GARAGE_ENVIRONMENT_VIEWS];
if (viewFilter.length && views.length !== viewFilter.length) {
  throw new Error(`unknown --views entry; known: ${GARAGE_ENVIRONMENT_VIEWS.map((view) => view.name).join(', ')}`);
}
if (!['low', 'medium', 'high', 'ultra'].includes(quality)) throw new Error(`--quality must be a desktop preset, not ${quality}`);

const log = (message) => console.log(`[garage-env] ${message}`);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const round = (value, digits = 3) => Number(Number(value).toFixed(digits));

// ------------------------------------------------------------------------------------------------ helpers

/** PNG IHDR size. */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** WebP canvas size from the RIFF container (VP8, VP8L or VP8X). */
function webpSize(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) throw new Error('bad VP8 start code');
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  throw new Error(`unknown WebP chunk ${chunk}`);
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** The checkout's HEAD commit, read from .git without running git (fail-soft). */
function sourceCommit() {
  try {
    const gitDir = join(ROOT, '.git');
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head;
    const ref = head.slice(5);
    if (existsSync(join(gitDir, ref))) return readFileSync(join(gitDir, ref), 'utf8').trim();
    const packed = readFileSync(join(gitDir, 'packed-refs'), 'utf8').split('\n').find((line) => line.endsWith(` ${ref}`));
    return packed ? packed.split(' ')[0] : null;
  } catch {
    return null;
  }
}

function cwebpVersion() {
  const result = spawnSync(CWEBP, ['-version'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.split('\n')[0].trim() : null;
}

// ------------------------------------------------------------------------------------------------ page side
// Each function below runs inside the page (serialized by Puppeteer): no closure over this module.

function pageGarageState() {
  const workshop = window.__GARAGE_WORKSHOP;
  const D = window.__DEBUG;
  if (window.__GAME_READY !== true || !workshop || !D) return null;
  const stats = workshop.stats();
  return {
    selected: stats.selected,
    architectureReady: stats.architecture?.ready === true,
    presented: stats.architecture?.presented === true,
    built: stats.built === true,
    exhibitCount: stats.exhibitCount,
    sharedMaintenanceBayCount: stats.sharedMaintenanceBayCount,
    sceneMode: stats.sceneMode,
    roofMode: stats.roofMode,
    heroSpecId: D.pedestalVisual?.specId ?? null,
    heroOnStage: D.pedestalOnStage === true,
    selectedSpecId: D.selectedSpecId,
    battleScreenCurrentImage: stats.battleScreenCurrentImage,
  };
}

/** Enter the still-capture state: shot-mode frames (no showroom, no idle pacing), no interface. */
function pageEnterCapture() {
  const D = window.__DEBUG;
  D.showroom.stop();
  D.shotMode = true;
  D.garage.hide();
  D.post.resetPerfTrims?.();
  D.post.pinDynScale?.(1);
  const canvas = D.renderer.domElement;
  canvas.setAttribute('data-cot-capture-canvas', '');
  if (!document.getElementById('cot-capture-clean')) {
    const style = document.createElement('style');
    style.id = 'cot-capture-clean';
    style.textContent = 'body *:not([data-cot-capture-canvas]) { visibility: hidden !important; }\n'
      + '[data-cot-capture-canvas] { visibility: visible !important; }';
    document.head.appendChild(style);
  }
  return true;
}

/** Visible DOM over the viewport other than the renderer canvas (must be empty), plus the render state. */
function pageCaptureAudit() {
  const D = window.__DEBUG;
  const canvas = D.renderer.domElement;
  const leaks = [];
  for (const element of document.body.querySelectorAll('*')) {
    if (element === canvas) continue;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width * rect.height < 1 || rect.right <= 0 || rect.bottom <= 0
        || rect.left >= innerWidth || rect.top >= innerHeight) continue;
    element.style.setProperty('visibility', 'hidden', 'important');
    leaks.push(`${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`);
  }
  const rect = canvas.getBoundingClientRect();
  // Whole-word name census (so "screw" or "configure" never match): the Garages hold no people.
  const personWords = new Set(['crew', 'crewman', 'figure', 'figures', 'mannequin', 'person', 'people', 'worker',
    'workers', 'mechanic', 'mechanics', 'soldier', 'human']);
  const people = [];
  D.scene.traverse((object) => {
    if (people.length >= 12 || !object.name) return;
    const words = object.name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z]+/);
    if (!words.some((word) => personWords.has(word))) return;
    for (let node = object; node; node = node.parent) if (!node.visible) return;
    people.push(object.name);
  });
  return {
    hiddenLeaks: leaks.slice(0, 20),
    leakCount: leaks.length,
    canvas: [canvas.width, canvas.height],
    canvasRect: [rect.left, rect.top, rect.width, rect.height].map((value) => Math.round(value)),
    viewport: [innerWidth, innerHeight, devicePixelRatio],
    renderScale: Number(canvas.dataset.renderScale),
    dynScale: Number(canvas.dataset.dynScale),
    shotMode: D.shotMode,
    phase: D.game?.phase ?? null,
    people,
  };
}

/** Wait until the renderer has drawn `count` more frames (or `timeoutMs` passed). */
async function pageWaitFrames({ count, timeoutMs }) {
  const info = window.__DEBUG.renderer.info.render;
  const start = info.frame;
  const started = performance.now();
  while (info.frame - start < count && performance.now() - started < timeoutMs) {
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
  }
  return { frames: info.frame - start, ms: Math.round(performance.now() - started) };
}

/**
 * Frame one view: find its subject, measure its oriented box, solve the camera and pin it through the
 * rig's external pose. Returns the subject/camera record (world and Garage-local) and an occlusion probe.
 */
async function pageFrameView({ view, width, height }) {
  const D = window.__DEBUG;
  const V = D.camera.position.constructor;
  const Q = D.camera.quaternion.constructor;
  const garage = D.scene.getObjectByName('garage_dressing');
  if (!garage) throw new Error('garage_dressing is not in the scene');
  const origin = garage.getWorldPosition(new V());
  const visibleChain = (object) => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return true;
  };

  let root = null;
  let specId = null;
  let dims = null;
  if (view.subject.kind === 'hero') {
    const visual = D.pedestalVisual;
    root = visual?.root ?? null;
    specId = visual?.specId ?? null;
    dims = visual?.spec?.dims ?? null;
  } else {
    const found = [];
    garage.traverse((object) => { if (object.name === view.subject.object) found.push(object); });
    root = found.find(visibleChain) ?? null;
    specId = root?.userData?.sourceVehicleId || view.subject.specId;
  }
  if (!root || !visibleChain(root)) throw new Error(`${view.name}: subject ${view.subject.object || 'hero'} is not visible`);
  if (!dims) {
    try {
      const specs = await import('/src/vehicles/specs.ts');
      dims = specs.getSpec(specId)?.dims ?? null;
    } catch { /* box from meshes only */ }
  }

  root.updateWorldMatrix(true, true);
  const position = new V().setFromMatrixPosition(root.matrixWorld);
  const forward = new V(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new Q()));
  forward.y = 0;
  forward.normalize();
  const up = new V(0, 1, 0);
  const left = new V().crossVectors(up, forward).normalize();

  // Oriented box (left, up, forward) of the subject's own visible surfaces.
  const min = new V(Infinity, Infinity, Infinity);
  const max = new V(-Infinity, -Infinity, -Infinity);
  const corner = new V();
  let meshes = 0;
  root.traverse((object) => {
    if (!(object.isMesh || object.isInstancedMesh || object.isBatchedMesh) || !visibleChain(object)) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (!material || material.visible === false || material.colorWrite === false
        || (material.transparent && material.opacity < 0.5)) return;
    if (/shadow|contact|proxy|decal|collider|hitbox|helper/i.test(object.name || '')) return;
    let box = null;
    if (object.isInstancedMesh || object.isBatchedMesh) {
      if (!object.boundingBox) object.computeBoundingBox?.();
      box = object.boundingBox;
    } else if (object.geometry) {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      box = object.geometry.boundingBox;
    }
    if (!box || box.isEmpty()) return;
    for (let index = 0; index < 8; index++) {
      corner.set(index & 1 ? box.max.x : box.min.x, index & 2 ? box.max.y : box.min.y,
        index & 4 ? box.max.z : box.min.z).applyMatrix4(object.matrixWorld).sub(position);
      const lx = corner.dot(left);
      const ly = corner.y;
      const lz = corner.dot(forward);
      min.set(Math.min(min.x, lx), Math.min(min.y, ly), Math.min(min.z, lz));
      max.set(Math.max(max.x, lx), Math.max(max.y, ly), Math.max(max.z, lz));
    }
    meshes += 1;
  });
  let boxSource = 'meshes';
  const length = max.z - min.z;
  const breadth = max.x - min.x;
  const tall = max.y - min.y;
  if (dims) {
    const overall = dims.overallLengthM || dims.hullLengthM || 7;
    const plausible = meshes > 0
      && length > overall * 0.6 && length < overall * 1.6
      && breadth > dims.widthM * 0.5 && breadth < dims.widthM * 2.2
      && tall > dims.heightM * 0.5 && tall < dims.heightM * 2.5;
    if (!plausible) {
      // Exhibit meshes can be merged into a workshop display owner: fall back to the spec envelope with the
      // gun overhang ahead of a hull centred on the visual root.
      const hull = dims.hullLengthM || overall;
      min.set(-dims.widthM / 2, 0, -hull / 2);
      max.set(dims.widthM / 2, dims.heightM, -hull / 2 + overall);
      boxSource = 'spec';
    }
  } else if (meshes === 0) {
    throw new Error(`${view.name}: no measurable subject surfaces`);
  }

  const toWorld = (lx, ly, lz) => position.clone().addScaledVector(left, lx).addScaledVector(forward, lz)
    .add(new V(0, ly, 0));
  const corners = [];
  for (let index = 0; index < 8; index++) {
    corners.push(toWorld(index & 1 ? max.x : min.x, index & 2 ? max.y : min.y, index & 4 ? max.z : min.z));
  }
  const center = toWorld((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  const radius = corners.reduce((best, point) => Math.max(best, point.distanceTo(center)), 0);

  // Solve the camera.
  const settings = view.camera;
  const aspect = width / height;
  const tanH = Math.tan((settings.fovDeg * Math.PI) / 360) * aspect;
  const azimuth = (settings.azimuthDeg * Math.PI) / 180;
  const direction = forward.clone().multiplyScalar(Math.cos(azimuth)).addScaledVector(left, Math.sin(azimuth)).normalize();
  // A fresh camera of the live camera's class (clone() would deep-copy the live camera's userData).
  const probe = new D.camera.constructor(settings.fovDeg, aspect, 0.05, 1000);
  probe.updateProjectionMatrix();
  const projected = new V();
  const place = (distance, shift) => {
    const camera = center.clone().addScaledVector(direction, distance);
    camera.y = origin.y + settings.heightM;
    const target = new V(center.x, origin.y + settings.lookHeightM, center.z);
    const right = target.clone().sub(camera).setY(0).normalize().cross(up).normalize();
    camera.addScaledVector(right, shift);
    target.addScaledVector(right, shift);
    return { camera, target };
  };
  const bounds = (pose) => {
    probe.position.copy(pose.camera);
    probe.up.set(0, 1, 0);
    probe.lookAt(pose.target);
    probe.updateMatrixWorld(true);
    const result = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const point of corners) {
      projected.copy(point).project(probe);
      result.x0 = Math.min(result.x0, projected.x);
      result.x1 = Math.max(result.x1, projected.x);
      result.y0 = Math.min(result.y0, projected.y);
      result.y1 = Math.max(result.y1, projected.y);
    }
    return result;
  };
  let low = radius + 1;
  let high = 48;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    const box = bounds(place(middle, 0));
    if ((box.x1 - box.x0) / 2 > settings.fill) low = middle;
    else high = middle;
  }
  const distance = (low + high) / 2;
  let shift = 0;
  for (let step = 0; step < 8; step++) {
    const pose = place(distance, shift);
    const box = bounds(pose);
    shift += (((box.x0 + box.x1) / 2) - settings.screenX) * pose.camera.distanceTo(center) * tanH;
  }
  const pose = place(distance, shift);

  // Keep the camera inside the destination's bounds (Garage-local metres).
  const limits = view.bounds;
  const local = pose.camera.clone().sub(origin);
  const clampedLocal = local.clone();
  clampedLocal.x = Math.max(-limits.halfM, Math.min(limits.halfM, clampedLocal.x));
  clampedLocal.z = Math.max(-limits.halfM, Math.min(limits.halfM, clampedLocal.z));
  clampedLocal.y = Math.max(limits.minY, Math.min(limits.maxY, clampedLocal.y));
  const clamped = clampedLocal.distanceTo(local) > 1e-6;
  if (clamped) {
    pose.target.add(clampedLocal.clone().sub(local));
    pose.camera.copy(clampedLocal).add(origin);
  }
  const achieved = bounds(pose);

  D.rig.setExternalPose(pose.camera, pose.target, settings.fovDeg);
  D.camera.updateProjectionMatrix();
  D.camera.updateMatrixWorld(true);
  D.lighting.updateFrustums?.();
  D.lighting.update?.(true);

  // Occlusion probe: rays from the camera to points across the subject box. A first hit closer than the point
  // that lies outside the (slightly grown) box is an occluder.
  const occlusion = { rays: 0, occluded: 0, occluders: {}, error: null };
  try {
    // The app's own three instance: the optimized-dependency URL a transformed source module imports.
    const transformed = await (await fetch('/src/engine/cameraRig.ts')).text();
    const threeUrl = transformed.match(/from\s+["']([^"']*\/deps\/three\.js[^"']*)["']/)?.[1]
      ?? performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => /\/deps\/three\.js(\?|$)/.test(name));
    if (!threeUrl) throw new Error('three module URL not found');
    const THREE = await import(threeUrl);
    const raycaster = new THREE.Raycaster();
    raycaster.camera = D.camera;
    raycaster.params.Line.threshold = 0.001;
    raycaster.params.Points.threshold = 0.001;
    const grow = 0.3;
    const inside = (point) => {
      const relative = point.clone().sub(position);
      const lx = relative.dot(left);
      const lz = relative.dot(forward);
      return lx > min.x - grow && lx < max.x + grow && relative.y > min.y - grow && relative.y < max.y + grow
        && lz > min.z - grow && lz < max.z + grow;
    };
    // The box centre, its corners pulled 30 % inward, and its bow, stern, flank and roof face centres
    // (normalised box coordinates: x left flank = 1, y roof = 1, z bow = 1).
    const samples = [center];
    for (const point of corners) samples.push(center.clone().lerp(point, 0.7));
    for (const [u, v, w] of [[0.5, 0.5, 1], [0.5, 0.5, 0], [1, 0.5, 0.5], [0, 0.5, 0.5], [0.5, 0.9, 0.5]]) {
      samples.push(toWorld(min.x + (max.x - min.x) * u, min.y + (max.y - min.y) * v, min.z + (max.z - min.z) * w));
    }
    const started = performance.now();
    for (const sample of samples) {
      if (performance.now() - started > 8000) break;
      const toSample = sample.clone().sub(pose.camera);
      const reach = toSample.length();
      raycaster.set(pose.camera, toSample.normalize());
      raycaster.far = reach + 0.01;
      let hits = [];
      try { hits = raycaster.intersectObject(D.scene, true); } catch { continue; }
      occlusion.rays += 1;
      const first = hits.find((hit) => {
        const material = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material;
        return (hit.object.isMesh || hit.object.isInstancedMesh || hit.object.isBatchedMesh)
          && visibleChain(hit.object) && material && material.visible !== false && material.colorWrite !== false
          && !(material.transparent && material.opacity < 0.5);
      });
      if (!first || first.distance >= reach - 0.05 || inside(first.point)) continue;
      occlusion.occluded += 1;
      let owner = first.object;
      while (owner && !owner.name && owner.parent) owner = owner.parent;
      const label = owner?.name || first.object.type;
      occlusion.occluders[label] = (occlusion.occluders[label] || 0) + 1;
    }
  } catch (error) {
    occlusion.error = String(error?.message || error);
  }

  const yawDeg = (Math.atan2(forward.x, forward.z) * 180) / Math.PI;
  const vector = (value) => [value.x, value.y, value.z].map((entry) => Number(entry.toFixed(3)));
  return {
    subject: {
      kind: view.subject.kind,
      object: view.subject.object || null,
      specId,
      position: vector(position),
      garageLocal: vector(position.clone().sub(origin)),
      yawDeg: Number(yawDeg.toFixed(2)),
      box: { source: boxSource, meshes, min: vector(min), max: vector(max) },
    },
    camera: {
      position: vector(pose.camera),
      target: vector(pose.target),
      garageLocal: { position: vector(pose.camera.clone().sub(origin)), target: vector(pose.target.clone().sub(origin)) },
      fovDeg: settings.fovDeg,
      azimuthDeg: settings.azimuthDeg,
      distanceM: Number(distance.toFixed(3)),
      lateralShiftM: Number(shift.toFixed(3)),
      clamped,
      subjectNdc: {
        x: [achieved.x0, achieved.x1].map((entry) => Number(entry.toFixed(3))),
        y: [achieved.y0, achieved.y1].map((entry) => Number(entry.toFixed(3))),
      },
    },
    garageOrigin: vector(origin),
    occlusion,
  };
}

/** The live camera still holds the pose a view pinned (nothing re-solved it before the screenshot). */
function pageCameraHolds({ position, target }) {
  const D = window.__DEBUG;
  const V = D.camera.position.constructor;
  const direction = new V(...target).sub(new V(...position)).normalize();
  const live = D.camera.getWorldDirection(new V());
  return D.camera.position.distanceTo(new V(...position)) < 1e-3 && live.dot(direction) > 0.99999;
}

// ------------------------------------------------------------------------------------------------ capture

async function captureMasters() {
  const { createServer } = await import('vite');
  const { default: puppeteer } = await import('puppeteer');
  const lock = createCaptureLock();
  let browser = null;
  let server = null;
  let refresher = null;
  let released = false;
  const releaseAll = async () => {
    if (released) return;
    released = true;
    if (refresher) clearInterval(refresher);
    try { if (browser) await browser.close(); } catch { /* already closed */ }
    try { if (server) await server.close(); } catch { /* already closed */ }
    lock.release();
  };
  const onSignal = (signal) => {
    log(`${signal}: releasing the browser, server and capture lock`);
    releaseAll().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('exit', () => lock.release());

  log(`waiting for the shared capture lock (up to ${Math.round(lockTimeoutMs / 60000)} min)`);
  const waitStarted = Date.now();
  await lock.acquire(lockTimeoutMs);
  const lockWaitS = Math.round((Date.now() - waitStarted) / 1000);
  log(`capture lock held after ${lockWaitS} s`);
  refresher = setInterval(() => lock.refresh(), 60 * 1000);
  refresher.unref();

  const holdStarted = Date.now();
  const consoleErrors = [];
  const pageErrors = [];
  let capturing = false;
  const records = [];
  let bootState = null;
  try {
    // vite.config.ts resolves its warm-up list from process.cwd().
    process.chdir(ROOT);
    const nodeModules = realpathSync(join(ROOT, 'node_modules'));
    server = await createServer({
      root: ROOT,
      logLevel: 'error',
      ...(viteCacheDir ? { cacheDir: viteCacheDir } : {}),
      server: {
        port: 6100 + Math.floor(Math.random() * 600),
        strictPort: false,
        hmr: false,
        watch: { ignored: ['**/*'] },
        ...(viteCacheDir ? { fs: { allow: [ROOT, nodeModules, viteCacheDir] } } : {}),
      },
      optimizeDeps: {
        entries: ['index.html'],
        include: [
          'three',
          'three/examples/jsm/loaders/GLTFLoader.js',
          'three/examples/jsm/utils/SkeletonUtils.js',
          'three/examples/jsm/utils/BufferGeometryUtils.js',
          'three/examples/jsm/geometries/RoundedBoxGeometry.js',
        ],
      },
    });
    await server.listen();
    const baseUrl = `http://localhost:${server.httpServer?.address()?.port ?? server.config.server.port}`;
    log(`vite up at ${baseUrl}/`);

    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 300_000,
      args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
    });
    const page = await browser.newPage();
    page.on('console', (message) => {
      if (message.type() !== 'error' || /github-stars|favicon\.ico/.test(message.text())) return;
      consoleErrors.push(`${capturing ? '[capture] ' : ''}${message.text()}`);
    });
    page.on('pageerror', (error) => pageErrors.push(`${capturing ? '[capture] ' : ''}${String(error)}`));
    await page.setViewport({ width: OUTPUT.width, height: OUTPUT.height, deviceScaleFactor: DEVICE_SCALE });
    const firstVariant = views[0].variant;
    await page.evaluateOnNewDocument(({ variant, preset }) => {
      try {
        localStorage.setItem('cot.garage.variant', variant);
        localStorage.setItem('cot.gfxPreset', preset);
      } catch { /* storage blocked: the readiness checks below fail loudly */ }
    }, { variant: firstVariant, preset: quality });

    for (let attempt = 0; ; attempt++) {
      try {
        await page.goto(`${baseUrl}/?nosplash=1&qa=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        await page.waitForFunction(() => window.__GAME_READY === true && !!window.__GARAGE_WORKSHOP && !!window.__DEBUG,
          { timeout: 240_000, polling: 500 });
        break;
      } catch (error) {
        if (attempt >= 1) throw error;
        log(`boot attempt ${attempt + 1} failed (${error.message}); retrying`);
      }
    }
    log(`garage booted in ${Math.round((Date.now() - holdStarted) / 1000)} s`);

    const waitForGarage = async (variant, label) => {
      await page.waitForFunction((id) => {
        const stats = window.__GARAGE_WORKSHOP.stats();
        return stats.selected === id && stats.architecture?.ready === true && stats.architecture.presented === true;
      }, { timeout: 120_000, polling: 250 }, variant).catch((error) => {
        throw new Error(`${label}: Garage ${variant} never became ready (${error.message})`);
      });
    };
    let currentVariant = null;
    const selectVariant = async (variant) => {
      if (currentVariant === variant) return;
      await page.evaluate((id) => {
        if (window.__GARAGE_WORKSHOP.stats().selected !== id) window.__GARAGE_WORKSHOP.set(id);
      }, variant);
      await waitForGarage(variant, 'variant');
      currentVariant = variant;
    };
    await selectVariant(firstVariant);

    await page.evaluate(async (id) => {
      window.__DEBUG.selectGarageTank(id);
      await window.__DEBUG.stagePedestalTank(id);
    }, heroId);
    await page.waitForFunction((id) => window.__DEBUG.selectedSpecId === id
      && window.__DEBUG.pedestalVisual?.specId === id && window.__DEBUG.pedestalOnStage === true,
    { timeout: 120_000, polling: 250 }, heroId).catch((error) => {
      throw new Error(`hero ${heroId} never reached the turntable (${error.message})`);
    });

    const ensureWorkshop = async () => {
      await page.evaluate(() => window.__GARAGE_WORKSHOP.ensureBuilt());
      await page.waitForFunction(() => {
        const stats = window.__GARAGE_WORKSHOP.stats();
        return stats.built === true && stats.exhibitCount >= 4 && stats.sharedMaintenanceBayCount === 4;
      }, { timeout: 180_000, polling: 500 });
      // The pedestal and workshop share the GLB/idle queue: wait (bounded) until it drains and holds.
      await page.waitForFunction(`(() => {
        const s = window.__GLB_STATS;
        if (!s) return true;
        const key = s.settled + '/' + s.started;
        if (s.settled < s.started) { window.__GARAGE_ENV_STABLE = null; return false; }
        if (!window.__GARAGE_ENV_STABLE || window.__GARAGE_ENV_STABLE.key !== key) {
          window.__GARAGE_ENV_STABLE = { key, at: performance.now() };
          return false;
        }
        return performance.now() - window.__GARAGE_ENV_STABLE.at > 800;
      })()`, { timeout: 30_000, polling: 200 }).catch(() => log('GLB queue did not settle within 30 s; continuing'));
    };
    await ensureWorkshop();
    bootState = await page.evaluate(pageGarageState);
    log(`workshop ready: ${JSON.stringify(bootState)}`);
    if (bootState.heroSpecId !== heroId || !bootState.heroOnStage) throw new Error(`hero ${heroId} is not on the turntable`);
    await sleep(1500);

    capturing = true;
    await page.evaluate(pageEnterCapture);
    // Shot mode leaves the settled Garage's five-second idle cadence on its next wake: wait for live frames.
    const warm = await page.evaluate(pageWaitFrames, { count: 20, timeoutMs: 12_000 });
    log(`capture frames running (${warm.frames} frames in ${warm.ms} ms)`);
    if (warm.frames < 5) throw new Error('the Garage stopped rendering after entering the capture state');

    mkdirSync(rawDir, { recursive: true });
    for (const view of views) {
      if (view.variant !== currentVariant) {
        await page.evaluate(() => { window.__DEBUG.shotMode = false; });
        await selectVariant(view.variant);
        await ensureWorkshop();
        await page.evaluate(pageEnterCapture);
      }
      const frame = await page.evaluate(pageFrameView, { view, width: OUTPUT.width, height: OUTPUT.height });
      const settled = await page.evaluate(pageWaitFrames, { count: 45, timeoutMs: 15_000 });
      if (settled.frames < 10) throw new Error(`${view.name}: only ${settled.frames} frames rendered after the camera moved`);
      await sleep(900);
      const audit = await page.evaluate(pageCaptureAudit);
      if (audit.canvas[0] !== OUTPUT.width * DEVICE_SCALE || audit.canvas[1] !== OUTPUT.height * DEVICE_SCALE) {
        throw new Error(`${view.name}: canvas ${audit.canvas.join('x')} is not the ${OUTPUT.width * DEVICE_SCALE}x${OUTPUT.height * DEVICE_SCALE} master`);
      }
      if (audit.leakCount) log(`${view.name}: hid ${audit.leakCount} interface element(s) left visible: ${audit.hiddenLeaks.join(', ')}`);
      if (audit.people.length) throw new Error(`${view.name}: people in the Garage: ${audit.people.join(', ')}`);
      if (!(await page.evaluate(pageCameraHolds, frame.camera))) {
        throw new Error(`${view.name}: the camera moved off its pinned pose before the capture`);
      }
      const rawPath = join(rawDir, `${view.name}.png`);
      await page.screenshot({ path: rawPath, type: 'png' });
      if (!(await page.evaluate(pageCameraHolds, frame.camera))) {
        throw new Error(`${view.name}: the camera moved off its pinned pose during the capture`);
      }
      const master = pngSize(readFileSync(rawPath));
      if (master.width !== OUTPUT.width * DEVICE_SCALE || master.height !== OUTPUT.height * DEVICE_SCALE) {
        throw new Error(`${view.name}: master is ${master.width}x${master.height}`);
      }
      log(`${view.name}: captured ${relative(ROOT, rawPath) || rawPath} (${master.width}x${master.height}, `
        + `renderScale ${audit.renderScale}, dynScale ${audit.dynScale}, camera ${frame.camera.garageLocal.position.join(',')} `
        + `-> ${frame.camera.garageLocal.target.join(',')}, ${frame.camera.distanceM} m, occluded ${frame.occlusion.occluded}/${frame.occlusion.rays}`
        + `${Object.keys(frame.occlusion.occluders).length ? ` by ${JSON.stringify(frame.occlusion.occluders)}` : ''}`
        + `${frame.occlusion.error ? ` (probe error: ${frame.occlusion.error})` : ''}${frame.camera.clamped ? ', CLAMPED' : ''})`);
      records.push({ view, frame, audit, settled, rawPath, master });
    }
    const capturePageErrors = pageErrors.filter((entry) => entry.startsWith('[capture]'));
    if (capturePageErrors.length) throw new Error(`page errors during capture:\n${capturePageErrors.join('\n')}`);
  } finally {
    const heldS = Math.round((Date.now() - holdStarted) / 1000);
    await releaseAll();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    log(`browser, server and capture lock released after a ${heldS} s hold`);
    if (consoleErrors.length || pageErrors.length) {
      log(`page console errors ${consoleErrors.length}, page errors ${pageErrors.length}:`);
      for (const entry of [...pageErrors, ...consoleErrors].slice(0, 25)) console.log(`  ${entry}`);
    }
  }
  return { records, bootState, lockWaitS, consoleErrors, pageErrors };
}

// ------------------------------------------------------------------------------------------------ encode

function encode(records) {
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const { view, frame, audit, rawPath, master } of records) {
    const file = `${view.name}.webp`;
    const target = join(outDir, file);
    const temporary = `${target}.tmp-${process.pid}`;
    const args = ['-quiet', '-mt', ...WEBP_ARGS, '-resize', String(OUTPUT.width), String(OUTPUT.height), rawPath, '-o', temporary];
    const result = spawnSync(CWEBP, args, { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`cwebp failed for ${view.name}: ${result.stderr || result.error}`);
    renameSync(temporary, target);
    const bytes = readFileSync(target);
    const size = webpSize(bytes);
    if (size.width !== OUTPUT.width || size.height !== OUTPUT.height) {
      throw new Error(`${file} encoded at ${size.width}x${size.height}`);
    }
    files.push({
      file,
      view: view.name,
      title: view.title,
      variant: view.variant,
      subject: frame.subject,
      camera: frame.camera,
      occlusion: { rays: frame.occlusion.rays, occluded: frame.occlusion.occluded, occluders: frame.occlusion.occluders },
      render: { master: [master.width, master.height], renderScale: audit.renderScale, dynScale: audit.dynScale },
      width: size.width,
      height: size.height,
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
    log(`${file}: ${size.width}x${size.height}, ${bytes.length} bytes`);
  }
  return files;
}

// ------------------------------------------------------------------------------------------------ main

try {
  if (getPriority() < NICE) setPriority(NICE);
} catch (error) {
  log(`could not lower the process priority (${error.message})`);
}
log(`nice ${getPriority()}; views ${views.map((view) => view.name).join(', ')}; hero ${heroId}; quality ${quality}`);
log(`out ${outDir}; raw ${rawDir}${viteCacheDir ? `; vite cache ${viteCacheDir}` : ''}`);

const encoderVersion = cwebpVersion();
if (!encoderVersion) throw new Error(`${CWEBP} is not runnable (install libwebp or set CWEBP)`);
const captured = await captureMasters();
const files = encode(captured.records);
const { GARAGE_VARIANTS } = await import('../../src/game/garageVariants.ts');
const variantName = (id) => GARAGE_VARIANTS.find((variant) => variant.id === id)?.name ?? id;
const manifestPath = join(outDir, 'manifest.json');
let previous = [];
if (views.length < GARAGE_ENVIRONMENT_VIEWS.length && existsSync(manifestPath)) {
  try {
    previous = JSON.parse(readFileSync(manifestPath, 'utf8')).files
      .filter((entry) => !files.some((file) => file.file === entry.file) && existsSync(join(outDir, entry.file)));
  } catch { previous = []; }
}
const order = GARAGE_ENVIRONMENT_VIEWS.map((view) => `${view.name}.webp`);
const manifest = {
  tool: TOOL,
  command: `node ${TOOL}${argv.length ? ` ${argv.join(' ')}` : ''}`,
  capturedAt: new Date().toISOString(),
  sourceCommit: sourceCommit(),
  capture: {
    viewport: { width: OUTPUT.width, height: OUTPUT.height, deviceScaleFactor: DEVICE_SCALE },
    master: { width: OUTPUT.width * DEVICE_SCALE, height: OUTPUT.height * DEVICE_SCALE },
    qualityPreset: quality,
    heroSpecId: heroId,
    url: '/?nosplash=1&qa=1&tier=desktop',
    interface: 'hidden (every DOM element except the renderer canvas)',
    depthOfField: 'none (the Garage post chain has no depth-of-field pass)',
    people: 'none (owner ruling 2026-10-11)',
    battleScreenImage: captured.bootState?.battleScreenCurrentImage ?? null,
    lockWaitS: captured.lockWaitS,
    pageConsoleErrors: captured.consoleErrors.length,
  },
  encoding: { encoder: `cwebp ${encoderVersion ?? '(version unknown)'}`, args: [...WEBP_ARGS, '-resize', String(OUTPUT.width), String(OUTPUT.height)] },
  files: [...previous, ...files.map((file) => ({ ...file, variantName: variantName(file.variant) }))]
    .sort((a, b) => order.indexOf(a.file) - order.indexOf(b.file)),
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
log(`wrote ${relative(ROOT, manifestPath) || manifestPath}`);
// Everything is closed; never let a leaked handle keep a finished capture (and its caller) waiting.
setTimeout(() => process.exit(0), 5000).unref();
