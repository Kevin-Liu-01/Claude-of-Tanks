export interface PerfHudRuntime {
  update(dtMs: number): void;
  toggle(): void;
  setTelemetryProvider(provider: (() => unknown) | null): void;
  setCaptureHidden(hidden: boolean): void;
  stats(): unknown;
  snapshot(): unknown;
}

export interface DebugTelemetryRuntime {
  collect(): Record<string, unknown>;
  sampleShadowContribution(): Promise<Record<string, unknown>>;
}

export interface PerfDiagnosticsRuntime {
  hud: PerfHudRuntime;
  telemetry: DebugTelemetryRuntime;
}

export interface PerfDiagnosticsFacade extends PerfHudRuntime {
  preload(): Promise<PerfDiagnosticsRuntime>;
  isReady(): boolean;
  collectTelemetry(): Record<string, unknown> | null;
  sampleShadowContribution(): Promise<Record<string, unknown>>;
}

/**
 * Stable zero-work facade for the engineering dashboard. Ordinary players do
 * not transfer or construct diagnostics; explicit QA/automation can acquire
 * the exact existing HUD and telemetry owner through one retryable request.
 */
export function createPerfDiagnosticsAccess(
  load: () => Promise<PerfDiagnosticsRuntime>,
): PerfDiagnosticsFacade {
  if (typeof load !== 'function') throw new TypeError('performance diagnostics require a loader');

  let runtime: PerfDiagnosticsRuntime | null = null;
  let pending: Promise<PerfDiagnosticsRuntime> | null = null;
  let captureHidden = false;
  let telemetryProvider: (() => unknown) | null = null;

  const preload = (): Promise<PerfDiagnosticsRuntime> => {
    if (runtime) return Promise.resolve(runtime);
    if (pending) return pending;
    const request = load().then((loaded) => {
      runtime = loaded;
      pending = null;
      loaded.hud.setCaptureHidden(captureHidden);
      if (telemetryProvider) loaded.hud.setTelemetryProvider(telemetryProvider);
      return loaded;
    });
    pending = request;
    request.catch(() => {
      if (pending === request) pending = null;
    });
    return request;
  };

  return {
    preload,
    isReady: () => runtime !== null,
    update: (dtMs) => runtime?.hud.update(dtMs),
    toggle: () => { runtime?.hud.toggle(); },
    setTelemetryProvider(provider) {
      telemetryProvider = typeof provider === 'function' ? provider : null;
      runtime?.hud.setTelemetryProvider(telemetryProvider);
    },
    setCaptureHidden(hidden) {
      captureHidden = !!hidden;
      runtime?.hud.setCaptureHidden(captureHidden);
    },
    stats: () => runtime?.hud.stats() ?? null,
    snapshot: () => runtime?.hud.snapshot() ?? { stats: null, telemetry: null },
    collectTelemetry: () => runtime?.telemetry.collect() ?? null,
    sampleShadowContribution: () => runtime?.telemetry.sampleShadowContribution()
      ?? Promise.resolve({ skipped: true, reason: 'diagnostics_not_loaded' }),
  };
}
