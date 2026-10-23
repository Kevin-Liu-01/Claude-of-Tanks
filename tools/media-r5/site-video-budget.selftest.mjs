import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesOf, existsPublic, pageMedia, publicPages, srcsetCandidates, topicData, topicPageMedia, topicSlug }
  from '../media-page-scan.mjs';

// The site's video budget (owner 2026-10-14: "we dont need them all to be super duuper highh quality 4k, they can be
// good quality but shouldnt be too heavy on storage or take a long time to load in"; the coordinator: VMAF 93 at least
// for the loops and the reel against their masters, 90 for the 960 px loops, and about 15 MB of video at most before a
// desktop visitor scrolls the home page). public/media/site50-r14's manifest records each web video's encode
// (site-media.mjs webMake: its rate and VMAF); every loop, 960 px loop, the reel and the trailer holds its floor and its
// weight, and the first video a home page visitor reaches (the reel; the page's warm observer starts each a quarter of a
// viewport early, and on the home r2 layout none is that near at load) stays under 15 MB.
//
// brand-ui SPEC 8.3 / SHOWCASE §5.2-5.3 (BUI-F7) add: the phone rung (≤ 1.0 MB per 6 s; the hero's ≤ 0.9 MB), the home
// hero's motion take (≤ 2.5 MB, its poster ≤ 300 KB), the topic headers' 960 rung (≤ 1.8 MB, the 1920 loop only on wide
// screens), the r6 trailer trio (24 / 14 / 9 MB, click to play) and each page's pre-scroll media on a desktop
// (1920x1080, DPR 1) and a phone (390x844, DPR 3), read from the markup the way a browser picks its rungs.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = join(ROOT, 'public/media/site50-r14/manifest.json');
if (!existsSync(MANIFEST)) {
  console.log('site-video-budget.selftest: no site media in this tree');
  process.exit(0);
}
const MB = 1048576;
// (the coordinator's rulings, 2026-10-14: a loop the floor cannot reach under its 8 Mbit/s cap ships at the cap holding
// 90, and s04's column under fire has a cap of its own, 10 Mbit/s, about 7.1 MB at 93; the reel is 900p VP9 under
// 4.3 Mbit/s with an H.264 twin for a browser without VP9, and its size is the budget: both ship at the cap, the 80 a
// guard against a broken encode rather than a picture floor; the trailer plays on a click and keeps its encode, so it
// is held to its weight only)
const trioLanded = existsPublic('/media/site50-r14/films/trailer.webm');
const RULES = [
  [/^media\/site50-r14\/loops\/[^/]+-960\.webm$/, { max: 1.8 * MB, floor: 90, capFloor: 85, what: '960 px loop' }],
  [/^media\/site50-r14\/loops\/s04-column-under-fire\.webm$/, { max: 7.5 * MB, floor: 93, capFloor: 90, what: 'loop' }],
  [/^media\/site50-r14\/loops\/[^/]+\.webm$/, { max: 6.8 * MB, floor: 93, capFloor: 90, what: 'loop' }],
  [/^media\/site50-r14\/films\/reel\.webm$/, { max: 15 * MB, floor: 93, capFloor: 80, what: 'reel' }],
  [/^media\/site50-r14\/films\/reel\.mp4$/, { max: 15 * MB, floor: 93, capFloor: 80, what: 'reel fallback' }],
  // the r6 trailer trio (the owner approved the main cut at ~21-24 MB, played on click); until it lands, the old 80 s
  // cut keeps its weight
  ...(trioLanded ? [
    [/^media\/site50-r14\/films\/trailer\.(?:webm|mp4)$/, { max: 24 * MB, floor: null, what: 'trailer' }],
    [/^media\/site50-r14\/films\/trailer-30\.(?:webm|mp4)$/, { max: 14 * MB, floor: null, what: 'trailer-30' }],
    [/^media\/site50-r14\/films\/trailer-vertical\.(?:webm|mp4)$/, { max: 9 * MB, floor: null, what: 'trailer-vertical' }],
  ] : [
    [/^media\/site50-r14\/films\/trailer\.mp4$/, { max: 42 * MB, floor: null, what: 'trailer' }],
  ]),
];
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const files = manifest.files ?? [];
const seen = { loop: 0, '960 px loop': 0, reel: 0, 'reel fallback': 0, trailer: 0, 'trailer-30': 0, 'trailer-vertical': 0 };
let bytes = 0;
for (const f of files) {
  const rule = RULES.find(([re]) => re.test(f.path))?.[1];
  if (!rule) continue;
  const size = statSync(join(ROOT, 'public', f.path)).size;
  seen[rule.what]++;
  bytes += size;
  assert.ok(size <= rule.max, `${f.path}: ${(size / MB).toFixed(2)} MB, at most ${(rule.max / MB).toFixed(1)} MB for a ${rule.what}`);
  // (a file at its ladder's cap holds the lower floor, capFloor: the heaviest action loops)
  const floor = f.encode?.capped ? rule.capFloor ?? rule.floor : rule.floor;
  if (floor != null) assert.ok((f.encode?.vmaf ?? 0) >= floor, `${f.path}: VMAF ${f.encode?.vmaf ?? 'unrecorded'} against its master, ${floor} at least`);
}
assert.ok(seen.loop > 0 && seen.reel === 1 && seen['reel fallback'] === 1, `the manifest names the loops, the reel and its fallback (${JSON.stringify(seen)})`);
// the trio's six files are held whether or not the manifest lists them yet
for (const [name, max] of trioLanded ? [['trailer', 24], ['trailer-30', 14], ['trailer-vertical', 9]] : []) {
  for (const ext of ['webm', 'mp4']) {
    const path = `/media/site50-r14/films/${name}.${ext}`;
    if (existsPublic(path)) assert.ok(bytesOf(path) <= max * MB, `${path}: ${(bytesOf(path) / MB).toFixed(1)} MB, ${max} MB at most`);
  }
}
// the home page before a scroll (measured 2026-10-14 on the live home r2 at 1920x1080: the reel's section begins 4.0
// viewport heights down and the destruction loop's 7.1, so no video loads before a scroll, and the warm observer, a
// quarter of a viewport ahead, never warms the two together): the first video a visitor reaches, in document order,
// stays under 15 MB on its own
const home = readFileSync(join(ROOT, 'site/home.html'), 'utf8');
const first = [...home.matchAll(/<source[^>]*\sdata-src="([^"]+)"/g)].map((m) => m[1])[0];
const firstBytes = first ? statSync(join(ROOT, 'public', first.replace(/^\//, ''))).size : 0;
assert.ok(firstBytes <= 15 * MB, `the home page's first video (${first}) is ${(firstBytes / MB).toFixed(1)} MB, 15 MB at most`);

// --- the phone rung (rung 4): ≤ 1.0 MB per 6 s of loop, measured against its source's length --------------------------
const seconds = new Map(files.filter((f) => f.seconds).map((f) => [`/${f.path}`, f.seconds]));
const phoneManifest = join(ROOT, 'public/media/web-video-r1/manifest.json');
// a phone rung over the cap that leaves with its take (the count may only fall; an entry back under the cap fails)
const PHONE_RUNG_GAPS = Object.freeze({
  '/media/web-video-r1/s27-caravanserai-kill-mobile.mp4': 'retires with s27 (SPEC 12.3.2: s227 or s226 replaces the pre-rebuild s27)',
});
let phoneRungs = 0;
if (existsSync(phoneManifest)) {
  for (const entry of JSON.parse(readFileSync(phoneManifest, 'utf8')).files ?? []) {
    const path = `/media/web-video-r1/${entry.path}`;
    const length = seconds.get(entry.source);
    assert.ok(length, `${path}: its source ${entry.source} records its length`);
    const perSix = (bytesOf(path) / length) * 6;
    if (PHONE_RUNG_GAPS[path]) {
      assert.ok(perSix > 1.0 * MB, `${path} is within the phone cap now: remove it from PHONE_RUNG_GAPS`);
      continue;
    }
    assert.ok(perSix <= 1.0 * MB, `${path}: ${(perSix / MB).toFixed(2)} MB per 6 s, 1.0 MB at most (phone rung)`);
    phoneRungs++;
  }
}
for (const path of Object.keys(PHONE_RUNG_GAPS)) assert.ok(existsPublic(path), `${path} is gone: remove it from PHONE_RUNG_GAPS`);

// --- the home hero's motion take (SPEC 8.2: frame 0 is the poster; after load + idle; never under reduced motion) -------
const heroVideos = pageMedia(home).filter((record) => record.tag === 'video' && 'data-media-hero' in record.attrs);
for (const hero of heroVideos) {
  for (const file of hero.videos) {
    const cap = file.rung === 'phone' ? 0.9 * MB : 2.5 * MB;
    assert.ok(bytesOf(file.src) <= cap, `the home hero's ${file.src}: ${(bytesOf(file.src) / MB).toFixed(2)} MB, ${cap / MB} MB at most`);
  }
  if (hero.poster) assert.ok(bytesOf(hero.poster) <= 300_000, `the home hero's poster ${hero.poster} is ${bytesOf(hero.poster)} B, 300 KB at most`);
  assert.ok(!hero.autoplay && hero.preload === 'none', 'the hero motion take waits for load + idle (no autoplay, preload none)');
}

// --- the topic headers: the 960 rung leads on a desktop, the 1920 loop only on a wide screen -------------------------
const { topics, TOPIC_HERO_RUNGS } = await topicData();
const TOPIC_960_GAP = /^(?:s04-column-under-fire|s20-road-return-fire|s21-fields-assault|s23-village-crossroads|s24-ice-duel|s33-water-tower|s34-furnace-salvo|s39-lakeside-village)$/;
let topic960 = 0, topicGaps = 0;
for (const topic of Object.values(topics)) {
  const take = /^\/media\/site50-r14\/loops\/([\w-]+)\.webm$/.exec(topic.hero)?.[1];
  if (!take) continue;
  if (TOPIC_HERO_RUNGS[take]?.r960) {
    assert.ok(bytesOf(`/media/site50-r14/loops/${take}-960.webm`) <= 1.8 * MB, `${take}-960.webm: 1.8 MB at most`);
    topic960++;
  } else {
    assert.match(take, TOPIC_960_GAP, `${take}: a topic header leads with its 960 rung (SHOWCASE §4.7)`);
    topicGaps++;
  }
}
const stillOpen = Object.values(topics).filter((topic) => TOPIC_960_GAP.test(/loops\/([\w-]+)\.webm$/.exec(topic.hero)?.[1] ?? '')
  && !TOPIC_HERO_RUNGS[/loops\/([\w-]+)\.webm$/.exec(topic.hero)[1]]?.r960).length;
assert.equal(stillOpen, topicGaps, 'the 960 gap ledger lists only takes still without the rung');

// --- trailers and reels play on a click ----------------------------------------------------------------------------
const docs = readFileSync(join(ROOT, 'site/docs.html'), 'utf8');
for (const record of pageMedia(docs).filter((r) => r.tag === 'video' && 'controls' in r.attrs)) {
  assert.ok(!record.autoplay && record.preload === 'none', `docs <video> #${record.element} (${record.videos[0]?.src}): click to play, nothing before`);
}

// --- each page's pre-scroll media ----------------------------------------------------------------------------------
/** The layout width `sizes` gives a picture at viewport width `w` (CSS px). */
function slotWidth(sizes, w) {
  for (const part of (sizes || '100vw').split(',').map((s) => s.trim())) {
    const m = /^\((max|min)-width:\s*(\d+)px\)\s+(.+)$/.exec(part);
    const value = m ? m[3] : part;
    if (m && (m[1] === 'max' ? w > Number(m[2]) : w < Number(m[2]))) continue;
    const vw = /^([\d.]+)vw$/.exec(value), px = /^([\d.]+)px$/.exec(value);
    return vw ? (Number(vw[1]) / 100) * w : px ? Number(px[1]) : w;
  }
  return w;
}
/** The file a browser fetches for an <img>: the smallest srcset candidate covering slot x density, else the largest. */
function pickedFile(record, viewport) {
  if (record.phoneSrc && viewport.phone) return record.phoneSrc;
  const candidates = (record.srcset ?? []).filter(([url, width]) => url && width).sort((a, b) => a[1] - b[1]);
  if (!candidates.length) return record.src;
  const need = slotWidth(record.attrs.sizes, viewport.width) * viewport.dpr;
  return (candidates.find(([, width]) => width >= need) ?? candidates.at(-1))[0];
}
assert.equal(slotWidth('(max-width: 767px) 100vw, (max-width: 1099px) 50vw, 25vw', 1920), 480);
assert.equal(slotWidth('(max-width: 767px) 100vw, 25vw', 390), 390);
assert.equal(pickedFile({ attrs: { sizes: '25vw' }, srcset: [['/a-640.webp', 640], ['/a.webp', 1920]], src: '/a.webp' }, { width: 1920, dpr: 1 }), '/a-640.webp');
assert.equal(pickedFile({ attrs: {}, srcset: [['/a-640.webp', 640], ['/a.webp', 1920]], src: '/a.webp' }, { width: 390, dpr: 3 }), '/a.webp');

const DESKTOP = { width: 1920, dpr: 1, phone: false }, PHONE = { width: 390, dpr: 3, phone: true };
const BUDGETS = { // MB of media before a scroll: [desktop, phone] (SHOWCASE §5.2; the home page's hard cap is 15 MB)
  home: [3, 1.2], docs: [1.5, 0.6], topic: [2.5, 0.5], gallery: [1, 0.4], notFound: [0.3, 0.3], game: [0.12 * 1.05, 0.12 * 1.05],
};
const kindOf = (page) => (page === 'site/home.html' ? 'home' : page === 'site/docs.html' ? 'docs' : topicSlug(page) ? 'topic'
  : page === 'site/gallery.html' ? 'gallery' : page === '404.html' ? 'notFound' : page === 'index.html' ? 'game' : null);
/** Media a page fetches before any scroll on one viewport: eager pictures (as picked), posters, preloads, eager video. */
function preScroll(records, viewport) {
  const fetched = new Set();
  for (const record of records) {
    if (!record.eager) continue;
    if (record.tag === 'img') fetched.add(pickedFile(record, viewport));
    else if (record.tag === 'link') fetched.add(record.preload);
    else if (record.tag === 'style') for (const still of record.stills) fetched.add(still);
    else if (record.tag === 'video') {
      if (record.eagerPoster) fetched.add(record.poster);
      if (record.autoplay || record.preload !== 'none') for (const file of record.videos.slice(0, 1)) fetched.add(file.src);
    }
  }
  fetched.delete(undefined);
  fetched.delete(null);
  return [...fetched].reduce((sum, path) => sum + bytesOf(path), 0);
}
const report = [];
for (const page of publicPages()) {
  const kind = kindOf(page);
  if (!kind) continue;
  const records = pageMedia(readFileSync(join(ROOT, page), 'utf8'));
  if (topicSlug(page)) {
    const { hero } = await topicPageMedia(topicSlug(page));
    const phoneSrc = /<source media="[^"]+" srcset="([^"]+)">/.exec((await topicData()).topicHeroMarkup(
      (await topicPageMedia(topicSlug(page))).topic.hero, '', false))?.[1];
    for (const record of hero) if (record.tag === 'img') record.phoneSrc = phoneSrc;
    records.push(...hero);
  }
  const [desktopBudget, phoneBudget] = BUDGETS[kind];
  const desktop = preScroll(records, DESKTOP), phone = preScroll(records, PHONE);
  assert.ok(desktop <= desktopBudget * MB, `${page}: ${(desktop / MB).toFixed(2)} MB of media before a desktop scroll, ${desktopBudget} MB at most`);
  assert.ok(phone <= phoneBudget * MB, `${page}: ${(phone / MB).toFixed(2)} MB of media before a phone scroll, ${phoneBudget} MB at most`);
  report.push(`${page.replace(/^site\//, '')} ${(desktop / MB).toFixed(2)}/${(phone / MB).toFixed(2)}`);
}
// srcset candidates on the pages all exist (a missing rung would silently fall back to the largest file)
for (const page of publicPages()) {
  for (const record of pageMedia(readFileSync(join(ROOT, page), 'utf8'))) {
    for (const [url] of srcsetCandidates(record.attrs?.srcset)) assert.ok(existsPublic(url), `${page}: ${url} is on disk`);
  }
}

console.log(`site-video-budget.selftest: ${seen.loop} loops, ${seen['960 px loop']} 960 px loops, the reel, its fallback and `
  + `${seen.trailer} trailer${trioLanded ? ' (the r6 trio)' : ' (the old 80 s cut until the r6 trio lands)'}, ${(bytes / MB).toFixed(1)} MB in all; `
  + `the home page's first video ${(firstBytes / MB).toFixed(1)} MB; ${phoneRungs} phone rungs ≤ 1.0 MB per 6 s; `
  + `${heroVideos.length ? 'the hero motion take in budget' : 'no hero motion take yet'}; ${topic960} topic headers on the 960 rung `
  + `(${topicGaps} ledgered until theirs lands); pre-scroll media MB desktop/phone: ${report.join(', ')}`);
