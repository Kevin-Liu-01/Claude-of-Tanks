/**
 * The mud walls' weathering in world space (the scenery lane, b14; gauntlet wave 97 on Desert's mud walls: "wave-top
 * silhouette and rust-colored staining repeat identically roughly eight times across the frame", "stamped rectangle
 * decals and no courses, render, slumping or erosion").
 *
 * A destructible pool draws one module for every module of every mud wall (inhabitKit adobeModule, one InstancedMesh
 * a map), and the module draws one tile of the mud print: whatever either carries repeats every three metres. So the
 * module's crown is level and the print's render whole (fieldMudSurface.ts), and this material lays the variation in
 * world space, continuous across the modules' joints and never the same twice:
 *
 *   - the crown (vertex shader, instanced walls only): slumps a metre or so long where two noises of the ground plan
 *     agree, and the wall's height breathing over tens of metres, together at most MUD_SLUMP_M below the module's top;
 *     the shoulders above MUD_SHOULDER of the height follow the crown down (the module's own law), the crown narrows
 *     where it is bitten, and its normal tilts with the slope. The same displacement runs in the shadow pass
 *     (createMudWallDepthMaterial), so a slumped crown casts a slumped shadow;
 *   - the render (fragment shader, every mud surface): lost where a noise of the face (along the face's horizontal,
 *     up the world's vertical) passes a threshold, more toward the crown and the foot; under it the courses of sun-dried
 *     bricks in half bond (9.4 cm courses, 30 cm bricks), each brick its own tone, their mud mortar dark and recessed,
 *     the render's broken lip lit and its shadow on the bricks below; a derivative bump gives the relief near the eye;
 *   - the rain: streaks down the faces from the crown, a damp foot.
 *
 * Collision: the module's collider is fitted to the envelope (its top the module's top), and the crown only ever drops,
 * by at most MUD_SLUMP_M (the old module's crown bites dropped it by up to 0.40 m). Nothing rises above the collider.
 */
import * as THREE from 'three';

/** The deepest a crown is worn below its module's top (m): a slump and the wall's height together. */
export const MUD_SLUMP_M = 0.24;
/** The share of the module's height above which the section gives with the crown (the module's own law). */
export const MUD_SHOULDER = 0.55;

/** The module's top, its shoulder and the deepest loss (module space, m), from the pool geometry's box. */
export function mudShapeFor(box: THREE.Box3, out = new THREE.Vector3()): THREE.Vector3 {
  const h = Math.max(1e-3, box.max.y - box.min.y);
  return out.set(box.max.y, box.min.y + MUD_SHOULDER * h, MUD_SLUMP_M);
}

function mustReplace(source: string, anchor: string, replacement: string): string {
  if (!source.includes(anchor)) throw new Error(`mudWallShader: anchor not found: ${anchor}`);
  return source.replace(anchor, replacement);
}

/** The crown's loss at a ground-plan place, 0..uMudShape.z (vertex stage; samples the props grime tile). */
export const MUD_LOSS_GLSL = /* glsl */`
uniform vec3 uMudShape;
float cotMudLoss(vec2 xz) {
  // slumps where two noises of the ground plan agree, a metre or so long; the wall's height over tens of metres
  float a = texture2D(uGrime, xz * 0.061).r;
  float b = texture2D(uGrime, xz * 0.143 + vec2(0.31, 0.67)).g;
  float c = texture2D(uGrime, xz * 0.019 + vec2(0.13, 0.41)).b;
  // (the grime tile's channels sit about 0.5, a tenth either side: the mix passes 0.5 on half a wall's length, 0.59 on
  // a tenth and 0.62 on a twentieth: a third of a crown sags, a tenth has slumped well down, the odd stretch to depth)
  float slump = smoothstep(0.5, 0.62, a * 0.82 + b * 0.18);
  float height = smoothstep(0.3, 0.75, c);
  return uMudShape.z * clamp(slump * 0.72 + height * 0.28, 0.0, 1.0);
}
vec3 cotMudWorld(vec3 p) {
  #ifdef USE_INSTANCING
  return (modelMatrix * instanceMatrix * vec4(p, 1.0)).xyz;
  #else
  return (modelMatrix * vec4(p, 1.0)).xyz;
  #endif
}
/** The loss on the wall's centre line at a module height and place along it, smoothed over 0.9 m (round slumps). */
float cotMudCrown(float y, float z) {
  return (cotMudLoss(cotMudWorld(vec3(0.0, y, z - 0.45)).xz) + 2.0 * cotMudLoss(cotMudWorld(vec3(0.0, y, z)).xz)
    + cotMudLoss(cotMudWorld(vec3(0.0, y, z + 0.45)).xz)) * 0.25;
}
`;

/** The crown's displacement (after <begin_vertex>; instanced walls only). */
export const MUD_DISPLACE_GLSL = /* glsl */`
#ifdef USE_INSTANCING
if (transformed.y > uMudShape.y) {
  // (looked up on the wall's centre line, so the crown stays level across the wall's thickness)
  float cotLoss = cotMudCrown(transformed.y, transformed.z);
  float cotSpan = max(1e-3, uMudShape.x - uMudShape.y);
  float cotUp = (transformed.y - uMudShape.y) / cotSpan;
  transformed.x *= 1.0 - min(0.12, cotLoss * 0.5) * smoothstep(0.55, 0.85, cotUp);
  transformed.y = uMudShape.y + (transformed.y - uMudShape.y) * (cotSpan - cotLoss) / cotSpan;
}
#endif
`;

/** The crown's normal, tilted with the slope of its loss along the module (after <beginnormal_vertex>). */
const MUD_NORMAL_GLSL = /* glsl */`
#ifdef USE_INSTANCING
if (position.y > uMudShape.y) {
  float cotDz = 0.15;
  float cotLp = cotMudCrown(position.y, position.z + cotDz);
  float cotLm = cotMudCrown(position.y, position.z - cotDz);
  float cotUpN = (position.y - uMudShape.y) / max(1e-3, uMudShape.x - uMudShape.y);
  float cotSlope = -cotUpN * (cotLp - cotLm) / (2.0 * cotDz); // d(height)/dz
  objectNormal = normalize(objectNormal + vec3(0.0, 0.0, -cotSlope * objectNormal.y));
}
#endif
`;

const MUD_FRAGMENT_COMMON = /* glsl */`
varying float vMudY;
varying float vMudH;
vec3 cotMudPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = normalize(dFdx(surfPos)), sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

/** The render, its losses and courses, the rain (after <map_fragment>, before the grime). */
const MUD_FRAGMENT_GLSL = /* glsl */`
float cotMudH = 1.0;
{
  vec3 mn = normalize(vGrimeN);
  float vertical = 1.0 - smoothstep(0.5, 0.78, abs(mn.y));
  vec2 mt = normalize(vec2(-mn.z, mn.x) + vec2(1e-5, 0.0));
  float ms = vertical > 0.0 ? dot(vGrimeW.xz, mt) : vGrimeW.x + vGrimeW.z;
  // (the courses follow the module, sheared to its slope: its own height, as laid before the crown gave)
  float mh = vMudH;
  float up01 = vMudY; // the height up the module's wall, 0 at the foot; -1 off the instanced walls
  // the render's loss: broad patches of a smooth noise of the face, their edges ragged with a finer one, more toward
  // the crown and the foot (the grime tile's channels sit about 0.5, a tenth either side: past 0.6 on about a sixth of
  // mid face, a third toward the crown)
  float n1 = texture2D(uGrime, vec2(ms * 0.091, mh * 0.17 + 0.23)).b;
  float n2 = texture2D(uGrime, vec2(ms * 0.311 + 0.37, mh * 0.47 + 0.11)).r;
  float wear = up01 < 0.0 ? 0.0 : max(smoothstep(0.62, 0.95, up01) * 0.085, (1.0 - smoothstep(0.02, 0.26, up01)) * 0.065);
  float field = n1 * 0.74 + n2 * 0.26 + wear;
  const float T = 0.6;
  float fw = max(fwidth(field), 1e-4);
  float loss = smoothstep(T - 0.006 - fw, T + 0.006 + fw, field) * vertical;
  if (field > T - 0.04) {
    // the courses: half bond, worn round, the mortar dark and recessed (its lines fade to the bricks' mean far away)
    float ch = 0.094, bw = 0.30;
    float course = floor(mh / ch);
    float bx = (ms + mod(course, 2.0) * bw * 0.5) / bw;
    float brick = floor(bx);
    vec2 bf = vec2(fract(bx) * bw, fract(mh / ch) * ch);
    float edge = min(min(bf.x, bw - bf.x), min(bf.y, ch - bf.y));
    float ew = max(fwidth(edge), 1e-4);
    float mortar = (1.0 - smoothstep(0.004, 0.010 + ew, edge)) * (1.0 - smoothstep(0.006, 0.02, ew));
    float tone = fract(sin(dot(vec2(brick, course), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 brickCol = diffuseColor.rgb * vec3(0.88, 0.8, 0.74) * (0.82 + tone * 0.18);
    brickCol = mix(brickCol, diffuseColor.rgb * 0.52, mortar);
    float lip = smoothstep(T - 0.03, T - 0.006, field) * (1.0 - loss);
    float shade = (1.0 - smoothstep(T + 0.006, T + 0.04, field)) * loss;
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 + lip * 0.07), brickCol * (1.0 - shade * 0.22), loss);
    cotMudH = mix(1.0, 0.55 * (1.0 - mortar) + 0.1 * smoothstep(0.0, 0.03, edge), loss);
  }
  // the rain: streaks down the faces from the crown, a damp foot
  float streak = smoothstep(0.62, 0.88, texture2D(uGrime, vec2(ms * 0.83, mh * 0.045)).g);
  float hi = up01 < 0.0 ? 0.5 : smoothstep(0.25, 0.9, up01);
  diffuseColor.rgb *= 1.0 - streak * hi * 0.09 * vertical;
  float damp = up01 < 0.0 ? 0.0 : 1.0 - smoothstep(0.04, 0.14 + n2 * 0.06, up01);
  diffuseColor.rgb *= 1.0 - damp * 0.08;
}
`;

/** The relief of the losses and the courses near the eye (after <normal_fragment_maps>). */
const MUD_NORMAL_FRAGMENT_GLSL = /* glsl */`
{
  float cotFade = 1.0 - smoothstep(12.0, 30.0, length(vViewPosition));
  vec2 cotDh = vec2(dFdx(cotMudH), dFdy(cotMudH)) * 0.015 * cotFade;
  normal = cotMudPerturb(-vViewPosition, normal, cotDh, faceDirection);
}
`;

interface MudShader { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }

/**
 * The mud material's hook, after the props grime hook (which declares uGrime in the fragment stage and passes the
 * world position and normal as vGrimeW and vGrimeN). `shape` is shared with the depth material.
 */
export function applyMudWallHook(shader: MudShader, shape: THREE.IUniform<THREE.Vector3>): void {
  shader.uniforms.uMudShape = shape;
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <common>',
    `#include <common>\nuniform sampler2D uGrime;\nvarying float vMudY;\nvarying float vMudH;\n${MUD_LOSS_GLSL}`);
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <beginnormal_vertex>',
    `#include <beginnormal_vertex>\n${MUD_NORMAL_GLSL}`);
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <begin_vertex>',
    `#include <begin_vertex>\n#ifdef USE_INSTANCING\nvMudH = transformed.y;\n#else\nvMudH = (modelMatrix * vec4(transformed, 1.0)).y;\n#endif\n${MUD_DISPLACE_GLSL}\n#ifdef USE_INSTANCING\nvMudY = transformed.y / max(1e-3, uMudShape.x);\n#else\nvMudY = -1.0;\n#endif`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <common>', `#include <common>\n${MUD_FRAGMENT_COMMON}`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <map_fragment>', `#include <map_fragment>\n${MUD_FRAGMENT_GLSL}`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>\n${MUD_NORMAL_FRAGMENT_GLSL}`);
}

/** The mud walls' shadow pass: the same crown, so a slumped crown casts a slumped shadow. */
export function createMudWallDepthMaterial(grime: THREE.Texture, shape: THREE.IUniform<THREE.Vector3>): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ name: 'MudWallDepth', depthPacking: THREE.RGBADepthPacking });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrime = { value: grime };
    shader.uniforms.uMudShape = shape;
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <common>', `#include <common>\nuniform sampler2D uGrime;\n${MUD_LOSS_GLSL}`);
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>\n${MUD_DISPLACE_GLSL}`);
  };
  material.customProgramCacheKey = () => 'world-props-mud-depth-v1';
  return material;
}
