#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// Run the native renderer probe (native/wgpu-probe, wgpu on Metal) over the web probe's sweep, from the scene files
// tools/wgpu-probe-scenes.mjs writes. Three passes over the sweep, the second in reverse, so load drift spreads over
// every scene; each scene's cell is the median pass. The encoding's cost is read two ways: the wall clock (the web
// probe's measure) and the thread's own CPU time, which a loaded machine's waits do not inflate. Holds the GPU capture
// lock (tools/capture-lock.mjs).
//
//   node tools/wgpu-probe-native.mjs [--scenes=.qa-dev/wgpu-native] [--out=FILE]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { SWEEP } from './wgpu-probe-scenes.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const scenes = resolve(arg('scenes', '.qa-dev/wgpu-native'));
const binary = resolve('native/wgpu-probe/target/release/cot-wgpu-probe-native');
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const lock = createCaptureLock();
const results = { loadStart: loadavg()[0], runs: [] };
await lock.acquire(90 * 60 * 1000);
try {
  const passes = SWEEP.map(() => []);
  for (const order of [SWEEP, [...SWEEP].reverse(), SWEEP]) {
    for (const step of order) {
      const file = resolve(scenes, `scene-${step.tanks}-${step.detail}.bin`);
      const line = execFileSync(binary, [file, String(step.frames), String(step.rounds)], { encoding: 'utf8', timeout: 600_000 });
      passes[SWEEP.indexOf(step)].push(JSON.parse(line.trim().split('\n').pop()));
    }
  }
  for (const [index, step] of SWEEP.entries()) {
    const runs = passes[index];
    const middle = (key) => median(runs.map((r) => r[key]));
    const run = { ...step, adapter: runs[0].adapter, draws: runs[0].draws, cpuMs: middle('cpuMs'), threadCpuMs: middle('threadCpuMs'),
      frameMs: middle('frameMs'), cpuUsPerDraw: middle('cpuUsPerDraw'), threadUsPerDraw: middle('threadUsPerDraw'), passes: runs };
    results.runs.push(run);
    console.log(`${step.tanks} tanks: ${run.frameMs.toFixed(2)} ms a frame (${run.cpuMs.toFixed(2)} encoding, ${run.threadCpuMs.toFixed(2)} of it the `
      + `thread's CPU), ${run.cpuUsPerDraw.toFixed(3)} µs a draw (${run.threadUsPerDraw.toFixed(3)} thread CPU)`);
  }
} finally {
  lock.release();
}
results.loadEnd = loadavg()[0];
const out = arg('out', null);
if (out) writeFileSync(out, `${JSON.stringify(results, null, 1)}\n`);
console.log(`[wgpu-probe-native] ${results.runs[0]?.adapter}, load ${results.loadStart.toFixed(1)} -> ${results.loadEnd.toFixed(1)}`);
