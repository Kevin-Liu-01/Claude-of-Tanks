/**
 * killcamSelection.ts — which captured lethal chain the end-of-battle replay shows (pure, Node-testable).
 *
 * Battle endings (owner 2026-09-25: "for the final kill in a battle, in regular it just ends instead of
 * showing a final kill cam"): the killcam keeps four facts — the player's own lethal chain (pendingDeath), the
 * last hit the player took (a burn-out shows the shell that lit it), the player's last kill (pendingVictory)
 * and, new, the last lethal chain on ANY tank whoever fired (lastLethal) plus the last hit every tank took and
 * the last destruction. This module decides, from the verdict and those facts, what plays:
 *
 *   defeat  — the player's own death when it is what just happened (or nothing else decided the battle);
 *             otherwise, when the caller asks for the final kill, the last lethal chain from the shooter's
 *             side; a stale own death or the player's burn-out x-ray as the last resort.
 *   victory — the player's own final blow when it is fresh (the existing replay); otherwise the final kill,
 *             whoever fired it (an ally's shell, a bot's ram, a burn-out's lighting shell).
 *   draw    — a fresh own death, else the final kill.
 *
 * Nothing here touches the scene: the killcam hands the chosen snapshot to its playback exactly as before.
 */

export type ReplayResult = 'victory' | 'defeat' | 'draw';
type ReplayPlaybackKind = 'death' | 'victory' | 'final';
type ReplaySelectionSource =
  | 'playerDeath' | 'playerBurnOut' | 'playerKill' | 'finalKill' | 'finalBurnOut';

/** The last destruction the killcam observed (tank:destroyed), whatever the cause. */
export interface DestroyedRecord {
  id: string;
  cause: string;
  timeS: number;
  killerId: string | null;
}

interface ReplaySelectionInput<S> {
  result: ReplayResult;
  /** Current sim time (freshness gates). */
  timeS: number;
  /** The caller wants the battle-deciding kill whoever fired it (elimination endings). */
  finalKill: boolean;
  /** False once the player's own death already replayed mid-battle: never the same death twice. */
  allowOwnDeath?: boolean;
  playerId: string | null;
  pendingDeath: S | null;
  lastHitOnPlayer: S | null;
  pendingVictory: S | null;
  lastLethal: S | null;
  lastDestroyed: DestroyedRecord | null;
  lastHitOn(targetId: string): S | null;
  timeOf(snap: S): number;
}

interface ReplaySelection<S> {
  snap: S;
  kind: ReplayPlaybackKind;
  /** No shell chain to fly: the x-ray of the hit that lit the fire. */
  xrayOnly: boolean;
  source: ReplaySelectionSource;
}

/** The player's own final blow must be this fresh at the verdict (killcam_endscreen r1). */
export const VICTORY_WINDOW_S = 1.0;
/** The battle-deciding kill lands in the verdict's own step; a second of slack covers a burn-out's tick. */
export const FINAL_KILL_WINDOW_S = 1.0;
/** An own death this recent is still the player's story: it wins over any other final kill. */
export const PLAYER_DEATH_PRIORITY_S = 6.0;

export function selectResultReplay<S>(raw: ReplaySelectionInput<S>): ReplaySelection<S> | null {
  const input = raw.allowOwnDeath === false ? { ...raw, pendingDeath: null, lastHitOnPlayer: null } : raw;
  const { result, timeS, finalKill, playerId } = input;
  const fresh = (snap: S | null, windowS: number): snap is S =>
    !!snap && timeS - input.timeOf(snap) <= windowS + 1e-9;
  const death = (snap: S, xrayOnly: boolean, source: ReplaySelectionSource): ReplaySelection<S> =>
    ({ snap, kind: 'death', xrayOnly, source });

  const finalKillSelection = (): ReplaySelection<S> | null => {
    if (!finalKill) return null;
    if (fresh(input.lastLethal, FINAL_KILL_WINDOW_S)) {
      return { snap: input.lastLethal, kind: 'final', xrayOnly: false, source: 'finalKill' };
    }
    const destroyed = input.lastDestroyed;
    if (destroyed && timeS - destroyed.timeS <= FINAL_KILL_WINDOW_S + 1e-9) {
      const lit = input.lastHitOn(destroyed.id);
      if (lit) return { snap: lit, kind: 'final', xrayOnly: true, source: 'finalBurnOut' };
    }
    return null;
  };

  if (result === 'defeat') {
    const ownDeathFresh = fresh(input.pendingDeath, PLAYER_DEATH_PRIORITY_S);
    if (input.pendingDeath && (ownDeathFresh || !finalKill)) return death(input.pendingDeath, false, 'playerDeath');
    // the player burned out this moment: their own story, shown from the shell that lit it
    const burnedOut = !!(playerId && input.lastDestroyed && input.lastDestroyed.id === playerId
      && timeS - input.lastDestroyed.timeS <= PLAYER_DEATH_PRIORITY_S + 1e-9);
    if (burnedOut && input.lastHitOnPlayer) return death(input.lastHitOnPlayer, true, 'playerBurnOut');
    const final = finalKillSelection();
    if (final) return final;
    if (input.pendingDeath) return death(input.pendingDeath, false, 'playerDeath');
    if (input.lastHitOnPlayer) return death(input.lastHitOnPlayer, true, 'playerBurnOut');
    return null;
  }

  if (result === 'victory' && fresh(input.pendingVictory, VICTORY_WINDOW_S)) {
    return { snap: input.pendingVictory, kind: 'victory', xrayOnly: false, source: 'playerKill' };
  }
  if (result === 'draw' && fresh(input.pendingDeath, PLAYER_DEATH_PRIORITY_S)) {
    return death(input.pendingDeath, false, 'playerDeath');
  }
  return finalKillSelection();
}
