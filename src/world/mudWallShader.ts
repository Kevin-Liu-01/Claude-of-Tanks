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
 *
 * (b27; waves 173 and 174, "carved, pharaonic-looking glyphs", "a crisp, repeating ornamental motif", and the facades
 * lane's measurement that the glyphs are not the house plaster's) The face's horizontal was the shaded normal's
 * tangent dotted with the world position. Two hundred metres from the map's middle, the least turn of that normal
 * moved the coordinate by metres: the crown's tilt, a module pitched to its slope, the section's battered shoulders
 * and the tuck at its end each threw the losses, the courses and the streaks to another place of the noise, triangle
 * by triangle. Every module's triangles are the same, so the scraps lined up as a band of glyphs, module after
 * module. The face's horizontal is now the world place along the module's own axis, or across it on a face that runs
 * across it (the axis fixed a module, its sign fixed by a reference direction so a module turned round runs the same
 * way). It reads no normal: continuous along a run and across its joints, never the same twice. The losses thin over
 * their edge and the bricks under them are worn round, their arrises wandering, their mortar soft.
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
  // (b18; the b14 reshoot of Desert's walls: the crown "a sawtooth" — the second noise, half a metre across at 0.143
  // a metre, beat against the crown's 0.45 m smoothing taps into regular teeth: it runs a metre and more across now)
  // (b27; wave 174, "crenellations ... too sharp-edged to have weathered": the grime tile's finer octaves wind round
  // their torus several times a tile, so they are near white at its texels, and read at its full size they still made
  // teeth a hand or two apart, 6 cm a texel here. The crown reads the tile's mip 3, eight texels a side averaged: a
  // slump runs a metre and more. Each noise's spread is brought back to the full tile's, so a quarter of a crown still
  // sags 8 cm and more. The second noise is the blue channel's, whose octaves are the tile's broadest.)
  float a = 0.5 + (textureLod(uGrime, xz * 0.061, 3.0).r - 0.5) * 2.3;
  float b = 0.5 + (textureLod(uGrime, xz * 0.071 + vec2(0.31, 0.67), 3.0).b - 0.5) * 1.2;
  float c = textureLod(uGrime, xz * 0.019 + vec2(0.13, 0.41), 3.0).b;
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

/**
 * The face's horizontal in world metres (after the crown's displacement): along the module's own axis (its local z) and
 * across it (its local x), each with its sign fixed by a reference direction; the face picks one by its own normal
 * (vMudPick: a face along the module reads its axis, an end or a building's cross wall the other). Off the instanced
 * walls the world's x and z.
 */
const MUD_FACE_GLSL = /* glsl */`
{
  #ifdef USE_INSTANCING
  mat4 cotFaceM = modelMatrix * instanceMatrix;
  #else
  mat4 cotFaceM = modelMatrix;
  #endif
  vec2 cotAxX = normalize(cotFaceM[0].xz + vec2(1e-6, 0.0));
  vec2 cotAxZ = normalize(cotFaceM[2].xz + vec2(0.0, 1e-6));
  cotAxX *= dot(cotAxX, vec2(0.8137, 0.5812)) < 0.0 ? -1.0 : 1.0;
  cotAxZ *= dot(cotAxZ, vec2(0.8137, 0.5812)) < 0.0 ? -1.0 : 1.0;
  vec3 cotFaceW = (cotFaceM * vec4(transformed, 1.0)).xyz;
  vMudS = vec2(dot(cotFaceW.xz, cotAxX), dot(cotFaceW.xz, cotAxZ));
  vMudPick = abs(normal.x) - abs(normal.z);
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
varying vec2 vMudS;
varying float vMudPick;
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
  // (b27: the face's horizontal by world place along the module's axis, never the shaded normal's tangent)
  float ms = vMudPick >= 0.0 ? vMudS.y : vMudS.x;
  // (the courses follow the module, sheared to its slope: its own height, as laid before the crown gave)
  float mh = vMudH;
  float up01 = vMudY; // the height up the module's wall, 0 at the foot; -1 off the instanced walls
  // the render's loss: broad patches of a smooth noise of the face, their edges ragged with a finer one, more toward
  // the crown and the foot (the grime tile's channels sit about 0.5, a tenth either side: past 0.6 on about a sixth of
  // mid face, a third toward the crown)
  // (b18; the b14 reshoot: small losses a hand or two across, their bricks outlined by the lip and the shade, read as
  // carved glyphs — the losses broad and few now, the render gone over a metre or more where it goes, its edge ragged
  // at a fifth of that, the bricks under it soft)
  // (b27: both read a few mips down — a bias of 2 and 2.5 — so the tile's near-white finer octaves never speckle the
  // render's edge into crumbs a few centimetres across; its rag stays a hand and more)
  float n1 = texture2D(uGrime, vec2(ms * 0.06, mh * 0.12 + 0.23), 2.0).b;
  float n2 = texture2D(uGrime, vec2(ms * 0.2 + 0.37, mh * 0.3 + 0.11), 2.5).r;
  float wear = up01 < 0.0 ? 0.0 : max(smoothstep(0.62, 0.95, up01) * 0.085, (1.0 - smoothstep(0.02, 0.26, up01)) * 0.065);
  float field = n1 * 0.84 + n2 * 0.16 + wear;
  const float T = 0.6;
  float fw = max(fwidth(field), 1e-4);
  // (b27: the render thins and crumbles over its edge, no cut line)
  float loss = smoothstep(T - 0.014 - fw, T + 0.014 + fw, field) * vertical;
  if (field > T - 0.04) {
    // the courses: half bond, the bricks worn round — their corners rubbed off, their arrises wandering a centimetre —
    // the mud mortar a shade darker and soft (its lines fade to the bricks' mean far away)
    float ch = 0.094, bw = 0.30;
    float course = floor(mh / ch);
    float bx = (ms + mod(course, 2.0) * bw * 0.5) / bw;
    float brick = floor(bx);
    vec2 bd = vec2(fract(bx) * bw, fract(mh / ch) * ch);
    bd = min(bd, vec2(bw, ch) - bd);
    vec2 bq = max(vec2(0.025) - bd, 0.0);
    float edge = min(min(bd.x, bd.y), 0.025 - length(bq));
    edge += (texture2D(uGrime, vec2(ms * 1.3 + 0.17, mh * 1.9 + 0.53), 2.0).b - 0.5) * 0.02;
    float ew = max(fwidth(edge), 1e-4);
    float mortar = (1.0 - smoothstep(0.002, 0.018 + ew, edge)) * (1.0 - smoothstep(0.006, 0.02, ew));
    float tone = fract(sin(dot(vec2(brick, course), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 brickCol = diffuseColor.rgb * vec3(0.88, 0.8, 0.74) * (0.82 + tone * 0.18);
    brickCol = mix(brickCol, diffuseColor.rgb * 0.7, mortar);
    float lip = smoothstep(T - 0.03, T - 0.01, field) * (1.0 - loss);
    float shade = (1.0 - smoothstep(T + 0.01, T + 0.05, field)) * loss;
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 + lip * 0.035), brickCol * (1.0 - shade * 0.1), loss);
    cotMudH = mix(1.0, 0.62 * (1.0 - mortar * 0.8) + 0.12 * smoothstep(0.0, 0.05, edge), loss);
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
    `#include <common>\nuniform sampler2D uGrime;\nvarying float vMudY;\nvarying float vMudH;\nvarying vec2 vMudS;\nvarying float vMudPick;\n${MUD_LOSS_GLSL}`);
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <beginnormal_vertex>',
    `#include <beginnormal_vertex>\n${MUD_NORMAL_GLSL}`);
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <begin_vertex>',
    `#include <begin_vertex>\n#ifdef USE_INSTANCING\nvMudH = transformed.y;\n#else\nvMudH = (modelMatrix * vec4(transformed, 1.0)).y;\n#endif\n${MUD_DISPLACE_GLSL}\n#ifdef USE_INSTANCING\nvMudY = transformed.y / max(1e-3, uMudShape.x);\n#else\nvMudY = -1.0;\n#endif\n${MUD_FACE_GLSL}`);
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
