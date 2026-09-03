interface GarageArchitectureQualityReceipt {
  readonly unsupportedParts?: number;
  readonly maxGroundContactErrorM?: number;
  readonly placementOverlaps?: number;
  readonly structuralConnections?: number;
  readonly servicePurposeTags?: readonly string[];
  readonly operationalMachines?: number;
  readonly heavyLiftSystems?: number;
  readonly facilityStations?: number;
  readonly openingSightlineIntrusions?: number;
  readonly distinctiveElements?: readonly string[];
  readonly structures?: number;
  readonly sourceBeat?: string;
  readonly serviceFrame?: string;
  readonly terrainProfile?: string;
  readonly signature?: string;
  readonly treeSpecies?: readonly string[];
  readonly landmarkHeightM?: number;
  readonly facilityMaterialClasses?: number;
  readonly connectedExteriorParts?: number;
  readonly textureSets?: readonly string[];
  readonly drawCalls?: number;
  readonly triangles?: number;
  readonly lastBuildMs?: number;
  readonly collisionAuditedStructures?: number;
  readonly openCollisionMaxFill?: number;
  readonly structurePerimeterSectors?: number;
  readonly treeTrunkMinRadialSegments?: number;
  readonly treeTrunksRooted?: boolean;
}

interface GarageWorkshopQualityReceipt {
  readonly exhibitCount?: number;
  readonly workshopOrbitCoverageDegrees?: number;
  readonly modelMode?: string;
}

export interface GarageQualityInput {
  readonly id: string;
  readonly isVerdant: boolean;
  readonly architecture: Readonly<GarageArchitectureQualityReceipt>;
  readonly workshop: Readonly<GarageWorkshopQualityReceipt>;
  readonly transitionMaxGapMs: number;
}

export interface GarageQualityScore {
  readonly id: string;
  readonly structuralIntegrity: number;
  readonly functionalStory: number;
  readonly composition: number;
  readonly environmentIdentity: number;
  readonly materialDetail: number;
  readonly performance: number;
  readonly total: number;
  readonly failures: readonly string[];
}

const number = (value: number | undefined): number => Number(value || 0);
const rows = <T>(value: readonly T[] | undefined): readonly T[] => value || [];
const text = (value: string | undefined): string => value || '';

/**
 * Score the measurable half of the Garage approval rubric.
 *
 * A score is deliberately all-or-nothing within each criterion: a high-detail
 * scene cannot average away one floating crane, an obstructed hero, a proxy
 * tank, or a transition stall. The browser gate pairs this receipt with four
 * rendered viewpoints per location for the human visual adjudication.
 */
export function scoreGarageQuality(input: GarageQualityInput): GarageQualityScore {
  const { architecture, workshop, isVerdant } = input;
  const failures: string[] = [];
  const award = (condition: boolean, points: number, failure: string): number => {
    if (condition) return points;
    failures.push(failure);
    return 0;
  };

  const structuralIntegrity =
    award(number(architecture.unsupportedParts) === 0, 7, 'unsupported structure part')
    + award(number(architecture.maxGroundContactErrorM) <= 0.065,
      4, 'terrain contact exceeds 6.5 cm')
    + award(number(architecture.placementOverlaps) === 0, 4, 'structure/facility overlap')
    + award(number(architecture.structuralConnections) >= 60,
      4, 'insufficient certified structural connections')
    + award(number(architecture.collisionAuditedStructures) === number(architecture.structures),
      3, 'not every structure has a geometry-derived collision envelope')
    + award(number(architecture.openCollisionMaxFill) <= 0.82,
      3, 'an open structure hitbox still fills too much intentional space');

  const functionalStory =
    award(rows(architecture.servicePurposeTags).length >= 5,
      5, 'maintenance purpose is not legible')
    + award(number(architecture.operationalMachines) >= 3,
      3, 'fewer than three visibly assembled service machines')
    + award(number(architecture.heavyLiftSystems) >= 2,
      5, 'fewer than two working heavy-lift systems')
    + award(number(architecture.facilityStations) >= 2,
      4, 'fewer than two complete service bays')
    + award(number(workshop.exhibitCount) === 4,
      3, 'four real fleet exhibits are not present');

  const composition =
    award(number(architecture.openingSightlineIntrusions) === 0,
      6, 'opening hero sightline is obstructed')
    + award(number(workshop.workshopOrbitCoverageDegrees) === 360,
      6, 'service story does not survive a full orbit')
    + award(rows(architecture.distinctiveElements).length >= (isVerdant ? 4 : 10),
      4, 'insufficient readable scene layers')
    + award(number(architecture.structures) >= (isVerdant ? 1 : 8)
      && number(architecture.structurePerimeterSectors) >= 4,
    4, 'perimeter is not fully composed across four or more sectors');

  const environmentIdentity =
    award(text(architecture.sourceBeat).length >= 8
      && text(architecture.serviceFrame).length >= 16
      && text(architecture.terrainProfile).length >= 20,
    5, 'location story metadata is incomplete')
    + award(text(architecture.signature).length >= 12,
      3, 'environment signature is missing')
    + award(rows(architecture.treeSpecies).length >= (isVerdant ? 0 : 2),
      3, 'biome planting is not distinct')
    + award(number(architecture.landmarkHeightM) >= 7,
      4, 'map landmark is not visually substantial');

  const materialDetail =
    award(number(architecture.facilityMaterialClasses) >= 4,
      2, 'facility material language is too flat')
    + award(isVerdant || number(architecture.connectedExteriorParts) >= 120,
      2, 'map buildings lack supported facade detail')
    + award(rows(architecture.textureSets).length >= (isVerdant ? 3 : 6),
      2, 'insufficient PBR surface variety')
    + award(text(workshop.modelMode) === 'actual-fleet',
      2, 'proxy tank or proxy component path is active')
    + award(isVerdant || (number(architecture.treeTrunkMinRadialSegments) >= 10
      && architecture.treeTrunksRooted === true),
    2, 'near-tree trunks are faceted or lack grounded root flares');

  const performance =
    award(isVerdant || number(architecture.drawCalls) <= 25,
      3, 'environment exceeds 25 draw calls')
    + award(isVerdant || number(architecture.triangles) <= 50_000,
      2, 'environment exceeds 50k triangles')
    + award(input.transitionMaxGapMs <= 80,
      3, 'normal-speed switch stalls longer than 80 ms')
    + award(isVerdant || number(architecture.lastBuildMs) <= 100,
      2, 'scene-pack construction exceeds 100 ms');

  const total = structuralIntegrity + functionalStory + composition
    + environmentIdentity + materialDetail + performance;
  return Object.freeze({
    id: input.id,
    structuralIntegrity,
    functionalStory,
    composition,
    environmentIdentity,
    materialDetail,
    performance,
    total,
    failures: Object.freeze(failures),
  });
}
