import { withGarageActionProfile } from './garage-action-timing.mjs';

// Two attribution-only checkpoints; not sampled on every frame or normal runs.
export function readGarageWorkshopEndpoint() {
  const stats = window.__GARAGE_WORKSHOP?.stats();
  const gl = window.__GL_DIAG;
  const frames = window.__GARAGE_DRESSING_PROBE;
  return {
    atMs: performance.now(), selected: stats?.selected ?? null, built: stats?.built ?? null,
    exhibitCount: stats?.exhibitCount ?? null,
    sharedMaintenanceBayCount: stats?.sharedMaintenanceBayCount ?? null,
    buildTimings: stats?.buildTimings ?? null,
    workshopTransferTimings: stats?.workshopTransferTimings ?? null,
    graphicsDiagnostics: gl ? { rescue: gl.rescue ?? null, errors: Array.from(gl.errors || []).map(String) } : null,
    frames: frames ? { startedAtMs: frames.started, worstGap: frames.worstGap,
      count: frames.gaps.length, running: frames.running } : null,
  };
}

/** Same profiler/clock/drain ownership as the real-action probe. No warmup. */
export async function withGarageWorkshopProfile(options, work) {
  if (!options.enabled) return work();
  const endpoints = { before: null, after: null };
  return withGarageActionProfile({
    ...options, action: 'workshop-streaming',
    onProfile: (profile, capture) => options.onProfile(profile, {
      ...capture, endpoints,
      scope: 'Initial post-selector workshop-completion interval only; excludes later switches, screenshots and forced GC.',
      caveat: 'Frame gaps and async build elapsed times are not CPU attribution; inspect the retained profile and clock brackets.',
    }),
  }, async () => {
    endpoints.before = await options.page.evaluate(readGarageWorkshopEndpoint);
    try { return await work(); }
    finally {
      // Keep the original work/profile error if the page disappears. The
      // profiler's finally must still drain and save whatever was captured.
      endpoints.after = await options.page.evaluate(readGarageWorkshopEndpoint)
        .catch(error => ({ captureError: String(error) }));
    }
  });
}
