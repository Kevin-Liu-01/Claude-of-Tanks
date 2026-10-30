// battle-camera-264: the lens a screen-space pass rebuilds its view rays from (cameraLens.ts). The chase framing's lens
// shift (cameraRig.ts applyLens writes camera.view) is an off-axis projection; a ray rebuilt from tan(fov / 2) and the
// aspect alone missed it by 2 · shift · tan(fov / 2), and the aerial pass's contact shadows and the hull's ground
// occlusion marched from the wrong place under the tank. Pins: the ray and its projection against three's own
// unprojection, the cull frustum, and every rebuilt ray in the shaders carrying the shift.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Frustum, Matrix4, PerspectiveCamera, Vector2, Vector3 } from 'three';
import { lensCullProjection, readCameraLens } from './cameraLens.ts';

/** As cameraRig.ts applyLens writes it: the whole view, its centre moved by `shift` of the height. */
function lensCamera(width, height, shift, fov = 60) {
  const camera = new PerspectiveCamera(fov, width / height, 0.5, 4000);
  if (shift) camera.view = { enabled: true, fullWidth: 1, fullHeight: 1, width: 1, height: 1, offsetX: 0, offsetY: shift };
  camera.updateProjectionMatrix();
  return camera;
}

const tan = new Vector2(), shift = new Vector2();
const rebuilt = (x, y, t, s) => new Vector3(x * t.x + s.x, y * t.y + s.y, -1).normalize();
const truth = (camera, x, y) => new Vector3(x, y, 0.5).applyMatrix4(camera.projectionMatrixInverse).normalize();
const NDC = [[-1, -1], [1, -1], [0, -1], [0, 0], [-1, 1], [1, 1], [0.37, -0.81]];

// 1. a centred lens: the fov's tangents, no shift (what the passes read before)
{
  const camera = lensCamera(1280, 720, 0);
  readCameraLens(camera, tan, shift);
  const t = Math.tan(Math.PI / 6);
  assert.ok(Math.abs(tan.y - t) < 1e-12 && Math.abs(tan.x - t * 1280 / 720) < 1e-12, 'the fov and aspect tangents');
  assert.equal(shift.x, 0); assert.equal(shift.y, 0);
}

// 2. the shifted lens at the framed sizes and the settings' far end: every rebuilt ray is three's own, the centred
// rebuild misses by 2 · shift · tan(fov / 2) (the negative control), and the projection back lands on its NDC
for (const [w, h, s] of [[1280, 720, 0.115], [1920, 1080, 0.05], [390, 844, 0.0995], [844, 390, 0.141], [820, 1180, 0.34]]) {
  const camera = lensCamera(w, h, s);
  readCameraLens(camera, tan, shift);
  assert.ok(Math.abs(shift.y + 2 * s * tan.y) < 1e-12 && shift.x === 0, `${w}x${h}: the shift is 2 · ${s} of the half-height`);
  const centred = new Vector2(0, 0);
  for (const [x, y] of NDC) {
    const want = truth(camera, x, y);
    assert.ok(rebuilt(x, y, tan, shift).angleTo(want) < 1e-6, `${w}x${h}: the ray through (${x}, ${y}) is the projection's`);
    const off = rebuilt(x, y, tan, centred).angleTo(want);
    assert.ok(off > Math.atan(2 * s * tan.y) * 0.5, `${w}x${h}: a centred rebuild misses (${off.toFixed(3)} rad)`);
    // the inverse (cloudShaders.ts cloudProject, cloudSceneT): a point on the ray, 23 m deep, back to its NDC
    const p = want.clone().multiplyScalar(23 / -want.z);
    const nx = (p.x / -p.z - shift.x) / tan.x, ny = (p.y / -p.z - shift.y) / tan.y;
    const ndc = p.clone().applyMatrix4(camera.projectionMatrix);
    assert.ok(Math.abs(nx - ndc.x) < 1e-9 && Math.abs(ny - ndc.y) < 1e-9, `${w}x${h}: the projection back lands on its NDC`);
  }
}

// 3. the near trees' cull frustum (vegetation.ts updateNearViewCull) holds every ray of the shifted picture; a centred
// one, widened the same 4°, left the bottom of the framed picture out
{
  const pad = 4 * Math.PI / 180;
  const inside = (projection, ray) => new Frustum().setFromProjectionMatrix(projection).containsPoint(ray.clone().multiplyScalar(12));
  for (const [w, h, s] of [[1280, 720, 0.115], [844, 390, 0.141], [820, 1180, 0.34]]) {
    const camera = lensCamera(w, h, s);
    readCameraLens(camera, tan, shift);
    const cull = lensCullProjection(new Matrix4(), tan, shift, pad, 0.5, 4000);
    const centred = lensCullProjection(new Matrix4(), tan, new Vector2(), pad, 0.5, 4000);
    for (const [x, y] of NDC) {
      const ray = truth(camera, 0.999 * x, 0.999 * y);
      assert.ok(inside(cull, ray), `${w}x${h}: the cull holds the ray through (${x}, ${y})`);
    }
    assert.ok(!inside(centred, truth(camera, 0, -0.999)), `${w}x${h}: a centred cull drops the picture's bottom edge`);
  }
  // centred, it is the symmetric frustum the cull built before, to the bit
  const camera = lensCamera(1280, 720, 0);
  readCameraLens(camera, tan, shift);
  const wv = Math.tan(Math.min(1.5, Math.atan(tan.y) + pad)), wh = Math.tan(Math.min(1.5, Math.atan(tan.x) + pad));
  const before = new Matrix4().makePerspective(-0.5 * wh, 0.5 * wh, 0.5 * wv, -0.5 * wv, 0.5, 4000);
  assert.deepEqual(lensCullProjection(new Matrix4(), tan, shift, pad, 0.5, 4000).elements, before.elements, 'a centred lens culls as before');
}

// 4. every pass that rebuilds a ray carries the shift; none rebuilds one from the fov
{
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const post = read('./post.ts');
  assert.match(post, /uCamRight \* \( \( vUv\.x \* 2\.0 - 1\.0 \) \* uTan\.x \+ uTanShift\.x \)\s*\+ uCamUp \* \( \( vUv\.y \* 2\.0 - 1\.0 \) \* uTan\.y \+ uTanShift\.y \)/,
    'the aerial pass\'s ray');
  assert.match(post, /readCameraLens\(camera, aerial\.uniforms\.uTan\.value, aerial\.uniforms\.uTanShift\.value\);/, 'its lens from the projection');
  assert.doesNotMatch(post, /halfFovTangent/, 'no tangent from the fov alone');
  assert.match(read('./contactShadows.ts'),
    /uCamRight \* \( \( uv\.x \* 2\.0 - 1\.0 \) \* uTan\.x \+ uTanShift\.x \)\s*\+ uCamUp \* \( \( uv\.y \* 2\.0 - 1\.0 \) \* uTan\.y \+ uTanShift\.y \)/,
    'the contact shadows\' (and the ground occlusions\') world position at a depth');
  const clouds = read('./cloudShaders.ts');
  assert.match(clouds, /vec2 ndc = \( uv \* 2\.0 - 1\.0 \) \* uCamTan \+ uCamShift;/, 'the cloud trace\'s ray');
  assert.match(clouds, /vec2 ndc = \( vec2\( dot\( d, right \), dot\( d, up \) \) \/ max\( z, 1e-4 \) - shift \) \/ tanv;/, 'its reprojection');
  assert.match(clouds, /\/ fz - uDepthShift \) \/ uDepthTan;/, 'its scene depth lookup');
  assert.match(read('./volumetricClouds.ts'), /readCameraLens\(camera, C\.tan, C\.shift\);/, 'the clouds\' lens from the projection');
  assert.match(read('../world/vegetation.ts'), /lensCullProjection\(_cullProj, _cullLensTan, _cullLensShift, NEAR_CULL_TURN_RAD, near, far\);/,
    'the near trees\' cull');
  for (const [path, source] of [['post.ts', post], ['contactShadows.ts', read('./contactShadows.ts')], ['cloudShaders.ts', clouds]]) {
    for (const line of source.split('\n').filter((l) => /uCamUp \* .*uTan\b|uCamUp \* ndc|uCamTan\b.*\*/.test(l))) {
      assert.match(line, /Shift|uCamShift|ndc\.y/, `${path}: a rebuilt ray without the shift: ${line.trim()}`);
    }
  }
}

console.log('cameraLens.selftest: the shifted lens\'s rays, their projection and the near cull match three\'s projection; every pass reads it');
