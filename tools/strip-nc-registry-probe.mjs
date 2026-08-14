#!/usr/bin/env node
// strip-nc-registry-probe.mjs — subprocess helper for strip-nc-assets.mjs.
//
// Imports the live vehicle spec registry (specs.js + every registry-mutating
// spec module) and prints {allIds, sources} as JSON on a marker line. Runs in
// its OWN process so a quirk anywhere in the app's module graph cannot kill
// the build script: profile modules ship dev-server-tolerant circular-import
// fallbacks (queueMicrotask TDZ retries) that surface as UNHANDLED microtask
// exceptions under a bare-node import — tolerated here, because a cosmetic
// fitting that fails to attach has no bearing on which MODEL_SOURCE paths a
// public build ships. The parent still fails CLOSED if this probe produces no
// registry at all.
//
// Note import.meta.env does not exist under bare node, so every
// VITE_PUBLIC_BUILD-gated recovered registration resolves the PUBLIC way
// here — the guard checks exactly what a public artifact would register.

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '__STRIP_NC_REGISTRY__';

process.on('uncaughtException', (e) => {
  console.error(`[registry-probe] tolerated module-graph exception: ${e.message}`);
});
process.on('unhandledRejection', (e) => {
  console.error(`[registry-probe] tolerated rejection: ${e && e.message ? e.message : e}`);
});

const specs = await import(path.join(ROOT, 'src', 'vehicles', 'specs.js'));
for (const mod of ['modern1.js', 'modern2.js', 'modern3.js',
  'variants.js', 'userdrops.js', 'userdrops2.js', 'userdrops3.js',
  'userdrops4.js', 'userdrops5.js', 'userdrops6.js', 'userdrops7.js']) {
  const p = path.join(ROOT, 'src', 'vehicles', mod);
  if (!existsSync(p)) continue;
  try {
    await import(p);
  } catch (e) {
    console.error(`[registry-probe] note: ${mod} not importable outside the app (${e.message})`);
  }
}
// settle any queued microtask fallbacks before reading the registry
await new Promise((r) => setTimeout(r, 0));

const sources = {};
for (const id of specs.ALL_TANK_IDS) {
  const src = specs.MODEL_SOURCE[id];
  const p = src && src.glb && src.glb.path;
  if (p) sources[id] = p;
}
console.log(MARKER + JSON.stringify({ allIds: specs.ALL_TANK_IDS, sources }));
