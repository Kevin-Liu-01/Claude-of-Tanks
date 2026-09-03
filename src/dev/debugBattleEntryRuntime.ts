import type { RuntimeValue } from '../runtimeTypes.ts';
export interface DebugBattleEntryOptions {
  getPendingMapId(): string;
  resolveMapId(mapId: string): string;
  ensureFullFleet(): Promise<RuntimeValue>;
  ensureWorld(mapId: string): Promise<RuntimeValue>;
  preloadSoloAuthority(): Promise<RuntimeValue>;
  preloadBattleClient(): Promise<RuntimeValue>;
  ensureBattleHud(): Promise<RuntimeValue>;
  ensureTouchControls(): Promise<RuntimeValue>;
  preloadArmorAim(): Promise<RuntimeValue>;
  ensureFx(): Promise<RuntimeValue>;
  ensureKillcam(): Promise<RuntimeValue>;
  preloadBattleWarm(): Promise<RuntimeValue>;
  preloadBattleStart(): Promise<RuntimeValue>;
  prepareWorldServices(): void;
  startBattle(
    specId: string,
    mapId: string,
    options: Readonly<Record<string, RuntimeValue>>,
  ): Promise<RuntimeValue> | RuntimeValue;
}

/**
 * Acquire the deliberately exhaustive engineering battle path.
 *
 * Player entry remains exact-roster and covered by its own loading owner.
 * This QA path intentionally loads the complete fleet so broad browser probes
 * can switch vehicles without another transfer. All independent acquisitions
 * run concurrently, then world services are attached exactly once before the
 * battle start transaction.
 */
export async function startDebugBattle(
  ports: DebugBattleEntryOptions,
  specId: string,
  mapId: string | null = null,
  options: Readonly<Record<string, RuntimeValue>> = {},
): Promise<RuntimeValue> {
  const required = [ports?.getPendingMapId, ports?.resolveMapId,
    ports?.ensureFullFleet, ports?.ensureWorld, ports?.preloadSoloAuthority,
    ports?.preloadBattleClient, ports?.ensureBattleHud,
    ports?.ensureTouchControls, ports?.preloadArmorAim, ports?.ensureFx,
    ports?.ensureKillcam, ports?.preloadBattleWarm, ports?.preloadBattleStart,
    ports?.prepareWorldServices, ports?.startBattle];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('debug battle entry requires every acquisition port');
  }

  const resolvedMapId = ports.resolveMapId(mapId || ports.getPendingMapId());
  await Promise.all([
    ports.ensureFullFleet(),
    ports.ensureWorld(resolvedMapId),
    ports.preloadSoloAuthority(),
    ports.preloadBattleClient(),
    ports.ensureBattleHud(),
    ports.ensureTouchControls(),
    ports.preloadArmorAim(),
    ports.ensureFx(),
    ports.ensureKillcam(),
    ports.preloadBattleWarm(),
    ports.preloadBattleStart(),
  ]);
  ports.prepareWorldServices();
  return ports.startBattle(specId, resolvedMapId, options);
}
