// Fixed-step determinism (lane mp/world-state-audit, 2026-10-01): the shared authority run twice from one seed with the
// same scripted inputs on verdant's collision shard — two humans and four bots driving, firing, crushing trees — hashes to
// the same poses, combat state, shells, destroyed list and events at every 60th tick. A wall-clock read or an unseeded
// draw in the authoritative step is the first differing tick.
import assert from 'node:assert/strict';
import { runDeterminismAudit } from './sim-determinism-audit.mjs';

const report = runDeterminismAudit({ mapId: 'verdant', ticks: 1800, seed: 7 });
assert.ok(report.countsA.events > 0, 'the run produced events to compare');
assert.ok(report.countsA.crushes > 0, 'the run crushed props to compare');
assert.equal(report.identical, true, `two runs diverged at tick ${report.firstDiffTick} (${report.finalA} vs ${report.finalB})`);
console.log(`sim determinism: two ${report.ticks}-tick runs identical (${report.countsA.crushes} crushes, ${report.countsA.hits} hits, ${report.countsA.events} events; ${report.wallMs} ms)`);
