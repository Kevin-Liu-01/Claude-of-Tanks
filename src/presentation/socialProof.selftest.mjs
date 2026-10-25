// The landing's press band (2026-10-25 redesign; owner: "not have goofy text"): the Three.js feature, the launch numbers
// with their capture date, the four quoted posts over their battle photos and the Reddit threads, all local, no embeds.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const home = readFileSync(join(ROOT, 'site/home.html'), 'utf8');
const styles = readFileSync(join(ROOT, 'src/presentation/home.css'), 'utf8');

assert.match(home, /<!--home:hero-->[\s\S]*?<!--\/home:hero-->\s*<!--home:features-->[\s\S]*?<!--\/home:features-->\s*<!--home:play-->[\s\S]*?<!--\/home:play-->\s*<section class="press" aria-labelledby="press-title">/,
  'the generated hero reel, features and modes rail open the page; the press band follows');
const press = home.match(/<section class="press"[\s\S]*?<\/section>/)?.[0] ?? '';
assert.match(press, /data-i18n="home\.social\.snapshot">Engagement as of September 8, 2026\./,
  'static platform counts must disclose their capture date');
assert.match(press,
  /<h2 class="home-h2 press__title" id="press-title"><a href="https:\/\/x\.com\/threejs\/status\/2090638002003575214" target="_blank" rel="noopener noreferrer"><img class="press__avatar" src="\/media\/social-proof\/threejs\.jpg" alt=""[^>]*><span class="t-hollow" data-i18n-html="home\.social\.kicker"[^>]*>Featured by <em>Three\.js<\/em><\/span><\/a><\/h2>/,
  'the band leads with the Three.js feature, its name the link to the post');
assert.ok(!home.includes('Shared across the web') && !home.includes('Claude of Tanks 🎖️'), 'the band carries no tagline and no emoji quote');
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
for (const url of [...xLinks, ...redditLinks]) assert.ok(press.includes(`href="${url}"`), `missing social-proof source ${url}`);
assert.equal((press.match(/<article class="v5-social-card(?:\s[^"<]*)?">/g) || []).length, 4, 'four quoted posts');
assert.equal((press.match(/<img class="v5-social-card__avatar"/g) || []).length, 4, 'every quoted post shows its real account avatar');
assert.equal((press.match(/<a class="press__src" href="https:\/\/www\.reddit\.com\//g) || []).length, 5, 'the five Reddit threads');
assert.equal((press.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 10, 'every external link isolates its browsing context');
assert.equal((press.match(/<dt><span class="v5-social-metric-icon v5-social-metric-icon--(?:view|like|bookmark)" aria-hidden="true"><\/span>/g) || []).length, 4,
  'all four launch numbers carry a matching metric icon');
const quotes = press.match(/<div class="press__quotes">([\s\S]*?)<ul class="press__sources"/)?.[1] ?? '';
assert.ok(quotes.indexOf('@hakimieiqbal') >= 0 && quotes.indexOf('@hakimieiqbal') < quotes.indexOf('@VaibhavSisinty'), 'Hakimi before Vaibhav');
for (const quote of [
  'A solo dev just shipped what would take a game studio months.',
  'Someone built a multiplayer browser tank game with 100+ vehicles in four weeks using Claude Code and Codex.',
  'Proves how agentic coding tools can scaffold interactive 3D multiplayer games from scratch in hours.',
]) assert.ok(press.includes(quote), `missing requested social-proof quote: ${quote}`);
for (const value of ['445K', '79.4K', '1,598', '272', '38K', '13.4K', '6,094', '1,282']) assert.ok(press.includes(value), `missing verified engagement value ${value}`);
for (const label of ['views', 'likes', 'replies', 'reposts and quotes', 'bookmarks']) {
  assert.match(press, new RegExp(`aria-label="[^"]+ ${label}"`), `missing accessible ${label} metric`);
}

for (const icon of ['x', 'reddit', 'view', 'like', 'comment', 'repost', 'bookmark']) {
  const relative = `brand/social/${icon}.svg`;
  assert.ok(existsSync(join(ROOT, 'public', relative)), `missing social icon ${relative}`);
  assert.match(readFileSync(join(ROOT, 'public', relative), 'utf8'), /^<svg[^>]+viewBox="0 0 24 24"/, `${relative} must use the shared 24 px grid`);
  assert.ok(styles.includes(`/${relative}`), `${relative} must be wired into the landing`);
}
for (const avatar of ['threejs.jpg', 'vaibhav-sisinty.jpg', 'hakimi-eiqbal.jpg', 'roundtable-space.jpg', 'jurly.jpg']) {
  const relative = `media/social-proof/${avatar}`;
  assert.ok(existsSync(join(ROOT, 'public', relative)), `missing locally hosted social avatar ${relative}`);
  assert.ok(press.includes(`src="/${relative}"`), `social avatar ${relative} must be wired into the band`);
}
assert.doesNotMatch(home, /pbs\.twimg\.com|i\.redd\.it/, 'the landing page must not hotlink social account avatars');

// each quoted post sits over a distinct site fifty still (tools/media-r5/site-media/picks.json, home.socialCards)
const sitePicks = JSON.parse(readFileSync(join(ROOT, 'tools/media-r5/site-media/picks.json'), 'utf8'));
const backgrounds = new Map(Object.entries(sitePicks.home.socialCards).map(([modifier, pick]) =>
  [modifier, `media/${sitePicks.collection}/stills/${pick.id}${pick.still === 'close' ? '-close' : ''}.webp`]));
const used = [...quotes.matchAll(/v5-social-card--(desert-duel|winter-breaker|verdant-column|coastal-harbor|urban-crossfire)/g)].map((m) => m[1]);
assert.equal(new Set(used).size, 4, 'every quoted post uses a distinct battle photo');
for (const modifier of used) {
  const relative = backgrounds.get(modifier);
  assert.ok(relative && existsSync(join(ROOT, 'public', relative)), `missing battle background for ${modifier}`);
  assert.ok(styles.includes(`--social-card-image:url('/${relative}')`), `battle background ${relative} must be wired into the card layer`);
}
assert.match(styles, /\.v5-social-card::after\{[^}]*background:var\(--social-card-image\)[^}]*\/cover no-repeat;[^}]*opacity:\.26;[^}]*pointer-events:none/,
  'battle photos must be low-opacity, cover-cropped, and non-interactive');
assert.match(styles, /\.v5-social-card>a\{[^}]*position:relative;z-index:2;[^}]*background:linear-gradient/, 'card content sits above a readability scrim');
assert.match(styles, /@media\(hover:hover\) and \(pointer:fine\)\{[^\n]*\.v5-social-card:hover::after\{[^}]*opacity:/, 'card hover polish is fine-pointer-only');
assert.match(styles, /@media\(prefers-reduced-motion:reduce\)\{[^}]*\.v5-social-card::after[^}]*transition:none/, 'card motion honors reduced motion');
assert.match(styles, /\.press__quotes\{[^}]*grid-template-columns:repeat\(4,/, 'desktop shows the four posts in a row');
assert.match(styles, /\.press__title em\{[^}]*color:var\(--gold\)/, 'only the Three.js name in the title takes the gold accent');
for (const icon of ['view', 'like']) assert.match(styles, new RegExp(`\\.v5-social-metric-icon--${icon}\\{[^}]*color:#`), `${icon} metric icon keeps its high-visibility color`);
for (const icon of ['comment', 'repost', 'bookmark']) assert.match(styles, new RegExp(`\\.v5-social-metric-icon--${icon}\\{[^}]*color:#91a1ac`), `${icon} metric icon uses the shared neutral gray`);
assert.match(styles, /\.v5-social-metric-icon\{[^}]*width:18px;height:18px/, 'metric icons use the enlarged presentation size');

console.log('social proof selftest passed: the press band (Three.js, four posts, five threads, dated numbers)');
