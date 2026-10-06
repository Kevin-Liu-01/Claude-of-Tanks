/**
 * The telegraph poles' timber (the scenery lane, after gauntlet wave 57: Frosthollow's "beige column" was a pole).
 *
 * The sourced pole (telephone_pole_polygoogle) and its distance stand-in paint the shaft and the arms one flat wood tone
 * (sRGB 172, 158, 126 on the sourced model) on the untextured baked material: a pale, grainless column on snow, a
 * plastic one on grass. markPoleTimber finds the wood by that tone, whitens it and tags its grain axis; the poles' own
 * material (applyPoleTimberHook, over the props grime hook) paints it as weathered timber — creosote-dark through
 * greyed brown to silvered by instance (the arid maps' sun-bleached toward silver), fibre streaks and a few seasoning
 * checks along the grain, a ragged, soil-stained foot. The insulators and the steel keep their baked tones.
 */
import * as THREE from 'three';

type PoleShader = Parameters<THREE.Material['onBeforeCompile']>[0];

/** The wood tones the pole models bake: the sourced shaft and arms, the distance pole's trunk and its arms and braces. */
const POLE_WOOD_TONES: ReadonlyArray<readonly [number, number, number]> = [
  [0.41, 0.34, 0.21], [0.43, 0.34, 0.23], [0.29, 0.23, 0.17],
];

function isPoleWood(r: number, g: number, b: number): boolean {
  return POLE_WOOD_TONES.some(([wr, wg, wb]) => Math.abs(r - wr) < 0.012 && Math.abs(g - wg) < 0.012 && Math.abs(b - wb) < 0.012);
}

/**
 * Mark a pole geometry's timber, in place: each wood vertex white (the shader paints it) with `aPoleWood` 1 on a piece
 * whose grain runs up the pole (the shaft, a peg, a brace) or 2 on one at least a metre across (an arm, its grain along
 * local x), and 0 on everything else. A piece is a connected run of wood triangles. The geometry is returned; one
 * already marked is refused, so a cached source geometry must be cloned first.
 */
export function markPoleTimber(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.getAttribute('aPoleWood')) throw new Error('world/poleTimber: this geometry is already marked');
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  if (!position || !color) throw new Error('world/poleTimber: a pole needs positions and baked vertex tones');
  const count = position.count;
  const wood = new Uint8Array(count);
  for (let i = 0; i < count; i++) wood[i] = isPoleWood(color.getX(i), color.getY(i), color.getZ(i)) ? 1 : 0;
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const index = geometry.index;
  const corners = index ? index.count : count;
  for (let t = 0; t + 2 < corners; t += 3) {
    const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
    if (!wood[a] || !wood[b] || !wood[c]) continue;
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
  }
  const minX = new Float32Array(count).fill(Infinity), maxX = new Float32Array(count).fill(-Infinity);
  for (let i = 0; i < count; i++) {
    if (!wood[i]) continue;
    const root = find(i), x = position.getX(i);
    minX[root] = Math.min(minX[root], x);
    maxX[root] = Math.max(maxX[root], x);
  }
  const axis = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    if (!wood[i]) continue;
    const root = find(i);
    axis[i] = maxX[root] - minX[root] >= 1 ? 2 : 1;
    color.setXYZ(i, 1, 1, 1);
  }
  color.needsUpdate = true;
  geometry.setAttribute('aPoleWood', new THREE.BufferAttribute(axis, 1));
  return geometry;
}

/**
 * The sourced pole's shaft made round (gauntlet wave 66: "a straight, flat-faced, constant-width beam … no round
 * section, taper", "one hard vertical brightness seam"): its eight flat-shaded faces (the wood triangles that run most
 * of the model's height) out, a frustum of `sides` faces in, its normals smooth and leaning with the taper, from the
 * butt's girth to `taper` of it at the top (where the model's collar sits). In place on an indexed geometry with baked
 * vertex tones; the new wood carries the shaft's tone, so markPoleTimber marks it after. Refused on a geometry with no
 * shaft (or one already marked: its wood is white).
 */
export function roundPoleShaft(geometry: THREE.BufferGeometry, sides = 12, taper = 0.7): THREE.BufferGeometry {
  if (geometry.getAttribute('aPoleWood')) throw new Error('world/poleTimber: round the shaft before marking the timber');
  const position = geometry.getAttribute('position'), color = geometry.getAttribute('color');
  const normal = geometry.getAttribute('normal'), index = geometry.index;
  if (!position || !color || !normal || !index) throw new Error('world/poleTimber: a pole needs an indexed mesh with tones');
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < position.count; i++) { minY = Math.min(minY, position.getY(i)); maxY = Math.max(maxY, position.getY(i)); }
  const wood = (v: number): boolean => isPoleWood(color.getX(v), color.getY(v), color.getZ(v));
  const kept: number[] = [], shaft = new Set<number>();
  for (let t = 0; t + 2 < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
    const y0 = Math.min(position.getY(a), position.getY(b), position.getY(c));
    const y1 = Math.max(position.getY(a), position.getY(b), position.getY(c));
    if (wood(a) && wood(b) && wood(c) && y1 - y0 > 0.8 * (maxY - minY)) { shaft.add(a); shaft.add(b); shaft.add(c); }
    else kept.push(a, b, c);
  }
  if (shaft.size < 6) throw new Error('world/poleTimber: no shaft runs the pole\'s height');
  let cx = 0, cz = 0, y0 = Infinity, y1 = -Infinity;
  for (const v of shaft) { cx += position.getX(v); cz += position.getZ(v); y0 = Math.min(y0, position.getY(v)); y1 = Math.max(y1, position.getY(v)); }
  cx /= shaft.size; cz /= shaft.size;
  let r0 = 0;
  for (const v of shaft) r0 = Math.max(r0, Math.hypot(position.getX(v) - cx, position.getZ(v) - cz));
  const r1 = r0 * taper, slope = (r0 - r1) / (y1 - y0);
  const tone = [color.getX([...shaft][0]), color.getY([...shaft][0]), color.getZ([...shaft][0])];
  const base = position.count, ring = sides;
  const pos = new Float32Array((base + ring * 2) * 3), nor = new Float32Array((base + ring * 2) * 3), col = new Float32Array((base + ring * 2) * 3);
  pos.set(position.array as ArrayLike<number>); nor.set(normal.array as ArrayLike<number>); col.set(color.array as ArrayLike<number>);
  for (let k = 0; k < ring; k++) {
    const a = (k / ring) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), nl = Math.hypot(1, slope);
    for (const [row, y, r] of [[0, y0, r0], [1, y1, r1]] as const) {
      const v = base + row * ring + k;
      pos[v * 3] = cx + ca * r; pos[v * 3 + 1] = y; pos[v * 3 + 2] = cz + sa * r;
      nor[v * 3] = ca / nl; nor[v * 3 + 1] = slope / nl; nor[v * 3 + 2] = sa / nl;
      col[v * 3] = tone[0]; col[v * 3 + 1] = tone[1]; col[v * 3 + 2] = tone[2];
    }
    const k1 = (k + 1) % ring;
    // counter-clockwise from outside (the angle runs from +x toward +z, so outward faces wind a, top-of-a, b)
    kept.push(base + k, base + ring + k, base + k1, base + k1, base + ring + k, base + ring + k1);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(kept), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function mustReplace(source: string, anchor: string, replacement: string): string {
  const out = source.replace(anchor, replacement);
  if (out === source) throw new Error(`world/poleTimber: shader anchor missing: ${anchor}`);
  return out;
}

/**
 * The poles' material hook, applied after the props grime hook (it anchors on that hook's declarations and runs its
 * timber ahead of the grime, the weathering and the snow load, which then fall on the wood as on any prop).
 * `arid`: the desert maps' poles, sun-bleached toward silver, their feet sand-scoured rather than soil-dark.
 */
export function applyPoleTimberHook(shader: PoleShader, arid: boolean): void {
  shader.uniforms.uPoleArid = { value: arid ? 1 : 0 };
  shader.vertexShader = mustReplace(shader.vertexShader, 'varying vec3 vGrimeW;\nvarying vec3 vGrimeN;',
    'varying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nattribute float aPoleWood;\nvarying float vPoleWood;\nvarying vec3 vPoleL;\nvarying float vPoleSeed;');
  shader.vertexShader = mustReplace(shader.vertexShader, '  vGrimeN = normalize(mat3(modelMatrix) * gn);\n}', /* glsl */`  vGrimeN = normalize(mat3(modelMatrix) * gn);
  vPoleWood = aPoleWood;
  vPoleL = transformed;
  vPoleSeed = 0.5;
  #ifdef USE_INSTANCING
  vPoleSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  #endif
}`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, 'uniform sampler2D uGrime;', `uniform sampler2D uGrime;
varying float vPoleWood;
varying vec3 vPoleL;
varying float vPoleSeed;
uniform float uPoleArid;`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`#include <map_fragment>
if (vPoleWood > 0.5) {
  // the timber's tone by instance: creosote-dark, greyed brown, a few silvered; the arid maps' bleached toward silver
  float poleT = vPoleSeed;
  float poleT2 = fract(vPoleSeed * 7.31 + 0.27);
  vec3 poleTone = mix(vec3(0.13, 0.108, 0.086), vec3(0.19, 0.168, 0.142), smoothstep(0.05, 0.75, poleT));
  poleTone = mix(poleTone, vec3(0.24, 0.232, 0.216), smoothstep(0.78, 1.0, poleT) * 0.8);
  poleTone = mix(poleTone, mix(vec3(0.21, 0.19, 0.16), vec3(0.29, 0.278, 0.256), poleT), uPoleArid);
  poleTone *= vec3(1.0 + (poleT2 - 0.5) * 0.08, 1.0, 1.0 - (poleT2 - 0.5) * 0.08);
  // the grain runs up the shaft (four grime tiles round it, so the seam closes) and along an arm; the gradients come
  // from the seam-free angle, so the seam keeps its mip
  float poleArm = step(1.5, vPoleWood);
  vec2 poleR = vPoleL.xz;
  float poleR2 = max(dot(poleR, poleR), 1e-5);
  float poleAround = atan(poleR.y, poleR.x) * 0.63662;
  vec2 poleG = mix(vec2(poleAround, vPoleL.y * 0.035), vec2((vPoleL.y + vPoleL.z) * 2.5, vPoleL.x * 0.035), poleArm);
  vec2 poleGx = mix(vec2((poleR.x * dFdx(poleR.y) - poleR.y * dFdx(poleR.x)) / poleR2 * 0.63662, dFdx(vPoleL.y) * 0.035),
    vec2((dFdx(vPoleL.y) + dFdx(vPoleL.z)) * 2.5, dFdx(vPoleL.x) * 0.035), poleArm);
  vec2 poleGy = mix(vec2((poleR.x * dFdy(poleR.y) - poleR.y * dFdy(poleR.x)) / poleR2 * 0.63662, dFdy(vPoleL.y) * 0.035),
    vec2((dFdy(vPoleL.y) + dFdy(vPoleL.z)) * 2.5, dFdy(vPoleL.x) * 0.035), poleArm);
  float poleFibre = textureGrad(uGrime, poleG + vec2(poleT * 0.37, poleT2 * 0.53), poleGx, poleGy).g;
  float poleFine = textureGrad(uGrime, poleG * vec2(3.0, 2.0) + vec2(0.61, poleT), poleGx * vec2(3.0, 2.0), poleGy * vec2(3.0, 2.0)).r;
  float poleGrain = 0.78 + 0.32 * smoothstep(0.36, 0.64, poleFibre) + 0.18 * (poleFine - 0.5);
  // seasoning checks: the field's level line where a broad mask lets it, faded to its share of a pixel when it
  // falls under one (a check never sparkles)
  float poleCk = textureGrad(uGrime, poleG * vec2(0.5, 0.4) + vec2(0.13, poleT), poleGx * vec2(0.5, 0.4), poleGy * vec2(0.5, 0.4)).r;
  float poleCkPx = max(fwidth(poleCk), 1e-4);
  float poleCkW = max(0.022, poleCkPx);
  float poleCheck = (1.0 - smoothstep(0.0, poleCkW, abs(poleCk - 0.5))) * (0.022 / poleCkW)
    * smoothstep(0.56, 0.7, textureGrad(uGrime, poleG * vec2(0.25, 0.9) + vec2(0.71, 0.2), poleGx * vec2(0.25, 0.9),
      poleGy * vec2(0.25, 0.9)).g);
  // the foot: soil-stained to a ragged line half a metre up (sand-scoured on the arid maps), a splash fading above it
  float poleShaft = 1.0 - poleArm;
  float poleEdge = 0.4 + 0.3 * textureGrad(uGrime, vec2(poleAround * 0.5 + 0.4, 0.31 + poleT), vec2(poleGx.x * 0.5, 0.0),
    vec2(poleGy.x * 0.5, 0.0)).r;
  float poleFoot = (1.0 - smoothstep(poleEdge - 0.22, poleEdge + 0.04, vPoleL.y)) * poleShaft;
  float poleSplash = (1.0 - smoothstep(0.5, 1.7, vPoleL.y)) * poleShaft;
  poleTone *= mix(vec3(1.0), mix(vec3(0.5, 0.45, 0.4), vec3(0.78, 0.72, 0.64), uPoleArid), poleFoot * 0.92);
  poleTone *= 1.0 - 0.14 * poleSplash * (1.0 - uPoleArid);
  diffuseColor.rgb *= poleTone * poleGrain * (1.0 - 0.6 * poleCheck);
}`);
}
