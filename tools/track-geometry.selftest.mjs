import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KIT } from '../src/vehicles/tankFactory.js';

const signedArea2 = (points) => points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length];
  return sum + a[0] * b[1] - b[0] * a[1];
}, 0);

function checkLoop(label, front, rear) {
  const groundFront = front.z + front.r * 0.12;
  const groundRear = rear.z - rear.r * 0.12;
  const points = KIT.trackLoopPoints({
    idler:front, sprocket:rear, botY:0.055, topY:0.88,
    supports:[{z:-1.8,y:0.88},{z:0,y:0.86},{z:1.8,y:0.88}],
    contact:{zF:groundFront,zR:groundRear},
  });
  assert.ok(signedArea2(points) < 0, `${label}: loop must wind clockwise`);
  const upperWidth = front.z - rear.z;
  const groundWidth = groundFront - groundRear;
  assert.ok(groundWidth > upperWidth, `${label}: loaded ground run must be the wider trapezoid base`);

  // The clockwise tangent's left normal (-ty,+tz in z/y order) must point
  // out of the loop. On the top run that means +Y; on the ground run -Y.
  const topA = points[0], topB = points[1];
  assert.ok(topB[0] - topA[0] > 0, `${label}: top run must travel rear to front`);
  const bottom = points.filter((p) => Math.abs(p[1] - 0.055) < 1e-6);
  assert.ok(bottom.length >= 2 && bottom.at(-1)[0] < bottom[0][0],
    `${label}: ground run must travel front to rear`);
}

checkLoop('rear drive', {z:3.45,y:0.46,r:0.33}, {z:-3.50,y:0.48,r:0.35});
checkLoop('front drive', {z:3.38,y:0.50,r:0.37}, {z:-3.42,y:0.44,r:0.32});

{
  const wheelZs = [-1.78, -0.992, -0.204, 0.584, 1.372, 2.16];
  const legacy = KIT.runningGearContactPatch(wheelZs, 0.385, { contactZR: -1.50 });
  const contained = KIT.runningGearContactPatch(wheelZs, 0.385, {
    contactZR: -1.50,
    containRearRoadWheel: true,
  });
  assert.equal(legacy.zR, -1.50, 'legacy source pins remain byte-compatible by default');
  assert.ok(Math.abs(contained.zR - (-1.9725)) < 1e-9,
    'opt-in rear containment carries the loaded tread past the final road-wheel quadrant');
}

const shoe=KIT.trackShoeGeometries(0.58,0.165);
shoe.pad.computeBoundingBox();
shoe.inner.computeBoundingBox();
const padBox=shoe.pad.boundingBox;
const innerBox=shoe.inner.boundingBox;
assert.ok(padBox.max.y-padBox.min.y>=0.10,'outer shoe needs real pad/grouser thickness');
assert.ok((padBox.max.z-padBox.min.z)/0.165>=0.90,
  'broad tread face must nearly fill its exact pitch so the wrap reads continuously');
assert.ok(innerBox.min.y<padBox.min.y-0.24,'recessed connector and guide geometry must retain real shoe depth');
assert.ok(innerBox.max.x>=0.30&&innerBox.min.x<=-0.30,'transverse pin caps must reach both outer faces');
shoe.pad.dispose();
shoe.inner.dispose();

// The loaded run must physically bend with its bogies. This catches both
// historical clamps that made the wheels move behind an unchanged ruler-flat
// belt: deformBand's -2 cm floor and the link pad's absolute Y floor.
{
  const mat = () => new THREE.MeshBasicMaterial();
  const materials = [mat(), mat(), mat(), mat(), mat(), mat(), mat(), mat()];
  const [trackL, trackR, trackLink, dark, detail, rubber, wheels, wheelsRecessed] = materials;
  const P = {
    mats: {
      trackL, trackR, trackLink, dark, detail, rubber, wheels, wheelsRecessed,
      spareTrack: dark,
      trackLinkM: 0.66,
      trackTexL: { offset: { y: 0 } },
      trackTexR: { offset: { y: 0 } },
    },
    hullG: new THREE.Group(),
    q: false,
    geometryReceipt: true,
    disposables: [],
    gear: null,
    add() {},
  };
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: 0.34, wheelW: 0.13, xc: 1.2,
    wheelZs: [-2, -1, 0, 1, 2],
    sprocket: { z: 2.75, y: 0.47, r: 0.35 },
    idler: { z: -2.75, y: 0.45, r: 0.33 },
    trackW: 0.56, topY: 1.05, linkPitchM: 0.11, coveredTop: true,
  });
  const receipt = P.hullG.userData.runningGearReceipts[0];
  assert.ok(Math.abs(receipt.textureRepeatM - receipt.shoePitchM * 4) < 1e-9,
    'belt texture repeat is derived from the exact closed-course shoe pitch');
  assert.ok(receipt.shoePadCoverageRatio >= 0.90,
    'each articulated shoe exposes a nearly pitch-wide tread face around the full loop');
  const drive = P.hullG.children.find((child) =>
    child.userData?.runningGearEndKind === 'sprocket' && child.name === 'gearEndWheelHardware');
  assert.ok(drive?.userData.sprocketToothCount >= 18,
    `drive teeth use the 0.11 m shoe pitch (${drive?.userData.sprocketToothCount})`);
  P.gear.update(receipt.shoePitchM, receipt.shoePitchM);
  assert.ok(Math.abs(P.mats.trackTexL.offset.y + 0.25) < 1e-9,
    'one shoe of travel advances the four-link belt pattern by one quarter turn');
  const belt = P.hullG.getObjectByName('gearTrackBandL');
  assert.ok(belt, 'procedural gear exposes its deformable left belt');
  const attr = belt.geometry.getAttribute('position');
  const before = attr.array.slice();
  const rootY = -P.gear.contactGeom.bottomYM;
  const state = {
    pos: new THREE.Vector3(0, rootY, 0), yaw: 0,
    visualPitch: 0, visualRoll: 0,
  };
  const rut = (x, z) => Math.abs(z) < 0.55 ? -0.14 : 0;
  for (let i = 0; i < 8; i++) P.gear.conform(state, rut, 0, 0, 1 / 30);
  P.gear.update(0, 0);
  let centerDrop = 0;
  let centerN = 0;
  let shoulderDrop = 0;
  let shoulderN = 0;
  for (let i = 0; i < attr.count; i++) {
    const j = i * 3;
    if (before[j + 1] > 0.16) continue; // loaded lower run only
    const drop = before[j + 1] - attr.array[j + 1];
    const z = before[j + 2];
    if (Math.abs(z) < 0.35) { centerDrop += drop; centerN++; }
    if (Math.abs(Math.abs(z) - 1.0) < 0.25) { shoulderDrop += drop; shoulderN++; }
  }
  centerDrop /= Math.max(centerN, 1);
  shoulderDrop /= Math.max(shoulderN, 1);
  assert.ok(centerDrop > 0.08,
    `loaded track run follows a 14 cm rut (center drop ${centerDrop.toFixed(3)} m)`);
  assert.ok(centerDrop > shoulderDrop + 0.05,
    `track belt bends locally instead of translating rigidly (${centerDrop.toFixed(3)} vs ${shoulderDrop.toFixed(3)} m)`);

  // Shoes must rotate with that curve as well as translate. A V-shaped
  // loaded run with every pad still parallel to the hull was the remaining
  // visual tell that the tracks were a texture strip rather than a chain.
  const pads = P.hullG.getObjectByName('gearTrackPads');
  assert.ok(pads?.isInstancedMesh, 'procedural gear exposes linked track pads');
  assert.equal(P.hullG.getObjectByName('gearTrackInnerLinks'), undefined,
    'connector, pin and guide detail is integrated into the one smart shoe layer');
  const matrix = new THREE.Matrix4();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const e = new THREE.Euler();
  let maxLoadedPitch = 0;
  let collapsedShoes = 0;
  for (let i = 0; i < pads.count; i++) {
    pads.getMatrixAt(i, matrix);
    matrix.decompose(p, q, s);
    if (s.lengthSq() < 0.1) collapsedShoes++;
    if (p.x > 0 || p.y > 0.16 || Math.abs(p.z) > 0.80 || Math.abs(p.z) < 0.12) continue;
    e.setFromQuaternion(q, 'XYZ');
    maxLoadedPitch = Math.max(maxLoadedPitch, Math.abs(e.x));
  }
  assert.ok(maxLoadedPitch > 0.07,
    `individual shoes rotate onto the locally bent run (${maxLoadedPitch.toFixed(3)} rad)`);
  assert.equal(collapsedShoes, 0,
    'covered return runs keep every shoe in the closed physical chain');
  for (const disposable of P.disposables) disposable.dispose?.();
  for (const material of materials) material.dispose();
}

// ---- TRACK-HITBOX derivation (owner order 2026-08-06) ----------------------
// trackHitboxHull turns the band loop into the hit-test silhouette: a small
// convex CCW polygon that CONTAINS every loop point expanded by r (band
// surface + shoe depth) — the \____/ trapezoid the killcam now draws and
// traceTank now rolls against.
{
  const front = { z: 3.45, y: 0.46, r: 0.33 };
  const rear = { z: -3.50, y: 0.48, r: 0.35 };
  const pts = KIT.trackLoopPoints({
    idler: front, sprocket: rear, botY: 0.055, topY: 0.88,
    supports: [{ z: -1.8, y: 0.88 }, { z: 0, y: 0.86 }, { z: 1.8, y: 0.88 }],
    // the real buildRunningGear recipe: ground contact spans the ROAD-WHEEL
    // patch, well inside the raised end wheels — that's what the ramps are
    contact: { zF: 2.6, zR: -2.7 },
  });
  const r = 0.09;
  const hull = KIT.trackHitboxHull(pts, r);
  assert.ok(hull.length >= 6 && hull.length <= 12,
    `hitbox hull respects the vertex budget (got ${hull.length})`);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  let area2 = 0;
  for (let i = 0; i < hull.length; i++) {
    const o = hull[i];
    const a = hull[(i + 1) % hull.length];
    const b = hull[(i + 2) % hull.length];
    assert.ok(cross(o, a, b) > -1e-9, 'hitbox hull is convex CCW at every vertex');
    area2 += o[0] * a[1] - a[0] * o[1];
  }
  assert.ok(area2 > 0, 'hitbox hull winds CCW in (z,y)');
  // containment: every loop point sits INSIDE the hull (>= 0.6 r deep —
  // the pruning shortcut may shave corners, never the running surfaces)
  const insideBy = (p) => {
    let worst = Infinity;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      const ez = b[0] - a[0];
      const ey = b[1] - a[1];
      const len = Math.hypot(ez, ey) || 1;
      // signed distance INSIDE the CCW edge (outward normal (ey,-ez)/len)
      worst = Math.min(worst, -(((p[0] - a[0]) * ey - (p[1] - a[1]) * ez) / len));
    }
    return worst;
  };
  for (const p of pts) {
    assert.ok(insideBy(p) >= r * 0.6,
      `loop point (${p[0].toFixed(2)},${p[1].toFixed(2)}) buried >=0.6r inside the hull`);
  }
  // the raised-end read: the hull's ground run must be LONGER than its crown
  // span at end-wheel-axle height only past the wraps — i.e. the front/rear
  // extremes at low y sit INSIDE the extremes at axle height (the \____/
  // profile, not a rectangle): compare z-extent at y=botY vs the overall.
  const zAll = hull.map((p) => p[0]);
  // ground-line vertices only (botY 0.055 − r 0.09 = −0.035, +rounding) —
  // the wrap UNDERSIDES at y≈0.1 must not count as "ground run"
  const low = hull.filter((p) => p[1] < 0.03);
  assert.ok(low.length >= 2, 'hull keeps a distinct low ground run');
  const zLow = low.map((p) => p[0]);
  assert.ok(Math.max(...zAll) - Math.max(...zLow) > 0.25
    && Math.min(...zLow) - Math.min(...zAll) > 0.25,
    'raised end wraps overhang the ground run (trapezoid, not a rectangle)');
}

// attachTrackShapes: mirrors one gear hull into both side prisms, wires the
// legacy authored screen stats, honors the hand-override hook, and scales
// with fitArmorToDims.
{
  const { attachTrackShapes, fitArmorToDims } = await import('../src/vehicles/specs.js');
  const mkTrackPlate = (name, link) => ({
    name, verts: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    physicalMm: 33, keMm: 34, ceMm: 35, kind: 'external', era: null,
    moduleLink: link, gunFollow: false,
  });
  const armorA = {
    hullPlates: [mkTrackPlate('track_R', 'trackR'), mkTrackPlate('track_L', 'trackL')],
    turretPlates: [], modules: [], crew: [],
  };
  attachTrackShapes(armorA, [{ x0: 1.0, x1: 1.6, poly: [[-2, 0.1], [2, 0.1], [2.2, 0.9], [-2.2, 0.9]] }]);
  assert.equal(armorA.trackShapes.length, 2, 'one gear hull yields both side prisms');
  const left = armorA.trackShapes.find((s) => s.module === 'trackL');
  const right = armorA.trackShapes.find((s) => s.module === 'trackR');
  assert.ok(left && right, 'both sides present');
  assert.ok(Math.abs(left.x0 - -1.6) < 1e-9 && Math.abs(left.x1 - -1.0) < 1e-9,
    'left slab mirrored outboard');
  assert.ok(right.plate.physicalMm === 33 && right.plate.keMm === 34 && right.plate.ceMm === 35,
    'legacy authored screen stats wired into the prism plate');
  assert.ok(right.plate.kind === 'external' && right.plate.moduleLink === 'trackR',
    'prism plate keeps the external/moduleLink contract');
  fitArmorToDims(armorA,
    { widthM: 2, heightM: 2, hullLengthM: 4 },
    { widthM: 4, heightM: 1, hullLengthM: 8 });
  assert.ok(Math.abs(right.x1 - 3.2) < 1e-9, 'prism lateral slab scales with width');
  assert.ok(Math.abs(right.poly[1][0] - 4) < 1e-9, 'prism z scales with hull length');
  assert.ok(Math.abs(right.poly[2][1] - 0.45) < 1e-9, 'prism y scales with height');
  const armorB = {
    hullPlates: [], turretPlates: [], modules: [], crew: [],
    trackShapesOverride: [{ module: 'trackR', x0: 0.8, x1: 1.2, poly: [[-1, 0], [1, 0], [0, 1]] }],
  };
  attachTrackShapes(armorB, [{ x0: 9, x1: 9.9, poly: [[-9, 0], [9, 0], [0, 9]] }]);
  assert.ok(armorB.trackShapes.length === 1 && armorB.trackShapes[0].module === 'trackR'
    && armorB.trackShapes[0].x1 === 1.2, 'hand-override hook wins over the derived hulls');
}

console.log('track-geometry: loop winding, loaded-base profile, integrated detailed shoes, and track-hitbox derivation verified');
