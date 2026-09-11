// These browser owners are serialized directly by page.evaluate. Keep them
// closure-free so the focused selftest exercises the same installed functions.
export function installPhaseResourceFrameAccounting() {
  const post = window.__DEBUG.post;
  const renderer = window.__DEBUG.renderer;
  const originalRender = post.render.bind(post);
  const originalShadowRender = renderer.shadowMap.render.bind(renderer.shadowMap);
  window.__PHASE_RESOURCE_RENDER_COUNT = 0;
  window.__PHASE_RESOURCE_COMPLETED_RENDER_COUNT = 0;
  window.__PHASE_RESOURCE_FRAME_SAMPLE = null;
  window.__PHASE_RESOURCE_LAST_RENDER = null;
  window.__PHASE_RESOURCE_FRAMES = [];
  let measuringFrame = null;
  renderer.shadowMap.render = (...args) => {
    const calls = renderer.info.render.calls;
    const triangles = renderer.info.render.triangles;
    const result = originalShadowRender(...args);
    if (measuringFrame) {
      measuringFrame.shadowCalls += renderer.info.render.calls - calls;
      measuringFrame.shadowTriangles += renderer.info.render.triangles - triangles;
    }
    return result;
  };
  post.render = (...args) => {
    window.__PHASE_RESOURCE_RENDER_COUNT += 1;
    const sampleId = window.__PHASE_RESOURCE_FRAME_SAMPLE?.id ?? null;
    const phase = window.__DEBUG.game.phase;
    // Accumulate scene, shadows and every post pass instead of the final
    // fullscreen triangle. A nested production owner preserves autoReset=false.
    const previousAutoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    try {
      renderer.info.reset();
      measuringFrame = { shadowCalls: 0, shadowTriangles: 0 };
      const result = originalRender(...args);
      const frame = renderer.info.render;
      const receipt = {
        sampleId,
        completed: true,
        completedRender: ++window.__PHASE_RESOURCE_COMPLETED_RENDER_COUNT,
        phase,
        endPhase: window.__DEBUG.game.phase,
        calls: frame.calls,
        triangles: frame.triangles,
        lines: frame.lines,
        points: frame.points,
        shadowCalls: measuringFrame.shadowCalls,
        shadowTriangles: measuringFrame.shadowTriangles,
        shadowMask: window.__DEBUG.lighting?.scheduledMask ?? 0,
      };
      // Only successful complete transactions can become evidence. A throw
      // retains the prior completed receipt, never a partial-pass replacement.
      window.__PHASE_RESOURCE_LAST_RENDER = receipt;
      const history = window.__PHASE_RESOURCE_FRAMES;
      history.push(receipt);
      if (history.length > 2400) history.splice(0, history.length - 2400);
      return result;
    } finally {
      measuringFrame = null;
      renderer.info.autoReset = previousAutoReset;
    }
  };
}

export function beginPhaseResourceFrameSample(phase) {
  const sample = {
    id: (window.__PHASE_RESOURCE_FRAME_SAMPLE?.id ?? 0) + 1,
    phase,
    afterCompletedRender: window.__PHASE_RESOURCE_COMPLETED_RENDER_COUNT,
  };
  window.__PHASE_RESOURCE_FRAME_SAMPLE = sample;
  window.__PHASE_RESOURCE_LAST_RENDER = null;
  window.__PHASE_RESOURCE_FRAMES = [];
  return sample;
}

export function hasFreshPhaseResourceFrame(sample, receipt, phase) {
  return Number.isSafeInteger(sample?.id) && sample.id > 0
    && Number.isSafeInteger(sample.afterCompletedRender) && sample.afterCompletedRender >= 0
    && typeof phase === 'string' && sample.phase === phase
    && receipt?.sampleId === sample.id
    && receipt.completed === true
    && Number.isSafeInteger(receipt.completedRender)
    && receipt.completedRender > sample.afterCompletedRender
    && receipt.phase === phase && receipt.endPhase === phase
    && ['calls', 'triangles', 'lines', 'points', 'shadowCalls', 'shadowTriangles']
      .every((key) => Number.isFinite(receipt[key]) && receipt[key] >= 0);
}
