/**
 * battleBeats.ts — the battle's timeline on the end screen (the Premiere direction's 11-end-screen .beat).
 *
 * shotInfo.ts records the moments the report marks, each at its battle time: the player's first spot, each kill, each
 * objective taken or lost (a zone, a flag, a goal), each module the player lost and the player's death. The end
 * screen lays them on one line from the start to the result; layoutBeats() picks which carry a label so no two labels
 * meet. A watched battle (watch-mode-243) has no player's side: the log also keeps every kill and objective by the side
 * that made it, and layoutBeats() lays that battle line with the objectives first and the kills spread over the battle.
 * Node-runnable: no DOM, no clock of its own (the battle time comes in with the events and the HUD frame).
 *
 * Copyright © 2026 Kevin B. Liu.
 */
import { zoneLetter } from './minimapObjectives.ts';

export type BattleBeatKind = 'spot' | 'kill' | 'zone' | 'flag' | 'goal' | 'loss' | 'death';
export type BattleSide = 'alpha' | 'bravo';

export interface BattleBeat {
  /** Battle seconds. */
  readonly t: number;
  readonly kind: BattleBeatKind;
  /** An objective beat: the player's side took it (false: the enemy did). */
  readonly own?: boolean;
  /** kill: the victim's entity id; loss: the module id. */
  readonly id?: string;
  /** kill: the victim's vehicle. */
  readonly specId?: string;
  /** zone: the zone's letter. */
  readonly label?: string;
  /** A battle beat (battleList): the side that made it. */
  readonly side?: BattleSide;
}

export interface PlacedBeat extends BattleBeat {
  /** Position on the line, 0 (the start) to 1 (the result). */
  readonly x: number;
  readonly labelled: boolean;
  /** A labelled beat's room: the share of the line its label may span, to its nearest labelled neighbour or edge. */
  readonly room: number;
}

export interface BattleBeatLog {
  /** Battle seconds as last seen; only moves forward within a battle. */
  readonly nowS: number;
  /** Advance the clock from an event or a HUD frame that carries the battle time. */
  clock(timeS: number | null | undefined): void;
  /** The player's side for the mode's objective events ('alpha' unless the room seats the player in bravo). */
  setPerspective(team: string | null | undefined): void;
  spot(timeS?: number): void;
  kill(id: string, specId: string | null | undefined, timeS?: number): void;
  loss(moduleId: string, timeS?: number): void;
  death(timeS?: number): void;
  revive(): void;
  objective(kind: 'zone' | 'flag' | 'goal', team: string | null | undefined, zoneId?: string | null): void;
  /** Any tank destroyed, credited to the side that made the kill (a watched battle's line). */
  battleKill(id: string, specId: string | null | undefined, side: BattleSide | null, timeS?: number): void;
  list(): BattleBeat[];
  /** The battle's own beats, every side's kills and objectives, with no player in them. */
  battleList(): BattleBeat[];
  clear(): void;
}

/** A battle never keeps more than this many beats (the line shows nine at most). */
const MAX_BEATS = 48;
/** The battle line samples its kills over the whole battle, so it keeps more of them (a respawn mode's hundreds stop here). */
const MAX_BATTLE_BEATS = 512;
/** The beats the line draws, the result's mark not counted. */
const MAX_PLACED = 8;
/** The narrowest share of the line between two labels. */
const LABEL_GAP = 0.12;
/** Which beats keep a mark and a label first when the line is full. */
const PRIORITY: Readonly<Record<BattleBeatKind, number>> = Object.freeze({
  kill: 0, zone: 1, flag: 1, goal: 1, death: 2, loss: 3, spot: 4,
});

const finite = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

/** The zone's letter from its sim id (`zone-2` -> B); other objectives carry no letter. */
function zoneLabel(zoneId: string | null | undefined): string | null {
  const match = /^zone-(\d+)$/.exec(zoneId ?? '');
  return match ? zoneLetter(Number(match[1]) - 1) : null;
}

export function createBattleBeatLog(): BattleBeatLog {
  const beats: BattleBeat[] = [];
  const battle: BattleBeat[] = [];
  const lost = new Set<string>();
  let nowS = 0;
  let spotted = false;
  let perspective = 'alpha';

  const at = (timeS?: number): number => {
    if (finite(timeS) && timeS > nowS) nowS = timeS;
    return finite(timeS) ? timeS : nowS;
  };
  const push = (beat: BattleBeat): void => {
    if (beats.length < MAX_BEATS) beats.push(beat);
  };

  return {
    get nowS() { return nowS; },
    clock(timeS) { if (finite(timeS) && timeS > nowS) nowS = timeS; },
    setPerspective(team) { perspective = team === 'bravo' ? 'bravo' : 'alpha'; },
    spot(timeS) {
      if (spotted) return;
      spotted = true;
      push({ t: at(timeS), kind: 'spot' });
    },
    kill(id, specId, timeS) {
      push({ t: at(timeS), kind: 'kill', id, ...(specId ? { specId } : {}) });
    },
    loss(moduleId, timeS) {
      if (!moduleId || lost.has(moduleId)) return;
      lost.add(moduleId);
      push({ t: at(timeS), kind: 'loss', id: moduleId });
    },
    death(timeS) { push({ t: at(timeS), kind: 'death' }); },
    revive() { lost.clear(); },
    objective(kind, team, zoneId) {
      if (team !== 'alpha' && team !== 'bravo') return;
      const label = kind === 'zone' ? zoneLabel(zoneId) : null;
      if (kind === 'zone' && !label) return;
      push({ t: nowS, kind, own: team === perspective, ...(label ? { label } : {}) });
      if (battle.length < MAX_BATTLE_BEATS) battle.push({ t: nowS, kind, side: team, ...(label ? { label } : {}) });
    },
    battleKill(id, specId, side, timeS) {
      const t = at(timeS);
      if (side && battle.length < MAX_BATTLE_BEATS) battle.push({ t, kind: 'kill', id, side, ...(specId ? { specId } : {}) });
    },
    list() { return beats.slice(); },
    battleList() { return battle.slice(); },
    clear() {
      beats.length = 0;
      battle.length = 0;
      lost.clear();
      nowS = 0;
      spotted = false;
      perspective = 'alpha';
    },
  };
}

/**
 * Lay the beats on the line from 0 to `durationS` (the result sits at the end, 1). The line keeps the eight that
 * matter most (kills, then objectives, the death, the modules lost, the first spot; earlier first within a kind) and
 * labels them in that order wherever a label clears the ones already placed and the result's own; a beat that does
 * not clear keeps its mark without words. Sorted by time.
 */
export function layoutBeats(beats: readonly BattleBeat[], durationS: number, battle = false): PlacedBeat[] {
  if (!finite(durationS) || durationS <= 0) return [];
  const onLine = beats.filter((beat) => finite(beat.t) && beat.t >= 0 && beat.t <= durationS);
  const ranked = battle ? rankBattle(onLine) : onLine
    .map((beat, index) => ({ beat, index }))
    .sort((a, b) => PRIORITY[a.beat.kind] - PRIORITY[b.beat.kind] || a.beat.t - b.beat.t || a.index - b.index)
    .slice(0, MAX_PLACED)
    .map(({ beat }) => beat);
  // the result's label ends flush with the line, so its centre sits half a gap in
  const placed: number[] = [1 - LABEL_GAP / 2];
  const out = ranked.map((beat) => {
    const x = Math.min(0.96, Math.max(0.02, beat.t / durationS));
    const labelled = placed.every((other) => Math.abs(other - x) >= LABEL_GAP);
    if (labelled) placed.push(x);
    return { ...beat, x, labelled, room: 0 };
  });
  // each label may run to its nearest neighbour's (or the line's end), centred on its mark (gauntlet r1: a fixed 180 px
  // cut names to "Commander_..." with the line free on both sides)
  for (const beat of out) {
    if (!beat.labelled) continue;
    const neighbour = Math.min(...placed.filter((other) => other !== beat.x).map((other) => Math.abs(other - beat.x)));
    (beat as { room: number }).room = Math.max(LABEL_GAP, Math.min(neighbour, 2 * beat.x, 2 * (1 - beat.x)));
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * A watched battle's line (layoutBeats `battle`): the objectives that decided it first, in time order, then the last
 * kill, then the kills sampled evenly over the battle from the first, so a long fight reads end to end.
 */
function rankBattle(beats: readonly BattleBeat[]): BattleBeat[] {
  const byTime = (a: BattleBeat, b: BattleBeat): number => a.t - b.t;
  const objectives = beats.filter((beat) => beat.kind !== 'kill').sort(byTime).slice(0, MAX_PLACED);
  const kills = beats.filter((beat) => beat.kind === 'kill').sort(byTime);
  const room = MAX_PLACED - objectives.length;
  if (room <= 0 || !kills.length) return objectives;
  if (kills.length <= room) return [...objectives, kills[kills.length - 1]!, ...kills.slice(0, -1)];
  const sampled: BattleBeat[] = [];
  for (let i = 0; i < room - 1; i++) sampled.push(kills[Math.round(i * (kills.length - 1) / (room - 1))]!);
  return [...objectives, kills[kills.length - 1]!, ...sampled];
}
