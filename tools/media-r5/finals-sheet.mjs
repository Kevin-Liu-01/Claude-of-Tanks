// Contact sheet of final cinema stills: node finals-sheet.mjs <root> <out.jpg> [cols=3] [tile=640]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const [root, out, colsArg, tileArg] = process.argv.slice(2);
const cols = Number(colsArg ?? 3), tw = Number(tileArg ?? 640), th = Math.round(tw * 9 / 16), lab = 20;
const items = [];
for (const d of readdirSync(root).sort()) {
  const sd = join(root, d, 'stills'); if (!existsSync(sd)) continue;
  for (const f of readdirSync(sd).filter(f => f.endsWith('.png')).sort()) items.push({ label: d, file: join(sd, f) });
}
const rows = Math.ceil(items.length / cols), c = createCanvas(cols * tw, rows * (th + lab)), g = c.getContext('2d');
g.fillStyle = '#0b0e11'; g.fillRect(0, 0, c.width, c.height); g.font = 'bold 14px sans-serif';
for (const [i, it] of items.entries()) {
  const im = await loadImage(readFileSync(it.file)); const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + lab);
  g.drawImage(im, x, y, tw - 3, th); g.fillStyle = '#ffd27a'; g.fillText(it.label, x + 6, y + th + 15);
}
writeFileSync(out, c.toBuffer('image/jpeg', 85));
console.log(`${items.length} stills -> ${out}`);
