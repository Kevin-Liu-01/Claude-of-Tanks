import type * as THREE from 'three';
import { isMapId, type MapId } from '../world/maps/catalog.ts';
import type { MapSkyConfig } from '../world/maps/horizon.ts';
import { selectBattleWeather, type BattleWeather, type BattleWeatherBiome } from './battleWeatherPolicy.ts';
import { setVehicleReadabilityScale } from '../vehicles/vehicleReadability.ts';

export const BATTLE_WEATHER_BIOMES = Object.freeze({
  verdant: 'temperate', desert: 'arid', winter: 'cold', urban: 'temperate',
  coastal: 'coastal', autumn: 'temperate', steppe: 'arid', railyard: 'temperate',
  frontier: 'temperate', fjord: 'coastal', delta: 'tropical', badlands: 'arid',
  monsoon: 'tropical', alpine: 'cold', caldera: 'temperate', foundry: 'temperate',
  ruinspires: 'arid', blackglass: 'temperate', titan_gorge: 'arid', skybridge: 'arid',
  polders: 'coastal', copper_mesa: 'arid', airfield: 'temperate', oasis: 'arid',
  whiteout: 'cold', orchard: 'temperate', longleaf: 'temperate', mangrove: 'tropical',
  saltwind: 'coastal', reservoir: 'temperate',
} satisfies Record<MapId, BattleWeatherBiome>);

export interface BattleAtmosphereRuntimeOptions {
  /** Root owns sky, CSM/hemi and post fog baseline as one covered transaction. */
  applyPreset(preset: MapSkyConfig): void;
  getAuthoredPreset(): MapSkyConfig;
  getWorldRoot?(): THREE.Object3D | null;
}

export interface BattleAtmosphereRuntime {
  readonly weather: BattleWeather | null;
  prepare(seed: number | undefined, mapId: string): void;
  reset(): void;
  dispose(): void;
}

function weatherPreset(authored: MapSkyConfig, weather: BattleWeather | null): MapSkyConfig {
  const preset = { ...authored };
  if (!weather) return preset;
  if (weather.timeOfDay === 'night') {
    Object.assign(preset, {
      // Moonlit, not pitch black: preserve plate/ground readability away from
      // the small headlamp pool without adding a render pass or scene light.
      skyIntensity: .05, sunElevationDeg: 20, sunIntensity: .42,
      sunColorHex: 0xa6bce8, hemiIntensity: .46, fillIntensity: .20, envIntensity: .85,
      cloudTintHex: 0x33455e, fogTintHex: 0x34455a, fogMix: .7,
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
 * prepare/reset may re-key sky/PMREM and belong behind a loading cover. The
 * selected day/night presentation is fixed per match; no frame-loop update,
 * precipitation resources or additional scene lights are owned here.
 */
export function createBattleAtmosphereRuntime(options: BattleAtmosphereRuntimeOptions): BattleAtmosphereRuntime {
  let currentWeather: BattleWeather | null = null;
  let authored: MapSkyConfig | null = null;
  let preparedMap: MapId | null = null;
  let preparedSeed: number | undefined;
  let preparedRoot: THREE.Object3D | null = null;
  const horizonColors = new Map<THREE.MeshBasicMaterial, THREE.Color>();
  let disposed = false;

  function restoreHorizon(): void {
    for (const [material, color] of horizonColors) material.color.copy(color);
    horizonColors.clear();
  }

  function prepare(seed: number | undefined, mapId: string): void {
    if (disposed) throw new Error('Battle atmosphere is disposed');
    if (!isMapId(mapId)) throw new RangeError('Battle weather requires a catalog map id');
    const next = seed === undefined ? null : selectBattleWeather(seed, BATTLE_WEATHER_BIOMES[mapId]);
    const root = options.getWorldRoot?.() ?? null;
    if (preparedMap === mapId && preparedSeed === next?.seed && preparedRoot === root) {
      return;
    }
    const nextAuthored = { ...options.getAuthoredPreset() };
    options.applyPreset(weatherPreset(nextAuthored, next));
    setVehicleReadabilityScale(next?.timeOfDay === 'night' ? .24 : 1);
    restoreHorizon();
    if (next?.timeOfDay === 'night') dimHorizon(root, horizonColors);
    authored = nextAuthored;
    currentWeather = next;
    preparedMap = mapId;
    preparedSeed = next?.seed;
    preparedRoot = root;
  }
  function reset(): void {
    setVehicleReadabilityScale(1);
    restoreHorizon();
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
    reset();
  }
  return { get weather() { return currentWeather; }, prepare, reset, dispose };
}
