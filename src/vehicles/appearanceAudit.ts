// Semantic appearance policy for first-party vehicles.
//
// Geometry ownership and paint ownership are separate concerns. Road-wheel
// dishes and guards may be camouflage-painted; tire rubber and working track
// steel must stay neutral. Keeping this policy on explicit roles prevents a
// color cleanup from deleting or repainting armor, skirts or mudguards.

import { Color, type InstancedBufferAttribute, type Material, type Object3D } from 'three';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { liftLinearRgbToWheelFloor } from './wheelPaintFloor.ts';
import { RUNNING_GEAR_PALETTE, runningGearFinishRuleFor } from './runningGearFinish.ts';

interface ColorPort {
  r: number;
  g: number;
  b: number;
  getHexString(): string;
  getHSL(target: { h: number; s: number; l: number }): { h: number; s: number; l: number };
  setHex(hex: number): ColorPort;
  setRGB(r: number, g: number, b: number): ColorPort;
}

interface AppearanceColorRecord {
  hex: string;
  saturation: number;
  lightness: number;
}

interface VehicleAppearanceIssue {
  code: 'saturated-running-gear' | 'track-guard-uses-gear-material' | 'armor-uses-gear-material';
  object: string;
  role: string;
  color: AppearanceColorRecord | null;
}

interface VehicleAppearanceAudit {
  version: 1;
  issues: VehicleAppearanceIssue[];
  roles: Record<string, number>;
}

/** The neutral working-gear hexes come from the one running-gear finish table (runningGearFinish.ts). */
export const VEHICLE_APPEARANCE_PALETTE = Object.freeze({
  trackPad: RUNNING_GEAR_PALETTE.trackPad,
  trackSteel: RUNNING_GEAR_PALETTE.trackSteel,
  tireRubber: RUNNING_GEAR_PALETTE.tireRubber,
  gearShadow: RUNNING_GEAR_PALETTE.gearShadow,
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
  instanceColor?: InstancedBufferAttribute | null;
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

function instanceTrackPalette(object: Object3D, material: Material): InstancedBufferAttribute | null {
  const render = object as RenderObject;
  return render.isInstancedMesh
    && dataValue(material, 'appearanceRole') === 'trackPad'
    && dataValue(material, 'appearanceColorSource') === 'instance-palette'
    ? render.instanceColor ?? null : null;
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

/** The hull's own running-gear paints (materials.ts): the one scheme wheel paint and its shade. */
export interface RunningGearPaints {
  /** mats.wheels — every painted running-gear face rides it. */
  wheelPaint: Material;
  /** mats.wheelsRecessed — recessed interleave rows and suspension arms ride the paint in shade. */
  wheelPaintShade?: Material | null;
}

/** RUNNING-GEAR FINISH (owner 2026-09-22, runningGearFinish.ts): a painted running-gear face rides the
 * hull's one scheme wheel paint. Any other wheelPaint-tagged material — a per-hull hex clone, a family
 * "worn dish"/"worn drum" retone — and fitting paint under a dish role are swapped for it here, so the
 * discs, hub caps, rims, roller discs and end-wheel bodies of one hull share one material and follow
 * every camouflage repaint together. Returns the number of material slots re-seated. */
function reseatRunningGearPaint(object: Object3D, paints: RunningGearPaints): number {
  const render = object as RenderObject;
  if ((!render.isMesh && !render.isInstancedMesh) || !render.material) return 0;
  const objectRole = dataValue(object, 'appearanceRole');
  const rule = runningGearFinishRuleFor(typeof objectRole === 'string' ? objectRole : null);
  const slots = Array.isArray(render.material) ? render.material : [render.material];
  let reseated = 0;
  for (let index = 0; index < slots.length; index++) {
    const material = slots[index];
    const materialRole = dataValue(material, 'appearanceRole');
    // Camouflage-mapped wheel paint (the Patton family) carries the hull scheme as its map: it stays.
    if ((material as Material & { map?: unknown }).map) continue;
    let replacement: Material | null = null;
    if (materialRole === 'wheelPaint' && material !== paints.wheelPaint && material !== paints.wheelPaintShade) {
      replacement = rule?.finish === 'scheme-paint-shade' && paints.wheelPaintShade
        ? paints.wheelPaintShade : paints.wheelPaint;
    } else if (rule?.finish === 'scheme-paint' && materialRole === 'fittingPaint') {
      replacement = paints.wheelPaint;
    }
    if (!replacement) continue;
    if (Array.isArray(render.material)) render.material[index] = replacement;
    else render.material = replacement;
    reseated++;
  }
  return reseated;
}

/** Reassert the running-gear finish after family builders run (runningGearFinish.ts): the neutral
 * rubber/steel/shadow roles snap to the palette, painted faces re-seat onto the hull's one scheme wheel
 * paint when `paints` is given, and the wheel paint keeps its floor. Camouflage armor, skirts and guards
 * are outside this normalization. */
export function normalizeTankAppearance(root: Object3D | null | undefined, paints?: RunningGearPaints | null): number {
  const normalized = new Set<Material>();
  const normalizedPalettes = new Set<InstancedBufferAttribute>();
  const instanceTint = new Color();
  const instanceHsl = { h: 0, s: 0, l: 0 };
  let reseated = 0;
  root?.traverse((object) => {
    if (paints) reseated += reseatRunningGearPaint(object, paints);
    for (const material of materialsOf(object)) {
      const role = roleOf(object, material);
      const color = FIXED_ROLE_COLOR[role];
      const materialColor = colorOf(material);
      if (!materialColor) continue;
      const palette = instanceTrackPalette(object, material);
      if (palette) {
        // Track shoes already carry their neutral steel shade per instance.
        // A second dark base tint multiplies it to almost black in the shader.
        materialColor.setHex(0xffffff);
        normalized.add(material);
        if (normalizedPalettes.has(palette)) continue;
        let changed = false;
        for (let i = 0; i < palette.count; i++) {
          instanceTint.fromBufferAttribute(palette, i).getHSL(instanceHsl);
          if (!Number.isFinite(instanceTint.r) || !Number.isFinite(instanceTint.g)
              || !Number.isFinite(instanceTint.b)
              || instanceHsl.s > .14) {
            instanceTint.setHex(VEHICLE_APPEARANCE_PALETTE.trackPad);
            palette.setXYZ(i, instanceTint.r, instanceTint.g, instanceTint.b);
            changed = true;
          }
        }
        if (changed) palette.needsUpdate = true;
        normalizedPalettes.add(palette);
        continue;
      }
      if (normalized.has(material)) continue;
      if (color != null) {
        materialColor.setHex(color);
        normalized.add(material);
        continue;
      }
      if (dataValue(material, 'appearanceRole') === 'wheelPaint') {
        // RUNNING-GEAR FINISH (owner 2026-09-22): the scheme wheel paint records the hex materials.ts tinted it
        // to (schemeFinishHex). A family that retinted the shared paint in place after the bake (dirty-OD,
        // saturation or brightness "corrections") is undone here: the paint returns to its scheme tone, so one
        // hull's wheels never differ from what the next repaint would give them. Rounding from the floor below
        // stays within two 8-bit steps and is kept.
        const stamp = dataValue(material, 'schemeFinishHex');
        if (typeof stamp === 'number') {
          const hex = parseInt(materialColor.getHexString(), 16);
          const distance = Math.max(Math.abs(((hex >> 16) & 255) - ((stamp >> 16) & 255)),
            Math.abs(((hex >> 8) & 255) - ((stamp >> 8) & 255)), Math.abs((hex & 255) - (stamp & 255)));
          if (distance > 2) {
            materialColor.setHex(stamp);
            normalized.add(material);
          }
        }
        // WHEEL-PAINT FLOOR (owner 2026-09-14): every painted dish stays clearly above the tire rubber, whatever
        // scheme it is tinted toward. Camouflage-mapped paint is left alone: its colour is only a multiplier
        // over the map. The stamp follows the lift (the paint's shade always starts under the floor), so the
        // release audit reads the floored tone as the scheme tone.
        if (!(material as Material & { map?: unknown }).map) {
          const [r, g, b] = liftLinearRgbToWheelFloor([materialColor.r, materialColor.g, materialColor.b]);
          if (r !== materialColor.r || g !== materialColor.g || b !== materialColor.b) {
            materialColor.setRGB(r, g, b);
            normalized.add(material);
          }
          if (typeof stamp === 'number') {
            material.userData = { ...(material.userData || {}), schemeFinishHex: parseInt(materialColor.getHexString(), 16) };
          }
        }
      }
    }
  });
  return normalized.size + reseated;
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

function appendRunningGearColorIssue(
  issues: VehicleAppearanceIssue[],
  object: Object3D,
  role: string,
  color: AppearanceColorRecord | null,
): void {
  if (FIXED_ROLE_COLOR[role] == null || !color || color.saturation <= 0.14) return;
  issues.push({
    code: 'saturated-running-gear', object: object.name || object.type,
    role, color,
  });
}

function appendTrackGuardMaterialIssue(
  issues: VehicleAppearanceIssue[],
  object: Object3D,
  materialRole: RuntimeValue,
  color: AppearanceColorRecord | null,
): void {
  if (dataValue(object, 'trackGuard') !== true
      || typeof materialRole !== 'string'
      || !GEAR_MATERIAL_ROLES.has(materialRole)) return;
  issues.push({
    code: 'track-guard-uses-gear-material', object: object.name || object.type,
    role: materialRole, color,
  });
}

function appendArmorMaterialIssue(
  issues: VehicleAppearanceIssue[],
  object: Object3D,
  materialRole: RuntimeValue,
  color: AppearanceColorRecord | null,
): void {
  const plateLike = /(?:armor|armour|plate|skirt|guard|glacis|^hull$|^turret$)/i
    .test(object.name || '');
  const documentedTrackPart = dataValue(object, 'runningGear') === true
    || /(?:spare|hullTrack|turretTrack)/i.test(object.name || '');
  if (!plateLike || documentedTrackPart
      || typeof materialRole !== 'string'
      || !GEAR_MATERIAL_ROLES.has(materialRole)) return;
  issues.push({
    code: 'armor-uses-gear-material', object: object.name || object.type,
    role: materialRole, color,
  });
}

function auditAppearanceObject(
  object: Object3D,
  issues: VehicleAppearanceIssue[],
  roles: Record<string, number>,
  seen: Set<string>,
): void {
  const renderObject = object as RenderObject;
  if (!renderObject.isMesh && !renderObject.isInstancedMesh) return;
  for (const material of materialsOf(object)) {
    const role = roleOf(object, material) || 'unclassified';
    roles[role] = (roles[role] || 0) + 1;
    const color = materialColorRecord(material);
    const key = `${object.uuid}:${material.uuid}:${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const materialRole = dataValue(material, 'appearanceRole');
    appendRunningGearColorIssue(issues, object, role, color);
    const palette = instanceTrackPalette(object, material);
    if (palette) {
      const shade = new Color(), hsl = {h:0,s:0,l:0};
      for(let i=0;i<palette.count;i++) {
        shade.fromBufferAttribute(palette,i).getHSL(hsl);
        if(hsl.s <= .14) continue;
        appendRunningGearColorIssue(issues,object,'trackPad',{
          hex:`#${shade.getHexString()}`,saturation:hsl.s,lightness:hsl.l,
        });
        break;
      }
    }
    appendTrackGuardMaterialIssue(issues, object, materialRole, color);
    appendArmorMaterialIssue(issues, object, materialRole, color);
  }
}

/** Browser/release-facing detector for accidental olive/tan working gear and
 * armor panels routed through rubber/track materials. */
export function auditTankAppearance(root: Object3D | null | undefined): VehicleAppearanceAudit {
  const issues: VehicleAppearanceIssue[] = [];
  const roles: Record<string, number> = {};
  const seen = new Set<string>();
  root?.traverse((object) => {
    auditAppearanceObject(object, issues, roles, seen);
  });
  return { version: 1, issues, roles };
}
