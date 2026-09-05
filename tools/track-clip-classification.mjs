/** LOD ownership is not a shoe identity: suspension links and axle bosses
 * are also instanced under LOD nodes and legitimately meet the hull. */
export function isTrackShoeMesh(object) {
  return object?.isInstancedMesh === true
    && object.userData?.runningGear === true
    && Number.isFinite(object.userData?.trackShoeCountPerSide)
    && object.userData.trackShoeCountPerSide > 0
    && !!object.geometry?.getAttribute('position');
}
