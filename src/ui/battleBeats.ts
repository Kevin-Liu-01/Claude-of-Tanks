/**
 * battleBeats.ts — the battle's timeline on the end screen (the Premiere direction's 11-end-screen .beat).
 *
 * shotInfo.ts records the moments the report marks, each at its battle time: the player's first spot, each kill, each
 * objective taken or lost (a zone, a flag, a goal), each module the player lost and the player's death. The end
 * screen lays them on one line from the start to the result; layoutBeats() picks which carry a label so no two labels
 * meet. Node-runnable: no DOM, no clock of its own (the battle time comes in with the events and the HUD frame).
 *
 * Copyright © 2026 Kevin B. Liu.
 */
import { zoneLetter } from './minimapObjectives.ts';

export type BattleBeatKind = 'spot' | 'kill' | 'zone' | 'flag' | 'goal' | 'loss' | 'death';

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
}

export interface PlacedBeat extends BattleBeat {
  /** Position on the line, 0 (the start) to 1 (the result). */
  readonly x: number;
  readonly labelled: boolean;
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
  list(): BattleBeat[];
  clear(): void;
}

/** A battle never keeps more than this many beats (the line shows nine at most). */
const MAX_BEATS = 48;
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
    },
    list() { return beats.slice(); },
    clear() {
      beats.length = 0;
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
export function layoutBeats(beats: readonly BattleBeat[], durationS: number): PlacedBeat[] {
  if (!finite(durationS) || durationS <= 0) return [];
  const ranked = beats
    .filter((beat) => finite(beat.t) && beat.t >= 0 && beat.t <= durationS)
    .map((beat, index) => ({ beat, index }))
    .sort((a, b) => PRIORITY[a.beat.kind] - PRIORITY[b.beat.kind] || a.beat.t - b.beat.t || a.index - b.index)
    .slice(0, MAX_PLACED);
  // the result's label ends flush with the line, so its centre sits half a gap in
  const placed: number[] = [1 - LABEL_GAP / 2];
  const out = ranked.map(({ beat }) => {
    const x = Math.min(0.96, Math.max(0.02, beat.t / durationS));
    const labelled = placed.every((other) => Math.abs(other - x) >= LABEL_GAP);
    if (labelled) placed.push(x);
    return { ...beat, x, labelled };
  });
  return out.sort((a, b) => a.t - b.t);
}
