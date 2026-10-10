#!/usr/bin/env node
// Contact sheet of the delivered site fifty (each shot's 1920 px WebP still, numbered and titled).
//   node tools/media-r5/site-sheet.mjs [out=shots/media-r5/site50/site50-sheet.jpg] [cols=5] [tile=384]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { SHOTS } from './paths.mjs';

const [outArg, colsArg = '5', tileArg = '384'] = process.argv.slice(2);
const out = outArg ?? join(SHOTS, 'site50/site50-sheet.jpg');
const deliver = join(SHOTS, 'site50/deliver');
const meta = JSON.parse(readFileSync(join(SHOTS, 'site50/site50-manifest.json'), 'utf8'));
const cols = Number(colsArg), tw = Number(tileArg), th = Math.round(tw * 9 / 16), cap = 22;
const rows = Math.ceil(meta.length / cols);
const c = createCanvas(cols * tw, rows * (th + cap)), g = c.getContext('2d');
g.fillStyle = '#0b0e11'; g.fillRect(0, 0, c.width, c.height);
g.font = '15px sans-serif';
let shown = 0;
for (const [i, m] of meta.entries()) {
  const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + cap);
  const still = [join(deliver, m.id, `${m.id}.webp`), join(deliver, m.id, `${m.id}.jpg`)].find(existsSync);
  if (still) { g.drawImage(await loadImage(readFileSync(still)), x, y + cap, tw - 3, th); shown++; }
  else { g.fillStyle = '#1b2026'; g.fillRect(x, y + cap, tw - 3, th); }
  g.fillStyle = '#ffd27a'; g.fillText(`${String(m.n).padStart(2, '0')}  ${m.id.replace(/^s\d\d-/, '')}`, x + 6, y + 16);
}
writeFileSync(out, c.toBuffer('image/jpeg', 86));
console.log(`${out}: ${shown}/${meta.length} delivered`);
