import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('.');
const manifest = JSON.parse(await readFile(resolve(root, 'public/media/landing-r1/manifest.json'), 'utf8'));
const mobileVideoManifest = JSON.parse(await readFile(resolve(root, 'public/media/web-video-r1/manifest.json'), 'utf8'));
const campaign = JSON.parse(await readFile(resolve(root, 'public/media/director-r4/manifest.json'), 'utf8'));
const gameplay = JSON.parse(await readFile(resolve(root, 'public/media/director-r4/gameplay/manifest.json'), 'utf8'));
const publishedAssets = new Map([...campaign.assets, ...gameplay.assets].map(asset => [asset.src, asset]));
async function verifyPublished(url) {
  const asset = publishedAssets.get(url);
  assert.ok(asset, `Published receipt covers ${url}`);
  const bytes = await readFile(resolve(root, 'public', url.slice(1)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `${url} matches its reviewed publication`);
  return bytes.length;
}
const home = await readFile(resolve(root, 'home.html'), 'utf8');
const presentation = await readFile(resolve(root, 'public/home.css'), 'utf8');
const threeMark = await readFile(resolve(root, 'public/brand/threejs-mark.svg'), 'utf8');
const publicPages = await readFile(resolve(root, 'src/presentation/publicPages.ts'), 'utf8');
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
assert.match(publicPages, /function mountShotRail\(rail(?:: HTMLElement)?\)/,
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
const currentHero = ['desert-crossfire', 'coast-recon', 'steel-pursuit'].map(id => ({ id, src: `/media/director-r4/previews/${id}.webp` })).concat(manifest.hero.slice(3));
assert.deepEqual([...heroMarkup.matchAll(/(?:data-)?src="([^"]+)"/g)].map(match => match[1]), currentHero.map(slide => slide.src), 'fresh Director scenes lead the hero and three earlier selections remain');
for (const slide of currentHero) {
  if (slide.src.startsWith('/media/director-r4/')) await verifyPublished(slide.src);
  assert.equal(heroMarkup.includes(`src="${slide.src}"`), true, `${slide.id} is mounted in the hero`);
  const file = resolve(root, 'public', slide.src.replace(/^\//, ''));
  assert.ok((await stat(file)).size > 50_000, `${slide.id} is a substantial image`);
}

// Historical footage remains available; current hero film has its own receipt.
for (const url of [manifest.featureReel.video, manifest.featureReel.poster]) assert.ok((await stat(resolve(root, 'public', url.slice(1)))).size > 100_000);
const heroFilm = campaign.films.find(film => film.src === '/media/director-r4/hero-trailer.mp4');
assert.ok(heroFilm && heroFilm.staged && heroFilm.edited && !heroFilm.silent);
assert.equal(heroFilm.width, 1920); assert.equal(heroFilm.height, 1080);
assert.equal(heroFilm.frames / heroFilm.fps, 26);
assert.equal(home.split(heroFilm.src).length - 1, 1);
assert.ok(home.includes(`poster="${heroFilm.poster}"`));
for (const url of [heroFilm.src, heroFilm.poster]) await verifyPublished(url);
assert.ok(home.includes('Three staged in-engine sequences'));
assert.ok(home.includes('Watch the film with sound'));
assert.equal(home.includes('gameplay-urban-overhead-1080.mp4'), false);
assert.ok(home.includes('Controlled gameplay demonstration'));
assert.ok(home.includes('/media/director-r4/gameplay/battle-live.mp4'));
assert.ok(gameplay.films[0].controlled && gameplay.films[0].silent);
assert.equal(gameplay.films[0].width, 1920);
assert.equal(gameplay.provenance.shellResult.lastShell.terminal, 'tank');
await verifyPublished(gameplay.films[0].src);

assert.equal(manifest.relocatedRails.length, 4, 'all non-destruction hero rails move into the film grid');
for (const rail of manifest.relocatedRails) {
  assert.equal(home.split(rail.video).length - 1, 1, `${rail.id} is used once outside the hero`);
  for (const path of [rail.video, rail.poster]) {
    const file = resolve(root, 'public', path.replace(/^\//, ''));
    assert.ok((await stat(file)).size > 100_000, `${rail.id} ${path} exists`);
  }
}
assert.equal(home.includes(manifest.winterDestructionRail), false, 'new real simulation take replaces the old winter destruction reel');
assert.ok((await stat(resolve(root, 'public', manifest.winterDestructionRail.slice(1)))).size > 100_000, 'old winter source remains archived');
const sources = [...home.matchAll(/<source data-src="([^"]+\.(?:webm|mp4))"[^>]*data-mobile-src="([^"]+)"/g)];
const videos = sources.map(match => match[1]);
assert.equal(new Set(videos).size, videos.length, 'landing videos do not repeat');
assert.equal(videos.length, 7, 'all seven landing videos have desktop and mobile sources gated until viewport activation');
assert.equal((home.match(/<source data-src=/g) || []).length, sources.length, 'no video lacks a mobile proxy');
assert.ok(mobileVideoManifest.files.reduce((total, file) => total + file.bytes, 0) < 9_000_000, 'retained legacy proxy library keeps its original budget');
for (const proxy of mobileVideoManifest.files) assert.equal((await stat(resolve(root, 'public/media/web-video-r1', proxy.path))).size, proxy.bytes, 'old proxy archive remains intact');
for (const source of sources) {
  const proxy = source[2];
  if (proxy.startsWith('/media/director-r4/')) {
    const bytes = await verifyPublished(proxy);
    const row = [...campaign.provenance.webEncodes, ...gameplay.provenance.webEncodes].find(row => row.src === proxy);
    assert.ok(row, `${proxy} has bounded web encoding proof`);
    assert.equal(row.profile.width, 960); assert.equal(row.profile.height, 540);
    assert.equal(row.profile.maxrateKbps, 1800); assert.equal(row.profile.audio, false);
    assert.equal(row.result.bytes, bytes); assert.ok(bytes <= row.result.byteBudget);
    assert.equal(row.result.frames, row.profile.frames, 'encoding retains every captured frame');
  } else {
    const old = mobileVideoManifest.files.find(file => `/media/web-video-r1/${file.path}` === proxy);
    assert.ok(old, `${proxy} is a verified archived proxy`);
  }
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
assert.ok(home.includes('src="/media/director-r4/silent-loop.mp4"'), 'new staged tracking loop is mounted');
assert.ok(home.includes('poster="/media/director-r4/silent-loop.jpg"'));
assert.ok(home.includes('Create scenes in Scene Studio'));
for (const url of ['/media/director-r4/silent-loop.mp4', '/media/director-r4/silent-loop.jpg']) await verifyPublished(url);
const loop = campaign.provenance.webEncodes.find(row => row.src === '/media/director-r4/silent-loop.mp4');
assert.equal(loop.result.width, 1920); assert.equal(loop.result.height, 1080);
assert.equal(loop.result.duration, 6); assert.equal(loop.result.frames, 180);
for (const [path, bytes] of [[manifest.studio.video, manifest.studio.videoBytes], [manifest.studio.poster, manifest.studio.posterBytes]]) {
  const file = resolve(root, 'public', path.replace(/^\//, ''));
  assert.equal((await stat(file)).size, bytes, `${path} byte receipt`);
}

console.log('landing-media.selftest: new reviewed campaign/gameplay delivery, retained archives, native loop, and 24-frame mosaic pass');
