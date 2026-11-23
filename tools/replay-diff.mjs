#!/usr/bin/env node
/**
 * Where a replay leaves the page (replay-system-275, docs/REPLAY.md §4): a battle recorded with the divergence trace
 * (src/game/replay/replayTrace.ts; tools/replay-browser-check.mjs writes it beside the recording) is replayed in Node
 * with the same trace, and the two are compared. Prints the paths where the battle as step 1 met it differs, then the
 * first step whose numbers differ (the hull, the field, both values), then each dump up to that step with its
 * differing paths. A diagnostic: it reads, never fixes.
 *
 *   node tools/replay-diff.mjs <battle.cotreplay> <battle.trace.json> [--paths=60]
 *
 * Exit 0 when the replay matches the trace to its last step, 1 when it leaves it, 2 on files it cannot read.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decodeReplay } from '../src/sim/replayFormat.ts';
import { createReplayRun, ensureReplayFleet } from '../src/game/replay/replayRunner.ts';
import { createReplayWorld } from './replay-world.mjs';
import { TRACE_GAME_FIELDS, TRACE_HULL_FIELDS, createReplayTrace, diffDumps, traceRows } from '../src/game/replay/replayTrace.ts';

const [file, traceFile] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const pathsArg = process.argv.find((arg) => arg.startsWith('--paths='));
const PATHS = pathsArg ? Number(pathsArg.slice(8)) : 60;
if (!file || !traceFile) { console.error('usage: node tools/replay-diff.mjs <battle.cotreplay> <battle.trace.json>'); process.exit(2); }
let recording, page;
try {
  const raw = readFileSync(file);
  recording = decodeReplay(new Uint8Array(raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw));
  page = JSON.parse(readFileSync(traceFile, 'utf8'));
} catch (error) {
  console.error(`replay-diff: cannot read the inputs: ${error.message}`);
  process.exit(2);
}
await ensureReplayFleet(recording);
const world = await createReplayWorld(recording.header.setup.mapId);
const trace = createReplayTrace();
const run = createReplayRun(recording, world, { beforeSimStep: (game, tick) => { if (tick === 1) trace.begin(game); } });
while (run.step()) trace.afterStep(run.game);
const stoppedAt = run.tick;
run.dispose();
const replay = trace.export();

// a page's dump may predate the render filter (replayTrace.ts SKIP_KEYS, RENDER_MARKS): compare what both sides can hold
const RENDER_PATH = /\._engineCtx\b|\._battleVisualPool\b/;
const show = (title, all) => {
  const paths = all.filter((line) => !RENDER_PATH.test(line.split(':')[0]));
  console.log(`${title}: ${paths.length ? `${paths.length}${all.length >= PATHS * 20 ? '+' : ''} differing path(s)` : 'identical'}`);
  for (const line of paths.slice(0, PATHS)) console.log(`  ${line.length > 300 ? `${line.slice(0, 300)}…` : line}`);
};
show('before step 1', diffDumps(page.snapshots['0'], replay.snapshots['0'], PATHS * 20));

const width = TRACE_GAME_FIELDS.length + page.ids.length * TRACE_HULL_FIELDS.length;
const a = traceRows(page), b = traceRows(replay);
const steps = Math.min(a.length, b.length) / width;
let first = null;
for (let step = 0; step < steps && !first; step++) {
  for (let i = 0; i < width; i++) {
    const x = a[step * width + i], y = b[step * width + i];
    if (Object.is(x, y)) continue;
    const field = i < TRACE_GAME_FIELDS.length ? `battle.${TRACE_GAME_FIELDS[i]}`
      : `${page.ids[Math.floor((i - TRACE_GAME_FIELDS.length) / TRACE_HULL_FIELDS.length)]}.${TRACE_HULL_FIELDS[(i - TRACE_GAME_FIELDS.length) % TRACE_HULL_FIELDS.length]}`;
    first ??= { step: step + 1, fields: [] };
    first.fields.push(`${field}: page ${x} replay ${y} (Δ ${y - x})`);
  }
}
if (!first) {
  console.log(`steps: the replay matches the page's numbers for all ${steps} compared steps (the replay stopped at ${stoppedAt})`);
} else {
  console.log(`steps: first difference after step ${first.step} (${first.fields.length} number(s)):`);
  for (const line of first.fields.slice(0, PATHS)) console.log(`  ${line}`);
}
for (const key of Object.keys(page.snapshots).map(Number).filter((k) => k > 0).sort((x, y) => x - y)) {
  if (first && key > first.step + 60) break;
  if (!replay.snapshots[key]) { console.log(`after step ${key}: the replay has no dump (it stopped at ${stoppedAt})`); break; }
  show(`after step ${key}`, diffDumps(page.snapshots[key], replay.snapshots[key], PATHS * 20));
}
process.exitCode = first ? 1 : 0;
