import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATTLE_REELS } from './battleReels.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const docs = readFileSync(join(ROOT, 'site/docs.html'), 'utf8');
const home = readFileSync(join(ROOT, 'site/home.html'), 'utf8');
// Since round 14 (2026-10-12) the manual's battle takes are twenty of the site fifty's takes (owner: "replace the old
// media with all my new ones"), each the delivery's own 720p cut with its sound; tools/media-r5/site-media/picks.json
// picks them and public/media/site50-r14/manifest.json is their receipt.
const picks = JSON.parse(readFileSync(join(ROOT, 'tools/media-r5/site-media/picks.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ROOT, `public/media/${picks.collection}/manifest.json`), 'utf8'));
const files = new Map(manifest.files.map((file) => [`/${file.path}`, file]));

assert.equal(BATTLE_REELS.length, 20, 'the manual plays twenty of the site fifty\'s takes');
assert.equal(new Set(BATTLE_REELS.map(({ id }) => id)).size, 20, 'take identifiers must be unique');
assert.deepEqual(BATTLE_REELS.map(({ id }) => id), picks.docs.reels, 'the takes are the picks, in their order');

for (const reel of BATTLE_REELS) {
  assert.ok(reel.title && !reel.title.startsWith('media.'), `${reel.id} title resolves from the catalog`);
  assert.ok(reel.map && !reel.map.startsWith('map.'), `${reel.id} battlefield resolves from the catalog`);
  const video = files.get(reel.video);
  assert.ok(video, `${reel.id} video is in the collection's receipt`);
  assert.equal(`${video.width}x${video.height}`, '1280x720', `${reel.id} plays at 720p`);
  assert.equal(video.fps, 30, `${reel.id} frame rate`);
  assert.equal(video.audio, 'aac', `${reel.id} plays with its sound`);
  for (const [kind, url, minimumBytes] of [
    ['video', reel.video, 500_000],
    ['poster', reel.poster, 10_000],
  ]) {
    const file = join(ROOT, 'public', url.replace(/^\//, ''));
    assert.ok(existsSync(file), `missing ${kind} for ${reel.id}`);
    assert.ok(statSync(file).size > minimumBytes, `${kind} for ${reel.id} is unexpectedly small`);
  }
}

const library = /<div class="battle-reels"[\s\S]*?<\/div>\s*<h3[^>]*data-i18n="docs\.studio\.contactTitle"[^>]*>Contact-sheet review<\/h3>/.exec(docs)?.[0];
assert.ok(library, 'Docs Studio chapter must contain the take library before the review process');
assert.equal((library.match(/<video\b/g) || []).length, 1, 'Docs must load takes through one shared player');
assert.ok(library.includes(`src="${BATTLE_REELS[0].video}"`), 'the player opens on the first take');
assert.match(home, /href="\/docs#battle-reels"[^>]*>[\s\S]*?Watch 20 battle takes/);

console.log('battle reels selftest passed');
