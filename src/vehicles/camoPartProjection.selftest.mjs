// camoPartProjection.selftest.mjs — one camouflage projection plane per box-like bolted-on part (factoryGeometry
// partAxisUV, tankFactoryCore PART_AXIS_CAMO_BUCKETS: add-on armour, detail, painted detail, equipment; 2026-10-04,
// gauntlet wave 55: the Factory scheme read as "a mosaic of differently coloured tan, beige and brown tiles that change
// at almost every add-on armour box").
//
// boxUV picks each triangle's plane from its own normal, so one small box's front, top and side sample three unrelated
// parts of the tile and every corner is a seam. A part now takes its broad faces' plane (boxUV's mapping for that
// facing, so the broad face continues the hull face behind it) and its narrow faces wrap the colour at their edge; a part
// deeper than PART_AXIS_UV_MAX_DEPTH_M along that axis, or not box-like (PART_AXIS_UV_MIN_BOXNESS: a cast, rounded or
// bevelled part, a cylinder, a wedge), keeps boxUV's per-face planes, which one plane would stretch. This receipt pins
// the axis choice, the boxness, the seamless corners, the hull continuity, the fallbacks and, on real hulls, that the
// bolted-on buckets lost their corner seams while the hull's and turret's own plates and the gun kept boxUV.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PART_AXIS_UV_MAX_DEPTH_M, PART_AXIS_UV_MIN_BOXNESS, boxUV, partAxisUV, partBoxness, partBroadFaceAxis } from './factoryGeometry.ts';
import { CAMO_UV_REPEATS_PER_M } from './camoWorldScale.ts';
import { createTank } from './tankFactory.ts';

const S = CAMO_UV_REPEATS_PER_M;
const near1 = (value, label) => assert.ok(Math.abs(value - 1) < 1e-6, `${label} (${value})`);
// a 45° wedge: a box's top-front edge cut away
function wedge() {
  const g = new THREE.BufferGeometry();
  const v = [[0, 0, 0], [0.3, 0, 0], [0.3, 0, 0.2], [0, 0, 0.2], [0, 0.2, 0], [0.3, 0.2, 0]];
  const faces = [[0, 2, 1], [0, 3, 2], [0, 1, 5], [0, 5, 4], [3, 4, 5], [3, 5, 2], [0, 4, 3], [1, 2, 5]];
  const position = [];
  for (const f of faces) for (const i of f) position.push(...v[i]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.computeVertexNormals();
  return g;
}
const place = (geometry, x, y, z, rx = 0, ry = 0, rz = 0) => {
  geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  return geometry;
};
// a seam: two vertices at one position with different UVs
function seams(geometry) {
  const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  const groups = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
    const value = `${uv.getX(i).toFixed(4)},${uv.getY(i).toFixed(4)}`;
    (groups.get(key) ?? groups.set(key, new Set()).get(key)).add(value);
  }
  let seamed = 0;
  for (const values of groups.values()) if (values.size > 1) seamed++;
  return { groups: groups.size, seamed };
}

// 1. the broad faces' axis: a brick faces along its thinnest side, wherever it is turned; ties go as boxUV's (y, x, z)
assert.equal(partBroadFaceAxis(new THREE.BoxGeometry(0.07, 0.13, 0.28)), 0, 'a brick 7 cm deep along x faces x');
assert.equal(partBroadFaceAxis(new THREE.BoxGeometry(0.28, 0.07, 0.13)), 1, 'along y faces y');
assert.equal(partBroadFaceAxis(new THREE.BoxGeometry(0.28, 0.13, 0.07)), 2, 'along z faces z');
assert.equal(partBroadFaceAxis(place(new THREE.BoxGeometry(0.28, 0.13, 0.07), 0, 0, 0, 0, Math.PI / 2, 0)), 0, 'turned a quarter about y, it faces x');
assert.equal(partBroadFaceAxis(place(new THREE.BoxGeometry(0.28, 0.13, 0.07), 0, 0, 0, -1.1, 0, 0)), 1, 'a glacis brick tilted past 45° faces up');
assert.equal(partBroadFaceAxis(new THREE.BoxGeometry(1, 1, 1)), 1, 'a cube resolves as boxUV does: y first');

// 2. a side-skirt brick (facing +x at the hull's flank): no seam at its corners, and its broad face is exactly the hull
// flank's projection there (boxUV's x-facing plane), so the pattern runs on from the hull onto the brick
{
  const brick = place(new THREE.BoxGeometry(0.07, 0.13, 0.28), 1.72, 0.9, 1.4);
  const perFace = boxUV(brick.clone(), S), perPart = partAxisUV(brick.clone(), S);
  assert.ok(seams(perFace).seamed >= 8, 'boxUV seams every corner of a box');
  assert.equal(seams(perPart).seamed, 0, 'one plane per part: no corner seam');
  const position = perPart.getAttribute('position'), normal = perPart.getAttribute('normal');
  const a = perPart.getAttribute('uv'), b = perFace.getAttribute('uv');
  let broad = 0;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(normal.getX(i)) < 0.99) continue;
    broad++;
    assert.ok(Math.abs(a.getX(i) - b.getX(i)) < 1e-6 && Math.abs(a.getY(i) - b.getY(i)) < 1e-6, 'the broad face keeps the hull flank\'s mapping');
    assert.ok(Math.abs(a.getX(i) - position.getZ(i) * S) < 1e-6 && Math.abs(a.getY(i) - position.getY(i) * S) < 1e-6);
  }
  assert.ok(broad >= 8, 'both broad faces checked');
}

// 3. a part deeper than the limit along its axis (a wrap-around shell, not a box) keeps boxUV's per-face planes
{
  const shell = place(new THREE.BoxGeometry(PART_AXIS_UV_MAX_DEPTH_M + 0.2, 0.9, 1.6), 0, 1.8, 0);
  assert.equal(partBroadFaceAxis(shell), 0);
  const kept = partAxisUV(shell.clone(), S), plain = boxUV(shell.clone(), S);
  assert.deepEqual(Array.from(kept.getAttribute('uv').array), Array.from(plain.getAttribute('uv').array), 'a deep part keeps boxUV');
}

// 3b. boxness: any box, turned any way, is a box; a cylinder, a sphere and a wedge are not, and keep boxUV
{
  near1(partBoxness(place(new THREE.BoxGeometry(0.07, 0.13, 0.28), 0, 0, 0, 0.4, 0.7, -0.3)), 'a turned brick is a box');
  near1(partBoxness(new THREE.BoxGeometry(0.3, 0.02, 0.5)), 'and so is a plate');
  for (const [label, geometry] of [
    ['an eight-sided cylinder', place(new THREE.CylinderGeometry(0.1, 0.1, 0.25, 8), 0, 0, 0, 0, 0, Math.PI / 2)],
    ['a cast dome', new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)],
    ['a 45° wedge', wedge()],
  ]) {
    const boxness = partBoxness(geometry);
    assert.ok(boxness < PART_AXIS_UV_MIN_BOXNESS, `${label} is not box-like (${boxness.toFixed(2)})`);
    assert.deepEqual(Array.from(partAxisUV(geometry.clone(), S).getAttribute('uv').array),
      Array.from(boxUV(geometry.clone(), S).getAttribute('uv').array), `${label} keeps boxUV`);
  }
}

// 4. real hulls: the bolted-on buckets lost their corner seams; the hull's and turret's own plates and the gun keep
// boxUV exactly
function installCanvasFixture() {
  const canvas = () => {
    const element = { width: 0, height: 0 };
    const gradient = () => ({ addColorStop() {} });
    const context = new Proxy({ canvas: element, createLinearGradient: gradient, createRadialGradient: gradient,
      isPointInPath: () => false, measureText: (text) => ({ width: text.length * 8 }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), createPattern: () => ({}) },
    { get: (target, key) => (key in target ? target[key] : () => {}), set: (target, key, value) => { target[key] = value; return true; } });
    element.getContext = () => context;
    return element;
  };
  const doc = Object.getOwnPropertyDescriptor(globalThis, 'document'), path = Object.getOwnPropertyDescriptor(globalThis, 'Path2D');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => canvas() } });
  Object.defineProperty(globalThis, 'Path2D', { configurable: true, value: class { moveTo() {} lineTo() {} quadraticCurveTo() {}
    bezierCurveTo() {} closePath() {} rect() {} arc() {} ellipse() {} addPath() {} } });
  return () => {
    if (doc) Object.defineProperty(globalThis, 'document', doc); else delete globalThis.document;
    if (path) Object.defineProperty(globalThis, 'Path2D', path); else delete globalThis.Path2D;
  };
}
const restore = installCanvasFixture();
try {
  for (const id of ['t90m', 'm1a2']) {
    const visual = createTank(id, null, { proceduralOnly: true, quality: 'low', geometryQuality: 'high' });
    let armour = 0, seamsNow = 0, seamsBefore = 0;
    visual.root.traverse((object) => {
      if (!object.isMesh || !object.geometry.getAttribute('uv')) return;
      if (/^(hull|turret)(ExternalArmor|Detail|PaintedDetail|Equipment)$/.test(object.name)) {
        armour++;
        const now = seams(object.geometry);
        const before = seams(boxUV(object.geometry.clone(), S));
        assert.ok(now.seamed <= before.seamed, `${id}/${object.name}: never more corner seams than boxUV (${now.seamed} vs ${before.seamed})`);
        seamsNow += now.seamed; seamsBefore += before.seamed;
      } else if (/^(hull|turret|gun)$/.test(object.name)) {
        assert.deepEqual(Array.from(object.geometry.getAttribute('uv').array),
          Array.from(boxUV(object.geometry.clone(), S).getAttribute('uv').array), `${id}/${object.name}: its own plates keep boxUV`);
      }
    });
    assert.ok(armour > 1, `${id}: carries bolted-on parts`);
    assert.ok(seamsNow <= seamsBefore * 0.35, `${id}: its bolted-on parts' corner seams fall by two thirds (${seamsNow} vs ${seamsBefore})`);
    console.log(`  ${id}: bolted-on corner seams ${seamsBefore} -> ${seamsNow}`);
    visual.dispose();
  }
} finally {
  restore();
}
console.log('camoPartProjection.selftest: one plane per box-like bolted-on part (broad-face axis, boxness, seamless corners, the '
  + 'hull flank continued, deep and curved parts on boxUV), real hulls\' bolted-on seams down by two thirds, own plates on boxUV PASS');
