/**
 * The dry-stone walls' settling, copes and lichen in world space (the scenery lane, b14; gauntlet wave 97 on the dry
 * walls: "stacked brown rectangular slabs of near-identical size and thickness with a dead-level top").
 *
 * A destructible pool draws one dry-stone module (inhabitKit dryStoneModule) for every module of every field wall, so
 * whatever the module carries repeats every three metres. The module's stones are irregular and its top a coping of
 * stones on edge; each part carries its centre and its kind (the aStone attribute: DRY_STONE_KIND). This material
 * varies the run by the world place of each stone:
 *
 *   - settling (vertex stage, instanced modules): a wall sinks where a noise of the ground plan says so, its upper
 *     stones most (the drop grows with the square of the height), each stone moved whole by its centre's place, the
 *     hearting and the snow load vertex by vertex; at most STONE_SETTLE_M;
 *   - the copes: where a noise of a few metres runs high a stretch has lost its copes (a partial collapse), and the
 *     odd single cope is gone (a gap) — a lost cope is collapsed to its centre and draws nothing;
 *   - lichen (fragment stage, every field-stone surface): crustose patches by world place, pale grey-green, the odd
 *     orange one, most on the tops and the sunlit faces.
 *
 * The shadow pass runs the same settling and copes (createStoneWallDepthMaterial). Collision: the collider is the
 * module's envelope (its top the tallest cope's); the material only ever lowers a stone, by at most STONE_SETTLE_M plus
 * a lost cope's height (the module's copes stand 12-20 cm before the envelope fit).
 */
import * as THREE from 'three';

/** The deepest a wall's top settles (m), at its top; less down the wall. */
export const STONE_SETTLE_M = 0.06;

function mustReplace(source: string, anchor: string, replacement: string): string {
  if (!source.includes(anchor)) throw new Error(`stoneWallShader: anchor not found: ${anchor}`);
  return source.replace(anchor, replacement);
}

/** The settling and the copes (vertex stage). uStoneShape: x the module's top, y the settling's depth, z copes drop. */
const STONE_VERTEX_COMMON = /* glsl */`
uniform vec4 uStoneShape;
attribute vec4 aStone;
float cotStoneSettle(vec2 xz) {
  float a = texture2D(uGrime, xz * 0.071 + vec2(0.57, 0.21)).r;
  float b = texture2D(uGrime, xz * 0.213 + vec2(0.11, 0.83)).g;
  return smoothstep(0.42, 0.66, a * 0.75 + b * 0.25);
}
float cotStoneGone(vec2 xz) {
  // (the grime tile's blue channel sits about 0.5, a tenth either side: past 0.6 on about a tenth of a wall's length,
  // in runs of a few metres; and one cope in fourteen alone)
  float run = texture2D(uGrime, xz * 0.093 + vec2(0.71, 0.39)).b;
  float lone = fract(sin(dot(floor(xz * 23.0), vec2(12.9898, 78.233))) * 43758.5453);
  return max(step(0.6, run), step(0.93, lone));
}
`;

export const STONE_DISPLACE_GLSL = /* glsl */`
#ifdef USE_INSTANCING
{
  float cotKind = aStone.w;
  float cotTop = max(1e-3, uStoneShape.x);
  if (cotKind < 0.5 || cotKind > 4.5) {
    // the hearting and the snow load, vertex by vertex
    vec3 cotW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    float cotUp = clamp(transformed.y / cotTop, 0.0, 1.0);
    transformed.y -= uStoneShape.y * cotStoneSettle(cotW.xz) * cotUp * cotUp;
  } else if (cotKind < 3.5) {
    // a stone, moved whole by its centre's place
    vec3 cotC = (modelMatrix * instanceMatrix * vec4(aStone.xyz, 1.0)).xyz;
    float cotUp = clamp(aStone.y / cotTop, 0.0, 1.0);
    transformed.y -= uStoneShape.y * cotStoneSettle(cotC.xz) * cotUp * cotUp;
    if (cotKind > 2.5 && uStoneShape.z > 0.5 && cotStoneGone(cotC.xz) > 0.5) transformed = aStone.xyz;
  }
}
#endif
`;

const STONE_FRAGMENT_GLSL = /* glsl */`
{
  // crustose lichen by world place: patches where a noise runs high, rosettes inside them, most on the tops and the
  // faces the sun reaches; pale grey-green, the odd patch orange
  vec3 ln = normalize(vGrimeN);
  // (the grime tile's channels sit about 0.5, a tenth either side: patches over about a quarter of a wall, rosettes
  // over a third of a patch)
  float lpatch = smoothstep(0.53, 0.62, texture2D(uGrime, vGrimeW.xz * 0.41 + vGrimeW.y * 0.37 + vec2(0.29, 0.61)).r);
  float rosette = smoothstep(0.52, 0.6, texture2D(uGrime, vec2(vGrimeW.x + vGrimeW.z, vGrimeW.y) * 2.6 + vec2(0.13, 0.47)).b);
  float lit = 0.55 + 0.45 * smoothstep(-0.2, 0.8, ln.y);
  float lichen = lpatch * rosette * lit;
  float orange = step(0.7, texture2D(uGrime, vGrimeW.xz * 0.053 + vec2(0.77, 0.19)).b);
  vec3 lc = mix(vec3(0.6, 0.63, 0.52), vec3(0.74, 0.54, 0.27), orange);
  diffuseColor.rgb = mix(diffuseColor.rgb, lc * (0.85 + 0.15 * diffuseColor.r), lichen * 0.45);
}
`;

interface StoneShader { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }

/** The field-stone material's hook, after the props grime hook (uGrime, vGrimeW, vGrimeN). */
export function applyStoneWallHook(shader: StoneShader, shape: THREE.IUniform<THREE.Vector4>): void {
  shader.uniforms.uStoneShape = shape;
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <common>',
    `#include <common>\nuniform sampler2D uGrime;\n${STONE_VERTEX_COMMON}`);
  shader.vertexShader = mustReplace(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>\n${STONE_DISPLACE_GLSL}`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <map_fragment>', `#include <map_fragment>\n${STONE_FRAGMENT_GLSL}`);
}

/** The dry-stone walls' shadow pass: the same settling and copes. */
export function createStoneWallDepthMaterial(grime: THREE.Texture, shape: THREE.IUniform<THREE.Vector4>): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ name: 'StoneWallDepth', depthPacking: THREE.RGBADepthPacking });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrime = { value: grime };
    shader.uniforms.uStoneShape = shape;
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <common>', `#include <common>\nuniform sampler2D uGrime;\n${STONE_VERTEX_COMMON}`);
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>\n${STONE_DISPLACE_GLSL}`);
  };
  material.customProgramCacheKey = () => 'world-props-stone-depth-v1';
  return material;
}

/** The module's top (module space, m), the settling's depth and whether copes may drop (not under a snow load). */
export function stoneShapeFor(box: THREE.Box3, snow: boolean, out = new THREE.Vector4()): THREE.Vector4 {
  return out.set(Math.max(1e-3, box.max.y), STONE_SETTLE_M, snow ? 0 : 1, 0);
}
