// Ground lane (2026-10-03, the GPU fix): the land-use bake. The terrain material reads the field system baked once per
// map from its CPU twin (landUse.ts bakeLandUseSteps), stacked under the ground mask (terrain.ts stackLandUseBake), in
// place of deriving the parcels per pixel. Pins: the bake equals landUseAt at its texels (crop, flags, jitter and the
// row's turn exactly; the signed edge offsets within half a 4 mm step); the material's reconstruction of the boundary
// distance — the texel's offsets carried to the point along the warped grid — equals the twin's at arbitrary points (a
// filtered unsigned distance clipped the zero at every boundary line and lost the walls, bunds and ditches); the build
// slices the bake; the stack keeps the mask and the bake apart (rows, gutters, mip levels 1–5) and addresses both; and
// the GLSL decodes this packing on the twin's own warp. No GPU or art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  LAND_BAKE_ALONG_U_BIT, LAND_BAKE_HEDGE_BIT, LAND_BAKE_LAYERS, LAND_BAKE_TRACK_BIT, LAND_CROP_NONE, LAND_USE_GLSL, LAND_WARP_K_RANGE, bakeLandUseSteps,
  createLandFieldSample, landUseAt, landUseProfileIds, landUseUniformValues, resolveLandUseProfile,
} from './landUse.ts';
import { stackLandUseBake } from './terrain.ts';

const MAP = 1024;
const bake = (id, n) => {
  const out = new Uint8Array(n * n * 4 * LAND_BAKE_LAYERS);
  const steps = bakeLandUseSteps(resolveLandUseProfile(id), n, MAP, out, 64);
  let slices = 0;
  for (let r = steps.next(); !r.done; r = steps.next()) slices++;
  return { out, slices };
};
const offset = (hi, lo) => (hi * 256 + lo - 32768) / 256;
let rng = 0x2545f491;
const rand = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
// the warp's Jacobian a bake texel carries (layer C), decoded as the GLSL decodes it
const warpK = (out, C, t) => [0, 1, 2, 3].map((c) => (out[C + t + c] / 255 * 2 - 1) * LAND_WARP_K_RANGE);
// the warped grid (landUse.ts warpX / warpZ and the heading: the twin's own)
const grid = (id, x, z) => {
  const v = landUseUniformValues(resolveLandUseProfile(id)), warpM = Math.fround(v.landC[0]), heading = Math.fround(v.landA[1]);
  const wx = Math.sin(x * 0.00523 + z * 0.00311 + 1.3) + 0.5 * Math.sin(x * -0.00197 + z * 0.00877 + 4.1);
  const wz = Math.sin(x * 0.00409 - z * 0.00587 + 2.7) + 0.5 * Math.sin(x * 0.00913 + z * 0.00241 + 0.6);
  const px = x + wx * warpM, pz = z + wz * warpM, ch = Math.cos(heading), sh = Math.sin(heading);
  return [ch * px + sh * pz, -sh * px + ch * pz];
};

// 1. every map's bake equals its twin at the texels (128² over the square: every field system, quickly)
const s = createLandFieldSample();
for (const id of landUseProfileIds()) {
  const n = 128, { out, slices } = bake(id, n), B = n * n * 4;
  assert.equal(slices, n / 64 - 1, `${id}: the bake yields every 64 rows (no long build step)`);
  for (let k = 0; k < 600; k++) {
    const i = Math.floor(rand() * n), j = Math.floor(rand() * n), t = (j * n + i) * 4;
    landUseAt(resolveLandUseProfile(id), ((i + 0.5) / n - 0.5) * MAP, ((j + 0.5) / n - 0.5) * MAP, s);
    assert.equal(out[t] & 31, s.active ? s.crop : LAND_CROP_NONE, `${id}: the crop at texel (${i}, ${j}) (a zoned land use's ground past its zones: LAND_CROP_NONE)`);
    assert.equal(!!(out[t] & LAND_BAKE_TRACK_BIT), s.track > 0, `${id}: the track flag`);
    assert.equal(!!(out[t] & LAND_BAKE_HEDGE_BIT), s.hedge > 0, `${id}: the hedge flag`);
    assert.ok(Math.abs((out[t + 1] >> 2) / 63 - s.jitter) <= 0.5 / 63 + 1e-9, `${id}: the field's jitter (six bits)`);
    assert.equal((out[t + 1] & 3) + 1, s.split, `${id}: the block's cut count`);
    assert.equal(!!(out[t] & LAND_BAKE_ALONG_U_BIT), !!s.alongU, `${id}: the block's cut axis`);
    const turn = (out[t + 2] * 256 + out[t + 3]) / 65536 * 2 * Math.PI;
    assert.ok(Math.hypot(Math.cos(turn) - s.rowX, Math.sin(turn) - s.rowZ) <= Math.PI / 65536 + 1e-9, `${id}: the row's turn within half a 16-bit step`);
    for (const [hi, lo, want] of [[out[B + t], out[B + t + 1], s.sU], [out[B + t + 2], out[B + t + 3], s.sV]]) {
      assert.ok(Math.abs(offset(hi, lo) - Math.max(-128, Math.min(65535 / 256 - 128, want))) <= 0.5 / 256 + 1e-9, `${id}: a signed edge offset within half a 4 mm step (±128 m)`);
    }
    assert.ok(Math.abs(Math.min(Math.abs(s.sU), Math.abs(s.sV)) - s.edgeM) < 1e-9, `${id}: the twin's offsets are its edge distance`);
    // layer C: the warp's metres times its Jacobian at the texel's centre — against the twin's own warp by central
    // differences (2 cm), within half an 8-bit step of the ±0.32 range
    const cx = ((i + 0.5) / n - 0.5) * MAP, cz = ((j + 0.5) / n - 0.5) * MAP, h = 0.02;
    const v = landUseUniformValues(resolveLandUseProfile(id)), warpM = v.landC[0], heading = Math.fround(v.landA[1]);
    const unrot = (x, z) => { const [u, w] = grid(id, x, z), ch = Math.cos(heading), sh = Math.sin(heading); return [ch * u - sh * w - x, sh * u + ch * w - z]; };
    const [ax, az] = unrot(cx + h, cz), [bx, bz] = unrot(cx - h, cz), [cxp, czp] = unrot(cx, cz + h), [dx, dz] = unrot(cx, cz - h);
    const fd = [(ax - bx) / (2 * h), (cxp - dx) / (2 * h), (az - bz) / (2 * h), (czp - dz) / (2 * h)];
    const K = warpK(out, 2 * B, t);
    for (let c = 0; c < 4; c++) {
      assert.ok(Math.abs(fd[c]) < LAND_WARP_K_RANGE, `${id}: the warp's Jacobian inside the code's range (${fd[c].toFixed(3)}, warp ${warpM} m)`);
      assert.ok(Math.abs(K[c] - fd[c]) <= LAND_WARP_K_RANGE / 255 + 1e-4, `${id}: layer C's Jacobian entry ${c} (${K[c].toFixed(4)} vs ${fd[c].toFixed(4)})`);
    }
  }
}

// 2. the material's reconstruction (the GLSL lu_field on the CPU): the texel's offsets carried to an arbitrary point
// along the warped grid give the twin's boundary distance there, at the desktop scale (512² over 1024 m, 2 m texels)
{
  const n = 512, errors = [];
  let pointsNear = 0, otherField = 0;
  for (const id of ['verdant', 'frontier', 'coastal', 'saltwind', 'delta', 'polders']) {
    const { out } = bake(id, n), B = n * n * 4;
    for (let k = 0; k < 6000; k++) {
      const x = (rand() - 0.5) * (MAP - 8), z = (rand() - 0.5) * (MAP - 8);
      landUseAt(resolveLandUseProfile(id), x, z, s);
      if (s.edgeM > 10) continue; // a texel's nearer edge is the point's own whenever the edge is near
      const i = Math.min(n - 1, Math.max(0, Math.floor((x / MAP + 0.5) * n))), j = Math.min(n - 1, Math.max(0, Math.floor((z / MAP + 0.5) * n)));
      const t = (j * n + i) * 4, v = landUseUniformValues(resolveLandUseProfile(id));
      // the GLSL's lu_decode: the texel's offsets carried to the point through layer C's Jacobian and the heading
      const dpx = x - ((i + 0.5) / n - 0.5) * MAP, dpz = z - ((j + 0.5) / n - 0.5) * MAP, K = warpK(out, 2 * B, t);
      const dwx = dpx + K[0] * dpx + K[1] * dpz, dwz = dpz + K[2] * dpx + K[3] * dpz;
      const ch = Math.fround(Math.cos(v.landA[1])), sh = Math.fround(Math.sin(v.landA[1]));
      const tU = offset(out[B + t], out[B + t + 1]), tV = offset(out[B + t + 2], out[B + t + 3]);
      const sU = tU + (ch * dwx + sh * dwz), sV = tV + (-sh * dwx + ch * dwz), crossU = sU * tU < 0, crossV = sV * tV < 0;
      const split = (out[t + 1] & 3) + 1, alongU = !!(out[t] & LAND_BAKE_ALONG_U_BIT);
      const wU = alongU ? v.landA[2] / split : v.landA[2], wV = alongU ? v.landA[3] : v.landA[3] / split;
      const eU = crossU ? Math.abs(sU) : Math.min(Math.abs(sU), wU - Math.abs(sU)), eV = crossV ? Math.abs(sV) : Math.min(Math.abs(sV), wV - Math.abs(sV));
      const edge = crossV === crossU ? Math.min(eU, eV) : crossV ? Math.abs(sV) : Math.abs(sU);
      errors.push(Math.abs(edge - s.edgeM));
      pointsNear++;
      if ((out[t] & 31) !== s.crop) otherField++;
    }
  }
  errors.sort((a, b) => a - b);
  const p99 = errors[Math.floor(errors.length * 0.99)], max = errors[errors.length - 1];
  const off = errors.filter((e) => e > 0.02).length;
  console.log(`landUseBake: rebuilt |d| p50 ${errors[errors.length >> 1].toFixed(4)} p99 ${p99.toFixed(4)} p99.9 ${errors[Math.floor(errors.length * 0.999)].toFixed(4)} max ${max.toFixed(4)}; ${off} of ${errors.length} beyond 2 cm`);
  assert.ok(errors[Math.floor(errors.length * 0.999)] <= 0.005, `the rebuilt boundary distance equals the twin's (p99.9 within 5 mm)`);
  // the rare stray: a point across a boundary from its texel's centre, near a corner of the neighbour it lies in (the
  // texel knows the crossed line, not the neighbour's other edge) — under a texel of the boundary, never more than one
  assert.ok(off / errors.length <= 0.001 && max <= 1.0, `strays are corner slivers (${off} beyond 2 cm, max ${max.toFixed(3)} m)`);
  assert.ok(otherField / pointsNear < 0.05, `the texel's crop is the point's own but within its texel of a boundary (${(100 * otherField / pointsNear).toFixed(2)} % of near points)`);
  console.log(`landUseBake: the rebuilt boundary distance |d| p99 ${p99.toFixed(4)} m, max ${max.toFixed(4)} m over ${pointsNear} points within 10 m of a boundary (2 m texels); the texel's crop differs from the point's on ${(100 * otherField / pointsNear).toFixed(2)} % of them (the boundary's own texels)`);
}

// 3. the stack: the mask's rows unchanged, two 64-row gutters, the bake's two layers padded to the mask's width, the
// mask and the bake on 64-row boundaries, and the uniforms that address them
for (const [W, n] of [[512, 512], [1536, 512], [256, 256]]) {
  const mask = new Uint8Array(W * W * 4);
  for (let k = 0; k < mask.length; k++) mask[k] = (k * 7 + (k >> 9)) & 255;
  const ground = new THREE.DataTexture(mask, W, W, THREE.RGBAFormat);
  ground.minFilter = THREE.LinearMipmapLinearFilter; ground.magFilter = THREE.LinearFilter; ground.generateMipmaps = true; ground.anisotropy = 4;
  const baked = new Uint8Array(n * n * 4 * LAND_BAKE_LAYERS);
  for (let k = 0; k < baked.length; k++) baked[k] = (k * 13 + 5) & 255;
  const st = stackLandUseBake(ground, baked, n);
  const H = st.texture.image.height, row0 = W + 128, data = st.texture.image.data;
  assert.equal(st.texture.image.width, W); assert.equal(H, W + 128 + LAND_BAKE_LAYERS * n, `${W}: the stack's height`);
  assert.ok(W % 64 === 0 && row0 % 64 === 0 && H % 64 === 0, `${W}: the mask and the bake start and end on 64-row boundaries`);
  assert.deepEqual(data.subarray(0, W * W * 4), mask, `${W}: the mask's rows unchanged`);
  for (const r of [W, W + 63]) assert.deepEqual(data.subarray(r * W * 4, (r + 1) * W * 4), mask.subarray((W - 1) * W * 4, W * W * 4), `${W}: the first gutter repeats the mask's last row`);
  for (const j of [0, 1, n - 1, n, 2 * n - 1, 2 * n, LAND_BAKE_LAYERS * n - 1]) {
    const row = data.subarray((row0 + j) * W * 4, (row0 + j + 1) * W * 4);
    assert.deepEqual(row.subarray(0, n * 4), baked.subarray(j * n * 4, (j + 1) * n * 4), `${W}: bake row ${j}`);
    if (W > n) assert.deepEqual(row.subarray((W - 1) * 4, W * 4), baked.subarray(((j + 1) * n - 1) * 4, (j + 1) * n * 4), `${W}: padded with its last texel`);
  }
  assert.deepEqual(data.subarray((W + 64) * W * 4, (W + 65) * W * 4), data.subarray(row0 * W * 4, (row0 + 1) * W * 4), `${W}: the second gutter repeats the bake's first row`);
  assert.equal(st.texture.flipY, false); assert.equal(st.texture.wrapT, THREE.ClampToEdgeWrapping);
  assert.equal(st.texture.minFilter, ground.minFilter, `${W}: the mask's own filtering (its mips) carried over`);
  assert.deepEqual(st.stack.toArray(), [W / H, 0.5 / W, 1 - 0.5 / W, 1 / H], `${W}: uMaskStack addresses the mask's rows`);
  assert.deepEqual(st.bake.toArray(), [n, 1024, row0, 1 / W], `${W}: uLandBake addresses the bake`);
  assert.ok(Math.abs((1 - 0.5 / W) * W / H * H - (W - 0.5)) < 1e-6, `${W}: maskAt's clamp keeps half a texel inside the mask`);
}
// the mips: the 2×2 box filter of the GPU's generateMipmap over the stack, levels 1–5 — the mask's rows reduce from the
// mask alone, the bake's from the bake alone, and the gutters hold only the replicas they started with (the halves never
// mix below level 6; the coordinator's acceptance, 2026-10-03)
{
  const W = 512, n = 512;
  const mask = new Uint8Array(W * W * 4), baked = new Uint8Array(n * n * 4 * LAND_BAKE_LAYERS);
  for (let k = 0; k < mask.length; k++) mask[k] = (k * 31 + (k >> 11) * 7) & 255;
  for (let k = 0; k < baked.length; k++) baked[k] = (k * 17 + (k >> 10) * 3 + 101) & 255;
  const st = stackLandUseBake(new THREE.DataTexture(mask, W, W, THREE.RGBAFormat), baked, n);
  const down = (src, w, h) => { // one level of the 2×2 box filter (float, so rounding never hides a mix)
    const out = new Float64Array((w / 2) * (h / 2) * 4);
    for (let y = 0; y < h / 2; y++) for (let x = 0; x < w / 2; x++) for (let c = 0; c < 4; c++) {
      const at = (yy, xx) => src[((2 * y + yy) * w + 2 * x + xx) * 4 + c];
      out[(y * (w / 2) + x) * 4 + c] = (at(0, 0) + at(0, 1) + at(1, 0) + at(1, 1)) / 4;
    }
    return out;
  };
  const H = st.texture.image.height, row0 = W + 128;
  let stack = Float64Array.from(st.texture.image.data), alone = Float64Array.from(mask);
  let bakeAlone = Float64Array.from(st.texture.image.data.subarray(row0 * W * 4, (row0 + LAND_BAKE_LAYERS * n) * W * 4));
  let w = W, h = H, mh = W, bh = LAND_BAKE_LAYERS * n, r0 = row0;
  for (let level = 1; level <= 5; level++) {
    stack = down(stack, w, h); alone = down(alone, w, mh); bakeAlone = down(bakeAlone, w, bh);
    w /= 2; h /= 2; mh /= 2; bh /= 2; r0 /= 2;
    assert.deepEqual(stack.subarray(0, w * mh * 4), alone, `level ${level}: the mask's rows reduce from the mask alone`);
    assert.deepEqual(stack.subarray(r0 * w * 4, (r0 + bh) * w * 4), bakeAlone, `level ${level}: the bake's rows reduce from the bake alone`);
    const g = (64 >> level) || 1;
    for (let k = 0; k < g; k++) {
      assert.deepEqual(stack.subarray((mh + k) * w * 4, (mh + k + 1) * w * 4), stack.subarray(mh * w * 4, (mh + 1) * w * 4), `level ${level}: the first gutter is one replicated row`);
      assert.deepEqual(stack.subarray((mh + g + k) * w * 4, (mh + g + k + 1) * w * 4), stack.subarray((mh + g) * w * 4, (mh + g + 1) * w * 4), `level ${level}: the second gutter is one replicated row`);
    }
  }
}
{
  const ground = new THREE.DataTexture(new Uint8Array(64 * 64 * 4), 64, 64, THREE.RGBAFormat);
  const st = stackLandUseBake(ground, null, 64);
  assert.equal(st.texture, ground, 'a map without a field system keeps its mask texture as it was');
  assert.deepEqual(st.stack.toArray(), [1, 0.5 / 64, 1 - 0.5 / 64, 1 / 64]);
}

// 4. the GLSL decodes this packing on the twin's own warp
for (const decode of ['a = texelFetch(uMask, t + ivec2(0, row0), 0);', 'b = texelFetch(uMask, t + ivec2(0, row0 + int(n)), 0);',
  'k = texelFetch(uMask, t + ivec2(0, row0 + 2 * int(n)), 0);', 'vec2 dp = p - ((vec2(t) + 0.5) / n - 0.5) * uLandBake.y;',
  `vec4 K = (k * 2.0 - 1.0) * ${LAND_WARP_K_RANGE};`, 'vec2 dw = dp + vec2(K.x * dp.x + K.y * dp.y, K.z * dp.x + K.w * dp.y);',
  'vec2 d = vec2(uLandRot.x * dw.x + uLandRot.y * dw.y, -uLandRot.y * dw.x + uLandRot.x * dw.y);', 'crop = float(r & 31);',
  `(r & ${LAND_BAKE_TRACK_BIT}) != 0 ? 1.0 - smoothstep(1.6, 2.6, abs(sV))`, `(r & ${LAND_BAKE_HEDGE_BIT}) != 0 ? 1.0 - smoothstep(1.2, 2.4, abs(sU))`,
  'float tU = (b.r * 65280.0 + b.g * 255.0 - 32768.0) / 256.0, tV = (b.b * 65280.0 + b.a * 255.0 - 32768.0) / 256.0;',
  'float sU = tU + d.x, sV = tV + d.y;', 'bool crossU = sU * tU < 0.0, crossV = sV * tV < 0.0;',
  'edgeM = crossV == crossU ? min(eU, eV) : crossV ? abs(sV) : abs(sU);', 'float wU = alongU ? uLandA.z / split : uLandA.z, wV = alongU ? uLandA.w : uLandA.w / split;', 'float turn = (a.b * 65280.0 + a.a * 255.0) * (6.2831853 / 65536.0);', 'jitter = float(g >> 2) / 63.0;']) {
  assert.ok(LAND_USE_GLSL.includes(decode), `the GLSL decodes the bake: ${decode}`);
}
const twin = readFileSync(new URL('./landUse.ts', import.meta.url), 'utf8');
for (const k of ['0.00523', '0.00311', '-0.00197', '0.00877', '0.00409', '0.00587', '0.00913', '0.00241']) {
  assert.ok(twin.split(k).length >= 3, `warp coefficient ${k} appears in both the twin's warp and the bake's Jacobian`);
}
assert.ok(!/sampler2D/.test(LAND_USE_GLSL), 'the land use declares no sampler: it reads the ground mask\'s (the material sits at 16 units)');
console.log('landUseBake: the bake equals the twin at its texels on every map, the rebuilt boundary distance equals the twin\'s, sliced in 64-row steps; the stack keeps the mask and the bake apart (rows, gutters, mip levels 1–5) and addresses both; the GLSL decodes the packing on the twin\'s warp PASS; no GPU/art claim');
