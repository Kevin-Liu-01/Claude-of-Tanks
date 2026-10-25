#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// The renderer probe's scenes as files for the native probe (native/wgpu-probe): the very geometry web/scene.mjs hands
// the browser renderers, per sweep step. Each file: eight little-endian u32 lengths (terrain positions, normals,
// indices; tank positions, normals, indices; poses; colours), then those arrays (f32, f32, u32, f32, f32, u32, f32, f32).
//
//   node tools/wgpu-probe-scenes.mjs [--out=.qa-dev/wgpu-native]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildScene } from '../wasm/wgpu-probe/web/scene.mjs';

/** tools/wgpu-probe-run.mjs's sweep: geometry-bound to draw-bound. */
export const SWEEP = [
  { tanks: 18, detail: 40, frames: 60, rounds: 5 },
  { tanks: 300, detail: 8, frames: 30, rounds: 3 },
  { tanks: 1500, detail: 4, frames: 15, rounds: 3 },
  { tanks: 3000, detail: 2, frames: 10, rounds: 3 },
];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const out = resolve(arg('out', '.qa-dev/wgpu-native'));
  mkdirSync(out, { recursive: true });
  for (const step of SWEEP) {
    const scene = buildScene({ tanks: step.tanks, detail: step.detail });
    const arrays = [scene.terrain.positions, scene.terrain.normals, scene.terrain.indices, scene.tank.positions, scene.tank.normals,
      scene.tank.indices, scene.poses, scene.colors].map((a) => (a instanceof Uint32Array || a instanceof Float32Array ? a : Float32Array.from(a)));
    const header = Uint32Array.from(arrays.map((a) => a.length));
    const file = resolve(out, `scene-${step.tanks}-${step.detail}.bin`);
    writeFileSync(file, Buffer.concat([Buffer.from(header.buffer), ...arrays.map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength))]));
    console.log(`${file}: ${step.tanks} tanks, ${scene.triangles.toLocaleString()} triangles a pass`);
  }
}
