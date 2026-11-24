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
  readonly facadeDetailCertified?: boolean;
  readonly structurePerimeterSectors?: number;
  readonly treeTrunkMinRadialSegments?: number;
  readonly treeTrunksRooted?: boolean;
}

interface GarageWorkshopQualityReceipt {
  readonly exhibitCount?: number;
  readonly workshopOrbitCoverageDegrees?: number;
  readonly modelMode?: string;
}

interface GarageQualityInput {
  readonly id: string;
  readonly isVerdant: boolean;
  readonly architecture: Readonly<GarageArchitectureQualityReceipt>;
  readonly workshop: Readonly<GarageWorkshopQualityReceipt>;
  readonly transitionMaxGapMs: number;
  /**
   * (garage-env-276) The hero's median display luma (0-255) at the default pose in photo mode, the inner 60 % of the
   * hull's screen box (tools/garage-hero-luma.mjs). Absent: not measured (a headless receipt), and the floor is not read.
   */
  readonly heroLuma?: number;
}

interface GarageQualityScore {
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
    + ledger.award(number(workshop.exhibitCount) === 5,
      3, 'five real fleet exhibits are not present');
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
    4, 'perimeter is not fully composed across four or more sectors')
    // (garage-env-276) a gate, not points (the rubric's 100 stand): a hero under the readable floor fails the pack
    + ledger.award(input.heroLuma === undefined || input.heroLuma >= GARAGE_HERO_LUMA_FLOOR,
      0, `hero is under the readable floor (luma ${input.heroLuma} < ${GARAGE_HERO_LUMA_FLOOR})`);
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
    // (garage-env-276) a pack reports its facade criterion (every kit-rebuilt building's assembly connected);
    // a report without it is judged on the legacy marker count
    + ledger.award(isVerdant || (typeof architecture.facadeDetailCertified === 'boolean'
      ? architecture.facadeDetailCertified : number(architecture.connectedExteriorParts) >= 120),
      2, 'map buildings lack supported facade detail')
    + ledger.award(rows(architecture.textureSets).length >= (isVerdant ? 3 : 6),
      2, 'insufficient PBR surface variety')
    + ledger.award(text(workshop.modelMode) === 'actual-fleet',
      2, 'proxy tank or proxy component path is active')
    + ledger.award(isVerdant || (number(architecture.treeTrunkMinRadialSegments) >= 10
      && architecture.treeTrunksRooted === true),
    2, 'near-tree trunks are faceted or lack grounded root flares');
}

/**
 * One outdoor Garage pack's geometry budget, the one owner every gate reads (the rubric, qa:garage, the architecture and
 * near-facility receipts). PROVISIONAL (garage-env-276, Main 2026-11-23): the packs build their buildings the battlefield's
 * way (its regional kits and set pieces), measured at 97-165k triangles and 30-35 draws in the browser with p95 frame time
 * equal to main's at the refresh floor on desktop (1920x1080) and the mobile tier (844x390, 4x CPU). Fixed from the final
 * base's measurement once the switch work (D) lands. (Was 25 draws, 64k since round 7, 72k since deploy 226.)
 */
export const GARAGE_PACK_BUDGET = Object.freeze({ triangles: 180_000, drawCalls: 36 });

/**
 * The hero's readable floor (garage-env-276, Main 2026-11-24): its median display luma at the default pose in photo
 * mode (tools/garage-hero-luma.mjs) never under this, so later lighting work cannot sink a hero into the dark
 * unnoticed. The lowest current pack less a margin: PROVISIONAL at 90 (the lowest pack measured 104 on the class 1
 * stills' hero crop), set from tools/garage-hero-luma.mjs's own measurement of every pack on the final build.
 */
export const GARAGE_HERO_LUMA_FLOOR = 90;

function scorePerformance(
  input: GarageQualityInput,
  ledger: QualityAwardLedger,
): number {
  const { architecture, isVerdant } = input;
  return ledger.award(isVerdant || number(architecture.drawCalls) <= GARAGE_PACK_BUDGET.drawCalls,
    3, `environment exceeds ${GARAGE_PACK_BUDGET.drawCalls} draw calls`)
    // 64k since garage round 7 (GA.04, 2026-10-14): the regional buildings at the props standard (real members, openings
    // cut through) need the room; triangles at this scale cost the GPU nothing measurable, and the switch gates below
    // (80 ms gap, 100 ms build) still hold the CPU side. 72k since 2026-10-16 (deploy 226, coordinator ruling Option A):
    // the garages' place-truth facilities and r8 detail with the props lanes' container (LOOKS) and tower (Lane B)
    // rebuilds put railyard_overhaul at 74,795 (70,907 with its yard rails trimmed) and alpine_service_cavern at 70,509;
    // the Garage frame time is measured in the final pass
    + ledger.award(isVerdant || number(architecture.triangles) <= GARAGE_PACK_BUDGET.triangles,
      2, `environment exceeds ${GARAGE_PACK_BUDGET.triangles / 1000}k triangles`)
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
