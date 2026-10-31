#!/usr/bin/env node
// Native focused receipt. Run: node tools/pane-stack-layer.browser.selftest.mjs
// (local-fps-266) A regional wall cut by three openings (house.ts holedPolygon, the room's dark at the back of each
// reveal) with a unit in each (openings.ts windowUnit: a lit curtain, plain glass, the facade craft's leaning glass; frames
// and glazing bars), built by the regional sink, drawn on the GPU at 20-700 m with the battle camera's depth (near 0.5 m,
// far 4000 m; a 4x MSAA 24-bit depth, the scene target's). The window stacks' three groups (the dark, the panes, the
// frames) are drawn in all six orders, after the rest of the wall and before it. With the stack's layers
// (src/world/paneStack.ts) the six orders draw the same pixels and no dark shows through a pane; without them the order
// decides, which the receipt must see (else it could not see the fight); at 20 m the layers change nothing.
// (The killcam's 8 px, Main's ruling 2026-10-31, are a crossing, not a stack: two interpenetrating turret parts meet on a
// curve where both depths are equally valid, so the draw order decides those pixels in any renderer and no layer applies.)
import { launchGuardedBrowser } from './browser-launch.mjs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import * as THREE from 'three';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';
import { PartSink, streamFrom } from '../src/world/maps/regional/geometry.ts';
import { holedPolygon } from '../src/world/maps/regional/house.ts';
import { windowUnit } from '../src/world/maps/regional/openings.ts';
import { setFacadeCraft, withFacade } from '../src/world/maps/regional/facade.ts';
import { PANE_STACK_UNITS_PER_LAYER } from '../src/world/paneStack.ts';

async function bounded(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

// ---- the wall, built as a kit builds it
setFacadeCraft(true);
const face = { origin: [0, 0, 0], u: [1, 0, 0], out: [0, 0, 1], width: 6 };
const holes = [-2, 0, 2].map((u) => ({ u0: u - 0.45, u1: u + 0.45, y0: 1, y1: 2.3 }));
const style = { frame: [0.9, 0.9, 0.88], frameWidth: 0.06, frameOut: 0.03, bars: 'cross', surround: null, sill: null, shutters: null };
const sink = new PartSink();
holedPolygon(sink, 'plaster', face, [[-3, 0], [3, 0], [3, 3.2], [-3, 3.2]], holes, 0.4, 0.34);
sink.recess = 0.34;
windowUnit(sink, face, -2, 1, 0.9, 1.3, style, () => 0, 1); // lit: a curtain
windowUnit(sink, face, 0, 1, 0.9, 1.3, style, () => 0.99, 0); // plain glass
withFacade({ tier: 'desktop', rng: streamFrom(7) }, () => windowUnit(sink, face, 2, 1, 0.9, 1.3, style, () => 0.99, 0)); // leaning glass
sink.recess = 0;
const parts = sink.finish();

const positions = (g) => Array.from((g.index ? g.toNonIndexed() : g).getAttribute('position').array);
const draws = [];
// a colour each group's pixels can be told by: the dark alone writes blue
const otherColours = [[0, 200, 0], [120, 60, 0], [0, 120, 60], [60, 60, 0], [200, 100, 60]];
let other = 0;
for (const [bucket, list] of Object.entries(parts)) {
  for (const g of list) {
    const layer = g.userData.paneStackLayer ?? 0;
    const group = bucket === 'dark' ? 'dark' : bucket === 'glass' || bucket === 'curtain' ? 'pane' : bucket === 'structureWood' ? 'frame' : 'rest';
    draws.push({ name: `${bucket}${layer ? ` L${layer}` : ''}`, group, pos: positions(g), units: layer * PANE_STACK_UNITS_PER_LAYER,
      colour: group === 'dark' ? [0, 0, 255] : bucket === 'curtain' ? [255, 0, 0] : bucket === 'glass' ? [200, 0, 0]
        : group === 'frame' ? [230, 230, 0] : otherColours[other++ % otherColours.length] });
  }
}
const trianglesOf = (pick) => draws.filter(pick).reduce((n, d) => n + d.pos.length / 9, 0);
assert.equal(trianglesOf((d) => d.group === 'dark' && d.units === 2 * PANE_STACK_UNITS_PER_LAYER), holes.length * 2,
  'every opening\'s dark is two layers back, behind its framed pane');
assert.equal(trianglesOf((d) => d.group === 'pane' && d.units === PANE_STACK_UNITS_PER_LAYER), trianglesOf((d) => d.group === 'pane'),
  'every pane is one layer back, behind its frame');
assert.ok(trianglesOf((d) => d.group === 'frame') > 0 && draws.filter((d) => d.group === 'frame').every((d) => d.units === 0), 'the frames draw where they are');

// ---- the views: the wall's middle from each range, head on and 40 degrees off, the battle camera's near and far
const W = 512, H = 256;
const views = [];
for (const distance of [20, 300, 400, 500, 700]) {
  for (const yawDeg of [0, 40]) {
    const yaw = yawDeg * Math.PI / 180;
    const camera = new THREE.PerspectiveCamera(2 * Math.atan(2.2 / distance) * 180 / Math.PI, W / H, 0.5, 4000);
    camera.position.set(Math.sin(yaw) * distance, 1.65, Math.cos(yaw) * distance);
    camera.lookAt(0, 1.65, 0);
    camera.updateMatrixWorld(true);
    const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    views.push({ distance, yawDeg, pv: Array.from(pv.elements) });
  }
}

/** In the page: each view drawn in every order of the stack's groups, with the layers and without; compared there. */
function renderStacks({ draws, views, width, height }) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false });
  if (!gl) throw new Error('webgl2 unavailable');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`compile: ${gl.getShaderInfoLog(shader)}`);
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, '#version 300 es\nin vec3 aPos;\nuniform mat4 uPV;\nvoid main() { gl_Position = uPV * vec4( aPos, 1.0 ); }'));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\nuniform vec3 uColour;\nout vec4 outColor;\nvoid main() { outColor = vec4( uColour, 1.0 ); }'));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(program)}`);
  gl.useProgram(program);
  const uPV = gl.getUniformLocation(program, 'uPV'), uColour = gl.getUniformLocation(program, 'uColour');
  const buffers = draws.map((d) => {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d.pos), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(program, 'aPos'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 3, gl.FLOAT, false, 0, 0);
    return { vao, count: d.pos.length / 3 };
  });
  // the scene target: 4x MSAA colour and 24-bit depth, resolved into one sample
  const msaa = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
  const colourRb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, colourRb);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA8, width, height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colourRb);
  const depthRb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT24, width, height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('msaa target incomplete');
  const resolved = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, resolved);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const draw = (view, order, layered) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // three's opaque state: depth test LEQUAL with writes, back faces culled
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.uniformMatrix4fv(uPV, false, new Float32Array(view.pv));
    for (const i of order) {
      const d = draws[i];
      if (layered && d.units) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(0, d.units); } else gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.uniform3f(uColour, d.colour[0] / 255, d.colour[1] / 255, d.colour[2] / 255);
      gl.bindVertexArray(buffers[i].vao); gl.drawArrays(gl.TRIANGLES, 0, buffers[i].count);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaa); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolved);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, resolved);
    const out = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  };
  // the stack's groups in all six orders, after the rest and before it: only the stack's own order changes within a set
  const group = (name) => draws.map((_, i) => i).filter((i) => draws[i].group === name);
  const stack = [group('dark'), group('pane'), group('frame')], rest = group('rest');
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const orderSets = [perms.map((p) => [...rest, ...p.flatMap((k) => stack[k])]), perms.map((p) => [...p.flatMap((k) => stack[k]), ...rest])];
  const differing = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; };
  const blue = (a) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i + 2] > 0) n++; return n; };
  // which groups' colours a pixel shows in two shots (exact colours only: an MSAA edge mixes them)
  const names = new Map(draws.map((d) => [d.colour.join(','), d.group === 'rest' ? d.name : d.group]));
  const pairs = (a, b) => { const out = {}; for (let i = 0; i < a.length; i += 4) {
    if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
    const k = [names.get(`${a[i]},${a[i + 1]},${a[i + 2]}`) ?? 'edge', names.get(`${b[i]},${b[i + 1]},${b[i + 2]}`) ?? 'edge'].sort().join(' / ');
    out[k] = (out[k] ?? 0) + 1; } return out; };
  const rows = views.map((view) => {
    const row = { distance: view.distance, yawDeg: view.yawDeg };
    for (const layered of [true, false]) {
      const sets = orderSets.map((orders) => orders.map((order) => draw(view, order, layered)));
      let worst = 0, worstPairs = {};
      for (const shots of sets) for (const s of shots.slice(1)) { const n = differing(shots[0], s); if (n > worst) { worst = n; worstPairs = pairs(shots[0], s); } }
      row[layered ? 'layered' : 'control'] = { stackOrder: worst, pairs: worstPairs, darkShows: Math.max(...sets.flat().map(blue)), first: sets[0][0] };
    }
    // up close the layers change nothing: the layered frame equals the control's with the farther faces drawn first
    row.nearSame = differing(row.layered.first, row.control.first);
    row.paneCover = row.layered.first.reduce((n, v, i) => n + (i % 4 === 0 && (v === 255 || v === 200) && row.layered.first[i + 1] === 0 ? 1 : 0), 0);
    delete row.layered.first; delete row.control.first;
    return row;
  });
  return { renderer, rows };
}

const lock = createCaptureLock();
const report = { protocol: 'pane-stack-layer-v1', ok: false, unitsPerLayer: PANE_STACK_UNITS_PER_LAYER,
  draws: draws.map((d) => `${d.name} ${d.pos.length / 9}`), renderer: null, rows: [], errors: [], browserClosed: false, lockReleased: false };
let browser, refresh;
try {
  await lock.acquire(45 * 60_000);
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 30_000, protocolTimeout: 300_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  report.launch = verifyNativeBrowserLaunch(browser);
  const page = await browser.newPage();
  page.on('pageerror', (error) => { if (report.errors.length < 12) report.errors.push(String(error)); });
  const { renderer, rows } = await bounded(page.evaluate(renderStacks, { draws, views, width: W, height: H }), 300_000, 'render');
  report.renderer = renderer; report.rows = rows;
  for (const r of rows) {
    const at = `${r.distance} m, ${r.yawDeg} deg`;
    assert.ok(r.paneCover > 0, `${at}: the panes are in the frame`);
    assert.equal(r.layered.stackOrder, 0, `${at}: with the stack's layers every order of its dark, panes and frames draws the same pixels (${JSON.stringify(r.layered.pairs)})`);
    assert.equal(r.layered.darkShows, 0, `${at}: no dark shows through a pane`);
    if (r.distance <= 20) {
      assert.equal(r.nearSame, 0, `${at}: up close the layers change no pixel`);
      assert.equal(r.control.darkShows, 0, `${at}: up close the depth buffer tells them apart unaided`);
    }
  }
  assert.ok(rows.some((r) => r.distance >= 300 && r.control.stackOrder > 0 && r.control.darkShows > 0),
    'without the layers the order decides somewhere at 300-700 m (the receipt sees the fight it guards)');
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
} finally {
  if (browser) {
    try { await bounded(browser.close(), 15_000, 'browser close'); report.browserClosed = true; }
    catch (error) { report.errors.push(String(error)); const child = browser.process(); if (child && child.exitCode === null) child.kill('SIGKILL'); }
  }
  clearInterval(refresh); lock.release(); report.lockReleased = true;
}
report.ok = report.errors.length === 0 && report.rows.length === views.length && report.browserClosed && report.lockReleased;
console.log(JSON.stringify(report, null, 1));
if (!report.ok) process.exitCode = 1;
else {
  const fights = report.rows.filter((r) => r.control.stackOrder > 0);
  console.log(`pane-stack-layer.browser.selftest: a regional wall's three windows (curtain, glass, leaning glass; frames and bars) over their reveals' dark, ${views.length} views at 20-700 m head on and 40 deg off, the dark, panes and frames in all six orders after and before the rest: with the stack ${PANE_STACK_UNITS_PER_LAYER} depth steps a layer, every order draws the same pixels and no dark shows; without it ${fights.length} views fight (up to ${Math.max(...fights.map((r) => r.control.stackOrder))} px); at 20 m the layers change nothing (${report.renderer}) PASS`);
}
