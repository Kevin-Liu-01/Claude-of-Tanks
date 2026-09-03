import * as THREE from 'three';
import {
  factoryCamoPatternIdFor,
  sharedCamoPreset,
} from '../vehicles/camoPolicy.ts';
import { tagVehicleMaterial } from '../vehicles/appearanceAudit.ts';
import type { MaterialTankSpec } from '../vehicles/materials.ts';

export interface GarageWorkshopMaterialPalette {
  readonly finishKey: string;
  readonly textureCount: 0;
  readonly materialCount: number;
  readonly hull: THREE.Material;
  readonly wheels: THREE.Material;
  readonly wheelsRecessed: THREE.Material;
  readonly rubber: THREE.Material;
  readonly detail: THREE.Material;
  readonly dark: THREE.Material;
  readonly shadow: THREE.Material;
  readonly trackLink: THREE.Material;
  readonly spareTrack: THREE.Material;
  readonly glass: THREE.Material;
  readonly barrel: THREE.Material;
  readonly canvasCloth: THREE.Material;
  readonly wood: THREE.Material;
  readonly burnt: THREE.Material;
  dispose(): void;
}

export interface GarageWorkshopMaterialEngineContext {
  setupShadowMaterial?(material: THREE.Material): void;
  releaseShadowMaterial?(material: THREE.Material): boolean;
}

interface FactoryFinish {
  readonly key: string;
  readonly base: THREE.Color;
  readonly weather: THREE.Color;
}

function factoryFinish(spec: MaterialTankSpec): FactoryFinish {
  const patternId = factoryCamoPatternIdFor(spec.nation, spec.era);
  const preset = sharedCamoPreset(patternId);
  const base = preset?.visual.base || spec.visual.base || '#4d5840';
  const weather = preset?.visual.weather || spec.visual.weather || base;
  return {
    key: patternId || `solid:${String(spec.nation || 'unknown')}:${String(spec.era || 'unknown')}:${base}`,
    base: new THREE.Color(base),
    weather: new THREE.Color(weather),
  };
}

function mixColor(a: THREE.Color, b: THREE.Color, amount: number): THREE.Color {
  return a.clone().lerp(b, amount);
}

/**
 * Return the stable national service-finish key used by a Garage exhibit.
 * Burlak and T-90M intentionally resolve to one shared Russian green palette.
 */
export function garageWorkshopFinishKey(spec: MaterialTankSpec): string {
  return factoryFinish(spec).key;
}

/**
 * Presentation-only materials for the four static maintenance exhibits.
 *
 * These tanks keep their complete authored geometry, fittings and PBR
 * response. They deliberately do not allocate camouflage,
 * normal, roughness, decal, or scrolling-track canvases: at their Garage
 * distance those maps cost substantially more than the pixels they affect.
 */
export function createGarageWorkshopMaterialPalette(
  spec: MaterialTankSpec,
  engineCtx: GarageWorkshopMaterialEngineContext,
): GarageWorkshopMaterialPalette {
  const finish = factoryFinish(spec);
  const materials = new Set<THREE.Material>();
  const setup = <T extends THREE.Material>(material: T): T => {
    engineCtx.setupShadowMaterial?.(material);
    materials.add(material);
    return material;
  };
  const standard = (
    color: THREE.Color | number,
    roughness: number,
    metalness: number,
    extra: THREE.MeshStandardMaterialParameters = {},
  ): THREE.MeshStandardMaterial => setup(new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    ...extra,
  }));

  // A service-bay tank has one national delivery coat, not the player's
  // selected/signature camouflage. Keeping vertex colours enabled would let
  // some builders' paint breakup survive even after their canvas maps were
  // removed, so this intentionally uses uniform paint plus normal PBR light.
  // Standard also reuses the Garage's resident shader family; a Physical-only
  // clear-coat variant was imperceptible here and caused a cold first reveal.
  const paint = standard(finish.base, 0.88, 0.05, {
    envMapIntensity: 0.46,
  });
  const wheelPaint = standard(mixColor(finish.base, new THREE.Color(0x252820), 0.34), 0.94, 0.06);
  const recessedWheelPaint = standard(mixColor(finish.base, new THREE.Color(0x171a16), 0.52), 0.96, 0.04);
  const fittingPaint = standard(mixColor(finish.weather, new THREE.Color(0x35392f), 0.32), 0.94, 0.06);
  const rubber = standard(0x292a28, 0.97, 0);
  const gunmetal = standard(0x36342f, 0.92, 0.16);
  const gearShadow = standard(0x0b0c0a, 0.99, 0);
  const trackSteel = standard(0x353634, 0.96, 0.08);
  const opticGlass = standard(0x2a3540, 0.16, 0.72);
  const canvas = standard(0x42452f, 0.98, 0);
  const wood = standard(0x6b543a, 0.9, 0);

  tagVehicleMaterial(paint, 'armorPaint', 'garage-factory-paint');
  tagVehicleMaterial(wheelPaint, 'wheelPaint', 'garage-factory-wheel-paint');
  tagVehicleMaterial(recessedWheelPaint, 'wheelPaint', 'garage-factory-wheel-recessed');
  tagVehicleMaterial(fittingPaint, 'fittingPaint', 'garage-factory-fitting-paint');
  tagVehicleMaterial(rubber, 'tireRubber', 'garage-tire-rubber');
  tagVehicleMaterial(gunmetal, 'gunmetal', 'garage-gunmetal');
  tagVehicleMaterial(gearShadow, 'gearShadow', 'garage-gear-shadow');
  tagVehicleMaterial(trackSteel, 'trackSteel', 'garage-track-steel');
  tagVehicleMaterial(opticGlass, 'opticGlass', 'garage-optic-glass');
  tagVehicleMaterial(canvas, 'canvas', 'garage-canvas');
  tagVehicleMaterial(wood, 'wood', 'garage-wood');

  return {
    finishKey: finish.key,
    textureCount: 0,
    materialCount: materials.size,
    hull: paint,
    wheels: wheelPaint,
    wheelsRecessed: recessedWheelPaint,
    rubber,
    detail: fittingPaint,
    dark: gunmetal,
    shadow: gearShadow,
    trackLink: trackSteel,
    spareTrack: trackSteel,
    glass: opticGlass,
    barrel: paint,
    canvasCloth: canvas,
    wood,
    burnt: gunmetal,
    dispose() {
      for (const material of materials) {
        engineCtx.releaseShadowMaterial?.(material);
        material.dispose();
      }
      materials.clear();
    },
  };
}
