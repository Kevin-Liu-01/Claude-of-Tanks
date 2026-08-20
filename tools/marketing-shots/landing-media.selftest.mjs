import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.');
const manifest = JSON.parse(await readFile(resolve(root, 'public/media/landing-r1/manifest.json'), 'utf8'));
const home = await readFile(resolve(root, 'home.html'), 'utf8');

assert.equal(manifest.libraryId, 'claude-of-tanks-landing-r1');
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.hero.length, 6, 'hero has six reviewed handmade stills');
assert.ok(manifest.hero.some((slide) => slide.src === '/media/featured/f7_studio_t90_column_fire.webp'),
  'hero includes the clean image behind the OG composite');
assert.ok(manifest.hero.some((slide) => slide.src.includes('urban_hero_leo2a6')),
  'hero includes the handmade Leopard frame');
assert.ok(manifest.hero.some((slide) => slide.collection === 'action'));
assert.ok(manifest.hero.some((slide) => slide.collection === 'foreground'));

const heroMarkup = home.match(/<div class="v5-hero-rail"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
assert.equal(heroMarkup.includes('<video'), false, 'hero uses stills, not video');
assert.equal((heroMarkup.match(/data-hero-slide/g) || []).length, manifest.hero.length);
for (const slide of manifest.hero) {
  assert.equal(heroMarkup.includes(`src="${slide.src}"`), true, `${slide.id} is mounted in the hero`);
  const file = resolve(root, 'public', slide.src.replace(/^\//, ''));
  assert.ok((await stat(file)).size > 50_000, `${slide.id} is a substantial image`);
}

assert.equal(manifest.featureReel.video, '/media/promo-v13/claude-of-tanks-promo-clean.mp4');
assert.equal(manifest.featureReel.width, 1920);
assert.equal(manifest.featureReel.height, 1080);
assert.equal(home.split(manifest.featureReel.video).length - 1, 1,
  'the former video hero appears once as a dedicated feature reel');
assert.equal(home.includes(`poster="${manifest.featureReel.poster}"`), true,
  'feature reel retains its approved poster');
for (const path of [manifest.featureReel.video, manifest.featureReel.poster]) {
  const file = resolve(root, 'public', path.replace(/^\//, ''));
  assert.ok((await stat(file)).size > 100_000, `feature reel ${path} exists`);
}

assert.equal(manifest.relocatedRails.length, 4, 'all non-destruction hero rails move into the film grid');
for (const rail of manifest.relocatedRails) {
  assert.equal(home.split(rail.video).length - 1, 1, `${rail.id} is used once outside the hero`);
  for (const path of [rail.video, rail.poster]) {
    const file = resolve(root, 'public', path.replace(/^\//, ''));
    assert.ok((await stat(file)).size > 100_000, `${rail.id} ${path} exists`);
  }
}
assert.equal(home.split(manifest.winterDestructionRail).length - 1, 1,
  'the remaining rail appears once in the destruction section');

const videos = [...home.matchAll(/<source src="([^"]+\.(?:webm|mp4))"/g)].map((match) => match[1]);
assert.equal(new Set(videos).size, videos.length, 'landing videos do not repeat');

assert.equal(manifest.mosaic.length, 24);
assert.equal(manifest.mosaic.filter((shot) => shot.collection === 'action').length, 12);
assert.equal(manifest.mosaic.filter((shot) => shot.collection === 'foreground').length, 12);
assert.equal(new Set(manifest.mosaic.map((shot) => shot.src)).size, manifest.mosaic.length);
for (const shot of manifest.mosaic) {
  assert.equal(home.split(shot.src).length - 1, 1, `${shot.id} appears once in the bottom mosaic`);
  const file = resolve(root, 'public', shot.src.replace(/^\//, ''));
  assert.ok((await stat(file)).size > 50_000, `${shot.id} is a substantial image`);
}

assert.ok(manifest.studio.width >= 1920 && manifest.studio.height >= 1080, 'Studio loop is full HD');
assert.equal(manifest.studio.durationMs, 6500);
assert.ok(manifest.studio.actors.some((actor) => actor.id === 'leclerc' && actor.name === 'victim'));
assert.ok(manifest.studio.effects.some((effect) => effect.type === 'fire' && effect.actor === 'shooter'));
assert.ok(manifest.studio.effects.some((effect) => effect.type === 'tank_kill' && effect.actor === 'victim'));
assert.equal(home.includes(`src="${manifest.studio.video}"`), true, 'Studio loop is mounted on the landing page');
assert.equal(home.includes(`poster="${manifest.studio.poster}"`), true, 'Studio poster is mounted on the landing page');
for (const [path, bytes] of [[manifest.studio.video, manifest.studio.videoBytes], [manifest.studio.poster, manifest.studio.posterBytes]]) {
  const file = resolve(root, 'public', path.replace(/^\//, ''));
  assert.equal((await stat(file)).size, bytes, `${path} byte receipt`);
}

console.log('landing-media.selftest: handmade hero, relocated rails, Studio knockout, and 24-frame mosaic pass');
