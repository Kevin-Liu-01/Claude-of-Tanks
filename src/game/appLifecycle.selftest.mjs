// 2026-11-02 audit F1: game.phase had six unguarded writers, three of which (the Studio's entry and its failure, the
// engineering stills) announced nothing, and a dead 'ended' member. One lifecycle now owns the writes.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_PHASE_EDGES, AppPhaseTransitionError, GarageScreenUnsettledError, appLifecycleOf, assertAppPhaseTransition,
  assertGarageScreenSettled, battleSubPhase, canTransitionAppPhase, createAppLifecycle, deriveAppLifecycleState, transitionAppPhase,
} from './appLifecycle.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';

const game = () => ({ phase: 'garage', preBattleS: 0, result: null, resultTimeS: null, timeS: 0, ruleset: matchRulesetFor('standard') });

// Every phase move is announced, including the ones that announced nothing before (Studio, its failure, stills).
{
  const session = game();
  const heard = [];
  const lifecycle = createAppLifecycle({ game: session, announce: (event) => heard.push(event) });
  assert.equal(appLifecycleOf(session), lifecycle);
  transitionAppPhase(session, 'studio', { reason: 'studio:enter' });
  transitionAppPhase(session, 'garage', { reason: 'studio:entry-failed' });
  transitionAppPhase(session, 'shot', { reason: 'shot:view' });
  assert.deepEqual(heard.map(({ phase, from }) => `${from}>${phase}`), ['garage>studio', 'studio>garage', 'garage>shot']);
  assert.equal(heard[1].reason, 'studio:entry-failed');
  assert.equal(lifecycle.transitions, 3);
}

// Illegal hand-overs are refused before anything is written: a Studio never hands its scene to a battle.
{
  const session = game();
  const heard = [];
  createAppLifecycle({ game: session, announce: (event) => heard.push(event) });
  transitionAppPhase(session, 'studio', { reason: 'studio:enter' });
  assert.throws(() => transitionAppPhase(session, 'battle', { reason: 'solo-start' }),
    (error) => error instanceof AppPhaseTransitionError && error.from === 'studio' && error.to === 'battle');
  assert.equal(session.phase, 'studio', 'a refused edge writes nothing');
  assert.equal(heard.length, 1, 'a refused edge announces nothing');
  session.phase = 'battle';
  assert.throws(() => transitionAppPhase(session, 'studio', { reason: 'f8' }), AppPhaseTransitionError);
  assert.throws(() => transitionAppPhase(session, 'ended', { reason: 'dead' }), /unknown app phase/);
  for (const [from, to] of Object.entries(APP_PHASE_EDGES)) {
    assert.ok(to.includes(from), `${from}: re-entering a phase (a rematch in place, a retried return) is legal`);
  }
}

// The Garage return writes the Garage scene silently and announces it at its screen handoff: the screen phase (what
// the settings gear, the Esc Leave and the Studio key read) stays 'battle' while the report is still the screen.
{
  const session = game();
  session.phase = 'battle';
  const heard = [];
  let returnOwed = false;
  const lifecycle = createAppLifecycle({ game: session, announce: (event) => heard.push(event.phase), readers: {
    isReturnOwed: () => returnOwed,
  } });
  returnOwed = true;
  transitionAppPhase(session, 'garage', { reason: 'garage-return:prepare', announce: false });
  assert.equal(session.phase, 'garage');
  assert.equal(lifecycle.screenPhase, 'battle', 'the report is still the screen');
  assert.equal(lifecycle.state, 'returning');
  assert.deepEqual(heard, []);
  transitionAppPhase(session, 'garage', { reason: 'garage-return:screen' });
  assert.equal(lifecycle.screenPhase, 'garage');
  assert.equal(lifecycle.state, 'returning', 'a Garage still restoring under the veil is still returning');
  returnOwed = false;
  assert.equal(lifecycle.state, 'garage');
  assert.deepEqual(heard, ['garage']);
  assert.deepEqual(lifecycle.snapshot(), {
    state: 'garage', phase: 'garage', screenPhase: 'garage', transitions: 2, lastReason: 'garage-return:screen',
  });
  assert.ok(Object.isFrozen(lifecycle.snapshot()), 'tools read a frozen snapshot');
}

// The battle's sub-phases come from the authoritative fields alone.
{
  const session = game();
  session.phase = 'battle';
  session.preBattleS = Infinity;
  assert.equal(battleSubPhase(session), 'loading');
  session.preBattleS = 2.5;
  assert.equal(battleSubPhase(session), 'countdown');
  session.preBattleS = 0;
  assert.equal(battleSubPhase(session), 'live');
  session.result = 'victory';
  session.resultTimeS = 100;
  session.timeS = 100;
  assert.equal(battleSubPhase(session), 'verdict', 'the ending hold still steps the world');
  session.timeS = 100 + 3600;
  assert.equal(battleSubPhase(session), 'report');
  assert.equal(deriveAppLifecycleState(session, 'battle', { entryCovering: true }), 'loading',
    'an entry cover is loading whatever the count says');
  session.phase = 'studio';
  assert.equal(deriveAppLifecycleState(session, 'studio'), 'studio');
}

// A listener that moves the phase again is announced after the first announcement reached every listener.
{
  const session = game();
  const heard = [];
  const lifecycle = createAppLifecycle({ game: session, announce: (event) => {
    heard.push(`a:${event.phase}`);
    if (event.phase === 'battle') transitionAppPhase(session, 'garage', { reason: 'listener' });
    heard.push(`b:${event.phase}`);
  } });
  transitionAppPhase(session, 'battle', { reason: 'start' });
  assert.deepEqual(heard, ['a:battle', 'b:battle', 'a:garage', 'b:garage']);
  assert.equal(lifecycle.screenPhase, 'garage');
}

// The work between the write and the announcement runs in that order (the battle start's lighting swap).
{
  const session = game();
  const order = [];
  createAppLifecycle({ game: session, announce: () => order.push(`announce:${session.phase}`) });
  transitionAppPhase(session, 'battle', { reason: 'solo-start', beforeAnnounce: () => order.push(`lights:${session.phase}`) });
  assert.deepEqual(order, ['lights:battle', 'announce:battle']);
}

// A bare session (a selftest's game double) still gets the edge check and the write.
{
  const session = { phase: 'studio' };
  assert.throws(() => transitionAppPhase(session, 'battle', { reason: 'bare' }), AppPhaseTransitionError);
  transitionAppPhase(session, 'garage', { reason: 'bare' });
  assert.equal(session.phase, 'garage');
}

// Source contract: nothing else writes game.phase, the dead 'ended' member is gone, and main's readers that the
// hidden "Garage behind the report" state misled read the screen phase.
const srcRoot = fileURLToPath(new URL('..', import.meta.url));
const writers = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (!name.endsWith('.ts') || name.endsWith('.d.ts')) continue;
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/\bgame\.phase\s*=(?!=)/g)) {
      writers.push(`${relative(srcRoot, path)}:${text.slice(0, match.index).split('\n').length}`);
    }
  }
};
walk(srcRoot);
assert.deepEqual(writers.filter((at) => !at.startsWith('game/appLifecycle.ts')), [],
  'every game.phase writer goes through transitionAppPhase');
const stateCore = readFileSync(new URL('./stateCore.ts', import.meta.url), 'utf8');
assert.doesNotMatch(stateCore, /'ended'/, "the dead 'ended' phase is gone");
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.doesNotMatch(main, /garageAwaitingHandoff/, 'no reader patches the hidden state by hand');
assert.match(main, /canLeaveBattle: \(\) => appLifecycle\.screenPhase === 'battle'/);
assert.match(main, /gearVisible: \(\) => appLifecycle\.screenPhase === 'garage'/);
assert.match(main, /getPhase: \(\) => appLifecycle\.state,/, 'the Studio key opens over a settled Garage screen only');
assert.match(main, /Object\.defineProperty\(window, '__APP_LIFECYCLE', \{ configurable: true, get: \(\) => appLifecycle\.snapshot\(\) \}\)/,
  'tools read the lifecycle read-only');

// (2026-11-02 audit F1 review) the edge check alone, for writers that set their scene up before the phase write: the
// same table, the same error, nothing written and nothing announced
{
  const legal = (from, to) => { try { assertAppPhaseTransition({ phase: from }, to, 'check'); return true; } catch { return false; } };
  for (const [from, targets] of Object.entries(APP_PHASE_EDGES)) {
    for (const to of Object.keys(APP_PHASE_EDGES)) {
      assert.equal(legal(from, to), targets.includes(to), `${from} -> ${to}`);
      // (round 2, app-flow review 2) the same table as a question, for a start that refuses before its first mutation
      assert.equal(canTransitionAppPhase({ phase: from }, to), targets.includes(to), `can ${from} -> ${to}`);
    }
  }
  assert.equal(legal('ended', 'battle'), true, 'an unknown current value may move anywhere, as in transitionAppPhase');
  assert.equal(canTransitionAppPhase({ phase: 'ended' }, 'battle'), true);
  assert.equal(canTransitionAppPhase({ phase: 'garage' }, 'ended'), false, 'an unknown target is never legal');
  assert.throws(() => assertAppPhaseTransition({ phase: 'garage' }, 'ended', 'check'), TypeError, 'an unknown phase is refused');
  const heard = [];
  const session = { phase: 'battle', preBattleS: 0, result: null, resultTimeS: null, timeS: 0 };
  createAppLifecycle({ game: session, announce: (announcement) => heard.push(announcement) });
  assert.throws(() => assertAppPhaseTransition(session, 'studio', 'studio:enter'),
    (error) => error instanceof AppPhaseTransitionError && error.from === 'battle' && error.to === 'studio');
  assertAppPhaseTransition(session, 'garage', 'leave');
  assert.equal(session.phase, 'battle', 'the check never writes');
  assert.deepEqual(heard, [], 'and never announces');
}

// (round 2, app-flow review) An opening over the Garage's scene (the Studio's entry) needs the Garage to be the settled
// screen: garage -> studio is a legal edge, so under a battle entry's cover (a network round the room's session entered
// with no launch of its own) only this check refuses it. It never writes; another phase is the edge table's.
{
  const session = game();
  let covering = true;
  let returnOwed = false;
  createAppLifecycle({ game: session, announce() {}, readers: { isEntryCovering: () => covering, isReturnOwed: () => returnOwed } });
  assert.throws(() => assertGarageScreenSettled(session, 'studio:enter'),
    (error) => error instanceof GarageScreenUnsettledError && error.code === 'garage_unsettled' && error.state === 'loading'
      && error.reason === 'studio:enter');
  covering = false;
  returnOwed = true;
  assert.throws(() => assertGarageScreenSettled(session, 'studio:enter'), (error) => error.state === 'returning');
  returnOwed = false;
  assertGarageScreenSettled(session, 'studio:enter');
  session.phase = 'shot';
  covering = true;
  assertGarageScreenSettled(session, 'studio:enter'); // a dev still: the edge table decides
  assert.equal(session.phase, 'shot', 'the check never writes');
  const bare = game();
  assertGarageScreenSettled(bare, 'studio:enter'); // a bare session reads its scene phase
}

console.log('appLifecycle.selftest: guarded edges (and the write-free check), every phase announced, screen vs scene, derived battle sub-phases, the settled-Garage opening check passed');
