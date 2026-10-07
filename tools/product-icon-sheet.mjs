// CPU-only SVG review at native UI sizes; no WebGL or capture queue required.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const output = resolve(process.argv[2] || '.qa-dev/product-icons.png');
const sheet = createCanvas(1040, 1000), ctx = sheet.getContext('2d');
ctx.fillStyle = '#0b1117'; ctx.fillRect(0, 0, sheet.width, sheet.height);
let index = 0;
for (const dir of ['nav', 'features']) for (const file of readdirSync(`public/brand/${dir}`).filter(f => f.endsWith('.svg'))) {
 const source = readFileSync(`public/brand/${dir}/${file}`, 'utf8');
 const [,w,h] = source.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
 const left = index % 4 * 260, top = Math.floor(index / 4) * 250;
 for (const [height, x, y] of [[112, left + 36, top + 12], [32, left + 48, top + 154], [24, left + 132, top + 158]]) {
  const width = Math.round(height * w / h);
  const image = await loadImage(Buffer.from(source.replace('<svg ', `<svg width="${width}" height="${height}" `)));
  ctx.drawImage(image, x, y);
 }
 ctx.fillStyle = '#bdcbd6'; ctx.font = '15px sans-serif'; ctx.fillText(`${dir}/${file}`, left + 20, top + 220);
 index++;
}
mkdirSync(dirname(output), { recursive:true }); writeFileSync(output, sheet.toBuffer('image/png'));
console.log(`Rendered ${index} product icons at 112, 32, and 24 pixels: ${output}`);
