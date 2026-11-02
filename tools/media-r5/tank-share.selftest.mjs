import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { tankShareTable } from './tank-share.mjs';
import { OG_TYPE } from '../marketing-shots/generate-og-images.mjs';
import { tankShareFor, withTankShare } from '../../src/presentation/tankShareMeta.ts';
import { localizeHtmlDocument } from '../../src/presentation/localizedHtml.ts';
import { PUBLIC_ROUTE_RECORDS } from '../../src/ui/localeRouting.ts';
import '../../src/ui/i18nCatalog.ts';

// A link to one tank shares that tank (og-r2, the owner 2026-11-01: better share cards "for cot.kevinliu.studio and
// all its associatd links"): src/presentation/tankShare.json names every tank the Gallery shows and the card its take
// was rendered into (tools/media-r5/tank-share.mjs); middleware.ts answers /gallery?id=<id> through tankShareMeta.ts.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const table = JSON.parse(readFileSync(join(ROOT, 'src/presentation/tankShare.json'), 'utf8'));
assert.deepEqual(table, tankShareTable(), 'src/presentation/tankShare.json is current (node tools/media-r5/tank-share.mjs)');

// every card: the share cards' size and weight, the lockup in one of its two top corners
const lockupSvg = readFileSync(join(ROOT, 'public/brand/lockup.svg'), 'utf8');
const [, , vbW, vbH] = /viewBox="([^"]+)"/.exec(lockupSvg)[1].split(/\s+/).map(Number);
const w = Math.round(OG_TYPE.lockup * vbW / vbH), canvas = createCanvas(1200, 630), context = canvas.getContext('2d');
const amberIn = (x) => {
  const px = context.getImageData(x, OG_TYPE.top, w, OG_TYPE.lockup).data;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] > 175 && px[i + 1] > 90 && px[i + 1] < 195 && px[i + 2] < 105) n++;
  return n;
};
const cards = Object.entries(table.tanks).filter(([, tank]) => tank.card);
for (const [id, { card }] of cards) {
  const file = join(ROOT, 'public', card);
  assert.ok(statSync(file).size <= 300_000, `${card}: at most 300 KB`);
  const image = await loadImage(file);
  assert.deepEqual([image.width, image.height], [1200, 630], `${card}: social-card dimensions`);
  context.drawImage(image, 0, 0);
  assert.ok(Math.max(amberIn(OG_TYPE.inset), amberIn(1200 - OG_TYPE.inset - w)) > 60, `${id}: the lockup stands in a top corner of its card`);
}

// the Gallery's document as a share of one tank, in both languages
const gallery = PUBLIC_ROUTE_RECORDS.find((route) => route.id === 'gallery');
const english = readFileSync(join(ROOT, 'site/gallery.html'), 'utf8');
const meta = (html, key, selector = 'property') => html.match(new RegExp(`<meta ${selector}="${key}" content="([^"]*)"`))?.[1];
const [filmed] = cards[0], unfilmed = Object.keys(table.tanks).find((id) => !table.tanks[id].card);
for (const [html, path] of [[english, '/gallery'], [localizeHtmlDocument(english, gallery, 'zh-CN'), '/cn/gallery']]) {
  for (const id of [filmed, unfilmed].filter(Boolean)) {
    const share = tankShareFor(id), out = withTankShare(html, share, new URL(`https://preview.example${path}?id=${id}&x=1`));
    const name = share.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    assert.ok(meta(out, 'og:title').startsWith(`${name} · `) && meta(out, 'og:title').endsWith(meta(html, 'og:title')), `${path} ${id}: its name before the Gallery's title`);
    assert.ok(meta(out, 'twitter:title', 'name').startsWith(`${name} · `), `${path} ${id}: the same on X`);
    assert.match(out, new RegExp(`<title>${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · `), `${path} ${id}: the document's title too`);
    assert.equal(meta(out, 'og:url'), `https://cot.kevinliu.studio${path}?id=${id}`, `${path} ${id}: the tank's own canonical link`);
    assert.equal(meta(out, 'og:type'), 'website', `${path} ${id}: a still share`);
    assert.doesNotMatch(out, /property="og:video/, `${path} ${id}: the Gallery's clip leaves a tank's share`);
    assert.equal(meta(out, 'og:image'), share.card ? `https://cot.kevinliu.studio${share.card}` : meta(html, 'og:image'), `${path} ${id}: its card, else the Gallery's`);
    assert.equal(meta(out, 'twitter:image', 'name'), meta(out, 'og:image'), `${path} ${id}: X shows the same card`);
  }
}
for (const id of ['', null, 'no_such_tank', '__proto__', 'constructor', 'toString']) assert.equal(tankShareFor(id), null, `${id}: no share`);
console.log(`tank-share.selftest: ${Object.keys(table.tanks).length} tanks named, ${cards.length} with their take's card; a tank link shares its name, link and card in both languages`);
