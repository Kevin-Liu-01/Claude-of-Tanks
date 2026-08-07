import assert from 'node:assert/strict';
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

const shoe=KIT.trackShoeGeometries(0.58,0.165);
shoe.pad.computeBoundingBox();
shoe.inner.computeBoundingBox();
const padBox=shoe.pad.boundingBox;
const innerBox=shoe.inner.boundingBox;
assert.ok(padBox.max.y-padBox.min.y>=0.10,'outer shoe needs real pad/grouser thickness');
assert.ok(innerBox.min.y<padBox.min.y-0.24,'inner chain and guide horn must form a distinct second layer');
assert.ok(innerBox.max.x>=0.30&&innerBox.min.x<=-0.30,'transverse pin caps must reach both outer faces');
shoe.pad.dispose();
shoe.inner.dispose();

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

console.log('track-geometry: loop winding, loaded-base profile, two-layer track shoes, and track-hitbox derivation verified');
