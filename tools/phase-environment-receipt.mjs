// Checkpoint-only evidence, not a frame-loop observer or a quality override.
// Keep standalone so both current and preserved builds can execute it.
export function readPhaseEnvironment() {
  const d = window.__DEBUG, renderer = d.renderer, gl = renderer.getContext();
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  const pool = d.nightLighting?.current;
  return {
    mapId: d.world?.mapId ?? null,
    battleOrdinal: d.game.battleCount,
    grassWork: d.world?.getGrassWorkState?.() ?? null,
    weather: d.battleAtmosphere?.current?.weather ?? null,
    nightLighting: {
      available: !!d.nightLighting,
      attached: !!pool && pool.group.parent === d.scene,
      emitters: pool?.emitterCount ?? 0,
      lights: (pool?.lights ?? []).map(light => ({
        type: light.type, intensity: light.intensity, castShadow: light.castShadow,
      })),
    },
    graphics: {
      unmasked: !!extension,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      contextLost: gl.isContextLost(),
      preset: d.quality.resolvePresetName(),
      outputPixelRatio: renderer.getPixelRatio(),
      canvas: [renderer.domElement.width, renderer.domElement.height],
      dynamicScale: d.post.dynScale,
      performanceTrim: d.post.perfTrim,
      aa: renderer.domElement.dataset.postAa,
    },
    camera: {
      position: d.camera.position.toArray(), quaternion: d.camera.quaternion.toArray(),
      fov: d.camera.fov, near: d.camera.near, far: d.camera.far,
    },
  };
}
