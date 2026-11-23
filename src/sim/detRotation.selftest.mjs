// detRotation is three.js's rotation constructors on detMath (276, sim-det-trig). Three proofs over 20,000 seeded cases
// per function (angles near zero, at multiples of pi/2, ordinary turns and large multi-turn values; every Euler order):
// 1. With Math.sin and Math.cos swapped for detMath's, three's own method and detRotation agree bit for bit, so the port
//    keeps three's operation order exactly.
// 2. With native Math, a case whose sines and cosines native Math and detMath agree on gives bit-identical results.
// 3. Elsewhere detMath's sine or cosine is within 1 ulp of the native one, and every result within 16 ulp of its scale (rotations
//    are unit-scale; a rotated vector is scaled by its length, and three angles compound).
import assert from 'node:assert/strict';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import * as det from './detMath.ts';
import * as rot from './detRotation.ts';

const ORDERS = ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'];
const CASES = 20_000;
let seed = 0x2760d3;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const HALF_PI = Math.PI / 2;
const angle = () => {
  const r = random();
  if (r < 0.15) return (random() - 0.5) * 1e-6;
  if (r < 0.35) return Math.round((random() - 0.5) * 16) * HALF_PI + (random() - 0.5) * 1e-9;
  if (r < 0.85) return (random() - 0.5) * 4 * Math.PI;
  return (random() - 0.5) * 2000;
};
const unitAxis = () => new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();

const view = new DataView(new ArrayBuffer(8));
const bits = (x) => { view.setFloat64(0, x); return view.getBigUint64(0); };
const ulpsApart = (a, b) => { const d = bits(a) - bits(b); return d < 0n ? -d : d; };
const ULP_OF_ONE = 2 ** -52;

/** Each function: three's method and detRotation's, on one case, as flat numbers, and the angles it takes sin/cos of. */
const FUNCTIONS = {
  quaternionFromEuler: (c) => ({
    three: () => [...new Quaternion().setFromEuler(c.euler)], det: () => [...rot.quaternionFromEuler(new Quaternion(), c.euler)],
    trigArgs: [c.euler.x / 2, c.euler.y / 2, c.euler.z / 2],
  }),
  quaternionFromAxisAngle: (c) => ({
    three: () => [...new Quaternion().setFromAxisAngle(c.axis, c.a)], det: () => [...rot.quaternionFromAxisAngle(new Quaternion(), c.axis, c.a)],
    trigArgs: [c.a / 2],
  }),
  applyAxisAngle: (c) => ({
    three: () => [...c.v.clone().applyAxisAngle(c.axis, c.a)], det: () => [...rot.applyAxisAngle(c.v.clone(), c.axis, c.a)], trigArgs: [c.a / 2],
  }),
  applyEuler: (c) => ({
    three: () => [...c.v.clone().applyEuler(c.euler)], det: () => [...rot.applyEuler(c.v.clone(), c.euler)],
    trigArgs: [c.euler.x / 2, c.euler.y / 2, c.euler.z / 2],
  }),
  matrixRotationX: (c) => ({ three: () => new Matrix4().makeRotationX(c.a).elements, det: () => rot.matrixRotationX(new Matrix4(), c.a).elements, trigArgs: [c.a] }),
  matrixRotationY: (c) => ({ three: () => new Matrix4().makeRotationY(c.a).elements, det: () => rot.matrixRotationY(new Matrix4(), c.a).elements, trigArgs: [c.a] }),
  matrixRotationZ: (c) => ({ three: () => new Matrix4().makeRotationZ(c.a).elements, det: () => rot.matrixRotationZ(new Matrix4(), c.a).elements, trigArgs: [c.a] }),
  matrixRotationFromEuler: (c) => ({
    // a dirty target: the method writes every element
    three: () => new Matrix4().set(...Array(16).fill(7)).makeRotationFromEuler(c.euler).elements,
    det: () => rot.matrixRotationFromEuler(new Matrix4().set(...Array(16).fill(7)), c.euler).elements, trigArgs: [c.euler.x, c.euler.y, c.euler.z],
  }),
  vectorFromSphericalCoords: (c) => ({
    three: () => [...new Vector3().setFromSphericalCoords(c.r, c.a, c.b)], det: () => [...rot.vectorFromSphericalCoords(new Vector3(), c.r, c.a, c.b)],
    trigArgs: [c.a, c.b],
  }),
};

const cases = Array.from({ length: CASES }, (_, i) => ({
  euler: new Euler(angle(), angle(), angle(), ORDERS[i % ORDERS.length]), axis: unitAxis(), a: angle(), b: angle(),
  v: new Vector3((random() - 0.5) * 20, (random() - 0.5) * 20, (random() - 0.5) * 20), r: 1 + random() * 9,
}));

const nativeSin = Math.sin, nativeCos = Math.cos;
const summary = [];
for (const [name, make] of Object.entries(FUNCTIONS)) {
  let identicalWhereAgreed = 0, disagreed = 0, worstUlps = 0n;
  for (const [index, c] of cases.entries()) {
    const f = make(c);
    // 1. three on detMath is detRotation, bit for bit
    Math.sin = det.sin; Math.cos = det.cos;
    let swapped;
    try { swapped = [...f.three()]; } finally { Math.sin = nativeSin; Math.cos = nativeCos; }
    const ours = [...f.det()];
    assert.deepEqual(ours.map(bits), swapped.map(bits), `${name} case ${index}: three on detMath and detRotation differ`);
    // 2 and 3: against three on native Math
    const native = [...f.three()];
    const agreed = f.trigArgs.every((x) => nativeSin(x) === det.sin(x) && nativeCos(x) === det.cos(x));
    if (agreed) {
      assert.deepEqual(ours.map(bits), native.map(bits), `${name} case ${index}: native and detMath sines agree but the results differ`);
      identicalWhereAgreed++;
    } else {
      disagreed++;
      for (const x of f.trigArgs) {
        assert.ok(ulpsApart(nativeSin(x), det.sin(x)) <= 1n && ulpsApart(nativeCos(x), det.cos(x)) <= 1n, `${name}: detMath sin/cos(${x}) beyond 1 ulp`);
      }
      const scale = name === 'applyAxisAngle' || name === 'applyEuler' ? c.v.length() : name === 'vectorFromSphericalCoords' ? c.r : 1;
      ours.forEach((value, k) => {
        assert.ok(Math.abs(value - native[k]) <= 16 * ULP_OF_ONE * scale, `${name} case ${index}[${k}]: ${value} vs native ${native[k]}`);
        const ulps = ulpsApart(value, native[k]);
        if (ulps > worstUlps && Math.abs(native[k]) > 1e-3 * scale) worstUlps = ulps;
      });
    }
  }
  summary.push(`${name} ${identicalWhereAgreed}/${CASES - disagreed} identical, ${disagreed} near (worst ${worstUlps} ulp)`);
}

// an unknown order throws, as three warns; the simulation never builds one
assert.throws(() => rot.quaternionFromEuler(new Quaternion(), /** @type {any} */ ({ x: 0, y: 0, z: 0, order: 'XXX' })), /unknown Euler order/);

console.log(`detRotation.selftest: ${Object.keys(FUNCTIONS).length} functions x ${CASES} cases bit-identical to three on detMath; against native Math: ${summary.join('; ')}`);
