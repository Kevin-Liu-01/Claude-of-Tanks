// src/ui/damagePanelMarkers.selftest.mjs — the damage panel's marker receipt
// (owner rule 2026-09-25): every module/crew marker sits exactly on its hull-
// or turret-space anchor projected through its layer's rotation, co-located
// markers overlap instead of being pushed apart, and every icon is painted
// upright in panel space, never rotated with its layer. Headless: the REAL
// panel is driven through 120 rotating poses on a stub DOM whose Canvas2D
// context tracks the current transform of every primitive it is asked to draw.
import assert from 'node:assert/strict';
import { createDamagePanel } from './damagePanel.ts';

// ---------------------------------------------------------------------------
// stub DOM + transform-tracking Canvas2D
// ---------------------------------------------------------------------------
function fakeElement(tag) {
  const selected = new Map();
  const element = {
    tagName: tag.toUpperCase(), id: '', className: '', textContent: '', innerHTML: '',
    style: {}, dataset: {}, children: [],
    appendChild(child) { element.children.push(child); return child; },
    querySelector(selector) {
      let found = selected.get(selector);
      if (!found) { found = fakeElement('span'); selected.set(selector, found); }
      return found;
    },
  };
  return element;
}

function passiveContext() {
  return new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
    set: (target, key, value) => { target[key] = value; return true; },
  });
}

/** Records every primitive with the current transform (a,b,c,d,e,f) and the save-frame it sits in. */
function trackingContext() {
  const records = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const frames = [];
  let nextFrame = 0;
  const multiply = (a, b, c, d, e, f) => {
    const [A, B, C, D, E, F] = matrix;
    matrix = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  };
  const record = (op) => records.push({ op, frame: frames.at(-1) ?? -1, ctm: matrix.slice() });
  const context = {
    records,
    save() { stack.push(matrix.slice()); frames.push(nextFrame++); },
    restore() { matrix = stack.pop() ?? matrix; frames.pop(); },
    setTransform(a, b, c, d, e, f) { matrix = [a, b, c, d, e, f]; record('setTransform'); },
    translate(x, y) { multiply(1, 0, 0, 1, x, y); record('translate'); },
    rotate(angle) { multiply(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0); record('rotate'); },
    scale(x, y) { multiply(x, 0, 0, y, 0, 0); record('scale'); },
  };
  for (const op of ['moveTo', 'lineTo', 'arcTo', 'arc', 'ellipse', 'rect', 'fill', 'stroke', 'fillRect',
    'strokeRect', 'clearRect', 'drawImage', 'fillText', 'strokeText']) context[op] = () => record(op);
  for (const op of ['beginPath', 'closePath', 'setLineDash', 'clip']) context[op] = () => {};
  return context;
}

function fakeCanvas(context) {
  const canvas = fakeElement('canvas');
  canvas.width = 0;
  canvas.height = 0;
  canvas.getContext = (kind) => { assert.equal(kind, '2d'); return context; };
  return canvas;
}

const saved = new Map(['document', 'window'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let panelContext = null;
const installDom = () => {
  let canvases = 0;
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: {
      head: fakeElement('head'),
      getElementById: () => null,
      createElement(kind) {
        if (kind !== 'canvas') return fakeElement(kind);
        // the first canvas is the panel stage; tint copies are passive
        const context = canvases++ === 0 ? trackingContext() : passiveContext();
        if (canvases === 1) panelContext = context;
        return fakeCanvas(context);
      },
    } },
    window: { configurable: true, value: {} },
  });
};

// ---------------------------------------------------------------------------
// fixture: two co-located hull modules, two co-located turret modules, two
// co-located turret crew, plus one lone hull module and one lone hull crew
// ---------------------------------------------------------------------------
const spec = {
  id: 'receipt-tank', hp: 1000,
  dims: { hullLengthM: 7, widthM: 3.6, overallLengthM: 9.5 },
  armor: {
    turretPivot: [0, 1.4, -0.3],
    gunBarrel: { lengthM: 5 },
    modules: [
      { module: 'engine', min: [-0.6, 0, -2.4], max: [0.6, 1, -1.2] },
      { module: 'fuelTank', min: [-0.6, 0, -2.4], max: [0.6, 1, -1.2] },
      { module: 'ammoRack', min: [0.2, 0, 0.4], max: [0.8, 1, 1.2] },
      { module: 'gun', min: [-0.1, 0, 0.2], max: [0.1, 1, 3], turretLocal: true },
      { module: 'optics', min: [-0.1, 0, 0.2], max: [0.1, 1, 3], turretLocal: true },
      { module: 'trackL', min: [-1.8, 0, -3.5], max: [-1.4, 1, 3.5] },
    ],
    crew: [
      { crew: 'driver', min: [-0.4, 0.4, 1.4], max: [0.4, 1.2, 2.2] },
      { crew: 'gunner', min: [0.2, 0, -0.5], max: [0.6, 0.8, 0.1], turretLocal: true },
      { crew: 'loader', min: [0.2, 0, -0.5], max: [0.6, 0.8, 0.1], turretLocal: true },
    ],
  },
};
const anchorNames = ['engine', 'fuelTank', 'ammoRack', 'gun', 'optics', 'driver', 'gunner', 'loader'];
const anchorPoints = {
  engine: [0, -1.8], fuelTank: [0, -1.8], ammoRack: [0.5, 0.8], gun: [0, 1.6], optics: [0, 1.6],
  driver: [0, 1.8], gunner: [0.4, -0.2], loader: [0.4, -0.2],
};
const turretLocal = new Set(['gun', 'optics', 'gunner', 'loader']);
const coLocated = [['engine', 'fuelTank'], ['gun', 'optics'], ['gunner', 'loader']];

function healthyCombat() {
  const modules = {};
  for (const volume of spec.armor.modules) modules[volume.module] = { hp: 1, maxHp: 1, state: 'ok', repairT: 0 };
  const crew = {};
  for (const station of spec.armor.crew) crew[station.crew] = true;
  return { hp: 1000, maxHp: 1000, destroyed: false, modules, crew, fire: { burning: false, tickTimer: 0, ticksLeft: 0 } };
}

const maskEntry = () => ({
  ready: true,
  hull: { canvas: fakeCanvas(passiveContext()), camX: 0, camZ: 0, halfM: 5, cx: 0.1, cz: -0.2, radiusM: 4, widthM: 3.6, lengthM: 7 },
  turret: { canvas: fakeCanvas(passiveContext()), camX: 0, camZ: -0.3, halfM: 4, radiusM: 3 },
  pivot: [0, -0.3],
  pxPerM: 19.2,
});

// ---------------------------------------------------------------------------
// geometry helpers (the panel's own convention: screen-right = -x, rotation
// by phi about the layer's anchor point; CW 142 x CH 138, 2x internal DPR)
// ---------------------------------------------------------------------------
const CW = 142, CH = 138, center = [CW / 2, CH / 2];
const rotate = ([x, y], angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
const add = ([x, y], [u, v]) => [x + u, y + v];
const sub = ([x, y], [u, v]) => [x - u, y - v];
const near = (p, q, label, tolerance = 1e-9) => assert.ok(
  Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolerance, `${label}: ${JSON.stringify(p)} vs ${JSON.stringify(q)}`);
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const rotationOf = (ctm) => Math.atan2(ctm[1], ctm[0]);

const FRAMES = 120;
const pose = (frame) => ({ hull: 0.3 + 0.05 * frame, turret: 0.03 * frame, cam: 0.3 + 0.01 * frame });
const hullPhi = (p) => p.cam - p.hull;
const gunPhi = (p) => p.cam - p.hull - p.turret;

/**
 * Drive the real panel through FRAMES poses in one mode and prove the marker
 * law: exact projection, no per-frame drift beyond the rotation, overlap
 * allowed, upright icons.
 */
function proveMode(mode, entry) {
  installDom();
  panelContext = null;
  const panel = createDamagePanel({
    maskSource: { get: () => entry, async prepare() { return entry; } },
    telemetry: null,
  });
  const ctx = panelContext;
  assert.ok(ctx, 'the panel stage canvas is the tracked context');
  const base = ctx.records.find((row) => row.op === 'setTransform');
  assert.ok(base && base.ctm[1] === 0 && base.ctm[2] === 0 && base.ctm[0] === base.ctm[3], 'the stage transform is a pure DPR scale');
  const dpr = base.ctm[0];

  panel.setTank(spec, null);
  assert.equal(panel.debugState().masksReady, mode === 'masks', `${mode}: mask readiness matches the mode`);
  const combat = healthyCombat();

  // hull content center and turret pivot the panel projects through
  const hullCenter = mode === 'masks' ? [entry.hull.cx, entry.hull.cz] : [0, 0];
  const pivot = mode === 'masks' ? entry.pivot : [spec.armor.turretPivot[0], spec.armor.turretPivot[2]];
  const expectedScale = mode === 'masks'
    ? (Math.min(CW, CH) / 2 - 4) / Math.max(1.5, Math.max(entry.hull.radiusM,
      Math.hypot(entry.pivot[0] - entry.hull.cx, entry.pivot[1] - entry.hull.cz) + Math.min(entry.turret.radiusM, entry.hull.radiusM * 1.05)))
    : (Math.min(CW, CH) / 2 - 6) / Math.max(1.5, Math.hypot(spec.dims.widthM / 2, spec.dims.hullLengthM / 2));

  const projectHull = (point, p, scale) => add(center, rotate([-(point[0] - hullCenter[0]) * scale, -(point[1] - hullCenter[1]) * scale], hullPhi(p)));
  const projectTurret = (point, p, scale) => add(projectHull(pivot, p, scale), rotate([-point[0] * scale, -point[1] * scale], gunPhi(p)));
  const expectedMarker = (name, p, scale) => (turretLocal.has(name) ? projectTurret : projectHull)(anchorPoints[name], p, scale);

  let scale = null;
  let previous = null;
  let uprightPrimitives = 0;
  let rotatedControls = 0;
  const readMarkers = () => {
    const state = panel.debugState();
    assert.deepEqual(state.markers.map((m) => m.name), anchorNames, `${mode}: every authored anchor is painted, in anchor order`);
    return Object.fromEntries(state.markers.map((m) => [m.name, [m.x, m.y]]));
  };

  for (let frame = 0; frame < FRAMES; frame++) {
    const p = pose(frame);
    panel.setPose(p.hull, p.turret, p.cam);
    ctx.records.length = 0;
    panel.update(combat);
    assert.ok(ctx.records.length > 0, `${mode}/${frame}: a new pose repaints the plan`);
    const state = panel.debugState();
    assert.ok(Math.abs(wrap(state.hullPhi - hullPhi(p))) < 1e-12 && Math.abs(wrap(state.gunPhi - gunPhi(p))) < 1e-12,
      `${mode}/${frame}: the panel reports the live layer rotations`);
    const marks = readMarkers();

    // 1. the panel's fit scale is derived once from frame 0 and pinned to the panel's own formula
    if (scale === null) {
      const hullOffset = sub(marks.ammoRack, center);
      const rotatedBack = rotate(hullOffset, -hullPhi(p));
      scale = -rotatedBack[0] / (anchorPoints.ammoRack[0] - hullCenter[0]);
      assert.ok(Math.abs(scale - expectedScale) < 1e-9, `${mode}: the fit scale is the panel's body fit (${scale} vs ${expectedScale})`);
    }

    // 2. exact projection through the layer rotation for every marker
    for (const name of anchorNames) near(marks[name], expectedMarker(name, p, scale), `${mode}/${frame}/${name}: exact projected anchor`);

    // 3. co-located anchors coincide — overlap is allowed, nothing pushes them apart
    for (const [a, b] of coLocated) assert.deepEqual(marks[a], marks[b], `${mode}/${frame}: ${a} and ${b} overlap exactly`);

    // 4. no drift between frames beyond the rotation itself: hull markers turn
    //    about the panel center by the hull-rotation delta, turret markers about
    //    the projected pivot by the gun-rotation delta, radii constant
    if (previous) {
      const dHull = hullPhi(p) - hullPhi(previous.pose);
      const dGun = gunPhi(p) - gunPhi(previous.pose);
      const pivotNow = projectHull(pivot, p, scale), pivotBefore = projectHull(pivot, previous.pose, scale);
      for (const name of anchorNames) {
        if (turretLocal.has(name)) {
          near(sub(marks[name], pivotNow), rotate(sub(previous.marks[name], pivotBefore), dGun), `${mode}/${frame}/${name}: turret marker follows only the gun rotation`);
          assert.ok(Math.abs(Math.hypot(...sub(marks[name], pivotNow)) - Math.hypot(...sub(previous.marks[name], pivotBefore))) < 1e-9,
            `${mode}/${frame}/${name}: constant radius about the pivot`);
        } else {
          near(sub(marks[name], center), rotate(sub(previous.marks[name], center), dHull), `${mode}/${frame}/${name}: hull marker follows only the hull rotation`);
          assert.ok(Math.abs(Math.hypot(...sub(marks[name], center)) - Math.hypot(...sub(previous.marks[name], center))) < 1e-9,
            `${mode}/${frame}/${name}: constant radius about the center`);
        }
      }
    }
    previous = { pose: p, marks };

    // 5. upright icons: every save-frame that scales is a pip (drawPip /
    //    drawCrewPip are the only callers of ctx.scale); all of its primitives
    //    carry a rotation-free transform whose translation is a marker point
    const pipFrames = [...new Set(ctx.records.filter((row) => row.op === 'scale').map((row) => row.frame))];
    assert.equal(pipFrames.length, anchorNames.length, `${mode}/${frame}: one upright pip per marker`);
    const markerPoints = anchorNames.map((name) => marks[name]);
    for (const id of pipFrames) {
      const rows = ctx.records.filter((row) => row.frame === id);
      assert.ok(rows.some((row) => row.op === 'fill' || row.op === 'fillRect' || row.op === 'arc'), `${mode}/${frame}: a pip paints something`);
      for (const row of rows) {
        if (row.op === 'translate' || row.op === 'scale') continue;
        assert.ok(Math.abs(rotationOf(row.ctm)) < 1e-12 && row.ctm[0] > 0 && row.ctm[3] > 0 && Math.abs(row.ctm[1]) < 1e-12 && Math.abs(row.ctm[2]) < 1e-12,
          `${mode}/${frame}: pip primitive ${row.op} is painted upright`);
        const point = [row.ctm[4] / dpr, row.ctm[5] / dpr];
        assert.ok(markerPoints.some((m) => Math.hypot(m[0] - point[0], m[1] - point[1]) < 1e-9),
          `${mode}/${frame}: pip primitive ${row.op} sits on a marker point`);
        uprightPrimitives++;
      }
    }

    // 6. control: the tracker does see rotation — the hull layer (stand-in
    //    plate or mask image) is painted rotated by exactly the hull phi
    const layerOp = mode === 'masks' ? 'drawImage' : 'arcTo';
    const rotatedLayer = ctx.records.filter((row) => row.op === layerOp && Math.abs(wrap(rotationOf(row.ctm) - hullPhi(p))) < 1e-9);
    assert.ok(rotatedLayer.length > 0, `${mode}/${frame}: the hull layer rotates with the hull while the pips stay upright`);
    rotatedControls += rotatedLayer.length;
  }

  // damaged states keep the same law: red engine + dead gunner repaint at the
  // same points, still upright, while the hit-zone flood rides the hull
  const last = pose(FRAMES - 1);
  combat.modules.engine.state = 'red';
  combat.crew.gunner = false;
  ctx.records.length = 0;
  panel.update(combat);
  const damaged = readMarkers();
  for (const name of anchorNames) near(damaged[name], previous.marks[name], `${mode}/damaged/${name}: damage never moves a marker`);
  const damagedPips = [...new Set(ctx.records.filter((row) => row.op === 'scale').map((row) => row.frame))];
  assert.equal(damagedPips.length, anchorNames.length);
  for (const row of ctx.records.filter((row) => damagedPips.includes(row.frame) && row.op !== 'translate' && row.op !== 'scale')) {
    assert.ok(Math.abs(rotationOf(row.ctm)) < 1e-12, `${mode}/damaged: ${row.op} stays upright`);
  }
  if (mode === 'masks') {
    const flood = ctx.records.filter((row) => row.op === 'arcTo' && Math.abs(wrap(rotationOf(row.ctm) - hullPhi(last))) < 1e-9);
    assert.ok(flood.length >= 4, `${mode}/damaged: the engine hit-zone flood is stamped in hull space`);
  }

  return { uprightPrimitives, rotatedControls };
}

try {
  const standIn = proveMode('stand-in', null);
  const masks = proveMode('masks', maskEntry());
  console.log(`damagePanelMarkers.selftest: ${FRAMES} poses x 2 modes — exact projection, overlap allowed, `
    + `${standIn.uprightPrimitives + masks.uprightPrimitives} upright pip primitives, `
    + `${standIn.rotatedControls + masks.rotatedControls} rotated layer controls`);
} finally {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
