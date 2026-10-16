/**
 * sceneLight.ts — the time of day's light for the missile wire and smoke trail (FX lane, 2026-10-14).
 *
 * The volume media light their puffs from the scene's published light rig (volumeMedia.ts refreshLight): the sun's
 * direction and colour, the sky and ground hemisphere (the physical model's sky irradiance and ground radiance on top),
 * the sky pole desaturated as light inside smoke mixes it. The missile trail and wire draw on every tier, also where the
 * media are off, so they read the same rig here into uniforms of their own. Allocation-free.
 */
import * as THREE from 'three';

interface LightRigLike {
  sunIntensity?: number; sunColor?: THREE.Color; hemiIntensity?: number; hemiSky?: THREE.Color; hemiGround?: THREE.Color;
}
interface LightModelLike {
  mode?: string; envIntensity?: number; envDiffuseGain?: number; groundRadiance?: readonly number[];
}
/** What the scene publishes on userData (the engine's light rig and light model). */
export interface SceneLightData {
  sunDirWorld?: THREE.Vector3; lightRig?: LightRigLike; lightModel?: LightModelLike; skyIrradiance?: THREE.Color;
}

/** The light a missile's smoke and wire take: the volume media's shading uniforms (their names and meaning). */
export interface SceneLightUniforms {
  readonly uSunDir: { value: THREE.Vector3 };
  readonly uSunCol: { value: THREE.Vector3 };
  readonly uSkyCol: { value: THREE.Vector3 };
  readonly uGroundCol: { value: THREE.Vector3 };
}

/** The media's sky saturation inside smoke (volumeMedia DEFAULT_TUNE.skySat). */
const SKY_SAT = 0.12;

export function createSceneLightUniforms(): SceneLightUniforms {
  return {
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
    uSunCol: { value: new THREE.Vector3(1.4, 1.35, 1.25) },
    uSkyCol: { value: new THREE.Vector3(0.55, 0.58, 0.62) },
    uGroundCol: { value: new THREE.Vector3(0.25, 0.23, 0.2) },
  };
}

/** Bring `out` up to the scene's light now (unchanged where the scene publishes nothing). */
export function readSceneLight(ud: SceneLightData | null | undefined, out: SceneLightUniforms): void {
  const sunDir = ud?.sunDirWorld;
  if (sunDir && sunDir.lengthSq() > 1e-8) out.uSunDir.value.copy(sunDir).normalize();
  const rig = ud?.lightRig;
  if (!rig) return;
  const si = (rig.sunIntensity ?? 4.5) / Math.PI;
  const sc = rig.sunColor;
  out.uSunCol.value.set(sc ? sc.r * si : si, sc ? sc.g * si : si, sc ? sc.b * si : si);
  const model = ud?.lightModel;
  const irr = ud?.skyIrradiance;
  const physical = model?.mode === 'physical' && !!irr;
  const hi = (rig.hemiIntensity ?? 0.4) * (physical ? 1 : 2.2) / Math.PI;
  const sky = rig.hemiSky, gnd = rig.hemiGround;
  let sr = sky ? sky.r * hi : hi, sg = sky ? sky.g * hi : hi, sb = sky ? sky.b * hi : hi;
  let gr = gnd ? gnd.r * hi : hi, gg = gnd ? gnd.g * hi : hi, gb = gnd ? gnd.b * hi : hi;
  if (physical && irr) {
    const kk = (model?.envIntensity ?? 1) * (model?.envDiffuseGain ?? 1);
    sr += irr.r * kk; sg += irr.g * kk; sb += irr.b * kk;
    const g2 = model?.groundRadiance;
    if (g2 && g2.length >= 3) { gr += g2[0] * kk; gg += g2[1] * kk; gb += g2[2] * kk; }
  }
  const lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
  out.uSkyCol.value.set(lum + (sr - lum) * SKY_SAT, lum + (sg - lum) * SKY_SAT, lum + (sb - lum) * SKY_SAT);
  out.uGroundCol.value.set(gr, gg, gb);
}
