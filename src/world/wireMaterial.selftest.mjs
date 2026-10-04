// wireMaterial.selftest — the power lines' conductors a pixel wide at the least (the scenery lane, 2026-10-04; gauntlet
// wave 48: "the power cables break into dashes"):
//   1. a conductor is a ribbon along its catenary: its centre line twice over, a side each, the catenary's direction
//      and the true radius on every vertex, two triangles a segment; it sags between its towers;
//   2. the wire material patches three's basic program at its anchors, once each: the ribbon faces the eye and is half
//      a pixel either side at the least, and the fragment's alpha is the share of that width the true wire covers;
//   3. the pixel is the target's: 2 tan(fov / 2) / height a metre out, and the wire's cover follows from it — a near
//      wire is all wire, a wire two kilometres out a faint continuous line, never nothing;
//   4. the props owner draws the conductors as one mesh on this material (props-pylon-wires), never in the baked bucket.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildConductor } from './maps/sceneryKit.ts';
import { WIRE_ATTRIBUTES, createWireMesh, patchWireShader, wirePixelAtOneMetre } from './wireMaterial.ts';

// 1. the ribbon
const segments = 18, wire = buildConductor(0, 20, 0, 300, 22, 0, 9, segments, 0.055);
assert.deepEqual(Object.keys(wire.attributes).sort(), [...WIRE_ATTRIBUTES].sort(), 'the ribbon carries the wire attributes');
assert.equal(wire.index.count, segments * 2 * 3, 'two triangles a segment');
const p = wire.attributes.position, t = wire.attributes.aWireTangent, side = wire.attributes.aWireSide, radius = wire.attributes.aWireRadius;
let low = Infinity;
for (let i = 0; i < p.count; i++) {
  assert.ok(Math.abs(Math.hypot(t.getX(i), t.getY(i), t.getZ(i)) - 1) < 1e-5, 'a unit direction on every vertex');
  assert.equal(Math.abs(side.getX(i)), 1, 'a side each');
  assert.ok(Math.abs(radius.getX(i) - 0.055) < 1e-6, 'the true radius');
  low = Math.min(low, p.getY(i));
  if (i % 2) assert.deepEqual([p.getX(i), p.getY(i), p.getZ(i)], [p.getX(i - 1), p.getY(i - 1), p.getZ(i - 1)], 'both sides on the centre line');
}
assert.ok(low < 13 && low > 10, `the conductor sags between its towers (${low.toFixed(2)} m)`);

// 2. the program patch, on three's own basic shader source
const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} };
const pixel = { value: 0.001 };
patchWireShader(shader, pixel);
assert.equal(shader.uniforms.uWirePixel, pixel, 'the pixel rides a shared uniform');
assert.ok(!shader.vertexShader.includes('#include <project_vertex>'), 'the projection is the wire\'s own');
assert.match(shader.vertexShader, /float wireHalf = max\( aWireRadius, 0\.5 \* uWirePixel \* wireDistance \);/, 'half a pixel either side at the least');
assert.match(shader.vertexShader, /vec4 mvPosition = viewMatrix \* wireWorld;/, 'mvPosition defined for the fog');
assert.match(shader.fragmentShader, /diffuseColor\.a \*= clamp\( vWireCover, 0\.0, 1\.0 \);/, 'the alpha is the cover');
assert.throws(() => patchWireShader({ vertexShader: 'void main(){}', fragmentShader: '', uniforms: {} }, pixel), /anchor/, 'a missing anchor fails loudly');

// 3. the pixel and the cover
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 5000);
const at = wirePixelAtOneMetre(camera, 1080);
assert.ok(Math.abs(at - 2 * Math.tan(THREE.MathUtils.degToRad(27.5)) / 1080) < 1e-12, 'the pixel a metre out');
assert.equal(wirePixelAtOneMetre(new THREE.OrthographicCamera(), 1080), null, 'no pixel law for an orthographic camera');
const cover = (r, d) => r / Math.max(r, 0.5 * at * d);
assert.equal(cover(0.055, 20), 1, 'a near wire is all wire');
assert.ok(cover(0.055, 2000) > 0.03 && cover(0.055, 2000) < 0.1, `a wire two kilometres out is a faint line (${cover(0.055, 2000).toFixed(3)})`);
const mesh = createWireMesh(wire);
assert.ok(mesh.material.transparent && !mesh.material.depthWrite && mesh.material.fog, 'blended, writing no depth, fogged');
assert.equal(mesh.material.customProgramCacheKey(), 'world-wire-v1', 'one program for every map');
assert.ok(!mesh.castShadow, 'a wire casts nothing');
mesh.onBeforeRender({ getRenderTarget: () => ({ height: 720 }), getDrawingBufferSize: (v) => v.set(1920, 1080) }, null, camera);
// (the onBeforeRender pixel reaches the material's uniform through its compile closure: the material is not compiled
// here, so read it back through a patch of a fresh shader object with the same closure)
const probe = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} };
mesh.material.onBeforeCompile(probe);
assert.ok(Math.abs(probe.uniforms.uWirePixel.value - wirePixelAtOneMetre(camera, 720)) < 1e-12, 'the pixel is the target\'s being drawn (720 rows), not the canvas\'s');
mesh.geometry.dispose(); mesh.material.dispose();

// 4. the props owner
const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.match(props, /const wires = createWireMesh\(merged\);\n\s*wires\.name = 'props-pylon-wires';/, 'the conductors are one mesh on the wire material');
const scenery = readFileSync(new URL('./scenery.ts', import.meta.url), 'utf8');
assert.match(scenery, /wires\.push\(wire\);/, 'the composer hands the conductors over on their own');
assert.ok(!/ctx\.baked\.push\(wire\)/.test(scenery), 'never into the baked bucket');

console.log(`wireMaterial self-test passed: ribbons of ${segments * 2} triangles, the patched basic program (a half pixel either side at the least, alpha the cover), the target's pixel, a 2 km wire at ${(cover(0.055, 2000) * 100).toFixed(1)} % cover`);
