// Gun-barrel alignment (230, gallery-anatomy finding 2026-10-21: the combat gunBarrel cylinder the shots hit diverged
// from the drawn gun on the Strv 103B, KV-2 and ZTZ-99A). Shared by tools/gun-barrel-align-census.mjs, which measures
// each tank, and its receipt, which holds the fleet against the ledger without building a tank.
//
// The combat barrel (src/sim/armor.ts traceGunBarrel) is a cylinder of armor.gunBarrel.radiusM running along +Z of the
// barrel frame, hull · T(turretPivot) · Ry(turretYaw) · T(gunPivot) · Rx(-gunPitch), from the trunnion out to
// armor.gunBarrel.lengthM; the shell leaves its far end (authoritativeMatch gunWorldPose). The visual gun is whatever
// tube the factory published a main-gun mouth for. A tank is aligned when, at rest and across its traverse and
// elevation, the combat cylinder runs down the drawn bore: axis within ANGLE_DEG, centre line within OFFSET_M of the
// drawn axis from the mouth back along the measured tube, far end within AXIAL_M of the mouth, radius within
// RADIUS_M of the drawn tube's.
import { createHash } from 'node:crypto';

export const ALIGN_TOLERANCE = Object.freeze({ offsetM: 0.02, angleDeg: 0.5, axialM: 0.03, radiusM: 0.02 });

/** Yaw stations (degrees) a turreted gun is measured at, each at rest, full elevation and full depression. */
export const TURRET_YAWS_DEG = Object.freeze([0, 90, -135]);

/** True when the sim lays a fixed gun with the hull alone (movement.ts hasFixedHydraulicGun: turretYaw = gunPitch = 0). */
export const hullAimed = (spec) => !!(spec.hydropneumaticAim && spec.armor?.turretless);

/**
 * The poses a tank is censused at: { yawDeg, pitchDeg } in the sim's terms (turretYaw, gunPitch). A hull-aimed gun has
 * one (its sim yaw and pitch are pinned at zero); a turretless casemate traverses inside its arc; a turret everywhere.
 */
export function alignPoses(spec) {
  if (hullAimed(spec)) return [{ yawDeg: 0, pitchDeg: 0 }];
  const elevation = Number(spec.gunElevationDeg) || 0, depression = Number(spec.gunDepressionDeg) || 0;
  const pitches = [...new Set([0, elevation, -depression])];
  const arc = spec.armor?.turretless ? (typeof spec.gunArcDeg === 'number' ? spec.gunArcDeg : 11) : null;
  const yaws = arc === null ? TURRET_YAWS_DEG : [...new Set([0, arc, -arc])];
  return yaws.flatMap((yawDeg) => pitches.map((pitchDeg) => ({ yawDeg, pitchDeg })));
}

/** The combat fields the alignment depends on, in a fixed order (rounded so a re-registration cannot move the digest). */
export function combatBarrelFields(spec) {
  const armor = spec.armor || {};
  const round = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 1e6) / 1e6 : null);
  const triple = (v) => (Array.isArray(v) ? v.slice(0, 3).map(round) : null);
  return {
    turretPivot: triple(armor.turretPivot), gunPivot: triple(armor.gunPivot),
    barrel: armor.gunBarrel ? [round(armor.gunBarrel.lengthM), round(armor.gunBarrel.radiusM), armor.gunBarrel.collision !== false] : null,
    turretless: armor.turretless === true, hullAimed: hullAimed(spec),
    elevationDeg: round(spec.gunElevationDeg), depressionDeg: round(spec.gunDepressionDeg),
    arcDeg: typeof spec.gunArcDeg === 'number' ? round(spec.gunArcDeg) : null,
  };
}

/** A short digest of combatBarrelFields: a ledger row is current only while its combat barrel is unchanged. */
export function combatBarrelDigest(spec) {
  return createHash('sha256').update(JSON.stringify(combatBarrelFields(spec))).digest('hex').slice(0, 16);
}

/** Rig groups a row binds in docs/references/fleet-geometry-ledger.json (the hull too for a gun fixed in the hull). */
export const boundGroups = (kind) => (kind === 'hull-fixed' ? ['hull', 'turret', 'gun'] : ['turret', 'gun']);
