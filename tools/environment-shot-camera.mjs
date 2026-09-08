/** Serializable, deterministic stand view outside every nearby canopy/building. */
export function selectStandView({ clusters, concealers, buildings, halfExtent = 470 }) {
  const stands = [...clusters].sort((a, b) => b.r - a.r);
  for (const stand of stands) {
    for (const extra of [14, 28, 42]) {
      for (let step = 0; step < 24; step++) {
        const angle = -Math.PI * 0.42 + step * Math.PI / 12;
        const radius = Math.max(8, stand.r) + extra;
        const x = stand.x + Math.sin(angle) * radius;
        const z = stand.z + Math.cos(angle) * radius;
        if (Math.max(Math.abs(x), Math.abs(z)) > halfExtent) continue;
        // Tree concealment discs use 80% of the full canopy radius. Include
        // the remaining crown and a near-camera gap instead of photographing
        // a lone tree that happens to stand just outside the selected grove.
        let clearance = Infinity;
        for (const disc of concealers) {
          clearance = Math.min(clearance, Math.hypot(x - disc.x, z - disc.z) - disc.r / 0.8);
        }
        for (const building of buildings) {
          clearance = Math.min(clearance, Math.hypot(x - building.x, z - building.z)
            - Math.hypot(building.w, building.d) * 0.5);
        }
        if (clearance >= 5) return { x, z, target: stand, clearance };
      }
    }
  }
  throw new Error('No unobstructed foliage inspection position inside the battlefield');
}

/**
 * Serializable scope probe on the CURRENT map. The canonical sniper_view
 * recipe intentionally selects Verdant and an enemy, so it cannot compare a
 * chosen Fjord mountain. Keep the authored wide camera's location, but ask
 * the real rig to enter x8: scope grade, bloom and vegetation fade all apply.
 * The default ray is V9 Fjord EN pixel (640,355) in its 1440x900 wide frame.
 */
export function stageHorizonScopeCapture(
  { mapId, ndcX = -1 / 9, ndcY = 19 / 90 },
  D = globalThis.window?.__DEBUG,
) {
  if (!D?.shotMode || D.world.mapId !== mapId) {
    throw new Error('Horizon scope requires the requested map in frozen shot mode');
  }
  const position = D.camera.position.clone();
  const arcade = {
    position: position.toArray(), quaternion: D.camera.quaternion.toArray(), fov: D.camera.fov,
  };
  const ray = position.clone().set(ndcX, ndcY, 0.5).unproject(D.camera).sub(position).normalize();
  D.rig.snapSniper(8, Math.atan2(ray.x, ray.z), Math.atan2(ray.y, Math.hypot(ray.x, ray.z)));
  // snapSniper owns the actual scope contract. Only relocate its authored
  // camera afterward; setExternalPose would silently clear the scoped flag.
  D.camera.position.copy(position);
  D.camera.updateProjectionMatrix();
  D.camera.updateMatrixWorld(true);
  D.world.setSniperFade(1, true, D.camera.fov, D.rig.aimDist);
  D.world.update(0, D.camera.position);
  D.lighting.updateFrustums();
  D.lighting.update(true);
  if (D.rig.mode !== 'SNIPER' || D.rig.zoom !== 8 || D.camera.fov !== 7.5
      || D.camera.userData.scoped !== true || D.world.mapId !== mapId) {
    throw new Error('Authored horizon probe failed the real x8 scope contract');
  }
  return {
    mapId, authoredCamera: true, ndc: [ndcX, ndcY], arcade,
    mode: D.rig.mode, zoom: D.rig.zoom, fov: D.camera.fov,
    scoped: D.camera.userData.scoped, aimDist: D.rig.aimDist,
  };
}

/** Restore the wide pose and all scope state before the next shot or map. */
export function restoreHorizonArcadeCapture(arcade, D = globalThis.window?.__DEBUG) {
  D.rig.snapArcade(0, 0, 0);
  D.camera.position.fromArray(arcade.position);
  D.camera.quaternion.fromArray(arcade.quaternion);
  D.camera.fov = arcade.fov;
  D.camera.updateProjectionMatrix();
  D.camera.updateMatrixWorld(true);
  D.world.setSniperFade(0, true, D.camera.fov, D.rig.aimDist);
  D.world.update(0, D.camera.position);
  D.lighting.updateFrustums();
  D.lighting.update(true);
}
