import assert from 'node:assert/strict';
import * as THREE from 'three';
import { civilianVehicleOverrides } from './civilianVehicleKit.ts';
import {
  appendVehicleFarForm, appendVehicleFarShadow, vehicleCasterDepthMaterial, vehicleLodHook, VEHICLE_LOD_ATTRIBUTE, VEHICLE_NEAR_M,
} from './vehicleFarForm.ts';
import { applyVehicleSurfaceHook } from './vehicleSurface.ts';

// (229; the coordinator: "cars beyond about 120 m use a merged low form with a cheap shadow") the parked vehicles' far
// form on the four car maps' fleets, both tiers, every role: a low form of 150-450 triangles appended after the body,
// inside the body's box (bounds, caster height and colliders unchanged), the tags partitioning body (1) and far form
// (2), the range in userData, every stream in range (colours, the surface bytes, unit normals), the far form's own
// colour carrying the body's paint share (a black car stays black far off), the tyres' flats on the ground, a rebuild
// identical, the shadow stand-in's hull appended the same way, and the hooks' anchors present in three's programs.
const MAPS = ['urban', 'ruinspires', 'cliffbridge', 'blackglass'];
const seeded = (seed) => () => ((seed = (Math.imul(seed, 16807) + 12345) >>> 0) / 4294967296);

function farOf(map, mobile, role) {
  const geometry = civilianVehicleOverrides(map, mobile)[role].build(seeded(9001));
  geometry.computeBoundingBox();
  const before = geometry.boundingBox.clone();
  const body = { vertices: geometry.getAttribute('position').count, indices: geometry.index.count };
  const far = appendVehicleFarForm(geometry);
  return { geometry, before, body, far };
}

let checked = 0;
for (const map of MAPS) {
  for (const mobile of [false, true]) {
    const overrides = civilianVehicleOverrides(map, mobile);
    for (const role of Object.keys(overrides)) {
      const label = `${map}/${mobile ? 'phone' : 'desktop'}/${role}`;
      const { geometry, before, body, far } = farOf(map, mobile, role);
      assert.ok(far, `${label}: a far form`);
      assert.deepEqual(geometry.userData.vehicleFar, far.range, `${label}: the range in userData`);
      assert.equal(far.range.vertexStart, body.vertices, `${label}: the far form starts after the body's vertices`);
      assert.equal(far.range.indexStart, body.indices, `${label}: and after its indices`);
      const triangles = (geometry.index.count - far.range.indexStart) / 3;
      assert.ok(triangles >= 150 && triangles <= 450, `${label}: ${triangles} far triangles`);
      // (the phone's body is already the coarse one: a fifth of it there, a twelfth on desktop)
      assert.ok(triangles * (mobile ? 5 : 12) < body.indices / 3, `${label}: the far form well under the body`);
      // inside the body's box: the pool's bounds, caster height and every collider stay what they were
      geometry.computeBoundingBox();
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(geometry.boundingBox.min[axis] >= before.min[axis] - 1e-4 && geometry.boundingBox.max[axis] <= before.max[axis] + 1e-4, `${label}: inside the box on ${axis}`);
      }
      // the tags
      const tag = geometry.getAttribute(VEHICLE_LOD_ATTRIBUTE);
      assert.ok(tag.array instanceof Uint8Array && tag.count === geometry.getAttribute('position').count, `${label}: one tag a vertex`);
      for (let i = 0; i < tag.count; i++) assert.equal(tag.array[i], i < far.range.vertexStart ? 1 : 2, `${label}: tag ${i}`);
      const index = geometry.index.array;
      for (let i = 0; i < index.length; i++) {
        const far2 = i >= far.range.indexStart;
        assert.ok(index[i] < tag.count && (far2 ? index[i] >= far.range.vertexStart : index[i] < far.range.vertexStart), `${label}: index ${i} in its form`);
      }
      if (index instanceof Uint16Array) assert.ok(!index.includes(65535), `${label}: no primitive-restart token`);
      // the far form's streams
      const nrm = geometry.getAttribute('normal'), col = geometry.getAttribute('color'), surf = geometry.getAttribute('surf');
      assert.ok(surf.array instanceof Uint8Array && surf.normalized, `${label}: the surface stream stays normalized bytes`);
      for (let v = far.range.vertexStart; v < tag.count; v++) {
        assert.ok(Math.abs(Math.hypot(nrm.getX(v), nrm.getY(v), nrm.getZ(v)) - 1) < 1e-4, `${label}: unit normal ${v}`);
        for (let c = 0; c < 3; c++) assert.ok(col.getComponent(v, c) >= 0 && col.getComponent(v, c) <= 1.0001, `${label}: colour ${v}`);
      }
      // the tyres' flats on the ground: the far form's lowest point is the body's
      const position = geometry.getAttribute('position');
      let low = Infinity;
      for (let v = far.range.vertexStart; v < position.count; v++) low = Math.min(low, position.getY(v));
      assert.ok(low < before.min.y + 0.04, `${label}: the far tyres stand on the ground (${low.toFixed(3)})`);
      // the shadow stand-in (desktop)
      const shadowBuild = overrides[role].shadowBuild;
      if (shadowBuild) {
        const solid = shadowBuild();
        const start = solid.getAttribute('position').count, startIndex = solid.index.count;
        appendVehicleFarShadow(solid, far.hull);
        assert.deepEqual(solid.userData.vehicleFar, { vertexStart: start, indexStart: startIndex }, `${label}: the stand-in's range`);
        const st = solid.getAttribute(VEHICLE_LOD_ATTRIBUTE);
        assert.equal(st.count, solid.getAttribute('position').count, `${label}: the stand-in's tags`);
        assert.ok((solid.index.count - startIndex) / 3 <= triangles, `${label}: the stand-in's far hull no larger than the far form`);
      }
      checked++;
    }
  }
}

// a rebuild is identical (no stream, no clock: the same far form every load)
{
  const a = farOf('blackglass', false, 'sedan'), b = farOf('blackglass', false, 'sedan');
  for (const name of ['position', 'normal', 'uv', 'color', 'surf', VEHICLE_LOD_ATTRIBUTE]) {
    assert.deepEqual(a.geometry.getAttribute(name).array, b.geometry.getAttribute(name).array, `rebuild: ${name}`);
  }
  assert.deepEqual(a.geometry.index.array, b.geometry.index.array, 'rebuild: index');
}

// a black livery stays dark far off: the far form's tinted mean follows the body's (the paint share kept apart)
{
  const { geometry, far } = farOf('blackglass', false, 'sedan');
  const col = geometry.getAttribute('color'), surf = geometry.getAttribute('surf'), index = geometry.index.array;
  const pos = geometry.getAttribute('position');
  const tinted = (from, to) => {
    let sum = 0, area = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = from; t < to; t += 3) {
      a.fromBufferAttribute(pos, index[t]); b.fromBufferAttribute(pos, index[t + 1]); c.fromBufferAttribute(pos, index[t + 2]);
      const w = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      for (const v of [index[t], index[t + 1], index[t + 2]]) {
        const m = surf.getZ(v), lum = 0.2126 * col.getX(v) + 0.7152 * col.getY(v) + 0.0722 * col.getZ(v);
        sum += (w / 3) * lum * (1 - m + m * 0.03); // a black livery (tint 0.03)
      }
      area += w;
    }
    return sum / area;
  };
  const near = tinted(0, far.range.indexStart), farMean = tinted(far.range.indexStart, index.length);
  assert.ok(farMean < near * 2.2 + 0.02, `a black sedan's far form stays dark (${farMean.toFixed(3)} against the body's ${near.toFixed(3)})`);
}

// the hooks' anchors in three's programs (a renamed chunk fails here, not on a player's first frame)
{
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  applyVehicleSurfaceHook(shader);
  vehicleLodHook(shader);
  assert.ok(shader.vertexShader.includes(`attribute float ${VEHICLE_LOD_ATTRIBUTE};`), 'the material hook declares the tag');
  assert.ok(shader.vertexShader.includes(`${(VEHICLE_NEAR_M * VEHICLE_NEAR_M).toFixed(1)}`), 'the material hook folds at VEHICLE_NEAR_M');
  const depth = vehicleCasterDepthMaterial();
  assert.equal(depth, vehicleCasterDepthMaterial(), 'one caster depth material for every pool');
  const depthShader = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader };
  depth.onBeforeCompile(depthShader);
  assert.ok(depthShader.uniforms.uVehicleEye && depthShader.vertexShader.includes('uVehicleEye.w < 0.5'), 'the caster folds by the eye');
  assert.deepEqual(depth.defaultAttributeValues[VEHICLE_LOD_ATTRIBUTE], [0], 'untagged geometry is never folded');
}

console.log(`vehicleFarForm.selftest: ${checked} role builds on ${MAPS.length} maps' fleets carry a far form inside their box; rebuilds identical; a black livery stays dark; hooks anchored — ok`);
