// replayPageOnly.selftest.mjs — the fields a replay's state diff leaves out are the page's presentation, and only those
// (276 sim-det-trig; Main's ruling on the 66 paths a five-minute Verdant trace still named after its steps and rounds all
// matched). Copyright © 2026 Kevin B. Liu.
//
// A page's battle dump carries fields no replay can hold (it has no presentation). tools/replay-diff.mjs leaves out
// exactly src/game/replay/replayTrace.ts PAGE_ONLY_FIELDS (withoutPageOnly), so a real simulation field cannot hide among
// them later. Held:
//  1. no simulation module reads one: both drivers' import graph (tools/det-math-lint.mjs simulationModules, the
//     authority's and the local step's), comments left out, never names a page-only field, save a sink
//     (PAGE_ONLY_SINKS: the killcam recorder) whose every mention there is a call of one of its methods or a guard on it;
//  2. the scan is not blind: a key a simulation module reads (the battle clock, timeS) is named, a planted simulation
//     source that reads game._groundSampler (the training step's read before 276's fix) is named, and today's
//     game._groundSampler, which rosterState.ts (a simulation module) reads to stage the page's visuals, is named too:
//     it stays in the diff;
//  3. withoutPageOnly leaves out exactly those fields at their own level: a planted simulation field (a hull's health) is
//     still named, a page-only hull field placed on the battle is still named, and a near name is still named;
//  4. the replay runs in the page's battle phase (replayRunner.ts sets it), so game.phase is no difference to leave out.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulationModules } from '../../../tools/det-math-lint.mjs';
import { PAGE_ONLY_FIELDS, PAGE_ONLY_SINKS, diffDumps, withoutPageOnly } from './replayTrace.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const rel = (file) => file.slice(ROOT.length);
/** Source without its comments (a field named in a comment is not a read). */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
/** Every mention of `key` as a field: `.key`, `?.key`, `'key'`/`"key"`, or `key:` in a literal or a type. */
const mentions = (source, key) => [...source.matchAll(new RegExp(`(?:\\?\\.|\\.|['"])${key}\\b|\\b${key}\\s*\\??:`, 'g'))];
/** A sink's mention is a call of one of its methods (`game.killcam?.onRam(`), a guard on it (`if (game.killcam && …`) or
 *  its declaration on the battle's type (`killcam?: KillcamRecorder | null;`): never its value read. */
const sinkUse = (source, at, key) => {
  const after = source.slice(at, at + key.length + 64).replace(/^\??\./, '');
  const before = source.slice(source.lastIndexOf('\n', at) + 1, at);
  if (new RegExp(`^${key}\\??\\.\\w+\\(`).test(after)) return true;
  if (/\bif \([\w.]*$/.test(before) && new RegExp(`^${key}\\s*&&`).test(after)) return true;
  return /^\s*$/.test(before) && new RegExp(`^${key}\\??:`).test(after);
};

/** The page-only `keys` the sources read: [{ key, file }] (a sink's calls and guards are not reads). */
function readsOf(sources, keys, sinks = PAGE_ONLY_SINKS) {
  const found = [];
  for (const [file, text] of sources) {
    const source = code(text);
    for (const key of keys) {
      const reads = mentions(source, key).filter((m) => !(sinks.includes(key) && sinkUse(source, m.index, key)));
      if (reads.length) found.push({ key, file, at: reads.length });
    }
  }
  return found;
}

const sources = simulationModules().map((file) => [rel(file), readFileSync(file, 'utf8')]);
assert.ok(sources.length > 200 && sources.some(([file]) => file === 'src/game/state.ts') && sources.some(([file]) => file === 'src/sim/authoritativeMatch.ts'),
  `the scan reads both drivers' simulation (${sources.length} modules)`);
const listed = [...PAGE_ONLY_FIELDS.game, ...PAGE_ONLY_FIELDS.hull];

// 1. no simulation module reads a page-only field
assert.deepEqual(readsOf(sources, listed), [], 'a page-only field a simulation module reads (it is no page-only field)');
const killcamCalls = sources.filter(([, text]) => mentions(code(text), 'killcam').length).map(([file]) => file);
assert.ok(killcamCalls.includes('src/game/state.ts'), `the step feeds the killcam recorder (${killcamCalls.join(', ')}): its calls are the sink rule's`);

// 2. the scan is not blind
assert.ok(readsOf(sources, ['timeS']).length > 5, 'control: the battle clock, read across the simulation, is named');
const planted = [['src/game/state.ts', 'function driveTrainingActor(game) {\n  const ground = game._groundSampler;\n  return ground;\n}\n']];
assert.deepEqual(readsOf(planted, ['_groundSampler']).map((r) => r.key), ['_groundSampler'],
  'control: a simulation module reading the page\'s ground sampler (the training step before 276) is named');
assert.ok(readsOf(sources, ['_groundSampler']).some((r) => r.file === 'src/game/rosterState.ts'),
  'and today\'s, which rosterState stages the visuals from, is named: it stays in the diff');
const misused = [['src/sim/x.ts', 'const k = game.killcam;\nstep(k);\n']];
assert.deepEqual(readsOf(misused, ['killcam']).map((r) => r.key), ['killcam'], 'control: a sink read as a value (not called) is named');
assert.deepEqual(readsOf([['src/sim/y.ts', 'game.killcam?.onShellHit(e, t);\nif (game.killcam && hit) game.killcam.onRam(e, a, b);\n']], ['killcam']), [],
  'and its calls and guards are not');
assert.deepEqual(readsOf([['src/sim/z.ts', '// game._spotFade is the fade\n/* entity._fxAcc */\n']], listed), [], 'comments are no reads');

// 3. withoutPageOnly: exactly those, at their own level
const hull = (extra = {}) => ({ state: { pos: { x: 1, y: 2, z: 3 } }, combat: { hp: 100 }, ...extra });
const pageHull = Object.fromEntries(PAGE_ONLY_FIELDS.hull.map((key, i) => [key, { page: i }]));
const pageDump = { game: { timeS: 5, killcam: { phase: null } }, hulls: { a: hull(pageHull), b: hull(pageHull) } };
const replayDump = { game: { timeS: 5 }, hulls: { a: hull(), b: hull() } };
assert.ok(diffDumps(pageDump, replayDump).length >= listed.length, 'the raw dumps differ in every page-only field');
assert.deepEqual(diffDumps(withoutPageOnly(pageDump), withoutPageOnly(replayDump)), [], 'without them, the page and the replay agree');
const simDrift = structuredClone(replayDump);
simDrift.hulls.b.combat.hp = 99;
assert.deepEqual(diffDumps(withoutPageOnly(pageDump), withoutPageOnly(simDrift)), ['.hulls.b.combat.hp: 100 vs 99'], 'a planted simulation field is named');
const misplaced = structuredClone(replayDump);
misplaced.game._fxAcc = 0.5;
assert.deepEqual(diffDumps(withoutPageOnly(replayDump), withoutPageOnly(misplaced)), ['.game._fxAcc: undefined vs 0.5'], 'a hull\'s page-only field on the battle is named');
const nearName = structuredClone(replayDump);
nearName.hulls.a._soloRenderPoseCache = 1;
assert.deepEqual(diffDumps(withoutPageOnly(replayDump), withoutPageOnly(nearName)), ['.hulls.a._soloRenderPoseCache: undefined vs 1'], 'a near name is named');

// 4. the replay steps in the battle phase
const runner = readFileSync(new URL('./replayRunner.ts', import.meta.url), 'utf8');
// (battle-teardown-276: through the one phase writer, appLifecycle.ts transitionAppPhase)
assert.match(runner, /transitionAppPhase\(game as \{ phase: AppPhase \}, 'battle', \{ reason: 'replay-run' \}\);\s*const bus = createBus/,
  'the replay enters the page\'s battle phase before its first step');
assert.ok(!listed.includes('phase'), 'so the phase is no page-only field');

console.log(`replayPageOnly.selftest: ${listed.length} page-only field(s) (the battle's ${PAGE_ONLY_FIELDS.game.join(', ')}; each hull's `
  + `${PAGE_ONLY_FIELDS.hull.join(', ')}) unread by ${sources.length} simulation modules, the killcam fed by calls alone; the scan names `
  + `timeS, a planted _groundSampler read and rosterState's; withoutPageOnly leaves out exactly those (a hull's health, a misplaced `
  + `field and a near name still named); the replay steps in the battle phase`);
