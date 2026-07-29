// Measure the sun-only images themselves: how black is the tank-shadow core
// vs the lit road at each distance? (shadow-map integrity test)
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const d of [80, 160, 240]) {
  const b64 = readFileSync(resolve(`shots/crops/r3lp_d2_${d}_sun.png`)).toString('base64');
  const out = await page.evaluate(async (b, cx, cy, cw, ch) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b}`;
    await img.decode();
    const cnv = document.createElement('canvas');
    cnv.width = img.width; cnv.height = img.height;
    const ctx = cnv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const D = ctx.getImageData(cx, cy, cw, ch).data;
    const lum = (i) => (0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]) / 255;
    const ls = [];
    for (let i = 0; i < D.length; i += 4) ls.push(lum(i));
    ls.sort((a, b) => a - b);
    const q = (p) => +ls[Math.floor(p * (ls.length - 1))].toFixed(3);
    // darkest decile = shadow core; brightest quartile = lit surface
    let dSum = 0, dn = Math.floor(ls.length * 0.10);
    for (let i = 0; i < dn; i++) dSum += ls[i];
    let bSum = 0, bn = Math.floor(ls.length * 0.25);
    for (let i = ls.length - bn; i < ls.length; i++) bSum += ls[i];
    return { p5: q(0.05), p25: q(0.25), p50: q(0.5), p95: q(0.95), darkDecileMean: +(dSum / dn).toFixed(3), brightQuartMean: +(bSum / bn).toFixed(3) };
  }, b64, 880, 500, 180, 130);
  console.log(`d${d} sun-only window:`, JSON.stringify(out));
}
await browser.close();
