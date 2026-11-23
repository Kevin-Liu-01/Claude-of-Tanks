/**
 * endScreenModes.ts — what the end screen shows for each game mode (endscreen-modes-275; the owner: "fix victory screens
 * for each game mode too to make sure stuff is represented correctly").
 *
 * One descriptor per mode: the record's stat tiles (after the vehicle card), the combat breakdown's figures, the
 * rosters' columns, and whether the headline score is the sides' kills or the mode's own score. The renderer
 * (endScreen.ts) draws whatever the mode declares and holds no per-mode branch. A tile's value comes from the summary
 * the bookkeeper (shotInfo.ts) built: the ledger's sums, the player's mode facts (flags, goals, call-ins) and the mode's
 * end report (sim/modeEndReport.ts). A tile with no data behind it is left out, never shown as a made-up zero.
 *
 * The AC-130 mode's pilot is not a tank: no armour blocks a round, nothing is spotted from the orbit and "on target" counts
 * a howitzer's splash once per hull it reaches, so its record counts the troops it brought out and the rounds it fired.
 * Pure: no DOM; Node-runnable (endScreenModes.selftest.mjs).
 */
import type { GameModeId } from '../sim/gameModeCatalog.ts';
import type { ModeEndReport } from '../sim/modeEndReport.ts';
import { shotAccuracy } from './battleReportMedia.ts';

/** Every figure a tile or the breakdown can show. */
export type EndStatId =
  | 'dealt' | 'kills' | 'accuracy' | 'spotted' | 'assist' | 'blocked' | 'received' | 'modules' | 'pens' | 'deaths'
  | 'fired' | 'hits' | 'flags' | 'returns' | 'goals' | 'zones' | 'wave' | 'sectors' | 'rescued' | 'troopsLost'
  | 'callIns' | 'strikeKills' | 'aircraftDown' | 'droneKills' | 'weapon' | 'role';

/** A roster column after the combatant: the row's kills, its deaths (reviving modes only), its objective (the mode's
 *  per-row scoring, flags or goals), its damage. The survival mark always closes the row. */
export type EndColumnId = 'kills' | 'deaths' | 'objective' | 'damage';

export interface EndScreenModeView {
  /** The record's tiles after the vehicle card; the first is the mode's lead figure (the hot tile). */
  readonly tiles: readonly EndStatId[];
  /** The combat breakdown's figures. */
  readonly details: readonly EndStatId[];
  readonly columns: readonly EndColumnId[];
  /** The headline's score: the sides' kills, or the mode's own score by side. */
  readonly headline: 'kills' | 'mode';
  /** What a row's objective column counts. */
  readonly objective?: 'flags' | 'goals';
  /** The vehicle the player's record pictures: the garage tank, or the aircraft the mode flies. */
  readonly vehicle: 'tank' | 'aircraft';
}

const TANK_DETAILS: readonly EndStatId[] = ['pens', 'modules', 'received'];
const TANK_COLUMNS: readonly EndColumnId[] = ['kills', 'deaths', 'damage'];
const view = (v: Partial<EndScreenModeView> & Pick<EndScreenModeView, 'tiles'>): EndScreenModeView => Object.freeze({
  details: TANK_DETAILS, columns: TANK_COLUMNS, headline: 'kills', vehicle: 'tank', ...v,
});

/** The descriptor table: every mode the simulation plays. */
export const END_SCREEN_MODES: Readonly<Record<GameModeId, EndScreenModeView>> = Object.freeze({
  standard: view({ tiles: ['dealt', 'kills', 'accuracy', 'spotted', 'assist', 'blocked'] }),
  // no hull-health victory: what a crew disables carries the battle
  realistic: view({ tiles: ['modules', 'kills', 'dealt', 'accuracy', 'spotted', 'blocked'], details: ['pens', 'received', 'assist'] }),
  capture_the_flag: view({ tiles: ['flags', 'kills', 'dealt', 'accuracy', 'assist', 'deaths'], details: ['returns', 'pens', 'received'],
    columns: ['objective', 'kills', 'deaths', 'damage'], objective: 'flags', headline: 'mode' }),
  zone_control: view({ tiles: ['zones', 'kills', 'dealt', 'accuracy', 'assist', 'deaths'], details: ['pens', 'blocked', 'received'], headline: 'mode' }),
  mars: view({ tiles: ['zones', 'kills', 'dealt', 'accuracy', 'assist', 'deaths'], details: ['pens', 'blocked', 'received'], headline: 'mode' }),
  turbo_ball: view({ tiles: ['goals', 'kills', 'dealt', 'accuracy', 'blocked', 'deaths'], columns: ['objective', 'kills', 'deaths', 'damage'],
    objective: 'goals', headline: 'mode' }),
  endless_horde: view({ tiles: ['wave', 'kills', 'dealt', 'accuracy', 'received', 'blocked'], details: ['pens', 'modules', 'assist'] }),
  frontline_assault: view({ tiles: ['sectors', 'kills', 'dealt', 'accuracy', 'spotted', 'blocked'], details: ['pens', 'assist', 'received'] }),
  juggernaut: view({ tiles: ['role', 'kills', 'dealt', 'accuracy', 'blocked', 'deaths'], details: ['pens', 'assist', 'received'] }),
  infected: view({ tiles: ['role', 'kills', 'dealt', 'accuracy', 'spotted', 'deaths'], details: ['pens', 'assist', 'received'] }),
  gun_game: view({ tiles: ['weapon', 'kills', 'accuracy', 'dealt', 'assist', 'deaths'], details: ['pens', 'blocked', 'received'] }),
  drone: view({ tiles: ['droneKills', 'kills', 'dealt', 'accuracy', 'spotted', 'deaths'], details: ['pens', 'assist', 'blocked'] }),
  ac130: view({ tiles: ['rescued', 'troopsLost', 'kills', 'dealt', 'fired', 'modules'], details: ['hits'], columns: ['kills', 'damage'],
    vehicle: 'aircraft' }),
  air_support: view({ tiles: ['zones', 'kills', 'callIns', 'strikeKills', 'aircraftDown', 'dealt'], details: ['accuracy', 'pens', 'received'],
    headline: 'mode' }),
  // Combined Arms (combined-arms-276): Air Support's sector battle, with the drone's kills beside the call-ins'
  combined_arms: view({ tiles: ['zones', 'kills', 'callIns', 'droneKills', 'strikeKills', 'dealt'], details: ['accuracy', 'pens', 'received'],
    headline: 'mode' }),
  // a practice or tutorial session keeps no record; when one does show the report it reads as a standard battle's
  proving_ground: view({ tiles: ['dealt', 'kills', 'accuracy', 'pens', 'fired', 'blocked'], details: ['modules', 'received'] }),
  training: view({ tiles: ['dealt', 'kills', 'accuracy', 'spotted', 'assist', 'blocked'] }),
});

/** The mode's view (an unknown or absent mode reads as a standard battle). The deaths column only stands in a mode that
 *  revives, where deaths are a stat of the battle. */
export function endScreenModeView(mode: string | null | undefined, revives = false): EndScreenModeView {
  const base = mode && Object.hasOwn(END_SCREEN_MODES, mode) ? END_SCREEN_MODES[mode as GameModeId] : END_SCREEN_MODES.standard;
  if (revives || !base.columns.includes('deaths')) return base;
  return Object.freeze({ ...base, columns: base.columns.filter((column) => column !== 'deaths'),
    tiles: base.tiles.filter((tile) => tile !== 'deaths'), details: base.details.filter((tile) => tile !== 'deaths') });
}

/** The player's moments of the mode the bookkeeper counts from the bus (shotInfo.ts), as the tiles read them. */
export interface EndPlayerFacts {
  readonly flagsCaptured: number;
  readonly flagsReturned: number;
  readonly goals: number;
  /** Zones the player's side captured. */
  readonly teamZones: number;
  /** The player's call-ins by kind, in the order called. */
  readonly callIns: readonly string[];
  readonly aircraftDown: number;
  /** The player's kills by what made them when not the player's vehicle ('drone', 'strafe', 'bomb', 'artillery', 'ac130'). */
  readonly sourceKills: Readonly<Record<string, number>>;
  /** Infected: the player joined the outbreak. */
  readonly infected: boolean;
}

export const NO_PLAYER_FACTS: EndPlayerFacts = Object.freeze({
  flagsCaptured: 0, flagsReturned: 0, goals: 0, teamZones: 0, callIns: Object.freeze([]), aircraftDown: 0,
  sourceKills: Object.freeze({}), infected: false,
});

/** The kill sources that are an air-support call-in (the drone is a vehicle of the crew's own). */
const STRIKE_SOURCES = new Set(['strafe', 'bomb', 'artillery', 'missile', 'ac130']);

/** The summary fields a tile reads (endScreen.ts EndScreenSummary). */
export interface EndStatSource {
  readonly mode?: string | null;
  readonly playerKills?: number;
  readonly playerDeaths?: number;
  readonly killCount: number;
  readonly stats: {
    readonly dealt: number; readonly received: number; readonly blocked: number; readonly fired: number; readonly hits: number;
    readonly pens: number; readonly assist: number; readonly modulesDestroyed?: number; readonly spotted?: number; readonly spotAttributed?: boolean;
  };
  readonly facts?: EndPlayerFacts | null;
  readonly modeReport?: ModeEndReport | null;
  readonly hordeWave?: number | null;
}

/** A tile's figure: a number to count up to, or a word (a role, a "4 / 6"); null when the battle gave no data for it. */
export type EndStatValue = { readonly value: number; readonly text?: undefined } | { readonly value?: undefined; readonly text: string; readonly fraction?: readonly [number, number] } | null;

const n = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * One figure's value. `words` names the roles (the renderer passes its translations, so this stays pure).
 */
export function endStatValue(id: EndStatId, sum: EndStatSource, words: Readonly<Record<'juggernaut' | 'hunter' | 'survivor' | 'infected', string>>): EndStatValue {
  const s = sum.stats, facts = sum.facts ?? NO_PLAYER_FACTS, report = sum.modeReport ?? null;
  switch (id) {
    case 'dealt': return { value: Math.round(n(s.dealt)) };
    case 'kills': return { value: n(sum.playerKills ?? sum.killCount) };
    case 'accuracy': return { value: shotAccuracy(n(s.hits), n(s.fired)) };
    case 'spotted': return s.spotAttributed === false ? null : { value: n(s.spotted) };
    case 'assist': return { value: Math.round(n(s.assist)) };
    case 'blocked': return { value: Math.round(n(s.blocked)) };
    case 'received': return { value: Math.round(n(s.received)) };
    case 'modules': return { value: n(s.modulesDestroyed) };
    case 'pens': return { text: `${n(s.pens)} / ${n(s.hits)}`, fraction: [n(s.pens), n(s.hits)] };
    case 'deaths': return { value: Math.max(0, Math.floor(n(sum.playerDeaths))) };
    case 'fired': return { value: n(s.fired) };
    case 'hits': return { value: n(s.hits) };
    case 'flags': return { value: facts.flagsCaptured };
    case 'returns': return { value: facts.flagsReturned };
    case 'goals': return { value: facts.goals };
    case 'zones': return { value: facts.teamZones };
    case 'wave': {
      const wave = report?.horde?.wave ?? sum.hordeWave;
      return wave != null && Number.isFinite(wave) ? { value: Math.max(1, Math.floor(wave)) } : null;
    }
    case 'sectors': return report?.line ? { text: `${report.line.index} / ${report.line.total}`, fraction: [report.line.index, report.line.total] } : null;
    case 'rescued': return report?.escort ? { text: `${report.escort.rescued} / ${report.escort.total}`, fraction: [report.escort.rescued, report.escort.total] } : null;
    case 'troopsLost': return report?.escort ? { value: Math.max(0, report.escort.total - report.escort.rescued - report.escort.alive) } : null;
    case 'callIns': return { value: facts.callIns.length };
    case 'strikeKills': {
      let kills = 0;
      for (const [source, count] of Object.entries(facts.sourceKills)) if (STRIKE_SOURCES.has(source)) kills += n(count);
      return { value: kills };
    }
    case 'aircraftDown': return { value: facts.aircraftDown };
    case 'droneKills': return { value: n(facts.sourceKills.drone) };
    case 'weapon': return report?.weaponStage ? { text: `${report.weaponStage.index} / ${report.weaponStage.total}`, fraction: [report.weaponStage.index, report.weaponStage.total] } : null;
    case 'role':
      if (sum.mode === 'juggernaut') return report?.boss ? { text: report.boss.isPlayer ? words.juggernaut : words.hunter } : null;
      if (sum.mode === 'infected') return { text: facts.infected ? words.infected : words.survivor };
      return null;
  }
}

/** The headline's score, own first: the mode's score by side where the mode declares it and the report carries one. */
export function headlineScore(view: EndScreenModeView, report: ModeEndReport | null | undefined, kills: { own: number; enemy: number }): { own: number; enemy: number; mode: boolean } {
  if (view.headline === 'mode' && report?.score) {
    const own = report.perspectiveTeam === 'bravo' ? report.score.bravo : report.score.alpha;
    const enemy = report.perspectiveTeam === 'bravo' ? report.score.alpha : report.score.bravo;
    return { own, enemy, mode: true };
  }
  return { ...kills, mode: false };
}

/** The outcome reasons that have their own line, by result (endScreen.outcome.<reason>.<result>). */
export const OUTCOME_REASONS: Readonly<Record<string, readonly ('victory' | 'defeat')[]>> = Object.freeze({
  flag_limit: ['victory', 'defeat'], score_limit: ['victory', 'defeat'], drone_score_limit: ['victory', 'defeat'],
  goal_limit: ['victory', 'defeat'], line_held: ['victory', 'defeat'], assault_overrun: ['victory', 'defeat'],
  horde_overrun: ['defeat'], juggernaut_destroyed: ['victory', 'defeat'], juggernaut_survived: ['victory', 'defeat'],
  weapon_ladder_complete: ['victory', 'defeat'], escort_extracted: ['victory'], escort_lost: ['defeat'], escort_time_expired: ['defeat'],
});

/** The outcome line's key for a reason and result, or null where the generic line stands. */
export function outcomeKey(reason: string | null | undefined, result: string): string | null {
  if (!reason || (result !== 'victory' && result !== 'defeat')) return null;
  return OUTCOME_REASONS[reason]?.includes(result) ? `endScreen.outcome.${reason}.${result}` : null;
}
