import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { tileableTorusNoise } from './proceduralTexture.ts';

// Ground lane (2026-10-05): the upload under test. A texture built from a CPU field carries the field's rows to the GPU
// by its flipY — a canvas uploads flipped (its top row at v = 1), a DataTexture as written — and the terrain noise had
// gone up flipped for months while its CPU twin read the rows as written: the shader drew every field mirrored in z
// against the twin, so the tufts and the tall grass thinned where the ground drew green and stood on its bare patches
// (the lab's read-back over 200 m of Saltwind: mean |Δ| 0.126 as the twin reads it, 0.0013 turned over). The ring's
// detail noise had the same mirror against the stands it places. Each texture here is built by its real code and read
// the way WebGL samples it — bilinear between texel centres, repeat-wrapped, upload row i at v = (i + 0.5) / S, the
// source's rows top-down with flipY false and bottom-up with it true — against the twin that shares its field.

/** WebGL's bilinear sample of an uploaded RGBA8 source (rows top-down) at (u, v), repeat-wrapped. */
function glSample(bytes, w, h, channel, flipY, u, v) {
  const x = u * w - 0.5, y = v * h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const col = (c) => ((c % w) + w) % w;
  const row = (r) => { const t = ((r % h) + h) % h; return flipY ? h - 1 - t : t; };
  const at = (c, r) => bytes[(row(r) * w + col(c)) * 4 + channel] / 255;
  const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
  const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
  return a + (b - a) * fy;
}

function declarations(file, names) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return names.map((name) => {
    const found = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(found.length, 1, `${file}: one declaration of ${name}`);
    return found[0].getText(ast);
  }).join('\n').replace(/^export /gm, '');
}

let rngState = 0x2f6b1d3;
const rnd = () => { rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 4294967296; };

// 1. the terrain noise (makeShaderNoiseTexture) against its CPU twin (fieldSample, every sampleSplatNoise and karst read)
{
  const api = new Function('THREE', 'SimplexNoise', 'torusNoise', 'canvasToTexture', stripTypeScriptTypes(`
    const SPLAT_FIELD_S = 256;
    let _splatFields = null;
    ${declarations('./terrain.ts', ['mulberry32', 'splatFields', 'splatFieldSteps', 'fieldSample', 'wrapUnit',
      'makeShaderNoiseTexture', 'stampWoodsMaskRows'])}
  `) + '\nreturn { fields: splatFields, fieldSample, noiseTexture: makeShaderNoiseTexture, stampWoods: stampWoodsMaskRows };')(THREE, SimplexNoise, tileableTorusNoise, (pixels, size) => {
    // the real helper's canvas upload: a texture (flipY true unless the builder turns it off) over the bytes as written
    const texture = new THREE.CanvasTexture({ width: size, height: size });
    texture.userData.rows = pixels.slice();
    return texture;
  });
  const texture = api.noiseTexture(3011), rows = texture.userData.rows, { a, b } = api.fields();
  let worst = 0, mirrored = 0;
  const N = 4000;
  for (let k = 0; k < N; k++) {
    const u = rnd(), v = rnd();
    const twinR = api.fieldSample(a, u, v) * 0.5 + 0.5, twinG = api.fieldSample(b, u, v) * 0.5 + 0.5;
    worst = Math.max(worst, Math.abs(glSample(rows, 256, 256, 0, texture.flipY, u, v) - twinR),
      Math.abs(glSample(rows, 256, 256, 1, texture.flipY, u, v) - twinG));
    mirrored += Math.abs(glSample(rows, 256, 256, 1, !texture.flipY, u, v) - twinG);
  }
  assert.ok(worst <= 1 / 255, `the shader's R and G read the twin's fields (worst |Δ| ${(worst * 255).toFixed(2)}/255)`);
  assert.ok(mirrored / N > 0.03, `the check tells the mirror apart (mean |Δ| turned over ${(mirrored / N).toFixed(3)})`);

  // the woods mask in its blue channel: the cell the vegetation's _woodsAt reads at (x, z) is the texel the shader's
  // woods read (nz(wp.xz, 1/1024, 0.5).b: u = x / 1024 + 0.5, v = z / 1024 + 0.5) samples there
  const size = 256, mask = new Float32Array(size * size), data = new Uint8ClampedArray(size * size * 4);
  const hot = [[40, 200], [41, 200], [40, 201], [41, 201], [180, 30], [181, 30], [180, 31], [181, 31]];
  for (const [i, j] of hot) mask[j * size + i] = 1;
  api.stampWoods(data, mask, size);
  for (const [i, j] of hot) {
    const x = -512 + (i + 0.5) * 4, z = -512 + (j + 0.5) * 4;
    assert.equal(glSample(data, size, size, 2, texture.flipY, x / 1024 + 0.5, z / 1024 + 0.5), 1, `woods cell (${i}, ${j}) at its own (x, z)`);
    assert.equal(glSample(data, size, size, 2, texture.flipY, x / 1024 + 0.5, -z / 1024 + 0.5), 0, `and not at its z-mirror`);
  }
}

// 2. the ring's detail noise (horizon.ts makeDetailNoiseTextureSteps) against its JS twin (createDetailNoise: the ring
// forest's stands in horizonVista.ts, the rock field in horizonRockfield.ts) at the texel centres it was written at
{
  const canvas = { width: 0, height: 0, image: null };
  const ctx = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img) => { canvas.image = img; },
  };
  const api = new Function('THREE', 'document', 'require2DContext', stripTypeScriptTypes(`
    ${declarations('./maps/horizon.ts', ['clamp', 'createDetailNoise', 'makeDetailNoiseTextureSteps'])}
  `) + '\nreturn { createDetailNoise, makeDetailNoiseTextureSteps };')(THREE, { createElement: () => canvas }, () => ctx);
  const sample = api.createDetailNoise(((seed) => () => { seed = (Math.imul(seed, 48271) % 2147483647 + 2147483647) % 2147483647; return seed / 2147483647; })(91));
  const steps = api.makeDetailNoiseTextureSteps(sample);
  let step = steps.next();
  while (!step.done) step = steps.next();
  const texture = step.value, rows = canvas.image.data, S = canvas.image.width;
  let worst = 0, mirrored = 0;
  for (let k = 0; k < 2000; k++) {
    const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S), u = (x + 0.5) / S, v = (y + 0.5) / S;
    const twin = Math.min(255, Math.max(0, sample(u, v) * 255)) / 255;
    worst = Math.max(worst, Math.abs(glSample(rows, S, S, 0, texture.flipY, u, v) - twin));
    mirrored += Math.abs(glSample(rows, S, S, 0, !texture.flipY, u, v) - twin);
  }
  assert.ok(worst <= 1 / 255, `the ring's detail read is its twin's (worst |Δ| ${(worst * 255).toFixed(2)}/255)`);
  assert.ok(mirrored / 2000 > 0.03, `the check tells the mirror apart (mean |Δ| turned over ${(mirrored / 2000).toFixed(3)})`);
}

console.log('textureUploadOrientation: the terrain noise (R, G against fieldSample, the woods mask in B against its cells) and the ring\'s detail noise read by their twins as WebGL samples them, the mirror told apart PASS');
