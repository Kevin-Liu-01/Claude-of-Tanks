// roadSurfaceShader.selftest (2026-10-14, the ground lane's R1c landing): the roads' GLSL moved out of terrain.ts into
// roadSurfaceShader.ts. terrain.ts interpolates each chunk once, in place inside splatCompute(), and the program the
// terrain material compiles carries both chunks verbatim and is exactly the text the source receipts read
// (terrainSourceText.mjs). At the move the evaluated SPLAT_COMMON_FRAG + SPLAT_NORMAL_FRAG was byte-identical before and
// after (304,243 chars, sha256 f8607385abb446f5…), measured on the R1c merge d1d66a5c8.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ROAD_CARRIAGEWAY_GLSL, ROAD_PAVING_GLSL } from './roadSurfaceShader.ts';
import { terrainSourceText, ROAD_SHADER_CHUNKS } from './terrainSourceText.mjs';
import { LAND_USE_GLSL } from './landUse.ts';
import { SEA_COAST_GLSL } from './edgeWater.ts';
import { buildTerrainMeshes, createLayout } from './terrain.ts';
import './maps/horizon.ts'; // installs the ring terrain meshes are built with (horizonRingHook.ts)
import { getMapConfig } from './maps/index.ts';

// 1. The chunks are plain GLSL: no template syntax of their own, and big enough to be the blocks that moved.
for (const [name, chunk] of [['carriageway', ROAD_CARRIAGEWAY_GLSL], ['paving', ROAD_PAVING_GLSL]]) {
  assert.ok(!chunk.includes('`') && !chunk.includes('${'), `the ${name} chunk is plain GLSL`);
  assert.ok(!chunk.startsWith('\n') && !chunk.endsWith('\n'), `the ${name} chunk replaces whole lines (no stray blank line)`);
}
assert.match(ROAD_CARRIAGEWAY_GLSL, /^ {4}\/\/ roads lane R1a \(2026-10-09/, 'the carriageway chunk opens on R1a');
assert.ok(ROAD_CARRIAGEWAY_GLSL.includes('if (dW > 0.002 && wR > 0.002 && uRoadSurf.x + uRoadSurf.y + uRoadSurf.z + uRoadSurfB.x > 0.0 && uLandTier > 0.5) {'),
  'the carriageway chunk is the worked carriageway (never on the Low tier)');
assert.match(ROAD_PAVING_GLSL, /^ {6}\/\/ roads lane R1c \(2026-10-09/, 'the paving chunk opens on R1c');
assert.ok(ROAD_PAVING_GLSL.includes('} else if (uLandTier < 0.5) {') && ROAD_PAVING_GLSL.includes('pnn = vec4(vec2(0.5) + pN, 0.5, 1.0);'),
  'the paving chunk holds the Low branch and ends on the paving normal');

// 2. terrain.ts interpolates each once, as a whole line, inside splatCompute() of SPLAT_COMMON_FRAG, carriageway first.
const raw = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const fragAt = raw.indexOf('const SPLAT_COMMON_FRAG = /* glsl */`');
const computeAt = raw.indexOf('void splatCompute() {', fragAt);
const fragEnd = raw.indexOf('\n`;\n', computeAt);
assert.ok(fragAt > 0 && computeAt > fragAt && fragEnd > computeAt, 'SPLAT_COMMON_FRAG and its splatCompute()');
const at = ROAD_SHADER_CHUNKS.map(([token]) => {
  assert.equal(raw.split(token).length, 2, `${token} interpolated exactly once`);
  const i = raw.indexOf(token);
  assert.ok(i > computeAt && i < fragEnd, `${token} sits inside splatCompute()`);
  assert.equal(raw[i - 1], '\n', `${token} starts its line`);
  assert.equal(raw[i + token.length], '\n', `${token} ends its line`);
  return i;
});
assert.ok(at[0] < at[1], 'the worked carriageway comes before the paving, as before the move');
assert.ok(/import \{ ROAD_CARRIAGEWAY_GLSL, ROAD_PAVING_GLSL \} from '\.\/roadSurfaceShader\.ts';/.test(raw), 'terrain.ts imports the chunks');

// 3. The program the terrain material compiles is the text the source receipts read: SPLAT_COMMON_FRAG as
// terrainSourceText() inlines it (its other two interpolations put in too) appears verbatim in the compiled fragment,
// and with it both road chunks.
const text = terrainSourceText();
const tStart = text.indexOf('const SPLAT_COMMON_FRAG = /* glsl */`') + 'const SPLAT_COMMON_FRAG = /* glsl */`'.length;
const tEnd = text.indexOf('\n`;\n', text.indexOf('void splatCompute() {', tStart)) + 1;
const body = text.slice(tStart, tEnd);
assert.deepEqual([...body.matchAll(/\$\{(\w+)\}/g)].map(m => m[1]), ['LAND_USE_GLSL', 'SEA_COAST_GLSL'],
  'every other interpolation of SPLAT_COMMON_FRAG accounted for');
// (the template literal evaluated as the module evaluates it: its escapes cooked, its two other chunks put in)
const expected = new Function('LAND_USE_GLSL', 'SEA_COAST_GLSL', `return \`${body}\`;`)(LAND_USE_GLSL, SEA_COAST_GLSL);

const originals = { document: globalThis.document, Image: globalThis.Image, ImageData: globalThis.ImageData };
globalThis.ImageData = class { constructor(data) { this.data = data; } };
globalThis.Image = class {
  width = 8; height = 8;
  set src(value) { this.url = value; queueMicrotask(() => this.onload?.()); }
};
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    }, { get(target, key) { return target[key] ?? (() => {}); } });
    canvas.getContext = () => context;
    return canvas;
  },
};
try {
  const config = getMapConfig('verdant');
  const field = { getHeightAt: () => 0, _layout: createLayout(config), _mesaW: null };
  const group = buildTerrainMeshes(field, {
    anisotropy: 4,
    setupShadowMaterial(material, hook) { material.onBeforeCompile = shader => hook?.(shader); },
  }, config);
  await group.userData.sourcedTexturesReady;
  const material = group.children.find(child => child.isMesh && child.name !== 'horizon-ring')?.material;
  assert.ok(material?.onBeforeCompile, 'the terrain material');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, null);
  const frag = shader.fragmentShader;
  assert.ok(frag.includes(expected), 'the compiled fragment carries SPLAT_COMMON_FRAG exactly as the source receipts read it');
  for (const [name, chunk] of [['carriageway', ROAD_CARRIAGEWAY_GLSL], ['paving', ROAD_PAVING_GLSL]]) {
    assert.equal(frag.split(chunk).length, 2, `the compiled fragment carries the ${name} chunk once, verbatim`);
  }
  for (const name of ['uRoadSurf', 'uRoadSurfB', 'uPaveClass', 'uPaveWear', 'uPaveTown', 'uPaveExtra']) {
    assert.ok(shader.uniforms[name], `the material binds ${name} for the chunks`);
  }
} finally {
  for (const [name, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
  }
}

console.log(`roadSurfaceShader: the roads' two GLSL chunks (${ROAD_CARRIAGEWAY_GLSL.split('\n').length} + ${ROAD_PAVING_GLSL.split('\n').length} lines) `
  + 'interpolated once each inside splatCompute(), and the compiled terrain program is the text the source receipts read');
