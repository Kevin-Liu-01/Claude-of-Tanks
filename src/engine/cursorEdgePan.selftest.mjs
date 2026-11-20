import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { createCameraRig } from './cameraRig.ts';
import { cursorEdgePan, edgeBandDepth, EDGE_PAN_BAND } from './cursorEdgePan.ts';
import { createChromePointerLockPage } from '../game/chromePointerLockPage.test-support.mjs';
import { createPlayerFrameInput } from '../game/playerFrameInput.ts';
import { A11Y } from '../ui/accessibilityPreferences.ts';

// cursor-aim-pan-274 (tutorial-journey 272, runs 4 and 5): without pointer lock the gun aims through the cursor and the
// mouse gives no deltas, so the view never turned: a cursor at the screen edge held the aim error constant and a target
// behind the tank could not be brought into view. A cursor in an edge band now pans the view toward that side, in the
// chase view and the sight (the sight's rate divided by its zoom), and stops when it leaves the band or the page. The
// page (chromePointerLockPage.test-support.mjs) runs the real input layer, playerFrameInput and the camera rig.

const DT = 1 / 60;
const W = 1280, H = 800; // the fake canvas
const BASE_SENS = 0.0022; // cameraRig.ts: rad per mouse px
A11Y.shake = 0; // the sight's idle sway off: the camera moves only as the player aims it

// 1. The band itself: dead inside, eased, signed, full at the edge, rate divided by zoom.
{
  assert.equal(edgeBandDepth(0), 0);
  assert.equal(edgeBandDepth(1 - EDGE_PAN_BAND), 0, 'the band\'s inner edge does not pan');
  assert.equal(edgeBandDepth(Number.NaN), 0);
  assert.equal(edgeBandDepth(1), 1);
  assert.equal(edgeBandDepth(-1), -1);
  const mid = edgeBandDepth(1 - EDGE_PAN_BAND / 2);
  assert.ok(mid > 0 && mid < 0.5, `depth eases in (${mid})`);
  const chase = cursorEdgePan(1, 0, DT, 1, { yaw: 0, pitch: 0 });
  const sight = cursorEdgePan(1, 0, DT, 4, { yaw: 0, pitch: 0 });
  assert.ok(chase.yaw < 0, 'screen-right is a yaw decrease');
  assert.equal(chase.pitch, 0);
  assert.ok(Math.abs(sight.yaw * 4 - chase.yaw) < 1e-15, 'the sight pans at the chase rate divided by its zoom');
  assert.ok(cursorEdgePan(0, 1, DT, 1, { yaw: 0, pitch: 0 }).pitch > 0, 'screen-up is a pitch increase');
  assert.deepEqual(cursorEdgePan(1, 1, 0, 1, { yaw: 9, pitch: 9 }), { yaw: -0, pitch: 0 }, 'no time, no turn');
  assert.deepEqual(cursorEdgePan(1, 0, 5, 1, { yaw: 0, pitch: 0 }), cursorEdgePan(1, 0, 0.1, 1, { yaw: 0, pitch: 0 }),
    'a render hitch turns no further than 0.1 s');
}

function createScene() {
  const camera = new PerspectiveCamera(60, W / H, 0.1, 2000);
  const root = new Object3D();
  root.updateMatrixWorld(true);
  const player = {
    state: { pos: new Vector3(), yaw: 0, turretYaw: 0 },
    input: { aimPoint: new Vector3(), throttle: 0, steer: 0, brake: false, fire: false, shellSlot: 0 },
    combat: {},
    visual: {
      root,
      turretTopWorld: (out) => out.set(0, 2, 0).applyMatrix4(root.matrixWorld),
      gunPivotWorld: (out) => out.set(0, 1.7, 0.2).applyMatrix4(root.matrixWorld),
    },
  };
  const rig = createCameraRig(camera, {
    heightField: { getHeightAt: () => 0 }, raycast: () => null, getPlayer: () => player,
  });
  return { camera, rig, player };
}

const _dir = new Vector3();
const viewYaw = (camera) => { camera.getWorldDirection(_dir); return Math.atan2(_dir.x, _dir.z); };
const viewPitch = (camera) => { camera.getWorldDirection(_dir); return Math.asin(_dir.y); };

/** One rendered frame: the page's input through playerFrameInput into the rig, as mainFrameRuntime runs it. */
function frame(page, frameInput, scene) {
  const cam = frameInput.poll({ dtSeconds: DT, inBattle: true, paused: false, killcamActive: false,
    cameraLocked: false, rigMode: scene.rig.mode, player: scene.player });
  scene.rig.update(DT, cam);
  return cam;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// 2. Cursor aim (a sandboxed pane: requestPointerLock throws), chase view and sight.
{
  const page = createChromePointerLockPage({ lock: 'sandboxed' });
  try {
    page.input.requestLock();
    assert.equal(page.input.isCursorAim(), true, 'a sandboxed pane aims with the cursor');
    const frameInput = createPlayerFrameInput({ input: page.input, hasAmmo: () => true, forceFire: () => false });
    const scene = createScene();
    const { camera, rig } = scene;
    rig.snapArcade(2, 0, -0.1);

    // chase: cursor at the right edge turns the view right (yaw decreases), steadily, frame after frame
    page.mouse('mousemove', page.canvas, W - 1, H / 2);
    let cam = frame(page, frameInput, scene);
    assert.equal(cam.cursorAim, true);
    assert.equal(cam.cursorPan, true, 'cursor aim with the cursor on the page may pan');
    const ndcX = cam.cursorX;
    assert.ok(ndcX > 1 - EDGE_PAN_BAND, `the cursor sits in the right band (${ndcX})`);
    const perFrame = cursorEdgePan(ndcX, 0, DT, 1, { yaw: 0, pitch: 0 }).yaw;
    for (let i = 0; i < 20; i++) frame(page, frameInput, scene);
    let yaw0 = viewYaw(camera);
    for (let i = 0; i < 30; i++) frame(page, frameInput, scene);
    let turned = viewYaw(camera) - yaw0;
    assert.ok(turned < 0, `chase: a cursor at the right edge turns the view right (${turned})`);
    assert.ok(Math.abs(turned - perFrame * 30) < 1e-6, `chase: at the band's rate (${turned} vs ${perFrame * 30})`);

    // the view can come all the way round: a target behind the tank is reachable
    let walked = 0, last = viewYaw(camera);
    for (let i = 0; i < 120; i++) {
      frame(page, frameInput, scene);
      const now = viewYaw(camera);
      walked += Math.atan2(Math.sin(now - last), Math.cos(now - last));
      last = now;
    }
    assert.ok(walked < -Math.PI * 0.75, `chase: two seconds at the edge turn the view most of a half turn (${walked})`);

    // left edge: the other way
    page.mouse('mousemove', page.canvas, 0, H / 2);
    frame(page, frameInput, scene);
    yaw0 = viewYaw(camera);
    for (let i = 0; i < 10; i++) frame(page, frameInput, scene);
    assert.ok(viewYaw(camera) - yaw0 > 0, 'chase: a cursor at the left edge turns the view left');

    // out of the band: the view holds
    page.mouse('mousemove', page.canvas, W * 0.8, H / 2);
    frame(page, frameInput, scene);
    yaw0 = viewYaw(camera);
    for (let i = 0; i < 30; i++) frame(page, frameInput, scene);
    assert.ok(Math.abs(viewYaw(camera) - yaw0) < 1e-9, 'chase: the pan stops when the cursor leaves the band');

    // pitch: top band raises the view, bottom band lowers it, inside the rig's limits
    page.mouse('mousemove', page.canvas, W / 2, 0);
    frame(page, frameInput, scene);
    const pitch0 = viewPitch(camera);
    for (let i = 0; i < 10; i++) frame(page, frameInput, scene);
    assert.ok(viewPitch(camera) > pitch0, 'chase: a cursor at the top edge raises the view');
    for (let i = 0; i < 600; i++) frame(page, frameInput, scene);
    const topPitch = viewPitch(camera);
    for (let i = 0; i < 60; i++) frame(page, frameInput, scene);
    assert.ok(Math.abs(viewPitch(camera) - topPitch) < 1e-9 && topPitch < 0.6, 'chase: the pitch pan stops at its limit');
    page.mouse('mousemove', page.canvas, W / 2, H - 1);
    frame(page, frameInput, scene);
    const pitch1 = viewPitch(camera);
    for (let i = 0; i < 10; i++) frame(page, frameInput, scene);
    assert.ok(viewPitch(camera) < pitch1, 'chase: a cursor at the bottom edge lowers the view');

    // the cursor leaves the page (an embedded pane's host): the pan stops; back over the battle, it resumes
    page.mouse('mousemove', page.canvas, W - 1, H / 2);
    frame(page, frameInput, scene);
    page.mouse('mouseout', page.canvas, W - 1, H / 2); // no relatedTarget: left the page
    cam = frame(page, frameInput, scene);
    assert.equal(cam.cursorAim, true, 'the aim still runs through the last cursor point');
    assert.equal(cam.cursorPan, false, 'a cursor off the page never pans');
    yaw0 = viewYaw(camera);
    for (let i = 0; i < 30; i++) frame(page, frameInput, scene);
    assert.ok(Math.abs(viewYaw(camera) - yaw0) < 1e-9, 'chase: a cursor parked off the page never spins the view');
    page.mouse('mousemove', page.canvas, W - 1, H / 2);
    yaw0 = viewYaw(camera);
    for (let i = 0; i < 5; i++) frame(page, frameInput, scene);
    assert.ok(viewYaw(camera) < yaw0, 'chase: back over the battle at the edge, the pan resumes');

    // sight x4: the view turns at the chase rate divided by the zoom; camera yaw is aimYaw + PI exactly
    rig.snapSniper(4, 0.3, -0.05);
    assert.equal(rig.mode, 'SNIPER');
    page.mouse('mousemove', page.canvas, W - 1, H / 2);
    frame(page, frameInput, scene);
    const sightYaw0 = camera.rotation.y;
    for (let i = 0; i < 30; i++) frame(page, frameInput, scene);
    const sightTurned = camera.rotation.y - sightYaw0;
    const sightRate = cursorEdgePan(ndcX, 0, DT, 4, { yaw: 0, pitch: 0 }).yaw;
    assert.ok(sightTurned < 0, `sight: a cursor at the right edge turns the sight right (${sightTurned})`);
    assert.ok(Math.abs(sightTurned - sightRate * 30) < 1e-9, `sight: at the chase rate / zoom (${sightTurned} vs ${sightRate * 30})`);
    assert.ok(Math.abs(sightRate * 4 - perFrame) < 1e-15);
    page.mouse('mousemove', page.canvas, 0, H / 2);
    frame(page, frameInput, scene);
    const sightYaw1 = camera.rotation.y;
    for (let i = 0; i < 10; i++) frame(page, frameInput, scene);
    assert.ok(camera.rotation.y > sightYaw1, 'sight: a cursor at the left edge turns the sight left');
    page.mouse('mousemove', page.canvas, W / 2 + 100, H / 2 - 50);
    frame(page, frameInput, scene);
    const held = [camera.rotation.x, camera.rotation.y];
    for (let i = 0; i < 30; i++) frame(page, frameInput, scene);
    assert.ok(Object.is(camera.rotation.x, held[0]) && Object.is(camera.rotation.y, held[1]),
      'sight: the pan stops when the cursor leaves the band');
    frameInput.dispose();
  } finally {
    page.restore();
  }
}

// 3. Pointer lock: the rig's angles move only with the mouse deltas, bit for bit, wherever the cursor sat.
{
  const page = createChromePointerLockPage({ lock: 'chrome' });
  try {
    page.mouse('mousemove', page.canvas, W - 1, H / 2);
    page.input.requestLock();
    await flush();
    assert.equal(page.input.isLocked(), true);
    page.mouse('mousemove', page.canvas, W - 1, 0); // a locked page still reports clientX/Y
    const frameInput = createPlayerFrameInput({ input: page.input, hasAmmo: () => true, forceFire: () => false });
    const scene = createScene();
    const cam = frame(page, frameInput, scene);
    assert.equal(cam.cursorAim, false);
    assert.equal(cam.cursorPan, false, 'pointer lock never edge-pans');
    frameInput.dispose();
  } finally {
    page.restore();
  }
  // A locked frame carrying stray cursor fields (cursorAim false) moves the rig exactly as the pre-274 frame shape.
  const deltas = [3, -7, 12.5, 0, -1, 40, -22, 5, 0.25, -0.75];
  for (const [mode, zoom] of [['ARCADE', 1], ['SNIPER', 4]]) {
    const plain = createScene();
    const stray = createScene();
    for (const scene of [plain, stray]) {
      if (mode === 'SNIPER') scene.rig.snapSniper(zoom, 0.2, -0.04);
      else scene.rig.snapArcade(2, 0.2, -0.1);
    }
    let expectYaw = 0.2;
    for (let i = 0; i < deltas.length; i++) {
      const base = { mouseDX: deltas[i], mouseDY: deltas[deltas.length - 1 - i], wheel: 0, rmb: false, shiftPressed: false };
      plain.rig.update(DT, base);
      stray.rig.update(DT, { ...base, aimHold: false, cursorAim: false, cursorX: 1, cursorY: -1, cursorPan: true });
      expectYaw += deltas[i] * (mode === 'SNIPER' ? BASE_SENS / zoom : BASE_SENS);
    }
    assert.deepEqual(stray.camera.matrixWorld.elements, plain.camera.matrixWorld.elements,
      `${mode}: a locked frame's pose ignores the cursor, bit for bit`);
    assert.deepEqual(stray.player.input.aimPoint.toArray(), plain.player.input.aimPoint.toArray(),
      `${mode}: and so does its aim point`);
    if (mode === 'SNIPER') {
      assert.ok(Object.is(plain.camera.rotation.y, expectYaw + Math.PI),
        `sight: aimYaw is the plain sum of mouse deltas x sensitivity / zoom (${plain.camera.rotation.y - Math.PI} vs ${expectYaw})`);
    }
  }
}

// 4. Touch layouts never aim with the cursor and never edge-pan: the synthetic mouse a tap leaves sits on its button.
{
  const page = createChromePointerLockPage({ lock: 'none', input: 'coarse' });
  try {
    page.input.requestLock();
    const frameInput = createPlayerFrameInput({ input: page.input, hasAmmo: () => true, forceFire: () => false });
    const scene = createScene();
    scene.rig.snapArcade(2, 0, -0.1);
    page.mouse('mousemove', page.canvas, W - 1, 0);
    let cam = frame(page, frameInput, scene);
    assert.equal(cam.cursorAim, false, 'touch: no cursor aim');
    assert.equal(cam.cursorPan, false, 'touch: no edge pan');
    const yaw0 = viewYaw(scene.camera);
    const pitch0 = viewPitch(scene.camera);
    for (let i = 0; i < 30; i++) cam = frame(page, frameInput, scene);
    assert.ok(Math.abs(viewYaw(scene.camera) - yaw0) < 1e-9 && Math.abs(viewPitch(scene.camera) - pitch0) < 1e-9,
      'touch: a tap left at the screen corner never turns the view');
    frameInput.dispose();
  } finally {
    page.restore();
  }
}

console.log('cursorEdgePan selftest: PASS');
