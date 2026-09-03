import type { RuntimeValue } from '../../runtimeTypes.ts';
import type { PropsMapConfig } from '../props.ts';
import type { TerrainMapConfig } from '../terrain.ts';
import type { VegetationMapConfig } from '../vegetation.ts';

/**
 * Shared authoring contract for a complete battlefield configuration.
 *
 * Individual subsystems intentionally own their detailed settings, while
 * map modules may carry additional presentation and gameplay sections. The
 * intersection contextually types the shared terrain, vegetation, and props
 * payloads without widening the map registry's inferred per-map fields.
 */
export type MapCompositionConfig = TerrainMapConfig & VegetationMapConfig &
  PropsMapConfig & Record<string, RuntimeValue>;
