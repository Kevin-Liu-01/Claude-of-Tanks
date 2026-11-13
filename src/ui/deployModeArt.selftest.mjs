// Every mode's picture, wherever the modes show one (272: Air Support shipped in 271 with a blank Deploy tile; the owner:
// "air support needs an image"). Copyright © 2026 Kevin B. Liu.
// - Deploy's mode picker (garage.ts deployModeArt): each Deploy mode's tile, its 640 card picture for the core modes
//   (DEPLOY_CARD_ART) else its 480 tile, in public/media/deploy-r1;
// - Deploy's plate (deployScreen.ts): each Deploy mode's 1600x900 plate background, <id>-1600.webp;
// - both listed in public/media/deploy-r1/manifest.json with their mode and size;
// - the landing's mode rail and the Field Manual's mode cards (home-premiere.mjs, docs/chapters/modes.ts): each battle
//   mode's still and its 640 rung in public/media/site50-r14/home/modes.
// A new mode cannot ship without them: this receipt fails until its pictures are made (the media lane's HUD-free battle
// frame of the mode, tools/marketing-shots/mode-battle-shots.mjs with a deploy/<id> recipe) and listed.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATTLE_MODE_IDS, DEPLOY_MODE_ORDER } from '../sim/gameModeCatalog.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const DEPLOY = 'public/media/deploy-r1';
const manifest = JSON.parse(read(`${DEPLOY}/manifest.json`));
const rowByFile = new Map(manifest.items.map((item) => [item.file, item]));

/** A WebP's pixel size from its header (VP8, VP8L or VP8X). */
function webpSize(file) {
  const b = readFileSync(join(ROOT, file));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', `${file} is a RIFF file`);
  assert.equal(b.toString('ascii', 8, 12), 'WEBP', `${file} is a WebP`);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  assert.equal(chunk, 'VP8 ', `${file}: a known WebP chunk`);
  return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
}

/** A picture on disk at its size, with real content (a flat or empty frame encodes to a few hundred bytes). */
function picture(file, width, height, why) {
  assert.ok(existsSync(join(ROOT, file)), `${why}: ${file} exists`);
  assert.deepEqual(webpSize(file), { width, height }, `${why}: ${file} is ${width}x${height}`);
  assert.ok(statSync(join(ROOT, file)).size > 3000, `${why}: ${file} is a picture, not a blank frame`);
}

// the picker's rule, read from garage.ts: the core modes' 640 card picture, the rest their 480 tile
const garage = read('src/ui/garage.ts');
const cardSet = garage.match(/const DEPLOY_CARD_ART: ReadonlySet<string> = new Set\(\[([^\]]*)\]\)/);
assert.ok(cardSet, 'garage.ts names the modes with a 640 card picture (DEPLOY_CARD_ART)');
const CARD_ART = new Set([...cardSet[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
assert.match(garage, /const deployModeArt = \(id: string\): string => `\/media\/deploy-r1\/\$\{id\}-\$\{DEPLOY_CARD_ART\.has\(id\) \? 640 : 480\}\.webp`;/,
  'the picker reads public/media/deploy-r1/<id>-640|480.webp');
// the plate: every mode's 1600 (its tile under reduced data), no list of modes that have one
const deployScreen = read('src/ui/deployScreen.ts');
assert.match(deployScreen, /const url = saveData\(\) \? host\.modeArt\(mode\) : `\/media\/deploy-r1\/\$\{mode\}-1600\.webp`;/,
  'the plate shows every mode\'s 1600 picture');

for (const id of DEPLOY_MODE_ORDER) {
  const tile = CARD_ART.has(id) ? { file: `${id}-640.webp`, w: 640, h: 360 } : { file: `${id}-480.webp`, w: 480, h: 270 };
  picture(`${DEPLOY}/${tile.file}`, tile.w, tile.h, `${id}'s Deploy tile`);
  picture(`${DEPLOY}/${id}-1600.webp`, 1600, 900, `${id}'s Deploy plate`);
  for (const file of [tile.file, `${id}-1600.webp`]) {
    const row = rowByFile.get(file);
    assert.ok(row, `${file} has a row in ${DEPLOY}/manifest.json`);
    assert.equal(row.mode, id, `${file}'s row names its mode`);
    assert.ok(row.source, `${file}'s row names its source`);
  }
}
assert.equal(manifest.count, manifest.items.length, 'the manifest\'s count is its rows');

for (const id of BATTLE_MODE_IDS) {
  picture(`public/media/site50-r14/home/modes/${id}.webp`, 1280, 720, `${id}'s landing and Field Manual still`);
  picture(`public/media/site50-r14/home/modes/${id}-640.webp`, 640, 360, `${id}'s still's 640 rung`);
}

console.log(`deployModeArt.selftest: ${DEPLOY_MODE_ORDER.length} Deploy modes with tile and plate, ${BATTLE_MODE_IDS.length} battle modes with their still`);
