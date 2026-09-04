interface GarageArchitectureQualityReceipt {
  readonly unsupportedParts?: number;
  readonly maxGroundContactErrorM?: number;
  readonly approachConnected?: boolean;
  readonly approachGroundErrorM?: number;
  readonly approachTerrainGraded?: boolean;
  readonly approachMaxGrade?: number;
  readonly placementOverlaps?: number;
  readonly structuralConnections?: number;
  readonly servicePurposeTags?: readonly string[];
  readonly operationalMachines?: number;
  readonly heavyLiftSystems?: number;
  readonly factoryProcessZones?: number;
  readonly elevatedAccessSystems?: number;
  readonly secureStorageSystems?: number;
  readonly environmentSpecificAssemblies?: number;
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

class QualityAwardLedger {
  readonly failures: string[] = [];

  award(condition: boolean, points: number, failure: string): number {
    if (condition) return points;
    this.failures.push(failure);
    return 0;
  }
}

function scoreStructuralIntegrity(
  input: GarageQualityInput,
  ledger: QualityAwardLedger,
): number {
  const { architecture, isVerdant } = input;
  return ledger.award(number(architecture.unsupportedParts) === 0,
    7, 'unsupported structure part')
    + ledger.award(number(architecture.maxGroundContactErrorM) <= 0.065
      && (isVerdant || (architecture.approachConnected === true
        && architecture.approachTerrainGraded === true
        && number(architecture.approachGroundErrorM) <= 0.01
        && number(architecture.approachMaxGrade) <= 0.10)),
    4, 'terrain contact or approach grade is unsafe')
    + ledger.award(number(architecture.placementOverlaps) === 0,
      4, 'structure/facility overlap')
    + ledger.award(number(architecture.structuralConnections) >= 60,
      4, 'insufficient certified structural connections')
    + ledger.award(
      number(architecture.collisionAuditedStructures) === number(architecture.structures),
      3, 'not every structure has a geometry-derived collision envelope',
    )
    + ledger.award(number(architecture.openCollisionMaxFill) <= 0.82,
      3, 'an open structure hitbox still fills too much intentional space');
}

function scoreFunctionalStory(
  input: GarageQualityInput,
  ledger: QualityAwardLedger,
): number {
  const { architecture, workshop } = input;
  return ledger.award(rows(architecture.servicePurposeTags).length >= 8
      && number(architecture.factoryProcessZones) >= 1,
  5, 'maintenance purpose is not legible')
    + ledger.award(number(architecture.operationalMachines) >= 3
      && number(architecture.secureStorageSystems) >= 1,
    3, 'fewer than three visibly assembled service machines')
    + ledger.award(number(architecture.heavyLiftSystems) >= 2
      && number(architecture.elevatedAccessSystems) >= 2,
    5, 'fewer than two working heavy-lift systems')
    + ledger.award(number(architecture.facilityStations) >= 2
      && number(architecture.environmentSpecificAssemblies) >= 2,
    4, 'fewer than two complete service bays')
    + ledger.award(number(workshop.exhibitCount) === 4,
      3, 'four real fleet exhibits are not present');
}

function scoreComposition(
  input: GarageQualityInput,
  ledger: QualityAwardLedger,
): number {
  const { architecture, workshop, isVerdant } = input;
  return ledger.award(number(architecture.openingSightlineIntrusions) === 0,
    6, 'opening hero sightline is obstructed')
    + ledger.award(number(workshop.workshopOrbitCoverageDegrees) === 360,
      6, 'service story does not survive a full orbit')
    + ledger.award(rows(architecture.distinctiveElements).length >= (isVerdant ? 4 : 10),
      4, 'insufficient readable scene layers')
    + ledger.award(number(architecture.structures) >= (isVerdant ? 1 : 8)
      && number(architecture.structurePerimeterSectors) >= 4,
    4, 'perimeter is not fully composed across four or more sectors');
}

function scoreEnvironmentIdentity(
  input: GarageQualityInput,
  ledger: QualityAwardLedger,
): number {
  const { architecture, isVerdant } = input;
  return ledger.award(text(architecture.sourceBeat).length >= 8
      && text(architecture.serviceFrame).length >= 16
      && text(architecture.terrainProfile).length >= 20,
  5, 'location story metadata is incomplete')
    + ledger.award(text(architecture.signature).length >= 12,
      3, 'environment signature is missing')
    + ledger.award(rows(architecture.treeSpecies).length >= (isVerdant ? 0 : 2),
      3, 'biome planting is not distinct')
    + ledger.award(number(architecture.landmarkHeightM) >= 7,
      4, 'map landmark is not visually substantial');
}

function scoreMaterialDetail(
  input: GarageQualityInput,
  ledger: QualityAwardLedger,
): number {
  const { architecture, workshop, isVerdant } = input;
  return ledger.award(number(architecture.facilityMaterialClasses) >= 4,
    2, 'facility material language is too flat')
    + ledger.award(isVerdant || number(architecture.connectedExteriorParts) >= 120,
      2, 'map buildings lack supported facade detail')
    + ledger.award(rows(architecture.textureSets).length >= (isVerdant ? 3 : 6),
      2, 'insufficient PBR surface variety')
    + ledger.award(text(workshop.modelMode) === 'actual-fleet',
      2, 'proxy tank or proxy component path is active')
    + ledger.award(isVerdant || (number(architecture.treeTrunkMinRadialSegments) >= 10
      && architecture.treeTrunksRooted === true),
    2, 'near-tree trunks are faceted or lack grounded root flares');
}

function scorePerformance(
  input: GarageQualityInput,
  ledger: QualityAwardLedger,
): number {
  const { architecture, isVerdant } = input;
  return ledger.award(isVerdant || number(architecture.drawCalls) <= 25,
    3, 'environment exceeds 25 draw calls')
    + ledger.award(isVerdant || number(architecture.triangles) <= 50_000,
      2, 'environment exceeds 50k triangles')
    + ledger.award(input.transitionMaxGapMs <= 80,
      3, 'normal-speed switch stalls longer than 80 ms')
    + ledger.award(isVerdant || number(architecture.lastBuildMs) <= 100,
      2, 'scene-pack construction exceeds 100 ms');
}

/**
 * Score the measurable half of the Garage approval rubric.
 *
 * A score is deliberately all-or-nothing within each criterion: a high-detail
 * scene cannot average away one floating crane, an obstructed hero, a proxy
 * tank, or a transition stall. The browser gate pairs this receipt with four
 * rendered viewpoints per location for the human visual adjudication.
 */
export function scoreGarageQuality(input: GarageQualityInput): GarageQualityScore {
  const ledger = new QualityAwardLedger();
  const structuralIntegrity = scoreStructuralIntegrity(input, ledger);
  const functionalStory = scoreFunctionalStory(input, ledger);
  const composition = scoreComposition(input, ledger);
  const environmentIdentity = scoreEnvironmentIdentity(input, ledger);
  const materialDetail = scoreMaterialDetail(input, ledger);
  const performance = scorePerformance(input, ledger);

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
    failures: Object.freeze(ledger.failures),
  });
}
