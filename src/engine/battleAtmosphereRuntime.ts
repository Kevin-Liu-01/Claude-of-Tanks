import type * as THREE from 'three';
import { isMapId, type MapId } from '../world/maps/catalog.ts';
import type { MapSkyConfig } from '../world/maps/horizon.ts';
import { selectBattleWeather, type BattleWeather, type BattleWeatherBiome } from './battleWeatherPolicy.ts';
import { createBattlePrecipitation, type BattlePrecipitation } from './battlePrecipitation.ts';
import { setVehicleReadabilityScale } from '../vehicles/vehicleReadability.ts';

export const BATTLE_WEATHER_BIOMES = Object.freeze({
  verdant: 'temperate', desert: 'arid', winter: 'cold', urban: 'temperate',
  coastal: 'coastal', autumn: 'temperate', steppe: 'arid', railyard: 'temperate',
  frontier: 'temperate', fjord: 'coastal', delta: 'tropical', badlands: 'arid',
  monsoon: 'tropical', alpine: 'cold', caldera: 'temperate', foundry: 'temperate',
  ruinspires: 'arid', blackglass: 'temperate', titan_gorge: 'arid', skybridge: 'arid',
} satisfies Record<MapId, BattleWeatherBiome>);

export interface BattleAtmosphereRuntimeOptions {
  scene: Pick<THREE.Scene, 'add'>;
  /** Return a stable scratch/live vector, never allocate a camera copy per frame. */
  getCameraPosition(): Readonly<{ x: number; y: number; z: number }>;
  /** Root owns sky, CSM/hemi and post fog baseline as one covered transaction. */
  applyPreset(preset: MapSkyConfig): void;
  getAuthoredPreset(): MapSkyConfig;
  getWorldRoot?(): THREE.Object3D | null;
}

export interface BattleAtmosphereRuntime {
  readonly weather: BattleWeather | null;
  prepare(seed: number | undefined, mapId: string, budget: number): void;
  update(simSeconds: number, budget: number): void;
  reset(): void;
  dispose(): void;
}

function requireBudget(budget: number): void {
  if (!Number.isInteger(budget) || budget < 0) throw new RangeError('Weather particle budget must be a nonnegative integer');
}

function weatherPreset(authored: MapSkyConfig, weather: BattleWeather | null): MapSkyConfig {
  const preset = { ...authored };
  if (!weather) return preset;
  if (weather.cloudOpacityMultiplier !== 1) {
    preset.cloudOpacity = (authored.cloudOpacity ?? 1) * weather.cloudOpacityMultiplier;
    preset.cloudOpacity2 = (authored.cloudOpacity2 ?? .6) * weather.cloudOpacityMultiplier;
  }
  if (weather.fogDensityMultiplier !== 1) {
    preset.fogDensity = (authored.fogDensity ?? .00074) * weather.fogDensityMultiplier;
  }
  if (weather.timeOfDay === 'night') {
    Object.assign(preset, {
      skyIntensity: .035, sunElevationDeg: 20, sunIntensity: .32,
      sunColorHex: 0xa6bce8, hemiIntensity: .28, fillIntensity: .12, envIntensity: .75,
      cloudTintHex: 0x33455e, fogTintHex: 0x34455a, fogMix: .7,
      cloudOpacity: Math.min(.8, preset.cloudOpacity ?? 1),
      cloudOpacity2: Math.min(.8, preset.cloudOpacity2 ?? .6),
    });
  }
  return preset;
}

function trackHorizonMaterial(
  material: THREE.Material, selected: boolean,
  eligible: Set<THREE.MeshBasicMaterial>, blocked: Set<THREE.MeshBasicMaterial>,
): void {
  const basic = material as THREE.MeshBasicMaterial;
  if (basic.isMeshBasicMaterial) (selected ? eligible : blocked).add(basic);
}

/** Named unlit horizons only. A material shared with any other world mesh
 * cannot be dimmed without affecting that mesh, so leave that alias alone.
 */
function dimHorizon(root: THREE.Object3D | null, saved: Map<THREE.MeshBasicMaterial, THREE.Color>): void {
  if (!root) return;
  const eligible = new Set<THREE.MeshBasicMaterial>(), blocked = new Set<THREE.MeshBasicMaterial>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const selected = mesh.name === 'horizon-ring' || mesh.name === 'horizon-treeline';
    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) trackHorizonMaterial(material, selected, eligible, blocked);
    } else trackHorizonMaterial(mesh.material, selected, eligible, blocked);
  });
  for (const material of eligible) {
    if (blocked.has(material)) continue;
    saved.set(material, material.color.clone());
    material.color.multiplyScalar(.12);
  }
}

/** Match atmosphere owner, intentionally inert until explicit battle intent.
 * prepare/reset may re-key sky/PMREM and belong behind a loading cover. update
 * never rekeys lighting/fog or constructs resources. This is random atmosphere
 * per match, not a continuously rebaked day cycle. Precipitation is decorative:
 * hard depth testing is not roof occupancy or authoritative visibility.
 */
export function createBattleAtmosphereRuntime(options: BattleAtmosphereRuntimeOptions): BattleAtmosphereRuntime {
  let currentWeather: BattleWeather | null = null;
  let authored: MapSkyConfig | null = null;
  let preparedMap: MapId | null = null;
  let preparedSeed: number | undefined;
  let preparedRoot: THREE.Object3D | null = null;
  const horizonColors = new Map<THREE.MeshBasicMaterial, THREE.Color>();
  let precipitation: BattlePrecipitation | null = null;
  let disposed = false;

  function restoreHorizon(): void {
    for (const [material, color] of horizonColors) material.color.copy(color);
    horizonColors.clear();
  }

  function prepareParticles(weather: BattleWeather | null, budget: number): void {
    if (!weather || (weather.condition !== 'rain' && weather.condition !== 'snow')) {
      precipitation?.hide();
      precipitation?.mesh.removeFromParent();
      return;
    }
    // Allocate during explicit prepare even at budget0. A later admitted
    // count can reuse these exact buffers; the frame loop never constructs.
    precipitation ??= createBattlePrecipitation();
    precipitation.reset(weather, budget);
    options.scene.add(precipitation.mesh);
  }
  function prepare(seed: number | undefined, mapId: string, budget: number): void {
    if (disposed) throw new Error('Battle atmosphere is disposed');
    requireBudget(budget);
    if (!isMapId(mapId)) throw new RangeError('Battle weather requires a catalog map id');
    const next = seed === undefined ? null : selectBattleWeather(seed, BATTLE_WEATHER_BIOMES[mapId]);
    const root = options.getWorldRoot?.() ?? null;
    if (preparedMap === mapId && preparedSeed === next?.seed && preparedRoot === root) {
      precipitation?.setBudget(budget);
      return;
    }
    const nextAuthored = { ...options.getAuthoredPreset() };
    options.applyPreset(weatherPreset(nextAuthored, next));
    setVehicleReadabilityScale(next?.timeOfDay === 'night' ? .12 : 1);
    restoreHorizon();
    if (next?.timeOfDay === 'night') dimHorizon(root, horizonColors);
    prepareParticles(next, budget);
    authored = nextAuthored;
    currentWeather = next;
    preparedMap = mapId;
    preparedSeed = next?.seed;
    preparedRoot = root;
  }
  function update(simSeconds: number, budget: number): void {
    if (disposed || !preparedMap || !precipitation) return;
    precipitation.setBudget(budget);
    const camera = options.getCameraPosition();
    precipitation.update(simSeconds, camera.x, camera.y, camera.z);
  }
  function reset(): void {
    setVehicleReadabilityScale(1);
    restoreHorizon();
    precipitation?.hide();
    precipitation?.mesh.removeFromParent();
    const restore = authored;
    authored = null;
    currentWeather = null;
    preparedMap = null;
    preparedSeed = undefined;
    preparedRoot = null;
    if (restore) options.applyPreset(restore);
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    try { reset(); }
    finally { precipitation?.dispose(); precipitation = null; }
  }
  return { get weather() { return currentWeather; }, prepare, update, reset, dispose };
}
