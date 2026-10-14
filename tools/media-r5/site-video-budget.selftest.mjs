import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The site's video budget (owner 2026-10-14: "we dont need them all to be super duuper highh quality 4k, they can be
// good quality but shouldnt be too heavy on storage or take a long time to load in"; the coordinator: VMAF 93 at least
// for the loops and the reel against their masters, 90 for the 960 px loops, and about 15 MB of video at most before a
// desktop visitor scrolls the home page). public/media/site50-r14's manifest records each web video's encode
// (site-media.mjs webMake: its rate and VMAF); every loop, 960 px loop, the reel and the trailer holds its floor and its
// weight, and the home page's first two autoplaying videos (the reel and the next, which the page's warm observer starts
// loading a quarter of a viewport early) stay under 15 MB together.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = join(ROOT, 'public/media/site50-r14/manifest.json');
if (!existsSync(MANIFEST)) {
  console.log('site-video-budget.selftest: no site media in this tree');
  process.exit(0);
}
const MB = 1048576;
const RULES = [
  [/^media\/site50-r14\/loops\/[^/]+-960\.webm$/, { max: 1.2 * MB, floor: 90, what: '960 px loop' }],
  [/^media\/site50-r14\/loops\/[^/]+\.webm$/, { max: 3.5 * MB, floor: 93, what: 'loop' }],
  [/^media\/site50-r14\/films\/reel\.mp4$/, { max: 14 * MB, floor: 93, what: 'reel' }],
  [/^media\/site50-r14\/films\/trailer\.mp4$/, { max: 36 * MB, floor: 93, what: 'trailer' }],
];
const files = JSON.parse(readFileSync(MANIFEST, 'utf8')).files ?? [];
const seen = { loop: 0, '960 px loop': 0, reel: 0, trailer: 0 };
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
  assert.ok((f.encode?.vmaf ?? 0) >= floor, `${f.path}: VMAF ${f.encode?.vmaf ?? 'unrecorded'} against its master, ${floor} at least`);
}
assert.ok(seen.loop > 0 && seen.reel === 1, `the manifest names the loops and the reel (${JSON.stringify(seen)})`);
// the home page before a scroll: its first two desktop sources, in document order
const home = readFileSync(join(ROOT, 'site/home.html'), 'utf8');
const first = [...home.matchAll(/<source[^>]*\sdata-src="([^"]+)"/g)].map((m) => m[1]).slice(0, 2);
const firstBytes = first.reduce((sum, src) => sum + statSync(join(ROOT, 'public', src.replace(/^\//, ''))).size, 0);
assert.ok(firstBytes <= 15 * MB, `the home page's first two videos (${first.join(', ')}) are ${(firstBytes / MB).toFixed(1)} MB, 15 MB at most`);
console.log(`site-video-budget.selftest: ${seen.loop} loops, ${seen['960 px loop']} 960 px loops, the reel and ${seen.trailer} trailer, `
  + `${(bytes / MB).toFixed(1)} MB in all; the home page's first two videos ${(firstBytes / MB).toFixed(1)} MB`);
