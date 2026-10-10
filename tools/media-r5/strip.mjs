// node tools/media-r5/strip.mjs <framesDir> <out.jpg> [n=6] [tileW=480]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const [dir, out, nArg, twArg] = process.argv.slice(2);
const files = readdirSync(dir).filter(f => f.endsWith('.png')).sort();
const n = Number(nArg ?? 6), tw = Number(twArg ?? 480);
const pick = Array.from({ length: n }, (_, i) => files[Math.round(i * (files.length - 1) / (n - 1))]);
const first = await loadImage(readFileSync(join(dir, pick[0]))); const th = Math.round(tw * first.height / first.width);
const cols = Math.min(n, 3), rows = Math.ceil(n / cols);
const c = createCanvas(cols * tw, rows * (th + 16)), g = c.getContext('2d'); g.fillStyle = '#0b0e11'; g.fillRect(0, 0, c.width, c.height); g.font = 'bold 12px sans-serif';
for (const [i, f] of pick.entries()) { const im = await loadImage(readFileSync(join(dir, f))); const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + 16); g.drawImage(im, x, y, tw - 2, th); g.fillStyle = '#ffd27a'; g.fillText(f, x + 4, y + th + 12); }
writeFileSync(out, c.toBuffer('image/jpeg', 84));
