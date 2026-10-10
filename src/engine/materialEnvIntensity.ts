/**
 * materialEnvIntensity.ts — a lit material's own share of the sky's image-based light (2026-10-08, the world-ibl lane
 * with the fleet lane).
 *
 * three 0.185 overwrites the envMapIntensity uniform of every MeshStandard / MeshPhysical, MeshLambert and MeshPhong
 * material that reads scene.environment (no envMap of its own) with scene.environmentIntensity on every draw
 * (WebGLRenderer setProgram), and copies the material's own value into it only when the material carries an envMap of
 * its own (WebGLMaterials). No material in this project carries one, so every authored envMapIntensity was dead from
 * the first commit: the vehicles' trims (armour paint 0.5, wheel paint 0.25, track steel 0.1) and every world trim
 * (props, vegetation, the horizon ring, the water, the Garage) changed nothing on screen, whatever their comments say.
 *
 * bindMaterialEnvIntensity puts the material back into that product without a line of shader text. The program's
 * uniform object becomes one whose setter keeps what three writes (the scene's intensity, or the material's own value
 * when it carries an envMap) and whose getter returns that times the material's envMapIntensity, read at every upload.
 * three's own getIBLIrradiance and getIBLRadiance multiply by it, so the diffuse sky light, the specular sky reflection
 * and the clearcoat lobe all take the material's share on top of the scene's (time of day and weather still drive the
 * scene's): three's semantics before r163. A material that authors nothing (1) uploads exactly what it uploaded before,
 * and no program changes, so nothing recompiles.
 *
 * engineCtx.setupShadowMaterial (lighting.ts) binds every lit material it registers; a hook that compiles outside the
 * cascade setup (a thumbnail, a tool) calls this itself. The receipt (materialEnvIntensity.selftest.mjs) pins the two
 * three lines this rests on, so a three upgrade that changes them fails loudly instead of killing the trims again.
 */
import type * as THREE from 'three';

interface EnvSurface {
  envMap?: THREE.Texture | null;
  envMapIntensity?: number;
}

type CompiledUniforms = Record<string, THREE.IUniform>;

/** The key a bound uniform carries: binding is idempotent, and receipts can tell a bound uniform from three's own. */
export const MATERIAL_ENV_INTENSITY_BOUND = Symbol.for('cot.materialEnvIntensity');

/**
 * Bind `material`'s live envMapIntensity into the compiled program's envMapIntensity uniform (see the module note).
 * Returns false when there is nothing to bind: the program has no such uniform (a ShaderMaterial, an unlit material),
 * it is bound already, or the material's own hook scales its sky light in GLSL (the fleet's transitional uVehEnvScale,
 * kept unscaled here so nothing takes its trim twice).
 */
export function bindMaterialEnvIntensity(shader: { uniforms: CompiledUniforms }, material: THREE.Material): boolean {
  const uniforms = shader.uniforms;
  const written = uniforms.envMapIntensity as (THREE.IUniform & { [MATERIAL_ENV_INTENSITY_BOUND]?: true }) | undefined;
  if (!written || written[MATERIAL_ENV_INTENSITY_BOUND] || uniforms.uVehEnvScale) return false;
  const surface = material as THREE.Material & EnvSurface;
  let stored = typeof written.value === 'number' ? written.value : 1;
  const bound = {
    [MATERIAL_ENV_INTENSITY_BOUND]: true as const,
    get value(): number {
      // a material with its own envMap: three wrote the material's value already
      if (surface.envMap) return stored;
      const own = surface.envMapIntensity;
      return typeof own === 'number' && Number.isFinite(own) ? stored * Math.max(0, own) : stored;
    },
    set value(next: number) {
      stored = next;
    },
  };
  uniforms.envMapIntensity = bound as THREE.IUniform;
  return true;
}
