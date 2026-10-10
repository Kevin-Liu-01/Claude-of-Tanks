// node tools/media-r5/plate.mjs <map> <out.jpg> [features.json]
// North-up planning plate: minimap + world grid (+X left, +Z up) + markers.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [map, out, featsFile] = process.argv.slice(2);
const S = 1600, W = 1024, half = W / 2, pad = 40;
const im = await loadImage(readFileSync(`public/minimaps/${map}.webp`));
const c = createCanvas(S + pad * 2, S + pad * 2), g = c.getContext('2d');
g.fillStyle = '#0b0e11'; g.fillRect(0, 0, c.width, c.height);
g.drawImage(im, pad, pad, S, S);
const px = (x, z) => [pad + (half - x) / W * S, pad + (half - z) / W * S];
g.font = 'bold 13px sans-serif'; g.lineWidth = 1;
for (let v = -512; v <= 512; v += 64) {
  const [x0] = px(v, 0), [, y0] = px(0, v);
  g.strokeStyle = v % 256 ? 'rgba(255,255,255,.18)' : 'rgba(255,210,122,.55)';
  g.beginPath(); g.moveTo(x0, pad); g.lineTo(x0, pad + S); g.stroke();
  g.beginPath(); g.moveTo(pad, y0); g.lineTo(pad + S, y0); g.stroke();
  if (v % 128 === 0) { g.fillStyle = '#ffd27a'; g.fillText(`x${v}`, x0 - 14, 16); g.fillText(`z${v}`, 2, y0 + 4); }
}
if (featsFile && existsSync(featsFile)) {
  const f = JSON.parse(readFileSync(featsFile, 'utf8'));
  const dot = (x, z, color, label, r = 7) => { const [a, b] = px(x, z); g.fillStyle = color; g.beginPath(); g.arc(a, b, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#000'; g.stroke(); if (label) { g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(label, a + 9, b + 4); g.fillText(label, a + 9, b + 4); g.lineWidth = 1; } };
  for (const b of f.buildings ?? []) { const [a, bb] = px(b.x, b.z); g.fillStyle = 'rgba(255,80,80,.55)'; g.fillRect(a - 3, bb - 3, 6, 6); }
  for (const t of f.treeClusters ?? []) { const [a, b] = px(t.x, t.z); g.strokeStyle = 'rgba(80,255,120,.6)'; g.beginPath(); g.arc(a, b, t.r / W * S, 0, Math.PI * 2); g.stroke(); }
  for (const b of f.tacticalBeats ?? []) dot(b.x, b.z, '#f0a12e', b.id);
  for (const s of f.spawns ?? []) dot(s[0], s[1], s[2] === 'ally' ? '#4aa3ff' : '#ff4a4a', s[2], 6);
  if (f.village) dot(f.village[0], f.village[1], '#ffffff', 'village', 8);
  if (f.shot) { const [a, b] = px(f.shot.pos[0], f.shot.pos[2]), [c2, d] = px(f.shot.look[0], f.shot.look[2]); g.strokeStyle = '#ff0'; g.lineWidth = 2; g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); g.lineWidth = 1; dot(f.shot.pos[0], f.shot.pos[2], '#ff0', 'shot cam', 5); }
  for (const l of f.landmarks ?? []) dot(l.x, l.z, '#ff66ff', l.label ?? l.kind, 6);
}
g.fillStyle = '#ffd27a'; g.font = 'bold 22px sans-serif'; g.fillText(`${map}  (north-up: +Z up, +X left)`, pad + 8, pad + S + 30);
writeFileSync(out, c.toBuffer('image/jpeg', 86)); console.log(out);
