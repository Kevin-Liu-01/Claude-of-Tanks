#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// Build the renderer probe (wasm/wgpu-probe): the Rust crate for wasm32 (offline, the WebGPU backend only), its
// wasm-bindgen glue into pkg/, and the page bundle (three.js, three/webgpu, the glue, the scene) into dist/.
//
//   node tools/wgpu-probe-build.mjs     # then serve wasm/wgpu-probe/dist and open index.html?tanks=18&rounds=5
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CRATE = path.join(ROOT, 'wasm/wgpu-probe');
const run = (cmd, args, cwd = CRATE) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

run('cargo', ['build', '-q', '--offline', '--release', '--target', 'wasm32-unknown-unknown']);
run('wasm-bindgen', ['--target', 'web', '--out-dir', 'pkg', 'target/wasm32-unknown-unknown/release/cot_wgpu_probe.wasm']);
const dist = path.join(CRATE, 'dist');
mkdirSync(dist, { recursive: true });
const { build } = await import('esbuild');
await build({ entryPoints: [path.join(CRATE, 'web/probe.mjs')], bundle: true, format: 'esm', target: 'es2022', outfile: path.join(dist, 'probe.js'), logLevel: 'warning', minify: true });
copyFileSync(path.join(CRATE, 'pkg/cot_wgpu_probe_bg.wasm'), path.join(dist, 'cot_wgpu_probe_bg.wasm'));
writeFileSync(path.join(dist, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Renderer probe</title><body style="margin:8px;background:#fff"><pre id="out">loading</pre><script type="module" src="probe.js"></script></body>\n');
const size = (f) => statSync(path.join(dist, f)).size;
console.log(`[wgpu-probe] dist/: probe.js ${size('probe.js')} B, cot_wgpu_probe_bg.wasm ${size('cot_wgpu_probe_bg.wasm')} B`);
