export interface DebugBattleEntryOptions {
  getPendingMapId(): string;
  resolveMapId(mapId: string): string;
  ensureFullFleet(): Promise<unknown>;
  ensureWorld(mapId: string): Promise<unknown>;
  preloadSoloAuthority(): Promise<unknown>;
  preloadBattleClient(): Promise<unknown>;
  ensureBattleHud(): Promise<unknown>;
  ensureTouchControls(): Promise<unknown>;
  preloadArmorAim(): Promise<unknown>;
  ensureFx(): Promise<unknown>;
  ensureKillcam(): Promise<unknown>;
  preloadBattleWarm(): Promise<unknown>;
  preloadBattleStart(): Promise<unknown>;
  prepareWorldServices(): void;
  startBattle(
    specId: string,
    mapId: string,
    options: Readonly<Record<string, unknown>>,
  ): Promise<unknown> | unknown;
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
  options: Readonly<Record<string, unknown>> = {},
): Promise<unknown> {
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
