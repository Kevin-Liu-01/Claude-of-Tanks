/**
 * terrainSplatFold.ts — the terrain program's map-constant uniforms folded into GLSL constants (2026-10-12, the perf
 * stream).
 *
 * The splat material (terrain.ts SPLAT_COMMON_FRAG) carries every map's ground in one ~3,300-line fragment shader: the
 * sea, the land use's fields, the Redrock jebel faces, the airfield slabs, the salt crust, the terraces, the strata and
 * a dozen more terms, each gated by a uniform that a map sets once from its splat config (`if (uSea > 0.5)`,
 * `if (uLandA.x > 0.001)`, `if (uJebelFace.x > 0.0)`). A uniform gate skips the work at run time, but the GPU compiler
 * still has to allocate registers for every path it might take, and this material was measured at ~60-75 % of the
 * battle frame's GPU time, bound by its texture rounds at a low occupancy (terrain.ts, the ground lane's "GPU cut"
 * notes). Here each listed uniform whose value is fixed for the material's life becomes a `const` of exactly that
 * value, so the compiler folds the map's off terms out of the program and the remaining code keeps its registers.
 *
 * Exactness: a GLSL float constant written as the shortest decimal of the double JS holds rounds to the same float32 a
 * uniform upload of that double does (Float32Array conversion), so every term computes what it computed before; the
 * listed uniforms are assigned once per compile from the map's config (terrain.ts assignSplat*Uniforms) and nothing in
 * the runtime writes them afterwards. The program cache key carries the folded values' signature, so two maps whose
 * values differ never share a program.
 *
 * Lab tools that change one of these uniforms live (a probe zeroing a term to isolate it) turn folding off with
 * `?splatfold=0` or `window.__COT_SPLAT_FOLD = false` before the world builds.
 */

/** The map-constant splat uniforms (never written after the material's compile). Excluded on purpose: the ring bands'
 * per-draw relief uniforms, the ground clock, the sun direction and wall sky gain (live objects), the formation and
 * ring-cap bands (set by the build after the material exists), the measured layer means (refreshed when the sourced
 * layers land), the land-use tier (follows the quality preset), and the mask stack / road class / land bake vectors. */
export const SPLAT_FOLD_UNIFORMS: readonly string[] = Object.freeze([
  'uBeddedR', 'uCaprockY', 'uDetailGain', 'uFieldPatch', 'uIceDrift', 'uIceSky', 'uJebelFace',
  'uLandA', 'uLandB', 'uLandC', 'uLandD', 'uLandE', 'uLandRot', 'uLaneK', 'uMarshGloss', 'uMaskSize', 'uMicroAmp',
  'uMidFar', 'uMidRelief', 'uPaveSlab', 'uPavedRock', 'uPloughLift',
  'uReduxA', 'uReduxB', 'uReduxC', 'uReduxD', 'uReduxFold', 'uReduxSnow', 'uReduxSwash',
  'uRingRock', 'uRipple', 'uRippleNear', 'uRoadFromG', 'uRoadPuddle', 'uRoadRuts', 'uRoadTex', 'uRoadTint',
  'uRockGate', 'uSaltCrust', 'uSandMacro', 'uSea', 'uSeaFoam', 'uSeaOpeningCount', 'uSeaRamp', 'uShoulderDirt',
  'uSlopeGrassHold', 'uSoilTint', 'uStrata', 'uTerraceParam', 'uThatch', 'uTintA', 'uTintB', 'uTintC', 'uTownPave',
  'uTownWear', 'uWallWeather', 'uWornDirtStrength', 'uYardCinder',
]);

type FoldType = 'float' | 'vec2' | 'vec3' | 'vec4';
interface VectorLike { x: number; y: number; z?: number; w?: number; isVector2?: boolean; isVector3?: boolean; isVector4?: boolean }
interface UniformLike { value: unknown }

/** A GLSL float literal of a JS number: the shortest decimal that round-trips, with a decimal point. */
export function glslFloat(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`a folded splat uniform must be finite, got ${value}`);
  if (Object.is(value, -0)) return '-0.0'; // a uniform upload keeps the sign of zero, and so does the constant
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

/** The GLSL type and constant expression of a uniform value, or null when it is not a plain float or vector. */
export function splatFoldLiteral(value: unknown): [FoldType, string] | null {
  if (typeof value === 'number') return Number.isFinite(value) ? ['float', glslFloat(value)] : null;
  const v = value as VectorLike | null;
  if (!v || typeof v !== 'object') return null;
  const parts = v.isVector4 ? [v.x, v.y, v.z, v.w] : v.isVector3 ? [v.x, v.y, v.z] : v.isVector2 ? [v.x, v.y] : null;
  if (!parts || parts.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
  const type = (['', '', 'vec2', 'vec3', 'vec4'] as const)[parts.length] as FoldType;
  return [type, `${type}(${(parts as number[]).map(glslFloat).join(', ')})`];
}

/** The signature of the folded values (the program cache key's suffix): name=literal for every foldable uniform. */
export function splatFoldSignature(uniforms: Record<string, UniformLike | undefined>, names: readonly string[] = SPLAT_FOLD_UNIFORMS): string {
  let hash = 2166136261;
  let folded = 0;
  for (const name of names) {
    const literal = uniforms[name] ? splatFoldLiteral(uniforms[name]!.value) : null;
    const text = `${name}=${literal ? literal[1] : '-'};`;
    for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    if (literal) folded++;
  }
  return `f${folded}-${(hash >>> 0).toString(36)}`;
}

/**
 * Rewrite every `uniform <float|vecN> a, b, c;` declaration of the fragment source: each listed name with a foldable
 * value of the declared type becomes `const <type> name = <literal>;`, the others stay uniforms (in their order).
 * Array uniforms and samplers are never touched.
 */
export function foldSplatUniforms(
  source: string,
  uniforms: Record<string, UniformLike | undefined>,
  names: readonly string[] = SPLAT_FOLD_UNIFORMS,
): { source: string; folded: string[] } {
  const foldable = new Set(names);
  const folded: string[] = [];
  const out = source.replace(/^([ \t]*)uniform (float|vec2|vec3|vec4) ([^;[\]]+);/gm, (match, indent: string, type: FoldType, list: string) => {
    const keep: string[] = [];
    const consts: string[] = [];
    for (const raw of list.split(',')) {
      const name = raw.trim();
      const uniform = foldable.has(name) ? uniforms[name] : undefined;
      const literal = uniform ? splatFoldLiteral(uniform.value) : null;
      if (literal && literal[0] === type) {
        consts.push(`const ${type} ${name} = ${literal[1]};`);
        folded.push(name);
      } else keep.push(name);
    }
    if (!consts.length) return match;
    const kept = keep.length ? `${indent}uniform ${type} ${keep.join(', ')};\n` : '';
    return `${kept}${indent}${consts.join(`\n${indent}`)}`;
  });
  return { source: out, folded };
}

/** Folding is on unless a lab tool asked for live uniforms (`?splatfold=0`, `window.__COT_SPLAT_FOLD = false`). */
export function splatFoldEnabled(): boolean {
  try {
    const flag = (globalThis as { __COT_SPLAT_FOLD?: unknown }).__COT_SPLAT_FOLD;
    if (flag === false) return false;
    const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
    return !/[?&]splatfold=0(&|$)/.test(search);
  } catch {
    return true;
  }
}
