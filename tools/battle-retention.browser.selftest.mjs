#!/usr/bin/env node
// A battle left is a battle let go (webcontent-diet-278; Kevin 2026-11-25: "properly clear game state after leaving a
// battle", phone players' GPU resets on battle entry). One page at the phone tier (390x844 at 3x, touch, an iPhone's UA)
// on the dev server: a solo battle on battle A's map to its reveal, Leave to the Garage, a solo battle on battle B's, and
// at B's settle, after forced collections, world A's root and every CPU array its geometry held at A's reveal must be
// collected (tools/battle-retention-probe.mjs runRetentionRoute: WeakRef probes, read between collections). A phone keeps
// one world, so nothing may hold A once B is presented.
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// It catches the class, not a site: on the base two retainers in turn kept all of world-verdant (1168 arrays, 73.5 MB)
// through the winter battle, a wall kit's accessor closure pinned in V8's shared descriptor array
// (world/maps/buildLatch.ts) and then the fx runtime's breach-room cache holding a world material (fx/structureStages.ts).
// Anything new that pins a past world fails here, and the failure prints its shortest strong retainer paths from a heap
// snapshot (tools/heap-retainers.mjs) under a marker class on A's root. Reverted control: 595d1c24c1 reverted (the room
// cache a plain Map again) fails it. The Garage dressing is read, not judged (phones keep it resident by design,
// shouldReleaseInactivePhaseGpu). It holds the capture lock (render: a correctness reading, not a timing).
//   node tools/battle-retention.browser.selftest.mjs [--maps=verdant,winter] [--cpu=1] [--json=<out>]
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { openCaptureHold } from './capture-hold.mjs';
import { runRetentionRoute } from './battle-retention-probe.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const [mapA, mapB] = arg('maps', 'verdant,winter').split(',');
const cpuRate = Number(arg('cpu', '1'));
const JSON_OUT = arg('json', null);

let hold, report = null;
try {
  hold = await openCaptureHold({ label: 'battle-retention', place: 'battle-retention', lockClass: 'render', timeoutMs: 45 * 60_000 });
  report = await runRetentionRoute({ dev: true, label: 'receipt', mapA, mapB, cpuRate, expect: 'released', retainers: true });
} finally {
  await hold?.release();
  if (JSON_OUT && report) writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 1)}\n`);
}

assert.ok(!report.verdict?.error, `the route did not finish: ${report.errors.join(' | ')}`);
const worldA = report.settle.probes.worldA;
assert.ok(worldA && worldA.arrays >= 100, `world-${mapA} was probed at its reveal with its geometry (${worldA?.arrays ?? 0} arrays)`);
const paths = Object.values(report.retainers ?? {}).flat().map((steps) => steps.join(' > ')).slice(0, 3);
assert.ok(report.verdict.worldReleased,
  `world-${mapA} still alive at world-${mapB}'s settle: root ${worldA.rootAlive ? 'alive' : 'collected'}, ${worldA.arraysAlive} of `
  + `${worldA.arrays} arrays (${worldA.aliveMb} MB). What holds it:\n  ${paths.join('\n  ') || '(no snapshot path)'}`);
const dressing = report.settle.probes.dressing;
console.log(`battle-retention: world-${mapA} (${worldA.arrays} arrays at its reveal) collected at world-${mapB}'s settle; heap `
  + `${report.settle.heap.totalMb} MB; Garage dressing ${dressing?.arraysAlive ?? '?'} arrays resident (by design) — PASS`);
