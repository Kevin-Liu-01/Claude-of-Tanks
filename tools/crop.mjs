// Crop a PNG region for close inspection: node tools/crop.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [inPath, outPath, x, y, w, h, scale = '1'] = process.argv.slice(2);
const b64 = readFileSync(resolve(inPath)).toString('base64');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const dataUrl = await page.evaluate(
  async (b64png, cx, cy, cw, ch, s) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64png}`;
    await img.decode();
    const cnv = document.createElement('canvas');
    cnv.width = Math.round(cw * s);
    cnv.height = Math.round(ch * s);
    const ctx = cnv.getContext('2d');
    ctx.imageSmoothingEnabled = s < 1;
    ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cnv.width, cnv.height);
    return cnv.toDataURL('image/png');
  },
  b64, +x, +y, +w, +h, +scale,
);
writeFileSync(resolve(outPath), Buffer.from(dataUrl.split(',')[1], 'base64'));
await browser.close();
console.log(`cropped ${inPath} -> ${outPath}`);
