#!/usr/bin/env node
// strip-nc-registry-probe.mjs — subprocess helper for strip-nc-assets.mjs.
//
// Imports the same boot-light fleet facade used by the browser and prints
// {allIds, sources} as JSON on a marker line, then the repository files the
// import loaded on a second marker line: strip-nc-assets.mjs reuses the result
// while all of them are byte-identical. Runs in its own process so the
// postbuild guard can fail closed without contaminating its module cache.
//
// Note import.meta.env does not exist under bare node, so every
// VITE_PUBLIC_BUILD-gated recovered registration resolves the PUBLIC way
// here — the guard checks exactly what a public artifact would register.

import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '__STRIP_NC_REGISTRY__';
const INPUTS_MARKER = '__STRIP_NC_INPUTS__';

// The fleet reads no files of its own (it also runs in the browser), so the modules it loads are its inputs.
const loaded = new Set();
registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:')) loaded.add(fileURLToPath(url));
    return nextLoad(url, context);
  },
});

await import(path.join(ROOT, 'src', 'vehicles', 'fleetFactory.ts'));
const specs = await import(path.join(ROOT, 'src', 'vehicles', 'specs.ts'));

const sources = {};
for (const id of specs.ALL_TANK_IDS) {
  const src = specs.MODEL_SOURCE[id];
  const p = src && src.glb && src.glb.path;
  if (p) sources[id] = p;
}
console.log(MARKER + JSON.stringify({ allIds: specs.ALL_TANK_IDS, sources }));
console.log(INPUTS_MARKER + JSON.stringify([...loaded].map((file) => path.relative(ROOT, file).split(path.sep).join('/')).sort()));
