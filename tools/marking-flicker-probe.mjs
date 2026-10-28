#!/usr/bin/env node
// Marking and prop flicker meter for the Tank Gallery (lane 243, the owner's 2026-10-23 report: "insignias and marks
// on tanks are still glitching, for example if u drag them around the tank gallery").
//   node tools/marking-flicker-probe.mjs --ids=m1a2_abrams,leclerc_s2 --out=dir [--views=hero,left,rear]
//     [--zooms=0.6,1,1.7] [--slow=32] [--fast=16] [--video=m1a2_abrams] [--root=checkout] [--swiftshader]
//     [--roots=base,lane --labels=before,after]   (both checkouts served and shot in one hold, tank by tank)
// Scripted orbits round each view's framing at several zooms, on the GPU under the capture lock (warmed outside it).
// Every number is read in-page from consecutive frames the Gallery itself rendered (puppeteer screenshots are ~1 Hz):
//   blip   slow orbit (0.06 deg a frame): pixels that jump away from both neighbours and back (z-fight sparkle);
//   nudge  the same pose re-rendered with the camera dollied 2 mm: pixels that change by more than 32/255
//          (depth ties and bias boundaries flip; real content does not move);
//   mark   the markings' visible share (pixels the markings change against a render without them, over their
//          alpha footprint), its mean, minimum and frame-to-frame swing;
//   depth  depth-arbitration errors: the frame re-rendered as category ids (marking, prop, armour/gear) twice, once with
//          the Gallery's own depth state (its near plane, every mesh's polygon offset) and once exact (a near plane
//          tight on the tank, offsets that only order exact ties): pixels whose front-most category differs, per
//          thousand pixels of that category (props showing through the armour in front of them, armour covering its
//          markings), and the share of those pixels that toggle between consecutive frames (the flicker of it).
// Each is counted over the markings' footprint, the props' footprint (fittings, stowage, ERA, lamps, guns, decor) and
// the whole tank. A manual probe, not part of npm test. Never edit src while it runs (vite would reload the page).
import { launchGuardedBrowser } from './browser-launch.mjs';
import { uniqueIds } from './id-list.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const ids = uniqueIds(arg('ids', 'm1a2_abrams').split(',').filter(Boolean), 'marking-flicker-probe --ids');
const out = resolve(arg('out', 'tmp/marking-flicker'));
const views = arg('views', 'hero,left,rear').split(',').filter(Boolean);
const zooms = arg('zooms', '0.6,1,1.7').split(',').map(Number);
const slowFrames = Number(arg('slow', '32'));
const fastFrames = Number(arg('fast', '16'));
const slowStepDeg = Number(arg('slow-step', '0.06'));
const fastStepDeg = Number(arg('fast-step', '1.5'));
const videoIds = new Set(arg('video', '').split(',').filter(Boolean));
// a video id also orbits its hero view at every zoom over a long sweep, keeping each frame as a PNG
const videoFrames = Number(arg('video-frames', '90'));
const videoStepDeg = Number(arg('video-step', '1'));
const root = resolve(arg('root', process.cwd()));
const width = Number(arg('width', '1440')), height = Number(arg('height', '900'));
const dpr = Number(arg('dpr', '1'));
const swiftshader = process.argv.includes('--swiftshader');
mkdirSync(out, { recursive: true });

// ---- in-page harness ------------------------------------------------------------------------------------------------
function installSeenHook() {
  const seen = { scenes: [], renderers: [] };
  window.__MF_SEEN = seen;
  const target = new EventTarget();
  target.addEventListener('observe', (event) => {
    const object = event.detail;
    if (object?.isScene) seen.scenes.push(object);
    else if (object?.domElement && typeof object.render === 'function') seen.renderers.push(object);
  });
  window.__THREE_DEVTOOLS__ = target;
}

function installHarness() {
  const seen = window.__MF_SEEN;
  const R = seen.renderers.find((r) => r.domElement.isConnected) || seen.renderers[0];
  const S = seen.scenes.find((s) => s.children.some((c) => /^tank_/.test(c.name))) || seen.scenes[0];
  const gl = R.getContext();
  const MF = { R, S, camera: null };
  const render = R.render.bind(R);
  // a variant's levers (--variants): the near plane the Gallery's camera draws with, and the slope share per offset unit
  MF.lever = { near: null, slope: null, radius: 0, target: [0, 0, 0] };
  const leverNear = (camera) => {
    const { near } = MF.lever;
    if (near === null) return;
    const t = MF.lever.target;
    const toBounds = Math.hypot(camera.position.x - t[0], camera.position.y - t[1], camera.position.z - t[2]) - MF.lever.radius;
    const value = near.startsWith('fixed') ? Number(near.slice(5)) : Math.max(0.05, Number(near.slice(5)) * toBounds);
    if (Math.abs(camera.near - value) > 1e-6) { camera.near = value; camera.updateProjectionMatrix(); }
  };
  R.render = (scene, camera) => { if (scene === S) { MF.camera = camera; leverNear(camera); } return render(scene, camera); };
  const leveredHooks = new WeakSet();
  const installSlopeLever = (meshes) => {
    for (const mesh of meshes) {
      if (leveredHooks.has(mesh) || !Number.isFinite(mesh.userData.coplanarDepthOffset)) continue;
      leveredHooks.add(mesh);
      const original = mesh.onBeforeRender;
      mesh.onBeforeRender = function leverSlope(...args) {
        original.apply(this, args);
        const material = args[4];
        if (MF.lever.slope !== null && material?.polygonOffset) {
          material.polygonOffsetFactor = -mesh.userData.coplanarDepthOffset * MF.lever.slope;
        }
      };
    }
  };
  const SHELL = /^(hull|turret|hullTrackGuard[LR]|hullExternalArmor|turretExternalArmor|turretCupola|turretHatch|gun|gunMount|turretPermanentMarkingSurface|hullGlass|turretGlass|gunMountGlass|muzzleBore.*)$/;
  const GEAR = /^gear|track|wheel|roller|sprocket|idler|suspension/i;
  const effectiveVisible = (object) => { for (let n = object; n; n = n.parent) if (!n.visible) return false; return true; };
  const tankRoot = () => S.children.find((c) => /^tank_/.test(c.name));
  const classify = () => {
    const rootObject = tankRoot();
    const marks = [], props = [], all = [];
    rootObject.traverse((o) => {
      if (!o.isMesh || !effectiveVisible(o)) return;
      if (o.userData.authoredShadowProxy || /^procShadow/.test(o.name)) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      if (!materials.some((m) => m && m.colorWrite !== false && m.visible !== false)) return;
      all.push(o);
      if (o.userData.vehicleMarking) marks.push(o);
      else if (!SHELL.test(o.name) && !GEAR.test(o.name)) props.push(o);
    });
    return { rootObject, marks, props, all };
  };
  let size = null, frame = null, scratch = null;
  const readCanvas = () => {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!size || size.w !== w || size.h !== h) { size = { w, h }; scratch = new Uint8Array(w * h * 4); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
    const luma = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < luma.length; i++, p += 4) luma[i] = (scratch[p] * 54 + scratch[p + 1] * 183 + scratch[p + 2] * 19) >> 8;
    return luma;
  };
  const whiteFrom = (material) => {
    const m = material.clone();
    if (m.color) m.color.setRGB(0, 0, 0);
    if (m.emissive) m.emissive.setRGB(1, 1, 1);
    m.emissiveIntensity = 1; m.emissiveMap = null; m.toneMapped = false; m.fog = false;
    m.depthTest = false; m.depthWrite = false; m.transparent = false; m.polygonOffset = false;
    m.vertexColors = false;
    return m;
  };
  const silhouettes = (sets) => {
    // each set is rendered alone, flat white, without depth: the pixels it covers, occluded or not
    const savedAlpha = R.getClearAlpha();
    const savedColor = S.fog?.color ? R.getClearColor(S.fog.color.clone()).getHex() : 0x0a0d10;
    const savedFog = S.fog, savedOverride = S.overrideMaterial, savedBackground = S.background;
    const visibility = new Map();
    S.traverse((o) => visibility.set(o, o.visible));
    const results = [];
    try {
      S.fog = null; S.background = null;
      R.setClearColor(0x000000, 1);
      for (const set of sets) {
        S.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) o.visible = false; });
        const swaps = [];
        for (const mesh of set.meshes) {
          for (let n = mesh; n; n = n.parent) n.visible = true;
          const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          const white = whiteFrom(material);
          if (set.alphaTest) { white.alphaTest = 0.5; } else { white.map = null; white.alphaMap = null; }
          swaps.push([mesh, mesh.material]);
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(() => white) : white;
        }
        render(S, MF.camera);
        const luma = readCanvas();
        const mask = new Uint8Array(luma.length);
        for (let i = 0; i < luma.length; i++) mask[i] = luma[i] > 127 ? 1 : 0;
        results.push(mask);
        for (const [mesh, material] of swaps) {
          const used = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of new Set(used)) m.dispose();
          mesh.material = material;
        }
        S.traverse((o) => o.visible = visibility.get(o) ?? o.visible);
      }
    } finally {
      S.traverse((o) => { if (visibility.has(o)) o.visible = visibility.get(o); });
      S.fog = savedFog; S.overrideMaterial = savedOverride; S.background = savedBackground;
      R.setClearColor(savedColor, savedAlpha);
    }
    return results;
  };
  const withoutMarkings = (marks) => {
    const saved = marks.map((m) => m.visible);
    marks.forEach((m) => { m.visible = false; });
    try { render(S, MF.camera); return readCanvas(); } finally { marks.forEach((m, i) => { m.visible = saved[i]; }); }
  };
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const settle = async () => { await nextFrame(); await nextFrame(); };
  const place = (target, azimuthDeg, elevationDeg, distance, dolly = 0) => {
    const az = azimuthDeg * Math.PI / 180, el = elevationDeg * Math.PI / 180;
    const dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    const d = distance + dolly;
    window.__TANK_GALLERY.setCamera([target[0] + dir[0] * d, target[1] + dir[1] * d, target[2] + dir[2] * d], target);
  };
  // ---- depth-arbitration meter ----
  const CATEGORY_COLORS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; // marking, prop, armour and gear
  const idMaterials = new Map();
  const idMaterial = (mesh, category, template) => {
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const key = `${category}:${source.side}:${category === 0 ? source.uuid : ''}`;
    let material = idMaterials.get(key);
    if (!material) {
      material = template.clone();
      material.color.setRGB(0, 0, 0); material.emissive.setRGB(...CATEGORY_COLORS[category]);
      material.emissiveMap = null; material.emissiveIntensity = 1; material.metalness = 0; material.roughness = 1;
      material.envMap = null; material.envMapIntensity = 0; material.toneMapped = false; material.fog = false;
      material.transparent = false; material.depthTest = true; material.depthWrite = category !== 0;
      material.vertexColors = false; material.side = source.side; material.polygonOffset = true;
      material.normalMap = null; material.bumpMap = null; material.roughnessMap = null; material.metalnessMap = null;
      material.aoMap = null; material.alphaMap = null; material.lightMap = null;
      if (category === 0) { material.map = source.map; material.alphaTest = .5; } else { material.map = null; material.alphaTest = 0; }
      material.onBeforeCompile = () => {}; material.customProgramCacheKey = () => `mf-id-${category}`;
      material.needsUpdate = true;
      idMaterials.set(key, material);
    }
    return material;
  };
  let markingTemplate = null;
  const depthPass = (set, mode, camera) => {
    // mode 'ref': ties ordered by rank only, markings above everything, under a near plane tight on the tank;
    // mode 'act': the offsets the Gallery draws with, under its own camera
    const template = markingTemplate || (markingTemplate = set.marks[0]?.material?.clone?.()
      || set.all.find((m) => m.material?.isMeshStandardMaterial)?.material?.clone());
    const maxRank = set.all.reduce((top, m) => Math.max(top, m.userData.coplanarDepthLayer || 0), 0);
    const saved = [];
    const visibility = new Map();
    S.traverse((o) => visibility.set(o, o.visible));
    const savedFog = S.fog, savedBackground = S.background, savedAlpha = R.getClearAlpha();
    const savedColor = S.fog?.color ? R.getClearColor(S.fog.color.clone()).getHex() : 0x0a0d10;
    const markSet = new Set(set.marks), propSet = new Set(set.props), allSet = new Set(set.all);
    try {
      S.fog = null; S.background = null; R.setClearColor(0x000000, 1);
      S.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !allSet.has(o)) o.visible = false; });
      for (const mesh of set.all) {
        const category = markSet.has(mesh) ? 0 : propSet.has(mesh) ? 1 : 2;
        const material = idMaterial(mesh, category, template);
        const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        let units = 0, factor = 0;
        // refA orders exact ties by rank, refB by reverse rank (both under a near plane tight on the tank, no slope
        // share): where they agree the front-most part is geometry's, where they differ it is a tie
        const rank = mesh.userData.coplanarDepthLayer;
        const actSlope = (offset) => (MF.lever.slope !== null ? -offset * MF.lever.slope : null);
        // the draw hook's units (coplanarDepth.ts coplanarDepthUnits): exact ties scale with the drawing camera's near
        const actUnits = (offset) => offset + (mesh.userData.coplanarDepthTies ?? 0) * (MF.lever.tieUnits ?? 1)
          * (camera.near > 0.05 ? camera.near / 0.05 - 1 : 0);
        if (category === 0) {
          if (mode !== 'act') units = -(maxRank + 2);
          else if (Number.isFinite(mesh.userData.coplanarDepthOffset)) {
            units = -actUnits(mesh.userData.coplanarDepthOffset);
            factor = actSlope(mesh.userData.coplanarDepthOffset) ?? mesh.userData.coplanarDepthFactor ?? 0;
          } else { units = source.polygonOffset ? source.polygonOffsetUnits : 0; factor = source.polygonOffset ? source.polygonOffsetFactor : 0; }
        } else if (Number.isFinite(rank)) {
          if (mode === 'refA') units = -rank;
          else if (mode === 'refB') units = -(maxRank + 1 - rank);
          else {
            const offset = mesh.userData.coplanarDepthOffset ?? rank;
            units = -(Number.isFinite(mesh.userData.coplanarDepthOffset) ? actUnits(offset) : offset);
            factor = Number.isFinite(mesh.userData.coplanarDepthOffset)
              ? (actSlope(offset) ?? mesh.userData.coplanarDepthFactor ?? 0) : 0;
          }
        }
        saved.push([mesh, mesh.material, mesh.onBeforeRender, mesh.onAfterRender, mesh.renderOrder]);
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(() => material) : material;
        mesh.onBeforeRender = () => { material.polygonOffsetUnits = units; material.polygonOffsetFactor = factor; };
        mesh.onAfterRender = () => {};
        mesh.renderOrder = category === 0 ? 1 : 0;
      }
      render(S, camera);
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
      const ids = new Uint8Array(w * h);
      for (let i = 0, p = 0; i < ids.length; i++, p += 4) {
        const r = scratch[p], g = scratch[p + 1], b = scratch[p + 2];
        ids[i] = r > 128 && r >= g && r >= b ? 1 : g > 128 && g >= b ? 2 : b > 128 ? 3 : 0;
      }
      return ids;
    } finally {
      for (const [mesh, material, before, after, order] of saved) {
        mesh.material = material; mesh.onBeforeRender = before; mesh.onAfterRender = after; mesh.renderOrder = order;
      }
      S.traverse((o) => { if (visibility.has(o)) o.visible = visibility.get(o); });
      S.fog = savedFog; S.background = savedBackground; R.setClearColor(savedColor, savedAlpha);
    }
  };
  MF.sequence = async ({ target, azimuthDeg, elevationDeg, distance, frames, stepDeg, blips, nudgeEvery, keepFrames,
    measure = true, hotspot = false }) => {
    let hotspotImage = null;
    const set = classify();
    // the tank's bounds for the reference near plane (a sphere round the target that holds every vertex)
    let radius = 0;
    set.rootObject.updateMatrixWorld(true);
    for (const mesh of set.all) {
      let sphere;
      if (mesh.isInstancedMesh || mesh.isBatchedMesh) { mesh.computeBoundingSphere(); sphere = mesh.boundingSphere; }
      else { if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere(); sphere = mesh.geometry.boundingSphere; }
      if (!sphere) continue;
      const center = sphere.center.clone().applyMatrix4(mesh.matrixWorld);
      const scale = mesh.matrixWorld.getMaxScaleOnAxis();
      radius = Math.max(radius, Math.hypot(center.x - target[0], center.y - target[1], center.z - target[2]) + sphere.radius * scale);
    }
    MF.lever.radius = radius;
    const depthStats = { marking: { ref: 0, err: 0, toggle: 0 }, prop: { ref: 0, err: 0, toggle: 0 }, tank: { ref: 0, err: 0, toggle: 0 }, ties: 0 };
    MF.lever.target = target;
    installSlopeLever(set.all);
    let previousErr = null;
    const stats = {
      frames, stepDeg, distance: +distance.toFixed(2),
      near: null, far: null,
      marking: { px: 0, blips: 0, nudgePx: 0, nudgeChanged: 0 },
      prop: { px: 0, blips: 0, nudgePx: 0, nudgeChanged: 0 },
      tank: { px: 0, blips: 0, nudgePx: 0, nudgeChanged: 0 },
      survival: [],
    };
    const ring = [];
    const kept = [];
    for (let f = 0; f < frames; f++) {
      place(target, azimuthDeg + f * stepDeg, elevationDeg, distance);
      await settle();
      stats.near = MF.camera.near; stats.far = MF.camera.far;
      const luma = readCanvas();
      if (keepFrames) kept.push(R.domElement.toDataURL('image/png'));
      if (!measure) continue;
      const [markMask, propMask, tankMask] = silhouettes([
        { meshes: set.marks, alphaTest: true }, { meshes: set.props }, { meshes: set.all }]);
      // depth arbitration: the Gallery's own state against the exact reference
      const actual = depthPass(set, 'act', MF.camera);
      const reference = MF.camera.clone();
      const toTarget = Math.hypot(MF.camera.position.x - target[0], MF.camera.position.y - target[1], MF.camera.position.z - target[2]);
      reference.near = Math.max(0.05, (toTarget - radius) * 0.9);
      reference.updateProjectionMatrix();
      const exact = depthPass(set, 'refA', reference);
      const reverse = depthPass(set, 'refB', reference);
      const err = new Uint8Array(exact.length);
      for (let i = 0; i < exact.length; i++) {
        const r = exact[i], a = actual[i];
        if (r !== reverse[i]) { depthStats.ties++; continue; }
        if (r === 1 || a === 1) { if (r === 1) depthStats.marking.ref++; if (r !== a) { depthStats.marking.err++; err[i] |= 1; } }
        if (r === 2 || a === 2) { if (r === 2) depthStats.prop.ref++; if (r !== a) { depthStats.prop.err++; err[i] |= 2; } }
        if (r) { depthStats.tank.ref++; if (r !== a) { depthStats.tank.err++; err[i] |= 4; } }
      }
      if (previousErr) {
        for (let i = 0; i < err.length; i++) {
          const flip = err[i] ^ previousErr[i];
          if (!flip) continue;
          if (flip & 1) depthStats.marking.toggle++;
          if (flip & 2) depthStats.prop.toggle++;
          if (flip & 4) depthStats.tank.toggle++;
        }
      }
      previousErr = err;
      // the markings' visible share
      if (set.marks.length) {
        const bare = withoutMarkings(set.marks);
        let footprint = 0, shown = 0;
        for (let i = 0; i < luma.length; i++) {
          if (!markMask[i]) continue;
          footprint++;
          if (Math.abs(luma[i] - bare[i]) > 12) shown++;
        }
        stats.survival.push(footprint ? shown / footprint : null);
      }
      ring.push({ luma, masks: { marking: markMask, prop: propMask, tank: tankMask } });
      if (ring.length > 3) ring.shift();
      if (blips && ring.length === 3) {
        const [a, b, c] = ring;
        for (const key of ['marking', 'prop', 'tank']) {
          const mask = b.masks[key];
          let px = 0, count = 0;
          for (let i = 0; i < mask.length; i++) {
            if (!mask[i]) continue;
            px++;
            const d1 = b.luma[i] - a.luma[i], d2 = b.luma[i] - c.luma[i];
            if (Math.abs(d1) > 20 && Math.abs(d2) > 20 && Math.sign(d1) === Math.sign(d2)
                && Math.abs(a.luma[i] - c.luma[i]) < 10) count++;
          }
          stats[key].px += px; stats[key].blips += count;
        }
      }
      if (nudgeEvery && f % nudgeEvery === 0) {
        const baseRgba = hotspot && !hotspotImage ? scratch.slice() : null;
        place(target, azimuthDeg + f * stepDeg, elevationDeg, distance, 0.002);
        await settle();
        const nudged = readCanvas();
        if (baseRgba) {
          // the frame with every pixel the 2 mm dolly flips in red (rows flipped: readPixels is bottom-up)
          const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
          const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
          const context = canvas.getContext('2d'), image = context.createImageData(w, h);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (h - 1 - y) * w + x, o = (y * w + x) * 4;
              const flipped = Math.abs(nudged[i] - luma[i]) > 32 || err[i];
              image.data[o] = flipped ? 255 : baseRgba[i * 4]; image.data[o + 1] = flipped ? (err[i] ? 255 : 0) : baseRgba[i * 4 + 1];
              image.data[o + 2] = flipped ? 0 : baseRgba[i * 4 + 2]; image.data[o + 3] = 255;
            }
          }
          context.putImageData(image, 0, 0);
          hotspotImage = canvas.toDataURL('image/png');
        }
        for (const key of ['marking', 'prop', 'tank']) {
          const mask = ring[ring.length - 1].masks[key];
          for (let i = 0; i < mask.length; i++) {
            if (!mask[i]) continue;
            stats[key].nudgePx++;
            if (Math.abs(nudged[i] - luma[i]) > 32) stats[key].nudgeChanged++;
          }
        }
      }
    }
    const values = stats.survival.filter((v) => v != null);
    let swing = 0;
    for (let i = 1; i < values.length; i++) swing += Math.abs(values[i] - values[i - 1]);
    const summary = {
      frames, stepDeg, distance: stats.distance, near: stats.near, far: +stats.far.toFixed(1),
      blipPerMille: Object.fromEntries(['marking', 'prop', 'tank'].map((k) => [k, stats[k].px ? +(1000 * stats[k].blips / stats[k].px).toFixed(3) : null])),
      nudgePerMille: Object.fromEntries(['marking', 'prop', 'tank'].map((k) => [k, stats[k].nudgePx ? +(1000 * stats[k].nudgeChanged / stats[k].nudgePx).toFixed(3) : null])),
      markShown: values.length ? { mean: +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(3),
        min: +Math.min(...values).toFixed(3), swing: +(values.length > 1 ? swing / (values.length - 1) : 0).toFixed(4) } : null,
      footprintPx: { marking: stats.marking.px, prop: stats.prop.px, tank: stats.tank.px },
      depthErrPerMille: Object.fromEntries(['marking', 'prop', 'tank'].map((k) => [k, depthStats[k].ref ? +(1000 * depthStats[k].err / depthStats[k].ref).toFixed(3) : null])),
      depthTogglePerMille: Object.fromEntries(['marking', 'prop', 'tank'].map((k) => [k, depthStats[k].ref ? +(1000 * depthStats[k].toggle / depthStats[k].ref).toFixed(3) : null])),
      referencePx: { marking: depthStats.marking.ref, prop: depthStats.prop.ref, tank: depthStats.tank.ref },
      tiePerMille: depthStats.tank.ref ? +(1000 * depthStats.ties / (depthStats.tank.ref + depthStats.ties)).toFixed(3) : null,
      lever: { ...MF.lever, target: undefined },
    };
    return { summary, kept, hotspotImage };
  };
  window.__MF = MF;
  return { renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    depthBits: gl.getParameter(gl.DEPTH_BITS), canvas: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
}

// ---- driver ---------------------------------------------------------------------------------------------------------
// --roots=a,b [--labels=before,after]: both checkouts served and shot in one hold, tank by tank (matched GPU state).
// Browser rule (coordinator, 2026-10-23 after a jetsam report of a 14 GB capture renderer): every browser runs with a
// 3 GB V8 heap per renderer, the run aborts if any of its processes passes 6 GB, and one browser at a time is launched
// for each orbit capture (one tank on one checkout) and closed after it. The vite servers stay warm across captures.
const roots = (arg('roots', '') ? arg('roots', '').split(',') : [root]).map((path) => resolve(path));
const labels = arg('labels', roots.length > 1 ? 'before,after' : 'run').split(',');
// --variants=label:near=fixed0.05|scale0.1,slope=0.0078125;...: lever settings shot on the last checkout (after the
// first checkout's own run), e.g. to choose the Gallery's near plane and the per-unit slope share in one hold
const variants = arg('variants', '').split(';').filter(Boolean).map((entry) => {
  const [label, settings = ''] = entry.split(':');
  const lever = { near: null, slope: null };
  for (const pair of settings.split(',').filter(Boolean)) {
    const [key, value] = pair.split('=');
    lever[key] = key === 'slope' ? Number(value) : value;
  }
  return { label, lever };
});
const plan = variants.length
  ? [{ index: 0, label: labels[0], lever: null }, ...variants.map((v) => ({ index: roots.length - 1, ...v }))]
  : labels.map((label, index) => ({ index, label, lever: null }));
const RSS_LIMIT_KB = 6 * 1024 * 1024;
const servers = [];
let browser = null, refresher = null, guard = null, overLimit = null;
const report = { startedAt: new Date().toISOString(), roots, labels, ids, views, zooms, slowFrames, fastFrames,
  slowStepDeg, fastStepDeg, variants, runs: Object.fromEntries(plan.map(({ label }) => [label, {}])) };

/** The browser and every process under it, by resident size (KB). */
function browserTreeRss(rootPid) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const tree = new Set([rootPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [pid, ppid] of rows) if (tree.has(ppid) && !tree.has(pid)) { tree.add(pid); grew = true; }
  }
  return rows.filter(([pid]) => tree.has(pid)).map(([pid, , rss]) => ({ pid, rss }));
}

async function launchBrowser() {
  const args = swiftshader
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
    : ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist'];
  browser = await launchGuardedBrowser(puppeteer, { headless: 'new', protocolTimeout: 900_000,
    args: [...args, '--js-flags=--max-old-space-size=3072', `--window-size=${width},${height}`] });
  const pid = browser.process()?.pid;
  if (pid) {
    guard = setInterval(() => {
      const heavy = browserTreeRss(pid).find(({ rss }) => rss > RSS_LIMIT_KB);
      if (!heavy || overLimit) return;
      overLimit = `browser process ${heavy.pid} reached ${(heavy.rss / 1048576).toFixed(1)} GB (limit 6 GB)`;
      console.error(`[guard] ${overLimit}: aborting`);
      browser.process()?.kill('SIGKILL');
    }, 2000);
  }
  return browser;
}

async function closeBrowser() {
  if (guard) clearInterval(guard);
  guard = null;
  if (browser) await browser.close().catch(() => {});
  browser = null;
  if (overLimit) throw new Error(overLimit);
}

/** Vite servers for every checkout, their gallery graph transformed ahead (no browser before the hold). */
async function warm() {
  for (const [index, checkout] of roots.entries()) {
    // vite's warmup resolves against the working directory
    process.chdir(checkout);
    const server = await createServer({ root: checkout, logLevel: 'error', server: { host: '127.0.0.1',
      port: Number(arg('port', '5843')) + index * 7, strictPort: false, hmr: false, watch: null } });
    await server.listen();
    servers.push(server);
    await server.warmupRequest('/src/gallery/gallery.ts').catch(() => {});
  }
  return servers;
}

/** One orbit capture: a fresh browser on one checkout's Gallery, one tank, closed afterwards. */
async function openGallery(index, id) {
  await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr });
  page.setDefaultTimeout(300_000);
  page.on('pageerror', (error) => console.error(`[page ${labels[index]}]`, String(error).slice(0, 300)));
  await page.evaluateOnNewDocument(installSeenHook);
  await page.goto(`http://127.0.0.1:${servers[index].httpServer.address().port}/gallery?id=${id}`,
    { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction((next) => window.__TANK_GALLERY?.ready && window.__TANK_GALLERY.getState().selectedId === next,
    { timeout: 300_000, polling: 300 }, id);
  report.gpu = await page.evaluate(installHarness);
  return page;
}

try {
  if (swiftshader) await warm();
  else await acquireCaptureLock(60 * 60 * 1000, { prepare: warm, place: `marking-flicker-243-${labels.join('-')}` });
  if (!swiftshader) { refresher = setInterval(refreshCaptureLock, 60_000); refresher.unref(); }
  for (const id of ids) {
    for (const { index, label, lever } of plan) {
      const page = await openGallery(index, id);
      await page.evaluate((settings) => Object.assign(window.__MF.lever, settings), lever ?? { near: null, slope: null });
      console.log('gpu', label, id, JSON.stringify(report.gpu));
      const tank = report.runs[label][id] = {};
      for (const view of views) {
        const frame = await page.evaluate((v) => { window.__TANK_GALLERY.frameView(v); return window.__TANK_GALLERY.getState().camera; }, view);
        const [px, py, pz] = frame.position, [tx, ty, tz] = frame.target;
        const dx = px - tx, dy = py - ty, dz = pz - tz;
        const fit = Math.hypot(dx, dy, dz);
        const azimuthDeg = Math.atan2(dx, dz) * 180 / Math.PI, elevationDeg = Math.asin(dy / fit) * 180 / Math.PI;
        for (const zoom of zooms) {
          const key = `${view}@${zoom}`;
          const base = { target: frame.target, azimuthDeg, elevationDeg, distance: fit * zoom };
          const slow = await page.evaluate((o) => window.__MF.sequence(o),
            { ...base, frames: slowFrames, stepDeg: slowStepDeg, blips: true, nudgeEvery: 4, keepFrames: false, hotspot: true });
          if (slow.hotspotImage) {
            mkdirSync(`${out}/hotspots/${label}`, { recursive: true });
            writeFileSync(`${out}/hotspots/${label}/${id}-${key}.png`, Buffer.from(slow.hotspotImage.split(',')[1], 'base64'));
          }
          const fast = await page.evaluate((o) => window.__MF.sequence(o),
            { ...base, frames: fastFrames, stepDeg: fastStepDeg, blips: false, nudgeEvery: 1, keepFrames: false });
          tank[key] = { slow: slow.summary, fast: fast.summary };
          const video = videoIds.has(id) && view === 'hero' && zoom >= 1 ? await page.evaluate((o) => window.__MF.sequence(o),
            { ...base, frames: videoFrames, stepDeg: videoStepDeg, blips: false, nudgeEvery: 0, keepFrames: true, measure: false })
            : null;
          if (video) {
            tank[key].video = video.summary;
            const dir = `${out}/frames/${label}/${id}-${view}@${zoom}-video`;
            mkdirSync(dir, { recursive: true });
            video.kept.forEach((url, i) => writeFileSync(`${dir}/${String(i).padStart(3, '0')}.png`, Buffer.from(url.split(',')[1], 'base64')));
          }
          console.log(label, id, key, JSON.stringify({ slow: { blip: slow.summary.blipPerMille, nudge: slow.summary.nudgePerMille,
            depth: slow.summary.depthErrPerMille, toggle: slow.summary.depthTogglePerMille, mark: slow.summary.markShown?.mean,
            near: +slow.summary.near.toFixed(3) },
          fast: { nudge: fast.summary.nudgePerMille, depth: fast.summary.depthErrPerMille, toggle: fast.summary.depthTogglePerMille } }));
        }
      }
      writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
      await closeBrowser();
    }
  }
  report.finishedAt = new Date().toISOString();
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
} finally {
  if (refresher) clearInterval(refresher);
  await closeBrowser().catch((error) => { console.error(String(error)); process.exitCode = 3; });
  for (const server of servers) await server.close().catch(() => {});
  if (!swiftshader) releaseCaptureLock();
}
