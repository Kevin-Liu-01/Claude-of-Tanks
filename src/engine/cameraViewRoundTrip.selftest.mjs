// drone-aim-camera-274 (Kevin, 2026-11-18: "we trigger a drone in aiming view, when we return to aiming view its stuck in
// like a drone view hybrid"). Every view the player can hold goes out to a flight (the drone, launching then flying, and
// the gunship) or to another camera owner, and comes back to exactly the camera a rig that never left holds: position,
// rotation, field of view, lens shift, projection, the scope flag and the hull's visibility. Before the fix the rig's
// setFov and applyLens compared against their own caches, so a flight (which writes camera.fov itself, and set 60 on
// exit) left the x4 sight on a 60 degree lens; couch panes clearing camera.view on close left the chase's lens shift off.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { createCameraRig } from './cameraRig.ts';
import { NOMINAL_CHASE_TANK } from './chaseFraming.ts';

globalThis.document ??= { createElement: () => ({ style: {} }), body: { appendChild() {}, classList: { contains: () => false } } };
const recorded = JSON.parse(readFileSync(new URL('../../tools/fixtures/hud-chase-bands.json', import.meta.url), 'utf8'));
const bands = recorded.sizes['1280x720'].idle;
const idle = { mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false };
const DT = 1 / 60;

/** One rig on its own camera and hull. `view` picks the held view; the settings put the chase off the 60 degree lens. */
function setup(view) {
  const camera = new PerspectiveCamera(60, bands.width / bands.height, 0.1, 2000);
  const root = new Object3D();
  root.position.set(3, 0, -2);
  root.updateMatrixWorld(true);
  const player = {
    id: 'p1',
    state: { pos: root.position.clone(), yaw: 0.3, turretYaw: 0 },
    spec: { dims: { heightM: NOMINAL_CHASE_TANK.heightM, widthM: NOMINAL_CHASE_TANK.widthM, hullLengthM: 8.2 } },
    input: { aimPoint: new Vector3() },
    combat: { destroyed: false },
    aerial: null,
    visual: {
      root,
      turretTopWorld: (out) => out.set(0, NOMINAL_CHASE_TANK.heightM, 0).applyMatrix4(root.matrixWorld),
      gunPivotWorld: (out) => out.set(0, 2.1, 0.4).applyMatrix4(root.matrixWorld),
    },
  };
  const settings = { cameraHeight: 0, cameraDistance: 1, cameraShoulder: 'right', cameraFraming: 0, cameraFov: 72 };
  const rig = createCameraRig(camera, {
    heightField: { getHeightAt: () => -50 }, raycast: () => null, getPlayer: () => player,
    getIsometricView: () => view.iso === true, getChaseBands: () => bands, getCameraSettings: () => settings,
  });
  if (view.sniper) rig.snapSniper(view.sniper, 0.4, -0.06);
  else rig.snapArcade(2, 0.4, -0.12);
  return { camera, player, rig };
}

/** Everything a view is: where the camera is and points, its lens and projection, the scope flag, the hull shown. */
function viewState({ camera, player }) {
  camera.updateMatrixWorld(true);
  return {
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    fov: camera.fov,
    lens: camera.view?.enabled ? camera.view.offsetY : 0,
    projection: Array.from(camera.projectionMatrix.elements),
    scoped: camera.userData.scoped === true,
    hullVisible: player.visual.root.visible,
  };
}

function assertSameView(actual, expected, label) {
  for (const key of Object.keys(expected)) {
    const a = actual[key], e = expected[key];
    if (Array.isArray(e)) {
      const worst = Math.max(...e.map((v, i) => Math.abs(v - a[i])));
      assert.ok(worst < 1e-9, `${label}: ${key} differs from the view that never left by ${worst}`);
    } else if (typeof e === 'number') {
      assert.ok(Math.abs(a - e) < 1e-9, `${label}: ${key} is ${a}, the view that never left holds ${e}`);
    } else {
      assert.equal(a, e, `${label}: ${key}`);
    }
  }
}

const VIEWS = [
  { name: 'sight x2', sniper: 2 },
  { name: 'sight x4', sniper: 4 },
  { name: 'sight x8', sniper: 8 },
  { name: 'chase (lens shift, 72 degree lens)' },
  { name: 'isometric', iso: true },
];

const FLIGHTS = [
  { name: 'drone', frames: [{ kind: 'drone', launching: true, n: 6 }, { kind: 'drone', launching: false, n: 90 }] },
  { name: 'gunship', frames: [{ kind: 'gunship', launching: false, n: 60 }] },
];

/** The flight the sim sends: the view the camera reads each frame (sim/aerialCombat.ts AerialView). */
function aerialView(kind, launching) {
  return kind === 'gunship'
    ? { active: true, kind, launching, x: 90, y: 240, z: 0, yaw: 0, batteryS: 0, cooldownS: 0 }
    : { active: true, kind, launching, x: 6, y: 28, z: 4, yaw: 0.4, batteryS: 40, cooldownS: 0 };
}

const HOLD = 20; // the player frames in the view before it leaves
const BACK = 3; // the player frames after it comes back

// a held view -> a flight -> back: the same camera as the rig that stayed
for (const view of VIEWS) {
  for (const flight of FLIGHTS) {
    const label = `${view.name} -> ${flight.name} -> back`;
    const stayed = setup(view);
    const flew = setup(view);
    for (let i = 0; i < HOLD; i++) { stayed.rig.update(DT, idle); flew.rig.update(DT, idle); }
    let sawFlight = false;
    for (const leg of flight.frames) {
      for (let i = 0; i < leg.n; i++) {
        flew.player.aerial = aerialView(leg.kind, leg.launching);
        // the pilot looks around the whole flight: the aim the view held is the rig's, not the flight's
        flew.rig.update(DT, { ...idle, mouseDX: 3, mouseDY: -2, wheel: leg.kind === 'gunship' && i === 5 ? 1 : 0 });
        sawFlight ||= Math.abs(flew.camera.fov - stayed.camera.fov) > 1;
      }
    }
    assert.ok(sawFlight, `${label}: the flight drove its own lens (the case is live)`);
    assert.equal(flew.camera.userData.scoped, false, `${label}: no scope flag rides the flight`);
    flew.player.aerial = { ...flew.player.aerial, active: false, launching: false };
    for (let i = 0; i < BACK; i++) { stayed.rig.update(DT, idle); flew.rig.update(DT, idle); }
    assert.equal(flew.rig.mode, stayed.rig.mode, `${label}: the mode`);
    assert.equal(flew.rig.zoom, stayed.rig.zoom, `${label}: the zoom step`);
    assertSameView(viewState(flew), viewState(stayed), label);
    assert.ok(flew.player.input.aimPoint.distanceTo(stayed.player.input.aimPoint) < 1e-9, `${label}: the gun is laid where it was`);
  }
}

// a held view -> another camera owner that writes the camera itself -> back. Watch's drone and ride (watchCamera.ts
// setFov), the Studio and the combat warm write camera.fov; closing couch panes clears camera.view (couchPaneViews.ts
// dispose). The rig solves from what the camera holds, never from what it last wrote.
const FOREIGN = [
  { name: 'a foreign field of view (Watch, the Studio)', write: (camera) => { camera.fov = 47; camera.updateProjectionMatrix(); } },
  { name: 'the lens shift cleared (couch panes closing)', write: (camera) => { camera.clearViewOffset(); camera.updateProjectionMatrix(); } },
  {
    name: 'a lens shift in another shape (setViewOffset)',
    write: (camera) => { camera.setViewOffset(1280, 720, 0, 40, 1280, 720); },
  },
];
for (const view of VIEWS) {
  for (const foreign of FOREIGN) {
    const label = `${view.name} -> ${foreign.name} -> back`;
    const stayed = setup(view);
    const touched = setup(view);
    for (let i = 0; i < HOLD; i++) { stayed.rig.update(DT, idle); touched.rig.update(DT, idle); }
    foreign.write(touched.camera);
    // (the aspect a setViewOffset resets is the integration's, as on a resize: put back as the page would)
    touched.camera.aspect = stayed.camera.aspect;
    for (let i = 0; i < BACK; i++) { stayed.rig.update(DT, idle); touched.rig.update(DT, idle); }
    assertSameView(viewState(touched), viewState(stayed), label);
  }
}

// the fire's FOV punch still settles on the view's own lens (setFov's base is the solve's, not the punched value)
{
  const stayed = setup({ sniper: 4 });
  const fired = setup({ sniper: 4 });
  for (let i = 0; i < HOLD; i++) { stayed.rig.update(DT, idle); fired.rig.update(DT, idle); }
  fired.rig.recoilKick(0.012, 1);
  fired.rig.update(DT, idle);
  stayed.rig.update(DT, idle);
  assert.ok(fired.camera.fov !== stayed.camera.fov, 'the punch widens the lens');
  for (let i = 0; i < 90; i++) { stayed.rig.update(DT, idle); fired.rig.update(DT, idle); }
  assert.ok(Math.abs(fired.camera.fov - stayed.camera.fov) < 1e-9, 'and settles back on the sight\'s field of view');
}

console.log(`cameraViewRoundTrip.selftest: ${VIEWS.length} views x ${FLIGHTS.length} flights and ${FOREIGN.length} foreign camera writers each come back to the view that never left; the FOV punch settles pass`);
