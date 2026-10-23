#!/usr/bin/env node
// CPU-only review sheet for the UI icon sprite (src/ui/icons/sprite.svg); no WebGL and no capture queue.
// Every 24-unit master renders at 64 px (keyline check), 24 px and 16 px; a 16-unit optical master, when the sprite
// has one, renders at 16 px beside its 24-unit parent, and active-capable glyphs show their filled state.
//   node tools/icon-sheet.mjs [out.png] [--only=prefix,prefix] [--cols=8] [--scale=2]
// Copyright © 2026 Kevin B. Liu.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVE_ICON_IDS, parseIconSprite } from './icon-sprite-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const output = resolve(args.find((a) => !a.startsWith('--')) || '.qa-dev/icon-sheet.png');
const only = flag('only', '').split(',').filter(Boolean);
const cols = Number(flag('cols', '8'));
const scale = Number(flag('scale', '2'));

const sprite = parseIconSprite(readFileSync(resolve(root, 'src/ui/icons/sprite.svg'), 'utf8'));
const ids = [...sprite.large.keys()].filter((id) => !only.length || only.some((p) => id.startsWith(p)));

const INK = '#ece8de';
const ACCENT = '#ffbd5c';
const BG = '#0b0e11';
const CELL_W = 236;
const CELL_H = 132;

function svgFor(body, grid, size, color, active) {
  const fill = active ? 'currentColor" fill-rule="evenodd' : 'none';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${grid} ${grid}">`
    + `<g color="${color}" fill="${fill}" stroke="currentColor" stroke-width="${grid === 16 ? 1.25 : 1.5}" `
    + `stroke-linecap="square" stroke-linejoin="miter">${body}</g></svg>`;
}

async function draw(ctx, body, grid, size, x, y, color = INK, active = false) {
  const px = size * scale;
  const image = await loadImage(Buffer.from(svgFor(body, grid, px, color, active)));
  ctx.drawImage(image, x * scale, y * scale);
}

const rows = Math.ceil(ids.length / cols);
const sheet = createCanvas(cols * CELL_W * scale, rows * CELL_H * scale);
const ctx = sheet.getContext('2d');
ctx.fillStyle = BG;
ctx.fillRect(0, 0, sheet.width, sheet.height);
for (const [index, id] of ids.entries()) {
  const left = (index % cols) * CELL_W;
  const top = Math.floor(index / cols) * CELL_H;
  ctx.fillStyle = '#11151a';
  ctx.fillRect((left + 4) * scale, (top + 4) * scale, (CELL_W - 8) * scale, (CELL_H - 8) * scale);
  const body = sprite.large.get(id);
  await draw(ctx, body, 24, 64, left + 12, top + 12);
  await draw(ctx, body, 24, 24, left + 88, top + 14);
  await draw(ctx, body, 24, 16, left + 120, top + 18);
  const small = sprite.small.get(id);
  if (small) {
    await draw(ctx, small, 16, 16, left + 144, top + 18, ACCENT);
    await draw(ctx, small, 16, 48, left + 168, top + 12, ACCENT);
  }
  if (ACTIVE_ICON_IDS.has(id)) {
    await draw(ctx, body, 24, 24, left + 88, top + 48, ACCENT, true);
    if (small) await draw(ctx, small, 16, 16, left + 120, top + 52, ACCENT, true);
  }
  ctx.fillStyle = '#9a9a95';
  ctx.font = `${12 * scale}px sans-serif`;
  ctx.fillText(id, (left + 12) * scale, (top + CELL_H - 18) * scale);
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, sheet.toBuffer('image/png'));
console.log(`icon sheet: ${ids.length} glyphs (${sprite.small.size} with 16-unit masters) -> ${output}`);
