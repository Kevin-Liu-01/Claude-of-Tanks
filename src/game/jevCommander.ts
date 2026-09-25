/**
 * The Jev commander (docs/JEV-COMMANDER.md).
 *
 * Owner 2026-09-25: "enable playing with tanks controlled by jev, a system one
 * awesome model … an option to play jev controlled models". Jev (TypeSafe's
 * System One model) answers typed questions over a JSON state with calibrated
 * probabilities in a few hundred milliseconds; it writes no text. So the
 * commander asks it, once per TEAM every few seconds, one fan-out request over
 * a compact view of the battle from that team's side — a posture, a target, a
 * fire judgement and a threat read per bot, plus one team focus — and turns the
 * answers into standing ORDERS the classic controller (game/ai.ts) executes:
 * a target claim, a hold band, a flank side, a fallback, a point to drive to, a
 * fire discipline. Every order expires on its own, so whenever the proxy is
 * slow, fails, is out of budget or answers with low confidence, the classic
 * brain simply carries on: the battle never waits on the network.
 *
 * Node-runnable and DOM-free: the battle view is an interface both the solo
 * integration (game/state.ts) and, later, the authoritative match can satisfy;
 * the transport is injected (createJevFetchTransport for the browser).
 */
import { roleOf, type AiOrder, type AiOrderPosture } from './ai.ts';
import {
  bearingWord, JEV_FOCUS_NONE, JEV_LIMITS, JEV_POSTURES, JEV_PROTOCOL_VERSION, JEV_TARGET_NONE, readJevResponse,
  type JevAnswer, type JevBattleState, type JevBotView, type JevEnemyView, type JevObjectiveView, type JevRequestBody,
  type JevResponseBody,
} from './jevProtocol.ts';

export interface JevCommanderEntity {
  readonly id: string;
  readonly team: string;
  readonly isPlayer?: boolean;
  readonly bot?: boolean;
  readonly modeActive?: boolean;
  readonly spec: { readonly name: string; readonly role?: string; readonly topSpeedKmh?: number; readonly enginePowerHp?: number; readonly weightTons?: number };
  readonly state: { readonly pos: { readonly x: number; readonly z: number }; readonly yaw: number; readonly speed: number } | null;
  readonly combat: {
    readonly hp: number; readonly maxHp: number; readonly destroyed: boolean;
    readonly ammo?: readonly number[]; readonly ammoCapacity?: readonly number[];
    readonly reload?: { readonly t: number };
    readonly modules?: Partial<Record<string, { readonly state: string } | undefined>>;
  } | null;
  readonly aiCtl: { readonly targetId?: string | null; readonly state?: string; setOrder?(order: AiOrder | null): void } | null;
}

interface JevZoneLike { readonly id?: string; readonly x: number; readonly z: number; readonly owner: string | null; readonly contested: boolean }
interface JevFlagLike { readonly team: string; readonly x: number; readonly z: number; readonly status: string }
interface JevGoalLike { readonly team: string; readonly x: number; readonly z: number }

/** The mode presentation state the commander reads (sim/matchModes.ts MatchModePresentationState, structurally). */
export interface JevModeStateView {
  readonly score?: { readonly alpha: number; readonly bravo: number };
  readonly target?: number | null;
  readonly zones?: readonly JevZoneLike[] | null;
  readonly flags?: readonly JevFlagLike[] | null;
  readonly ball?: { readonly x: number; readonly z: number } | null;
  readonly goals?: readonly JevGoalLike[] | null;
  readonly line?: { readonly index: number; readonly total: number } | null;
}

export interface JevBattleView {
  readonly timeS: number;
  readonly mode: string;
  readonly timeLimitS: number | null;
  readonly tanks: readonly JevCommanderEntity[];
  readonly spotting: { isSpotted(id: string, team: string): boolean } | null;
  readonly modeState: JevModeStateView | null;
  /** The mode's live objective for a bot (matchModeController.botObjective), null when the mode has none. */
  objectiveFor?(entity: JevCommanderEntity): { readonly x: number; readonly z: number; readonly radiusM: number } | null;
}

export type JevTransportResult =
  | { readonly ok: true; readonly body: JevResponseBody }
  | { readonly ok: false; readonly error: string; readonly status?: number; readonly retryAfterMs?: number };

export interface JevTransport {
  /** The session id the proxy budgets by (one per page load; never a player name). */
  readonly sid: string;
  send(body: JevRequestBody, signal: AbortSignal): Promise<JevTransportResult>;
}

export interface JevTeamStats {
  requests: number;
  answered: number;
  failed: number;
  skippedQuiet: number;
  budgetSpent: boolean;
  ordersApplied: number;
  discardedStale: number;
  discardedDead: number;
  discardedChanged: number;
  lowConfidence: number;
  unmapped: number;
  inputTokens: number;
  outputTokens: number;
  lastLatencyMs: number;
  meanLatencyMs: number;
  maxLatencyMs: number;
  lastError: string | null;
  backoffS: number;
}

export interface JevOrderLogEntry {
  readonly t: number;
  readonly team: string;
  readonly id: string;
  readonly posture: string | null;
  readonly target: string | null;
  readonly fire: string | null;
  readonly threat: number;
  readonly confidence: number;
  readonly applied: boolean;
  readonly reason: string;
}

export interface JevCommanderOptions {
  transport: JevTransport;
  /** Teams commanded (solo: 'enemy', and 'player' when the allies are Jev's too). */
  teams: readonly string[];
  /** Seconds between two requests for one team. */
  cadenceS?: number;
  /** Seconds between requests while a team sees no enemy and nothing on the objectives changed. */
  quietCadenceS?: number;
  /** How long one order stands before the classic brain resumes. */
  orderTtlS?: number;
  /** An answer older than this (sim seconds since the request was issued) is discarded whole. */
  staleAfterS?: number;
  /** Requests one team may make in one battle. */
  requestsPerTeam?: number;
  minPostureConfidence?: number;
  minTargetConfidence?: number;
  minFocusConfidence?: number;
  /** Order log capacity (the debug HUD reads it). */
  logCapacity?: number;
  /** Wall clock for latency accounting (never for the simulation). */
  now?: () => number;
}

export interface JevCommander {
  /** One call per simulation step, before the controllers update; cheap while nothing is due. */
  step(view: JevBattleView): void;
  /** Stop issuing requests (the battle ended); in-flight answers are ignored. */
  stop(): void;
  /** Stop and abort in-flight requests. */
  dispose(): void;
  /** True for a bot this commander orders. */
  commands(entity: { readonly team: string; readonly bot?: boolean; readonly isPlayer?: boolean }): boolean;
  readonly teams: readonly string[];
  readonly active: boolean;
  stats(team?: string): JevTeamStats;
  readonly orderLog: readonly JevOrderLogEntry[];
}

const CLASS_WORDS: Readonly<Record<string, string>> = Object.freeze({
  mbt: 'main battle tank', heavy: 'heavy tank', medium: 'medium tank', light: 'light tank', td: 'tank destroyer',
  spg: 'self-propelled gun', ifv: 'infantry fighting vehicle',
});

/** What each side is trying to do, in the words the model reads (docs/GAME-MODES.md). */
function modeGoal(mode: string, attackers: boolean): string {
  switch (mode) {
    case 'capture_the_flag': return 'carry the enemy flag home while our flag stays home; first team to 3 captures wins';
    case 'zone_control': return 'capture and hold the three zones; first team to 750 points wins';
    case 'mars': return 'hold the three station sectors in low gravity; first team to 750 points wins';
    case 'turbo_ball': return 'drive or shoot the ball into the enemy goal; first team to 5 goals wins';
    case 'endless_horde': return attackers ? 'survive the waves and protect the human player' : 'destroy the human player and its escorts';
    case 'frontline_assault': return attackers ? 'take the trench sectors in turn and hold the last one before the clock runs out'
      : 'hold the trench sectors against the attackers until the clock runs out';
    default: return 'destroy every enemy vehicle before the clock runs out';
  }
}

function objectiveTeamOf(team: string): 'alpha' | 'bravo' {
  return team === 'bravo' || team === 'enemy' ? 'bravo' : 'alpha';
}

function cleanName(value: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex
  const text = String(value || 'vehicle').replace(/[ -]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return (text || 'vehicle').slice(0, JEV_LIMITS.text);
}

function alive(entity: JevCommanderEntity): boolean {
  return !!entity.state && !!entity.combat && !entity.combat.destroyed && entity.modeActive !== false;
}

function fraction(value: number, max: number): number {
  if (!(max > 0)) return 1;
  return Math.round(Math.max(0, Math.min(1, value / max)) * 100) / 100;
}

function metres(value: number): number {
  return Math.max(0, Math.min(5000, Math.round(value / 10) * 10));
}

function bearingFrom(fromX: number, fromZ: number, toX: number, toZ: number): string {
  return bearingWord(Math.atan2(toX - fromX, toZ - fromZ));
}

function wrapAngle(a: number): number {
  const turn = Math.PI * 2;
  return ((a + Math.PI) % turn + turn) % turn - Math.PI;
}

function ammoFraction(combat: NonNullable<JevCommanderEntity['combat']>): { fraction: number; empty: boolean } {
  const ammo = combat.ammo, capacity = combat.ammoCapacity;
  if (!Array.isArray(ammo) || !Array.isArray(capacity)) return { fraction: 1, empty: false };
  let have = 0, total = 0;
  for (let slot = 0; slot < ammo.length; slot++) {
    have += ammo[slot] || 0;
    total += capacity[slot] || 0;
  }
  return { fraction: fraction(have, total), empty: total > 0 && have <= 0 };
}

interface Labels {
  /** entity id → label */
  readonly bots: ReadonlyMap<string, string>;
  readonly enemies: ReadonlyMap<string, string>;
  /** label → entity id */
  readonly botIds: ReadonlyMap<string, string>;
  readonly enemyIds: ReadonlyMap<string, string>;
  /** objective id → point */
  readonly objectives: ReadonlyMap<string, { x: number; z: number }>;
}

interface TeamSnapshot {
  readonly state: JevBattleState;
  readonly labels: Labels;
  /** entity id → hp fraction at issue, for the freshness gate */
  readonly hp: ReadonlyMap<string, number>;
  /** a cheap signature of what the team can see and hold, for the quiet cadence */
  readonly signature: string;
}

function objectiveRadius(view: JevBattleView, entity: JevCommanderEntity): number {
  const objective = view.objectiveFor?.(entity);
  return objective ? objective.radiusM : 30;
}

/**
 * The team's document: our living bots (labelled b1…), the enemies our team has
 * spotted (e1…; an unspotted enemy is not in the document — the commander never
 * learns what the spotting sim hides), the objectives with their holders, the
 * score and the clock. Distances and bearings only, never a coordinate.
 */
export function buildJevTeamState(
  view: JevBattleView, team: string, previousHp: ReadonlyMap<string, number> | null,
): TeamSnapshot | null {
  const ours = view.tanks.filter((entity) => entity.team === team && alive(entity));
  const bots = ours.filter((entity) => !entity.isPlayer && !!entity.aiCtl).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, JEV_LIMITS.bots);
  if (bots.length === 0) return null;
  const human = ours.find((entity) => entity.isPlayer) ?? null;
  const spotted = view.tanks
    .filter((entity) => entity.team !== team && alive(entity) && (!view.spotting || view.spotting.isSpotted(entity.id, team)))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, JEV_LIMITS.enemies);
  const theirsAlive = view.tanks.filter((entity) => entity.team !== team && alive(entity)).length;
  // the team's centroid anchors the enemy and objective bearings
  let cx = 0, cz = 0;
  for (const entity of ours) { cx += entity.state!.pos.x; cz += entity.state!.pos.z; }
  cx /= ours.length; cz /= ours.length;

  const botLabel = new Map<string, string>(), botId = new Map<string, string>();
  bots.forEach((entity, index) => { botLabel.set(entity.id, `b${index + 1}`); botId.set(`b${index + 1}`, entity.id); });
  const enemyLabel = new Map<string, string>(), enemyId = new Map<string, string>();
  spotted.forEach((entity, index) => { enemyLabel.set(entity.id, `e${index + 1}`); enemyId.set(`e${index + 1}`, entity.id); });

  const side = objectiveTeamOf(team);
  const modeState = view.modeState;
  const objectives: Record<string, JevObjectiveView> = {};
  const objectivePoints = new Map<string, { x: number; z: number }>();
  const ownerWord = (owner: string | null): string => (owner === null ? 'nobody' : owner === side ? 'ours' : 'theirs');
  const addObjective = (id: string, kind: string, x: number, z: number, owner: string | null, contested: boolean): void => {
    if (objectivePoints.size >= JEV_LIMITS.objectives) return;
    objectives[id] = { kind, owner: ownerWord(owner), contested, distance_m: metres(Math.hypot(x - cx, z - cz)), bearing: bearingFrom(cx, cz, x, z) };
    objectivePoints.set(id, { x, z });
  };
  const zones = modeState?.zones ?? null;
  if (zones && zones.length) {
    const sectors = view.mode === 'frontline_assault';
    zones.forEach((zone, index) => addObjective(
      sectors ? `sector_${index + 1}` : `zone_${String.fromCharCode(97 + index)}`, sectors ? 'sector' : 'zone',
      zone.x, zone.z, zone.owner, zone.contested,
    ));
  }
  for (const flag of modeState?.flags ?? []) {
    const own = objectiveTeamOf(flag.team) === side;
    addObjective(own ? 'flag_ours' : 'flag_theirs', 'flag', flag.x, flag.z, objectiveTeamOf(flag.team), flag.status !== 'home');
  }
  if (modeState?.ball) addObjective('ball', 'ball', modeState.ball.x, modeState.ball.z, null, false);
  for (const goal of modeState?.goals ?? []) {
    if (objectiveTeamOf(goal.team) !== side) addObjective('goal_theirs', 'goal', goal.x, goal.z, objectiveTeamOf(goal.team), false);
  }

  const seenBy = new Map<string, string[]>(), engagedBy = new Map<string, string[]>();
  const hp = new Map<string, number>();
  const ourTanks: Record<string, JevBotView> = {};
  for (const entity of bots) {
    const label = botLabel.get(entity.id)!;
    const state = entity.state!, combat = entity.combat!;
    const position = state.pos;
    const hpFraction = fraction(combat.hp, combat.maxHp);
    hp.set(entity.id, hpFraction);
    const ammo = ammoFraction(combat);
    const reloadT = combat.reload?.t ?? 0;
    const sees: Array<{ id: string; m: number }> = [];
    for (const enemy of spotted) {
      const distance = Math.hypot(enemy.state!.pos.x - position.x, enemy.state!.pos.z - position.z);
      if (distance > 650) continue;
      sees.push({ id: enemyLabel.get(enemy.id)!, m: metres(distance) });
    }
    sees.sort((a, b) => a.m - b.m);
    sees.length = Math.min(sees.length, JEV_LIMITS.seesPerBot);
    for (const seen of sees) {
      const list = seenBy.get(seen.id) ?? [];
      if (list.length < JEV_LIMITS.seenBy) list.push(label);
      seenBy.set(seen.id, list);
    }
    const targetId = entity.aiCtl?.targetId ?? null;
    const targetLabel = targetId ? enemyLabel.get(targetId) ?? null : null;
    if (targetLabel) {
      const list = engagedBy.get(targetLabel) ?? [];
      if (list.length < JEV_LIMITS.seenBy) list.push(label);
      engagedBy.set(targetLabel, list);
    }
    let nearestAlly: number | null = null;
    for (const friend of ours) {
      if (friend === entity) continue;
      const distance = Math.hypot(friend.state!.pos.x - position.x, friend.state!.pos.z - position.z);
      if (nearestAlly === null || distance < nearestAlly) nearestAlly = distance;
    }
    const modules: string[] = [];
    for (const [name, module] of Object.entries(combat.modules ?? {})) {
      if (module && module.state !== 'ok' && modules.length < JEV_LIMITS.modules) modules.push(name.slice(0, 16));
    }
    const objective = view.objectiveFor?.(entity) ?? null;
    const previous = previousHp?.get(entity.id);
    ourTanks[label] = {
      vehicle: cleanName(entity.spec.name),
      class: CLASS_WORDS[String(entity.spec.role || '')] ?? 'armoured vehicle',
      role: roleOf(entity.spec),
      hp: hpFraction,
      ammo: ammo.fraction,
      gun: ammo.empty ? 'empty' : reloadT > 0.05 ? `reloading ${Math.min(999, Math.ceil(reloadT))} s` : 'ready',
      moving: Math.abs(state.speed) > 0.5,
      under_fire: previous !== undefined && hpFraction < previous - 0.005,
      modules_damaged: modules,
      sees,
      nearest_ally_m: nearestAlly === null ? null : metres(nearestAlly),
      objective: objective ? { bearing: bearingFrom(position.x, position.z, objective.x, objective.z), distance_m: metres(Math.hypot(objective.x - position.x, objective.z - position.z)) } : null,
      current_target: targetLabel && (sees.some((seen) => seen.id === targetLabel) ? targetLabel : null),
      current_stance: String(entity.aiCtl?.state || 'patrol').slice(0, 16),
    };
  }

  const enemies: Record<string, JevEnemyView> = {};
  for (const enemy of spotted) {
    const label = enemyLabel.get(enemy.id)!;
    const state = enemy.state!, combat = enemy.combat!;
    const toUs = Math.atan2(cx - state.pos.x, cz - state.pos.z);
    const aspect = Math.abs(wrapAngle(toUs - state.yaw));
    let onObjective = false;
    for (const point of objectivePoints.values()) {
      if (Math.hypot(point.x - state.pos.x, point.z - state.pos.z) <= objectiveRadius(view, enemy) + 12) { onObjective = true; break; }
    }
    enemies[label] = {
      vehicle: cleanName(enemy.spec.name),
      class: CLASS_WORDS[String(enemy.spec.role || '')] ?? 'armoured vehicle',
      human_player: !!enemy.isPlayer,
      hp: fraction(combat.hp, combat.maxHp),
      distance_m: metres(Math.hypot(state.pos.x - cx, state.pos.z - cz)),
      bearing: bearingFrom(cx, cz, state.pos.x, state.pos.z),
      facing: aspect < Math.PI / 4 ? 'toward us' : aspect > (Math.PI * 3) / 4 ? 'away' : 'side-on',
      moving: Math.abs(state.speed) > 0.5,
      on_objective: onObjective,
      seen_by: seenBy.get(label) ?? [],
      engaged_by: engagedBy.get(label) ?? [],
    };
  }

  const score = modeState?.score && typeof modeState.target === 'number'
    ? { ours: Math.round(modeState.score[side]), theirs: Math.round(modeState.score[side === 'alpha' ? 'bravo' : 'alpha']), target: Math.round(modeState.target) }
    : null;
  const attackers = side === 'alpha';
  const state: JevBattleState = {
    v: JEV_PROTOCOL_VERSION,
    battle: {
      mode: view.mode.slice(0, 24),
      goal: modeGoal(view.mode, attackers),
      elapsed_s: Math.max(0, Math.round(view.timeS)),
      remaining_s: view.timeLimitS == null ? null : Math.max(0, Math.round(view.timeLimitS - view.timeS)),
      score,
      alive: { ours: ours.length, theirs: theirsAlive },
      human_ally: human && human.state && human.combat ? {
        vehicle: cleanName(human.spec.name), hp: fraction(human.combat.hp, human.combat.maxHp),
        distance_m: metres(Math.hypot(human.state.pos.x - cx, human.state.pos.z - cz)), bearing: bearingFrom(cx, cz, human.state.pos.x, human.state.pos.z),
      } : null,
    },
    our_tanks: ourTanks,
    enemies,
    objectives,
  };
  const signature = `${spotted.length}|${Object.values(objectives).map((objective) => `${objective.owner}${objective.contested ? '!' : ''}`).join(',')}|${bots.length}`;
  return { state, labels: { bots: botLabel, enemies: enemyLabel, botIds: botId, enemyIds: enemyId, objectives: objectivePoints }, hp, signature };
}

interface PendingRequest {
  readonly team: string;
  readonly issuedAtS: number;
  readonly snapshot: TeamSnapshot;
  readonly controller: AbortController;
}

interface Arrival {
  readonly pending: PendingRequest;
  readonly result: JevTransportResult;
  readonly latencyMs: number;
}

function emptyStats(): JevTeamStats {
  return {
    requests: 0, answered: 0, failed: 0, skippedQuiet: 0, budgetSpent: false, ordersApplied: 0,
    discardedStale: 0, discardedDead: 0, discardedChanged: 0, lowConfidence: 0, unmapped: 0,
    inputTokens: 0, outputTokens: 0, lastLatencyMs: 0, meanLatencyMs: 0, maxLatencyMs: 0, lastError: null, backoffS: 0,
  };
}

function isPosture(value: string): value is AiOrderPosture {
  return (JEV_POSTURES as readonly string[]).includes(value);
}

function choice(answer: JevAnswer | undefined): { choice: string; confidence: number } | null {
  return answer && answer.type === 'choice' ? { choice: answer.choice, confidence: answer.confidence } : null;
}

export function createJevCommander({
  transport, teams, cadenceS = 2, quietCadenceS = 8, orderTtlS = 5, staleAfterS = 6, requestsPerTeam = 450,
  minPostureConfidence = 0.45, minTargetConfidence = 0.4, minFocusConfidence = 0.45, logCapacity = 64, now = Date.now,
}: JevCommanderOptions): JevCommander {
  const commanded = new Set(teams);
  const stats = new Map<string, JevTeamStats>();
  for (const team of teams) stats.set(team, emptyStats());
  const nextAtS = new Map<string, number>();
  const lastSentS = new Map<string, number>();
  const lastSignature = new Map<string, string>();
  const lastHp = new Map<string, ReadonlyMap<string, number>>();
  const failures = new Map<string, number>();
  const inFlight = new Map<string, PendingRequest>();
  const arrivals: Arrival[] = [];
  const orderLog: JevOrderLogEntry[] = [];
  let active = true;
  let disposed = false;

  const teamStats = (team: string): JevTeamStats => {
    let row = stats.get(team);
    if (!row) { row = emptyStats(); stats.set(team, row); }
    return row;
  };

  function log(entry: JevOrderLogEntry): void {
    if (orderLog.length >= logCapacity) orderLog.shift();
    orderLog.push(entry);
  }

  function issue(view: JevBattleView, team: string): void {
    const row = teamStats(team);
    if (row.requests >= requestsPerTeam) {
      row.budgetSpent = true;
      return;
    }
    const snapshot = buildJevTeamState(view, team, lastHp.get(team) ?? null);
    if (!snapshot) return;
    lastHp.set(team, snapshot.hp);
    const quiet = Object.keys(snapshot.state.enemies).length === 0 && lastSignature.get(team) === snapshot.signature;
    if (quiet && view.timeS - (lastSentS.get(team) ?? -Infinity) < quietCadenceS) {
      row.skippedQuiet++;
      return;
    }
    lastSignature.set(team, snapshot.signature);
    lastSentS.set(team, view.timeS);
    row.requests++;
    const controller = new AbortController();
    const pending: PendingRequest = { team, issuedAtS: view.timeS, snapshot, controller };
    inFlight.set(team, pending);
    const startedAt = now();
    const body: JevRequestBody = { v: JEV_PROTOCOL_VERSION, sid: transport.sid, kind: 'team_orders', state: snapshot.state };
    transport.send(body, controller.signal).then(
      (result) => { if (!disposed) arrivals.push({ pending, result, latencyMs: now() - startedAt }); },
      (error) => { if (!disposed) arrivals.push({ pending, result: { ok: false, error: error instanceof Error ? error.name === 'AbortError' ? 'aborted' : error.message : String(error) }, latencyMs: now() - startedAt }); },
    );
  }

  function applyAnswers(view: JevBattleView, arrival: Arrival, body: JevResponseBody): void {
    const { team, issuedAtS, snapshot } = arrival.pending;
    const row = teamStats(team);
    row.inputTokens += body.usage.input_tokens;
    row.outputTokens += body.usage.output_tokens;
    if (view.timeS - issuedAtS > staleAfterS) {
      row.discardedStale++;
      return;
    }
    const answers = body.answers;
    const focus = choice(answers.focus);
    const focusPoint = focus && focus.confidence >= minFocusConfidence && focus.choice !== JEV_FOCUS_NONE
      ? snapshot.labels.objectives.get(focus.choice) ?? null : null;
    const byId = new Map<string, JevCommanderEntity>();
    for (const entity of view.tanks) byId.set(entity.id, entity);
    const ours = view.tanks.filter((entity) => entity.team === team && alive(entity));
    for (const [label, entityId] of snapshot.labels.botIds) {
      const entity = byId.get(entityId);
      const posture = choice(answers[`posture_${label}`]);
      const targetAnswer = choice(answers[`target_${label}`]);
      const fireAnswer = answers[`fire_${label}`];
      const threatAnswer = answers[`threat_${label}`];
      const threat = threatAnswer && threatAnswer.type === 'score' ? threatAnswer.score : 0;
      const entry = (applied: boolean, reason: string, order: AiOrder | null): void => log({
        t: view.timeS, team, id: entityId, posture: order?.posture ?? posture?.choice ?? null, target: order?.targetId ?? null,
        fire: order?.fire ?? null, threat: Math.round(threat * 100) / 100, confidence: posture?.confidence ?? 0, applied, reason,
      });
      if (!entity || !alive(entity) || !entity.aiCtl?.setOrder) {
        row.discardedDead++;
        entry(false, 'dead', null);
        continue;
      }
      const hpNow = fraction(entity.combat!.hp, entity.combat!.maxHp);
      const hpThen = snapshot.hp.get(entityId) ?? hpNow;
      if (hpThen - hpNow > 0.35) {
        row.discardedChanged++;
        entry(false, 'changed', null);
        continue;
      }
      if (!posture || !isPosture(posture.choice)) {
        row.unmapped++;
        entry(false, 'no_posture', null);
        continue;
      }
      if (posture.confidence < minPostureConfidence) {
        row.lowConfidence++;
        entry(false, 'low_confidence', null);
        continue;
      }
      let targetId: string | null = null;
      if (targetAnswer && targetAnswer.choice !== JEV_TARGET_NONE && targetAnswer.confidence >= minTargetConfidence) {
        const candidateId = snapshot.labels.enemyIds.get(targetAnswer.choice) ?? null;
        const candidate = candidateId ? byId.get(candidateId) : null;
        if (candidate && alive(candidate) && (!view.spotting || view.spotting.isSpotted(candidate.id, team))) targetId = candidate.id;
      }
      let point: { x: number; z: number } | null = null;
      let mapped: AiOrderPosture = posture.choice;
      if (mapped === 'capture') {
        const own = view.objectiveFor?.(entity) ?? null;
        point = focusPoint ?? (own ? { x: own.x, z: own.z } : null);
        if (!point) {
          row.unmapped++;
          entry(false, 'no_objective', null);
          continue;
        }
      } else if (mapped === 'support') {
        let weakest: JevCommanderEntity | null = null, weakestHp = Infinity;
        for (const friend of ours) {
          if (friend === entity || !friend.state || !friend.combat) continue;
          const friendHp = fraction(friend.combat.hp, friend.combat.maxHp);
          if (friendHp < weakestHp) { weakestHp = friendHp; weakest = friend; }
        }
        if (!weakest) {
          row.unmapped++;
          entry(false, 'no_teammate', null);
          continue;
        }
        point = { x: weakest.state!.pos.x, z: weakest.state!.pos.z };
      }
      const fire: AiOrder['fire'] = fireAnswer && fireAnswer.type === 'noul'
        ? fireAnswer.noul >= 0.7 ? 'press' : fireAnswer.noul <= 0.3 ? 'hold' : null : null;
      const order: AiOrder = { posture: mapped, targetId, fire, threat, point, untilS: view.timeS + orderTtlS };
      entity.aiCtl.setOrder(order);
      row.ordersApplied++;
      entry(true, 'applied', order);
    }
  }

  function settle(view: JevBattleView): void {
    while (arrivals.length) {
      const arrival = arrivals.shift()!;
      const { team } = arrival.pending;
      if (inFlight.get(team) === arrival.pending) inFlight.delete(team);
      const row = teamStats(team);
      const latency = arrival.latencyMs;
      row.lastLatencyMs = Math.round(latency);
      if (arrival.result.ok) {
        row.answered++;
        row.maxLatencyMs = Math.max(row.maxLatencyMs, Math.round(latency));
        row.meanLatencyMs = Math.round(row.meanLatencyMs + (latency - row.meanLatencyMs) / row.answered);
        row.lastError = null;
        row.backoffS = 0;
        failures.set(team, 0);
        if (active) applyAnswers(view, arrival, arrival.result.body);
        continue;
      }
      row.failed++;
      row.lastError = arrival.result.error;
      // back off: doubling from two seconds to thirty, or what the proxy asked for
      const count = (failures.get(team) ?? 0) + 1;
      failures.set(team, count);
      const askedS = arrival.result.retryAfterMs ? arrival.result.retryAfterMs / 1000 : 0;
      const backoffS = Math.max(askedS, Math.min(30, cadenceS * 2 ** (count - 1)));
      row.backoffS = backoffS;
      nextAtS.set(team, Math.max(nextAtS.get(team) ?? 0, view.timeS + backoffS));
    }
  }

  return {
    teams,
    get active() { return active; },
    orderLog,
    stats(team?: string): JevTeamStats {
      if (team) return teamStats(team);
      const total = emptyStats();
      let answered = 0;
      for (const row of stats.values()) {
        total.requests += row.requests; total.answered += row.answered; total.failed += row.failed; total.skippedQuiet += row.skippedQuiet;
        total.budgetSpent = total.budgetSpent || row.budgetSpent; total.ordersApplied += row.ordersApplied;
        total.discardedStale += row.discardedStale; total.discardedDead += row.discardedDead; total.discardedChanged += row.discardedChanged;
        total.lowConfidence += row.lowConfidence; total.unmapped += row.unmapped; total.inputTokens += row.inputTokens; total.outputTokens += row.outputTokens;
        total.lastLatencyMs = row.lastLatencyMs || total.lastLatencyMs; total.maxLatencyMs = Math.max(total.maxLatencyMs, row.maxLatencyMs);
        total.meanLatencyMs += row.meanLatencyMs * row.answered; answered += row.answered;
        total.lastError = row.lastError ?? total.lastError; total.backoffS = Math.max(total.backoffS, row.backoffS);
      }
      total.meanLatencyMs = answered ? Math.round(total.meanLatencyMs / answered) : 0;
      return total;
    },
    commands(entity) {
      return !!entity.bot && !entity.isPlayer && commanded.has(entity.team);
    },
    step(view: JevBattleView): void {
      settle(view);
      if (!active) return;
      for (const team of teams) {
        if (inFlight.has(team) || view.timeS < (nextAtS.get(team) ?? 0)) continue;
        nextAtS.set(team, view.timeS + cadenceS);
        issue(view, team);
      }
    },
    stop(): void {
      active = false;
    },
    dispose(): void {
      active = false;
      disposed = true;
      for (const pending of inFlight.values()) pending.controller.abort();
      inFlight.clear();
      arrivals.length = 0;
    },
  };
}

/** A per-page-load session id: an opaque random token (never a player name), the proxy's budget key. */
function sessionId(): string {
  const random = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  const raw = random ? random.replace(/-/g, '') : `${Date.now().toString(36)}x${Math.round(performance.now() * 1000).toString(36)}`;
  return `s${raw}`.slice(0, 32);
}

/**
 * The browser transport: one same-origin POST per request to the proxy (or
 * VITE_JEV_URL), a bounded wait, and the proxy's error codes mapped onto the
 * commander's back-off. The session id is generated per page load and is the
 * only thing that identifies a browser to the proxy's budget.
 */
export function createJevFetchTransport({
  url = '/api/jev', fetch = globalThis.fetch, timeoutMs = 3500, sid = sessionId(),
}: { url?: string; fetch?: typeof globalThis.fetch; timeoutMs?: number; sid?: string } = {}): JevTransport {
  return {
    sid,
    async send(body, signal) {
      const controller = new AbortController();
      const abort = (): void => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, timeoutMs);
      try {
        const response = await fetch(url, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
          signal: controller.signal, credentials: 'same-origin',
        });
        let parsed: {} | null = null;
        try { parsed = await response.json() as {} | null; } catch (_) { parsed = null; }
        if (response.status !== 200) {
          const error = parsed && typeof parsed === 'object' && typeof (parsed as { error?: string }).error === 'string'
            ? (parsed as { error: string }).error : `http_${response.status}`;
          const retryAfterMs = parsed && typeof parsed === 'object' && typeof (parsed as { retryAfterMs?: number }).retryAfterMs === 'number'
            ? (parsed as { retryAfterMs: number }).retryAfterMs : undefined;
          return { ok: false, error, status: response.status, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
        }
        const reply = readJevResponse(parsed);
        return reply ? { ok: true, body: reply } : { ok: false, error: 'invalid_reply', status: 200 };
      } catch (error) {
        return { ok: false, error: controller.signal.aborted ? (signal.aborted ? 'aborted' : 'timeout') : error instanceof Error ? error.message : String(error) };
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      }
    },
  };
}
