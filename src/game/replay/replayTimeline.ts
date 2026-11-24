/**
 * The replay viewer's timeline (replay-system, docs/REPLAY.md §5 "Timeline"): the recording's event marks as the bar
 * draws them. Each mark has a category (kill, penetration, fire, objective, strike, respawn, ram, end), the team whose
 * colour it takes, its battle time and where on the bar it sits, and the words it needs as data (an i18n key and the
 * hulls' spec ids), never a string. Filters (all, kills, one tank), the hit test a pointer makes (a 44 px target on a
 * phone), and what a click on a mark does (seek to 3 s before it and ride its shooter) live here, so the bar itself
 * only draws. Node-runnable, no DOM.
 */
import type { ReplayEventMark, ReplayRosterEntry } from '../../sim/replayFormat.ts';

export const REPLAY_STEP_HZ = 60;

export type TimelineCategory = 'kill' | 'pen' | 'fire' | 'objective' | 'strike' | 'respawn' | 'ram' | 'end';

/** Mode events (sim/matchModes.ts, emitted as `mode:<type>`) that earn a mark, and their category. */
const MODE_MARKS: Readonly<Record<string, TimelineCategory>> = Object.freeze({
  zone_captured: 'objective', flag_taken: 'objective', flag_captured: 'objective', goal_scored: 'objective',
  destruction_scored: 'objective', line_advanced: 'objective', wave_cleared: 'objective', completed: 'objective',
  strike_called: 'strike', aircraft_down: 'strike', respawn: 'respawn',
});

export interface TimelineMark {
  /** The mark's place in the recording's event list. */
  readonly index: number;
  readonly tick: number;
  readonly timeS: number;
  readonly category: TimelineCategory;
  /** The recorded type ('kill:ammo', 'hit:pen', 'zone_captured' …). */
  readonly type: string;
  /** The hull the mark is about (the destroyed, the hit, the respawned) and the one that did it, or ''. */
  readonly subject: string;
  readonly actor: string;
  /** The team whose colour the mark takes: the actor's, else the subject's (a mode event may name the team itself). */
  readonly team: string;
  readonly x: number;
  readonly z: number;
  /** The words: `replay.mark.<category>` (a kill with no other tank behind it: `replay.mark.loss`) with the hulls' spec
   *  ids and the cause, resolved by the bar. */
  readonly label: { readonly key: string; readonly actorSpec: string; readonly subjectSpec: string; readonly cause: string };
}

/** The recording's marks for the bar, in time order. A type the bar does not mark (a non-penetrating hit, a contest) is
 *  left out. */
export function timelineMarks(events: readonly ReplayEventMark[], roster: readonly ReplayRosterEntry[]): TimelineMark[] {
  const byId = new Map(roster.map((entry) => [entry.id, entry]));
  const teams = new Set(roster.map((entry) => entry.team));
  const marks: TimelineMark[] = [];
  events.forEach(([tick, type, subject, actor, x, z], index) => {
    let category: TimelineCategory | undefined, cause = '';
    if (type.startsWith('kill:')) { category = 'kill'; cause = type.slice(5); }
    else if (type === 'hit:pen') category = 'pen';
    else if (type === 'fire' || type === 'ram' || type === 'end') category = type;
    else category = MODE_MARKS[type];
    if (!category) return;
    const team = byId.get(actor)?.team ?? byId.get(subject)?.team ?? (teams.has(subject) ? subject : '');
    // a kill with no other tank behind it (a scuttle, a fall) is a loss: "X was destroyed", never "X destroyed X"
    const loss = category === 'kill' && (!actor || actor === subject);
    marks.push({
      index, tick, timeS: tick / REPLAY_STEP_HZ, category, type, subject, actor, team, x, z,
      label: { key: loss ? 'replay.mark.loss' : `replay.mark.${category}`, actorSpec: byId.get(actor)?.specId ?? '',
        subjectSpec: byId.get(subject)?.specId ?? '', cause },
    });
  });
  return marks.sort((a, b) => a.tick - b.tick || a.index - b.index);
}

export type TimelineFilter = 'all' | 'kills' | { readonly hull: string };

export function filterMarks(marks: readonly TimelineMark[], filter: TimelineFilter): TimelineMark[] {
  if (filter === 'all') return marks.slice();
  if (filter === 'kills') return marks.filter((mark) => mark.category === 'kill');
  return marks.filter((mark) => mark.subject === filter.hull || mark.actor === filter.hull);
}

/** Where on a bar `widthPx` wide the moment `timeS` of a `durationS` battle sits. */
export function markX(timeS: number, durationS: number, widthPx: number): number {
  return durationS > 0 ? Math.min(widthPx, Math.max(0, (timeS / durationS) * widthPx)) : 0;
}

/** The pointer's target on the bar: 44 px on a coarse pointer (a finger), 16 px on a mouse. */
export function markTargetPx(coarse: boolean): number {
  return coarse ? 44 : 16;
}

/** The mark under a pointer at `x` on the bar (the nearest within half its target), or null. The battle's end yields to
 *  any other mark in reach: a battle that ends on a kill draws the two on one spot, and the kill is the one to pick. */
export function markAt(marks: readonly TimelineMark[], x: number, durationS: number, widthPx: number, targetPx: number): TimelineMark | null {
  let best: TimelineMark | null = null, bestDistance = targetPx / 2, end: TimelineMark | null = null;
  for (const mark of marks) {
    const distance = Math.abs(markX(mark.timeS, durationS, widthPx) - x);
    if (distance > targetPx / 2) continue;
    if (mark.category === 'end') { end ??= mark; continue; }
    if (distance <= bestDistance) { best = mark; bestDistance = distance; }
  }
  return best ?? end;
}

/** The battle time under a pointer at `x` (a scrub), clamped to the battle. */
export function timeAtX(x: number, durationS: number, widthPx: number): number {
  return widthPx > 0 ? Math.min(durationS, Math.max(0, (x / widthPx) * durationS)) : 0;
}

export const MARK_LEAD_S = 3;

/** A click on a mark: seek to MARK_LEAD_S before it and ride whoever did it (else whom it is about). */
export function markSeek(mark: TimelineMark): { timeS: number; ride: string } {
  return { timeS: Math.max(0, mark.timeS - MARK_LEAD_S), ride: mark.actor || mark.subject };
}
