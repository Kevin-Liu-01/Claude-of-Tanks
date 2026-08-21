import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATTLE_REELS } from './battleReels.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const docs = readFileSync(join(ROOT, 'docs.html'), 'utf8');
const home = readFileSync(join(ROOT, 'home.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/media/battle-reels-v3/manifest.json'), 'utf8'));

assert.equal(BATTLE_REELS.length, 20, 'the Docs reel library must contain all 20 approved scenes');
assert.equal(new Set(BATTLE_REELS.map(({ id }) => id)).size, 20, 'reel identifiers must be unique');
assert.equal(manifest.count, 20);
assert.equal(manifest.delivery.width, 1280);
assert.equal(manifest.delivery.height, 720);
assert.equal(manifest.delivery.frameRate, 30);

for (const reel of BATTLE_REELS) {
  for (const [kind, url, minimumBytes] of [
    ['video', reel.video, 500_000],
    ['poster', reel.poster, 10_000],
  ]) {
    const file = join(ROOT, 'public', url.replace(/^\//, ''));
    assert.ok(existsSync(file), `missing ${kind} for ${reel.id}`);
    assert.ok(statSync(file).size > minimumBytes, `${kind} for ${reel.id} is unexpectedly small`);
  }
}

const library = /<div class="battle-reels"[\s\S]*?<\/div>\s*<h3>Contact-sheet review<\/h3>/.exec(docs)?.[0];
assert.ok(library, 'Docs Studio chapter must contain the reel library before the review process');
assert.equal((library.match(/<video\b/g) || []).length, 1, 'Docs must load reels through one shared player');
assert.match(home, /href="\/docs#battle-reels"[^>]*>[\s\S]*?Watch 20 modern tank duels/);

console.log('battle reels selftest passed');
