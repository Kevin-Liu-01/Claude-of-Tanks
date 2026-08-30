import {
  createCombatTelemetry,
  type CombatTelemetryOptions,
} from './combatTelemetry.ts';
import {
  installDebugSurface,
  type DebugSurfaceDependencies,
} from './debugSurface.ts';

interface PerfHudDiagnosticsPort {
  preload(): Promise<unknown>;
  setVisible(visible: boolean): void;
}

interface MainDiagnosticsInstallers {
  createTelemetry(options: CombatTelemetryOptions): unknown;
  installSurface(options: DebugSurfaceDependencies): unknown;
}

export interface MainDiagnosticsRuntimeOptions {
  telemetry: CombatTelemetryOptions;
  debugSurface: DebugSurfaceDependencies;
  perfHud: PerfHudDiagnosticsPort;
  showDebugHud: boolean;
  warn?: (message: string, error: unknown) => void;
  installers?: MainDiagnosticsInstallers;
}

/**
 * Install the complete engineering surface behind one demand-loaded boundary.
 * Player boot never imports this module; explicit QA sessions retain telemetry
 * even when the optional HUD chunk fails to load.
 */
export async function installMainDiagnosticsRuntime({
  telemetry,
  debugSurface,
  perfHud,
  showDebugHud,
  warn = (message, error) => console.warn(message, error),
  installers = {
    createTelemetry: createCombatTelemetry,
    installSurface: installDebugSurface,
  },
}: MainDiagnosticsRuntimeOptions): Promise<void> {
  installers.createTelemetry(telemetry);

  await perfHud.preload().catch((error) => {
    warn('[diagnostics] optional engineering runtime failed to load', error);
  });

  if (showDebugHud) perfHud.setVisible(true);
  installers.installSurface(debugSurface);
}
