/** LOD ownership is not a shoe identity: suspension links and axle bosses
 * are also instanced under LOD nodes and legitimately meet the hull. */
export function isTrackShoeMesh(object) {
  return object?.isInstancedMesh === true
    && object.userData?.runningGear === true
    && Number.isFinite(object.userData?.trackShoeCountPerSide)
    && object.userData.trackShoeCountPerSide > 0
    && !!object.geometry?.getAttribute('position');
}

/** Every buildRunningGear unit owns one live band per side (userData.runningGearUnitId), so a tank with N units
 * carries 2N bands: the T95's four tracks are two units (2026-11-09; tools/track-system-audit.mjs counts per unit). */
export function expectedTrackBandCount(bands) {
  const units = new Set(bands.map((band) => band.userData?.runningGearUnitId ?? -1));
  return 2 * Math.max(1, units.size);
}
