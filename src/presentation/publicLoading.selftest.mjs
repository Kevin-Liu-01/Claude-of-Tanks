import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./publicPages.js', import.meta.url), 'utf8');

assert.match(source, /rootMargin: '25% 0px'/,
  'landing videos should start transfer before they become visible');
assert.match(source, /const warmObserver = new IntersectionObserver[\s\S]{0,620}const observer = new IntersectionObserver/,
  'near-viewport transfer and true-viewport playback need separate observers');
assert.match(source, /const observer = new IntersectionObserver[\s\S]{0,160}entry\.intersectionRatio >= 0\.12/,
  'offscreen warm media must play only after real viewport visibility');
assert.match(source, /return isCompactSurface\(\) \? 15000 : 30000/,
  'normal scroll reversals need a stable media retention window');
assert.doesNotMatch(source, /setTimeout\(releaseSource, 1200\)/,
  'landing videos must not thrash their source after a short scroll');

console.log('publicLoading.selftest: near-viewport warm and anti-thrash release passed');
