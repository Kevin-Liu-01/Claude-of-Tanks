/**
 * (EF.10, MASTER 19: "headlights and fires light the smoke") the local lights the battle's smoke and dust take: one
 * per-frame uniform array, read by the pooled puffs (particles.ts, the normal-blended media under FX_LIGHT_TINT) and the
 * volume media (volumeMedia.ts). It holds up to LOCAL_LIGHT_SLOTS lights: the night pool's headlight spots, the muzzle
 * flash, the explosion pulse and the burning wrecks' fires. No local light reached the particles or the media before:
 * at night a headlight beam drew no dust and a burning wreck's smoke stood black over its own fire.
 *
 * The uniform objects are module singletons (every material that reads them holds the same objects); effects.ts writes
 * them once a frame (begin / add* / end), allocation-free. Slot layout:
 *   uLocalP[i] = position xyz, range (m; negative: the volume media skip it, they light a burst's pulse themselves)
 *   uLocalC[i] = colour rgb (linear, a radiance gain on the medium's own albedo), the spot's inner cone cosine
 *   uLocalD[i] = spot direction xyz, the outer cone cosine (-2: a point light)
 * An empty slot has range 0.
 */
import * as THREE from 'three';

export const LOCAL_LIGHT_SLOTS = 8;
/** (240) a spot's (a headlight's) light on smoke and dust is the slot's own out to this range (m), then falls as the
 *  inverse square: a beam lights the dust round its own vehicle, not a wreck's column 25 m down the road */
const HEADLIGHT_SCATTER_NEAR_M = 7;

// a type literal (not an interface): it spreads into a material's uniform map, which wants an index signature
type LocalLightUniforms = {
  readonly uLocalP: { value: THREE.Vector4[] };
  readonly uLocalC: { value: THREE.Vector4[] };
  readonly uLocalD: { value: THREE.Vector4[] };
};

const slots = (): THREE.Vector4[] => Array.from({ length: LOCAL_LIGHT_SLOTS }, () => new THREE.Vector4(0, 0, 0, 0));
export const localLightUniforms: LocalLightUniforms = { uLocalP: { value: slots() }, uLocalC: { value: slots() }, uLocalD: { value: slots() } };

/** The GLSL: the uniforms and localLightAt(world position, skip the burst-flagged slots) -> the light's rgb there. */
export const LOCAL_LIGHT_GLSL = /* glsl */ `
uniform vec4 uLocalP[ ${LOCAL_LIGHT_SLOTS} ];
uniform vec4 uLocalC[ ${LOCAL_LIGHT_SLOTS} ];
uniform vec4 uLocalD[ ${LOCAL_LIGHT_SLOTS} ];
vec3 localLightAt( vec3 p, float skipBursts ) {
  vec3 sum = vec3( 0.0 );
  for ( int i = 0; i < ${LOCAL_LIGHT_SLOTS}; i++ ) {
    vec4 lp = uLocalP[ i ];
    if ( lp.w == 0.0 || ( lp.w < 0.0 && skipBursts > 0.5 ) ) continue;
    float range = abs( lp.w );
    vec3 d = p - lp.xyz;
    float dist = length( d );
    if ( dist >= range ) continue;
    float att = 1.0 - dist / range;
    att *= att;
    vec4 lc = uLocalC[ i ];
    vec4 ld = uLocalD[ i ];
    // (240, the night fire's critic: "the smoke over-lit far above the fire" — a burning wreck ahead of the player stood in
    // its headlight beams, whose linear window lit the smoke and dust 25 m out at half their near strength) a spot's beam
    // spreads: past HEADLIGHT_SCATTER_NEAR_M its light on the medium falls as the inverse square
    if ( ld.w > -1.5 ) att *= min( 1.0, ${(HEADLIGHT_SCATTER_NEAR_M * HEADLIGHT_SCATTER_NEAR_M).toFixed(1)} / max( dist * dist, 1e-3 ) );
    float cone = ld.w < -1.5 ? 1.0 : smoothstep( ld.w, lc.w, dot( d / max( dist, 1e-3 ), ld.xyz ) );
    sum += lc.rgb * ( att * cone );
  }
  return sum;
}
`;

/**
 * (EF.10, the coordinator: "Ultra Low and Low must skip the light loop entirely by compiling a variant, not by branching
 * at runtime") the loop compiles only under FX_LOCAL_LIGHTS. Every material that reads the slots registers here; the
 * define is set or removed on all of them together (a recompile, at a preset change, never per frame).
 */
export const LOCAL_LIGHTS_DEFINE = 'FX_LOCAL_LIGHTS';
const materials = new Set<THREE.ShaderMaterial>();
let compiled = true;
function applyDefine(mat: THREE.ShaderMaterial): void {
  const has = !!mat.defines && LOCAL_LIGHTS_DEFINE in mat.defines;
  if (has === compiled) return;
  const next: Record<string, unknown> = { ...(mat.defines ?? {}) };
  if (compiled) next[LOCAL_LIGHTS_DEFINE] = ''; else delete next[LOCAL_LIGHTS_DEFINE];
  mat.defines = next;
  mat.needsUpdate = true;
}
/** A material whose shader reads the slots under FX_LOCAL_LIGHTS: it takes the current variant now and at every change. */
export function registerLocalLightMaterial(mat: THREE.ShaderMaterial): void {
  materials.add(mat);
  applyDefine(mat);
}
/** The presets that compile the loop: every one but Low and Ultra Low (desktop and phone). */
export function localLightsForPreset(preset: string | null | undefined): boolean {
  return !preset || !/(^|-)(ultra)?low$/.test(preset);
}
/** Compile the loop in (true) or out (false) on every registered material. True when it changed. */
export function setLocalLightsCompiled(on: boolean): boolean {
  if (on === compiled) return false;
  compiled = on;
  for (const mat of materials) applyDefine(mat);
  return true;
}
/** Whether the loop is compiled (effects.ts skips gathering the lights when it is not). */
export function localLightsCompiled(): boolean {
  return compiled;
}

let cursor = 0;

/** Start a frame's lights (every slot emptied). */
export function beginLocalLights(): void {
  cursor = 0;
}

/** A point light: its colour (linear rgb) times gain, its range; burst: the volume media skip it. False when full. */
export function addLocalPoint(x: number, y: number, z: number, range: number, color: THREE.Color, gain: number,
  burst = false): boolean {
  if (cursor >= LOCAL_LIGHT_SLOTS || !(range > 0) || !(gain > 0)) return false;
  const i = cursor++;
  localLightUniforms.uLocalP.value[i].set(x, y, z, burst ? -range : range);
  localLightUniforms.uLocalC.value[i].set(color.r * gain, color.g * gain, color.b * gain, 1);
  localLightUniforms.uLocalD.value[i].set(0, 1, 0, -2);
  return true;
}

/** A spot light (a headlight): its cone from the axis (unit) and its outer and inner cone cosines. False when full. */
export function addLocalSpot(x: number, y: number, z: number, range: number, color: THREE.Color, gain: number,
  dx: number, dy: number, dz: number, cosOuter: number, cosInner: number): boolean {
  if (cursor >= LOCAL_LIGHT_SLOTS || !(range > 0) || !(gain > 0)) return false;
  const i = cursor++;
  const l = Math.hypot(dx, dy, dz) || 1;
  localLightUniforms.uLocalP.value[i].set(x, y, z, range);
  localLightUniforms.uLocalC.value[i].set(color.r * gain, color.g * gain, color.b * gain, Math.max(cosInner, cosOuter + 1e-3));
  localLightUniforms.uLocalD.value[i].set(dx / l, dy / l, dz / l, cosOuter);
  return true;
}

/** End the frame: the slots past the last light are emptied. Returns the lights set. */
export function endLocalLights(): number {
  for (let i = cursor; i < LOCAL_LIGHT_SLOTS; i++) localLightUniforms.uLocalP.value[i].w = 0;
  return cursor;
}
