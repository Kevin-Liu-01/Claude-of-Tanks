import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Color, IcosahedronGeometry, ShaderLib, SRGBColorSpace } from 'three';
import {
  applyCanopyDiffuseWrap, buildTreeTrunkAuditGeometry, createGarageTreeKit,
  prepareTreeBarkSurface, shapeTreeSnowLobe,
} from './vegetation.ts';

const directAnchor = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
for (const wrap of [0.30, 0.50]) {
  const shader = { fragmentShader: ShaderLib.standard.fragmentShader };
  applyCanopyDiffuseWrap(shader, wrap);
  assert.ok(!shader.fragmentShader.includes(directAnchor),
    'the installed Three.js physical-light function is actually patched');
  const expression = shader.fragmentShader.match(
    /float canopyDiffuseNL = saturate\( \( canopyRawNL \+ ([\d.]+) \) \* ([\d.]+) \) \* ([\d.]+);/,
  );
  assert.ok(expression, 'light wrap uses the current geometryNormal parameter');
  assert.doesNotMatch(shader.fragmentShader, /canopyDiffuseNL = canopyDiffuseNL \*/,
    'solid bark keeps its existing directional response, without leaf-volume scattering');
  assert.match(shader.fragmentShader,
    /float canopyRawNL = dot\( geometryNormal, directLight.direction \);\s+float dotNL = saturate\( canopyRawNL \);\s+vec3 irradiance = dotNL \* directLight.color;/,
    'standard irradiance retains the true clamped incidence for microfacet specular');
  assert.match(shader.fragmentShader,
    /reflectedLight\.directSpecular \+= irradiance \* BRDF_GGX_Multiscatter\(/,
    'GGX is still gated by the original zero-at-backface irradiance');
  assert.match(shader.fragmentShader,
    /reflectedLight\.directDiffuse \+= canopyDiffuseNL \* directLight\.color \* BRDF_Lambert\(/,
    'the wider light lobe is confined to Lambert diffuse');
  assert.equal(Number(expression[1]), wrap);
  const gain = Number(expression[2]);
  const energy = Number(expression[3]);
  const response = (incidence) => Math.max(0, Math.min(1, (incidence + wrap) * gain)) * energy;
  assert.ok(response(1) < 0.8 && response(1) > 0.6,
    'sun-facing foliage has highlight headroom instead of an additive glow');
  assert.ok(response(0) > 0.15 && response(-1) === 0,
    'off-axis leaves get scattering while deep back-facing crevices stay dark');
  // Integrate over sphere incidence. A plain clamped cosine integrates to
  // 0.5 here; widening the lobe must redistribute rather than create energy.
  let integrated = 0;
  for (let sample = 0; sample < 2000; sample++) {
    integrated += response(-1 + (sample + 0.5) / 1000) / 1000;
  }
  assert.ok(Math.abs(integrated - 0.5) < 0.00001,
    'the wrapped lobe keeps the original diffuse energy budget');

  // At roughness 1, Smith visibility is 0.5 / max(N.L + N.V, EPSILON).
  // Double-sided bent canopy normals can have BOTH dots <= 0. A diffuse
  // wrap accidentally fed into GGX then multiplies its 1/EPSILON endpoint
  // by positive light, making entire cards bloom even though albedo is dark.
  let worstSpecularGate = 0;
  let brokenWrappedSpecularGate = 0;
  for (const nl of [-1, -0.3, -0.05, 0, 0.001, 0.2, 1]) {
    for (const nv of [-1, -0.2, 0, 0.001, 0.4, 1]) {
      const clampedNL = Math.max(0, nl);
      const visibility = 0.5 / Math.max(clampedNL + Math.max(0, nv), 1e-6);
      worstSpecularGate = Math.max(worstSpecularGate, clampedNL * visibility);
      brokenWrappedSpecularGate = Math.max(brokenWrappedSpecularGate, response(nl) * visibility);
    }
  }
  assert.ok(worstSpecularGate <= 0.5,
    'the true irradiance cancels the grazing/backface GGX singularity');
  assert.ok(brokenWrappedSpecularGate > 10000,
    'the regression fixture reaches the formerly blooming configuration');
}
assert.throws(() => applyCanopyDiffuseWrap({ fragmentShader: 'changed shader' }, 0.5),
  /anchor/, 'future Three.js shader drift fails explicitly instead of disabling scattering');
const unchanged = { fragmentShader: ShaderLib.standard.fragmentShader };
applyCanopyDiffuseWrap(unchanged, 0);
assert.equal(unchanged.fragmentShader, ShaderLib.standard.fragmentShader);

const matte = { fragmentShader: ShaderLib.standard.fragmentShader };
applyCanopyDiffuseWrap(matte, 0.50, true);
assert.doesNotMatch(matte.fragmentShader,
  /reflectedLight\.directSpecular \+= irradiance \* BRDF_GGX_Multiscatter\(/,
  'volume-normal leaf cards cannot produce a white microfacet grazing lobe');
assert.match(matte.fragmentShader,
  /reflectedLight\.directDiffuse \+= canopyDiffuseNL \* directLight\.color \* BRDF_Lambert\(/,
  'matte leaves still receive the directional, energy-normalized diffuse light');
assert.match(matte.fragmentShader, /void RE_IndirectSpecular_Physical\(/,
  'the existing IBL and its indirect diffuse bounce remain available');

// Exercise the actual installed matte expression, not a parallel test-only
// approximation. A spherical isotropic lobe is 0.25 in this normalization.
const volume = matte.fragmentShader.match(/canopyDiffuseNL = canopyDiffuseNL \* ([\d.]+) \+ ([\d.]+);/);
assert.ok(volume, 'matte sprays redistribute directional diffuse into volume scattering');
const directionalShare = Number(volume[1]);
const isotropicShare = Number(volume[2]);
const matteWrap = matte.fragmentShader.match(/float canopyDiffuseNL = saturate\( \( canopyRawNL \+ ([\d.]+) \) \* ([\d.]+) \) \* ([\d.]+);/);
assert.ok(matteWrap);
const matteResponse = (n) => directionalShare
  * Math.max(0, Math.min(1, (n + Number(matteWrap[1])) * Number(matteWrap[2])))
  * Number(matteWrap[3]) + isotropicShare;
let volumeIntegral = 0;
let previousResponse = matteResponse(-1);
for (let sample = 0; sample < 2000; sample++) {
  const response = matteResponse(-1 + (sample + 0.5) / 1000);
  assert.ok(Number.isFinite(response) && response >= 0 && response <= 0.55,
    'all incidences retain highlight headroom and finite nonnegative diffuse');
  assert.ok(response >= previousResponse && response - previousResponse < 0.001,
    'the lobe stays continuous and monotonic, without a grazing-angle step');
  previousResponse = response;
  volumeIntegral += response / 1000;
}
assert.ok(Math.abs(volumeIntegral - 0.5) < 0.00001,
  'volume scattering preserves the original integrated diffuse energy');
assert.ok(Math.abs(0.70 * 0.5 + 2 * 0.15 - 0.5) > 0.1,
  'the fixture rejects an unnormalized additive brightness floor');
assert.ok(matteResponse(-0.25532) > 0.15 && matteResponse(0.99147) > 0.53,
  'measured Autumn rear incidence keeps color while sun-facing leaves remain directional');
assert.equal(matteResponse(-1) * 0, 0, 'no incoming light means no direct diffuse emission');
assert.match(matte.fragmentShader,
  /float dotNL = saturate\( canopyRawNL \);\s+vec3 irradiance = dotNL \* directLight.color;/,
  'volume scattering cannot reach the original microfacet irradiance');

for (const radius of [0.25, 0.34, 0.70]) {
  const snow = new IcosahedronGeometry(radius, 0);
  const position = snow.getAttribute('position');
  const original = position.array.slice();
  const attributeBytes = Object.values(snow.attributes).reduce((bytes, item) => bytes + item.array.byteLength, 0);
  let calls = 0;
  shapeTreeSnowLobe(snow, () => ((++calls * 0.61803398875) % 1));
  assert.equal(position.count, 60, 'snow still uses the same twenty triangles');
  assert.equal(Object.values(snow.attributes).reduce((bytes, item) => bytes + item.array.byteLength, 0), attributeBytes,
    'snow shaping reuses its original GPU attributes');
  const corners = new Map();
  let expectedCalls = 0;
  for (let index = 0; index < position.count; index++) {
    const key = Array.from(original.slice(index * 3, index * 3 + 3)).join(',');
    const point = Array.from(position.array.slice(index * 3, index * 3 + 3));
    if (Math.hypot(original[index * 3], original[index * 3 + 2]) > 1e-4) expectedCalls += 2;
    if (corners.has(key)) assert.deepEqual(point, corners.get(key),
      'duplicated corners remain coincident instead of tearing into foil triangles');
    else corners.set(key, point);
    const normal = snow.getAttribute('normal');
    assert.ok(Math.abs(Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index)) - 1) < 1e-6);
    assert.equal(snow.getAttribute('uv').getX(index), -1, 'snow is tagged before the bark merge');
  }
  assert.equal(calls, expectedCalls, 'seeded downstream snow placements keep their RNG sequence');
  snow.dispose();
}

for (const species of ['pine', 'birch']) {
  for (const seed of [0x71ee, 0x8b3d, 0xc041]) {
    const tree = buildTreeTrunkAuditGeometry(species, seed, { snow: 0.9 });
    const uv = tree.getAttribute('uv');
    const color = tree.getAttribute('color');
    const initialUV = uv.array.slice();
    const initialColor = color.array.slice();
    const positionBuffer = tree.getAttribute('position').array;
    prepareTreeBarkSurface(tree, 0.5);
    assert.equal(tree.getAttribute('position').array, positionBuffer,
      'surface separation cannot change the trunk/collision shape');
    let snowVertices = 0, barkVertices = 0;
    for (let index = 0; index < uv.count; index++) {
      if (initialUV[index * 2] < 0) {
        snowVertices++;
        assert.equal(uv.getX(index), 248 / 256);
        assert.equal(uv.getY(index), 0.5);
        assert.deepEqual(Array.from(color.array.slice(index * 3, index * 3 + 3)),
          Array.from(initialColor.slice(index * 3, index * 3 + 3)),
          'snow samples neutral albedo/normal without added brightness compensation');
      } else {
        barkVertices++;
        assert.ok(uv.getX(index) >= 2 / 256 && uv.getX(index) <= 238 / 256,
          'every actual bark face stays inside the padded bark tile');
        const originalLuma = initialColor[index * 3] * 0.2126
          + initialColor[index * 3 + 1] * 0.7152 + initialColor[index * 3 + 2] * 0.0722;
        if (originalLuma <= 0.065) {
          assert.ok(Math.abs(color.getX(index) * 0.5 - initialColor[index * 3]) < 1e-7,
            'dark bark restores the authored reflectance lost to the sheet multiplier');
        } else if (originalLuma >= 0.12) {
          assert.equal(color.getX(index), initialColor[index * 3],
            'already-pale bark keeps its existing reflectance and highlight headroom');
        }
      }
    }
    assert.ok(snowVertices >= 60 && barkVertices >= 600,
      'the fixture exercises real snow lobes and a complete branched trunk');
    const packed = uv.array.slice();
    prepareTreeBarkSurface(tree, 0.5);
    assert.deepEqual(uv.array, packed, 'surface packing cannot compound if preparation is repeated');
    tree.dispose();
  }
}

// The real needle painter only needs this small Canvas2D recording surface.
// Capture its CSS colors, without requiring WebGL or fabricating raster pixels.
const strokes = [];
const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = { width: 0, height: 0 };
      const context = {
        clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        getImageData: () => ({ width: canvas.width, height: canvas.height,
          data: new Uint8ClampedArray(canvas.width * canvas.height * 4) }),
        putImageData() {},
        set strokeStyle(value) { strokes.push(value); },
      };
      canvas.getContext = () => context;
      return canvas;
    },
  },
});
try {
  for (let variant = 0; variant < 3; variant++) {
    const kit = createGarageTreeKit({}, null, 'pine', 2001, variant);
    assert.equal(kit.foliageMaterial.map.colorSpace, SRGBColorSpace,
      'Canvas-encoded needle colors are decoded exactly once by the material');
    assert.equal(kit.foliageMaterial.map.image.width, 256);
    assert.equal(kit.foliageMaterial.map.image.height, 256);
    // 2026-09-11 root collar/ridge trim (two-ring flares, single-segment
    // ridges) keeps the reviewed root silhouette at 768 trunk vertices.
    assert.equal(kit.trunk.getAttribute('position').count, 768);
    assert.equal(kit.foliage.getAttribute('position').count, 300,
      'the lighting repair does not add foliage cards or vertices');
    kit.dispose();
  }
} finally {
  if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
  else delete globalThis.document;
}
assert.equal(strokes.length, 95 * 3, 'each unchanged needle atlas retains 95 seeded sprays');
const colors = strokes.map((style) => new Color(style));
const luminances = colors.map((color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722);
assert.ok(Math.min(...luminances) > 0.12 && Math.max(...luminances) < 0.30,
  'needle reflectance stays readable but below the pale highlight plateau');
assert.ok(Math.max(...luminances) - Math.min(...luminances) > 0.08,
  'the atlas retains layered spray values rather than one flat evergreen fill');
assert.ok(colors.every((color) => color.g > Math.max(color.r, color.b) * 1.6),
  'living needles retain evergreen chroma under the warm sun key');

const source = await readFile(new URL('./vegetation.ts', import.meta.url), 'utf8');
assert.equal((source.match(/texture2D\(/g) || []).length, 4,
  'foliage detail stays within the existing four texture-fetch expressions');
assert.equal((source.match(/new THREE\.(?:CanvasTexture|DataTexture|Texture)\(/g) || []).length, 6,
  'no extra texture source is introduced by the lighting repair');
assert.doesNotMatch(source, /diffuseColor\.rgb \+= diffuseColor\.rgb \* rim/,
  'camera-angle albedo glow cannot return alongside energy-normalized scattering');
assert.match(source, /_cc\.setHSL\(h, s, l, THREE\.LinearSRGBColorSpace\)/,
  'the procedural palette explicitly documents its linear-reflectance convention');
assert.match(source, /normal = normalize\( vNormal \)/,
  'double-sided cards keep their authored canopy-volume normals');

console.log('vegetationLighting.selftest: shader wrap, reflectance, joined snow/atlas and fixed resource budget passed');
