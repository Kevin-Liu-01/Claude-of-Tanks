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

console.log('track-geometry: loop winding, loaded-base profile, and two-layer track shoes verified');
