// node tools/media-r5/mosaic.mjs <dir> <map> <out.jpg> [tile=240] [cols=8]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, map, out, tileArg, colsArg] = process.argv.slice(2);
const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')).filter(r => r.file && (!map || map === '*' || r.map === map));
const tw = Number(tileArg ?? 240), th = Math.round(tw * 9 / 16), cols = Number(colsArg ?? 8), lab = 14;
const rows = Math.ceil(results.length / cols);
const c = createCanvas(cols * tw, rows * (th + lab)), g = c.getContext('2d');
g.fillStyle = '#0b0e11'; g.fillRect(0, 0, c.width, c.height); g.font = 'bold 11px sans-serif';
for (const [i, r] of results.entries()) {
  const im = await loadImage(readFileSync(r.file)); const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + lab);
  g.drawImage(im, x, y, tw - 2, th); g.fillStyle = '#ffd27a';
  g.fillText(`${i}:${r.name.split('-').slice(1, 3).join('-')}·${r.tag}`, x + 3, y + th + 11);
}
writeFileSync(out, c.toBuffer('image/jpeg', 82));
console.log(results.length, 'tiles ->', out);
