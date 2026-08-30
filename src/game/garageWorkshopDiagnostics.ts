import type * as THREE from 'three';
import type { GarageDressingAccess } from './garageDressingAccess.ts';
import type {
  GarageEnvironmentPresentationRuntime,
  GarageEnvironmentState,
} from './garageEnvironmentPresentationRuntime.ts';
import type { GaragePedestalRuntime } from './garagePedestalRuntime.ts';
import type {
  GaragePhasePresentationDiagnostics,
  GaragePhasePresentationRuntime,
} from './garagePhasePresentationRuntime.ts';
import type { GarageVariant } from './garageVariants.ts';
import type { GarageStageRuntime } from '../ui/garageStage.ts';
import type { GarageRuntime } from '../ui/garage.ts';

export type GarageWorkshopVariant = Pick<
  GarageVariant,
  'id' | 'mapId' | 'name' | 'architecture'
>;

export interface GarageWorkshopStats {
  readonly selected: string;
  readonly built: boolean;
  readonly triangles: number;
  readonly buildTimings: readonly unknown[];
  readonly mapId: string;
  readonly architecture: unknown;
  readonly sceneMode: string;
  readonly roofMode: string;
  readonly environment: Readonly<GarageEnvironmentState> & {
    readonly worldMounted: boolean;
    readonly retainedWorldMapId: string | null;
  };
  readonly wallLayout: unknown;
  readonly mapImageCount: number;
  readonly battleScreenMode: string;
  readonly battleScreenWallBay: string;
  readonly battleScreenImageCount: number;
  readonly battleScreenResidentImageLimit: number;
  readonly battleScreenResidentImageCount: number;
  readonly battleScreenCurrentImage: string;
  readonly battleScreenVisible: boolean;
  readonly modelMode: string;
  readonly exhibitCount: number;
  readonly sharedMaintenanceBayCount: number;
  readonly sharedMaintenanceBayIds: readonly unknown[];
  readonly heroTrackContactErrorM: number | null;
  readonly verdantOriginalVisible: boolean;
  readonly verdantOriginalLayoutReceipt: string;
  readonly verdantOriginalTriangleCount: number;
  readonly verdantOriginalExhibitCount: number;
  readonly verdantOriginalExhibitIds: readonly unknown[];
  readonly verdantOriginalSetPieces: readonly unknown[];
  readonly forwardCorrectionRad: number;
  readonly families: readonly unknown[];
  readonly sourceVehicleIds: readonly unknown[];
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

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? [...value] : [];
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
      const trackFloorYM = visual?.presentationTrackFloorYM;
      const phaseDiagnostics: GaragePhasePresentationDiagnostics = phase.diagnostics();
      return {
        selected: garage.getSelectedGarageVariant(),
        built: dressing.isBuilt(),
        triangles: data.workshopTriangleCount || 0,
        buildTimings: arrayValue(data.buildTimings),
        mapId: data.garageMapId || '',
        architecture: stage.stats?.() || stageData.garageArchitecture || {},
        sceneMode: stageData.garageSceneMode || '',
        roofMode: stageData.garageRoofMode || '',
        environment: {
          ...environment.diagnostics(),
          worldMounted: phaseDiagnostics.scene.worldMounted,
          retainedWorldMapId: getRetainedWorldMapId(),
        },
        wallLayout: data.wallLayout || { bays: 0, overlaps: [] },
        mapImageCount: data.mapImageCount ?? -1,
        battleScreenMode: data.battleScreenMode || '',
        battleScreenWallBay: data.battleScreenWallBay || '',
        battleScreenImageCount: data.battleScreenImageCount || 0,
        battleScreenResidentImageLimit: data.battleScreenResidentImageLimit || 0,
        battleScreenResidentImageCount: data.battleScreenResidentImageCount || 0,
        battleScreenCurrentImage: data.battleScreenCurrentImage || '',
        battleScreenVisible: data.battleScreenVisible === true,
        modelMode: data.workshopModelMode || '',
        exhibitCount: data.workshopExhibitCount || 0,
        sharedMaintenanceBayCount: data.sharedMaintenanceBayCount || 0,
        sharedMaintenanceBayIds: arrayValue(data.sharedMaintenanceBayIds),
        heroTrackContactErrorM: Number.isFinite(trackFloorYM)
          ? Math.abs(
            (visual?.root.position.y || 0)
            + (trackFloorYM || 0)
            - (garagePosition.y + podiumTopYM)
          )
          : null,
        verdantOriginalVisible: data.verdantOriginalVisible === true,
        verdantOriginalLayoutReceipt: data.verdantOriginalLayoutReceipt || '',
        verdantOriginalTriangleCount: data.verdantOriginalTriangleCount || 0,
        verdantOriginalExhibitCount: data.verdantOriginalExhibitCount || 0,
        verdantOriginalExhibitIds: arrayValue(data.verdantOriginalExhibitIds),
        verdantOriginalSetPieces: arrayValue(data.verdantOriginalSetPieces),
        forwardCorrectionRad: data.workshopForwardCorrectionRad || 0,
        families: arrayValue(data.workshopFamilies),
        sourceVehicleIds: arrayValue(data.workshopSourceVehicleIds),
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
