// 2026-11-02 audit F11 / Q16 (round 2; round 3 B9: the tool's own code, not a mirror): tools/sfx-smoke.mjs fires synthetic
// deaths of one live enemy id (the scenes' tank_explosion and tank_burnout, and the volley's two blasts 120 ms apart).
// The mixer hears a hull die once a life, so the tool revives the enemy with the game's own new-life edge (mode:respawn)
// before each one. The browser tool needs a page and is not run here. This receipt runs the tool's own code in Node: its
// in-page helper (window.__P), its emit, its scene table, its scene loop (with the tool's own expect checks through its
// own fail) and its volley, cut from its source text unchanged and run against the real engine (the page's evaluate is
// this process, the tool's waits are engine frames, its PCM tap is a stand-in). Round two's receipt replayed payloads of
// its own beside the tool's revive order, so a tool whose death payloads or revives drifted from the mixer's per-life
// latch could pass it. Only the scene loop's iteration is narrowed to the death scenes (the others are the browser's).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBus } from '../game/stateCore.ts';
import { installFetch, namedContext, terrain, tank, listener, probeOf, count } from './engineHarness.test-support.mjs';

// (a mutation check names another copy of the tool)
const toolUrl = process.env.SFX_SMOKE_TOOL ? new URL(`file://${process.env.SFX_SMOKE_TOOL}`)
  : new URL('../../tools/sfx-smoke.mjs', import.meta.url);
const tool = readFileSync(toolUrl, 'utf8');

/** The tool's source between two markers (the start found once, the end after it). */
function cut(start, end) {
  const from = tool.indexOf(start);
  assert.notEqual(from, -1, `sfx-smoke.mjs has its "${start}" section`);
  assert.equal(tool.indexOf(start, from + 1), -1, `"${start}" occurs once`);
  const to = tool.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `sfx-smoke.mjs has "${end}" after "${start}"`);
  return tool.slice(from, to);
}
const helpers = cut('  // In-page helpers.', '  async function tapStart()');
const emitSource = tool.match(/ {2}async function emit\(ev, payloadJs\) \{[^\n]*\}\n/)?.[0];
assert.ok(emitSource, "the tool's emit is found");
const LOOP = 'for (const sc of SCENES) {';
const scenes = cut('  // ---- scene table', '  const entry = (scene, name)');
assert.equal(scenes.split(LOOP).length, 2, 'the tool walks its scene table in one loop');
const volley = cut('  // ---- volley stress', '  // ---- console gate');
assert.equal([...volley.matchAll(/await emit\('tank:destroyed'/g)].length, 2, 'the volley fires two deaths');
assert.equal([...tool.matchAll(/emit\('tank:destroyed'/g)].length, 2,
  'no synthetic death outside the scene table and the volley (each would need its own revive, and this receipt to run it)');

// --- the real engine, where the page's window.__COT_AUDIO is ---------------------------------------------------------
globalThis.window = {};
installFetch();
const { createAudio } = await import('./audioEngine.ts');
const ctx = namedContext();
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = probeOf();
const me = tank('me', { isPlayer: true });
const foe = tank('foe', { specId: 'leo2a4', nation: 'Germany', x: 0, z: 30, team: 'enemy' });
const frames = (n) => { for (let i = 0; i < n; i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, [me, foe]); } };
bus.emit('phase:change', { phase: 'battle' });
await audio.warmBattleEvents(['t72b3m_2022', 'leo2a4', 't90am']);
await probe.libraryIdle();
audio.ambientOn(true);
frames(10);
bus.emit('battle:rollout', {});

// the page the tool drives: its debug handles (window.__DEBUG: the game and the bus the engine bound)
const player = { id: me.id, team: 'player', state: { pos: { x: 0, y: 0.5, z: 0 } } };
const enemy = { id: foe.id, team: 'enemy', state: { pos: { x: 0, y: 0, z: 30 } } };
globalThis.window.__DEBUG = { bus, game: { player, tanks: [player, enemy], timeS: 0, preBattleS: 999 } };
const page = {
  // a string is the tool's emit (an indirect eval: the page's global scope, whose `window` is this process's); a function
  // runs here with its arguments
  evaluate: async (code, ...args) => (typeof code === 'string' ? (0, eval)(code) : code(...args)),
};
const tapStarts = [];
const tapStart = async () => { tapStarts.push(probe.sfxLog.at(-1)?.seq ?? 0); };
// the PCM tap's stand-in: a quiet tone, so the tool's loudness gates (silence, clipping) read a capture and pass
const tapStopAndFetch = async () => {
  const pcm = new Int16Array(2 * 4800);
  for (let i = 0; i < 4800; i++) pcm[2 * i] = pcm[2 * i + 1] = Math.round(3000 * Math.sin(i * 0.05));
  return pcm;
};
const analyze = () => ({ peak: 0.09, peakDb: -21, rms: 0.06, rmsDb: -24, lowShare: 0.3 });
const sleep = async (ms) => frames(Math.max(1, Math.round(ms * 30 / 1000)));
const failures = [];
const fail = (message) => { failures.push(message); };
const report = { scenes: {}, ladder: {}, distance: {}, errors: [] };
const onlyDeaths = (scene) => scene.ev === 'tank:destroyed';
const body = `${helpers}${emitSource}${scenes.replace(LOOP, 'for (const sc of SCENES.filter(__onlyDeaths)) {')}${volley}`;
const AsyncFunction = (async () => {}).constructor;
const runTool = new AsyncFunction('page', 'tapStart', 'tapStopAndFetch', 'analyze', 'sleep', 'fail', 'report', 'writeWav', 'join',
  'outDir', 'sampleRate', '__onlyDeaths', body);
await runTool(page, tapStart, tapStopAndFetch, analyze, sleep, fail, report, () => {}, join, '/nonexistent', 48000, onlyDeaths);
frames(30);

// --- the tool's own verdicts and the mixer's -------------------------------------------------------------------------
// turret_land is the physics lane's (a page's rigid body landing), not the death's: the one expectation Node cannot meet
const deathFailures = failures.filter((message) => /^tank_(explosion|burnout): /.test(message) && !/'turret_land\*'/.test(message));
assert.deepEqual(deathFailures, [], "the tool's own death scenes play every death sound they expect, each enemy revived first");
assert.ok(report.scenes.tank_explosion && report.scenes.tank_burnout, "both of the tool's death scenes ran");
assert.ok(report.scenes.tank_burnout.samples.some((sample) => sample.startsWith('burnout_blast')),
  `the second death of the same enemy id is heard (its revive): ${report.scenes.tank_burnout.samples.join(' ')}`);
const volleyHeard = probe.sfxLog.filter((entry) => entry.seq > tapStarts.at(-1)).map((entry) => entry.n);
assert.equal(count(volleyHeard, 'tank_explode_ammo'), 2,
  `the tool's volley's two revived deaths are two blasts (${volleyHeard.filter((n) => n.startsWith('tank_')).join(' ')})`);
// and without a revive the same id's next death is deduped by design (a re-sent network death)
const dupFrom = probe.sfxLog.at(-1)?.seq ?? 0;
bus.emit('tank:destroyed', { id: foe.id, specId: 't90am', pos: [0, 0, 30], killerId: me.id, cause: 'ammorack' });
frames(30);
assert.equal(count(probe.sfxLog.filter((entry) => entry.seq > dupFrom).map((entry) => entry.n), 'tank_explode_ammo'), 0,
  'a death with no new life between is heard once');
bus.emit('phase:change', { phase: 'garage' });

console.log(`sfxSmokeDeaths.selftest: sfx-smoke's own death scenes and volley, run on the real engine, revive first and are heard through the per-life latch (${failures.length - deathFailures.length} non-death verdicts left to the browser)`);
