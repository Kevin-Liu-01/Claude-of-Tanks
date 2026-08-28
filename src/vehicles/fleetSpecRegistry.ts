import type {
  FleetDimensions,
  FleetTankSpec,
  ModelSourceRegistry,
  TankSpecRegistry,
} from './specContracts.ts';

export interface FleetRegistries {
  readonly tankSpecs: TankSpecRegistry;
  readonly modelSources: ModelSourceRegistry;
  readonly allTankIds: string[];
}

export interface VariantIdentity {
  readonly name: string;
  readonly nation: string;
  readonly era?: string;
  readonly role?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function bindFleetRegistries(
  tankSpecs: unknown,
  modelSources: unknown,
  allTankIds: unknown,
): FleetRegistries {
  if (!isRecord(tankSpecs) || !isRecord(modelSources) || !Array.isArray(allTankIds)) {
    throw new TypeError('Fleet registries require spec/source records and an id array');
  }
  return {
    tankSpecs: tankSpecs as TankSpecRegistry,
    modelSources: modelSources as ModelSourceRegistry,
    allTankIds: allTankIds as string[],
  };
}

export function cloneFleetVariant(
  tankSpecs: TankSpecRegistry,
  id: string,
  donorId: string,
  identity: VariantIdentity,
): FleetTankSpec {
  const donor = tankSpecs[donorId];
  if (!donor) throw new Error(`Fleet donor missing: ${donorId}`);
  const spec = structuredClone(donor);
  spec.id = id;
  spec.name = identity.name;
  spec.nation = identity.nation;
  spec.era = identity.era || 'modern';
  spec.role = identity.role || 'mbt';
  spec.variantOf = donorId;
  delete spec.community;
  return spec;
}

export function stripSilhouetteDimensions(dimensions: FleetDimensions): void {
  for (const key of Object.keys(dimensions)) {
    if (key.startsWith('silhouette')) delete dimensions[key];
  }
}

export function scaleNonExternalArmor(spec: FleetTankSpec, factor: number): void {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(`Armor scale must be positive and finite: ${factor}`);
  }
  for (const plate of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
    if (plate.kind === 'external') continue;
    plate.keMm = Math.round(plate.keMm * factor);
    plate.ceMm = Math.round(plate.ceMm * factor);
  }
}

export function registerFleetSpecs(
  registries: FleetRegistries,
  ids: readonly string[],
  specs: Readonly<Record<string, FleetTankSpec>>,
): void {
  for (const id of ids) {
    const spec = specs[id];
    if (!spec) throw new Error(`Fleet spec missing for registered id: ${id}`);
    registries.tankSpecs[id] ||= spec;
    registries.modelSources[id] ||= { source: 'procedural' };
    if (!registries.allTankIds.includes(id)) registries.allTankIds.push(id);
  }
}
