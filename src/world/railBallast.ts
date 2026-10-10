/**
 * The rail kit's ballast (the ground lane, after gauntlet wave 234: the railyards' track bed "a smooth grey slab with
 * sleepers sitting on it and no stone ballast, shoulder, fastenings or grime… a model-railway strip").
 *
 * The kit's bed and its two shoulders (maps/mapKits.ts layRailSpan) keep their geometry and their seeded vertex tones;
 * they draw on a props material of their own, painted by this hook in world space after the props grime hook's
 * declarations and ahead of its grime, weathering and snow (which then fall on the stone as on any prop):
 *   - crushed stone: 4–7 cm stones laid by a jittered cell grid (an integer hash: exact at any distance from the
 *     origin), each its own tone and a little warm or cool, the voids between them dark, each stone's face tilted and
 *     rounded off at its edge (its own normal under the sun) — the whole faded to the pattern's mean by the pixel
 *     footprint before a stone can alias;
 *   - the work on it, by its place across the track: the four-foot between the rails black with oil and cinder in
 *     patches along the line (a little glossier where it is oily), rust run off the rails beside them, the cess outside
 *     the rails clean stone, and the shoulders' coarser stone falling to a darker, soil-stained foot.
 * A part's UV carries that place (tagRailBallast, set before the kit places the part): u is the offset across the track
 * in half-gauges (the rails' centres at ±1), v is 0 on the bed and 1 + the share of the slope down a shoulder.
 */
import type * as THREE from 'three';

type BallastShader = Parameters<THREE.Material['onBeforeCompile']>[0];

/** The bed (u across in half-gauges, v 0). */
export const RAIL_BALLAST_BED = 0;
/** A shoulder (v 1 at the bed's edge to 2 at its foot). */
export const RAIL_BALLAST_SHOULDER = 1;
/** The stones' size on the bed and on the shoulders (m): track ballast is 30–60 mm stone, the shoulders' a little coarser. */
export const RAIL_BALLAST_STONE_M = 0.046;
export const RAIL_BALLAST_SHOULDER_STONE_M = 0.056;

/**
 * Tag a bed or shoulder part, in place, before the kit places it: every vertex's UV becomes its place across the track
 * in half-gauges (`acrossM(x, y)` from the part's own coordinates, metres from the centreline) and its role (`roleV`:
 * 0 for the bed, 1 + the share of the slope for a shoulder). Returns the geometry.
 */
export function tagRailBallast(
  geometry: THREE.BufferGeometry,
  gauge: number,
  acrossM: (x: number, y: number) => number,
  roleV: (x: number, y: number) => number,
): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!position || !uv || uv.count !== position.count) throw new Error('world/railBallast: a ballast part needs positions and UVs');
  if (!(gauge > 0)) throw new Error('world/railBallast: the gauge must be positive');
  const half = gauge / 2;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i);
    uv.setXY(i, acrossM(x, y) / half, roleV(x, y));
  }
  uv.needsUpdate = true;
  return geometry;
}

function mustReplace(source: string, anchor: string, replacement: string): string {
  const out = source.replace(anchor, replacement);
  if (out === source) throw new Error(`world/railBallast: shader anchor missing: ${anchor}`);
  return out;
}

/**
 * The ballast material's hook, applied after the props grime hook (it anchors on that hook's declarations, its world
 * position and normal varyings and its grime texture). `stones` false keeps the zones' grime and drops the stone
 * pattern and its normals (a cheaper variant; the phones keep the bed on the baked material instead); `weeds` false
 * (a map whose props carry the snow load) grows none on the shoulders.
 */
export function applyRailBallastHook(shader: BallastShader, stones = true, weeds = true): void {
  shader.vertexShader = mustReplace(shader.vertexShader, 'varying vec3 vGrimeW;\nvarying vec3 vGrimeN;',
    'varying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nvarying vec2 vBallastUv;');
  shader.vertexShader = mustReplace(shader.vertexShader, '  vGrimeN = normalize(mat3(modelMatrix) * gn);\n}',
    '  vGrimeN = normalize(mat3(modelMatrix) * gn);\n  vBallastUv = uv;\n}');
  shader.fragmentShader = mustReplace(shader.fragmentShader, 'uniform sampler2D uGrime;', /* glsl */`uniform sampler2D uGrime;
varying vec2 vBallastUv;
${stones ? '#define COT_BALLAST_STONES' : ''}
${weeds ? '#define COT_BALLAST_WEEDS' : ''}
vec2 cotBallastTilt = vec2(0.0);
float cotBallastGloss = 0.0;
float cotBallastWeed = 0.0;
vec3 cotBallastWeedCol = vec3(0.0);
// an integer cell hash: exact at any distance from the origin (a sine hash's bits run out a few hundred metres out)
vec2 cotBallastHash(vec2 c) {
  uvec2 q = uvec2(ivec2(c) + ivec2(1 << 20));
  q = q * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return vec2(uvec2(n, n * 16807u) >> 8u) * (1.0 / 16777216.0);
}`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`#include <map_fragment>
{
  float balU = abs(vBallastUv.x);
  float balShoulder = step(0.5, vBallastUv.y);
  float balFoot = clamp(vBallastUv.y - 1.0, 0.0, 1.0) * balShoulder;
  float balStone = 1.0;
  vec3 balHue = vec3(1.0);
  #ifdef COT_BALLAST_STONES
  {
    // the stones: the nearest of a jittered grid's points (3 x 3 cells) and the distance to the next one
    float sz = mix(${RAIL_BALLAST_STONE_M.toFixed(3)}, ${RAIL_BALLAST_SHOULDER_STONE_M.toFixed(3)}, balShoulder);
    vec2 bq = vGrimeW.xz / sz, bc = floor(bq), bf = fract(bq);
    float d1 = 9.0, d2 = 9.0;
    vec2 h1 = vec2(0.5), r1 = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 o = vec2(float(i), float(j));
        vec2 h = cotBallastHash(bc + o);
        vec2 r = o + 0.12 + 0.76 * h - bf;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; h1 = h; r1 = r; } else if (d < d2) { d2 = d; }
      }
    }
    // the pattern's visibility by the footprint: whole while a stone spans ~3 px, gone by ~1.2
    float fw = length(fwidth(vGrimeW.xz)) / sz;
    float sv = 1.0 - smoothstep(0.32, 0.85, fw);
    float edge = sqrt(d2) - sqrt(d1);
    // (the lab's first frames: a dark ring round every stone read as cobbles) a void is a gap of its own width between two
    // stones, wide on one side and closed on another — angular crushed stone, not river pebbles
    float voidW = 1.0 - smoothstep(0.02, 0.08 + 0.16 * h1.y + fw * 0.5, edge);
    float tone = 0.76 + 0.48 * h1.x;
    // (normalised to its mean — tone 1.0 over the voids' ~15 % of the area at 0.55 — so the far bed keeps its tone)
    balStone = mix(1.0, tone * (1.0 - 0.55 * voidW) / 0.92, sv);
    balHue = mix(vec3(1.0), h1.y > 0.5 ? vec3(1.04, 1.0, 0.95) : vec3(0.96, 0.99, 1.04), abs(h1.y - 0.5) * 1.6 * sv);
    // each stone's face: tilted by its own draw and rounded off toward its edge (the normal stage below applies it)
    // (flat facets, each at its own tilt, barely rounded: crushed stone breaks into planes)
    cotBallastTilt = ((h1 - 0.5) * 0.95 - r1 * 0.22) * sv * (1.0 - voidW * 0.6);
  }
  #endif
  // the work on the bed, by its place across the track (rails' centres at |u| 1): the four-foot oily and black with
  // cinder in patches along the line, rust off the rails beside them, the cess clean; the shoulders' stone cleaner,
  // their foot darker and soil-stained
  float balPatch = texture2D(uGrime, vGrimeW.xz * 0.19 + vec2(0.37, 0.11)).r;
  float balAlong = texture2D(uGrime, vGrimeW.xz * 0.043 + vec2(0.71, 0.29)).g;
  float fourFoot = (1.0 - smoothstep(0.78, 0.94, balU)) * (1.0 - balShoulder);
  float oil = fourFoot * smoothstep(0.30, 0.72, balPatch * 0.6 + balAlong * 0.4);
  float railQ = (balU - 1.0) / 0.20;
  float railSide = exp(-railQ * railQ) * (1.0 - balShoulder);
  float cess = smoothstep(1.15, 1.40, balU) * (1.0 - balShoulder);
  vec3 bal = balHue * balStone;
  bal *= mix(1.0, 0.72, fourFoot);                     // the four-foot's cinder and dust
  bal *= mix(1.0, 0.62, oil);                          // its oil, in patches
  bal = mix(bal, bal * vec3(1.40, 0.92, 0.66), railSide * 0.55); // the rails' rust run-off
  bal *= 1.0 + 0.15 * cess;                            // the cess's cleaner stone
  bal *= mix(1.0, mix(1.12, 0.80, balFoot), balShoulder); // the shoulders' clean stone, darker toward the foot
  bal = mix(bal, bal * vec3(1.06, 0.98, 0.86), balFoot * 0.6); // the foot soil-stained
  diffuseColor.rgb *= bal;
  cotBallastGloss = oil;
  // (2026-10-08, the coordinator on wave 260's yards: "shoulders with weeds") weeds come up in clumps on the
  // shoulders, thicker toward their soil-stained foot, and a few in the cess — never in the four-foot the trains keep
  // clear: ~3 m clumps of tufts a third of a metre across, green and straw by the patch, matte, the stones' facets lost
  // under them
  #ifdef COT_BALLAST_WEEDS
  // (the lab's third frames: ~1 m clumps over a fifth of the shoulder read as a faint tint on a few stones) clumps of
  // 1.5–2 m over about half the shoulder's foot, each broken into its tufts
  float weedClump = texture2D(uGrime, vGrimeW.xz * 0.17 + vec2(0.13, 0.57)).g;
  float weedTuft = texture2D(uGrime, vGrimeW.xz * 1.10 + vec2(0.61, 0.07)).r;
  float weed = smoothstep(0.42, 0.58, weedClump) * smoothstep(0.30, 0.55, weedTuft)
    * min(1.0, balShoulder * (0.55 + 0.45 * balFoot) + cess * 0.50);
  // a summer sward's green and a dry patch's straw, each tuft its own shade — an albedo of their own, laid after the
  // bed's vertex tones below (the lab's second frames: mixed in here, the bed's grey multiplied them to dark stains)
  cotBallastWeedCol = mix(vec3(0.072, 0.120, 0.034), vec3(0.150, 0.125, 0.064), smoothstep(0.38, 0.72, balPatch))
    * (0.80 + 0.40 * weedTuft);
  cotBallastWeed = weed;
  cotBallastTilt *= 1.0 - weed;
  cotBallastGloss *= 1.0 - weed;
  #endif
}`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <color_fragment>', /* glsl */`#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, cotBallastWeedCol, cotBallastWeed); // the weeds' own albedo, over the bed's tone`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
roughnessFactor *= 1.0 - 0.28 * cotBallastGloss;`);
  if (stones) {
    shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
{
  // the stones' own faces, in world space (the bed lies nearly level: the tilt is in its plane)
  vec3 balTiltW = vec3(cotBallastTilt.x, 0.0, cotBallastTilt.y);
  normal = normalize(normal + (viewMatrix * vec4(balTiltW, 0.0)).xyz);
}`);
  }
}
