/**
 * A burnt-out hulk's flanks, streaked (destruction core, 2026-10-10; gauntlet wave 350: the hulk with "mottled rust and
 * soot streaking" read as a derelict, the others as "crisp, undamaged models", one with "orange rust smears painted
 * onto an intact, blocky body").
 *
 * The bake (wrecks.ts) paints a hulk in vertex colours: char, oxide, muted rust blooms, the heat over the fighting
 * compartment and the engine deck, soot round them and over the deck's edges. A vertex colour is only as fine as the
 * corners under it, and a hull is built of plates a metre and more across, so the runs a long-dead hulk carries — soot
 * washed down from the deck and the hatches, rust run from the seams — are drawn here, in world space, after the vertex
 * colours: dark runs down every face in the face's own plane (whatever its heading; the horizontal across it, the
 * world's vertical down it), finer ones among them, and a few warmer rust runs where the soot is thin. Upward faces
 * take none (the deck keeps the bake's ash and heat).
 *
 * The hulks' merged mesh alone wears it (props.ts mats.wreck, the props grime law under it, its own program); the grime
 * tile (makeGrimeTexture: channels about 0.5, a tenth either side; red 3 and 7 cycles a tile, green 5 and 13) gives the
 * runs: green at 0.62 a metre across and 0.07 up is 13-33 cm wide and 1.1-2.9 m long.
 */
function mustReplace(source: string, anchor: string, replacement: string): string {
  if (!source.includes(anchor)) throw new Error(`wreckSurfaceShader: anchor not found: ${anchor}`);
  return source.replace(anchor, replacement);
}

/** The runs (after <color_fragment>: they act on the bake's colours; needs the grime hook's vGrimeW, vGrimeN, uGrime). */
export const WRECK_RUNS_GLSL = /* glsl */`
{
  vec3 wn = normalize(vGrimeN);
  float wVertical = 1.0 - smoothstep(0.45, 0.75, abs(wn.y));
  if (wVertical > 0.0) {
    vec2 wt = normalize(vec2(-wn.z, wn.x) + vec2(1e-5, 0.0));
    float ws = dot(vGrimeW.xz, wt), wy = vGrimeW.y;
    float sootRun = smoothstep(0.54, 0.68, texture2D(uGrime, vec2(ws * 0.62, wy * 0.07)).g);
    float fineRun = smoothstep(0.56, 0.70, texture2D(uGrime, vec2(ws * 1.45 + 0.37, wy * 0.11 + 0.19)).r);
    float rustRun = smoothstep(0.58, 0.70, texture2D(uGrime, vec2(ws * 0.95 + 0.61, wy * 0.05 + 0.43)).g);
    diffuseColor.rgb *= 1.0 - wVertical * (0.38 * sootRun + 0.16 * fineRun);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.32, 1.02, 0.82),
      wVertical * rustRun * (1.0 - sootRun) * 0.55);
  }
}`;

/** Install the runs on a props material whose grime hook ran first (the wreck material's hook). */
export function applyWreckSurfaceHook(shader: { fragmentShader: string }): void {
  if (!shader.fragmentShader.includes('varying vec3 vGrimeW;')) throw new Error('wreckSurfaceShader: the grime hook must run first');
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <color_fragment>',
    `#include <color_fragment>\n${WRECK_RUNS_GLSL}`);
}
