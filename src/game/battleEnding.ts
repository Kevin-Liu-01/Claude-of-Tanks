/**
 * battleEnding.ts — the battle-ending director (pure state machine, Node-testable).
 *
 * Owner 2026-09-25: "for the final kill in a battle, in regular it just ends instead of showing a final kill
 * cam or something. handle battle ends better and consider all modes." Every verdict now closes with a beat
 * chosen here from the mode, the verdict reason and the facts the director observed during the battle:
 *
 *   elimination (any mode, any result)      the final-kill replay whoever fired it (killcam.playForResult with
 *                                           finalKill), else an orbit of the last wreck, else a pull-back
 *   time_limit (victory / defeat / draw)    "time's up": the HUD clock flashes and the camera pulls back over
 *                                           the player's tank for ENDING_BEAT_S
 *   flag_limit / score_limit / goal_limit   an orbit of the deciding objective — the flag base the last capture
 *                                           ran to, the zone the winner took last (or holds strongest), the
 *                                           goal the ball entered — the player's tank when unknown
 *   horde_overrun                           the player's last stand: the death replay, else the wreck orbit;
 *                                           the wave milestone reaches the report
 *   line_held / assault_overrun             the overview of the line's last sector (the death replay first
 *                                           when the assault fell with the player)
 *   network_disconnect                      no beat (the report explains the interruption)
 *   anything else                           a pull-back over the player — never a bare cut
 *
 * The director owns timing and the skip; the presentation runtime drives it and a browser camera module
 * turns the plan into rig poses. Draw endings get the time's-up or objective beat like any other verdict.
 */
import type { ObjectiveStateView } from '../ui/minimapObjectives.ts';

type BattleEndingResult = 'victory' | 'defeat' | 'draw';
export type BattleEndingBeat =
  | 'finalKill' | 'lastStand' | 'timesUp' | 'objective' | 'lineOverview' | 'wreckOrbit' | 'pullBack' | 'none';
type CameraBeat = Exclude<BattleEndingBeat, 'finalKill' | 'lastStand'>;
type EndingFocusKind = 'player' | 'objective' | 'sector' | 'wreck';
type ObjectiveTeam = 'alpha' | 'bravo';

export interface EndingFocus {
  kind: EndingFocusKind;
  x: number;
  z: number;
  /** World height when the mode state carries one (zones, goals, bases); the camera samples terrain otherwise. */
  y: number | null;
  /** Radius the beat frames (capture reach, goal mouth, a hull). */
  radiusM: number;
  id: string | null;
}

interface EndingCaption {
  key: string;
  values?: Record<string, string>;
}

export interface BattleEndingPlan {
  beat: BattleEndingBeat;
  /** The killcam is asked first when set (the replay is the beat); `fallback` is the camera beat otherwise. */
  replay: { finalKill: boolean } | null;
  fallback: CameraBeat;
  /** Camera beat length; the killcam owns its own timing. */
  durationS: number;
  focus: EndingFocus | null;
  caption: EndingCaption | null;
  /** The HUD clock flashes (time's up). */
  clockFlash: boolean;
  /** Every beat ends early on any key / click, as the killcam does. */
  skippable: true;
}

interface BattleEndingVerdict {
  result: BattleEndingResult;
  reason: string | null;
  /** Game mode id (matchModes.ts); unknown ids read as Standard. */
  mode: string | null;
  playerDestroyed: boolean;
  /** The player's hull position (pull-back / last-stand focus). */
  player: { x: number; z: number; y?: number | null } | null;
}

interface DestroyedFact {
  id: string;
  x: number;
  z: number;
  y: number | null;
  cause: string;
}

/** What the director remembered from the bus (mode events and destructions) before the verdict. */
interface EndingFacts {
  lastFlagTeam: ObjectiveTeam | null;
  lastZone: { zoneId: string | null; team: ObjectiveTeam | null } | null;
  lastGoalTeam: ObjectiveTeam | null;
  lastDestroyed: DestroyedFact | null;
  wave: number | null;
}

export interface BattleEndingDirector {
  /** Feed the bus: mode:* events and tank:destroyed; anything else is ignored. */
  observe(type: string, payload: unknown): void;
  readonly facts: EndingFacts;
  plan(verdict: BattleEndingVerdict, modeState: ObjectiveStateView | null | undefined): BattleEndingPlan;
  /** Start a camera beat's clock. */
  begin(plan: BattleEndingPlan, nowMs: number): void;
  /** 0..1 through the running beat (1 once skipped or elapsed). */
  progress(nowMs: number): number;
  finished(nowMs: number): boolean;
  skip(): void;
  end(): void;
  readonly active: boolean;
  readonly current: BattleEndingPlan | null;
  reset(): void;
}

/** Every camera beat runs this long (owner brief: 2.5 s pull-back / orbit). */
export const ENDING_BEAT_S = 2.5;
const HULL_RADIUS_M = 6;
const FLAG_BASE_RADIUS_M = 18;
const ZONE_RADIUS_M = 24;
const GOAL_RADIUS_M = 20;
const SECTOR_RADIUS_M = 30;

const emptyFacts = (): EndingFacts => ({
  lastFlagTeam: null, lastZone: null, lastGoalTeam: null, lastDestroyed: null, wave: null,
});

const asTeam = (value: unknown): ObjectiveTeam | null => (value === 'alpha' || value === 'bravo' ? value : null);
const otherTeam = (team: ObjectiveTeam): ObjectiveTeam => (team === 'alpha' ? 'bravo' : 'alpha');
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function focusAt(kind: EndingFocusKind, x: number, z: number, y: number | null, radiusM: number, id: string | null = null): EndingFocus {
  return { kind, x, z, y, radiusM, id };
}

function playerFocus(verdict: BattleEndingVerdict): EndingFocus | null {
  const p = verdict.player;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  return focusAt('player', p.x, p.z, finite(p.y), HULL_RADIUS_M);
}

function wreckFocus(verdict: BattleEndingVerdict, facts: EndingFacts): EndingFocus | null {
  const wreck = facts.lastDestroyed;
  if (wreck) return focusAt('wreck', wreck.x, wreck.z, wreck.y, HULL_RADIUS_M, wreck.id);
  return playerFocus(verdict);
}

function winnerTeam(verdict: BattleEndingVerdict, modeState: ObjectiveStateView | null | undefined): ObjectiveTeam | null {
  const perspective: ObjectiveTeam = modeState?.perspectiveTeam === 'bravo' ? 'bravo' : 'alpha';
  if (verdict.result === 'victory') return perspective;
  if (verdict.result === 'defeat') return otherTeam(perspective);
  return null;
}

/** The base the last capture ran home to: the capturing team's own base. */
function flagFocus(
  verdict: BattleEndingVerdict, modeState: ObjectiveStateView | null | undefined, facts: EndingFacts,
): EndingFocus | null {
  const team = facts.lastFlagTeam ?? winnerTeam(verdict, modeState);
  const flag = team ? (modeState?.flags || []).find((entry) => entry.team === team) : null;
  if (!flag) return null;
  return focusAt('objective', flag.baseX, flag.baseZ, finite((flag as { baseY?: number }).baseY), FLAG_BASE_RADIUS_M, `flag:${team}`);
}

/** The zone the winner took last, else the winner's strongest hold, else any zone. */
function zoneFocus(
  verdict: BattleEndingVerdict, modeState: ObjectiveStateView | null | undefined, facts: EndingFacts,
): EndingFocus | null {
  const zones = modeState?.zones || [];
  if (!zones.length) return null;
  const winner = winnerTeam(verdict, modeState);
  const zoneById = (id: string | null | undefined) => (id == null ? null : zones.find((zone) => zone.id === id) ?? null);
  const last = facts.lastZone && (!winner || facts.lastZone.team === winner) ? zoneById(facts.lastZone.zoneId) : null;
  let zone = last;
  if (!zone && winner) {
    for (const candidate of zones) {
      if (candidate.owner !== winner) continue;
      if (!zone || Math.abs(candidate.control) > Math.abs(zone.control)) zone = candidate;
    }
  }
  if (!zone) zone = zones[0];
  return focusAt('objective', zone.x, zone.z, finite((zone as { y?: number }).y), ZONE_RADIUS_M, zone.id ?? null);
}

/** The goal the ball entered: the goal that belongs to the team scored against. */
function goalFocus(
  verdict: BattleEndingVerdict, modeState: ObjectiveStateView | null | undefined, facts: EndingFacts,
): EndingFocus | null {
  const goals = modeState?.goals || [];
  if (!goals.length) return null;
  const scoring = facts.lastGoalTeam ?? winnerTeam(verdict, modeState);
  const goal = (scoring ? goals.find((entry) => entry.team !== scoring) : null) ?? goals[0];
  return focusAt('objective', goal.x, goal.z, finite((goal as { y?: number }).y), GOAL_RADIUS_M, `goal:${goal.team}`);
}

/** The line's last sector: the final one when held, the active one when the assault fell. */
function sectorFocus(modeState: ObjectiveStateView | null | undefined, held: boolean): EndingFocus | null {
  const zones = modeState?.zones || [];
  if (!zones.length) return null;
  const taken = Math.max(0, Math.floor(modeState?.line?.index ?? 0));
  const index = held ? zones.length - 1 : Math.min(zones.length - 1, taken);
  const zone = zones[index];
  return focusAt('sector', zone.x, zone.z, finite((zone as { y?: number }).y), SECTOR_RADIUS_M, zone.id ?? String(index + 1));
}

function cameraPlan(
  beat: CameraBeat, focus: EndingFocus | null, caption: EndingCaption | null, clockFlash = false,
): BattleEndingPlan {
  return {
    beat, replay: null, fallback: beat, durationS: beat === 'none' ? 0 : ENDING_BEAT_S,
    focus, caption, clockFlash, skippable: true,
  };
}

function replayPlan(
  beat: 'finalKill' | 'lastStand', finalKill: boolean, fallback: CameraBeat, focus: EndingFocus | null,
  caption: EndingCaption | null,
): BattleEndingPlan {
  return {
    beat, replay: { finalKill }, fallback, durationS: fallback === 'none' ? 0 : ENDING_BEAT_S,
    focus, caption, clockFlash: false, skippable: true,
  };
}

/** A camera beat needs somewhere to look; without a focus it degrades to the pull-back, then to nothing. */
function withFocus(plan: BattleEndingPlan, verdict: BattleEndingVerdict): BattleEndingPlan {
  if (plan.focus || (plan.beat === 'none' && plan.fallback === 'none')) return plan;
  const player = playerFocus(verdict);
  if (!player) {
    return { ...plan, beat: plan.replay ? plan.beat : 'none', fallback: 'none', durationS: 0, focus: null, clockFlash: false };
  }
  const fallback: CameraBeat = plan.replay ? 'pullBack' : plan.fallback === 'none' ? 'none' : 'pullBack';
  return { ...plan, beat: plan.replay ? plan.beat : fallback, fallback, focus: player };
}

export function planBattleEnding(
  verdict: BattleEndingVerdict,
  modeState: ObjectiveStateView | null | undefined,
  facts: EndingFacts = emptyFacts(),
): BattleEndingPlan {
  const reason = verdict.reason || 'elimination';
  const wave = facts.wave ?? (modeState as { horde?: { wave?: number } | null } | null | undefined)?.horde?.wave ?? null;
  let plan: BattleEndingPlan;
  switch (reason) {
    case 'network_disconnect':
      plan = cameraPlan('none', null, null);
      break;
    case 'elimination':
      plan = replayPlan('finalKill', true, facts.lastDestroyed ? 'wreckOrbit' : 'pullBack',
        wreckFocus(verdict, facts), { key: 'ending.finalBlow' });
      break;
    case 'time_limit':
      plan = cameraPlan('timesUp', playerFocus(verdict), { key: 'ending.timesUp' }, true);
      break;
    case 'flag_limit':
      plan = cameraPlan('objective', flagFocus(verdict, modeState, facts), { key: 'ending.flagCaptured' });
      break;
    case 'score_limit':
      plan = cameraPlan('objective', zoneFocus(verdict, modeState, facts), { key: 'ending.scoreReached' });
      break;
    case 'goal_limit':
      plan = cameraPlan('objective', goalFocus(verdict, modeState, facts), { key: 'ending.winningGoal' });
      break;
    case 'horde_overrun':
      plan = replayPlan('lastStand', false, 'wreckOrbit', wreckFocus(verdict, facts),
        { key: 'ending.lastStand', values: { wave: String(Math.max(1, Math.floor(wave ?? 1))) } });
      break;
    case 'line_held':
      plan = cameraPlan('lineOverview', sectorFocus(modeState, true), { key: 'ending.lineHeld' });
      break;
    case 'assault_overrun':
      plan = replayPlan('lastStand', false, 'lineOverview', sectorFocus(modeState, false), { key: 'ending.lineLost' });
      break;
    default:
      plan = cameraPlan('pullBack', playerFocus(verdict), { key: 'ending.battleOver' });
  }
  return withFocus(plan, verdict);
}

/** The camera beat that actually runs once the killcam answered: the replay itself needs no camera beat. */
export function resolveCameraBeat(plan: BattleEndingPlan, replayPlayed: boolean): { beat: CameraBeat | 'replay'; durationS: number } {
  if (plan.replay && replayPlayed) return { beat: 'replay', durationS: 0 };
  const beat = plan.replay ? plan.fallback : (plan.beat as CameraBeat);
  return { beat, durationS: beat === 'none' ? 0 : plan.durationS };
}

export function createBattleEndingDirector(): BattleEndingDirector {
  let facts = emptyFacts();
  let current: BattleEndingPlan | null = null;
  let startMs = 0;
  let endMs = 0;
  let skipped = false;

  const record = (payload: unknown): Record<string, unknown> =>
    (payload && typeof payload === 'object' ? payload as Record<string, unknown> : {});

  return {
    observe(type, payload) {
      const p = record(payload);
      switch (type) {
        case 'mode:flag_captured': facts.lastFlagTeam = asTeam(p.team); break;
        case 'mode:zone_captured':
          facts.lastZone = { zoneId: typeof p.zoneId === 'string' ? p.zoneId : null, team: asTeam(p.team) };
          break;
        case 'mode:goal_scored': facts.lastGoalTeam = asTeam(p.team); break;
        case 'mode:wave_started': facts.wave = finite(p.wave) ?? facts.wave; break;
        case 'tank:destroyed': {
          const pos = Array.isArray(p.pos) ? p.pos as unknown[] : null;
          const x = pos ? finite(pos[0]) : null;
          const z = pos ? finite(pos[2]) : null;
          if (typeof p.id === 'string' && x != null && z != null) {
            facts.lastDestroyed = {
              id: p.id, x, z, y: pos ? finite(pos[1]) : null, cause: typeof p.cause === 'string' ? p.cause : 'shot',
            };
          }
          break;
        }
        default: break;
      }
    },
    get facts() { return facts; },
    plan(verdict, modeState) { return planBattleEnding(verdict, modeState, facts); },
    begin(plan, nowMs) {
      current = plan;
      startMs = nowMs;
      endMs = nowMs + plan.durationS * 1000;
      skipped = false;
    },
    progress(nowMs) {
      if (!current) return 1;
      if (skipped || endMs <= startMs) return 1;
      return Math.max(0, Math.min(1, (nowMs - startMs) / (endMs - startMs)));
    },
    finished(nowMs) { return !current || skipped || nowMs >= endMs; },
    skip() { if (current) skipped = true; },
    end() { current = null; skipped = false; },
    get active() { return current !== null; },
    get current() { return current; },
    reset() {
      facts = emptyFacts();
      current = null;
      skipped = false;
    },
  };
}
