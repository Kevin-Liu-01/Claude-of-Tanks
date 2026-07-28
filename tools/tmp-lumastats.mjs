// Luma stats for a PNG region: node tools/tmp-lumastats.mjs <in.png> <x> <y> <w> <h>
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [inPath, x = '0', y = '0', w = '0', h = '0'] = process.argv.slice(2);
const b64 = readFileSync(resolve(inPath)).toString('base64');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const stats = await page.evaluate(async (b64png, cx, cy, cw, ch) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64png}`;
  await img.decode();
  const W = cw || img.width, H = ch || img.height;
  const cnv = document.createElement('canvas');
  cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext('2d');
  ctx.drawImage(img, cx, cy, W, H, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const hist = new Array(16).fill(0);
  let sum = 0, sumSat = 0, n = 0;
  const lumas = [];
  for (let i = 0; i < d.length; i += 16) { // sample every 4th px
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sumSat += mx > 0 ? (mx - mn) / mx : 0;
    sum += l; n++;
    hist[Math.min(15, Math.floor(l * 16))]++;
    lumas.push(l);
  }
  lumas.sort((a, b) => a - b);
  const q = (p) => lumas[Math.floor(p * (lumas.length - 1))];
  return {
    mean: (sum / n).toFixed(3), sat: (sumSat / n).toFixed(3),
    p5: q(0.05).toFixed(3), p25: q(0.25).toFixed(3), p50: q(0.5).toFixed(3),
    p75: q(0.75).toFixed(3), p95: q(0.95).toFixed(3),
    hist: hist.map((v) => (v / n * 100).toFixed(1)),
  };
}, b64, +x, +y, +w, +h);
console.log(inPath, JSON.stringify(stats));
await browser.close();
