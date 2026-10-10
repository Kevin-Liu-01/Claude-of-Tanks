// Review sheet for final films: 4 frames per film (10/37/63/90 %) -> one JPEG.
//   node film-sheet.mjs <filmsRoot> <out.jpg> [ids,...]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readdirSync, existsSync, writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const [root, out, idsArg] = process.argv.slice(2);
const want = idsArg ? idsArg.split(',') : null;
const tmp = mkdtempSync(join(tmpdir(), 'fsheet-'));
const rows = [];
for (const id of readdirSync(root).sort()) {
  if (want && !want.some(w => id.startsWith(w))) continue;
  const fd = join(root, id, 'films'); if (!existsSync(fd)) continue;
  const proxy = readdirSync(fd).find(f => f.endsWith('-proxy.mp4')); if (!proxy) continue;
  const src = join(fd, proxy);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).toString().trim());
  const files = [0.1, 0.37, 0.63, 0.9].map((u, k) => { const f = join(tmp, `${id}-${k}.jpg`); execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(dur * u), '-i', src, '-frames:v', '1', '-vf', 'scale=480:-2', f]); return f; });
  rows.push({ id, files });
}
const tw = 480, th = 270, lab = 18, c = createCanvas(4 * tw, rows.length * (th + lab)), g = c.getContext('2d');
g.fillStyle = '#0b0e11'; g.fillRect(0, 0, c.width, c.height); g.font = 'bold 13px sans-serif';
for (const [y, r] of rows.entries()) for (const [x, f] of r.files.entries()) {
  const im = await loadImage(readFileSync(f)); g.drawImage(im, x * tw, y * (th + lab), tw - 2, th);
  if (!x) { g.fillStyle = '#ffd27a'; g.fillText(r.id, 6, y * (th + lab) + th + 13); }
}
writeFileSync(out, c.toBuffer('image/jpeg', 82));
console.log(`${rows.length} films -> ${out}`);
