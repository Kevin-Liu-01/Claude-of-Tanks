import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The public pages' media loading (brand-ui SPEC 8.3, BUI-F7): one shared player module owns the policy
// (mediaPlayer.ts, behaviour proven in mediaPlayer.selftest.mjs); the page loads it beside its first bytes, keeps no
// warm observer of its own, and hands the pipe to the game on Play.
const source = await readFile(new URL('./publicPages.ts', import.meta.url), 'utf8');
const player = await readFile(new URL('./mediaPlayer.ts', import.meta.url), 'utf8');

assert.doesNotMatch(source, /function mountViewportVideo|data-autoplay-video'\)\.forEach/,
  'the page keeps no video observer of its own: the shared player replaces it');
assert.match(source, /import\('\.\/mediaPlayer\.ts'\), import\('\.\/mediaPlayer\.css'\)[\s\S]{0,200}mountMediaPlayers\(pageVideos/,
  'the page mounts its videos through the shared player and its control\'s style, both loaded with import()');
assert.match(source, /querySelectorAll<HTMLVideoElement>\('video\[data-media-player\], video\[data-autoplay-video\]'\)/,
  'both the current and the earlier loop markup are mounted');
assert.doesNotMatch(source, /^import [^;]*mediaPlayer/m, 'the player never enters the page\'s first bytes');

assert.match(player, /nearMargin: '25% 0px'/, 'videos may start their transfer a quarter viewport early');
assert.equal((player.match(/new IntersectionObserver\(/g) || []).length, 2,
  'near-viewport transfer and true-viewport playback keep separate observers');
assert.match(player, /playRatio: 0\.5,/, 'playback starts at half the frame visible');
assert.match(player, /pauseRatio: 0\.1,/, 'and stops below a tenth');
assert.match(player, /releaseMs: 10_000,/, 'a paused source survives a scroll reversal for ten seconds');
assert.doesNotMatch(player, /setTimeout\(release, 1200\)/, 'videos never thrash their source after a short scroll');

assert.match(source, /if \(media\) media\.abortPageMedia\(\);/, 'a click into the game stops every media transfer first');
assert.match(source, /media \? !media\.prefetchGameEntry\(gameEntryChunk\) : savingData\(\)/,
  'the entry prefetch defers to the player (no prefetch while a video downloads) and to data saving');
assert.match(source, /addEventListener\('pointerover', prefetchGameEntry/, 'the entry prefetch waits for a hover');
assert.match(source, /addEventListener\('focusin', prefetchGameEntry\)/, 'or a focus');
assert.match(source, /const savingPictures = savingData\(\) \? import\('\.\/responsivePicture\.ts'\) : null;/,
  'data saving loads the 640-still helper; anyone else fetches nothing more');

console.log('publicLoading.selftest: the shared player owns near-viewport warm, 50/10 visibility and the 10 s release; '
  + 'the page loads it lazily and hands the pipe to the game on Play');
