// The Garage lamps' umbra baked under the hull (garageLampShadow.ts): the projection, the raster, the weights, the
// bake's darkness where a lamp is hidden and its exact 1 off the podium, and the decal's alpha-keeping blend.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LAMP_SHADOW_STRENGTH_RANGE, bakeLampShadow, convexHull2D, createGarageLampShadow, lampShadowBoxes,
  lampShadowTexels, podiumResponse, projectedShadow, rasterizeConvex,
} from './garageLampShadow.ts';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// convex hull: a square with an interior point, counter-clockwise
const hull = convexHull2D([0, 0, 2, 0, 2, 2, 0, 2, 1, 1]);
assert.equal(hull.length, 8, 'the interior point is dropped');
let area = 0;
for (let k = 0; k < 4; k++) area += hull[2 * k] * hull[(2 * k + 3) % 8] - hull[(2 * k + 2) % 8] * hull[2 * k + 1];
near(area / 2, 4, 1e-9, 'counter-clockwise, area 4');

// a lamp straight overhead throws the box's footprint, widened by its top's projection
const box = [-1, 0.5, -2, 1, 2, 2];
const overhead = projectedShadow([box], { x: 0, y: 10, z: 0 }, 0);
const xs = overhead.filter((_, k) => k % 2 === 0), zs = overhead.filter((_, k) => k % 2 === 1);
near(Math.max(...xs), 1.25, 1e-9, 'overhead umbra half-width (the top corners at 10/8)');
near(Math.max(...zs), 2.5, 1e-9, 'overhead umbra half-length');
// a lamp at 45° on -x throws the umbra out past +x by the top's height
const side = projectedShadow([box], { x: -10, y: 10, z: 0 }, 0);
const sideXs = side.filter((_, k) => k % 2 === 0);
near(Math.max(...sideXs), 3.75, 1e-9, 'the far edge: the top corner projected (x = -10 + 11 * 1.25)');
near(Math.min(...sideXs), -10 + 9 * 10 / 9.5, 1e-9, 'the near edge: the bottom corner on the lamp side');
assert.equal(projectedShadow([box], { x: 0, y: 1.5, z: 3 }, 0), null, 'a lamp under the deck throws no bounded umbra');

// the raster marks exactly the texels whose centres the polygon holds
const grid = { x0: 0, z0: 0, cell: 1, nx: 10, nz: 10 };
const mask = new Uint8Array(100);
rasterizeConvex([2, 2, 6, 2, 6, 5, 2, 5], grid, mask);
assert.equal(mask.reduce((s, v) => s + v, 0), 4 * 3, 'a 4 x 3 m rectangle on a 1 m grid covers 12 texel centres');

// the podium response: a lamp behind the hull, opposite a low viewer, reaches the viewer as a specular sheen
const p = new THREE.Vector3(2, 0, 2), eye = new THREE.Vector3(7.4, 2.75, 8);
const behind = new THREE.Vector3(-10, 8, -6).sub(p).normalize();
const front = new THREE.Vector3(10, 8, 12).sub(p).normalize();
assert.ok(podiumResponse(behind, p, eye) > 2 * podiumResponse(front, p, eye),
  `a lamp behind the hull outweighs one beside the viewer on the glossy podium (${podiumResponse(behind, p, eye).toFixed(4)} vs ${podiumResponse(front, p, eye).toFixed(4)})`);
assert.equal(podiumResponse(new THREE.Vector3(0, -1, 0), p, eye), 0, 'no light from below the podium');

// a bake: one lamp at 45° on -x, nothing else — its umbra on +x takes the strength's darkness, -x stays lit
const shape = { hx: 1.6, yb: 0.45, yt: 1.9, fz0: -3.9, fz1: 3.9, pz0: -3, pz1: 3, hr: 0, hf: 0,
  y0: 0, xi: 1.0, xo: 1.6, tz0: -3.6, tz1: 3.6, cz0: -2.8, cz1: 2.8, sr: 0, sf: 0 };
const boxes = lampShadowBoxes(shape, null);
assert.equal(boxes.length, 3, 'the hull and its two runs');
const lamp = new THREE.PointLight(0xffffff, 40, 0, 2);
lamp.position.set(-10, 10, 0);
lamp.updateMatrixWorld(true);
const bake = bakeLampShadow({
  boxes, rootMatrixWorld: new THREE.Matrix4(), eye: new THREE.Vector3(7.4, 2.75, 8),
  lighting: { lamps: [lamp], sun: null, ambient: 0 },
  podium: { centre: new THREE.Vector3(0, 0, 0), radius: 6 },
});
assert.equal(bake.strength, LAMP_SHADOW_STRENGTH_RANGE[1], 'a lone lamp is the podium\'s whole light (held to the window)');
assert.equal(bake.lamps, 1);
const at = (x, z) => {
  const i = Math.floor((x - bake.grid.x0) / bake.grid.cell), j = Math.floor((z - bake.grid.z0) / bake.grid.cell);
  return bake.factor[j * bake.grid.nx + i];
};
near(at(2.4, 0), 1 - LAMP_SHADOW_STRENGTH_RANGE[1], 0.02, 'the umbra beside the far run takes the lamp\'s whole share');
near(at(-2.6, 0), 1, 1e-6, 'the lamp side stays lit');
near(at(5.2, 0), 1, 0.05, 'past the umbra (the hull top throws to x = 4.6)');
near(at(3, 5.4), 1, 1e-6, 'off the hull\'s ends (the top corners throw to z = 4.81)');
// exactly one off the podium deck and at the bake's border
const offDeck = bakeLampShadow({
  boxes, rootMatrixWorld: new THREE.Matrix4(), eye: new THREE.Vector3(7.4, 2.75, 8),
  lighting: { lamps: [lamp], sun: null, ambient: 0 },
  podium: { centre: new THREE.Vector3(0, 0, 0), radius: 2.0 },
});
near(offDeck.factor[Math.floor((0 - offDeck.grid.z0) / offDeck.grid.cell) * offDeck.grid.nx
  + Math.floor((2.4 - offDeck.grid.x0) / offDeck.grid.cell)], 1, 1e-6, 'an umbra past the deck\'s edge is dropped');
for (let i = 0; i < bake.grid.nx; i++) {
  assert.equal(bake.factor[i], 1, 'the border row is exactly one');
  assert.equal(bake.factor[(bake.grid.nz - 1) * bake.grid.nx + i], 1, 'the far border row is exactly one');
}
// the sun and the ambient stay in the denominator: a strong sun lowers the lamps' share
const sunny = bakeLampShadow({
  boxes, rootMatrixWorld: new THREE.Matrix4(), eye: new THREE.Vector3(7.4, 2.75, 8),
  lighting: { lamps: [lamp], sun: { luminance: 3, direction: new THREE.Vector3(0.3, 0.8, -0.5).normalize() }, ambient: 0.5 },
  podium: { centre: new THREE.Vector3(0, 0, 0), radius: 6 },
});
assert.ok(sunny.strength < bake.strength && sunny.strength >= LAMP_SHADOW_STRENGTH_RANGE[0],
  `the shadowed sun's light is not the lamps' to hide (${sunny.strength.toFixed(3)})`);
// texels: linear multiplier, opaque
const texels = lampShadowTexels(bake);
assert.equal(texels.length, bake.grid.nx * bake.grid.nz * 4);
assert.ok(texels.every((v, k) => k % 4 !== 3 || v === 255), 'opaque texels');

// the runtime decal: follows the podium hull, multiplies by one without it, keeps the scene's alpha
const scene = new THREE.Scene();
const garagePosition = new THREE.Vector3(-1500, 0, -1500);
const stage = new THREE.Group();
stage.position.copy(garagePosition);
const highbay = new THREE.PointLight(0xf3f1ea, 22, 42, 1.9);
highbay.position.set(-4.5, 7.1, -3.5);
stage.add(highbay);
scene.add(stage);
const root = new THREE.Group();
root.position.set(garagePosition.x, 0.36, garagePosition.z);
scene.add(root);
scene.updateMatrixWorld(true);
const decal = createGarageLampShadow({
  scene, lampRoots: [stage], garagePosition, podiumTopY: 0.36, podiumRadius: 6, cameraOffset: [7.4, 2.75, 8],
  measure: () => shape,
});
scene.add(decal.mesh);
assert.equal(decal.mesh.material.blending, THREE.MultiplyBlending);
assert.equal(decal.mesh.material.premultipliedAlpha, true, 'premultiplied multiply keeps the destination alpha');
assert.equal(decal.mesh.material.depthWrite, false, 'the post chain reads the podium\'s depth under it');
assert.equal(decal.mesh.frustumCulled, false, 'asked every Garage frame');
decal.mesh.onBeforeRender();
assert.equal(decal.bake, null, 'no hull on the podium: no bake');
assert.equal(decal.mesh.material.map.image.width, 1, 'and the decal multiplies by one');
scene.userData.nearVehicles = [{ root }];
decal.mesh.onBeforeRender();
assert.ok(decal.bake && decal.bake.lamps === 1, 'the hull on the podium is baked against the stage lamps');
assert.equal(decal.mesh.material.map.image.width, decal.bake.grid.nx);
assert.deepEqual(decal.mesh.matrixWorld.elements, root.matrixWorld.elements, 'the decal rides the hull\'s frame');
const first = decal.bake;
decal.mesh.onBeforeRender();
assert.equal(decal.bake, first, 'an unchanged hull and rig is not baked again');
highbay.intensity = 30;
decal.mesh.onBeforeRender();
assert.notEqual(decal.bake, first, 'a lamp change bakes again');
root.position.x += 10;
root.updateMatrixWorld(true);
decal.mesh.onBeforeRender();
assert.equal(decal.mesh.material.map.image.width, 1, 'a hull off the podium is not the Garage\'s');
decal.dispose();

console.log('garageLampShadow.selftest: projection, raster, podium response, bake, border, sun share and the decal pass');
