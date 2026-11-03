// 2026-11-02 audit S3: the harnesses held 242 waitForFunction calls; "the battle is playable" had at least eight
// definitions (phase, preBattleS, the loader's classes read four ways, the HUD's display, __BATTLE_REVEAL, result,
// timeS) and "the Garage is ready" was `__GAME_READY && phase === 'garage'`, true under a return's veil and behind the
// battle report. tools/game-readiness.mjs is the one probe, built on the game's published lifecycle
// (window.__APP_LIFECYCLE, src/game/appLifecycle.ts); docs/AUTOMATION-PATHS.md lists the hand-built waits that remain.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_LIFECYCLE_STATES, BOOT_LOADED_EXPRESSION, READY, readGameReadiness, readinessExpression, readinessInPage,
  waitForBootLoaded, waitForReady,
} from './game-readiness.mjs';
import { createAppLifecycle, transitionAppPhase } from '../src/game/appLifecycle.ts';
import { transitionBattleCountdown } from '../src/game/preBattleCountdown.ts';
import { matchRulesetFor } from '../src/sim/matchRuleset.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// The vocabulary is the game's: the AppLifecycleState union, and every readiness names only its members.
{
  const source = read('src/game/appLifecycle.ts');
  const union = source.match(/export type AppLifecycleState =([\s\S]*?);\n/)[1];
  const states = [...union.matchAll(/\|\s*'([a-z]+)'/g)].map((match) => match[1]);
  assert.deepEqual([...APP_LIFECYCLE_STATES].sort(), states.sort(), 'APP_LIFECYCLE_STATES is the AppLifecycleState union');
  for (const [name, wanted] of Object.entries(READY)) {
    for (const state of wanted) assert.ok(APP_LIFECYCLE_STATES.includes(state), `${name}: ${state} is a lifecycle state`);
  }
  assert.throws(() => readinessExpression('playable'), /unknown readiness playable/);
  assert.throws(() => readinessExpression('garage', { since: 'x' }), /transitions count/);
}

/** A page whose window is `win`: evaluate an in-page expression or function the way puppeteer would. */
const evaluate = (win, expression) => new Function('window', `return (${expression});`)(win);

// The probe over a real lifecycle: one session walks the boot, the Garage, a covered battle entry, its countdown, live
// play, the verdict and a Garage return; the page publishes the snapshot as main.ts does.
{
  const game = { phase: 'garage', preBattleS: 0, result: null, resultTimeS: null, timeS: 0, ruleset: matchRulesetFor('standard') };
  const facts = { booting: true, covering: false, returnOwed: false };
  const lifecycle = createAppLifecycle({ game, announce() {}, readers: {
    isBooting: () => facts.booting, isEntryCovering: () => facts.covering, isReturnOwed: () => facts.returnOwed,
  } });
  const win = { __GAME_READY: false, __DEBUG: { game } };
  Object.defineProperty(win, '__APP_LIFECYCLE', { get: () => lifecycle.snapshot() });
  Object.defineProperty(win, '__AUTOMATION_PATH', { get: () => ({ path: 'harness' }) });
  const ready = (name, options) => evaluate(win, readinessExpression(name, options));
  // the legacy predicates the harnesses built by hand
  const legacyGarage = () => win.__GAME_READY === true && win.__DEBUG?.game?.phase === 'garage';
  const legacyControls = () => win.__DEBUG.game.phase === 'battle' && win.__DEBUG.game.preBattleS <= 0;

  assert.equal(ready('garage'), false, 'still loading');
  win.__GAME_READY = true;
  assert.equal(evaluate(win, BOOT_LOADED_EXPRESSION), true, 'the boot finished loading');
  assert.equal(ready('garage'), false, 'the entry gate still waits on the player: the splash is the screen');
  assert.equal(legacyGarage(), true, '(the hand-built predicate said ready)');
  facts.booting = false;
  assert.equal(ready('garage'), true);
  const atGarage = evaluate(win, `(${readinessInPage})()`);
  assert.deepEqual(atGarage, { booted: true, state: 'garage', phase: 'garage', screenPhase: 'garage', transitions: 0, automation: 'harness' });

  // a covered entry: the cover is the screen, then the reveal opens the countdown, then the controls are released
  facts.covering = true;
  transitionBattleCountdown(game, 'arm');
  transitionAppPhase(game, 'battle', { reason: 'solo-start' });
  assert.equal(ready('garage'), false);
  assert.equal(ready('battleRevealed'), false, 'loading under the cover');
  facts.covering = false;
  transitionBattleCountdown(game, 'open', 3);
  assert.equal(ready('battleRevealed'), true);
  assert.equal(ready('controlsReleased'), false, 'the countdown holds the controls');
  transitionBattleCountdown(game, 'advance', 0);
  assert.equal(ready('controlsReleased'), true);
  assert.equal(ready('battleLive'), true);
  assert.equal(ready('controlsReleased', { since: atGarage.transitions }), true, 'a battle after the Garage snapshot');
  assert.equal(ready('controlsReleased', { since: 1 }), false, 'not the next battle yet');
  // a network join of a running match: the count is open while the cover is still the screen
  facts.covering = true;
  assert.equal(legacyControls(), true, '(the hand-built predicate said the controls were released under the cover)');
  assert.equal(ready('controlsReleased'), false);
  facts.covering = false;
  game.result = 'victory';
  game.resultTimeS = game.timeS;
  assert.equal(ready('battleLive'), false, 'the verdict landed');
  assert.equal(ready('controlsReleased'), true, 'controls were released in this battle');
  assert.equal(ready('battleEnded'), true);

  // the Garage return writes the Garage scene at its start, under the report or its veil: not ready until it settles
  facts.returnOwed = true;
  transitionAppPhase(game, 'garage', { reason: 'garage-return:enter', announce: false });
  assert.equal(legacyGarage(), true, '(the hand-built predicate said the Garage was ready under the veil)');
  assert.equal(ready('garage'), false, 'returning');
  transitionAppPhase(game, 'garage', { reason: 'garage-return:handoff' });
  assert.equal(ready('garage'), false, 'the handoff announced, the restore still owed');
  facts.returnOwed = false;
  assert.equal(ready('garage'), true);
}

// A booted page that publishes no lifecycle (a build before it) fails by name, never by timing out.
{
  const win = { __GAME_READY: true, __DEBUG: { game: { phase: 'garage' } } };
  assert.equal(evaluate(win, readinessExpression('garage')), true, 'the wait ends');
  const page = {
    calls: [],
    async waitForFunction(expression, options) { this.calls.push({ expression, options }); return evaluate(win, expression); },
    async evaluate(fn) { return evaluate(win, `(${fn})()`); },
  };
  await assert.rejects(waitForReady(page, 'garage', { timeout: 5 }), /publishes no window\.__APP_LIFECYCLE/);
  assert.deepEqual(page.calls[0].options, { timeout: 5 }, 'waitForFunction gets the caller\'s options, without since');
  const facts = await readGameReadiness(page);
  assert.equal(facts.state, null);
  await waitForBootLoaded(page, { timeout: 7, polling: 100 });
  assert.deepEqual(page.calls.at(-1), { expression: BOOT_LOADED_EXPRESSION, options: { timeout: 7, polling: 100 } });
}

// The harnesses wait through the probe. What still reads the boot latch's mirror or builds a phase or countdown wait by
// hand is listed in docs/AUTOMATION-PATHS.md with its reason (another lane's open edit, a measurement of the visual
// edge itself, a composite this probe does not name); the list is the tools as they are.
{
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) { if (name !== 'node_modules' && !name.startsWith('.')) walk(file); continue; }
      if (/\.(mjs|js|cjs|ts)$/.test(name) && !/\.(selftest|test-support)\.mjs$/.test(name)) files.push(file);
    }
  };
  walk(join(ROOT, 'tools'));
  const handBuilt = /window\.__GAME_READY|waitFor(?:Function)?\([^;]{0,400}?(?:game\??\.phase\s*===|preBattleS\s*<=)/s;
  const found = files.map((file) => relative(ROOT, file))
    .filter((file) => file !== 'tools/game-readiness.mjs' && handBuilt.test(stripComments(read(file)))).sort();
  const doc = read('docs/AUTOMATION-PATHS.md');
  const block = doc.match(/<!-- census:handBuiltWaits -->\n([\s\S]*?)<!-- \/census -->/)?.[1];
  assert.ok(block, 'docs/AUTOMATION-PATHS.md lists the hand-built waits that remain');
  const listed = [...block.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]).sort();
  assert.deepEqual(listed, found, 'docs/AUTOMATION-PATHS.md handBuiltWaits: the tools as they are');
}

console.log('game-readiness.selftest: one readiness probe over the published lifecycle; the hand-built waits listed');
