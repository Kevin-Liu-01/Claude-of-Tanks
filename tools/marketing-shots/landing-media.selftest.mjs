import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.');
const manifest = JSON.parse(await readFile(resolve(root, 'public/media/landing-r1/manifest.json'), 'utf8'));
const mobileVideoManifest = JSON.parse(await readFile(resolve(root, 'public/media/web-video-r1/manifest.json'), 'utf8'));
const home = await readFile(resolve(root, 'home.html'), 'utf8');
const presentation = await readFile(resolve(root, 'public/home.css'), 'utf8');
const threeMark = await readFile(resolve(root, 'public/brand/threejs-mark.svg'), 'utf8');
const publicPages = await readFile(resolve(root, 'src/presentation/publicPages.js'), 'utf8');
const main = home.match(/<main>([\s\S]*?)<\/main>/)?.[1] || '';

assert.equal(main.includes('<p class="micro">'), false, 'landing sections do not use eyebrow copy');
for (const retiredTitle of ['Ground rush', 'Charge thread', 'Overhead dive', 'Shell skim',
  'Terrain changes the fight', 'From resolved impact to directed scene']) {
  assert.equal(main.includes(retiredTitle), false, `landing copy does not use the retired title: ${retiredTitle}`);
}
assert.equal(home.match(/<div class="v5-shot-rail"[\s\S]*?<\/section>/)?.[0].includes('<figcaption>'), false,
  'the screenshot rail does not overlay promotional shot names');
assert.equal(home.match(/<section class="v5-mosaic"[\s\S]*?<\/section>/)?.[0].includes('<figcaption>'), false,
  'the screenshot mosaic does not overlay promotional shot names');
assert.match(home, /data-shot-previous[\s\S]*data-shot-position[\s\S]*data-shot-next/,
  'the screenshot gallery provides previous, position, and next controls');
assert.match(home, /data-shot-rail/);
assert.match(home, /data-shot-progress/);
assert.match(presentation, /\.v5-shot-rail\{[^}]*scrollbar-width:none/,
  'the screenshot gallery hides the large native scrollbar');
assert.match(presentation, /\.v5-shot-rail::\-webkit-scrollbar\{display:none\}/,
  'the screenshot gallery hides the WebKit scrollbar');
assert.match(publicPages, /function mountShotRail\(rail\)/,
  'the screenshot gallery mounts accessible controls and progress');
assert.match(home, /class="v5-maker-mark"[^>]*aria-hidden="true"/,
  'the landing credit displays the official Three.js mark');
assert.match(home, /class="v5-maker-engine" href="https:\/\/threejs\.org\/"/,
  'the Three.js credit links to the official project site');
assert.match(presentation, /\.v5-maker-mark\{[^}]*width:29px;[^}]*height:29px;/,
  'the engine mark has a legible display size');
assert.match(threeMark, /viewBox="0 0 226\.77 226\.77"/,
  'the local Three.js asset retains the official icon geometry');

assert.equal(manifest.libraryId, 'claude-of-tanks-landing-r1');
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.hero.length, 6, 'hero has six reviewed in-engine stills');
assert.deepEqual(manifest.hero.slice(0, 4).map((slide) => slide.src), [
  '/media/featured/f10_studio_urban_crossfire.webp',
  '/media/featured/f9_studio_fjord_firefight.webp',
  '/media/featured/f8_studio_m1_firefight.webp',
  '/media/featured/f6_studio_strv_steinburg_duel.webp',
], 'the four owner-selected battle captures lead the hero in priority order');
assert.equal(manifest.hero.some((slide) => slide.src.includes('urban_hero_leo2a6')), false,
  'the washed-out Leopard frame is retired from the hero');
assert.ok(manifest.hero.some((slide) => slide.collection === 'action'));
assert.ok(manifest.hero.some((slide) => slide.collection === 'foreground'));

const heroMarkup = home.match(/<div class="v5-hero-rail"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
assert.equal(heroMarkup.includes('<video'), false, 'hero uses stills, not video');
assert.equal((heroMarkup.match(/data-hero-slide/g) || []).length, manifest.hero.length);
assert.equal((heroMarkup.match(/data-hero-slide src=/g) || []).length, 1,
  'only the LCP hero is discoverable during initial navigation');
assert.equal((heroMarkup.match(/data-hero-slide data-src=/g) || []).length, manifest.hero.length - 1,
  'rotating hero frames are hydrated only when their turn approaches');
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

assert.equal('gameplay' in manifest, false, 'the retired duplicate gameplay block is absent from the landing contract');
assert.equal(home.split('Watch live tank combat').length - 1, 1,
  'the live-combat heading appears once on the complete-game reel');
assert.equal(home.split('The game renders vehicle movement, recoil, tracks, muzzle flashes, impacts, smoke, sparks, and destruction in real time.').length - 1, 1,
  'the live-combat description appears once on the complete-game reel');
assert.equal(home.includes('See the complete game in one video'), false,
  'the previous feature-reel heading is retired');
assert.equal(home.includes('gameplay-urban-overhead-1080.mp4'), false,
  'the duplicate gameplay proxy is not mounted on the landing page');

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

const videos = [...home.matchAll(/<source data-src="([^"]+\.(?:webm|mp4))"/g)].map((match) => match[1]);
assert.equal(new Set(videos).size, videos.length, 'landing videos do not repeat');
assert.equal(videos.length, 7, 'all landing videos remain source-gated until viewport activation');
assert.equal((home.match(/data-mobile-src="\/media\/web-video-r1\//g) || []).length, videos.length,
  'every landing video supplies a lightweight mobile proxy');
assert.equal(mobileVideoManifest.files.length, videos.length, 'mobile proxy manifest covers every landing video');
assert.ok(mobileVideoManifest.files.reduce((total, file) => total + file.bytes, 0) < 9_000_000,
  'the complete mobile proxy library stays below the nine-megabyte transfer budget');
for (const proxy of mobileVideoManifest.files) {
  const publicPath = `/media/web-video-r1/${proxy.path}`;
  assert.equal(home.includes(`data-mobile-src="${publicPath}"`), true, `${proxy.path} is wired into the landing page`);
  assert.equal((await stat(resolve(root, 'public', publicPath.slice(1)))).size, proxy.bytes,
    `${proxy.path} matches its byte receipt`);
}

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
assert.ok(manifest.studio.durationMs >= 6500 && manifest.studio.durationMs <= 7000,
  'Studio loop includes the complete 6.5-second storyboard and UI settle frame');
assert.equal(manifest.studio.captureMode, 'studio-ui', 'Studio loop records the live production interface');
assert.ok(manifest.studio.actors.some((actor) => actor.id === 'leclerc' && actor.name === 'victim'));
assert.ok(manifest.studio.effects.some((effect) => effect.type === 'fire' && effect.actor === 'shooter'));
assert.ok(manifest.studio.effects.some((effect) => effect.type === 'tank_kill' && effect.actor === 'victim'));
assert.equal(home.includes(`src="${manifest.studio.video}"`), true, 'Studio loop is mounted on the landing page');
assert.equal(home.includes(`poster="${manifest.studio.poster}"`), true, 'Studio poster is mounted on the landing page');
assert.equal(home.includes('Create scenes in Scene Studio'), true, 'Studio evidence uses direct interface-focused copy');
for (const [path, bytes] of [[manifest.studio.video, manifest.studio.videoBytes], [manifest.studio.poster, manifest.studio.posterBytes]]) {
  const file = resolve(root, 'public', path.replace(/^\//, ''));
  assert.equal((await stat(file)).size, bytes, `${path} byte receipt`);
}

console.log('landing-media.selftest: single combat reel, owner-directed hero, relocated rails, Studio knockout, and 24-frame mosaic pass');
