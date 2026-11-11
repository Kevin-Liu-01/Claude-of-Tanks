/**
 * The audio engine's battle mode (2026-11-02 audit F11): one declared state and one transition function, shared by
 * the engine (audioEngine.ts) and the lazy facade (lazyAudio.ts, which carries it across the mixer's deferred load).
 *
 * Stages: 'garage' (any phase but battle), 'loading' (a battle set up, before its rollout), 'live' (rolled out),
 * 'over' (the verdict is in) and 'presented' (the result screen has shown it). Paused and kill-cam are overlays on a
 * battle. Every bus fact that moves the mode goes through `stepAudioBattleMode`, which returns the edge it took, or
 * null for a move it ignores: a second rollout, a second verdict or a second presentation (a duplicated network
 * event), a rollout or a verdict outside a battle, and an overlay move that changes nothing or comes outside a battle
 * (a repeated kill-cam begin plays no second whoosh in, a done with no begin no whoosh out). Both layers build their
 * facts with `audioBattleFact`, so the engine and the lazy facade read a payload the same way. The kill-cam overlay's
 * fact is the replay's own flag (src/game/killcamScreen.ts, IR15), read at each edge and by the engine every frame, never
 * the edge itself. A battle phase edge always opens a new battle, from the garage or
 * from another battle (a network match's next round): its stage, overlays and verdict start afresh and `battle`
 * counts it, so anything scheduled for an older battle can tell it is stale.
 *
 * Pure and DOM-free (Node selftests run it under type stripping: no enums).
 */

export type AudioBattleStage = 'garage' | 'loading' | 'live' | 'over' | 'presented';
export type AudioBattleResult = 'victory' | 'defeat' | 'draw';

export interface AudioBattleMode {
  /** The last phase edge's name ('garage', 'battle', or any other the game raises). */
  phase: string;
  stage: AudioBattleStage;
  /** Battles entered so far (the current one's serial while in battle). */
  battle: number;
  /** The rollout has happened this battle (a verdict before it leaves this false). */
  rolledOut: boolean;
  /** The verdict is in ('over' or 'presented'). */
  over: boolean;
  /** This battle's verdict, once it is known. */
  result: AudioBattleResult | null;
  paused: boolean;
  killcam: boolean;
}

export type AudioBattleEvent =
  | { readonly kind: 'phase'; readonly phase: string }
  | { readonly kind: 'rollout'; readonly late: boolean }
  | { readonly kind: 'ended'; readonly result: AudioBattleResult | null }
  | { readonly kind: 'presented'; readonly result: AudioBattleResult | null }
  | { readonly kind: 'pause'; readonly on: boolean }
  | { readonly kind: 'killcam'; readonly on: boolean };

export type AudioBattleEdge =
  | 'enter-battle' | 'leave-battle' | 'phase'
  | 'rollout' | 'rollout-late' | 'ended' | 'presented' | 'pause' | 'killcam';

const RESULTS: ReadonlySet<string> = new Set(['victory', 'defeat', 'draw']);

/** A verdict from a bus payload, or null when it names none. */
export function audioBattleResult(value: unknown): AudioBattleResult | null {
  return typeof value === 'string' && RESULTS.has(value) ? value as AudioBattleResult : null;
}

/** A mode at a phase (a mixer adopted mid-battle starts in that battle's loading stage). */
export function createAudioBattleMode(phase = 'garage'): AudioBattleMode {
  const mode: AudioBattleMode = {
    phase: 'garage', stage: 'garage', battle: 0, rolledOut: false, over: false, result: null, paused: false, killcam: false,
  };
  if (phase !== 'garage') stepAudioBattleMode(mode, { kind: 'phase', phase });
  return mode;
}

/** A copy of a mode (the facade hands its tracked state to the mixer it creates). */
export function copyAudioBattleMode(mode: Readonly<AudioBattleMode>): AudioBattleMode {
  return {
    phase: mode.phase, stage: mode.stage, battle: mode.battle, rolledOut: mode.rolledOut, over: mode.over,
    result: mode.result, paused: mode.paused, killcam: mode.killcam,
  };
}

function inBattle(mode: AudioBattleMode): boolean {
  return mode.stage !== 'garage';
}

/** Apply one bus fact to the mode, in place. Returns the edge taken, or null when the move is ignored. */
export function stepAudioBattleMode(mode: AudioBattleMode, event: AudioBattleEvent): AudioBattleEdge | null {
  switch (event.kind) {
    case 'phase': {
      const next = event.phase || 'garage';
      const wasBattle = inBattle(mode);
      mode.phase = next;
      // Leaving a battle, or opening a new one, never carries a pause, a kill-cam or a verdict along.
      if (next === 'battle' || wasBattle) {
        mode.paused = false;
        mode.killcam = false;
        mode.rolledOut = false;
        mode.over = false;
        mode.result = null;
      }
      if (next === 'battle') {
        mode.stage = 'loading';
        mode.battle++;
        return 'enter-battle';
      }
      mode.stage = 'garage';
      return wasBattle ? 'leave-battle' : 'phase';
    }
    case 'rollout':
      if (mode.stage !== 'loading') return null;
      mode.stage = 'live';
      mode.rolledOut = true;
      return event.late ? 'rollout-late' : 'rollout';
    case 'ended':
      if (mode.stage !== 'loading' && mode.stage !== 'live') return null;
      mode.stage = 'over';
      mode.over = true;
      mode.result = event.result ?? 'draw';
      return 'ended';
    case 'presented':
      // Shown once a battle; a presentation that arrives without its verdict carries the verdict itself.
      if (!inBattle(mode) || mode.stage === 'presented') return null;
      mode.stage = 'presented';
      mode.over = true;
      mode.result = event.result ?? mode.result ?? 'draw';
      return 'presented';
    case 'pause':
      if (!inBattle(mode) || mode.paused === !!event.on) return null;
      mode.paused = !!event.on;
      return 'pause';
    case 'killcam':
      if (!inBattle(mode) || mode.killcam === !!event.on) return null;
      mode.killcam = !!event.on;
      return 'killcam';
    default:
      return null;
  }
}

/** The bus events whose payloads are battle-mode facts (the engine and the lazy facade subscribe to these). */
export const AUDIO_BATTLE_FACT_EVENTS: readonly string[] = Object.freeze([
  'phase:change', 'battle:rollout', 'battle:ended', 'battle:presented', 'ui:pause', 'killcam:begin', 'killcam:done',
]);

/**
 * The battle-mode fact a bus event carries, or null for an event that carries none. A phase edge with no phase names the
 * garage. A kill-cam edge carries no state of its own: its fact is `killcamLive()`, the replay controller's flag read at
 * the edge, so a repeated begin, a stale done or a done whose begin was never heard sets nothing wrong.
 */
export function audioBattleFact(event: string, payload: unknown, killcamLive: () => boolean): AudioBattleEvent | null {
  const p = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  switch (event) {
    case 'phase:change': return { kind: 'phase', phase: typeof p.phase === 'string' && p.phase ? p.phase : 'garage' };
    case 'battle:rollout': return { kind: 'rollout', late: !!p.late };
    case 'battle:ended': return { kind: 'ended', result: audioBattleResult(p.result) };
    case 'battle:presented': return { kind: 'presented', result: audioBattleResult(p.result) };
    case 'ui:pause': return { kind: 'pause', on: !!p.on };
    case 'killcam:begin':
    case 'killcam:done': return { kind: 'killcam', on: killcamLive() };
    default: return null;
  }
}
