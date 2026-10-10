/**
 * studioLightRuntime.ts — applies a Scene Studio light plan (studioLight.ts) to the live battlefield and restores it.
 *
 * Demand-loaded by main.ts's Studio port only (never by battle, Garage or boot code). One plan application:
 *
 *   1. the sky preset through the composition root's atomic sky + key-light transaction (atmosphere LUTs, PMREM
 *      environment, fog, cloud decks, CSM key, hemisphere, fill) — the sky's own caches re-key on the preset,
 *   2. vehicle readability,
 *   3. the world's BAKED light: the horizon ring, its treeline and far range are unlit materials whose sun direction,
 *      gains and haze were captured at build time from the map's authored day. They take the plan's key direction,
 *      key/ambient balance, fog tint and an overall dim; the terrain's wall sky light turns with the key,
 *   4. temporal histories that integrate light (the volumetric cloud history, TAA) restart, so a still or the first
 *      film frame after a change never blends the previous light.
 *
 * Every mutated value is saved once and restored exactly: on a return to the authored day, on a world switch and
 * on Studio exit (the battlefield is cached and may host a battle next).
 */
import * as THREE from 'three';
import {
  planStudioLight, type StudioCloudIdentity, type StudioLight, type StudioLightLab, type StudioLightPlan, type StudioTimeOfDay,
} from './studioLight.ts';
import { MARS_SKY_PRESET } from '../engine/marsAtmosphere.ts';
import { setVehicleReadabilityScale } from '../vehicles/vehicleReadability.ts';
import type { MapSkyConfig } from '../world/maps/horizon.ts';
import type { bakeHorizonRelief, HorizonReliefField } from '../world/horizonRelief.ts';
import type { CloudscapeConfig } from '../engine/cloudscapes.ts';
import { createNightLightingRuntime, type NightLightingBudget, type NightLightingRuntime } from '../engine/nightLightingRuntime.ts';

interface StudioLightWorld {
  readonly mapId: string;
  readonly group: THREE.Object3D;
  readonly config: { readonly sky?: MapSkyConfig; readonly clouds?: CloudscapeConfig };
}

interface StudioLightRuntimeOptions {
  getWorld(): StudioLightWorld | null;
  /** The composition root's sky + key transaction (sky.applyPreset, lighting.setSun, fog baseline, IBL receipt). */
  applySky(preset: MapSkyConfig, keyDirection: THREE.Vector3 | null): void;
  /** Restart light-integrating temporal histories (TAA); the cloud history restarts through the scene's layer. */
  resetTemporalHistory?(): void;
  /** The tier's pooled lamp budget for the blue-hour and night emitters (the battle night's own budget). */
  nightLightBudget?(): NightLightingBudget;
  /**
   * The cloud field's identity (weather offset and wind) under an authored sky, by the battle sky's own derivation
   * (cloudPresets.ts over sky.ts DEFAULT_SKY_PRESET). Passed in: the Studio chunk imports no boot sky module.
   */
  cloudIdentity(authored: MapSkyConfig): StudioCloudIdentity;
  scene: THREE.Scene;
}

export interface StudioLightRuntime {
  /** Apply the plan for the active world. Returns the plan as rendered. */
  apply(time: StudioTimeOfDay, light: StudioLight | null): StudioLightPlan;
  /** The Studio actors whose authored lamps (headlights) join the blue-hour and night emitters. */
  setActorRoots(roots: readonly THREE.Object3D[]): void;
  /** Per rendered Studio frame (and before a capture): place the pooled lamps nearest the camera. */
  update(cameraPosition: THREE.Vector3Like): void;
  /** Put every mutated world value, the lamps and the readability back (the sky belongs to the battle atmosphere owner). */
  restore(): void;
  readonly plan: StudioLightPlan | null;
}

type Uniform<T> = { value: T };
interface VistaUniforms {
  uVRelief?: Uniform<THREE.DataTexture | null>;
  uVReliefAmp?: Uniform<number>;
  uVAmbient?: Uniform<number>;
  uVSunGain?: Uniform<number>;
  uVSkyTint?: Uniform<THREE.Vector3>;
  uVFogTint?: Uniform<THREE.Vector3>;
}
interface FarShading {
  uFSun: Uniform<THREE.Vector3>;
  uFGains: Uniform<THREE.Vector2>;
  uFRock: Uniform<THREE.Color>;
  uFSnow: Uniform<THREE.Color>;
  uFFog: Uniform<THREE.Color>;
}

const HORIZON_MESHES = new Set(['horizon-ring', 'horizon-treeline', 'horizon-detail', 'horizon-far-range']);
/**
 * The pooled lamps' light (not their glowing lenses and windows) under the Studio sky: the battle night's headlight
 * spots were tuned for a dark playable night and blew out pale snow and sand under the brighter blue hour.
 */
const LAMP_LIGHT_SCALE: Readonly<Partial<Record<StudioTimeOfDay, number>>> = Object.freeze({ dusk: 0.45, night: 0.7 });
/** A key this close to the authored sun keeps the ring's original cast-shadow bake (cos 0.25°). */
const SAME_SUN_COS = Math.cos(0.25 * Math.PI / 180);

/**
 * Re-bake the ring atlas's sun visibility (its A channel: the ridges' cast shadows over the ranges, also read by the
 * terrain's ring bands) for a new key direction. The bake input is rebuilt from the ring geometry (the seam column
 * dropped, the sea apron from the UV's negative V) with the ring's own relief field, so a lower or moved sun lays
 * longer or turned shadows; the gradient and occlusion channels keep the build's bytes.
 */
function rebakeRingSun(ring: THREE.Mesh, texture: THREE.DataTexture, sun: THREE.Vector3): boolean {
  // the ring's bake and column count ride with its relief field (horizon.ts): the Studio imports no horizon module
  const source = ring.userData.horizonReliefSource as
    { field: HorizonReliefField; maxHeight: number; columns: number; bake: typeof bakeHorizonRelief } | undefined;
  const image = texture.image as { data?: Uint8Array; width?: number; height?: number } | undefined;
  const position = ring.geometry.getAttribute('position'), uv = ring.geometry.getAttribute('uv');
  if (!source || !image?.data || !image.width || !image.height || !position || !uv) return false;
  const n = source.columns, stride = n + 1, rowCount = Math.floor(position.count / stride);
  if (rowCount * stride !== position.count) return false;
  const positions = new Float32Array(n * rowCount * 3), heights = new Float32Array(n * rowCount), marine = new Float32Array(n * rowCount);
  for (let row = 0; row < rowCount; row++) {
    for (let k = 0; k < n; k++) {
      const src = row * stride + k, dst = row * n + k;
      positions[dst * 3] = position.getX(src); positions[dst * 3 + 1] = position.getY(src); positions[dst * 3 + 2] = position.getZ(src);
      heights[dst] = position.getY(src);
      marine[dst] = Math.max(0, -uv.getY(src));
    }
  }
  const bake = source.bake({ columns: n, rowCount, positions, heights, maxHeight: source.maxHeight, marine },
    source.field, [sun.x, sun.y, sun.z], { width: image.width, height: image.height });
  const data = image.data;
  for (let i = 3; i < data.length; i += 4) data[i] = bake.data[i];
  texture.needsUpdate = true;
  return true;
}
const AUTHORED_DAY = 'authored-day';

/** The map's authored sky as the battle atmosphere starts from it (main.ts getAuthoredPreset; Mars's shared preset). */
export function studioAuthoredSky(world: StudioLightWorld): MapSkyConfig {
  if (world.mapId === 'mars') return { ...MARS_SKY_PRESET };
  const sky = world.config.sky ?? {};
  return world.config.clouds ? { ...sky, cloudscape: world.config.clouds } : { ...sky };
}

function linearHex(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

export function createStudioLightRuntime(options: StudioLightRuntimeOptions): StudioLightRuntime {
  const savedColors = new Map<THREE.Color, THREE.Color>();
  const savedSunVisibility = new Map<THREE.DataTexture, Uint8Array>();
  const savedValues = new Map<Uniform<unknown>, unknown>();
  let appliedRoot: THREE.Object3D | null = null;
  let appliedKey = AUTHORED_DAY;
  let current: StudioLightPlan | null = null;
  const keyScratch = new THREE.Vector3();
  // blue hour and night: the world's authored window / lamp emitters and the actors' headlights (the battle night's
  // pooled lights, a separate Studio-owned pool); re-prepared from scratch on every change so a frame never depends on
  // the previous slot assignment
  let night: NightLightingRuntime | null = null;
  let nightRoot: THREE.Object3D | null = null;
  let actorRoots: THREE.Object3D[] = [];
  let headlights = true;

  function saveColor(color: THREE.Color): void {
    if (!savedColors.has(color)) savedColors.set(color, color.clone());
  }
  function saveUniform<T>(uniform: Uniform<T> | undefined): uniform is Uniform<T> {
    if (!uniform) return false;
    if (!savedValues.has(uniform as Uniform<unknown>)) {
      const value = uniform.value as unknown;
      savedValues.set(uniform as Uniform<unknown>, (value as { clone?: () => unknown })?.clone ? (value as { clone: () => unknown }).clone() : value);
    }
    return true;
  }
  function original<T>(uniform: Uniform<T>): T {
    return (savedValues.has(uniform as Uniform<unknown>) ? savedValues.get(uniform as Uniform<unknown>) : uniform.value) as T;
  }

  function restoreWorld(): void {
    for (const [color, value] of savedColors) color.copy(value);
    for (const [uniform, value] of savedValues) {
      const live = uniform.value as { copy?: (v: unknown) => unknown };
      if (live && typeof live === 'object' && typeof live.copy === 'function') live.copy(value);
      else uniform.value = value;
    }
    savedColors.clear();
    savedValues.clear();
    for (const [texture, alpha] of savedSunVisibility) {
      const data = (texture.image as { data: Uint8Array }).data;
      for (let i = 3, j = 0; i < data.length; i += 4, j++) data[i] = alpha[j];
      texture.needsUpdate = true;
    }
    savedSunVisibility.clear();
  }

  /** Unlit horizon materials used only by the named horizon meshes (an alias shared with any other mesh is left alone). */
  function horizonMaterials(root: THREE.Object3D): THREE.MeshBasicMaterial[] {
    const eligible = new Set<THREE.MeshBasicMaterial>(), blocked = new Set<THREE.MeshBasicMaterial>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const selected = HORIZON_MESHES.has(mesh.name);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const basic = material as THREE.MeshBasicMaterial;
        if (basic?.isMeshBasicMaterial) (selected ? eligible : blocked).add(basic);
      }
    });
    return [...eligible].filter((material) => !blocked.has(material));
  }

  /** The terrain's shared wall-sky sun uniform (one object per terrain material, read by every program variant). */
  function terrainSunUniforms(root: THREE.Object3D): Uniform<THREE.Vector3>[] {
    const out = new Set<Uniform<THREE.Vector3>>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const uniform = material?.userData?.sunDirUniform as Uniform<THREE.Vector3> | undefined;
        if (uniform?.value?.isVector3) out.add(uniform);
      }
    });
    return [...out];
  }

  function gradeWorld(root: THREE.Object3D, plan: StudioLightPlan, authored: MapSkyConfig, key: THREE.Vector3): void {
    const dim = plan.horizon.dim;
    const sky = plan.sky;
    // the balance of the baked lighting follows the plan's key and ambient against the map's authored day
    const keyScale = (sky.sunIntensity ?? 4.5) / Math.max(1e-3, authored.sunIntensity ?? 4.5);
    const ambientScale = (sky.hemiIntensity ?? 0.36) / Math.max(1e-3, authored.hemiIntensity ?? 0.36);
    const fog = linearHex(sky.fogTintHex ?? 0x7e97b8);
    let skyTint: THREE.Vector3 | null = null; // the vista's own sky-tint law (horizon.ts horizonSkyTint) under this fog
    for (const material of horizonMaterials(root)) {
      saveColor(material.color);
      material.color.copy(savedColors.get(material.color)!).multiplyScalar(dim);
      const sun = material.userData.horizonSunDir as Uniform<THREE.Vector3> | undefined;
      if (saveUniform(sun)) sun.value.copy(key);
      const vistaData = material.userData.horizonVista as
        { uniforms?: VistaUniforms; skyTint?: (fog: THREE.Color) => THREE.Vector3 } | undefined;
      const vista = vistaData?.uniforms;
      if (vista) {
        if (saveUniform(vista.uVSunGain)) vista.uVSunGain.value = original(vista.uVSunGain) * keyScale;
        if (saveUniform(vista.uVAmbient)) vista.uVAmbient.value = original(vista.uVAmbient) * ambientScale;
        if (vistaData?.skyTint && saveUniform(vista.uVSkyTint)) vista.uVSkyTint.value.copy(skyTint ??= vistaData.skyTint(fog));
        if (saveUniform(vista.uVFogTint)) vista.uVFogTint.value.set(fog.r, fog.g, fog.b);
      }
      const far = material.userData.horizonFarShading as FarShading | undefined;
      if (far) {
        if (saveUniform(far.uFSun)) far.uFSun.value.copy(key);
        if (saveUniform(far.uFGains)) {
          const authoredGains = original(far.uFGains);
          far.uFGains.value.set(authoredGains.x * ambientScale, authoredGains.y * keyScale);
        }
        // the far range's rock, snow and haze are absolute colours (the material colour dims only its base albedo)
        if (saveUniform(far.uFRock)) far.uFRock.value.copy(original(far.uFRock)).multiplyScalar(dim);
        if (saveUniform(far.uFSnow)) far.uFSnow.value.copy(original(far.uFSnow)).multiplyScalar(dim);
        if (saveUniform(far.uFFog)) far.uFFog.value.copy(fog).multiplyScalar(dim);
      }
    }
    for (const uniform of terrainSunUniforms(root)) {
      if (saveUniform(uniform)) uniform.value.copy(key);
    }
    // the ridges' cast shadows for this key (a lower sun lays them longer, a moved one turns them)
    root.traverse((object) => {
      const ring = object as THREE.Mesh;
      if (!ring.isMesh || ring.name !== 'horizon-ring' || Array.isArray(ring.material)) return;
      const material = ring.material as THREE.MeshBasicMaterial;
      const vista = (material.userData.horizonVista as { uniforms?: VistaUniforms } | undefined)?.uniforms;
      const texture = vista?.uVRelief?.value;
      const sun = material.userData.horizonSunDir as Uniform<THREE.Vector3> | undefined;
      if (!texture || !(vista?.uVReliefAmp?.value) || !sun || savedSunVisibility.has(texture)) return;
      if (original(sun).dot(key) >= SAME_SUN_COS) return;
      const data = (texture.image as { data?: Uint8Array } | undefined)?.data;
      if (!data) return;
      const alpha = new Uint8Array(data.length / 4);
      for (let i = 3, j = 0; i < data.length; i += 4, j++) alpha[j] = data[i];
      savedSunVisibility.set(texture, alpha);
      if (!rebakeRingSun(ring, texture, key)) savedSunVisibility.delete(texture);
    });
  }

  function syncNight(): void {
    const world = options.getWorld();
    const on = !!world && !!current && (current.time === 'dusk' || current.time === 'night');
    if (!on) {
      if (nightRoot) night?.reset();
      nightRoot = null;
      return;
    }
    night ??= createNightLightingRuntime(options.scene, options.nightLightBudget?.() ?? { spotLights: 4, pointLights: 2 });
    night.prepare([{ root: world.group }, ...(headlights ? actorRoots.map((root) => ({ root })) : [])], true);
    nightRoot = world.group;
  }

  function planKey(plan: StudioLightPlan, exactDay: boolean): string {
    return exactDay ? AUTHORED_DAY : JSON.stringify([plan.sky, plan.keyDirection, plan.readability, plan.horizon]);
  }

  function apply(time: StudioTimeOfDay, light: StudioLight | null): StudioLightPlan {
    const world = options.getWorld();
    if (!world) throw new Error('Studio light requires an active battlefield');
    const authored = studioAuthoredSky(world);
    // QA calibration probes may set window.__STUDIO_LIGHT_LAB before applying a light (never set by the product)
    const lab = (globalThis as { __STUDIO_LIGHT_LAB?: StudioLightLab }).__STUDIO_LIGHT_LAB ?? null;
    const plan = planStudioLight(world.mapId, authored, time, light, options.cloudIdentity(authored), lab); // the cloud field pinned across Studio times
    const exactDay = plan.time === 'day' && plan.sunAzimuthDeg === (authored.sunAzimuthDeg ?? 115)
      && plan.sunElevationDeg === (authored.sunElevationDeg ?? 32);
    if (appliedRoot !== world.group) {
      // a different battlefield: the previous one gets its baked light back; the battle atmosphere owner has just
      // installed this one's authored day (main.ts prepares it before every Studio plan)
      restoreWorld();
      appliedRoot = world.group;
      appliedKey = AUTHORED_DAY;
    }
    const key = planKey(plan, exactDay);
    if (key !== appliedKey) {
      const direction = plan.keyDirection ? keyScratch.set(plan.keyDirection[0], plan.keyDirection[1], plan.keyDirection[2]) : null;
      options.applySky(plan.sky, direction);
      appliedKey = key;
      restoreWorld();
      if (!exactDay) {
        const sunWorld = options.scene.userData.sunDirWorld as THREE.Vector3 | undefined;
        const keyDir = direction ? direction.clone() : (sunWorld ? sunWorld.clone() : new THREE.Vector3(0, 1, 0));
        gradeWorld(world.group, plan, authored, keyDir.normalize());
      }
      setVehicleReadabilityScale(plan.readability);
      // light-integrating histories restart: a capture right after the change rebuilds them at this light
      (options.scene.userData.volumetricClouds as { resetHistory?: () => void } | null | undefined)?.resetHistory?.();
      options.resetTemporalHistory?.();
    }
    current = plan;
    headlights = light?.headlights !== false;
    syncNight(); // every application re-prepares the lamp pool: a frame never inherits a previous slot assignment
    return plan;
  }

  function setActorRoots(roots: readonly THREE.Object3D[]): void {
    actorRoots = [...roots];
    if (nightRoot) syncNight();
  }

  function update(cameraPosition: THREE.Vector3Like): void {
    if (!nightRoot || !night) return;
    night.update(cameraPosition);
    // update() re-assigns each pooled light's emitter intensity; scale it for this time (deterministic, per frame)
    const scale = (current && LAMP_LIGHT_SCALE[current.time]) ?? 1;
    if (scale !== 1) for (const light of night.lights) light.intensity *= scale;
  }

  function restore(): void {
    restoreWorld();
    if (nightRoot) night?.reset();
    nightRoot = null;
    setVehicleReadabilityScale(1);
    appliedRoot = null;
    appliedKey = AUTHORED_DAY;
    current = null;
  }

  return { apply, setActorRoots, update, restore, get plan() { return current; } };
}
