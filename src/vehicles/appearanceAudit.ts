// Semantic appearance policy for first-party vehicles.
//
// Geometry ownership and paint ownership are separate concerns. Road-wheel
// dishes and guards may be camouflage-painted; tire rubber and working track
// steel must stay neutral. Keeping this policy on explicit roles prevents a
// color cleanup from deleting or repainting armor, skirts or mudguards.

import type { Material, Object3D } from 'three';
import type { RuntimeValue } from '../runtimeTypes.ts';

interface ColorPort {
  getHexString(): string;
  getHSL(target: { h: number; s: number; l: number }): { h: number; s: number; l: number };
  setHex(hex: number): ColorPort;
}

interface AppearanceColorRecord {
  hex: string;
  saturation: number;
  lightness: number;
}

export interface VehicleAppearanceIssue {
  code: 'saturated-running-gear' | 'track-guard-uses-gear-material' | 'armor-uses-gear-material';
  object: string;
  role: string;
  color: AppearanceColorRecord | null;
}

export interface VehicleAppearanceAudit {
  version: 1;
  issues: VehicleAppearanceIssue[];
  roles: Record<string, number>;
}

export const VEHICLE_APPEARANCE_PALETTE = Object.freeze({
  trackPad: 0x30312f,
  trackSteel: 0x353634,
  tireRubber: 0x292a28,
  gearShadow: 0x0b0c0a,
});

const FIXED_ROLE_COLOR: Readonly<Record<string, number>> = Object.freeze({
  trackPad: VEHICLE_APPEARANCE_PALETTE.trackPad,
  trackSteel: VEHICLE_APPEARANCE_PALETTE.trackSteel,
  trackHardware: VEHICLE_APPEARANCE_PALETTE.trackSteel,
  tireRubber: VEHICLE_APPEARANCE_PALETTE.tireRubber,
  wheelTire: VEHICLE_APPEARANCE_PALETTE.tireRubber,
  wheelInset: VEHICLE_APPEARANCE_PALETTE.tireRubber,
  gearShadow: VEHICLE_APPEARANCE_PALETTE.gearShadow,
});

const GEAR_MATERIAL_ROLES = new Set([
  'trackPad', 'trackSteel', 'trackHardware', 'tireRubber', 'wheelTire',
  'wheelInset', 'gearShadow', 'trackBand',
]);

type RenderObject = Object3D & {
  isInstancedMesh?: boolean;
  isMesh?: boolean;
  material?: Material | Material[];
};

function dataValue(owner: Object3D | Material, key: string): RuntimeValue {
  return (owner.userData as Readonly<Record<string, RuntimeValue>> | undefined)?.[key];
}

function materialsOf(object: Object3D): Material[] {
  const material = (object as RenderObject).material;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function roleOf(object: Object3D, material: Material): string {
  const objectRole = dataValue(object, 'appearanceRole');
  if (typeof objectRole === 'string') return objectRole;
  const materialRole = dataValue(material, 'appearanceRole');
  return typeof materialRole === 'string' ? materialRole : '';
}

function colorOf(material: Material): ColorPort | null {
  const color = (material as Material & { color?: Partial<ColorPort> }).color;
  return color
    && typeof color.getHexString === 'function'
    && typeof color.getHSL === 'function'
    && typeof color.setHex === 'function'
    ? color as ColorPort
    : null;
}

export function tagVehicleMaterial<T extends Material | null | undefined>(
  material: T,
  role: string,
  name: string = role,
): T {
  if (!material) return material;
  material.name = `cot:${name}`;
  material.userData = { ...(material.userData || {}), appearanceRole: role };
  return material;
}

/** Reassert the neutral working-gear palette after family builders run.
 * Profiles may still author geometry and painted dishes independently; only
 * explicit rubber/track roles are changed here. */
export function normalizeTankAppearance(root: Object3D | null | undefined): number {
  const normalized = new Set<Material>();
  root?.traverse((object) => {
    for (const material of materialsOf(object)) {
      if (normalized.has(material)) continue;
      const role = roleOf(object, material);
      const color = FIXED_ROLE_COLOR[role];
      const materialColor = colorOf(material);
      if (color == null || !materialColor) continue;
      materialColor.setHex(color);
      normalized.add(material);
    }
  });
  return normalized.size;
}

function materialColorRecord(material: Material): AppearanceColorRecord | null {
  const color = colorOf(material);
  if (!color) return null;
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return {
    hex: `#${color.getHexString()}`,
    saturation: Number(hsl.s.toFixed(4)),
    lightness: Number(hsl.l.toFixed(4)),
  };
}

/** Browser/release-facing detector for accidental olive/tan working gear and
 * armor panels routed through rubber/track materials. */
export function auditTankAppearance(root: Object3D | null | undefined): VehicleAppearanceAudit {
  const issues: VehicleAppearanceIssue[] = [];
  const roles: Record<string, number> = {};
  const seen = new Set<string>();
  root?.traverse((object) => {
    const renderObject = object as RenderObject;
    if (!renderObject.isMesh && !renderObject.isInstancedMesh) return;
    for (const material of materialsOf(object)) {
      const role = roleOf(object, material) || 'unclassified';
      roles[role] = (roles[role] || 0) + 1;
      const color = materialColorRecord(material);
      const key = `${object.uuid}:${material.uuid}:${role}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (FIXED_ROLE_COLOR[role] != null && color && color.saturation > 0.14) {
        issues.push({
          code: 'saturated-running-gear', object: object.name || object.type,
          role, color,
        });
      }

      const materialRole = dataValue(material, 'appearanceRole');
      if (dataValue(object, 'trackGuard') === true
        && typeof materialRole === 'string'
        && GEAR_MATERIAL_ROLES.has(materialRole)) {
        issues.push({
          code: 'track-guard-uses-gear-material', object: object.name || object.type,
          role: materialRole, color,
        });
      }

      const plateLike = /(?:armor|armour|plate|skirt|guard|glacis|^hull$|^turret$)/i.test(object.name || '');
      const documentedTrackPart = dataValue(object, 'runningGear') === true
        || /(?:spare|hullTrack|turretTrack)/i.test(object.name || '');
      if (plateLike && !documentedTrackPart
        && typeof materialRole === 'string'
        && GEAR_MATERIAL_ROLES.has(materialRole)) {
        issues.push({
          code: 'armor-uses-gear-material', object: object.name || object.type,
          role: materialRole, color,
        });
      }
    }
  });
  return { version: 1, issues, roles };
}
