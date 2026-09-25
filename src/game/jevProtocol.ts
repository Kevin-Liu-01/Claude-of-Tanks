/**
 * Jev commander wire protocol (docs/JEV-COMMANDER.md).
 *
 * One compact, text-only battle document per TEAM per request. The browser
 * (game/jevCommander.ts) builds the document and sends it to the same-origin
 * proxy (api/jev.ts); the proxy validates it, builds the TypeSafe questions
 * SERVER-SIDE from this module and forwards them to Jev with the server-held
 * key. The client never sends a prompt, only state, and the document never
 * carries a player name, a room code, an address or a raw coordinate.
 *
 * Pure module: no DOM, no imports — the proxy, the commander and both receipts
 * share it.
 */

export const JEV_PROTOCOL_VERSION = 1;
export const JEV_MODEL = 'jev-latest';

/** Bounds every document is clamped to before it leaves the browser and refused past on the server. */
export const JEV_LIMITS = Object.freeze({
  bots: 20,
  enemies: 24,
  objectives: 8,
  seesPerBot: 4,
  seenBy: 6,
  modules: 4,
  text: 48,
});

const LABEL_RE = /^[be][1-9][0-9]?$/;
const OBJECTIVE_ID_RE = /^[a-z][a-z0-9_]{0,23}$/;
const SID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const KINDS = new Set(['team_orders']);

export const JEV_POSTURES = Object.freeze([
  'hold', 'push', 'flank_left', 'flank_right', 'retreat', 'capture', 'support',
] as const);
export type JevPosture = (typeof JEV_POSTURES)[number];

const BEARINGS = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
const FACINGS = new Set(['toward us', 'side-on', 'away']);
const OWNERS = new Set(['ours', 'theirs', 'nobody']);
const OBJECTIVE_KINDS = new Set(['zone', 'sector', 'flag', 'goal', 'ball', 'cache']);
const GUN_RE = /^(ready|reloading \d{1,3} s|empty)$/;

export interface JevSeenEnemy {
  readonly id: string;
  readonly m: number;
}

export interface JevBotView {
  readonly vehicle: string;
  readonly class: string;
  readonly role: string;
  readonly hp: number;
  readonly ammo: number;
  readonly gun: string;
  readonly moving: boolean;
  readonly under_fire: boolean;
  readonly modules_damaged: readonly string[];
  readonly sees: readonly JevSeenEnemy[];
  readonly nearest_ally_m: number | null;
  readonly objective: { readonly bearing: string; readonly distance_m: number } | null;
  readonly current_target: string | null;
  readonly current_stance: string;
}

export interface JevEnemyView {
  readonly vehicle: string;
  readonly class: string;
  readonly human_player: boolean;
  readonly hp: number;
  readonly distance_m: number;
  readonly bearing: string;
  readonly facing: string;
  readonly moving: boolean;
  readonly on_objective: boolean;
  readonly seen_by: readonly string[];
  readonly engaged_by: readonly string[];
}

export interface JevObjectiveView {
  readonly kind: string;
  readonly owner: string;
  readonly contested: boolean;
  readonly distance_m: number;
  readonly bearing: string;
}

export interface JevBattleState {
  readonly v: number;
  readonly battle: {
    readonly mode: string;
    readonly goal: string;
    readonly elapsed_s: number;
    readonly remaining_s: number | null;
    readonly score: { readonly ours: number; readonly theirs: number; readonly target: number } | null;
    readonly alive: { readonly ours: number; readonly theirs: number };
    /** The human player when it fights on THIS side (it takes no orders; the enemy view lists it under `enemies`). */
    readonly human_ally: { readonly vehicle: string; readonly hp: number; readonly distance_m: number; readonly bearing: string } | null;
  };
  readonly our_tanks: Readonly<Record<string, JevBotView>>;
  readonly enemies: Readonly<Record<string, JevEnemyView>>;
  readonly objectives: Readonly<Record<string, JevObjectiveView>>;
}

export interface JevRequestBody {
  readonly v: number;
  readonly sid: string;
  readonly kind: 'team_orders';
  readonly state: JevBattleState;
}

type Text = string | Record<string, unknown> | readonly unknown[];

export type JevQuestion =
  | { readonly type: 'choice'; readonly instructions: Text; readonly criteria: Readonly<Record<string, Text | null>> }
  | { readonly type: 'noul'; readonly instructions: Text; readonly criteria?: { readonly true: Text; readonly false: Text } }
  | { readonly type: 'score'; readonly instructions: Text; readonly criteria: readonly Text[] };

export type JevAnswer =
  | { readonly type: 'choice'; readonly choice: string; readonly probabilities: Readonly<Record<string, number>>; readonly confidence: number }
  | { readonly type: 'noul'; readonly noul: number }
  | { readonly type: 'score'; readonly score: number; readonly probabilities: Readonly<Record<string, number>>; readonly confidence: number };

export interface JevUsage {
  readonly input_tokens: number;
  readonly output_tokens: number;
}

export interface JevResponseBody {
  readonly v: number;
  readonly model: string;
  readonly answers: Readonly<Record<string, JevAnswer>>;
  readonly usage: JevUsage;
  readonly latencyMs: number;
}

type Unknown = {} | null | undefined;

function isRecord(value: Unknown): value is Record<string, Unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: Unknown, max: number = JEV_LIMITS.text): value is string {
  // eslint-disable-next-line no-control-regex
  return typeof value === 'string' && value.length >= 1 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

function isFraction(value: Unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isMetres(value: Unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5000;
}

function isLabelList(value: Unknown, prefix: 'b' | 'e', max: number): value is string[] {
  return Array.isArray(value) && value.length <= max
    && value.every((item) => typeof item === 'string' && LABEL_RE.test(item) && item.startsWith(prefix));
}

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

function fail<T>(error: string): Validation<T> {
  return { ok: false, error };
}

/** Field names that would carry personal data; a document naming one anywhere is refused. */
const PII_FIELDS = new Set([
  'ip', 'ipaddress', 'ua', 'useragent', 'name', 'playername', 'player', 'nick', 'nickname', 'email',
  'room', 'roomcode', 'host', 'hostname', 'cookie', 'token', 'sessiontoken', 'auth', 'password',
  'phone', 'address', 'x', 'z', 'pos', 'position',
]);

function piiField(value: Unknown, depth = 0): string | null {
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = piiField(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    if (PII_FIELDS.has(key.toLowerCase())) return key;
    const hit = piiField(item, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function readBot(raw: Unknown, enemyIds: ReadonlySet<string>): Validation<JevBotView> {
  if (!isRecord(raw)) return fail('invalid_state:bot');
  if (!isText(raw.vehicle) || !isText(raw.class) || !isText(raw.role, 16)) return fail('invalid_state:bot.vehicle');
  if (!isFraction(raw.hp) || !isFraction(raw.ammo)) return fail('invalid_state:bot.hp');
  if (!isText(raw.gun, 20) || !GUN_RE.test(raw.gun)) return fail('invalid_state:bot.gun');
  if (typeof raw.moving !== 'boolean' || typeof raw.under_fire !== 'boolean') return fail('invalid_state:bot.moving');
  const modules = raw.modules_damaged;
  if (!Array.isArray(modules) || modules.length > JEV_LIMITS.modules || !modules.every((m) => isText(m, 16))) {
    return fail('invalid_state:bot.modules_damaged');
  }
  const sees = raw.sees;
  if (!Array.isArray(sees) || sees.length > JEV_LIMITS.seesPerBot) return fail('invalid_state:bot.sees');
  const seen: JevSeenEnemy[] = [];
  for (const item of sees) {
    if (!isRecord(item) || typeof item.id !== 'string' || !enemyIds.has(item.id) || !isMetres(item.m)) {
      return fail('invalid_state:bot.sees');
    }
    seen.push({ id: item.id, m: item.m });
  }
  if (raw.nearest_ally_m !== null && !isMetres(raw.nearest_ally_m)) return fail('invalid_state:bot.nearest_ally_m');
  let objective: JevBotView['objective'] = null;
  if (raw.objective !== null) {
    if (!isRecord(raw.objective) || typeof raw.objective.bearing !== 'string' || !BEARINGS.has(raw.objective.bearing)
        || !isMetres(raw.objective.distance_m)) return fail('invalid_state:bot.objective');
    objective = { bearing: raw.objective.bearing, distance_m: raw.objective.distance_m };
  }
  if (raw.current_target !== null && (typeof raw.current_target !== 'string' || !enemyIds.has(raw.current_target))) {
    return fail('invalid_state:bot.current_target');
  }
  if (!isText(raw.current_stance, 16)) return fail('invalid_state:bot.current_stance');
  return { ok: true, value: {
    vehicle: raw.vehicle, class: raw.class, role: raw.role, hp: raw.hp, ammo: raw.ammo, gun: raw.gun,
    moving: raw.moving, under_fire: raw.under_fire, modules_damaged: modules.map(String), sees: seen,
    nearest_ally_m: raw.nearest_ally_m, objective, current_target: raw.current_target, current_stance: raw.current_stance,
  } };
}

function readEnemy(raw: Unknown, botIds: ReadonlySet<string>): Validation<JevEnemyView> {
  if (!isRecord(raw)) return fail('invalid_state:enemy');
  if (!isText(raw.vehicle) || !isText(raw.class)) return fail('invalid_state:enemy.vehicle');
  if (typeof raw.human_player !== 'boolean' || typeof raw.moving !== 'boolean' || typeof raw.on_objective !== 'boolean') {
    return fail('invalid_state:enemy.flags');
  }
  if (!isFraction(raw.hp) || !isMetres(raw.distance_m)) return fail('invalid_state:enemy.hp');
  if (typeof raw.bearing !== 'string' || !BEARINGS.has(raw.bearing)) return fail('invalid_state:enemy.bearing');
  if (typeof raw.facing !== 'string' || !FACINGS.has(raw.facing)) return fail('invalid_state:enemy.facing');
  if (!isLabelList(raw.seen_by, 'b', JEV_LIMITS.seenBy) || !raw.seen_by.every((id) => botIds.has(id))) return fail('invalid_state:enemy.seen_by');
  if (!isLabelList(raw.engaged_by, 'b', JEV_LIMITS.seenBy) || !raw.engaged_by.every((id) => botIds.has(id))) return fail('invalid_state:enemy.engaged_by');
  return { ok: true, value: {
    vehicle: raw.vehicle, class: raw.class, human_player: raw.human_player, hp: raw.hp, distance_m: raw.distance_m,
    bearing: raw.bearing, facing: raw.facing, moving: raw.moving, on_objective: raw.on_objective,
    seen_by: raw.seen_by, engaged_by: raw.engaged_by,
  } };
}

function readObjective(raw: Unknown): Validation<JevObjectiveView> {
  if (!isRecord(raw)) return fail('invalid_state:objective');
  if (typeof raw.kind !== 'string' || !OBJECTIVE_KINDS.has(raw.kind)) return fail('invalid_state:objective.kind');
  if (typeof raw.owner !== 'string' || !OWNERS.has(raw.owner)) return fail('invalid_state:objective.owner');
  if (typeof raw.contested !== 'boolean' || !isMetres(raw.distance_m)) return fail('invalid_state:objective.distance_m');
  if (typeof raw.bearing !== 'string' || !BEARINGS.has(raw.bearing)) return fail('invalid_state:objective.bearing');
  return { ok: true, value: { kind: raw.kind, owner: raw.owner, contested: raw.contested, distance_m: raw.distance_m, bearing: raw.bearing } };
}

function readLabelled<T>(
  raw: Unknown, pattern: RegExp, limit: number, field: string,
  read: (item: Unknown) => Validation<T>,
): Validation<Record<string, T>> {
  if (!isRecord(raw)) return fail(`invalid_state:${field}`);
  const keys = Object.keys(raw);
  if (keys.length > limit) return fail(`invalid_state:${field}.count`);
  const out: Record<string, T> = {};
  for (const key of keys) {
    if (!pattern.test(key)) return fail(`invalid_state:${field}.id`);
    const item = read(raw[key]);
    if (!item.ok) return item;
    out[key] = item.value;
  }
  return { ok: true, value: out };
}

/**
 * Validate one battle document: every field bounded, every reference resolved,
 * no personal field name anywhere. Unknown fields are dropped, not refused.
 */
export function validateJevState(input: Unknown): Validation<JevBattleState> {
  if (!isRecord(input)) return fail('invalid_state');
  const pii = piiField(input);
  if (pii) return fail(`pii_field:${pii}`);
  if (input.v !== JEV_PROTOCOL_VERSION) return fail('invalid_state:v');
  const battle = input.battle;
  if (!isRecord(battle)) return fail('invalid_state:battle');
  if (!isText(battle.mode, 24) || !isText(battle.goal, 160)) return fail('invalid_state:battle.mode');
  if (!isMetres(battle.elapsed_s) || (battle.remaining_s !== null && !isMetres(battle.remaining_s))) return fail('invalid_state:battle.clock');
  let score: JevBattleState['battle']['score'] = null;
  if (battle.score !== null) {
    if (!isRecord(battle.score) || !isMetres(battle.score.ours) || !isMetres(battle.score.theirs) || !isMetres(battle.score.target)) {
      return fail('invalid_state:battle.score');
    }
    score = { ours: battle.score.ours, theirs: battle.score.theirs, target: battle.score.target };
  }
  if (!isRecord(battle.alive) || !isMetres(battle.alive.ours) || !isMetres(battle.alive.theirs)) return fail('invalid_state:battle.alive');
  let humanAlly: JevBattleState['battle']['human_ally'] = null;
  if (battle.human_ally !== null && battle.human_ally !== undefined) {
    const ally = battle.human_ally;
    if (!isRecord(ally) || !isText(ally.vehicle) || !isFraction(ally.hp) || !isMetres(ally.distance_m)
        || typeof ally.bearing !== 'string' || !BEARINGS.has(ally.bearing)) return fail('invalid_state:battle.human_ally');
    humanAlly = { vehicle: ally.vehicle, hp: ally.hp, distance_m: ally.distance_m, bearing: ally.bearing };
  }
  const botIds = new Set(isRecord(input.our_tanks) ? Object.keys(input.our_tanks) : []);
  const enemyIds = new Set(isRecord(input.enemies) ? Object.keys(input.enemies) : []);
  const ourTanks = readLabelled(input.our_tanks, /^b[1-9][0-9]?$/, JEV_LIMITS.bots, 'our_tanks', (item) => readBot(item, enemyIds));
  if (!ourTanks.ok) return ourTanks;
  if (Object.keys(ourTanks.value).length === 0) return fail('invalid_state:our_tanks.empty');
  const enemies = readLabelled(input.enemies, /^e[1-9][0-9]?$/, JEV_LIMITS.enemies, 'enemies', (item) => readEnemy(item, botIds));
  if (!enemies.ok) return enemies;
  const objectives = readLabelled(input.objectives ?? {}, OBJECTIVE_ID_RE, JEV_LIMITS.objectives, 'objectives', readObjective);
  if (!objectives.ok) return objectives;
  return { ok: true, value: {
    v: JEV_PROTOCOL_VERSION,
    battle: {
      mode: battle.mode, goal: battle.goal, elapsed_s: battle.elapsed_s, remaining_s: battle.remaining_s,
      score, alive: { ours: battle.alive.ours, theirs: battle.alive.theirs }, human_ally: humanAlly,
    },
    our_tanks: ourTanks.value, enemies: enemies.value, objectives: objectives.value,
  } };
}

/** Validate the whole request envelope the proxy accepts. */
export function validateJevRequest(input: Unknown): Validation<JevRequestBody> {
  if (!isRecord(input)) return fail('invalid_body');
  if (input.v !== JEV_PROTOCOL_VERSION) return fail('invalid_body:v');
  if (typeof input.sid !== 'string' || !SID_RE.test(input.sid)) return fail('invalid_body:sid');
  if (typeof input.kind !== 'string' || !KINDS.has(input.kind)) return fail('invalid_body:kind');
  const state = validateJevState(input.state);
  if (!state.ok) return state;
  return { ok: true, value: { v: JEV_PROTOCOL_VERSION, sid: input.sid, kind: 'team_orders', state: state.value } };
}

// Every bot's posture question repeats these criteria, so they are terse: input tokens are the whole bill
// (measured 2026-09-25: 7 bots = 27 questions; the criteria were most of the request before this trim).
const POSTURE_CRITERIA: Readonly<Record<JevPosture, string>> = Object.freeze({
  hold: 'Fight from the current position or hull-down spot: it has cover, the enemy comes to it, or it is outnumbered.',
  push: 'Close on its target or the nearest enemy at full throttle: the enemy is weak, isolated, reloading, or outnumbered there.',
  flank_left: 'Swing round the left of its target to the side or rear armour: a front our shells do not penetrate, a target busy elsewhere.',
  flank_right: 'Swing round the right of its target to the side or rear armour: a front our shells do not penetrate, a target busy elsewhere.',
  retreat: 'Fall back to friendly support or away from the threat: low hull points, damaged tracks or engine, alone against several.',
  capture: 'Drive to the objective and take or hold it: a zone, sector, flag or goal matters more than this duel.',
  support: 'Move to the weakest or most pressed teammate and fight beside it: a teammate about to die that this tank can reach.',
});

const THREAT_LEVELS = Object.freeze([
  'safe: no enemy can reach it, hull healthy',
  'pressured: one enemy can engage it, or somewhat damaged',
  'in danger: several enemies can engage it, or badly damaged with an enemy in view',
  'about to die: low hull points, under fire from several enemies, no cover',
]);

/** The team-level focus option that means "no objective needs the team now". */
export const JEV_FOCUS_NONE = 'fight_where_we_stand';
/** The target option that means "engage nobody for now". */
export const JEV_TARGET_NONE = 'none';

function enemyLine(id: string, enemy: JevEnemyView): string {
  const who = enemy.human_player ? 'the human player' : 'a bot';
  return `\`enemies.${id}\`: ${enemy.vehicle} (${who}), ${enemy.hp} hull, ${enemy.facing}${enemy.on_objective ? ', on the objective' : ''}`;
}

/**
 * The question set for one team document — built on the server, never by the
 * browser. Every bot gets a posture and a threat question; a bot that sees an
 * enemy also gets a target choice over exactly those enemies and a fire
 * judgement; a battle with objectives gets one team focus choice. All of them
 * run in one request (speculative fan-out) and the commander consumes only the
 * answers the battle still needs.
 */
export function buildJevQuestions(state: JevBattleState): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  for (const [id, bot] of Object.entries(state.our_tanks)) {
    const path = `our_tanks.${id}`;
    questions[`posture_${id}`] = {
      type: 'choice',
      instructions: `Which posture should our tank \`${path}\` (a ${bot.vehicle}, ${bot.role} role) take for the next few seconds, given the whole battle picture in the state?`,
      criteria: POSTURE_CRITERIA,
    };
    questions[`threat_${id}`] = {
      type: 'score',
      instructions: `How much danger is our tank \`${path}\` in right now?`,
      criteria: THREAT_LEVELS,
    };
    if (bot.sees.length === 0) continue;
    const targets: Record<string, string> = {};
    for (const seen of bot.sees) {
      const enemy = state.enemies[seen.id];
      if (!enemy) continue;
      targets[seen.id] = `${enemyLine(seen.id, enemy)}, ${seen.m} m away`;
    }
    targets[JEV_TARGET_NONE] = 'No enemy is worth engaging right now: keep moving, hold or retreat instead.';
    questions[`target_${id}`] = {
      type: 'choice',
      instructions: `Which enemy should our tank \`${path}\` engage now? Prefer the one that threatens it or the team most, that it can hurt, that stands on the objective, or that a teammate already has under fire when finishing it wins the exchange.`,
      criteria: targets,
    };
    questions[`fire_${id}`] = {
      type: 'noul',
      instructions: `Should our tank \`${path}\` fire on its target as soon as its gun is laid, rather than holding the round?`,
      criteria: {
        true: 'Fire: the target is exposed, in range, damaged, or the fight is urgent.',
        false: 'Hold the round: the target is retreating out of range, unlikely to be hit or penetrated, or firing reveals the tank for no gain.',
      },
    };
  }
  const objectiveIds = Object.keys(state.objectives);
  if (objectiveIds.length) {
    const focus: Record<string, string> = {};
    for (const id of objectiveIds) {
      const objective = state.objectives[id];
      focus[id] = `\`objectives.${id}\`: a ${objective.kind} held by ${objective.owner}${objective.contested ? ', contested' : ''}, ${objective.distance_m} m ${objective.bearing}`;
    }
    focus[JEV_FOCUS_NONE] = 'No objective needs the team now: fight the enemy force where it stands.';
    questions.focus = {
      type: 'choice',
      instructions: 'Which objective should our whole team concentrate on for the next minute, given the score, the clock and where the enemies are?',
      criteria: focus,
    };
  }
  return questions;
}

function readProbabilities(raw: Unknown, keys: ReadonlySet<string> | null): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isFraction(value)) return null;
    if (keys && !keys.has(key)) return null;
    out[key] = value;
  }
  return out;
}

/**
 * Parse the upstream answers against the questions that were asked: an answer
 * of the wrong type, a choice outside its criteria or a malformed number is
 * dropped (the commander keeps the classic decision for it).
 */
export function parseJevAnswers(raw: Unknown, questions: Readonly<Record<string, JevQuestion>>): Record<string, JevAnswer> {
  const answers: Record<string, JevAnswer> = {};
  if (!isRecord(raw)) return answers;
  for (const [id, question] of Object.entries(questions)) {
    const answer = raw[id];
    if (!isRecord(answer) || answer.type !== question.type) continue;
    if (question.type === 'choice') {
      const options = new Set(Object.keys(question.criteria));
      const probabilities = readProbabilities(answer.probabilities, options);
      if (typeof answer.choice !== 'string' || !options.has(answer.choice) || !probabilities || !isFraction(answer.confidence)) continue;
      answers[id] = { type: 'choice', choice: answer.choice, probabilities, confidence: answer.confidence };
    } else if (question.type === 'noul') {
      if (!isFraction(answer.noul)) continue;
      answers[id] = { type: 'noul', noul: answer.noul };
    } else {
      const probabilities = readProbabilities(answer.probabilities, null);
      if (typeof answer.score !== 'number' || !Number.isFinite(answer.score) || answer.score < 0
          || answer.score > question.criteria.length - 1 || !probabilities || !isFraction(answer.confidence)) continue;
      answers[id] = { type: 'score', score: answer.score, probabilities, confidence: answer.confidence };
    }
  }
  return answers;
}

/** One answer of any type, structurally sound (the commander checks its meaning against its own labels). */
function readAnswer(raw: Unknown): JevAnswer | null {
  if (!isRecord(raw)) return null;
  if (raw.type === 'noul') return isFraction(raw.noul) ? { type: 'noul', noul: raw.noul } : null;
  if (raw.type === 'choice') {
    const probabilities = readProbabilities(raw.probabilities, null);
    if (typeof raw.choice !== 'string' || raw.choice.length > 32 || !probabilities || !isFraction(raw.confidence)) return null;
    return { type: 'choice', choice: raw.choice, probabilities, confidence: raw.confidence };
  }
  if (raw.type === 'score') {
    const probabilities = readProbabilities(raw.probabilities, null);
    if (typeof raw.score !== 'number' || !Number.isFinite(raw.score) || raw.score < 0 || raw.score > 9 || !probabilities || !isFraction(raw.confidence)) return null;
    return { type: 'score', score: raw.score, probabilities, confidence: raw.confidence };
  }
  return null;
}

/** Parse the proxy's reply in the browser: the envelope, the usage and every answer's shape; a bad answer is dropped. */
export function readJevResponse(raw: Unknown): JevResponseBody | null {
  if (!isRecord(raw) || raw.v !== JEV_PROTOCOL_VERSION || !isRecord(raw.answers) || !isRecord(raw.usage)) return null;
  const input = raw.usage.input_tokens, output = raw.usage.output_tokens;
  if (typeof input !== 'number' || typeof output !== 'number') return null;
  const answers: Record<string, JevAnswer> = {};
  for (const [id, item] of Object.entries(raw.answers)) {
    if (!/^[a-z]+(?:_b[1-9][0-9]?)?$/.test(id)) continue;
    const answer = readAnswer(item);
    if (answer) answers[id] = answer;
  }
  return {
    v: JEV_PROTOCOL_VERSION,
    model: typeof raw.model === 'string' ? raw.model.slice(0, 32) : '',
    answers,
    usage: { input_tokens: input, output_tokens: output },
    latencyMs: typeof raw.latencyMs === 'number' ? raw.latencyMs : 0,
  };
}

/** Compass word for a world bearing (radians, atan2(dx, dz): +Z north, +X east). */
export function bearingWord(radians: number): string {
  const words = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const turn = Math.PI * 2;
  const normalized = ((radians % turn) + turn) % turn;
  return words[Math.round(normalized / (Math.PI / 4)) % 8];
}
