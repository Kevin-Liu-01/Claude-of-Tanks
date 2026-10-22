import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.');
const picks = JSON.parse(await readFile(resolve(root, 'tools/media-r5/site-media/picks.json'), 'utf8'));
const site50 = `/media/${picks.collection}`;
const manifest = JSON.parse(await readFile(resolve(root, 'public/media/landing-r1/manifest.json'), 'utf8'));
const mobileVideoManifest = JSON.parse(await readFile(resolve(root, 'public/media/web-video-r1/manifest.json'), 'utf8'));
const home = await readFile(resolve(root, 'site/home.html'), 'utf8');
const presentation = await readFile(resolve(root, 'src/presentation/home.css'), 'utf8');
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
// (2026-10-19, the owner: "all our new frames need to go up with no removals of old ones"): the hero opens on six versus
// stills (public/media/versus-r1) and keeps the six site fifty stills it showed before them; the screenshot rail adds the
// combat round's duels and the 226/227 fleet takes before the eleven it had
const versusManifest = JSON.parse(await readFile(resolve(root, 'public/media/versus-r1/manifest.json'), 'utf8'));
const versusById = new Map(versusManifest.items.map((item) => [item.id, item]));
const KEPT_HERO = ['s21-fields-assault', 's39-lakeside-village', 's26-minaret-fire', 's38-church-knockout', 's18-street-knockout',
  's07-lake-shellfire'];
const KEPT_RAIL = ['s05-barn-advance', 's26-minaret-fire', 's20-road-return-fire', 's21-fields-assault', 's24-ice-duel',
  's23-village-crossroads', 's19-roof-tiles', 's06-farm-charge', 's08-market-push', 's27-caravanserai-kill', 's34-furnace-salvo'];
assert.equal(manifest.hero.length, 12, 'the hero has twelve reviewed in-engine stills');
assert.deepEqual(manifest.hero.map((slide) => slide.versus ?? slide.id), picks.home.hero.map((slide) => slide.versus ?? slide.id),
  'the hero shows the picks in their order');
assert.equal(manifest.hero.filter((slide) => slide.versus).length, 6, 'six versus stills');
// (the owner, 2026-10-19: "the heroes should use the recommended i liked like the abrams", and of six duels in a row
// "gets reptitive"): the SEPv3 opens, then a versus still and a site fifty slide in turn
assert.equal(manifest.hero[0].versus, 'vs01-desert-abrams-t90m-r6', 'the hero opens on the SEPv3');
manifest.hero.forEach((slide, i) => assert.equal(Boolean(slide.versus), i % 2 === 0,
  `hero slide ${i + 1}: the versus stills and the site fifty slides take turns`));
for (const slide of manifest.hero) {
  if (slide.versus) assert.equal(slide.src, versusById.get(slide.versus)?.path, `${slide.versus} is a published versus still`);
  else assert.ok(slide.src.startsWith(`${site50}/stills/`), `${slide.id} is a site fifty still`);
}
for (const id of KEPT_HERO) assert.ok(manifest.hero.some((slide) => slide.id === id), `${id} stays in the hero (no removals)`);
const heroMap = (slide) => (slide.versus ? versusById.get(slide.versus).map : picks.takes[slide.id].map);
assert.equal(new Set(manifest.hero.filter((slide) => slide.versus).map(heroMap)).size, 6, 'the versus slides open on six battlefields');
assert.equal(new Set(manifest.hero.filter((slide) => !slide.versus).map(heroMap)).size, 6, 'the site fifty slides open on six battlefields');
manifest.hero.forEach((slide, i) => {
  const next = manifest.hero[(i + 1) % manifest.hero.length];
  assert.notEqual(heroMap(slide), heroMap(next), `hero slides ${i + 1} and ${(i + 1) % manifest.hero.length + 1} show different battlefields`);
});

const heroMarkup = home.match(/<div class="v5-hero-rail"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
assert.equal(heroMarkup.includes('<video'), false, 'hero uses stills, not video');
assert.equal((heroMarkup.match(/data-hero-slide/g) || []).length, manifest.hero.length);
assert.equal((heroMarkup.match(/data-hero-slide src=/g) || []).length, 1,
  'only the LCP hero is discoverable during initial navigation');
assert.equal((heroMarkup.match(/data-hero-slide data-src=/g) || []).length, manifest.hero.length - 1,
  'rotating hero frames are hydrated only when their turn approaches');
for (const slide of manifest.hero) {
  const name = slide.versus ?? slide.id;
  assert.equal(heroMarkup.includes(`src="${slide.src}"`), true, `${name} is mounted in the hero`);
  const file = resolve(root, 'public', slide.src.replace(/^\//, ''));
  assert.ok((await stat(file)).size > 50_000, `${name} is a substantial image`);
}
assert.equal(home.includes(`<link rel="preload" href="${manifest.hero[0].src}" as="image" type="image/webp" fetchpriority="high">`), true,
  'the first hero slide is the preloaded LCP image');

// the screenshot rail: the picks in their order, the eleven of 2026-10-19 kept after the new ones
const railMarkup = home.match(/<div class="v5-shot-rail"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
assert.deepEqual(manifest.rail.map((shot) => shot.id), picks.home.rail, 'the rail shows the picks in their order');
assert.equal((railMarkup.match(/<figure>/g) || []).length, picks.home.rail.length);
for (const id of KEPT_RAIL) assert.ok(picks.home.rail.includes(id), `${id} stays in the rail (no removals)`);
assert.ok(picks.home.rail.length > KEPT_RAIL.length, 'the rail adds the new renders');
assert.match(home, new RegExp(`<span data-shot-position aria-live="polite">1 / ${picks.home.rail.length}</span>`));
for (const shot of manifest.rail) {
  assert.equal(railMarkup.includes(`data-deferred-src="${shot.src}"`), true, `${shot.id} is mounted in the rail`);
  assert.ok((await stat(resolve(root, 'public', shot.src.slice(1)))).size > 50_000, `${shot.id} is a substantial image`);
}

// the versus wall: every versus still, lazily loaded, with its matchup and its place
const versusMarkup = home.match(/<div class="v5-versus-wall">([\s\S]*?)\n[ \t]*<\/div>/)?.[1] || '';
assert.deepEqual(manifest.versus.map((v) => v.id), picks.home.versus, 'the versus wall shows the picks in their order');
assert.deepEqual([...picks.home.versus].sort(), versusManifest.items.map((item) => item.id).sort(), 'every versus still is on the wall');
assert.equal((versusMarkup.match(/<figure>/g) || []).length, picks.home.versus.length);
for (const v of manifest.versus) {
  assert.equal(v.src, versusById.get(v.id).path);
  assert.match(versusMarkup, new RegExp(`<img src="${v.src}" alt="[^"]+" data-i18n-alt="media\\.versus\\.title\\.[A-Za-z0-9]+" width="\\d+" height="\\d+" loading="lazy" decoding="async"><figcaption><b data-i18n="media\\.versus\\.match\\.[A-Za-z0-9]+">[^<]+</b><span data-i18n="media\\.versus\\.place\\.[A-Za-z0-9]+">[^<]+</span></figcaption>`),
    `${v.id} is on the wall with its caption`);
}

// the trailers row: each trailer plays on a click and loads nothing before the row nears the viewport (no poster
// attribute in the markup, preload none; publicPages.ts sets the poster)
const trailerMarkup = home.match(/<div class="v5-trailer-grid" data-trailer-row>([\s\S]*?)\n[ \t]*<\/div>/)?.[1] || '';
assert.deepEqual(manifest.trailers.map((f) => f.film), picks.home.trailers);
assert.ok(picks.home.trailers.every((film) => picks.films.includes(film)), 'the row plays the films the site ships');
assert.equal((trailerMarkup.match(/<video /g) || []).length, picks.home.trailers.length);
for (const film of manifest.trailers) {
  const tag = trailerMarkup.match(new RegExp(`<video [^>]*data-poster="${film.poster}"[^>]*>`))?.[0] || '';
  assert.ok(tag.includes('controls') && tag.includes('preload="none"') && tag.includes('data-trailer'), `${film.film} plays on a click`);
  assert.equal(/\sposter=/.test(tag), false, `${film.film} loads its poster only near the viewport`);
  assert.equal(trailerMarkup.includes(`<source src="${film.webm}" type="video/webm"><source src="${film.mp4}" type="video/mp4">`), true,
    `${film.film}: its webm, then its mp4`);
  for (const path of [film.webm, film.mp4, film.poster]) assert.ok((await stat(resolve(root, 'public', path.slice(1)))).size > 100_000, `${path} ships`);
}
assert.match(publicPages, /function mountTrailerRow\(row(?:: HTMLElement)?\)/, 'the trailers row loads its posters and plays one at a time');
// every other landing video is an autoplay loop gated on the viewport
assert.equal([...home.matchAll(/<video (?![^>]*data-trailer)[^>]*>/g)].every((m) => m[0].includes('data-autoplay-video')), true,
  'every video outside the trailers row is a viewport-gated loop');

assert.equal(manifest.featureReel.video, `${site50}/films/reel.mp4`);
// the reel's light web encode (2026-10-14): 1600x900 under its 4.3 Mbit/s cap; site-media-wire.mjs records the file's size
assert.equal(manifest.featureReel.width, 1600);
assert.equal(manifest.featureReel.height, 900);
assert.equal(home.split(manifest.featureReel.video).length - 1, 1,
  'the former video hero appears once as a dedicated feature reel');
assert.equal(home.includes(`poster="${manifest.featureReel.poster}"`), true,
  'feature reel retains its approved poster');
for (const path of [manifest.featureReel.video, manifest.featureReel.poster]) {
  const file = resolve(root, 'public', path.replace(/^\//, ''));
  assert.ok((await stat(file)).size > 100_000, `feature reel ${path} exists`);
}

assert.equal('gameplay' in manifest, false, 'the retired duplicate gameplay block is absent from the landing contract');
assert.equal(home.split('Watch tank combat in the game engine').length - 1, 1,
  'the combat heading appears once on the reel');
assert.equal(home.split("Every vehicle, shot, impact, fire and wreck in this reel is the game's own, rendered by its engine at 4K.").length - 1, 1,
  'the combat description appears once on the reel');
assert.equal(home.includes('Watch live tank combat'), false,
  'the reel no longer calls its offline 4K renders live combat');
assert.equal(home.includes('See the complete game in one video'), false,
  'the previous feature-reel heading is retired');
assert.equal(home.includes('gameplay-urban-overhead-1080.mp4'), false,
  'the duplicate gameplay proxy is not mounted on the landing page');

assert.equal(manifest.rails.length, 4, 'four site fifty loops fill the camera-path grid');
assert.deepEqual(manifest.rails.map((rail) => rail.id), picks.home.paths);
for (const rail of manifest.rails) {
  assert.equal(home.split(rail.video).length - 1, 1, `${rail.id} is used once outside the hero`);
  for (const path of [rail.video, rail.poster]) {
    const file = resolve(root, 'public', path.replace(/^\//, ''));
    assert.ok((await stat(file)).size > 100_000, `${rail.id} ${path} exists`);
  }
}
assert.equal(manifest.destructionRail, `${site50}/loops/${picks.home.destruction}.webm`);
assert.equal(home.split(manifest.destructionRail).length - 1, 1,
  'the destruction loop appears once in the destruction section');

const videos = [...home.matchAll(/<source data-src="([^"]+\.(?:webm|mp4))"/g)].map((match) => match[1]);
assert.equal(new Set(videos).size, videos.length, 'landing videos do not repeat');
// the site's seven loops and films, then (2026-10-22) the versus films, each with its own 540p phone file
const versusFilms = picks.home.versusFilms ?? [];
const siteVideos = videos.filter((path) => !path.startsWith('/media/versus-films-r1/'));
assert.equal(videos.length, 7 + versusFilms.length, 'all landing videos remain source-gated until viewport activation');
assert.equal(siteVideos.length, 7, 'the seven site videos');
assert.equal((home.match(/data-mobile-src="\/media\/web-video-r1\//g) || []).length, siteVideos.length,
  'every landing video supplies a lightweight mobile proxy');
assert.equal((home.match(/data-mobile-src="\/media\/versus-films-r1\/[a-z0-9-]+-mobile\.mp4"/g) || []).length, versusFilms.length,
  'every versus film supplies its phone file');
assert.equal(mobileVideoManifest.files.length, siteVideos.length, 'mobile proxy manifest covers every landing video');
assert.ok(mobileVideoManifest.files.reduce((total, file) => total + file.bytes, 0) < 9_000_000,
  'the complete mobile proxy library stays below the nine-megabyte transfer budget');
for (const proxy of mobileVideoManifest.files) {
  const publicPath = `/media/web-video-r1/${proxy.path}`;
  assert.equal(home.includes(`data-mobile-src="${publicPath}"`), true, `${proxy.path} is wired into the landing page`);
  assert.equal((await stat(resolve(root, 'public', publicPath.slice(1)))).size, proxy.bytes,
    `${proxy.path} matches its byte receipt`);
}

assert.equal(manifest.mosaic.length, 24);
assert.equal(manifest.mosaic.filter((shot) => shot.still === 'moment').length, 12, 'twelve key moments');
assert.equal(manifest.mosaic.filter((shot) => shot.still === 'close').length, 12, 'twelve close portraits');
assert.ok(manifest.mosaic.every((shot) => shot.src.startsWith(`${site50}/stills/`)));
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
// home r2 (2026-10-12): the Studio card's loop is re-recorded on the current interface (shots/media-r5/home-r2/shot-list.json,
// features/studio), so its cast may change; a victim and a shooter's kill stay the contract
assert.ok(manifest.studio.actors.some((actor) => actor.name === 'victim'), 'the Studio loop stages a victim');
assert.ok(manifest.studio.effects.some((effect) => effect.type === 'fire' && effect.actor === 'shooter'));
assert.ok(manifest.studio.effects.some((effect) => effect.type === 'tank_kill' && effect.actor === 'victim'));
assert.equal(home.includes(`src="${manifest.studio.video}"`), true, 'Studio loop is mounted on the landing page');
assert.equal(home.includes(`poster="${manifest.studio.poster}"`), true, 'Studio poster is mounted on the landing page');
assert.equal(home.includes('Create scenes in Scene Studio'), true, 'Studio evidence uses direct interface-focused copy');
for (const [path, bytes] of [[manifest.studio.video, manifest.studio.videoBytes], [manifest.studio.poster, manifest.studio.posterBytes]]) {
  const file = resolve(root, 'public', path.replace(/^\//, ''));
  assert.equal((await stat(file)).size, bytes, `${path} byte receipt`);
}

console.log('landing-media.selftest: the site fifty hero, reel, loops, mosaic and the Studio knockout pass');

const published = JSON.parse(await readFile(resolve(root, 'public/media/production-r1/manifest.json'), 'utf8'));
assert.ok(published.shots.length > 0);
assert.ok(published.shots.every(shot => shot.kind === 'battlefield' && shot.src.startsWith('/maps/')), 'only refreshed map photographs remain in the recent publication');
assert.deepEqual(published.films, [], 'recent promotional films are withdrawn');
assert.doesNotMatch(home, /director-r4/);
