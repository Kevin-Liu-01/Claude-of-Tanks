// media-fallback.selftest.mjs — every web video has a playable fallback, and every rung a page names exists
// (brand-ui SPEC 8.3 "a receipt proves every <video> has a playable fallback"; SHOWCASE §5.3; BUI-F7).
//
// - Each <video> on a public page (the markup, and the topic headers src/docs/topics.ts writes) lists an H.264 file
//   every browser plays, after any AV1 or VP9 file; every file it names is on disk.
// - An AV1 file leads only its own ladder and only where it saves at least 25 % against its VP9 twin at equal VMAF.
// - The ladders the code writes (the topic headers' TOPIC_HERO_RUNGS, the fleet takes) name exactly the rungs on disk.
// - Every rung src/presentation/responsivePicture.ts names for a page's still exists, and the topic figures' explicit
//   sizes are the files' own.
// Known gaps (a video with only its poster as the fallback) are ledgered with the media task that closes them; a gap
// that closes and stays listed fails, so the ledger only shrinks.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, bytesOf, existsPublic, imageSize, isStill, pageMedia, publicPages, topicData, topicPageMedia, topicSlug,
} from './media-page-scan.mjs';
import { stillRungs } from '../src/presentation/responsivePicture.ts';

const H264 = (entry) => /^video\/mp4/.test(entry.type) || (/\.mp4$/.test(entry.src) && !entry.type);
const AV1 = (entry) => /av01/i.test(entry.type);
const VP9 = (entry) => /webm/.test(entry.type || entry.src) && !AV1(entry);

/**
 * The fallback rule for one ladder: { ok, reason }. `ladder` is [{ src, type, rung }] in preference order; `stat`
 * returns { bytes, vmaf } for a path (vmaf may be undefined).
 */
function ladderVerdict(ladder, stat) {
  if (!ladder.length) return { ok: false, reason: 'names no file' };
  if (!ladder.some(H264)) return { ok: false, reason: 'has no H.264 file (every browser plays H.264; VP9 and AV1 do not)' };
  const av1 = ladder.filter(AV1);
  for (const file of av1) {
    if (ladder.indexOf(file) !== ladder.findIndex((entry) => (entry.rung || '') === (file.rung || ''))) {
      return { ok: false, reason: `${file.src}: an AV1 file leads its rung` };
    }
    const twin = ladder.find((entry) => VP9(entry) && (entry.rung || '') === (file.rung || ''));
    if (!twin) return { ok: false, reason: `${file.src}: AV1 needs its VP9 twin as the next fallback` };
    const a = stat(file.src), v = stat(twin.src);
    if (!(a.bytes <= v.bytes * 0.75)) return { ok: false, reason: `${file.src}: AV1 saves ${Math.round(100 - (100 * a.bytes) / v.bytes)} %, 25 % at least` };
    if (a.vmaf !== undefined && v.vmaf !== undefined && a.vmaf < v.vmaf - 0.5) {
      return { ok: false, reason: `${file.src}: AV1 VMAF ${a.vmaf} under its VP9 twin's ${v.vmaf}` };
    }
  }
  return { ok: true, reason: '' };
}

// The rule itself, on fixtures.
{
  const stat = (sizes) => (src) => ({ bytes: sizes[src]?.[0] ?? 0, vmaf: sizes[src]?.[1] });
  const vp9 = { src: '/m/a.webm', type: 'video/webm' }, mp4 = { src: '/m/a.mp4', type: 'video/mp4' };
  const av1 = { src: '/m/a-av1.webm', type: 'video/webm; codecs="av01.0.08M.08"' };
  assert.equal(ladderVerdict([vp9], stat({})).ok, false, 'a VP9 file alone leaves Safari without VP9 a blank frame');
  assert.equal(ladderVerdict([vp9, mp4], stat({})).ok, true);
  assert.equal(ladderVerdict([av1, vp9, mp4], stat({ [av1.src]: [70, 93.2], [vp9.src]: [100, 93.1] })).ok, true, 'AV1 at 30 % less, equal VMAF');
  assert.match(ladderVerdict([av1, vp9, mp4], stat({ [av1.src]: [80, 93], [vp9.src]: [100, 93] })).reason, /saves 20 %/);
  assert.match(ladderVerdict([av1, vp9, mp4], stat({ [av1.src]: [60, 90], [vp9.src]: [100, 93] })).reason, /VMAF 90/);
  assert.match(ladderVerdict([vp9, av1, mp4], stat({ [av1.src]: [60], [vp9.src]: [100] })).reason, /leads its rung/);
  assert.match(ladderVerdict([av1, mp4], stat({})).reason, /VP9 twin/);
}

// The encodes' VMAF, where a manifest records it.
const VMAF = new Map();
for (const manifest of ['public/media/site50-r14/manifest.json']) {
  if (!existsSync(join(ROOT, manifest))) continue;
  for (const file of JSON.parse(readFileSync(join(ROOT, manifest), 'utf8')).files ?? []) {
    if (file.encode?.vmaf !== undefined) VMAF.set(`/${file.path}`, file.encode.vmaf);
  }
}
const stat = (src) => ({ bytes: bytesOf(src), vmaf: VMAF.get(src) });

/** Videos whose only fallback is their poster, until the media task named lands their H.264 rung. */
const KNOWN_GAPS = Object.freeze([
  {
    match: /^\/media\/site50-r14\/loops\/(s04-column-under-fire|s20-road-return-fire|s21-fields-assault|s23-village-crossroads|s24-ice-duel|s33-water-tower|s34-furnace-salvo|s39-lakeside-village)\.webm$/,
    task: 'media: the topic headers\' 960 VP9 and phone H.264 rungs (SHOWCASE §4.7, the GO re-film)',
  },
]);
const gapFor = (ladder) => KNOWN_GAPS.find((gap) => ladder.some((entry) => gap.match.test(entry.src)));
const usedGaps = new Set();

let videos = 0;
const failures = [];
const check = (where, ladder) => {
  videos++;
  for (const entry of ladder) if (!existsPublic(entry.src)) failures.push(`${where}: ${entry.src} is not on disk`);
  const verdict = ladderVerdict(ladder, stat);
  if (verdict.ok) return;
  const gap = gapFor(ladder);
  if (gap && !verdict.reason.startsWith('names no')) {
    usedGaps.add(gap);
    return;
  }
  failures.push(`${where}: ${verdict.reason}`);
};

const stillsNamed = new Set();
for (const page of publicPages()) {
  const records = pageMedia(readFileSync(join(ROOT, page), 'utf8'));
  for (const record of records) {
    if (record.tag === 'video') check(`${page} <video> #${record.element}`, record.videos);
    for (const still of record.stills) stillsNamed.add(still);
    for (const [url] of record.srcset ?? []) if (url && !existsPublic(url)) failures.push(`${page}: srcset names ${url}, which is not on disk`);
  }
  const slug = topicSlug(page);
  if (!slug) continue;
  const { hero, saving, figures } = await topicPageMedia(slug);
  for (const record of [...hero, ...saving]) {
    if (record.tag === 'video') check(`${page} (topic ${slug}) header`, record.videos);
    for (const still of record.stills) stillsNamed.add(still);
    for (const [url] of record.srcset ?? []) if (url && !existsPublic(url)) failures.push(`${page}: the header names ${url}, which is not on disk`);
  }
  for (const figure of figures) stillsNamed.add(figure.src);
}
// the header art direction (its <picture> phone source) is markup the scanner reads as a still record of its own
for (const page of publicPages().filter(topicSlug)) {
  const { topic } = await topicPageMedia(topicSlug(page));
  const { topicHeroMarkup } = await topicData();
  for (const match of topicHeroMarkup(topic.hero, topic.label, false).matchAll(/<source media="[^"]+" srcset="([^"]+)">/g)) {
    if (!existsPublic(match[1])) failures.push(`topic ${topicSlug(page)}: the phone still ${match[1]} is not on disk`);
  }
}

// The fleet takes (src/ui/fleetTakes.ts): one loop and its poster per vehicle; the index names no H.264 rung yet, so a
// browser without VP9 keeps the vehicle's poster. Ledgered the same way: it closes when every entry names an mp4 rung.
const FLEET_INDEX = 'public/media/site50-r14/fleet/index.json';
let fleetGap = false;
if (existsSync(join(ROOT, FLEET_INDEX))) {
  const entries = Object.values(JSON.parse(readFileSync(join(ROOT, FLEET_INDEX), 'utf8')).vehicles ?? {});
  const withMp4 = entries.filter((entry) => typeof entry.loopMp4 === 'string' || /\.mp4$/.test(entry.loop || ''));
  for (const entry of entries) {
    assert.ok(entry.poster && existsPublic(entry.poster), `${entry.take}: a fleet take keeps its poster as the last fallback`);
  }
  fleetGap = withMp4.length < entries.length;
  assert.ok(fleetGap || withMp4.length === entries.length);
  if (!fleetGap) {
    const fleet = readFileSync(join(ROOT, 'src/ui/fleetTakes.ts'), 'utf8');
    assert.match(fleet, /loopMp4/, 'every fleet take names an H.264 rung: src/ui/fleetTakes.ts must offer it to the player');
  }
}

// The topic headers' rung table is the disk.
const { TOPIC_HERO_RUNGS, TOPIC_FIGURE_SIZES, topics } = await topicData();
for (const [take, rungs] of Object.entries(TOPIC_HERO_RUNGS)) {
  if (rungs.r960) assert.ok(existsPublic(`/media/site50-r14/loops/${take}-960.webm`), `${take}: its 960 rung ships`);
  if (rungs.phone) assert.ok(existsPublic(`/media/web-video-r1/${take}-mobile.mp4`), `${take}: its phone rung ships`);
}
for (const topic of Object.values(topics)) {
  const take = /^\/media\/site50-r14\/loops\/([\w-]+)\.webm$/.exec(topic.hero)?.[1];
  if (!take) continue;
  const rungs = TOPIC_HERO_RUNGS[take] ?? {};
  assert.ok(rungs.r960 || !existsPublic(`/media/site50-r14/loops/${take}-960.webm`), `${take}: its 960 rung ships; list it in TOPIC_HERO_RUNGS`);
  assert.ok(rungs.phone || !existsPublic(`/media/web-video-r1/${take}-mobile.mp4`), `${take}: its phone rung ships; list it in TOPIC_HERO_RUNGS`);
  assert.ok(existsPublic(`/media/site50-r14/stills/${take}-thumb.webp`), `${take}: the 640 still a phone and data saving show`);
}
for (const [src, [width, height]] of Object.entries(TOPIC_FIGURE_SIZES)) {
  assert.deepEqual(imageSize(src), [width, height], `${src}: TOPIC_FIGURE_SIZES is the file's own size`);
}
for (const topic of Object.values(topics)) {
  for (const [src] of topic.media) {
    if (TOPIC_FIGURE_SIZES[src]) continue;
    assert.deepEqual(imageSize(src), [1920, 1080], `${src}: a figure not in TOPIC_FIGURE_SIZES must be 1920 x 1080`);
  }
}

// Every rung the picture helper names for a page's still exists.
let rungsChecked = 0;
for (const still of stillsNamed) {
  if (!isStill(still)) continue;
  const size = imageSize(still);
  for (const rung of stillRungs(still, size?.[0] ?? 1920)) {
    rungsChecked++;
    if (!existsPublic(rung.src)) failures.push(`${still}: responsivePicture names its rung ${rung.src}, which is not on disk`);
  }
}

for (const gap of KNOWN_GAPS) {
  if (!usedGaps.has(gap)) failures.push(`the ledgered gap "${gap.task}" no longer applies: remove it from KNOWN_GAPS`);
}
assert.deepEqual(failures, [], `media fallbacks:\n  ${failures.join('\n  ')}`);
console.log(`media-fallback.selftest: ${videos} page videos each hold an H.264 fallback after any AV1/VP9 file `
  + `(${usedGaps.size} ledgered gap${usedGaps.size === 1 ? '' : 's'}: ${[...usedGaps].map((g) => g.task).join('; ') || 'none'}); `
  + `${rungsChecked} still rungs on disk; topic header and figure tables match the files`
  + `${fleetGap ? '; the fleet takes keep their posters until their H.264 rung lands' : ''}`);
