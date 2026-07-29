// Build a shadow mask from the sun-only capture (noambient) and measure how
// dark those exact pixels are in the full-lighting base capture.
// Usage: node tools/tmp-lp-r3-maskdiff.mjs <sunonly.png> <base.png> <x> <y> <w> <h> <label>
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [sunPath, basePath, x, y, w, h, label] = process.argv.slice(2);
const b64a = readFileSync(resolve(sunPath)).toString('base64');
const b64b = readFileSync(resolve(basePath)).toString('base64');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const out = await page.evaluate(async (a, b, cx, cy, cw, ch) => {
  const load = async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cnv = document.createElement('canvas');
    cnv.width = img.width; cnv.height = img.height;
    const ctx = cnv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(cx, cy, cw, ch).data;
  };
  const A = await load(a); // sun-only
  const B = await load(b); // full lighting
  const lum = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  let sSum = 0, sN = 0, lSum = 0, lN = 0;
  for (let i = 0; i < A.length; i += 4) {
    const la = lum(A, i);
    const lb = lum(B, i);
    if (la < 0.02) { sSum += lb; sN++; } // fully shadowed under sun-only
    else if (la > 0.22) { lSum += lb; lN++; } // clearly sun-lit
  }
  return {
    shadowPx: sN, litPx: lN,
    meanShadowLumaInBase: sN ? +(sSum / sN).toFixed(3) : null,
    meanLitLumaInBase: lN ? +(lSum / lN).toFixed(3) : null,
    ratio: sN && lN ? +((sSum / sN) / (lSum / lN)).toFixed(3) : null,
  };
}, b64a, b64b, +x, +y, +w, +h);
console.log(label || '', JSON.stringify(out));
await browser.close();
