// 2026-11-02 audit S3: product code read window.__GAME_READY, the flag the harnesses wait on (the Garage's featured
// gallery, hotspots, Deploy's sheet and camo swatch painter in garage.ts; the Studio's entry and scene links in
// studio.ts; the inline boot watchdog and chunk recovery in index.html), and the app lifecycle said 'garage' while the
// boot splash and its entry gate were still the screen. The product now has its own boot latch
// (src/app/bootReadiness.ts) with the flag as a write-only harness mirror, and the lifecycle a 'boot' state.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootReadiness, createBootReadiness, isBootReady, whenBootReady } from './bootReadiness.ts';
import { createAppLifecycle, isGarageScreenSettled, transitionAppPhase } from '../game/appLifecycle.ts';
import { mainSource, mainStatement, runMainStatements } from './mainComposition.test-support.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// The latch: a waiter registered early runs once at the settle, after the mirror; one registered late runs at once; a
// cancelled one never; a throwing one is reported and the rest still run; a second settle is a no-op.
{
  const order = [];
  const reported = [];
  const latch = createBootReadiness({ mirror: () => order.push('mirror'), report: (error) => reported.push(error.message) });
  assert.equal(latch.ready, false);
  latch.whenReady(() => order.push('early'));
  const cancel = latch.whenReady(() => order.push('cancelled'));
  latch.whenReady(() => { throw new Error('waiter broke'); });
  latch.whenReady(() => order.push('after the broken one'));
  cancel();
  latch.markReady();
  assert.equal(latch.ready, true);
  assert.deepEqual(order, ['mirror', 'early', 'after the broken one']);
  assert.deepEqual(reported, ['waiter broke'], 'a broken waiter never stops the boot or the other waiters');
  latch.whenReady(() => order.push('late'));
  latch.markReady();
  assert.deepEqual(order, ['mirror', 'early', 'after the broken one', 'late'], 'one mirror write, late waiters run at once');
}

// The page's latch writes both mirrors, and only when it settles.
{
  assert.equal(globalThis.__GAME_READY, undefined);
  let ran = 0;
  whenBootReady(() => { ran += 1; });
  assert.equal(isBootReady(), false);
  bootReadiness.markReady();
  assert.equal(isBootReady(), true);
  assert.equal(ran, 1);
  assert.equal(globalThis.__GAME_READY, true, 'the harness mirror');
  assert.equal(globalThis.__COT_BOOT_READY, true, "index.html's inline scripts' mirror");
  delete globalThis.__GAME_READY;
  delete globalThis.__COT_BOOT_READY;
}

// No product code reads the harness flag: only the latch names it under src/ (comments aside), and index.html's inline
// scripts read their own mirror. Tools read it through tools/game-readiness.mjs.
{
  const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const readers = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) { walk(file); continue; }
      if (!/\.(ts|tsx|mjs|js)$/.test(name) || /\.(selftest|test-support)\.mjs$/.test(name) || /\.d\.ts$/.test(name)) continue;
      const rel = relative(ROOT, file);
      if (rel === 'src/app/bootReadiness.ts') continue;
      if (/__GAME_READY/.test(stripComments(readFileSync(file, 'utf8')))) readers.push(rel);
    }
  };
  walk(join(ROOT, 'src'));
  assert.deepEqual(readers, [], 'product modules that read the harness flag');
  const html = stripComments(readFileSync(join(ROOT, 'index.html'), 'utf8'));
  assert.doesNotMatch(html, /__GAME_READY/, "index.html's inline scripts read __COT_BOOT_READY, never the harness flag");
  assert.match(html, /window\.__COT_BOOT_READY/, 'the inline watchdog still has its ready flag');
  assert.match(mainSource, /\nbootReadiness\.markReady\(\);\n/, 'main settles the latch at the end of the boot');
}

// The lifecycle's 'boot' state: the splash is the screen until the latch settled and the entry gate let the player in
// (a /studio boot included); a settled Garage only then. main binds the reader.
{
  const game = { phase: 'garage', preBattleS: 0, result: null, resultTimeS: null, timeS: 0 };
  const appLifecycle = createAppLifecycle({ game, announce() {} });
  const scope = {
    appLifecycle,
    bootReadiness: { ready: false },
    boot: { gated: false },
    battleEntryLifecycle: { pending: false, renderingCovered: false },
    battleLoad: { covering: false },
    garageReturn: { state: 'idle' },
  };
  runMainStatements(mainStatement('appLifecycle.setReaders({'), scope, 'null');
  assert.equal(appLifecycle.state, 'boot', 'still loading: the splash is the screen');
  assert.equal(isGarageScreenSettled(game), false, 'F8 and the Studio button wait for the Garage screen');
  scope.bootReadiness.ready = true;
  scope.boot.gated = true;
  assert.equal(appLifecycle.state, 'boot', 'loaded, and the entry gate still waits on the player');
  scope.boot.gated = false;
  assert.equal(appLifecycle.state, 'garage');
  assert.equal(appLifecycle.snapshot().state, 'garage', 'the published snapshot (window.__APP_LIFECYCLE) agrees');
  assert.equal(isGarageScreenSettled(game), true);
  scope.bootReadiness.ready = false;
  transitionAppPhase(game, 'studio', { reason: 'studio:boot' });
  assert.equal(appLifecycle.state, 'boot', 'a /studio boot is under the splash too');
  scope.bootReadiness.ready = true;
  assert.equal(appLifecycle.state, 'studio');
}

console.log('bootReadiness.selftest: the boot latch, its mirrors, no product reader of the harness flag, the lifecycle boot state');
