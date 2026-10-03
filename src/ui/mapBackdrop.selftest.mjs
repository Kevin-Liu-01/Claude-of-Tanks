// mapBackdrop.selftest.mjs — full-bleed loading art follows the viewport (FE-P13).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { MAPS_WITHOUT_CARD, backdropWidthPx, mapBackdropFor, mapCardFor } from './mapBackdrop.ts';
import { featuredShotForMap } from './featuredShots.ts';
import { MAP_HEROES } from './mapThumbs.ts';
import { MAP_IDS } from '../world/maps/index.ts';

const publicFile = (path) => new URL(`../../public${path}`, import.meta.url);
function webpSize(buffer) {
  assert.equal(buffer.subarray(8, 12).toString(), 'WEBP');
  const kind = buffer.subarray(12, 16).toString();
  if (kind === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const bits = buffer.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1];
  throw new Error(`unknown WebP chunk ${kind}`);
}

// 1. The card list matches what the media pipeline published.
const published = new Set(readdirSync(publicFile('/maps/cards')).filter((name) => name.endsWith('.webp')).map((name) => name.slice(0, -5)));
let cardBytes = 0, heroBytes = 0;
for (const mapId of MAP_IDS) {
  const card = mapCardFor(mapId);
  if (MAPS_WITHOUT_CARD.has(mapId)) {
    assert.equal(card, null);
    assert.ok(!published.has(mapId), `${mapId} has a published card now: remove it from MAPS_WITHOUT_CARD`);
    continue;
  }
  assert.ok(published.has(mapId), `${mapId} has no card in public/maps/cards/: add it to MAPS_WITHOUT_CARD or publish one`);
  const bytes = readFileSync(publicFile(card));
  assert.deepEqual(webpSize(bytes), [1280, 720], `${mapId}: cards are 1280×720`);
  cardBytes += bytes.length;
  heroBytes += statSync(publicFile(MAP_HEROES[mapId])).size;
}
for (const name of published) assert.ok(MAP_IDS.includes(name), `card ${name}.webp belongs to no battlefield`);
assert.ok(cardBytes < heroBytes * 0.25, `cards (${cardBytes} B) must stay a fraction of the heroes (${heroBytes} B)`);
assert.equal(mapCardFor('not-a-map'), null);

// 2. The tier follows the viewport: cards on small and medium screens, the hero where a card would stretch past 2x.
const view = (width, height, devicePixelRatio) => ({ width, height, devicePixelRatio });
const card = '/maps/cards/verdant.webp', hero = MAP_HEROES.verdant;
const cases = [
  ['phone landscape 844x390 @3', view(844, 390, 3), card],
  ['laptop 1366x768 @1', view(1366, 768, 1), card],
  ['desktop 1920x1080 @1', view(1920, 1080, 1), card],
  ['desktop 1920x1080 @1.25 (1536x864)', view(1536, 864, 1.25), card],
  ['monitor 2560x1440 @1', view(2560, 1440, 1), card],
  ['phone portrait 390x844 @3', view(390, 844, 3), hero],
  ['tablet 1180x820 @2', view(1180, 820, 2), hero],
  ['laptop 1440x900 @2', view(1440, 900, 2), hero],
  ['4K monitor 3840x2160 @1', view(3840, 2160, 1), hero],
];
for (const [label, viewport, expected] of cases) {
  assert.equal(mapBackdropFor('verdant', viewport), expected, `${label}: ${backdropWidthPx(viewport)} device px`);
}
assert.equal(backdropWidthPx(view(390, 844, 3)), 844 * 16 / 9 * 2, 'cover width, pixel ratio capped at 2');
assert.equal(mapBackdropFor('moon', view(844, 390, 3)), MAP_HEROES.moon, 'a battlefield without a card keeps its hero');
assert.equal(mapBackdropFor('verdant', null), hero, 'no viewport (Node, tools) keeps the hero');
assert.equal(mapBackdropFor('verdant', view(0, 0, 1)), hero, 'an unlaid-out window keeps the hero');
assert.equal(featuredShotForMap('verdant', view(1366, 768, 1)).img, card, 'the battlefield transition uses the same tier');
assert.equal(featuredShotForMap('verdant').img, hero);

// 3. Every full-bleed battlefield loading surface asks through the tier.
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.equal((main.match(/battleBackdrop\(mapId\)/g) || []).length, 3, 'solo, network intent and network roster loading art');
assert.doesNotMatch(main, /mapHeroes\[/, 'no loading surface requests the 4K hero directly');
assert.match(readFileSync(new URL('./transition.ts', import.meta.url), 'utf8'), /featuredShotForMap\(o\.mapId, currentViewport\(\)\)/);
assert.ok(existsSync(publicFile('/maps/cards')));

console.log(`mapBackdrop.selftest: ${published.size} cards (${(cardBytes / 1048576).toFixed(1)} MB vs ${(heroBytes / 1048576).toFixed(1)} MB of heroes) serve small and medium screens`);
