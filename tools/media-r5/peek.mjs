// Quick review sheet of finished lab jobs on disk (before results.json exists).
// node tools/media-r5/peek.mjs <reviewDir> <out.jpg> [match,...] [tile=320]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const [dir, out, match, tileArg] = process.argv.slice(2);
const want = match ? match.split(',') : null;
const tw = Number(tileArg ?? 320), th = Math.round(tw * 9 / 16), lab = 16;
const rows = [];
for (const f of readdirSync(dir).sort()) {
  const m = /^(.+)-frames$/.exec(f), s = /^(.+)__still\.png$/.exec(f);
  const name = m?.[1] ?? s?.[1]; if (!name) continue;
  if (want && !want.some(w => name.includes(w))) continue;
  if (m) { const fr = readdirSync(join(dir, f)).filter(x => x.endsWith('.png')).sort(); if (fr.length) rows.push({ name, files: fr.map(x => join(dir, f, x)) }); }
  else rows.push({ name, files: [join(dir, f)] });
}
// pack: films take a row of 4, stills pack 4 per row
const lines = []; let cur = [];
for (const r of rows) {
  if (r.files.length > 1) { if (cur.length) { lines.push(cur); cur = []; } lines.push(r.files.map((file, i) => ({ file, label: i ? '' : r.name }))); }
  else { cur.push({ file: r.files[0], label: r.name }); if (cur.length === 4) { lines.push(cur); cur = []; } }
}
if (cur.length) lines.push(cur);
const cols = 4, c = createCanvas(cols * tw, lines.length * (th + lab)), g = c.getContext('2d');
g.fillStyle = '#0b0e11'; g.fillRect(0, 0, c.width, c.height); g.font = 'bold 12px sans-serif';
for (const [y, line] of lines.entries()) for (const [x, cell] of line.entries()) {
  const im = await loadImage(readFileSync(cell.file)); g.drawImage(im, x * tw, y * (th + lab), tw - 2, th);
  if (cell.label) { g.fillStyle = '#ffd27a'; g.fillText(cell.label, x * tw + 4, y * (th + lab) + th + 12); }
}
writeFileSync(out, c.toBuffer('image/jpeg', 82));
console.log(`${rows.length} jobs -> ${out}`);
