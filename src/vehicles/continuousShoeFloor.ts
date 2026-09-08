/** An authored certificate for the complete native moving-shoe course, not
 * an extra clearance tolerance or a replacement for measured chassis stock. */
export function continuousShoeFloor(existingFloorYM: number, certifiedFloorYM?: number): number {
  if (certifiedFloorYM === undefined) return existingFloorYM;
  if (!Number.isFinite(certifiedFloorYM))
    throw new RangeError('A continuous shoe floor requires a finite complete-course proof');
  return Math.min(existingFloorYM, certifiedFloorYM);
}

interface XYZ { x: number; y: number; z: number }

/** These certificates describe an identity hull frame. A different authored
 * frame or an external visual scale must be converted and certified, never
 * compared silently with the presentation's root-space floor. Root yaw,
 * pitch, roll and translation are ordinary posed-plane placement, not scale. */
export function assertShoeFloorFrame(
  hull: {position: XYZ; rotation: XYZ; scale: XYZ}, rootScale: XYZ,
): void {
  if (hull.position.x !== 0 || hull.position.y !== 0 || hull.position.z !== 0
      || hull.rotation.x !== 0 || hull.rotation.y !== 0 || hull.rotation.z !== 0
      || hull.scale.x !== 1 || hull.scale.y !== 1 || hull.scale.z !== 1
      || rootScale.x !== 1 || rootScale.y !== 1 || rootScale.z !== 1)
    throw new RangeError('Continuous shoe floor requires its certified identity hull and unit root scale');
}

/** A certified whole-course floor may be below the loaded straight segment.
 * Initialize its first real ground sample before the ordinary damping starts;
 * all later samples and all non-opted-in rigs retain the original response. */
export function shoeConformanceAlpha(dt: number, initializeContact: boolean): number {
  return initializeContact ? 1 : 1 - Math.exp(-Math.max(0, Math.min(dt, .12)) * 20);
}
