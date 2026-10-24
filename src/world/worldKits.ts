// src/world/worldKits.ts — the kits a map's world build reads, loaded (2026-10-15, the perf lane): its architecture styles
// (its square's kit, its hamlets' past the edge, its set pieces' — maps/regional/index.ts) and its set-piece builders
// (landmarks/index.ts). Under Node the registries hold every kit already (kitRegistryNode.ts) and this resolves at once;
// in the browser each kit is its own chunk, so a battle entry downloads and compiles only its map's: map.ts
// createMapAsync starts this beside the terrain and awaits it before the props build. The headless builders call it
// too (tools/headlessWorldCollision.mjs), so a lazy Node run (COT_KITS_LAZY=1) builds every map from its own kits.
import { loadRegionalArchitectures } from './maps/regional/index.ts';
import { landmarkKitsOf, loadLandmarkBuilders } from './landmarks/index.ts';
import { borderArchitectureIdOf } from './borderFarmsteads.ts';
import type { LandmarkPlacement } from './landmarks/types.ts';

/** A map config as the kits read it: its id, and its props' `architecture` and `landmarks` (props.ts PropsSettings). */
interface KitReadingConfig { readonly id: string; readonly props?: object }
type KitReadingProps = { readonly architecture?: string; readonly landmarks?: readonly LandmarkPlacement[] };

/** The style ids and set-piece kinds a map's world build reads (loadMapKits loads them). */
export function mapKitsOf(config: KitReadingConfig): { styles: string[]; landmarks: string[] } {
  const props: KitReadingProps = config.props ?? {};
  const landmarks = landmarkKitsOf(props.landmarks);
  const styles = new Set<string>();
  for (const id of [props.architecture, borderArchitectureIdOf(config.id, props.architecture), ...landmarks.styles]) if (id != null) styles.add(id);
  return { styles: [...styles], landmarks: landmarks.kinds };
}

/** Load the kits a map's world build reads (mapKitsOf). */
export function loadMapKits(config: KitReadingConfig): Promise<void> {
  const kits = mapKitsOf(config);
  return Promise.all([loadRegionalArchitectures(kits.styles), loadLandmarkBuilders(kits.landmarks)]).then(() => undefined);
}
