// Contract shared by the tank-asset renderer, release checker and UI.
// Keep the view list centralized: adding a required output here makes every
// registered tank fail the release gate until that output is generated.

import { flagIconCode } from '../ui/flagCodes.js';
import { tankTier, tierNumeral } from './tier.js';
import { tankLabelRecord } from './tankLabels.js';
import { vehicleMarkingRecord } from './vehicleMarkings.js';

// v4 retires the public vehicle-class field and expands era metadata to the
// canonical five-era taxonomy. Image formats and dimensions are unchanged.
export const TANK_ASSET_SCHEMA_VERSION = 4;

export const TANK_ASSET_VIEWS = Object.freeze({
  angle: Object.freeze({ suffix: 'angle', ext: 'webp', width: 512, height: 512, role: 'garage hero' }),
  top: Object.freeze({ suffix: 'top', ext: 'webp', width: 512, height: 512, role: 'top view' }),
  side: Object.freeze({ suffix: 'side', ext: 'webp', width: 512, height: 256, role: 'side view' }),
  topSilhouette: Object.freeze({ suffix: 'top_silhouette', ext: 'png', width: 128, height: 128, role: 'top silhouette' }),
  sideSilhouette: Object.freeze({ suffix: 'side_silhouette', ext: 'png', width: 256, height: 128, role: 'side silhouette' }),
  hitZonesSide: Object.freeze({ suffix: 'hit_zones_side', ext: 'png', width: 512, height: 256, role: 'hit-area diagram' }),
  armorSide: Object.freeze({ suffix: 'armor_side', ext: 'png', width: 512, height: 256, role: 'penetration/armor diagram' }),
  modulesSide: Object.freeze({ suffix: 'modules_side', ext: 'png', width: 512, height: 256, role: 'module diagram' }),
  markings: Object.freeze({ suffix: 'markings', ext: 'png', width: 256, height: 128, role: 'national insignia and tactical designation' }),
});

export function tankAssetFile(id, view) {
  const def = TANK_ASSET_VIEWS[view];
  if (!def) throw new Error(`Unknown tank asset view: ${view}`);
  return `${id}_${def.suffix}.${def.ext}`;
}

export function requiredTankAssetFiles(id) {
  return Object.fromEntries(Object.keys(TANK_ASSET_VIEWS).map((view) => [view, tankAssetFile(id, view)]));
}

/** Number of independently visible muzzle bore/rim pairs required by a
 * vehicle's declared gun plant. Most tanks have one; twin autocannon profiles
 * publish one local muzzle axis per barrel. */
export function expectedMuzzleBoreCount(spec) {
  const muzzles = spec?.gun?.muzzles;
  return Array.isArray(muzzles) && muzzles.length ? muzzles.length : 1;
}

function rounded(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function point3(value) {
  return Array.isArray(value) ? value.slice(0, 3).map((v) => rounded(Number(v))) : null;
}

function plateMetadata(plate, turretLocal, index) {
  return {
    hitboxId: `${turretLocal ? 'T' : 'H'}${String(index + 1).padStart(2, '0')}`,
    name: String(plate.name || 'plate'),
    physicalMm: rounded(Number(plate.physicalMm || 0), 2),
    keMm: rounded(Number(plate.keMm ?? plate.physicalMm ?? 0), 2),
    ceMm: rounded(Number(plate.ceMm ?? plate.physicalMm ?? 0), 2),
    kind: String(plate.kind || 'main'),
    turretLocal,
    verts: (plate.verts || []).map(point3).filter(Boolean),
  };
}

function boxMetadata(box, key, index, prefix) {
  return {
    volumeId: `${prefix}${String(index + 1).padStart(2, '0')}`,
    name: String(box[key] || key),
    min: point3(box.min),
    max: point3(box.max),
    turretLocal: !!box.turretLocal,
  };
}

/** Stable gameplay/diagram metadata. A changed armor box, plate or tier makes
 * the generated manifest stale even when the visible mesh did not change. */
export function tankAssetMetadata(spec) {
  const armor = spec.armor || {};
  const label = tankLabelRecord(spec);
  return {
    id: spec.id,
    name: label.displayName,
    label,
    markings: vehicleMarkingRecord(spec),
    nation: spec.nation,
    countryCode: flagIconCode(spec.nation),
    era: spec.era,
    tier: tankTier(spec.id),
    tierNumeral: tierNumeral(spec.id),
    dimensionsM: {
      hullLength: rounded(Number(spec.dims && spec.dims.hullLengthM)),
      overallLength: rounded(Number(spec.dims && spec.dims.overallLengthM)),
      width: rounded(Number(spec.dims && spec.dims.widthM)),
      height: rounded(Number(spec.dims && spec.dims.heightM)),
    },
    gun: {
      caliberMm: rounded(Number(spec.gun && spec.gun.caliberMm), 2),
      shells: ((spec.gun && spec.gun.shells) || []).map((shell) => ({
        name: shell.name,
        type: shell.type,
        pen100Mm: rounded(Number(shell.pen100Mm), 2),
        pen1000Mm: rounded(Number(shell.pen1000Mm), 2),
        pen2000Mm: rounded(Number(shell.pen2000Mm), 2),
      })),
    },
    armor: {
      schemaVersion: 2,
      turretPivot: point3(armor.turretPivot) || [0, 0, 0],
      plates: [
        ...(armor.hullPlates || []).map((plate, index) => plateMetadata(plate, false, index)),
        ...(armor.turretPlates || []).map((plate, index) => plateMetadata(plate, true, index)),
      ],
      modules: (armor.modules || []).map((box, index) => boxMetadata(box, 'module', index, 'M')),
      crew: (armor.crew || []).map((box, index) => boxMetadata(box, 'crew', index, 'C')),
    },
  };
}

function fnvByte(hash, byte) {
  hash ^= byte;
  return Math.imul(hash, 0x01000193) >>> 0;
}

function fnvBytes(hash, bytes) {
  for (let i = 0; i < bytes.length; i++) hash = fnvByte(hash, bytes[i]);
  return hash >>> 0;
}

function textFingerprint(text) {
  return fnvBytes(0x811c9dc5, new TextEncoder().encode(String(text))).toString(16).padStart(8, '0');
}

export function metadataFingerprint(metadata) {
  return textFingerprint(JSON.stringify(metadata));
}

/** Geometry fingerprint used by both generator and release gate. Mesh order is
 * normalized so harmless scene traversal order changes do not stale assets. */
export function geometryFingerprint(root) {
  root.updateMatrixWorld(true);
  const digests = [];
  const instance = new Float32Array(16);
  root.traverse((object) => {
    if (!(object.isMesh || object.isInstancedMesh) || !object.geometry) return;
    const position = object.geometry.getAttribute && object.geometry.getAttribute('position');
    if (!position || !position.array) return;
    let hash = fnvBytes(0x811c9dc5, new Uint8Array(position.array.buffer, position.array.byteOffset, position.array.byteLength));
    hash = fnvBytes(hash, new Uint8Array(new Float32Array(object.matrixWorld.elements).buffer));
    if (object.isInstancedMesh && object.instanceMatrix && object.instanceMatrix.array) {
      const values = object.instanceMatrix.array;
      for (let i = 0; i < object.count; i++) {
        for (let j = 0; j < 16; j++) instance[j] = values[i * 16 + j];
        hash = fnvBytes(hash, new Uint8Array(instance.buffer));
      }
    }
    digests.push(hash >>> 0);
  });
  digests.sort((a, b) => a - b);
  let total = 0x811c9dc5;
  for (const digest of digests) {
    total = fnvByte(total, digest & 0xff);
    total = fnvByte(total, (digest >>> 8) & 0xff);
    total = fnvByte(total, (digest >>> 16) & 0xff);
    total = fnvByte(total, (digest >>> 24) & 0xff);
  }
  return total.toString(16).padStart(8, '0');
}
