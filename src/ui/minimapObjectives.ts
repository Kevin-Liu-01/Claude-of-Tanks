/**
 * Tactical-map objective markers (2026-09-15). Pure derivation from the
 * match-mode presentation state to a flat list of markers the HUD minimap
 * paints and the world presentation mirrors — spawns, flag bases and flags,
 * capture zones with letters and control progress, Frontline Assault
 * sectors (taken / active / locked), Turbo Ball goals and ball, and horde
 * supply caches. Everything is expressed from the viewer's perspective
 * (own / enemy / neutral / contested) so the colours never depend on which
 * wire team the player was dealt.
 */

import type { ObjectiveSide } from './objectiveGlyphs.ts';

type ObjectiveTeamId = 'alpha' | 'bravo';

/** Structural view of the presentation state; the sim's record satisfies it. */
export interface ObjectiveStateView {
  id?: string;
  perspectiveTeam?: ObjectiveTeamId;
  respawns?: boolean;
  spawns?: ReadonlyArray<{ team: ObjectiveTeamId; x: number; z: number }> | null;
  flags?: ReadonlyArray<{
    team: ObjectiveTeamId; x: number; z: number; baseX: number; baseZ: number;
    status: string; carrierId?: string | null;
  }> | null;
  zones?: ReadonlyArray<{
    id?: string; x: number; z: number; control: number; owner: ObjectiveTeamId | null; contested: boolean;
  }> | null;
  ball?: { x: number; z: number } | null;
  goals?: ReadonlyArray<{ team: ObjectiveTeamId; x: number; z: number }> | null;
  pickups?: ReadonlyArray<{ kind: string; x: number; z: number; active?: boolean }> | null;
  line?: { index?: number; total?: number; holdS?: number } | null;
}

type ObjectiveKind = 'spawn' | 'flagBase' | 'flag' | 'zone' | 'sector' | 'goal' | 'ball' | 'pickup';

export interface ObjectiveMarker {
  kind: ObjectiveKind;
  x: number;
  z: number;
  side: ObjectiveSide;
  /** zone letter, sector number */
  label?: string;
  /**
   * spawn: 'respawn' when the mode revives players there;
   * flag: 'home' | 'carried' | 'dropped'; flagBase: 'home' | 'away';
   * sector: 'taken' | 'active' | 'holding' | 'locked'; pickup: 'heal' | 'ammo'.
   */
  status?: string;
  /** capture / hold progress 0..1 toward `progressSide` */
  progress?: number;
  progressSide?: 'own' | 'enemy';
  /** animate: a carried or dropped flag, a contested zone, the sector being held */
  pulse?: boolean;
  /** draw order: lower first (area markers under point markers) */
  priority: number;
}

const ZONE_LETTERS: readonly string[] = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']);

export function zoneLetter(index: number): string {
  return ZONE_LETTERS[index] ?? String(index + 1);
}

export function objectiveSide(team: ObjectiveTeamId | null | undefined, perspective: ObjectiveTeamId): 'own' | 'enemy' {
  return team === perspective ? 'own' : 'enemy';
}

function perspectiveOf(state: ObjectiveStateView): ObjectiveTeamId {
  return state.perspectiveTeam === 'bravo' ? 'bravo' : 'alpha';
}

/** Modes whose objective markers already stand on the team spawns (no separate spawn glyph). */
const SPAWN_MARKED_BY_OBJECTIVE = new Set(['capture_the_flag', 'turbo_ball']);
/** Modes whose enemy side spawns at the edges / on its own sectors (only the own spawn is a place). */
const OWN_SPAWN_ONLY = new Set(['endless_horde', 'frontline_assault']);

function spawnMarkers(state: ObjectiveStateView, perspective: ObjectiveTeamId, out: ObjectiveMarker[]): void {
  const id = String(state.id || 'standard');
  if (!state.spawns || SPAWN_MARKED_BY_OBJECTIVE.has(id)) return;
  for (const spawn of state.spawns) {
    const side = objectiveSide(spawn.team, perspective);
    if (side === 'enemy' && OWN_SPAWN_ONLY.has(id)) continue;
    out.push({
      kind: 'spawn', x: spawn.x, z: spawn.z, side,
      status: state.respawns ? 'respawn' : 'spawn', priority: 0,
    });
  }
}

function flagMarkers(state: ObjectiveStateView, perspective: ObjectiveTeamId, out: ObjectiveMarker[]): void {
  for (const flag of state.flags || []) {
    const side = objectiveSide(flag.team, perspective);
    const home = flag.status === 'home';
    out.push({
      kind: 'flagBase', x: flag.baseX, z: flag.baseZ, side,
      status: home ? 'home' : 'away', priority: 1,
    });
    out.push({
      kind: 'flag', x: flag.x, z: flag.z, side,
      status: home ? 'home' : flag.status === 'carried' ? 'carried' : 'dropped',
      pulse: !home, priority: home ? 4 : 6,
    });
  }
}

function zoneSide(zone: { owner: ObjectiveTeamId | null; contested: boolean }, perspective: ObjectiveTeamId): ObjectiveSide {
  if (zone.contested) return 'contested';
  return zone.owner ? objectiveSide(zone.owner, perspective) : 'neutral';
}

function zoneMarkers(state: ObjectiveStateView, perspective: ObjectiveTeamId, out: ObjectiveMarker[]): void {
  const zones = state.zones || [];
  for (const [index, zone] of zones.entries()) {
    const control = Number.isFinite(zone.control) ? zone.control : 0;
    out.push({
      kind: 'zone', x: zone.x, z: zone.z, side: zoneSide(zone, perspective),
      label: zoneLetter(index),
      progress: zone.owner ? 1 : Math.min(1, Math.abs(control)),
      progressSide: objectiveSide(control >= 0 ? 'alpha' : 'bravo', perspective),
      pulse: zone.contested, priority: 2,
    });
  }
}

function sectorMarkers(state: ObjectiveStateView, perspective: ObjectiveTeamId, out: ObjectiveMarker[]): void {
  const zones = state.zones || [];
  const taken = Math.max(0, Math.floor(state.line?.index ?? 0));
  const total = zones.length;
  const holdS = state.line?.holdS ?? 0;
  for (const [index, zone] of zones.entries()) {
    const control = Number.isFinite(zone.control) ? zone.control : 0;
    let status: 'taken' | 'active' | 'holding' | 'locked';
    let side: ObjectiveSide;
    if (taken >= total && index === total - 1) {
      status = 'holding';
      side = zone.contested ? 'contested' : 'own';
    } else if (index < taken) {
      status = 'taken';
      side = 'own';
    } else if (index === taken) {
      status = 'active';
      side = zoneSide(zone, perspective);
    } else {
      status = 'locked';
      side = 'enemy';
    }
    out.push({
      kind: 'sector', x: zone.x, z: zone.z, side, label: String(index + 1), status,
      progress: status === 'taken' ? 1 : status === 'holding' ? (holdS > 0 ? 0 : 1) : Math.min(1, Math.abs(control)),
      progressSide: objectiveSide(control >= 0 ? 'alpha' : 'bravo', perspective),
      pulse: status === 'active' ? zone.contested : status === 'holding' && holdS > 0,
      priority: 2,
    });
  }
}

function turboMarkers(state: ObjectiveStateView, perspective: ObjectiveTeamId, out: ObjectiveMarker[]): void {
  for (const goal of state.goals || []) {
    out.push({ kind: 'goal', x: goal.x, z: goal.z, side: objectiveSide(goal.team, perspective), priority: 1 });
  }
  if (state.ball) out.push({ kind: 'ball', x: state.ball.x, z: state.ball.z, side: 'neutral', pulse: true, priority: 6 });
}

function pickupMarkers(state: ObjectiveStateView, out: ObjectiveMarker[]): void {
  for (const pickup of state.pickups || []) {
    if (pickup.active === false) continue;
    out.push({
      kind: 'pickup', x: pickup.x, z: pickup.z, side: 'neutral',
      status: pickup.kind === 'heal' ? 'heal' : 'ammo', priority: 5,
    });
  }
}

/** Markers for the current mode state, sorted by draw priority (area markers first). */
export function objectiveMarkers(state: ObjectiveStateView | null | undefined): ObjectiveMarker[] {
  if (!state || !state.id || state.id === 'standard') return [];
  const perspective = perspectiveOf(state);
  const out: ObjectiveMarker[] = [];
  spawnMarkers(state, perspective, out);
  if (state.id === 'capture_the_flag') flagMarkers(state, perspective, out);
  else if (state.id === 'zone_control' || state.id === 'mars') zoneMarkers(state, perspective, out);
  else if (state.id === 'frontline_assault') sectorMarkers(state, perspective, out);
  else if (state.id === 'turbo_ball') turboMarkers(state, perspective, out);
  pickupMarkers(state, out);
  out.sort((a, b) => a.priority - b.priority);
  return out;
}

/** The markers a mode places on the team spawns themselves (the map skips its generic base rings then). */
export function markersStandOnSpawns(markers: readonly ObjectiveMarker[]): boolean {
  return markers.some((marker) => marker.kind === 'spawn' || marker.kind === 'flagBase' || marker.kind === 'goal');
}
