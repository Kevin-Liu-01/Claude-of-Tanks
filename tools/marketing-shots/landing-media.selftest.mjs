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
const main = home.match(/<main id="main">([\s\S]*?)<\/main>/)?.[1] || '';

assert.equal(main.includes('<p class="micro">'), false, 'landing sections do not use eyebrow copy');
for (const retiredTitle of ['Ground rush', 'Charge thread', 'Overhead dive', 'Shell skim',
  'Terrain changes the fight', 'From resolved impact to directed scene']) {
  assert.equal(main.includes(retiredTitle), false, `landing copy does not use the retired title: ${retiredTitle}`);
}
assert.match(threeMark, /viewBox="0 0 226\.77 226\.77"/,
  'the local Three.js asset retains the official icon geometry');

assert.equal(manifest.libraryId, 'claude-of-tanks-landing-r1');
assert.equal(manifest.schemaVersion, 1);
// The landing-r1 contract (tools/media-r5/site-media-wire.mjs keeps it with the picks) stays consistent with its picks;
// the landing itself builds from public/media/home-r2 since 2026-10-25 (below).
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

// (2026-10-25, the owner: "have big hero pics always animate and show multiple (like showing videos), tell our media
// manager to look in and only use the good ones") the landing builds from the media lane's curated set:
// public/media/home-r2/manifest.json names the hero reel's clips and the eight features (tools/home-premiere.mjs).
const reel = JSON.parse(await readFile(resolve(root, 'public/media/home-r2/manifest.json'), 'utf8'));
assert.equal(reel.libraryId, 'claude-of-tanks-home-r2');
assert.equal(reel.schemaVersion, 1);
assert.ok(reel.hero.length >= 5 && reel.hero.length <= 8, `the reel cycles five to eight clips (${reel.hero.length})`);
assert.deepEqual(Object.keys(reel.features).sort(), ['battlefields', 'destruction', 'fleet', 'garage', 'killcam', 'multiplayer', 'studio', 'watch'],
  'the eight feature slots');
const en = JSON.parse(await readFile(resolve(root, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
const zh = JSON.parse(await readFile(resolve(root, 'src/ui/i18nCatalog.zh-CN.json'), 'utf8'));
const clipFiles = (clip) => [...clip.poster.rungs, clip.film, clip.mobile, clip.wide].filter(Boolean);
// a clip without an altKey files its title as media.homeR2.<camelId> (tools/home-premiere.mjs syncAltCatalogs)
const altKeyOf = (clip) => clip.altKey ?? `media.homeR2.${clip.id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())}`;
for (const clip of [...reel.hero, ...Object.values(reel.features)]) {
  assert.ok(en[altKeyOf(clip)] && zh[altKeyOf(clip)], `${clip.id}: its alt text is in both catalogs`);
  for (const file of clipFiles(clip)) {
    assert.equal((await stat(resolve(root, 'public', file.path.slice(1)))).size, file.bytes, `${file.path} is the manifest's file`);
  }
}
for (const clip of reel.hero) assert.ok(clip.mobile, `${clip.id}: the hero clip has its phone rung`);

// the hero: the first clip's poster is the LCP picture (its rungs, preloaded by the same set), the clips wait without a
// source in the manifest's order, the trailer button's thumbnail is the only other picture
const heroMarkup = home.match(/<!--home:hero-->([\s\S]*?)<!--\/home:hero-->/)?.[1] || '';
const rungs = reel.hero[0].poster.rungs;
const srcset = rungs.map((rung) => `${rung.path} ${rung.width}w`).join(', ');
const lcp = (rungs.find((rung) => rung.width >= 1440) ?? rungs.at(-1)).path;
assert.ok(heroMarkup.includes(`<img class="hero__still" src="${lcp}" alt="`) && heroMarkup.includes(`data-i18n-alt="${altKeyOf(reel.hero[0])}"`)
  && heroMarkup.includes('fetchpriority="high"') && heroMarkup.includes(`srcset="${srcset}"`), 'the poster carries its size, priority and rungs');
assert.match(heroMarkup, /<img class="hero__still" [^>]*width="1920" height="\d+"/, 'the poster reserves its box');
assert.equal(home.includes(`<link rel="preload" href="${lcp}" as="image" type="image/webp" fetchpriority="high" imagesrcset="${srcset}"`), true,
  'the poster is preloaded by the same rungs');
assert.equal((heroMarkup.match(/<img /g) || []).length, 2, 'the hero holds its poster and the trailer thumbnail, nothing else');
const clips = [...heroMarkup.matchAll(/<video class="hero__clip" ([^>]*)>([\s\S]*?)<\/video>/g)];
assert.equal(clips.length, reel.hero.length, 'one clip per manifest entry');
clips.forEach(([, attrs, body], i) => {
  const clip = reel.hero[i];
  assert.ok(/\bmuted\b/.test(attrs) && /\bplaysinline\b/.test(attrs) && attrs.includes('preload="none"') && attrs.includes('aria-hidden="true"')
    && attrs.includes('data-reel-clip'), `clip ${i + 1}: muted, inline, no preload, hidden from assistive tech`);
  assert.equal(/\ssrc=/.test(`${attrs}${body}`), false, `clip ${i + 1} names no file before its turn`);
  assert.ok(body.includes(`data-src="${clip.film.path}"`) && body.includes(`data-src="${clip.mobile.path}" type="video/mp4" data-rung="phone"`),
    `clip ${i + 1} plays its film, and its phone rung on a phone`);
});
assert.match(heroMarkup, /<button class="cot-c-btn cot-c-btn--64 hero__trailer" type="button" data-trailer-open><span class="hero__thumb" aria-hidden="true"><img src="[^"]+" alt="" width="84" height="46"/,
  'the trailer button shows a dimensioned thumbnail');
assert.match(heroMarkup, /data-reel-toggle hidden aria-label="[^"]+" data-i18n-aria-label="publicPages\.reel\.pauseAria"/, 'the reel has its pause control');
// (owner 2026-10-25: "also add text here at the left that says stuff about this!") the hero says what the game is, and
// each clip's caption names its vehicles and battlefield: one caption per clip, the poster's on until the reel turns
assert.match(heroMarkup, /<p class="hero__lede" data-i18n="home\.hero\.lede">[^<]+<\/p><div class="hero__ctas">/, 'the headline\'s line sits above the actions');
const shotIds = [...heroMarkup.matchAll(/<span class="hero__shot[^"]*" data-reel-shot="([^"]+)">/g)].map((m) => m[1]);
assert.deepEqual([...shotIds].sort(), reel.hero.map((clip) => clip.id).sort(), 'one caption per clip');
assert.match(heroMarkup, new RegExp(`<span class="hero__shot is-on" data-reel-shot="${reel.hero[0].id}">`), 'the poster\'s caption shows first');
assert.equal((heroMarkup.match(/class="hero__shot is-on"/g) || []).length, 1, 'one caption on at a time');
clips.forEach(([, attrs], i) => assert.ok(attrs.includes(`data-shot="${reel.hero[i].id}"`), `clip ${i + 1} names its caption`));
assert.match(heroMarkup, /<p class="hero__shots" aria-hidden="true">/, 'the captions are the picture\'s: the poster\'s alt and the clips\' labels name the shots');
const heroReel = await readFile(resolve(root, 'src/presentation/heroReel.ts'), 'utf8');
assert.match(heroReel, /if \(!clips\.length \|\| !autoplayAllowed\(\)\) return null;/, 'no clip moves under reduced motion or data saving');
assert.match(heroReel, /shot\.classList\.toggle\('is-on', shot\.dataset\.reelShot === video\.dataset\.shot\)/, 'the caption turns with its clip');
const homePage = await readFile(resolve(root, 'src/presentation/homePage.ts'), 'utf8');
assert.match(homePage, /addEventListener\('load', idle, \{ once: true \}\)/, 'the reel starts after the page has loaded and gone idle');
// (264, load-failure-264) a chunk that did not arrive is not asked for again in this document: the landing asks through
// the kit's importWhenOnline, and on a failure its trailer openers keep the kit's error state (their press reloads once online)
assert.match(publicPages, /if \(document\.querySelector\('\[data-hero-reel\]'\)\) \{\n  importWhenOnline\(\(\) => import\('\.\/homePage\.ts'\), \(\) => \{/,
  'the landing\'s behaviour loads with the landing alone, asked once online');
assert.match(publicPages, /markLoadFailed\(openers\);\n    for \(const opener of openers\) opener\.addEventListener\('click', \(\) => pressFailed\(opener\)\);/,
  '... and a failed landing marks its trailer openers, whose press reloads');

// the features: in their rows, each its poster (lazy, sized, described) and, where the slot has motion, its loop
const featureMarkup = home.match(/<!--home:features-->([\s\S]*?)<!--\/home:features-->/)?.[1] || '';
const featureSlots = [...featureMarkup.matchAll(/<figure class="feat[^"]*" data-feature="([a-z]+)">/g)].map((m) => m[1]);
assert.deepEqual(featureSlots, ['battlefields', 'killcam', 'destruction', 'watch', 'studio', 'multiplayer', 'fleet', 'garage'], 'the features in their rows');
for (const slot of featureSlots) {
  const clip = reel.features[slot];
  const tile = featureMarkup.match(new RegExp(`<figure class="feat[^"]*" data-feature="${slot}">([\\s\\S]*?)</figure>`))?.[1] ?? '';
  assert.match(tile, new RegExp(`<img src="${clip.poster.rungs.at(-1).path}"[^>]* width="\\d+" height="\\d+" alt="[^"]+" data-i18n-alt="${altKeyOf(clip)}" loading="lazy"`),
    `${slot}: its poster is sized, described and lazy`);
  const motion = clip.film || clip.mobile || clip.wide;
  assert.equal(/<video data-media-player muted loop playsinline preload="none" aria-hidden="true"/.test(tile), Boolean(motion), `${slot}: a loop exactly where the slot has motion`);
  assert.match(tile, /<figcaption class="feat__cap"><a class="feat__link" href="\/[^"]*">/, `${slot}: its name is the way in`);
}
// every landing video waits for its turn: the reel's clips, the features' loops, the trailer in its dialog
assert.equal([...home.matchAll(/<video [^>]*>/g)].every((m) => m[0].includes('preload="none"')), true, 'no landing video preloads');
const videos = [...home.matchAll(/<source data-src="([^"]+\.(?:webm|mp4))"/g)].map((match) => match[1]);
assert.equal(new Set(videos).size, videos.length, 'landing videos do not repeat');
assert.equal(/<source src=/.test(home), false, 'no landing video names its file in the markup');

// (owner 2026-10-25: "we need to show of all our higher quality stuff. we hide too much") head to head shows the versus
// twelve in the media lane's order and the fleet its strip of nine: each still at every rung, sized and lazy, the first the
// bento's lead, every tile named and opening its vehicle's Gallery page
const versus = JSON.parse(await readFile(resolve(root, 'public/media/versus-r1/manifest.json'), 'utf8'));
// the lead uses its 1280, 1920 and 3840 rungs, a small tile its 640, 1280 and 1920 (tools/home-premiere.mjs BENTO_RUNGS)
const bentoRungs = (rungs, lead) => [...rungs].sort((a, b) => a.width - b.width).filter((rung) => (lead ? [1280, 1920, 3840] : [640, 1280, 1920]).includes(rung.width));
const bento = (name) => home.match(new RegExp(`<!--home:${name}-->([\\s\\S]*?)<!--/home:${name}-->`))?.[1] || '';
// (a featured still that one of the media lane's home-r2 duels moves shows that duel's poster, the loop's first frame)
const duelStill = (id) => reel.duels?.[id]?.poster.rungs ?? versus.items.find((item) => item.id === id).rungs;
for (const [name, rungsOf] of [['duels', versus.featured.map(duelStill)], ['fleet', reel.fleetStrip.map((entry) => entry.rungs)]]) {
  const tiles = [...bento(name).matchAll(/<figure class="(bento__tile[^"]*) cot-c-media">([\s\S]*?)<\/figure>/g)];
  assert.equal(tiles.length, rungsOf.length, `${name}: one tile per still`);
  tiles.forEach(([, cls, body], i) => {
    assert.equal(cls.includes('bento__tile--lead'), i === 0, `${name} ${i + 1}: only the first leads`);
    const srcset = body.match(/ srcset="([^"]+)"/)?.[1] ?? '';
    assert.deepEqual(srcset.split(', ').map((entry) => entry.split(' ')[0]), bentoRungs(rungsOf[i], i === 0).map((rung) => rung.path), `${name} ${i + 1}: the rungs its size can use`);
    assert.match(body, /width="1920" height="1080" alt="" loading="lazy" decoding="async">/, `${name} ${i + 1}: sized and lazy, named by its caption`);
    assert.match(body, /<figcaption class="bento__cap"><a href="\/gallery\?id=[a-z0-9_]+[^"]*"><span class="bento__words"><b[^>]*>[^<]+<\/b><span class="bento__where"><span data-i18n="/, `${name} ${i + 1}: named, the way to its vehicle`);
  });
}

// in battle: the media lane's four battle clips in its order, each its sized lazy poster and its loop on the media player
const clipTiles = [...bento('clips').matchAll(/<figure class="bento__tile cot-c-media" data-clip="([^"]+)">([\s\S]*?)<\/figure>/g)];
assert.deepEqual(clipTiles.map((m) => m[1]), reel.clips.map((clip) => clip.id), 'in battle: the four clips in the manifest order');
for (const [, id, body] of clipTiles) {
  assert.match(body, /<img [^>]*width="1280" height="720" alt="" loading="lazy" decoding="async">/, `${id}: its poster is sized and lazy`);
  assert.match(body, /<video data-media-player muted loop playsinline preload="none" aria-hidden="true"/, `${id}: its loop waits for the player`);
  assert.match(body, /<figcaption class="bento__cap"><a href="\/gallery\?id=[a-z0-9_]+[^"]*"><span class="bento__words"><b data-i18n="home\.hero\.shot[A-Za-z]*"/, `${id}: named, the way to its vehicle`);
}

console.log(`landing-media.selftest: the reel's ${reel.hero.length} clips, the eight features, the versus twelve, the ${reel.clips.length} battle clips, the fleet strip and the landing-r1 picks pass`);

const published = JSON.parse(await readFile(resolve(root, 'public/media/production-r1/manifest.json'), 'utf8'));
assert.ok(published.shots.length > 0);
assert.ok(published.shots.every(shot => shot.kind === 'battlefield' && shot.src.startsWith('/maps/')), 'only refreshed map photographs remain in the recent publication');
assert.deepEqual(published.films, [], 'recent promotional films are withdrawn');
assert.doesNotMatch(home, /director-r4/);
