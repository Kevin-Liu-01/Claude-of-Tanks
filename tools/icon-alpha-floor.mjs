// Kevin B. Liu — re-encode already-published tank icons with the alpha floor tools/icons-page.html now encodes with
// (2026-10-22, lane 240: "grey squares at antenna tips in 3/4 icons").
//
// Chrome's lossy WebP encoder fills the colour of every fully transparent pixel in an 8 x 8 block that also holds a
// visible pixel with that block's average, so round a thin antenna tip the transparent background took the antenna's
// grey: invisible wherever alpha is honoured, grey squares in any viewer or tool that drops alpha. icons-page.html now
// leaves every background pixel at alpha 1/255 in black before it encodes (encodeWebp), which the encoder keeps as
// black. This tool gives the icons rendered before that change the same background without a fleet re-render: it
// decodes each published WebP (the angle portrait and its Garage thumbnail, the side and top views), floors its
// transparent pixels, re-encodes it at the generator's quality and rewrites that asset's bytes and sha256 in
// public/icons/tank-assets.json. A file with no fully transparent pixel left is already floored and is not touched.
//
//   node tools/icon-alpha-floor.mjs --ids=<id,...>   the named tanks' icons
//   node tools/icon-alpha-floor.mjs --all            every tank in the manifest (one commit, in a quiet window: the
//                                                    manifest rows of every tank move)
//   --check                                          report the files still carrying transparent pixels; write nothing
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { uniqueIds } from './id-list.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback = '') => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name) => args.includes(`--${name}`);
const outDir = resolve(opt('out', 'public/icons'));
const manifestPath = resolve(outDir, 'tank-assets.json');
const WEBP_QUALITY = 90;

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const ids = flag('all') ? Object.keys(manifest.tanks) : uniqueIds(opt('ids').split(',').filter(Boolean), 'icon-alpha-floor --ids');
if (!ids.length) { console.error('icon-alpha-floor: name --ids=<id,...> or --all'); process.exit(2); }

/** The WebP records of one tank's assets (each view's file, and the angle portrait's thumbnail). */
function webpRecords(tank) {
  const records = [];
  for (const asset of Object.values(tank.assets ?? {})) {
    if (asset?.mime === 'image/webp') records.push(asset);
    if (asset?.thumbnail?.mime === 'image/webp') records.push(asset.thumbnail);
  }
  return records;
}

let rewritten = 0, floored = 0, pending = 0;
for (const id of ids) {
  const tank = manifest.tanks[id];
  if (!tank) { console.error(`icon-alpha-floor: ${id} is not in ${manifestPath}`); process.exitCode = 1; continue; }
  for (const record of webpRecords(tank)) {
    const file = resolve(outDir, record.file);
    const image = await loadImage(readFileSync(file));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = 0;
    for (let i = 3; i < pixels.data.length; i += 4) {
      if (pixels.data[i] !== 0) continue;
      pixels.data[i - 3] = pixels.data[i - 2] = pixels.data[i - 1] = 0;
      pixels.data[i] = 1;
      transparent++;
    }
    if (!transparent) { floored++; continue; }
    if (flag('check')) { pending++; console.log(`${record.file}: ${transparent} transparent px`); continue; }
    context.putImageData(pixels, 0, 0);
    const bytes = canvas.toBuffer('image/webp', WEBP_QUALITY);
    writeFileSync(file, bytes);
    record.bytes = bytes.length;
    record.sha256 = createHash('sha256').update(bytes).digest('hex');
    rewritten++;
  }
}
if (!flag('check') && rewritten) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`icon-alpha-floor: ${ids.length} tanks; ${rewritten} files re-encoded, ${floored} already floored${flag('check') ? `, ${pending} pending` : ''}`);
if (flag('check') && pending) process.exitCode = 1;
