// Sample pixel stats from a PNG: node tools/pixprobe.mjs <in.png> <x> <y> <w> <h> [x y w h ...]
// Prints mean RGB + min/max luma per region.
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [inPath, ...nums] = process.argv.slice(2);
const b64 = readFileSync(resolve(inPath)).toString('base64');
const regions = [];
for (let i = 0; i + 3 < nums.length; i += 4) {
  regions.push(nums.slice(i, i + 4).map(Number));
}
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const out = await page.evaluate(async (b64png, regs) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64png}`;
  await img.decode();
  const cnv = document.createElement('canvas');
  cnv.width = img.width; cnv.height = img.height;
  const ctx = cnv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return regs.map(([x, y, w, h]) => {
    const d = ctx.getImageData(x, y, w, h).data;
    let r = 0, g = 0, b = 0, n = 0, lmin = 255, lmax = 0, hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (l < lmin) lmin = l;
      if (l > lmax) lmax = l;
      if (l > 235) hi++;
    }
    return {
      region: [x, y, w, h],
      mean: [r / n, g / n, b / n].map((v) => +v.toFixed(1)),
      lumaMin: +lmin.toFixed(1), lumaMax: +lmax.toFixed(1),
      pctOver235: +(100 * hi / n).toFixed(2),
    };
  });
}, b64, regions);
console.log(JSON.stringify(out, null, 1));
await browser.close();
