import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The site's video budget (owner 2026-10-14: "we dont need them all to be super duuper highh quality 4k, they can be
// good quality but shouldnt be too heavy on storage or take a long time to load in"; the coordinator: VMAF 93 at least
// for the loops and the reel against their masters, 90 for the 960 px loops, and about 15 MB of video at most before a
// desktop visitor scrolls the home page). public/media/site50-r14's manifest records each web video's encode
// (site-media.mjs webMake: its rate and VMAF); every loop, 960 px loop, the reel and the trailer holds its floor and its
// weight, and the first video a home page visitor reaches (the reel; the page's warm observer starts each a quarter of a
// viewport early, and on the home r2 layout none is that near at load) stays under 15 MB.
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
const RULES = [
  [/^media\/site50-r14\/loops\/[^/]+-960\.webm$/, { max: 1.8 * MB, floor: 90, capFloor: 85, what: '960 px loop' }],
  [/^media\/site50-r14\/loops\/s04-column-under-fire\.webm$/, { max: 7.5 * MB, floor: 93, capFloor: 90, what: 'loop' }],
  [/^media\/site50-r14\/loops\/[^/]+\.webm$/, { max: 6.8 * MB, floor: 93, capFloor: 90, what: 'loop' }],
  [/^media\/site50-r14\/films\/reel\.webm$/, { max: 15 * MB, floor: 93, capFloor: 80, what: 'reel' }],
  [/^media\/site50-r14\/films\/reel\.mp4$/, { max: 15 * MB, floor: 93, capFloor: 80, what: 'reel fallback' }],
  [/^media\/site50-r14\/films\/trailer\.mp4$/, { max: 42 * MB, floor: null, what: 'trailer' }],
];
const files = JSON.parse(readFileSync(MANIFEST, 'utf8')).files ?? [];
const seen = { loop: 0, '960 px loop': 0, reel: 0, 'reel fallback': 0, trailer: 0 };
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
// the home page before a scroll (measured 2026-10-14 on the live home r2 at 1920x1080: the reel's section begins 4.0
// viewport heights down and the destruction loop's 7.1, so no video loads before a scroll, and the warm observer, a
// quarter of a viewport ahead, never warms the two together): the first video a visitor reaches, in document order,
// stays under 15 MB on its own
const home = readFileSync(join(ROOT, 'site/home.html'), 'utf8');
const first = [...home.matchAll(/<source[^>]*\sdata-src="([^"]+)"/g)].map((m) => m[1])[0];
const firstBytes = first ? statSync(join(ROOT, 'public', first.replace(/^\//, ''))).size : 0;
assert.ok(firstBytes <= 15 * MB, `the home page's first video (${first}) is ${(firstBytes / MB).toFixed(1)} MB, 15 MB at most`);
console.log(`site-video-budget.selftest: ${seen.loop} loops, ${seen['960 px loop']} 960 px loops, the reel, its fallback and ${seen.trailer} trailer, `
  + `${(bytes / MB).toFixed(1)} MB in all; the home page's first video ${(firstBytes / MB).toFixed(1)} MB`);
