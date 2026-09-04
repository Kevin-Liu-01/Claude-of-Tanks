import type * as THREE from 'three';
import type { GarageDressingAccess } from './garageDressingAccess.ts';
import type {
  GarageEnvironmentPresentationRuntime,
  GarageEnvironmentState,
} from './garageEnvironmentPresentationRuntime.ts';
import type { GarageDressingOptimizationReceipt } from './garageDressingOptimization.ts';
import type { GaragePedestalRuntime } from './garagePedestalRuntime.ts';
import type {
  GaragePhasePresentationDiagnostics,
  GaragePhasePresentationRuntime,
} from './garagePhasePresentationRuntime.ts';
import type { GarageVariant } from './garageVariants.ts';
import type { GarageArchitectureStats } from '../ui/garageArchitecture.ts';
import type { GarageStageRuntime } from '../ui/garageStage.ts';
import type { GarageRuntime } from '../ui/garage.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

export type GarageWorkshopVariant = Pick<
  GarageVariant,
  'id' | 'mapId' | 'name' | 'architecture'
>;

export interface GarageWorkshopBuildTiming {
  readonly chunk: string;
  readonly ms: number;
  readonly at: number;
}

export interface GarageWorkshopTransferTiming {
  readonly specId?: RuntimeValue;
  readonly finish?: RuntimeValue;
  readonly textureCount?: RuntimeValue;
  readonly materialCount?: RuntimeValue;
  readonly payload?: {
    readonly attributeBytes?: RuntimeValue;
    readonly omittedAttributeBytes?: RuntimeValue;
    readonly omittedAttributeCount?: RuntimeValue;
  };
  readonly [key: string]: RuntimeValue;
}

export interface GarageWorkshopWallLayout {
  readonly bays: number;
  readonly overlaps: readonly string[];
}

export interface GarageWorkshopStats {
  readonly selected: string;
  readonly built: boolean;
  readonly triangles: number;
  readonly activeWorkshopTriangles: number;
  readonly buildTimings: readonly GarageWorkshopBuildTiming[];
  readonly workshopTransferTimings: readonly GarageWorkshopTransferTiming[];
  readonly workshopPresentationFinishes: readonly string[];
  readonly workshopPaletteCount: number;
  readonly workshopExhibitTextureCount: number;
  readonly workshopPaletteMaterialCount: number;
  readonly workshopTransferredAttributeBytes: number;
  readonly workshopOmittedAttributeBytes: number;
  readonly workshopOmittedAttributeCount: number;
  readonly optimization: Readonly<GarageDressingOptimizationReceipt> | null;
  readonly optimizedTriangles: number;
  readonly optimizedTriangleParity: boolean;
  readonly mapId: string;
  readonly architecture: GarageArchitectureStats;
  readonly sceneMode: string;
  readonly roofMode: string;
  readonly environment: Readonly<GarageEnvironmentState> & {
    readonly worldMounted: boolean;
    readonly retainedWorldMapId: string | null;
  };
  readonly wallLayout: GarageWorkshopWallLayout;
  readonly mapImageCount: number;
  readonly battleScreenMode: string;
  readonly battleScreenWallBay: string;
  readonly battleScreenDisplayCount: number;
  readonly battleScreenImageCount: number;
  readonly battleScreenResidentImageLimit: number;
  readonly battleScreenResidentImageCount: number;
  readonly battleScreenCurrentImage: string;
  readonly battleScreenSecondaryImage: string;
  readonly battleScreenSecondaryFacing: string;
  readonly battleScreenVisible: boolean;
  readonly modelMode: string;
  readonly exhibitCount: number;
  readonly sharedMaintenanceBayCount: number;
  readonly sharedMaintenanceBayIds: readonly string[];
  readonly sharedMaintenanceBayQuadrants: readonly string[];
  readonly workshopOrbitCoverageDegrees: number;
  readonly verdantHeroHoistOffsetM: number;
  readonly verdantHoistStationCount: number;
  readonly verdantHoistChainRuns: number;
  readonly verdantSuspendedLoadCount: number;
  readonly verdantConnectedLiftPointCount: number;
  readonly verdantRoutedUtilityCircuits: number;
  readonly verdantJunctionBoxes: number;
  readonly heroTrackContactErrorM: number | null;
  readonly verdantOriginalVisible: boolean;
  readonly verdantOriginalLayoutReceipt: string;
  readonly verdantOriginalTriangleCount: number;
  readonly verdantOriginalExhibitCount: number;
  readonly verdantOriginalExhibitIds: readonly string[];
  readonly verdantOriginalSetPieces: readonly string[];
  readonly forwardCorrectionRad: number;
  readonly families: readonly string[];
  readonly sourceVehicleIds: readonly string[];
  readonly renderer: { readonly calls: number; readonly triangles: number };
}

export interface GarageWorkshopDiagnostics {
  readonly variants: readonly GarageWorkshopVariant[];
  ensureBuilt(): Promise<void>;
  set(variantId: string): boolean;
  stats(): GarageWorkshopStats;
}

export interface GarageWorkshopDiagnosticsOptions {
  readonly variants: readonly GarageVariant[];
  readonly garage: Pick<
    GarageRuntime,
    'getSelectedGarageVariant' | 'setSelectedGarageVariant'
  >;
  readonly dressing: Pick<
    GarageDressingAccess,
    'group' | 'ensureBuilt' | 'isBuilt'
  >;
  readonly stage: Pick<GarageStageRuntime, 'group' | 'stats'>;
  readonly pedestal: Pick<GaragePedestalRuntime, 'current'>;
  readonly environment: Pick<GarageEnvironmentPresentationRuntime, 'diagnostics'>;
  readonly phase: Pick<GaragePhasePresentationRuntime, 'diagnostics'>;
  readonly renderer: Pick<THREE.WebGLRenderer, 'info'>;
  readonly garagePosition: Readonly<Pick<THREE.Vector3, 'y'>>;
  readonly podiumTopYM: number;
  readonly getRetainedWorldMapId: () => string | null;
  readonly invalidatePresentation: () => void;
}

function copiedArray<T>(value: readonly T[] | null | undefined): readonly T[] {
  return value ? [...value] : [];
}

function numberValue(value: number | null | undefined): number {
  return value || 0;
}

function stringValue(value: string | null | undefined): string {
  return value || '';
}

function trueValue(value: boolean | null | undefined): boolean {
  return value === true;
}

function optimizationValue(
  value: GarageDressingOptimizationReceipt | null | undefined,
): Readonly<GarageDressingOptimizationReceipt> | null {
  return value ? Object.freeze({ ...value }) : null;
}

function heroTrackContactError(
  visual: GaragePedestalRuntime['current'],
  garagePositionY: number,
  podiumTopYM: number,
): number | null {
  const trackFloorYM = visual?.presentationTrackFloorYM;
  if (!Number.isFinite(trackFloorYM)) return null;
  return Math.abs(
    numberValue(visual?.root.position.y)
    + numberValue(trackFloorYM)
    - (garagePositionY + podiumTopYM),
  );
}

function isWorkshopTransferTiming(value: RuntimeValue): value is GarageWorkshopTransferTiming {
  return !!value && typeof value === 'object';
}

function finiteNumber(value: RuntimeValue): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

/**
 * Own the stable engineering surface for workshop probes. The Garage remains
 * responsible for presentation; this module only snapshots its public state
 * and never mutates scene objects except through the explicit Garage ports.
 */
export function createGarageWorkshopDiagnostics({
  variants,
  garage,
  dressing,
  stage,
  pedestal,
  environment,
  phase,
  renderer,
  garagePosition,
  podiumTopYM,
  getRetainedWorldMapId,
  invalidatePresentation,
}: GarageWorkshopDiagnosticsOptions): GarageWorkshopDiagnostics {
  const variantViews = Object.freeze(variants.map(({ id, mapId, name, architecture }) => (
    Object.freeze({ id, mapId, name, architecture })
  )));

  return {
    variants: variantViews,
    async ensureBuilt() {
      await dressing.ensureBuilt();
      invalidatePresentation();
    },
    set(variantId: string) {
      return garage.setSelectedGarageVariant(variantId);
    },
    stats() {
      const data = dressing.group.userData;
      const stageData = stage.group.userData;
      const visual = pedestal.current;
      const phaseDiagnostics: GaragePhasePresentationDiagnostics = phase.diagnostics();
      const transferTimings = copiedArray<RuntimeValue>(data.workshopTransferTimings);
      const transferReceipts = transferTimings.filter(isWorkshopTransferTiming);
      const finishSet = transferReceipts.reduce((result, receipt) => {
        const finish = String(receipt.finish || '');
        if (finish) result.add(finish);
        return result;
      }, new Set<string>());
      const finishes = [...finishSet];
      const materialsByFinish = new Map<string, number>();
      for (const receipt of transferReceipts) {
        const finish = String(receipt.finish || '');
        if (!finish) continue;
        materialsByFinish.set(finish, Math.max(
          materialsByFinish.get(finish) || 0,
          finiteNumber(receipt.materialCount),
        ));
      }
      return {
        selected: garage.getSelectedGarageVariant(),
        built: dressing.isBuilt(),
        triangles: numberValue(data.workshopTriangleCount),
        activeWorkshopTriangles: numberValue(data.activeWorkshopTriangleCount),
        buildTimings: copiedArray<GarageWorkshopBuildTiming>(data.buildTimings),
        workshopTransferTimings: transferReceipts,
        workshopPresentationFinishes: finishes,
        workshopPaletteCount: finishes.length,
        workshopExhibitTextureCount: transferReceipts.reduce(
          (sum, receipt) => sum + finiteNumber(receipt.textureCount), 0,
        ),
        workshopPaletteMaterialCount: [...materialsByFinish.values()].reduce(
          (sum, count) => sum + count, 0,
        ),
        workshopTransferredAttributeBytes: transferReceipts.reduce(
          (sum, receipt) => sum + finiteNumber(receipt.payload?.attributeBytes), 0,
        ),
        workshopOmittedAttributeBytes: transferReceipts.reduce(
          (sum, receipt) => sum + finiteNumber(receipt.payload?.omittedAttributeBytes), 0,
        ),
        workshopOmittedAttributeCount: transferReceipts.reduce(
          (sum, receipt) => sum + finiteNumber(receipt.payload?.omittedAttributeCount), 0,
        ),
        optimization: optimizationValue(data.optimizationReceipt),
        optimizedTriangles: numberValue(data.optimizedWorkshopTriangleCount),
        optimizedTriangleParity: trueValue(data.optimizedWorkshopTriangleParity),
        mapId: stringValue(data.garageMapId),
        architecture: stage.stats(),
        sceneMode: stringValue(stageData.garageSceneMode),
        roofMode: stringValue(stageData.garageRoofMode),
        environment: {
          ...environment.diagnostics(),
          worldMounted: phaseDiagnostics.scene.worldMounted,
          retainedWorldMapId: getRetainedWorldMapId(),
        },
        wallLayout: data.wallLayout || { bays: 0, overlaps: [] },
        mapImageCount: data.mapImageCount ?? -1,
        battleScreenMode: stringValue(data.battleScreenMode),
        battleScreenWallBay: stringValue(data.battleScreenWallBay),
        battleScreenDisplayCount: numberValue(data.battleScreenDisplayCount),
        battleScreenImageCount: numberValue(data.battleScreenImageCount),
        battleScreenResidentImageLimit: numberValue(data.battleScreenResidentImageLimit),
        battleScreenResidentImageCount: numberValue(data.battleScreenResidentImageCount),
        battleScreenCurrentImage: stringValue(data.battleScreenCurrentImage),
        battleScreenSecondaryImage: stringValue(data.battleScreenSecondaryImage),
        battleScreenSecondaryFacing: stringValue(data.battleScreenSecondaryFacing),
        battleScreenVisible: trueValue(data.battleScreenVisible),
        modelMode: stringValue(data.workshopModelMode),
        exhibitCount: numberValue(data.workshopExhibitCount),
        sharedMaintenanceBayCount: numberValue(data.sharedMaintenanceBayCount),
        sharedMaintenanceBayIds: copiedArray<string>(data.sharedMaintenanceBayIds),
        sharedMaintenanceBayQuadrants: copiedArray<string>(
          data.sharedMaintenanceBayQuadrants,
        ),
        workshopOrbitCoverageDegrees: numberValue(data.workshopOrbitCoverageDegrees),
        verdantHeroHoistOffsetM: numberValue(data.verdantHeroHoistOffsetM),
        verdantHoistStationCount: numberValue(data.verdantHoistStationCount),
        verdantHoistChainRuns: numberValue(data.verdantHoistChainRuns),
        verdantSuspendedLoadCount: numberValue(data.verdantSuspendedLoadCount),
        verdantConnectedLiftPointCount: numberValue(data.verdantConnectedLiftPointCount),
        verdantRoutedUtilityCircuits: numberValue(data.verdantRoutedUtilityCircuits),
        verdantJunctionBoxes: numberValue(data.verdantJunctionBoxes),
        heroTrackContactErrorM: heroTrackContactError(
          visual,
          garagePosition.y,
          podiumTopYM,
        ),
        verdantOriginalVisible: trueValue(data.verdantOriginalVisible),
        verdantOriginalLayoutReceipt: stringValue(data.verdantOriginalLayoutReceipt),
        verdantOriginalTriangleCount: numberValue(data.verdantOriginalTriangleCount),
        verdantOriginalExhibitCount: numberValue(data.verdantOriginalExhibitCount),
        verdantOriginalExhibitIds: copiedArray<string>(data.verdantOriginalExhibitIds),
        verdantOriginalSetPieces: copiedArray<string>(data.verdantOriginalSetPieces),
        forwardCorrectionRad: numberValue(data.workshopForwardCorrectionRad),
        families: copiedArray<string>(data.workshopFamilies),
        sourceVehicleIds: copiedArray<string>(data.workshopSourceVehicleIds),
        renderer: {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
        },
      };
    },
  };
}

declare global {
  interface Window {
    __GARAGE_WORKSHOP?: GarageWorkshopDiagnostics;
  }
}
