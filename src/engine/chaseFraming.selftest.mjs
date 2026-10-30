// battle-camera-264 (owner 2026-10-28: "center tank in the battle hud more, make it less covered by the ui by default, but
// be able to change and alter this camera angle as u like in settins"): the chase framing (chaseFraming.ts).
//  1. The defaults are pinned: the settings' defaults and ranges, the reference pose, the base pose without bands.
//  2. Over every supported layout's recorded bands (tools/fixtures/hud-chase-bands.json, battleHudLayout's published
//     bands on the layout fixture), for a main battle tank and the fleet's extremes: the hull and tracks keep clear of the
//     HUD's bottom band with air under them, the roof stays under the sight, the risen sight's ring stays under the head
//     band and inside the layout's rise cap, and the tank sits higher than the base pose put it.
//  3. The first battles' controls strip (transient) never moves the sight: the camera draws back over it.
//  4. The solver's projection is three.js's: a PerspectiveCamera at the framed pose with the lens shift sees the same box.
//  5. Each setting moves the picture the way its label says, and stored values clamp into range.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  CHASE_BASE_DISTANCE_M, CHASE_BASE_PIVOT_M, CHASE_CAMERA_DEFAULTS, CHASE_CAMERA_RANGES, CHASE_PITCH_RAD, NOMINAL_CHASE_TANK,
  chaseFloorAt, chaseFloorMarginPx, chaseSightClearPx, chaseTankFromDims, clampChaseSetting, normalizeChaseSettings,
  solveChaseFraming,
} from './chaseFraming.ts';

const RECORDED = JSON.parse(readFileSync(new URL('../../tools/fixtures/hud-chase-bands.json', import.meta.url), 'utf8'));
const SUPPORTED = ['1920x1080', '1440x900', '1280x720', '1180x820', '820x1180', '390x844', '844x390'];
// a main battle tank, a long-hulled one with a rear turret's reach, a tall one, a small light tank
const TANKS = {
  nominal: NOMINAL_CHASE_TANK,
  long: chaseTankFromDims({ heightM: 2.6, widthM: 3.8, hullLengthM: 9.2 }, -0.6),
  tall: chaseTankFromDims({ heightM: 3.2, widthM: 3.5, hullLengthM: 7.0 }),
  light: chaseTankFromDims({ heightM: 2.0, widthM: 2.8, hullLengthM: 5.5 }),
};

// 1. the pins
assert.deepEqual({ ...CHASE_CAMERA_DEFAULTS },
  { cameraHeight: 0, cameraDistance: 1, cameraShoulder: 'centre', cameraFraming: 0, cameraFov: 60 }, 'the settings default to no offsets');
assert.deepEqual(CHASE_CAMERA_RANGES, { cameraHeight: [-1.5, 3], cameraDistance: [0.7, 1.6], cameraFraming: [-0.1, 0.2], cameraFov: [50, 80] });
assert.equal(CHASE_PITCH_RAD, -10 * Math.PI / 180, 'the reference pose is the battle-start look');
assert.equal(CHASE_BASE_DISTANCE_M, 13);
assert.equal(CHASE_BASE_PIVOT_M, 1);
{
  const base = solveChaseFraming(1920, 1080, null);
  assert.deepEqual([base.pivotAboveM, base.distanceM, base.fovDeg, base.shoulderM, base.shift, base.sightShiftPx, base.tank],
    [1, 13, 60, 0, 0, 0, null], 'without bands: the base pose (the rig before the HUD measures, and Node receipts)');
  // bands measured for another window are stale
  const other = RECORDED.sizes['1440x900'].idle;
  assert.equal(solveChaseFraming(1920, 1080, other).shift, 0, 'stale bands: the base pose');
}

/** The reference pose's tank box through three.js: the camera `distanceM` back from the pivot `pivotAboveM` over the
 *  roof at the -10 degree look, `shoulderM` to the screen's right, its lens raised by `shift` (setViewOffset). */
function threeBox(w, h, tank, { pivotAboveM, distanceM, fovDeg = 60, shoulderM = 0, shift = 0 }) {
  const camera = new PerspectiveCamera(fovDeg, w / h, 0.1, 2000);
  const forward = new Vector3(0, Math.sin(CHASE_PITCH_RAD), Math.cos(CHASE_PITCH_RAD));
  camera.position.set(0, tank.heightM + pivotAboveM, 0).addScaledVector(forward, -distanceM).add(new Vector3(-shoulderM, 0, 0));
  camera.lookAt(camera.position.clone().add(forward));
  // (as cameraRig.ts applyLens writes it: setViewOffset would set the aspect to 1)
  if (shift) { camera.view = { enabled: true, fullWidth: 1, fullHeight: 1, offsetX: 0, offsetY: shift, width: 1, height: 1 }; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld(true);
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let i = 0; i < 8; i++) {
    const p = new Vector3(i & 1 ? tank.widthM / 2 : -tank.widthM / 2, i & 2 ? tank.heightM : 0, i & 4 ? tank.frontM : -tank.rearM).project(camera);
    const sx = (p.x + 1) / 2 * w, sy = (1 - p.y) / 2 * h;
    box.x0 = Math.min(box.x0, sx); box.x1 = Math.max(box.x1, sx); box.y0 = Math.min(box.y0, sy); box.y1 = Math.max(box.y1, sy);
  }
  return { box, camera, forward };
}
/** The chase before 264: the pivot 1 m over the roof, 13 m back, no lens shift. */
const baseBox = (w, h, tank) => threeBox(w, h, tank, { pivotAboveM: 1, distanceM: 13 }).box;

// 2. every layout: clear of the band, under the sight, inside the head band and the rise cap
const summary = [];
for (const size of SUPPORTED) {
  const states = RECORDED.sizes[size];
  assert.ok(states?.idle, `${size}: bands recorded`);
  for (const [state, bands] of Object.entries(states)) {
    const { width: w, height: h } = bands;
    for (const [name, tank] of Object.entries(TANKS)) {
      const f = solveChaseFraming(w, h, bands, null, tank);
      const t = f.tank;
      const where = `${size} ${state} ${name}`;
      const floor = chaseFloorAt(bands, t.x0, t.x1);
      assert.ok(t.y1 <= floor - chaseFloorMarginPx(h) + 0.5,
        `${where}: the hull and tracks keep clear of the bottom band (${t.y1.toFixed(0)} under ${floor} - ${chaseFloorMarginPx(h)})`);
      assert.ok(t.y1 <= h * 0.84 + 0.5, `${where}: the tracks never sit low in the picture (${(t.y1 / h).toFixed(3)})`);
      const sightY = h / 2 - f.sightShiftPx;
      // (a main battle tank keeps the whole clear zone; where a fleet extreme, or the strip while it shows, leaves no fit the
      // tracks clear first and the roof may come into the zone, never to the resting ring: 11 px, its stroke and halo)
      const clearPx = state === 'idle' && name === 'nominal' ? chaseSightClearPx(h) : 14;
      assert.ok(t.y0 >= sightY + clearPx - 0.5, `${where}: the roof stays under the sight (${t.y0.toFixed(0)} vs ${sightY})`);
      assert.ok(f.sightShiftPx >= 0 && f.sightShiftPx <= h * 0.14 + 1e-6, `${where}: the rise is bounded (${f.sightShiftPx})`);
      assert.ok(f.sightShiftPx <= (bands.riseCap ?? Infinity), `${where}: the layout's rise cap holds`);
      assert.ok(sightY - 0.15 * Math.min(w, h) >= bands.ceiling, `${where}: the widest ring stays under the head band`);
      assert.ok(f.distanceM >= CHASE_BASE_DISTANCE_M && f.distanceM <= 19.5, `${where}: the distance stays in its range (${f.distanceM})`);
      // never lower than the base pose had it, and higher (more central) wherever the base pose was covered or low
      const before = baseBox(w, h, tank);
      const centre = (t.y0 + t.y1) / 2, beforeCentre = (before.y0 + before.y1) / 2;
      assert.ok(centre <= beforeCentre + 0.5 || before.y0 < sightY + chaseSightClearPx(h),
        `${where}: the tank sits no lower than it did (unless its roof met the sight there)`);
      // (covered: the base pose's tracks a few px or more into the band's margin, or under the composition's line)
      const covered = before.y1 > chaseFloorAt(bands, before.x0, before.x1) - chaseFloorMarginPx(h) + 4 || before.y1 > h * 0.84 + 4;
      if (covered) assert.ok(centre < beforeCentre - 1, `${where}: covered or low before, the tank sits higher now`);
      // (a tenth of the window for a main battle tank, its share for a narrower hull; the strip's draw-back is brief)
      if (state === 'idle') assert.ok((t.x1 - t.x0) / w >= 0.1 * tank.widthM / NOMINAL_CHASE_TANK.widthM,
        `${where}: the tank keeps a readable width (${((t.x1 - t.x0) / w).toFixed(3)})`);
      if (name === 'nominal') {
        summary.push(`${size}${state === 'idle' ? '' : `+${state}`} ${f.distanceM.toFixed(2)}m pivot ${f.pivotAboveM.toFixed(2)} rise ${f.sightShiftPx.toFixed(0)}px`);
      }
    }
  }
}

// 3. the controls strip (transient) never moves the sight: the camera draws back over it
for (const size of SUPPORTED) {
  const { idle, hints } = RECORDED.sizes[size];
  if (!hints) continue;
  assert.ok(hints.transient?.length, `${size}: the strip was recorded as transient`);
  const steady = solveChaseFraming(idle.width, idle.height, idle);
  const strip = solveChaseFraming(hints.width, hints.height, hints);
  assert.equal(strip.sightShiftPx, steady.sightShiftPx, `${size}: the sight holds its place while the strip shows`);
  assert.ok(strip.distanceM >= steady.distanceM, `${size}: the camera draws back over the strip`);
  assert.ok(strip.tank.y1 <= chaseFloorAt(hints, strip.tank.x0, strip.tank.x1) - chaseFloorMarginPx(hints.height) + 0.5,
    `${size}: the tracks clear the strip while it shows`);
}

// 4. the projection is three's: a camera at the framed pose, its lens shifted by setViewOffset, sees the same box
for (const size of ['1920x1080', '844x390', '820x1180']) {
  const bands = RECORDED.sizes[size].idle;
  for (const settings of [null, { cameraShoulder: 'right', cameraFraming: 0.05, cameraFov: 70 }]) {
    const f = solveChaseFraming(bands.width, bands.height, bands, settings);
    const { box, camera, forward } = threeBox(bands.width, bands.height, NOMINAL_CHASE_TANK, f);
    for (const [k, v] of Object.entries(box)) {
      assert.ok(Math.abs(v - f.tank[k]) < 0.5, `${size} ${settings ? 'set' : 'default'}: three sees the solver's ${k} (${v} vs ${f.tank[k]})`);
    }
    // the aim ray is the camera's axis: three projects a point on it to the lens-shifted centre, where hud.ts paints the sight
    const aim = camera.position.clone().addScaledVector(forward, 300).project(camera);
    assert.ok(Math.abs(aim.x) < 1e-6 && Math.abs(aim.y - 2 * f.shift) < 1e-6, `${size}: the axis lands on the published sight`);
    assert.ok(Math.abs((1 - aim.y) / 2 * bands.height - (bands.height / 2 - f.sightShiftPx)) < 1e-6, `${size}: sight px agree`);
  }
}

// 5. the settings over the default, each as its label says
{
  const bands = RECORDED.sizes['1920x1080'].idle;
  const at = (settings) => solveChaseFraming(1920, 1080, bands, settings);
  const d = at(null);
  const higher = at({ cameraHeight: 1 });
  assert.ok(Math.abs(higher.pivotAboveM - d.pivotAboveM - 1) < 1e-9 && higher.tank.y0 > d.tank.y0, 'height: the camera rides higher, the tank lower');
  const farther = at({ cameraDistance: 1.5 });
  assert.ok(Math.abs(farther.distanceM - d.distanceM * 1.5) < 1e-9 && farther.tank.x1 - farther.tank.x0 < d.tank.x1 - d.tank.x0,
    'distance: the default step farther, the tank smaller');
  const right = at({ cameraShoulder: 'right' }), left = at({ cameraShoulder: 'left' });
  assert.ok((right.tank.x0 + right.tank.x1) / 2 < 960 - 100 && (left.tank.x0 + left.tank.x1) / 2 > 960 + 100,
    'shoulder: over the right shoulder the tank sits left of the sight, over the left it sits right');
  assert.equal(right.sightShiftPx, d.sightShiftPx, 'the shoulder leaves the sight where it is');
  const framed = at({ cameraFraming: 0.1 });
  assert.ok(Math.abs(framed.sightShiftPx - d.sightShiftPx - 108) < 1e-6 && Math.abs(framed.tank.y0 - (d.tank.y0 - 108)) < 1e-6,
    'framing: the picture and the sight rise together by its share of the height');
  const wide = at({ cameraFov: 75 });
  assert.ok(wide.fovDeg === 75 && wide.tank.x1 - wide.tank.x0 < d.tank.x1 - d.tank.x0, 'field of view: a wider lens, a smaller tank');
  // the settings apply over the bands' default, never re-fitted (the player's choice stands)
  assert.equal(at({ cameraHeight: 3 }).distanceM, d.distanceM);
}
assert.equal(clampChaseSetting('cameraFov', 200), 80);
assert.equal(clampChaseSetting('cameraHeight', -9), -1.5);
assert.equal(clampChaseSetting('cameraDistance', 'x'), 1, 'NaN: the default');
assert.deepEqual(normalizeChaseSettings({ cameraShoulder: 'up', cameraFraming: 0.5 }),
  { ...CHASE_CAMERA_DEFAULTS, cameraFraming: 0.2 }, 'an unknown shoulder falls back, a framing clamps');

// The A/B switch (`?chaseFraming=0`, combatAimComposition.ts): without bands the solve is the chase camera as it stood
// before the framing (262: 13 m back, 1.0 m over the turret, 60 degrees, no lens), at every window shape (32:9 included)
for (const [w, h] of [[3840, 1080], [1728, 1117], [1920, 1080], [390, 844]]) {
  const base = solveChaseFraming(1000 * w / h, 1000, null, null);
  assert.deepEqual([base.pivotAboveM, base.distanceM, base.fovDeg, base.shift, base.sightShiftPx, base.shoulderM], [1, 13, 60, 0, 0, 0],
    `${w}x${h}: no bands, 262's chase camera`);
}
{
  const source = readFileSync(new URL('../app/combatAimComposition.ts', import.meta.url), 'utf8');
  assert.match(source, /!\/\[\?&\]chaseFraming=0\(&\|\$\)\/\.test\(location\.search \?\? ''\)/, 'the URL switch');
  assert.match(source, /getChaseBands: CHASE_FRAMING \? battleBands : \(\) => null,/, 'off, the rig sees no bands');
}

console.log(`chaseFraming.selftest: defaults pinned; ${SUPPORTED.length} layouts x ${Object.keys(TANKS).length} tanks clear the band under the sight; `
  + `the strip moves no sight; three agrees; settings act as labelled (${summary.join('; ')})`);
