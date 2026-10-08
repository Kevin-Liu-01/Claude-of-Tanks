import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';

// Ground lane (2026-10-05, the texture-upload audit): a procedural normal map's green must be −∂h/∂v as the material
// reads the uploaded texture — three's tangent frame takes green along +v, and the terrain splat adds it to world +z
// with v = z·k — so a bump's normal leans away from it on every side. The height-to-normal helpers wrote −∂h/∂row into a
// canvas, and a canvas uploads flipped (its top row at v = 1): the green came out +∂h/∂v, every procedural bump lit
// backwards along v (the terrain's procedural layers, sandstone, props' buckets, regional surfaces, rock detail, the
// steel atlas, bark). Each helper is run here by its real code over a canvas stand-in, on one bump, and its texture read
// the way WebGL samples it (bilinear at texel centres, the upload's own flipY turning the rows) on the bump's four sides.

// a canvas and its 2D context as the helpers use them (the pixels kept as written, rows top-down)
const canvases = [];
globalThis.ImageData = class { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };
globalThis.document = {
  createElement: () => {
    const canvas = { width: 0, height: 0, rows: null };
    canvas.getContext = () => ({ putImageData: (img) => { canvas.rows = img.data; } });
    canvases.push(canvas);
    return canvas;
  },
};

/** WebGL's bilinear sample of an uploaded RGBA8 source (rows top-down) at (u, v), repeat-wrapped. */
function glSample(bytes, w, h, channel, flipY, u, v) {
  const x = u * w - 0.5, y = v * h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const col = (c) => ((c % w) + w) % w;
  const row = (r) => { const t = ((r % h) + h) % h; return flipY ? h - 1 - t : t; };
  const at = (c, r) => bytes[(row(r) * w + col(c)) * 4 + channel] / 255 * 2 - 1;
  const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
  const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
  return a + (b - a) * fy;
}

/** One bump (a 6-texel Gaussian) at canvas texel (bx, by) of an S × S height field. */
function bump(S, bx, by) {
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / 36);
  return h;
}

/** The bump's four sides, read through the texture as uploaded: the normal leans away from it along u and along v. */
function leansAway(label, texture, rows, S, bx, by) {
  const ub = (bx + 0.5) / S, vb = texture.flipY ? 1 - (by + 0.5) / S : (by + 0.5) / S, d = 5 / S;
  const R = (u, v) => glSample(rows, S, S, 0, texture.flipY, u, v), Gr = (u, v) => glSample(rows, S, S, 1, texture.flipY, u, v);
  assert.ok(R(ub + d, vb) > 0.05 && R(ub - d, vb) < -0.05, `${label}: red leans +u past the bump and −u before it`);
  assert.ok(Gr(ub, vb + d) > 0.05 && Gr(ub, vb - d) < -0.05,
    `${label}: green leans +v past the bump and −v before it (${Gr(ub, vb + d).toFixed(3)}, ${Gr(ub, vb - d).toFixed(3)})`);
}

// 1. proceduralTexture.ts normalTextureFromHeight (the terrain's procedural layers, props, regional surfaces, rock
// detail, the steel atlas)
{
  const { normalTextureFromHeight } = await import('./proceduralTexture.ts');
  const S = 64, bx = 21, by = 40;
  const texture = normalTextureFromHeight(bump(S, bx, by), S, 4, 1);
  const canvas = canvases[canvases.length - 1];
  assert.equal(texture.flipY, true, 'the helper uploads through a canvas (flipped)');
  leansAway('normalTextureFromHeight', texture, canvas.rows, S, bx, by);
  // the scenery lane's read-back case (b14-wt .qa-dev/normal-sign.mjs): a height rising with the GPU's v reads a green
  // under the flat 127.5 (the old helper wrote 128, 146, 254 at this texel)
  const ramp = new Float32Array(S * S);
  for (let r = 0; r < S; r++) for (let x = 0; x < S; x++) ramp[r * S + x] = 0.2 + 0.6 * (1 - (r + 0.5) / S);
  normalTextureFromHeight(ramp, S, 2, 1);
  const rows = canvases[canvases.length - 1].rows, o = (20 * S + 10) * 4;
  assert.ok(rows[o + 1] < 127.5 && Math.abs(rows[o] - 127.5) <= 1, `a height rising with v reads green under 127.5 (${rows[o]}, ${rows[o + 1]}, ${rows[o + 2]})`);
}

// 2. vegetation.ts _nrmFromHeight (the trees' bark), its real body
{
  const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('vegetation.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === '_nrmFromHeight');
  assert.equal(found.length, 1, 'vegetation.ts: one _nrmFromHeight');
  const nrmFromHeight = new Function('THREE', 'context2d', stripTypeScriptTypes(found[0].getText(ast)) + '\nreturn _nrmFromHeight;')(
    THREE, (c) => c.getContext('2d'));
  const S = 64, bx = 44, by = 17;
  const texture = nrmFromHeight(bump(S, bx, by), S, 4);
  const canvas = canvases[canvases.length - 1];
  leansAway('_nrmFromHeight (bark)', texture, canvas.rows, S, bx, by);
}

console.log('normalMapOrientation: normalTextureFromHeight and the bark\'s _nrmFromHeight lean a bump\'s normal away from it along u and v through their flipped canvas uploads PASS');
