import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const home = readFileSync(join(ROOT, 'home.html'), 'utf8');
const styles = readFileSync(join(ROOT, 'public/home.css'), 'utf8');

assert.match(home, /<header class="v5-hero">[\s\S]*?<\/header>\s*<section class="v5-social-proof" aria-labelledby="social-proof-title">/,
  'social proof must be the first landing-page section after the hero');
assert.match(home, /Public engagement snapshot captured August 31, 2026/,
  'static platform counts must disclose their capture date');
assert.match(home, /<h2 id="social-proof-title"><span>Featured by Three\.js<\/span><span>Shared across the web<\/span><\/h2>/,
  'social-proof headline must preserve the authored two-line lockup');
assert.doesNotMatch(home, /platform\.twitter\.com|embed\.reddit\.com|twitter-tweet|reddit-embed-bq/,
  'social proof must not load third-party embed scripts');

const xLinks = [
  'https://x.com/threejs/status/2090638002003575214',
  'https://x.com/hakimieiqbal/status/2090762488589521198',
  'https://x.com/RoundtableSpace/status/2092835749238386846',
  'https://x.com/jurlycat/status/2092885030154785240',
  'https://x.com/VaibhavSisinty/status/2093294773813583926',
];
const redditLinks = [
  'https://www.reddit.com/r/ClaudeAI/comments/1vz70zy/i_claude_coded_a_multiplayer_threejs_tank_game/',
  'https://www.reddit.com/r/ClaudeCode/comments/1vtv818/i_claude_coded_a_multiplayer_threejs_tank_game/',
  'https://www.reddit.com/r/aigamedev/comments/1vum27g/i_claude_coded_a_multiplayer_threejs_tank_game/',
  'https://www.reddit.com/r/threejs/comments/1vtumnk/threejs_multiplayer_tank_game_inspired_by_world/',
  'https://www.reddit.com/r/vibecoding/comments/1vu0p6q/vibecoded_a_multiplayer_threejs_browser_tank_game/',
];
for (const url of [...xLinks, ...redditLinks]) {
  assert.ok(home.includes(`href="${url}"`), `missing social-proof source ${url}`);
}
assert.equal((home.match(/<article class="v5-social-card(?:\s[^"<]*)?">/g) || []).length, 5,
  'the X proof wall must contain five source cards');
assert.equal((home.match(/<div class="v5-reddit-card__meta">/g) || []).length, 5,
  'the Reddit proof rail must contain five source cards');
assert.equal((home.match(/<img class="v5-social-card__avatar"/g) || []).length, 5,
  'every X proof card must show its real account avatar');
assert.equal((home.match(/src="\/media\/social-proof\/basedketsu\.png"/g) || []).length, 5,
  'every Reddit card must show the posting account avatar');
assert.equal((home.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 10,
  'every external social card must isolate its browsing context');
const xWall = home.match(/<div class="shell v5-social-proof__x-grid">([\s\S]*?)<div class="shell v5-social-proof__reddit">/)?.[1] ?? '';
assert.ok(xWall.indexOf('@hakimieiqbal') < xWall.indexOf('@VaibhavSisinty'),
  'Hakimi must appear before Vaibhav in the X proof wall');
for (const quote of [
  'A solo dev just shipped what would take a game studio months.',
  'The breakthrough wasn’t one giant prompt.',
  'The prompt wasn’t the system. The workflow was.',
  'Proves how agentic coding tools can scaffold interactive 3D multiplayer games from scratch in hours.',
]) {
  assert.ok(home.includes(quote), `missing requested social-proof quote: ${quote}`);
}
assert.ok(!home.includes('The engine behind the game'), 'removed Three.js kicker must stay absent');
assert.ok(!home.includes('shared the full game showcase with its community'),
  'removed Three.js supporting sentence must stay absent');

for (const value of ['396K', '77.8K', '1,453', '269', '19.5K', '37.9K', '162K', '112K']) {
  assert.ok(home.includes(value), `missing verified engagement value ${value}`);
}
for (const label of ['views', 'likes', 'replies', 'reposts and quotes', 'bookmarks', 'upvotes', 'comments']) {
  assert.match(home, new RegExp(`aria-label="[^"]+ ${label}"`), `missing accessible ${label} metric`);
}

for (const icon of ['x', 'reddit', 'view', 'like', 'comment', 'repost', 'bookmark']) {
  const relative = `brand/social/${icon}.svg`;
  const path = join(ROOT, 'public', relative);
  assert.ok(existsSync(path), `missing social icon ${relative}`);
  assert.match(readFileSync(path, 'utf8'), /^<svg[^>]+viewBox="0 0 24 24"/,
    `${relative} must use the shared 24 px grid`);
  assert.ok(styles.includes(`/${relative}`), `${relative} must be wired into the landing component`);
}

for (const avatar of ['threejs.jpg', 'vaibhav-sisinty.jpg', 'hakimi-eiqbal.jpg', 'roundtable-space.jpg', 'jurly.jpg', 'basedketsu.png']) {
  const relative = `media/social-proof/${avatar}`;
  assert.ok(existsSync(join(ROOT, 'public', relative)), `missing locally hosted social avatar ${relative}`);
  assert.ok(home.includes(`src="/${relative}"`), `social avatar ${relative} must be wired into the landing component`);
}
assert.doesNotMatch(home, /pbs\.twimg\.com|i\.redd\.it/,
  'the landing page must not hotlink social account avatars');

assert.match(styles, /@media\(hover:hover\) and \(pointer:fine\)\{[^}]*\.v5-social-card:hover/,
  'social-card hover polish must be fine-pointer-only');
assert.match(styles, /@media\(prefers-reduced-motion:reduce\)\{[^}]*\.v5-social-card/,
  'social-card motion must honor reduced motion');
assert.match(styles, /\.v5-social-proof__x-grid\{[^}]*grid-template-columns:repeat\(12/,
  'desktop social proof must use the authored card grid');
assert.match(styles, /\.v5-social-proof h2 span\{[^}]*display:block;white-space:nowrap/,
  'social-proof headline rows must not wrap internally');
for (const icon of ['view', 'like', 'comment', 'repost', 'bookmark']) {
  assert.match(styles, new RegExp(`\\.v5-social-metric-icon--${icon}\\{[^}]*color:#`),
    `${icon} metric icon must have a distinct high-visibility color`);
}
assert.match(styles, /\.v5-social-metric-icon\{[^}]*width:18px;height:18px/,
  'primary social metric icons must use the enlarged presentation size');
assert.match(styles, /\.v5-reddit-grid\{[^}]*grid-template-columns:repeat\(5/,
  'desktop Reddit proof must expose all five discussions');

console.log('social proof selftest passed');
