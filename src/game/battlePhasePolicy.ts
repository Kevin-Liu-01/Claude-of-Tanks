export interface BattlePhasePolicyOptions {
  getPhase(): string;
  hasResult(): boolean;
  hasControllablePlayer(): boolean;
  isKillcamActive(): boolean;
  isBattleLoadVisible(): boolean;
}

export interface PointerRecaptureState {
  settingsOpen: boolean;
  spectating: boolean;
}

export interface BattlePhasePolicy {
  isBattle(): boolean;
  isGarage(): boolean;
  canOpenBattleSettings(): boolean;
  canLeaveBattle(): boolean;
  isPauseEligible(): boolean;
  isBattleStageVisible(): boolean;
  canRecapturePointer(state: PointerRecaptureState): boolean;
  shouldPresentDisconnect(): boolean;
}

/**
 * One synchronous source of truth for phase-sensitive browser policy. Keeping
 * these predicates together prevents settings, pointer lock, networking, and
 * frame pacing from quietly assigning different meanings to a live battle.
 */
export function createBattlePhasePolicy(
  options: BattlePhasePolicyOptions,
): BattlePhasePolicy {
  const {
    getPhase,
    hasResult,
    hasControllablePlayer,
    isKillcamActive,
    isBattleLoadVisible,
  } = options;
  if ([getPhase, hasResult, hasControllablePlayer, isKillcamActive,
    isBattleLoadVisible].some((entry) => typeof entry !== 'function')) {
    throw new TypeError('battle phase policy requires every state reader');
  }

  const isBattle = (): boolean => getPhase() === 'battle';
  const isGarage = (): boolean => getPhase() === 'garage';
  const hasLivePlayer = (): boolean => (
    isBattle() && !hasResult() && hasControllablePlayer()
  );

  return Object.freeze({
    isBattle,
    isGarage,
    canOpenBattleSettings: hasLivePlayer,
    canLeaveBattle: isBattle,
    isPauseEligible: () => isBattle() && !hasResult() && !isKillcamActive(),
    isBattleStageVisible: () => isBattle() && !isBattleLoadVisible(),
    canRecapturePointer: ({ settingsOpen, spectating }: PointerRecaptureState) => (
      hasLivePlayer() && !settingsOpen && !isKillcamActive() && !spectating
    ),
    shouldPresentDisconnect: () => isBattle() && !hasResult(),
  });
}
