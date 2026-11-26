// The brain a migration carries (275; game/ai.ts BotBrain). A migrated host's bot brain began at its construction's:
// its target and mode, the traffic it had settled with its allies (the deadlock and escape, a committed passing path),
// its detour side, its settle and press windows, its timers' phases, aim errors and stuck state. Frontline attackers
// that had sorted out who passes whom sorted it out again and parted 112 m from the old host's in 14 s (the lane's
// bisect: copying nine of those fields alone held them within 9 m; migrationTwins [1] pins the whole). The record
// carries every field the brain decides on from one tick to the next, where it differs from the construction both hosts
// build alike from the same seed.
//
// [1] The census (ai.ts read with the TypeScript parser): every `let` of createAI is carried by one of the record's
// lists or named below with the reason it is not, so a field added to the brain is decided here, not left behind; the
// getter and setter of each list name the same fields in one order; and the lists' text is pinned to BRAIN_LAYOUT (a
// record of another layout is refused whole, so a change to the lists bumps it). [2] Through the authority's bots: a
// brain's record survives the keyframe's JSON round trip (a non-finite clock as its name), a brain built alike takes it
// up exactly (its own capture after the take is the record), a fresh brain's record is empty (the construction), and a
// record of another layout, with a bad index, a bad value or a name outside its union changes nothing.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Vector3 } from 'three';
import { BRAIN_LAYOUT } from './ai.ts';
import { createMatchActor } from '../../server/match/matchActor.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };

/** createAI's fields the record leaves out, by reason (each a `let` of createAI). */
const NOT_CARRIED = {
  'the way, carried beside it (BotDrive, takeDrive)': ['wpIndex', 'waypointsPlanned', 'loopWaypoints', 'routeOwner', 'navGoalX', 'navGoalZ', 'navBestD',
    'navNoProgressT', 'missionRouteX', 'missionRouteZ', 'missionRouteAtS', 'missionRouteHasEnd'],
  'the hull and the world, read afresh': ['spec', 'heSlot', 'obstacles', 'gridList', 'gridListLength', 'gridMatchesList'],
  'the tick\'s own, set before any read in a tick': ['objectiveTick', 'objectiveReadTick', 'objectiveNow', 'inUpdate', 'nowS', 'hullNowS', 'allyAvoidingId',
    'allyClosestM', 'recoveryTurn', 'claimedSteer', 'tickTurnDecided', 'layFirstClamped', 'tickAllyYieldingPrev', 'driveOwner',
    // (bot-turbo-276) turboChaseM writes it, and only its own tick's Turbo probe reads it after that
    'turboChasesTank'],
  'the news queue, empty between steps (resume clears it)': ['pendingCount', 'pendingSeq', 'draining'],
  'a Watch park (a solo battle\'s)': ['parkedAtS', 'ownShellsFromId', 'parkTargetId', 'parkTargetX', 'parkTargetZ', 'parkTargetYaw', 'parkTargetReloadT',
    'parkHullX', 'parkHullY', 'parkHullZ', 'parkHullYaw'],
  'a commander\'s order (a solo battle\'s Jev)': ['order'],
  'carried as its own part of the record (BotBrain.r, .k)': ['combatRoute', 'lastFriendlyRisk'],
  'the record\'s own base (the construction)': ['brainBuilt'],
  // counts and readings the brain decides nothing on: read by debugInfo alone (the probes' surface), so they cost the
  // keyframe bytes and change no play
  'read by debugInfo alone': [
    'pocketEscapeUntilS', 'suspectUntilS', 'passivePresses', 'passivePressRepicks', 'passivePressCandidate',
    'missVerdicts', 'pressUnreached', 'searchLegsDisplaced', 'searchLegs', 'colliderStops', 'conserveHolds',
    'rackSpentVerdicts', 'objectiveShifts', 'zoneHoldMoves', 'missionReleases', 'levelRoutes', 'levelRoutesSuperseded',
    'unbearableVerdicts', 'ramRuns', 'lastRuns', 'friendlyBlockCount', 'friendlyLaneMoves', 'friendlyLaneSearches',
    'allyEmergencyStops', 'allyReverseEscapes', 'allyHoldGiveWays', 'deadLegs', 'ordersTaken', 'steerGoalX',
    'steerGoalZ', 'routeCornerFlips', 'wedgeReleases', 'cornersCrowded', 'pivotCreeps', 'pivotRollCuts', 'solidBrakes',
    'contactReleases', 'plannedLegRuns', 'plannedLegRejoins', 'ballShots', 'airShots', 'offensiveJumps', 'jockeyLegs',
    'ramHoldOffs', 'routeOutcome',
  ],
};
/** brainNumbers' fields in order (read by [1]; [2] finds one by name). */
const NUMBER_FIELDS = [];
/** The record's lists' text, pinned to BRAIN_LAYOUT: change the lists, bump the layout and pin the new digest here. */
const LAYOUT_DIGESTS = { 1: '0dcbb987c19e9f64' };

console.log('[1] the census: every createAI field carried or named, each list read and written in one order');
{
  const file = new URL('./ai.ts', import.meta.url);
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile('ai.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let createAI = null;
  sf.forEachChild((node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'createAI') createAI = node; });
  assert.ok(createAI, 'createAI found');
  const lets = [], fns = new Map(), arrows = new Map();
  for (const statement of createAI.body.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) fns.set(statement.name.text, statement);
    if (!ts.isVariableStatement(statement)) continue;
    const isLet = (statement.declarationList.flags & ts.NodeFlags.Let) !== 0;
    for (const d of statement.declarationList.declarations) {
      if (!ts.isIdentifier(d.name)) continue;
      if (isLet) lets.push(d.name.text);
      else if (d.initializer && ts.isArrowFunction(d.initializer)) arrows.set(d.name.text, d.initializer);
    }
  }
  const returned = (fn) => { const ret = fn?.body?.statements?.find((st) => ts.isReturnStatement(st)); return ret?.expression && ts.isArrayLiteralExpression(ret.expression) ? ret.expression.elements.map((e) => e.getText(sf)) : null; };
  const assigned = (fn) => { const st = fn?.body?.statements?.find((s) => ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && ts.isArrayLiteralExpression(s.expression.left));
    return st ? st.expression.left.elements.map((e) => e.getText(sf)) : null; };
  const numbers = returned(fns.get('brainNumbers')), numbersSet = assigned(fns.get('setBrainNumbers'));
  NUMBER_FIELDS.push(...(numbers ?? []));
  const flags = returned(fns.get('brainFlags')), flagsSet = assigned(fns.get('setBrainFlags'));
  const names = returned(fns.get('brainNames'));
  const hullsNode = arrows.get('brainHulls');
  const hulls = hullsNode && ts.isArrayLiteralExpression(hullsNode.body) ? hullsNode.body.elements.map((e) => e.getText(sf)) : null;
  ok(!!numbers && !!numbersSet && JSON.stringify(numbers) === JSON.stringify(numbersSet), `brainNumbers and setBrainNumbers name the same ${numbers?.length} fields in one order`);
  ok(!!flags && !!flagsSet && JSON.stringify(flags) === JSON.stringify(flagsSet), `brainFlags and setBrainFlags name the same ${flags?.length} fields in one order`);
  const nameSetter = fns.get('setBrainNames')?.getText(sf) ?? '';
  ok(!!names && names.every((name, i) => nameSetter.includes(`${name} = values[${i}]`)) && (nameSetter.match(/= values\[/g) ?? []).length === names.length,
    `setBrainNames writes each of brainNames' ${names?.length} fields (${names?.join(', ')})`);
  ok(!!hulls && hulls.length === 4, `the record holds ${hulls?.length} hulls by id (${hulls?.join(', ')})`);
  const base = (field) => field.split(/[.[]/)[0];
  const carried = new Set([...(numbers ?? []), ...(flags ?? []), ...(names ?? []), ...(hulls ?? [])].map(base));
  const named = Object.values(NOT_CARRIED).flat();
  const unknown = named.filter((name) => !lets.includes(name));
  const both = named.filter((name) => carried.has(name));
  const missing = lets.filter((name) => !carried.has(name) && !named.includes(name));
  ok(!unknown.length, `every field named as not carried is a createAI let (${unknown.join(', ') || 'all'})`);
  ok(!both.length, `no field is both carried and named as not carried (${both.join(', ') || 'none'})`);
  ok(!missing.length, `every createAI let is carried or named (${lets.length} lets; ${missing.length ? `left undecided: ${missing.join(', ')}` : `${carried.size} carried, ${named.length} named`})`);
  const digest = createHash('sha256').update(JSON.stringify([numbers, flags, names, hulls])).digest('hex').slice(0, 16);
  const pinned = LAYOUT_DIGESTS[BRAIN_LAYOUT];
  ok(pinned === undefined ? false : pinned === null ? true : pinned === digest, `the lists' text is the layout's (BRAIN_LAYOUT ${BRAIN_LAYOUT}: digest ${digest}${pinned
    ? `, pinned ${pinned}` : pinned === null ? ', unpinned' : ', no digest pinned for this layout'}; a change to the lists bumps BRAIN_LAYOUT and pins its digest here)`);
}

console.log('[2] the record through the authority\'s bots: JSON-safe, taken up exactly, a bad one refused');
{
  const spec = 'm1a1_abrams_hc';
  await ensureAuthorityFleet([spec]);
  const mode = 'frontline_assault';
  const bots = [...[0, 1, 2].map((i) => ({ playerId: `a-${i}`, name: `A${i}`, team: 'alpha', specId: spec })),
    ...[0, 1, 2].map((i) => ({ playerId: `d-${i}`, name: `D${i}`, team: 'bravo', specId: spec }))];
  const world = { mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] };
  const make = () => createMatchActor({ roomId: 'brain-record', mapId: 'verdant', mode, seed: 11, seats: [], bots, ruleset: matchRulesetFor(mode), world,
    countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {} });
  // (a bot's opening route, laid after its brain is built, moves a few of its fields alike on every host)
  const fresh = make(), built = fresh.authority.entityById.get('a-0').aiCtl, opening = built.captureBrain();
  ok(!opening || (opening.n?.length ?? 0) / 2 < 12, `a brain as built records next to nothing: its construction is the record's base (${opening
    ? `${(opening.n?.length ?? 0) / 2} numbers its opening route moved` : 'nothing'})`);
  const old = make(), sim = old.authority;
  sim.onMatchReady();
  for (let k = 0; k < 600; k++) { sim.step({ dt: 1 / 60, inputs: new Map() }); sim.afterEventBroadcast(); }
  const brain = sim.entityById.get('a-0').aiCtl;
  const record = brain.captureBrain();
  const text = JSON.stringify(record);
  const parsed = JSON.parse(text);
  ok(!!record && record.v === BRAIN_LAYOUT && (record.n?.length ?? 0) > 20 && JSON.stringify(parsed) === text && !/NaN|null,null/.test(JSON.stringify(record.n)),
    `a brain 10 s on records what differs from its construction, JSON-safe (${text.length} bytes; ${(record?.n?.length ?? 0) / 2} numbers, ${record?.f?.length ?? 0} flags, `
      + `${(record?.s?.length ?? 0) / 2} names, ${(record?.h?.length ?? 0) / 2} hulls)`);
  ok(text.includes('"Infinity"') || text.includes('"-Infinity"') || !Object.values(record).flat().some((v) => typeof v === 'number' && !Number.isFinite(v)),
    'a non-finite clock travels as its name');
  const taker = make();
  const target = taker.authority.entityById.get('a-0').aiCtl;
  target.takeBrain(parsed, 0, (id) => taker.authority.entityById.get(id));
  ok(JSON.stringify(target.captureBrain()) === text, 'a brain built alike takes the record up exactly: its own capture after the take is the record');
  // from a row newer than the capture, what the brain measures from its own hull is resume()'s, but its target's reload is
  // the record's (round 1 review: resume() reads none, a new brain holding no target, and 0 read a reloading target as just
  // fired on the first tick)
  const reloadAt = NUMBER_FIELDS.indexOf('prevTargetReloadT');
  const pairs = [];
  for (let i = 0; i < (parsed.n ?? []).length; i += 2) if (parsed.n[i] !== reloadAt) pairs.push(parsed.n[i], parsed.n[i + 1]);
  const withReload = { ...parsed, n: [...pairs, reloadAt, 3.25] };
  const later = make(), laterBrain = later.authority.entityById.get('a-0').aiCtl;
  laterBrain.takeBrain(withReload, 0.5, (id) => later.authority.entityById.get(id));
  const takenN = laterBrain.captureBrain()?.n ?? [];
  const takenReload = takenN.find((v, i) => i % 2 === 0 && v === reloadAt) === undefined ? null : takenN[takenN.indexOf(reloadAt) + 1];
  ok(reloadAt >= 0 && takenReload === 3.25, `taken from a row 0.5 s newer, the target's reload is the record's (${takenReload} against 3.25)`);
  later.stop();
  const corrupt = [
    ['another layout', { ...parsed, v: BRAIN_LAYOUT + 1 }],
    ['an index out of range', { ...parsed, n: [100000, 1] }],
    ['an odd pair list', { ...parsed, n: [0] }],
    ['a value that is not a number', { ...parsed, n: [0, 'x'] }],
    ['a mode outside its union', { ...parsed, s: [0, 'dance'] }],
    ['a flag index out of range', { ...parsed, f: [9999] }],
    ['a hull id that is not a string', { ...parsed, h: [0, 5] }],
    ['a route of odd length', { ...parsed, r: [1, 2, 3] }],
    ['ability clocks that are not five', { ...parsed, a: [1, 2] }],
  ];
  for (const [what, bad] of corrupt) {
    const other = make(), ctl = other.authority.entityById.get('a-0').aiCtl, before = JSON.stringify(ctl.captureBrain());
    ctl.takeBrain(bad, 0, (id) => other.authority.entityById.get(id));
    ok(JSON.stringify(ctl.captureBrain()) === before, `a record with ${what} changes nothing`);
    other.stop();
  }
  fresh.stop(); old.stop(); taker.stop();
}

if (failures) { console.error(`ai.brainRecord.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.brainRecord.selftest: every brain field is carried or named, the record round-trips exactly and a bad one changes nothing');
