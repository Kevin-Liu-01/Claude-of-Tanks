// 2026-11-02 audit S3: the harnesses held 242 waitForFunction calls; "the battle is playable" had at least eight
// definitions (phase, preBattleS, the loader's classes read four ways, the HUD's display, __BATTLE_REVEAL, result,
// timeS) and "the Garage is ready" was `__GAME_READY && phase === 'garage'`, true under a return's veil and behind the
// battle report. tools/game-readiness.mjs is the one probe, built on the game's published lifecycle
// (window.__APP_LIFECYCLE, src/game/appLifecycle.ts); docs/AUTOMATION-PATHS.md lists every tool that still reads those
// facts itself, with its reason, and this file keeps that list equal to the tools.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_LIFECYCLE_STATES, BOOT_LOADED_EXPRESSION, READY, prepareToolPage, readGameReadiness, readinessExpression,
  readinessInPage, scenePhaseExpression, waitForBootLoaded, waitForReady,
} from './game-readiness.mjs';
import { codeText, toolCensusFiles } from './code-text.mjs';
import { createAppLifecycle, transitionAppPhase } from '../src/game/appLifecycle.ts';
import { transitionBattleCountdown } from '../src/game/preBattleCountdown.ts';
import { matchRulesetFor } from '../src/sim/matchRuleset.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

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

/** A page whose window is `win` (and document `doc`): evaluate an in-page expression the way puppeteer would. */
const evaluate = (win, expression, doc = { querySelector: () => null }) =>
  new Function('window', 'document', `return (${expression});`)(win, doc);

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
  assert.deepEqual(atGarage, { booted: true, lifecycle: true, state: 'garage', phase: 'garage', screenPhase: 'garage', transitions: 0,
    automation: 'harness', legacy: null });

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

// A build that publishes no lifecycle (before 2026-11-03: a deployment, an A/B baseline) never passes a readiness on
// the boot alone (the lane's first probe did: `state === null` passed every wait at boot, the player still in the
// Garage). Each readiness takes the predicate that build's own harnesses waited on.
{
  const game = { phase: 'garage', preBattleS: 0, result: null };
  const win = { __GAME_READY: false, __DEBUG: { game } };
  const loader = { on: false };
  const doc = { querySelector: (selector) => (selector === '.cot-bl.on, .cot-bl.leaving' && loader.on ? {} : null) };
  const ready = (name, options) => evaluate(win, readinessExpression(name, options), doc);
  const names = Object.keys(READY);
  const passing = () => names.filter((name) => ready(name));
  assert.deepEqual(passing(), [], 'nothing before the boot');
  win.__GAME_READY = true;
  assert.deepEqual(passing(), ['garage'], 'a booted page in the Garage is the Garage, never a battle');
  assert.equal(ready('controlsReleased', { since: 3 }), false, '(perfprobe\'s early window against such a baseline)');
  game.phase = 'battle';
  game.preBattleS = 999;
  loader.on = true;
  assert.deepEqual(passing(), [], 'loading under the cover');
  loader.on = false;
  assert.deepEqual(passing(), ['battleRevealed'], 'the countdown');
  game.preBattleS = 0;
  assert.deepEqual(passing(), ['battleRevealed', 'controlsReleased', 'battleLive']);
  game.result = 'defeat';
  assert.deepEqual(passing(), ['battleRevealed', 'controlsReleased', 'battleEnded']);
  game.phase = 'studio';
  assert.deepEqual(passing(), ['studio']);
  const facts = evaluate(win, `(${readinessInPage})()`, doc);
  assert.equal(facts.lifecycle, false, 'the facts say which definition decided');
  assert.equal(facts.legacy.source, 'debug');
  assert.equal(facts.state, null);

  // waitForReady and waitForBootLoaded hand the caller's options to waitForFunction and return the facts
  const page = {
    calls: [],
    async waitForFunction(expression, options) { this.calls.push({ expression, options }); return evaluate(win, expression, doc); },
    async evaluate(fn) { return evaluate(win, `(${fn})()`, doc); },
  };
  const seen = await waitForReady(page, 'studio', { timeout: 5 });
  assert.deepEqual(page.calls[0].options, { timeout: 5 }, 'waitForFunction gets the caller\'s options, without since');
  assert.equal(seen.lifecycle, false);
  assert.equal((await readGameReadiness(page)).state, null);
  await waitForBootLoaded(page, { timeout: 7, polling: 100 });
  assert.deepEqual(page.calls.at(-1), { expression: BOOT_LOADED_EXPRESSION, options: { timeout: 7, polling: 100 } });
}

// The same build on the player's path without ?debug has no `__DEBUG` either (black-world-repro --plain against prod,
// and its stress page): the round-1 fallback read only `__DEBUG.game`, so no readiness ever passed there and the tool's
// boot wait (`garage && .cot-battle`, where the tool once waited on `__GAME_READY && .cot-battle`) timed out after
// 240 s. Such a page answers from what it shows; what it cannot show (the countdown) is null and fails by name.
{
  const win = { __GAME_READY: false, getComputedStyle: (node) => node.style };
  const dom = { splash: true, garage: 'awaiting-boot', veil: false, loader: false, hud: false, report: false, studio: false, blind: false };
  const box = (display, visibility = 'visible') => ({ style: { display, visibility } });
  const doc = {
    querySelector(selector) {
      switch (selector) {
        case '.cot-bl.on, .cot-bl.leaving': return dom.loader ? {} : null;
        case '.cot-trans.on': return dom.veil ? {} : null;
        case '#cot-boot:not(.cot-boot-out)': return dom.splash ? {} : null;
        case '.cot-es.show': return dom.report ? {} : null;
        case '.cot-garage': return box(dom.garage === 'none' ? 'none' : 'block', dom.garage === 'awaiting-boot' ? 'hidden' : 'visible');
        case '.cot-hud': return box(dom.hud ? 'block' : 'none');
        case '.cot-studio': return dom.studio ? box('block') : null;
        case '.cot-battle': return {};
        // (round 2 Q21) the fallback's own landmarks: a screen it can read has one of them
        case '.cot-garage, .cot-hud, #cot-boot, .cot-studio': return dom.blind ? null : {};
        default: throw new Error(`the probe read an unexpected selector ${selector}`);
      }
    },
  };
  const ready = (name) => evaluate(win, readinessExpression(name), doc);
  const passing = () => Object.keys(READY).filter((name) => ready(name));
  // black-world-repro's own waits, as its source writes them
  const bwr = read('tools/black-world-repro.mjs');
  const bootWait = "${readinessExpression('garage')} && !!document.querySelector('.cot-battle')";
  assert.equal(bwr.split(`await page.waitForFunction(\`${bootWait}\``).length - 1, 1, 'black-world-repro boots on garage && .cot-battle');
  assert.ok(bwr.includes("await page.waitForFunction(readinessExpression('garage'), "), 'and presses BATTLE on garage');
  const bootReady = () => evaluate(win, `${readinessExpression('garage')} && !!document.querySelector('.cot-battle')`, doc);

  assert.deepEqual(passing(), [], 'nothing before the boot');
  win.__GAME_READY = true;
  assert.deepEqual(passing(), [], 'booted under the splash, the Garage still waiting on its dismissal');
  dom.splash = false;
  dom.garage = 'shown';
  assert.deepEqual(passing(), ['garage'], 'a booted, settled Garage with no __DEBUG is the Garage');
  assert.equal(bootReady(), true, 'black-world-repro --plain boots');
  const facts = evaluate(win, `(${readinessInPage})()`, doc);
  assert.equal(facts.lifecycle, false);
  assert.equal(facts.legacy.source, 'dom', 'the facts say the screen decided');
  assert.equal(facts.legacy.controlsReleased, null, 'and what it cannot tell');
  dom.garage = 'none';
  dom.loader = true;
  assert.deepEqual(passing(), [], 'BATTLE pressed: loading under the cover');
  dom.loader = false;
  dom.hud = true;
  assert.deepEqual(passing(), ['battleRevealed'], 'the cover is gone; the countdown cannot be read from the screen');
  dom.report = true;
  assert.deepEqual(passing(), ['battleRevealed', 'battleEnded'], 'the report');
  dom.report = false;
  dom.hud = false;
  dom.veil = true;
  dom.garage = 'shown';
  assert.deepEqual(passing(), [], 'the Garage return, still under its veil');
  dom.veil = false;
  assert.deepEqual(passing(), ['garage'], 'the return settled: BATTLE may be pressed again');
  dom.garage = 'none';
  dom.studio = true;
  assert.deepEqual(passing(), ['studio']);

  // a wait the screen cannot answer fails by name, not as a bare timeout
  const page = {
    async waitForFunction(expression) {
      if (!evaluate(win, expression, doc)) throw new Error('Waiting failed: 5ms exceeded');
      return true;
    },
    async evaluate(fn) { return evaluate(win, `(${fn})()`, doc); },
  };
  await assert.rejects(waitForReady(page, 'battleLive', { timeout: 5 }),
    /battleLive cannot be read on this page: .*no window\.__DEBUG \(open it with \?debug=1\) \(Waiting failed/);
  await assert.rejects(waitForReady(page, 'battleRevealed', { timeout: 5 }), /^Error: Waiting failed: 5ms exceeded$/,
    'a wait the page can answer keeps its own timeout');
  assert.equal((await waitForReady(page, 'studio', { timeout: 5 })).legacy.studio, true);

  // (round 2 Q21) a baseline whose screen the fallback cannot read (none of its elements: an old A/B build) used to
  // time out bare; it fails by that name, and its note says so
  dom.blind = true;
  dom.studio = false;
  assert.equal(evaluate(win, `(${readinessInPage})()`, doc).legacy.landmarks, false);
  await assert.rejects(waitForReady(page, 'garage', { timeout: 5 }),
    /garage cannot be read on this page: .*none of the elements the DOM fallback reads .*open it with \?debug=1 \(Waiting failed/);
  dom.blind = false;
}

// (round 2 Q21) Which definition decided is never silent: some forty tools wait on readinessExpression directly and
// only mobilelap recorded the facts, so an A/B receipt against a pre-lifecycle baseline used the old predicate unseen.
// The page logs it once a document for each definition, and every launched browser's pages forward that line to the
// tool's own log (prepareToolPage).
{
  const notes = [];
  const win = { __GAME_READY: true, __DEBUG: { game: { phase: 'garage', preBattleS: 0, result: null } }, console: { info: (line) => notes.push(line) } };
  const ready = (name) => evaluate(win, readinessExpression(name));
  assert.equal(ready('garage'), true);
  assert.equal(ready('battleLive'), false);
  assert.equal(notes.length, 1, 'once a document for its definition');
  assert.match(notes[0], /^\[cot-readiness\] this build publishes no lifecycle .*'garage' and every readiness on this page is its legacy debug predicate$/);
  // a page with the lifecycle notes nothing
  const lifecycleWin = { __GAME_READY: true, console: win.console };
  Object.defineProperty(lifecycleWin, '__APP_LIFECYCLE', { get: () => ({ state: 'garage', phase: 'garage', screenPhase: 'garage', transitions: 0 }) });
  assert.equal(evaluate(lifecycleWin, readinessExpression('garage')), true);
  assert.equal(notes.length, 1);
  // every page a launched browser hands out forwards the note to the tool's stderr, and nothing else
  const listeners = [];
  const toolPage = { on: (type, listener) => listeners.push([type, listener]), async evaluateOnNewDocument() {} };
  await prepareToolPage(toolPage);
  const written = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk) => { written.push(String(chunk)); return true; };
  try {
    for (const [type, listener] of listeners) if (type === 'console') { listener({ text: () => notes[0] }); listener({ text: () => 'an ordinary page log' }); }
  } finally { process.stderr.write = write; }
  assert.deepEqual(written, [`${notes[0]}\n`], "the tool's log names the definition");
}

// (round 2 Q21) A timing edge is the scene's hand-over, not the settled screen: pause-probe's 'responsive' check timed
// the Leave's click to a settled Garage (the whole cold restore) after its migration onto the probe, and a slow restore
// failed 'responsive'. scenePhaseExpression reads who owns the scene; the settled Garage gets its own wait.
{
  const game = { phase: 'battle', preBattleS: 0, result: 'victory', resultTimeS: 0, timeS: 9, ruleset: matchRulesetFor('standard') };
  const facts = { returnOwed: false };
  const lifecycle = createAppLifecycle({ game, announce() {}, readers: { isReturnOwed: () => facts.returnOwed } });
  const win = { __GAME_READY: true };
  Object.defineProperty(win, '__APP_LIFECYCLE', { get: () => lifecycle.snapshot() });
  assert.equal(evaluate(win, scenePhaseExpression('garage')), false);
  facts.returnOwed = true;
  transitionAppPhase(game, 'garage', { reason: 'garage-return', announce: false });
  assert.equal(evaluate(win, scenePhaseExpression('garage')), true, 'the Garage took the scene under the veil');
  assert.equal(evaluate(win, readinessExpression('garage')), false, 'its screen is not settled yet');
  assert.equal(evaluate({ __DEBUG: { game: { phase: 'garage' } } }, scenePhaseExpression('garage')), true, 'a build with no lifecycle: its debug phase');
  assert.throws(() => scenePhaseExpression('lobby'), /unknown app phase lobby/);
  const probe = read('tools/pause-probe.mjs');
  assert.match(probe, /waitForFunction\(scenePhaseExpression\('garage'\), \{ timeout: 15000 \}\);\n\s+const leaveElapsedMs = /,
    "pause-probe times the Leave's responsiveness to the scene's hand-over");
  assert.match(probe, /const leaveElapsedMs = [^\n]+\n\s+await page\.waitForFunction\(readinessExpression\('garage'\), \{ timeout: 60000 \}\);/,
    'then waits for the settled Garage on its own budget before the checks');
}

// The census reads code, never comments, and a string that holds `/*` is code: the stripper the lane first used erased
// everything after vite's `watch: { ignored: ['**/*'] }` up to the next `*/`, and sfx-smoke's boot wait with it.
{
  const source = "const server = { watch: { ignored: ['**/*'] } }; // a note\nawait page.waitForFunction('window.__GAME_READY === true'); /* x */";
  const code = codeText(source);
  assert.match(code, /window\.__GAME_READY === true/, 'a glob string is not a comment');
  assert.doesNotMatch(code, /a note|\bx\b/, 'the comments are blanked');
  assert.equal(code.length, source.length, 'offsets kept');
  const naive = source.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(naive, /__GAME_READY/, '(the regex stripper lost it)');
  assert.match(codeText("const r = /['\"]\\/\\*/; const t = `a ${'/*'} // b`; f(); // c"), /`a \$\{'\/\*'\} \/\/ b`/, 'regex and template literals stay whole');
}

// Every tool that reads the facts behind "ready" itself (the boot mirror, the app phase, the countdown, the loader's
// classes or display, the HUD's display, the reveal latch) is in docs/AUTOMATION-PATHS.md, with its reason: a wait
// built by hand (census:handBuiltWaits), or a check or a receipt field that is not a wait (census:stateReads). The
// census reads every tool and every selftest that drives a page, as code (comments blanked), named page functions and
// predicates in any form included; tools/game-readiness.mjs is the probe itself.
const READS = Object.freeze({
  bootMirror: /__GAME_READY/,
  appPhase: /\.phase\s*[!=]==?\s*['"`](?:battle|garage|shot|studio)['"`]|['"`](?:battle|garage|shot|studio)['"`]\s*[!=]==?\s*[\w$.?]*\.phase\b/,
  countdown: /preBattleS\s*(?:[<>]=?|[!=]==?)|(?:[<>]=?|[!=]==?)\s*[\w$.?]*preBattleS\b/,
  loader: /\.cot-bl\.(?:on|leaving)(?![-\w])|['"`]\.cot-bl['"`]/,
  hudDisplay: /(?:getComputedStyle\(|visible\(|shown\()[^\n]{0,60}['"`]\.cot-hud['"`]|['"`]\.cot-hud:not\(/,
  // (round 2 U40) the battle's body class, another "the battle owns the screen" (surface-pairs' battle wait read it)
  bodyBattle: /['"`]cot-in-battle['"`]/,
  reveal: /__BATTLE_REVEAL(?!\s*=(?!=))/,
});
const ANY_READ = new RegExp(Object.values(READS).map((pattern) => pattern.source).join('|'));
const readsOf = (text) => Object.entries(READS).filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
{
  // each pattern names its definition, and a write is not a read
  assert.deepEqual(readsOf("window.__DEBUG.game.phase === 'battle' && !document.querySelector('.cot-bl.on')"), ['appPhase', 'loader']);
  assert.deepEqual(readsOf("getComputedStyle(document.querySelector('.cot-bl')).display === 'none'"), ['loader']);
  assert.deepEqual(readsOf("const h = getComputedStyle(document.querySelector('.cot-hud')).display"), ['hudDisplay']);
  assert.deepEqual(readsOf('!(window.__DEBUG.game.preBattleS > 0) && !!window.__BATTLE_REVEAL'), ['countdown', 'reveal']);
  assert.deepEqual(readsOf("'battle' === g.phase"), ['appPhase']);
  assert.deepEqual(readsOf('window.__BATTLE_REVEAL = null; game.preBattleS = 0; phase: g.phase'), [], 'writes and copies');
  assert.deepEqual(readsOf("document.querySelector('.cot-bl .hero img')"), [], 'the loading screen\'s content is not its state');
  // (round 2 U40) surface-pairs' battle wait, in neither form the census read
  assert.deepEqual(readsOf("document.body.classList.contains('cot-in-battle') || !!document.querySelector('.cot-hud:not([hidden])')"),
    ['hudDisplay', 'bodyBattle']);
}
const doc = read('docs/AUTOMATION-PATHS.md');
const listed = (key) => {
  const block = doc.match(new RegExp(`<!-- census:${key} -->\\n([\\s\\S]*?)<!-- /census -->`))?.[1];
  assert.ok(block, `docs/AUTOMATION-PATHS.md has the ${key} list`);
  const rows = [...block.matchAll(/^- `([^`]+)`(.*)$/gm)].map((match) => ({ file: match[1], reason: match[2].replace(/^:\s*/, '').trim() }));
  for (const row of rows) assert.ok(row.reason.length > 8, `${key}: ${row.file} gives its reason`);
  return rows.map((row) => row.file);
};
{
  const found = [];
  for (const file of toolCensusFiles(ROOT)) {
    if (file === 'tools/game-readiness.mjs' || file === 'tools/code-text.mjs') continue;
    const raw = read(file);
    if (!ANY_READ.test(raw)) continue;
    if (readsOf(codeText(raw, file)).length) found.push(file);
  }
  const census = toolCensusFiles(ROOT);
  assert.ok(census.includes('tools/black-world.browser.selftest.mjs'), 'a selftest that drives a page is a harness');
  assert.ok(!census.includes('tools/game-readiness.selftest.mjs'), 'a Node selftest is not');
  const waits = listed('handBuiltWaits');
  const reads = listed('stateReads');
  assert.deepEqual(waits.filter((file) => reads.includes(file)), [], 'a tool is in one list');
  assert.deepEqual([...waits, ...reads].sort(), found.sort(), 'docs/AUTOMATION-PATHS.md handBuiltWaits + stateReads: the tools as they are');
}

// (round 8 Y8, sweep s6-02) A tool listed under stateReads reads those facts for checks and receipt fields, never to wait:
// no waitForFunction predicate of its own reads one (second-solo-battle read the boot mirror and the phase in its
// waits and was a hand-built wait until they moved to the probe). The predicate is the call's whole text to its closing
// parenthesis, read as code (an unclosed call reads to the end of the file). An evaluate that a loop polls until a fact
// holds is a hand-built wait too, but the census cannot tell it from a loop guard (a stateReads form): the row's reason
// says which (docs/AUTOMATION-PATHS.md).
{
  const waitsOnRead = (text, file = 'tools/a.mjs') => {
    const code = codeText(text, file), lines = [];
    for (const call of code.matchAll(/\bwaitForFunction\(/g)) {
      let depth = 0, end = call.index + call[0].length - 1;
      for (; end < code.length; end++) {
        if (code[end] === '(') depth++;
        else if (code[end] === ')' && --depth === 0) break;
      }
      if (ANY_READ.test(code.slice(call.index, end + 1))) lines.push(code.slice(0, call.index).split('\n').length);
    }
    return lines;
  };
  assert.deepEqual(waitsOnRead("await page.waitForFunction(() => window.__DEBUG.game.phase === 'garage', { timeout: 1 });"), [1], 'a hand-built wait');
  assert.deepEqual(waitsOnRead("await page.waitForFunction('window.__GAME_READY === true', {});"), [1], 'the boot mirror by hand');
  assert.deepEqual(waitsOnRead("await page.waitForFunction(scenePhaseExpression('garage'), { timeout: 1 });\n"
    + "const card = !!document.querySelector('.cot-bl.on');"), [], 'the probe\'s waits and a receipt field');
  // (fix-up r1) the whole call, however long its predicate: the scan stopped 800 characters in
  assert.deepEqual(waitsOnRead(`await page.waitForFunction(() => {\n${'  const pad = 1;\n'.repeat(60)}  return window.__GAME_READY === true;\n}, {});`),
    [1], 'a long hand-built predicate');
  const offenders = listed('stateReads').flatMap((file) => waitsOnRead(read(file), file).map((line) => `${file}:${line}`));
  assert.deepEqual(offenders, [], 'a stateReads tool waits through the probe (a tool that waits on a fact itself is a handBuiltWaits row)');
}

// A Garage return is awaited before anything else happens to the page: a page function that fires enterGarage() or
// leaveBattleToGarage() as a bare statement and goes on (mobilelap's map cycle started the next battle in the same
// breath) measures a race no player can make. The one exception times the exit with its own poll in that function.
{
  const unawaited = /(?:^|[;{]|\n)\s*(?:window\.__DEBUG|D|d|debug)\.(?:enterGarage|leaveBattleToGarage)\(\);/;
  const fired = toolCensusFiles(ROOT).filter((file) => {
    const raw = read(file);
    return /(?:enterGarage|leaveBattleToGarage)\(\);/.test(raw) && unawaited.test(codeText(raw, file));
  });
  assert.deepEqual(fired, ['tools/loading-budget-probe.mjs'], 'tools that fire a Garage return and go on without it');
  assert.match(read('tools/loading-budget-probe.mjs'),
    /window\.__DEBUG\.leaveBattleToGarage\(\);\n\s+while \(window\.__DEBUG\.game\.phase !== 'garage'/,
    'the exit timing polls for the Garage in the same function');
}

// (round 2 U40) Every documented session open for an agent-browser session tool asks for the path that tool checks
// (sessionPathProblem): docs/DEVELOPMENT.md's release audit opened its session with no `&automation=harness`, so
// render-stability-audit and map-shadow-audit refused it at the documented first step.
{
  const { readdirSync } = await import('node:fs');
  const sessionTools = new Map(toolCensusFiles(ROOT).flatMap((file) => {
    const wanted = codeText(read(file), file).match(/sessionPathProblem\([^\n]*?,\s*'(player|harness)'\)/)?.[1];
    return wanted && file !== 'tools/game-readiness.mjs' ? [[file.replace(/^tools\//, '').replace(/\.mjs$/, ''), wanted]] : [];
  }));
  assert.ok(sessionTools.has('render-stability-audit') && sessionTools.has('map-shadow-audit'), 'the session tools are found');
  const pages = ['docs', 'tools'].flatMap((dir) => readdirSync(join(ROOT, dir)).filter((name) => name.endsWith('.md')).map((name) => `${dir}/${name}`))
    .concat([...sessionTools.keys()].map((tool) => `tools/${tool}.mjs`));
  let checked = 0;
  for (const page of pages) {
    const text = read(page);
    const opened = new Map([...text.matchAll(/agent-browser --session (\S+) open \\?\s*'([^']+)'/g)].map((match) => [match[1], match[2]]));
    for (const [, tool, sessionName] of text.matchAll(/node tools\/([\w-]+)\.mjs (\S+)/g)) {
      const wanted = sessionTools.get(tool);
      const url = opened.get(sessionName);
      if (!wanted || !url) continue;
      checked += 1;
      assert.match(url, new RegExp(`[?&]automation=${wanted}(?:&|$)`), `${page}: the ${sessionName} session ${tool} reads is opened on the ${wanted} path`);
    }
    for (const [, sessionName, url] of text.matchAll(/agent-browser --session (\S+) open \\?\s*'([^']+)'/g)) {
      if (page.startsWith('tools/') && page.endsWith('.mjs')) {
        checked += 1;
        assert.match(url, /[?&]automation=(?:player|harness)(?:&|$)/, `${page}: its usage opens ${sessionName} on a named path`);
      }
    }
  }
  assert.ok(checked >= 4, `the documented sessions were checked (${checked})`);
}

// (round 2, tools-lifecycle review) cold-load-probe hides the driver for its whole browser (a --url deployment may
// predate the automation owner), so its recovery scenarios, which never asked for the player's path, counted as players
// in the entry telemetry, which excludes navigator.webdriver: every page it opens turns telemetry off by URL.
{
  const probe = codeText(read('tools/cold-load-probe.mjs'), 'tools/cold-load-probe.mjs');
  assert.match(probe, /--disable-blink-features=AutomationControlled/);
  const urls = probe.split('new URL(baseUrl)').length - 1;
  assert.ok(urls >= 4, 'its scenarios build their URLs from the base');
  assert.equal(probe.split("searchParams.set('telemetry', 'off')").length - 1, urls, 'each one with telemetry=off');
}

console.log('game-readiness.selftest: one readiness probe over the published lifecycle; every hand-built read listed');
