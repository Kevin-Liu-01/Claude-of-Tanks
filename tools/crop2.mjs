// Crop a PNG region flattened onto an opaque background (ignores stray alpha):
// node tools/crop2.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]
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
    // flatten: strip alpha by forcing every pixel opaque first
    const flat = document.createElement('canvas');
    flat.width = img.width; flat.height = img.height;
    const fctx = flat.getContext('2d');
    fctx.drawImage(img, 0, 0);
    const id = fctx.getImageData(0, 0, flat.width, flat.height);
    for (let i = 3; i < id.data.length; i += 4) id.data[i] = 255;
    fctx.putImageData(id, 0, 0);
    const cnv = document.createElement('canvas');
    cnv.width = Math.round(cw * s);
    cnv.height = Math.round(ch * s);
    const ctx = cnv.getContext('2d');
    ctx.imageSmoothingEnabled = s < 1;
    ctx.drawImage(flat, cx, cy, cw, ch, 0, 0, cnv.width, cnv.height);
    return cnv.toDataURL('image/png');
  },
  b64, +x, +y, +w, +h, +scale,
);
writeFileSync(resolve(outPath), Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`cropped ${inPath} -> ${outPath}`);
await browser.close();
