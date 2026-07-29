// temp luma probe (lighting_post r5): node tools/tmp-lp5b-luma.mjs <png> label,x,y,w,h ...
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [inPath, ...boxes] = process.argv.slice(2);
const b64 = readFileSync(resolve(inPath)).toString('base64');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const out = await page.evaluate(async (b64png, specs) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64png}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return specs.map((s) => {
    const [label, x, y, w, h] = s.split(',');
    const d = ctx.getImageData(+x, +y, +w, +h).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / n / 255;
    return `${label}: rgb(${(r / n).toFixed(0)},${(g / n).toFixed(0)},${(b / n).toFixed(0)}) luma=${L.toFixed(3)}`;
  });
}, b64, boxes);
console.log(out.join('\n'));
await browser.close();
