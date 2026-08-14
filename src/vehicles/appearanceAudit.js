// Semantic appearance policy for first-party vehicles.
//
// Geometry ownership and paint ownership are separate concerns. Road-wheel
// dishes and guards may be camouflage-painted; tire rubber and working track
// steel must stay neutral. Keeping this policy on explicit roles prevents a
// color cleanup from deleting or repainting armor, skirts or mudguards.

export const VEHICLE_APPEARANCE_PALETTE = Object.freeze({
  trackPad: 0x30312f,
  trackSteel: 0x353634,
  tireRubber: 0x292a28,
  gearShadow: 0x0b0c0a,
});

const FIXED_ROLE_COLOR = Object.freeze({
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

function materialsOf(object) {
  if (!object?.material) return [];
  return Array.isArray(object.material) ? object.material.filter(Boolean) : [object.material];
}
function roleOf(object, material) {
  return object?.userData?.appearanceRole || material?.userData?.appearanceRole || '';
}

export function tagVehicleMaterial(material, role, name = role) {
  if (!material) return material;
  material.name = `cot:${name}`;
  material.userData = { ...(material.userData || {}), appearanceRole: role };
  return material;
}

/** Reassert the neutral working-gear palette after family builders run.
 * Profiles may still author geometry and painted dishes independently; only
 * explicit rubber/track roles are changed here. */
export function normalizeTankAppearance(root) {
  const normalized = new Set();
  root?.traverse?.((object) => {
    for (const material of materialsOf(object)) {
      if (normalized.has(material)) continue;
      const role = roleOf(object, material);
      const color = FIXED_ROLE_COLOR[role];
      if (color == null || !material.color) continue;
      material.color.setHex(color);
      normalized.add(material);
    }
  });
  return normalized.size;
}

function materialColorRecord(material) {
  if (!material?.color) return null;
  const hsl = { h: 0, s: 0, l: 0 };
  material.color.getHSL(hsl);
  return {
    hex: `#${material.color.getHexString()}`,
    saturation: Number(hsl.s.toFixed(4)),
    lightness: Number(hsl.l.toFixed(4)),
  };
}

/** Browser/release-facing detector for accidental olive/tan working gear and
 * armor panels routed through rubber/track materials. */
export function auditTankAppearance(root) {
  const issues = [];
  const roles = {};
  const seen = new Set();
  root?.traverse?.((object) => {
    if (!object?.isMesh && !object?.isInstancedMesh) return;
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

      if (object.userData?.trackGuard && GEAR_MATERIAL_ROLES.has(material.userData?.appearanceRole)) {
        issues.push({
          code: 'track-guard-uses-gear-material', object: object.name || object.type,
          role: material.userData.appearanceRole, color,
        });
      }

      const plateLike = /(?:armor|armour|plate|skirt|guard|glacis|^hull$|^turret$)/i.test(object.name || '');
      const documentedTrackPart = object.userData?.runningGear || /(?:spare|hullTrack|turretTrack)/i.test(object.name || '');
      if (plateLike && !documentedTrackPart && GEAR_MATERIAL_ROLES.has(material.userData?.appearanceRole)) {
        issues.push({
          code: 'armor-uses-gear-material', object: object.name || object.type,
          role: material.userData.appearanceRole, color,
        });
      }
    }
  });
  return { version: 1, issues, roles };
}
