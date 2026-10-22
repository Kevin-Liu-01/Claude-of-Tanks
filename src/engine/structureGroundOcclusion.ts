/**
 * structureGroundOcclusion.ts — 2026-10-09 (the shadows lane): the ground's sky beside the world's standing solids, read by
 * the aerial pass (post.ts) on the ground's ambient share. The law and the raster are structureGroundOcclusionBake.ts; this
 * is the runtime (the world's handle: the worker, the texture, the re-bake around destroyed or restored solids) and the
 * pass's block.
 *
 * The term dims only a ground pixel's ambient share, as the hulls' ground occlusion does (vehicleGroundOcclusion.ts):
 * colour · (1 − occ · (1 − r) · A / (T + A)), T the sun and A the ambient the light rig gives the pixel's depth normal
 * (contactShadows.ts), r the share of a blocked direction its occluder's own light gives back (a lit wall is not black). So
 * sunlit ground beside a wall keeps its sun, the ground in the wall's shadow and under a deck takes the darkening, and on a
 * clear day the term is a quarter of what it is under Whiteout's stratus. Receivers: opaque lit surfaces turned up (the
 * ground, a road, an apron decal, a flat rock) within SGO_GATE_M of the occluder's base, and the grass cards beside it —
 * never a wall, a roof, a hull (vehicle pixels are the cavity term's) or anything standing above the ground.
 *
 * Lifecycle (the handle lives in structureGroundOcclusionRuntime.ts since 232): map.ts creates the handle when the world
 * assembles (desktop; the phones keep their authored rig and no aerial contact block), the worker answers while the
 * battle entry warms, and the term fades in over SGO_FADE_IN_S (at once in shot mode: whenReady() is what the capture
 * staging awaits). World.update republishes the handle on
 * scene.userData.structureGroundOcclusion and polls the occluders' destroyed flags; a solid that breaks or is restored
 * re-bakes its reach in the worker and the answer patches the texture in place (copyTextureToTexture).
 *
 * 2026-10-17 (the SKY lane, 227 SKY-03): the handle also keeps the aureole's soft shadow (structureAureoleBake.ts) — a thin
 * deck's forward-scattered sunlight from a disc round the sun, hidden by the same solids — baked in the same worker for
 * the sun the pass asks for (requestAureole) once the light model gives the deck an aureole (lightModel.ts deckAureole),
 * re-baked when the sun moves and patched round destroyed solids like the occlusion. The pass's block takes the aureole's
 * light back where a solid hides it, on the same receivers (structureAureoleBake.ts has the law).
 */
import * as THREE from 'three';
import { SGO_BASE_WRAP_M, SGO_HALF_M, SGO_SIZE } from './structureGroundOcclusionBake.ts';
import { VEHICLE_ALPHA_MIN } from './vehicleOcclusion.ts';
import { lightTune } from './lightModelCore.ts';

/** The pass applies the term out to this distance, fading over the last SGO_RANGE_FADE_M (m). */
export const SGO_RANGE_M = 220;
export const SGO_RANGE_FADE_M = 70;
/** Receivers up to this far over the occluder's base take the term whole, fading to none SGO_GATE_SOFT_M higher (m). */
export const SGO_GATE_M = 0.8;
export const SGO_GATE_SOFT_M = 0.7;
/** Inside a standing solid's footprint (the raster's covered flag) only receivers at its base itself: never the solid's top. */
export const SGO_COVERED_GATE_M = 0.2;
export const SGO_COVERED_GATE_SOFT_M = 0.2;
/** Receivers turned up: from this normal y the term fades in, whole from the second (a wall foot's ground, never the wall). */
export const SGO_UP_MIN = 0.5;
export const SGO_UP_FULL = 0.8;
/**
 * The share of a blocked direction's darkening its occluder's own light gives back (first-order interreflection): a wall
 * seen from its foot is lit by half the sky and half the ground (vehicleGroundOcclusion.ts r_wall), its paint around 0.4.
 */
export const SGO_RETURN = 0.3;
/** A grass card (no sun state) takes this ambient share. */
export const SGO_CARD_AMBIENT_SHARE = 0.6;
/** The live term fades in over this many seconds once the bake lands (0 in shot mode). */
export const SGO_FADE_IN_S = 0.6;
/** How often the occluders' destroyed flags are polled (s). */
export const SGO_POLL_S = 0.4;
/**
 * (227) The aureole's receivers: up to this far over the shading solid's base take its shadow whole, fading to none
 * AUREOLE_GATE_SOFT_M higher (m) — wider than the occlusion's gate, for a shadow that runs tens of metres over the snow.
 */
export const AUREOLE_GATE_M = 2;
export const AUREOLE_GATE_SOFT_M = 2;
/**
 * (227 v2; the blind pairs on Whiteout: r1 at the aureole's physical share was invisible — "a thin dark contact line
 * only", "wall base lacks soft shade") On bright snow under a closed deck AgX's highlight shoulder leaves a tenth of
 * darkening four display levels, so the uniform sky's ring and the aureole's quarter-strength shadow both vanish. Under a
 * closed deck (the light model's overcast × closure) the occlusion is read broadened, occ' = 1 − (1 − occ)^k with k up to
 * SGO_DECK_BROAD (a wall foot 0.5 → 0.82, a wall height out 0.15 → 0.33, two heights 0.05 → 0.13: a halo a height or two
 * wide, as the snow round a hut reads in an overcast photograph), and the aureole's share is taken DECK_AUREOLE_GAIN
 * times (at most AUREOLE_SHARE_MAX of the hemisphere's light): a soft shadow that reads, never a sunny-day one.
 * QA: __LIGHT_TUNE.SGO_DECK_BROAD (1 = off) and DECK_AUREOLE (the gain; 0 = off).
 */
// (229) off by default: Whiteout's pairs found its broadened halo painting grey blotches where small solids crowd a snow
// hollow (v4b, 2026-10-17); the aureole alone grounds the solids
export const SGO_DECK_BROAD = 1;
/** (227 v3) The deepest the block darkens a ground pixel (occlusion and aureole together): never a black pocket. */
export const SGO_DARK_MAX = 0.6;

export const DECK_AUREOLE_GAIN = 2.5;
export const AUREOLE_SHARE_MAX = 0.6;
/** (227) A sun moved further than this from the aureole's baked one re-bakes it (the cosine of 1°). */
export const AUREOLE_SUN_COS = Math.cos(Math.PI / 180);

export interface StructureGroundOcclusionHandle {
  readonly texture: THREE.DataTexture;
  /** The first bake has landed. */
  readonly ready: boolean;
  /** 0..1: the term's live strength (the fade-in, the map's scale). */
  readonly strength: number;
  /** The world is on screen (its group mounted and visible). */
  active(): boolean;
  whenReady(): Promise<boolean>;
  /** Per frame (World.update): fade in, poll the destroyed flags, flush landed patches. */
  update(dt: number): void;
  /** The pass, before it binds the texture: copies landed region patches into the uploaded texture. */
  flush(renderer: THREE.WebGLRenderer): void;
  setInstant(on: boolean): void;
  dispose(): void;
  /** (227) The aureole's soft shadow raster (structureAureoleBake.ts): null until a thin deck asks for it. */
  readonly aureoleTexture: THREE.DataTexture | null;
  /** (227) 0..1: the aureole's live strength (its bake for a sun has landed; the fade-in, the map's scale). */
  readonly aureoleStrength: number;
  /** (227) The pass, while the deck has an aureole: the sun (toward it) to bake it for; a sun moved 1° re-bakes. */
  requestAureole(sun: readonly number[]): void;
  readonly stats: {
    parts: number; bakeMs: number; rebakes: number; patches: number; worker: boolean; aureoleMs: number; aureoleBakes: number;
  };
}

// ------------------------------------------------------------------------------------------------- the aerial pass

export interface StructureGroundUniforms {
  uSgo: THREE.IUniform<number>;
  tSgo: THREE.IUniform<THREE.Texture>;
  /** (227) The aureole: x its light on up-facing ground in the rig's units, y its share of that ground's ambient. */
  uAur: THREE.IUniform<THREE.Vector2>;
  tAur: THREE.IUniform<THREE.Texture>;
  /** (227 v2) The occlusion's broadening exponent under a closed deck (1 = the uniform sky's own law). */
  uSgoBroad: THREE.IUniform<number>;
}

const EMPTY = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0]), 1, 1, THREE.RGFormat, THREE.UnsignedByteType);
  t.unpackAlignment = 2;
  t.needsUpdate = true;
  return t;
})();

export function createStructureGroundUniforms(): StructureGroundUniforms {
  return { uSgo: { value: 0 }, tSgo: { value: EMPTY }, uAur: { value: new THREE.Vector2() }, tAur: { value: EMPTY }, uSgoBroad: { value: 1 } };
}

/** Per frame (post.ts): the active world's handle, when the lever is on and its bake has landed. */
export function updateStructureGroundUniforms(
  uniforms: StructureGroundUniforms | Record<string, THREE.IUniform>, scene: THREE.Scene, renderer: THREE.WebGLRenderer, enabled: boolean,
): void {
  const u = uniforms as StructureGroundUniforms;
  const handle = scene.userData.structureGroundOcclusion as StructureGroundOcclusionHandle | undefined;
  const on = !!(enabled && handle && handle.active());
  // (227) the deck's aureole (lightModel.ts deckAureole: its share of the hemisphere's light), baked for the pass's sun
  // (QA: __LIGHT_TUNE.DECK_AUREOLE is its gain, live; 0 drops it)
  const model = scene.userData.lightModel as { deckAureole?: number; overcast?: number; deckClosure?: number; mode?: string } | undefined;
  const share = on ? Math.min(AUREOLE_SHARE_MAX, Math.max(0, model?.deckAureole ?? 0) * Math.max(0, lightTune('DECK_AUREOLE', DECK_AUREOLE_GAIN))) : 0;
  // (227 v2) the occlusion broadened under a closed deck
  const deck = model?.mode === 'physical' ? Math.min(1, Math.max(0, (model.overcast ?? 0) * (model.deckClosure ?? 0))) : 0;
  u.uSgoBroad.value = 1 + (Math.max(1, lightTune('SGO_DECK_BROAD', SGO_DECK_BROAD)) - 1) * deck;
  const sun = (uniforms as { uSunDir?: THREE.IUniform<THREE.Vector3> }).uSunDir?.value;
  if (share > 1e-3 && handle && sun) handle.requestAureole([sun.x, sun.y, sun.z]);
  const strength = on && handle ? handle.strength : 0;
  const aurStrength = share > 1e-3 && handle ? handle.aureoleStrength : 0;
  if (handle && (strength > 0.001 || aurStrength > 0.001)) handle.flush(renderer);
  if (!(strength > 0.001) || !handle) { u.uSgo.value = 0; u.tSgo.value = EMPTY; } else {
    u.uSgo.value = strength;
    u.tSgo.value = handle.texture;
  }
  const aurTexture = handle?.aureoleTexture ?? null;
  const amb = (uniforms as { uContactAmb?: THREE.IUniform<THREE.Vector4> }).uContactAmb?.value;
  const fillY = Math.max(0, (uniforms as { uContactFillDir?: THREE.IUniform<THREE.Vector3> }).uContactFillDir?.value.y ?? 0);
  if (!(aurStrength > 0.001) || !aurTexture || !amb) { u.uAur.value.set(0, 0); u.tAur.value = EMPTY; return; }
  // the aureole is that share of the hemisphere's light on up-facing ground (the rig's sky pole, uContactAmb.x)
  const light = share * amb.x * aurStrength;
  const ambUp = amb.x + amb.z + amb.w * fillY;
  u.uAur.value.set(light, ambUp > 1e-6 ? light / ambUp : 0);
  u.tAur.value = aurTexture;
}

const f = (x: number): string => x.toFixed(5);

/**
 * The block the aerial fragment includes AFTER `CONTACT_SHADOW_GLSL` (it uses cotSunVisOf, cotNormalAt, the rig uniforms
 * and the pass's uSunDir): `cotStructureGroundShade(uv, P, alpha, dist)` → the multiplier for a ground pixel's colour.
 */
export const STRUCTURE_GROUND_OCCLUSION_GLSL = /* glsl */ `
    // 2026-10-09: the ground's sky beside the world's solids (structureGroundOcclusion.ts)
    uniform float uSgo;
    uniform sampler2D tSgo;
    // 2026-10-17 (227 SKY-03): a thin deck's aureole (structureAureoleBake.ts) — x its light on up-facing ground in the
    // rig's units, y its share of that ground's ambient (a card's)
    uniform vec2 uAur;
    uniform sampler2D tAur;
    // (227 v2) the occlusion's broadening under a closed deck: occ' = 1 - (1 - occ)^k
    uniform float uSgoBroad;
    // the aureole raster's gate, as the occlusion's below: its texel's base (stored modulo ${SGO_BASE_WRAP_M} m, the one nearest
    // the pixel's own height) against the pixel's height; inside a standing solid's footprint only the ground at its base
    float cotAurGate( vec2 near, float y, float gateM, float softM ) {
      float d = near.g * ${f((255 / 256) * SGO_BASE_WRAP_M)} - mod( y, ${f(SGO_BASE_WRAP_M)} );
      d -= ${f(SGO_BASE_WRAP_M)} * floor( d * ${f(1 / SGO_BASE_WRAP_M)} + 0.5 );
      bool coveredHere = mod( floor( near.r * 255.0 + 0.5 ), 2.0 ) > 0.5;
      return coveredHere ? 1.0 - smoothstep( ${f(SGO_COVERED_GATE_M)}, ${f(SGO_COVERED_GATE_M + SGO_COVERED_GATE_SOFT_M)}, -d )
        : 1.0 - smoothstep( gateM, gateM + softM, -d );
    }
    float cotStructureGroundShade( vec2 uv, vec3 P, float alpha, float dist ) {
      vec2 t = P.xz * ${f(1 / (2 * SGO_HALF_M))} + 0.5;
      if ( any( lessThan( t, vec2( 0.0 ) ) ) || any( greaterThan( t, vec2( 1.0 ) ) ) ) return 1.0;
      // the occlusion in R's upper seven bits (the covered flag's lowest bit is noise under 1/254 in the filtered read)
      float occ = texture2D( tSgo, t ).r * ${f(255 / 254)};
      float aur = uAur.x > 0.0 ? texture2D( tAur, t ).r * ${f(255 / 254)} : 0.0;
      if ( occ < 0.008 && aur < 0.008 ) return 1.0;
      occ = 1.0 - pow( 1.0 - min( occ, 1.0 ), uSgoBroad );
      ivec2 ti = ivec2( min( t * ${f(SGO_SIZE)}, vec2( ${f(SGO_SIZE - 1)} ) ) );
      float gate = 0.0;
      if ( occ >= 0.008 ) {
        // the strongest occluder's base, stored modulo ${SGO_BASE_WRAP_M} m: the one nearest the pixel's own height
        vec2 near = texelFetch( tSgo, ti, 0 ).rg;
        float baseMod = near.g * ${f((255 / 256) * SGO_BASE_WRAP_M)};
        float d = baseMod - mod( P.y, ${f(SGO_BASE_WRAP_M)} );
        d -= ${f(SGO_BASE_WRAP_M)} * floor( d * ${f(1 / SGO_BASE_WRAP_M)} + 0.5 );
        // inside a standing solid's footprint only the ground at its base (the wall foot under the filter), never its top
        bool covered = mod( floor( near.r * 255.0 + 0.5 ), 2.0 ) > 0.5;
        gate = covered ? 1.0 - smoothstep( ${f(SGO_COVERED_GATE_M)}, ${f(SGO_COVERED_GATE_M + SGO_COVERED_GATE_SOFT_M)}, -d )
          : 1.0 - smoothstep( ${f(SGO_GATE_M)}, ${f(SGO_GATE_M + SGO_GATE_SOFT_M)}, -d );
      }
      // the aureole's shade: its shading solid's base by its own texel, a wider gate for a shadow tens of metres long
      float aGate = aur >= 0.008 ? cotAurGate( texelFetch( tAur, ti, 0 ).rg, P.y, ${f(AUREOLE_GATE_M)}, ${f(AUREOLE_GATE_SOFT_M)} ) : 0.0;
      if ( gate <= 0.0 && aGate <= 0.0 ) return 1.0;
      float range = 1.0 - smoothstep( ${f(SGO_RANGE_M - SGO_RANGE_FADE_M)}, ${f(SGO_RANGE_M)}, dist );
      gate *= range;
      aGate *= range;
      float sunVis = cotSunVisOf( alpha );
      float ambShare = ${f(SGO_CARD_AMBIENT_SHARE)};
      float aurDark = uAur.y * aur * aGate * ${f(SGO_CARD_AMBIENT_SHARE)};
      if ( sunVis >= 0.0 ) {
        vec3 N = cotNormalAt( uv, P );
        float up = smoothstep( ${f(SGO_UP_MIN)}, ${f(SGO_UP_FULL)}, N.y );
        gate *= up;
        aGate *= up;
        if ( gate <= 0.0 && aGate <= 0.0 ) return 1.0;
        float T = uContactSunLum * max( dot( N, uSunDir ), 0.0 ) * clamp( sunVis, 0.0, 1.0 );
        float A = mix( uContactAmb.y, uContactAmb.x, N.y * 0.5 + 0.5 ) + uContactAmb.z
          + uContactAmb.w * max( dot( N, uContactFillDir ), 0.0 );
        ambShare = A / max( T + A, 1e-4 );
        // the aureole's light the solid hides, over all the light the pixel takes (never the occluder's own light given back:
        // the face turned to its shadow is the face the aureole does not light)
        aurDark = uAur.x * aur * aGate / max( T + A, 1e-4 );
      }
      // (v3) never deeper than SGO_DARK_MAX together: a pocket under a reel or a deck stays shade, not a hole
      return 1.0 - min( uSgo * occ * ${f(1 - SGO_RETURN)} * gate * ambShare + aurDark, ${f(SGO_DARK_MAX)} );
    }
`;

/** The pass's condition (post.ts): a non-vehicle pixel within range. */
export const STRUCTURE_GROUND_ALPHA_MAX = VEHICLE_ALPHA_MIN;
