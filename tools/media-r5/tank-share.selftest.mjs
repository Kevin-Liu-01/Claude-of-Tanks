import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as share from './tank-share.mjs';
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
assert.deepEqual(table, share.tankShareTable(), 'src/presentation/tankShare.json is current (node tools/media-r5/tank-share.mjs)');

// A card is published only as the card CARD_FRAME wants (round 8 Y9 s6-08, 2026-11-08). The table used to publish any
// file that existed and the renderer skipped any file that existed, so adding a tank to CARD_FRAME (its 4K still hides
// the hull) and rendering without --force kept the still's card published, and --check passed. Each card's provenance
// is now recorded (tools/media-r5/tank-cards.json); the table publishes a card only when its record is the card wanted.
const { CARD_FRAME } = share;
const fixture = mkdtempSync(join(tmpdir(), 'cot-tank-share-'));
process.on('exit', () => rmSync(fixture, { recursive: true, force: true }));
const id = Object.keys(table.tanks).find((tank) => table.tanks[tank].card && CARD_FRAME[tank] === undefined);
const cardFile = join(fixture, 'public', share.TANK_CARD_DIR ?? 'brand/og-r2/tanks', `${id}-card.jpg`);
mkdirSync(dirname(cardFile), { recursive: true });
writeFileSync(cardFile, 'still-card');
const framed = { ...CARD_FRAME, [id]: 2.25 };
const tableOf = (records, cardFrame = CARD_FRAME) => share.tankShareTable({ root: fixture, records, cardFrame }).tanks[id].card;
{
  // the review moves the tank to a film frame: its still's card leaves the table until it is rendered again
  assert.equal(tableOf({ [id]: { source: 'still' } }, framed), null, `${id}: a card from its still is unpublished once CARD_FRAME names it`);
  assert.equal(typeof share.cardDue, 'function', 'tank-share.mjs decides a card\'s render by its provenance (cardDue)');
  const want = (cardFrame = CARD_FRAME, digest) => ({ ...share.wantedCard(id, cardFrame), ...(digest ? { digest } : {}) });
  assert.equal(share.cardDue({ source: 'still' }, want(framed)), 'source', 'and it is due');
  // the existence rule, pinned: a recorded card from the source wanted is published and up to date; no file, no card
  assert.equal(tableOf({ [id]: { source: 'still' } }), `/brand/og-r2/tanks/${id}-card.jpg`, 'a card from the source wanted is published');
  assert.equal(share.cardDue({ source: 'still' }, want()), null, 'and up to date');
  assert.equal(share.cardDue({ source: 'still' }, want(), { exists: false }), 'missing', 'no file: due');
  assert.equal(tableOf({ [id]: { source: 'still' } }, { [id]: undefined }), `/brand/og-r2/tanks/${id}-card.jpg`);
  // a file with no record, another second of the film, --force, a changed source file
  assert.equal(tableOf({}), null, 'a card with no record of its source is unpublished');
  assert.equal(share.cardDue(undefined, want()), 'unrecorded');
  assert.equal(tableOf({ [id]: { source: 'film', frame: 1.05 } }, framed), null, 'a frame at another second is unpublished');
  assert.equal(share.cardDue({ source: 'film', frame: 1.05 }, want(framed)), 'frame');
  assert.equal(tableOf({ [id]: { source: 'film', frame: 2.25 } }, framed), `/brand/og-r2/tanks/${id}-card.jpg`, 'the wanted frame is published');
  assert.equal(tableOf({ [id]: { source: 'film', frame: 2.25 } }), null, 'and unpublished when CARD_FRAME drops the tank');
  assert.equal(share.cardDue({ source: 'still' }, want(), { force: true }), 'forced');
  assert.equal(share.cardDue({ source: 'still', digest: 'aaaa' }, want(CARD_FRAME, 'bbbb')), 'digest', 'a re-delivered source makes it due');
  assert.equal(tableOf({ [id]: { source: 'still', digest: 'aaaa' } }), `/brand/og-r2/tanks/${id}-card.jpg`, '(still published until then)');
  assert.equal(share.cardDue({ source: 'still' }, want(CARD_FRAME, 'bbbb')), null, 'a record without a digest (the seed) matches');
  assert.deepEqual(share.CARD_STATES, ['none', 'stale', 'published']);
  // --check and a table write name each unpublished card and why
  assert.deepEqual(share.staleCards({ root: fixture, records: { [id]: { source: 'still' } }, cardFrame: framed }),
    [{ id, due: 'source', want: { source: 'film', frame: 2.25 } }], 'the stale card is listed with its reason');
  assert.deepEqual(share.staleCards({ root: fixture, records: { [id]: { source: 'still' } } }), [], 'a published card is not');
}

// The renderer (renderDue with an injected render, frame grab and still reader: no browser, ffmpeg or master filter)
{
  const schema = JSON.parse(readFileSync(join(ROOT, 'public/media/site50-r14/fleet/index.json'), 'utf8')).tankIdSchema;
  const take = join(fixture, 'takes', `${id}-take`);
  mkdirSync(take, { recursive: true });
  const still = join(take, 'still.png');
  const film = join(take, `${id}-take.mp4`);
  writeFileSync(still, 'still-bytes');
  writeFileSync(film, 'film-bytes');
  const frames = join(fixture, 'frames');
  mkdirSync(frames, { recursive: true });
  const cards = dirname(cardFile);
  const run = async ({ records, cardFrame = framed, luma = 0.5, grab = true, force = false }) => {
    const lines = [], rendered = [], saved = [];
    const result = await share.renderDue({
      stills: { [id]: still }, root: fixture, records, cardFrame, schema, force, frameDir: frames, log: (line) => lines.push(line),
      readSource: async (source) => ({ luma, tl: 1, tr: 0, source }),
      frameAt: (from, seconds, out) => { assert.equal(from, film, 'the frame comes from the take\'s film'); if (grab) writeFileSync(out, `frame-${seconds}`); },
      render: async (tank, source) => { rendered.push(readFileSync(source, 'utf8')); return Buffer.from(`card-from-${readFileSync(source, 'utf8')}`); },
      saveRecords: (next) => saved.push([readFileSync(cardFile, 'utf8'), structuredClone(next)]),
    });
    return { result, lines, rendered, saved };
  };
  // CARD_FRAME gained the tank: a plain run (no --force) renders it from its film, then records it, and says so
  writeFileSync(cardFile, 'still-card');
  writeFileSync(join(cards, `.${id}-card.jpg.partial-999999.jpg`), 'half');
  const records = { [id]: { source: 'still' } };
  const first = await run({ records });
  assert.deepEqual(first.rendered, ['frame-2.25'], 'the stale card is rendered again, from the film at 2.25 s');
  assert.equal(readFileSync(cardFile, 'utf8'), 'card-from-frame-2.25');
  assert.equal(records[id].source, 'film');
  assert.equal(records[id].frame, 2.25);
  assert.match(records[id].digest, /^[0-9a-f]{16}$/, 'the record names its source file\'s digest');
  assert.deepEqual(first.saved.map(([bytes]) => bytes), ['card-from-frame-2.25'], 'the record is written after the card');
  assert.ok(first.lines.some((line) => line.includes(`wrote brand/og-r2/tanks/${id}-card.jpg from its film at 2.25 s (its card is from the other source`)), first.lines.join(' | '));
  assert.deepEqual(readdirSync(cards).sort(), [`${id}-card.jpg`], 'written whole: no partial stays, and a killed run\'s is swept');
  assert.equal(tableOf(records, framed), `/brand/og-r2/tanks/${id}-card.jpg`, 'and the table publishes it');
  // the next run renders nothing and says the card is up to date
  const second = await run({ records });
  assert.deepEqual(second.rendered, [], 'an up-to-date card is not rendered');
  assert.ok(second.lines.includes(`up to date (1): ${id}`), second.lines.join(' | '));
  // a frame an earlier run left is never read: a seek past the film's end leaves nothing, so nothing renders
  writeFileSync(join(frames, `tank-card-${id}.jpg`), 'frame-from-an-earlier-run');
  const late = await run({ records: { [id]: { source: 'still' } }, grab: false });
  assert.deepEqual(late.rendered, [], 'no frame: no card from a leftover one');
  assert.ok(late.lines.some((line) => line.includes(`${id}: its film has no frame at 2.25 s`)), late.lines.join(' | '));
  // a source too dark to be a card: a stale card stays unpublished; a published one is kept
  writeFileSync(cardFile, 'still-card');
  const darkStale = await run({ records: { [id]: { source: 'still' } }, luma: 0.05 });
  assert.deepEqual(darkStale.rendered, [], 'too dark: nothing rendered');
  assert.equal(readFileSync(cardFile, 'utf8'), 'still-card');
  assert.ok(darkStale.lines.some((line) => line.includes('its older card stays unpublished')), darkStale.lines.join(' | '));
  assert.equal(tableOf({ [id]: { source: 'still' } }, framed), null, 'and the table keeps it out');
  const darkKept = await run({ records: { [id]: { source: 'still', digest: '0000000000000000' } }, cardFrame: CARD_FRAME, luma: 0.05 });
  assert.deepEqual(darkKept.rendered, [], 'a re-delivered still too dark to use');
  assert.ok(darkKept.lines.some((line) => line.includes('kept the older card, from the source wanted')), darkKept.lines.join(' | '));
  assert.equal(tableOf({ [id]: { source: 'still', digest: '0000000000000000' } }), `/brand/og-r2/tanks/${id}-card.jpg`, 'still published');
}

// The seeded records: every card on disk has one (the 14 CARD_FRAME tanks from their film at its second, the others from
// their still), none without a card, and the table they give is the shipped one (tankShare.json unchanged, above).
{
  const records = share.readCardRecords();
  const files = readdirSync(join(ROOT, 'public/brand/og-r2/tanks')).map((name) => /^(.+)-card\.jpg$/.exec(name)?.[1]).filter(Boolean).sort();
  assert.deepEqual(Object.keys(records).sort(), files, 'tools/media-r5/tank-cards.json records every card on disk, and only those');
  for (const tank of files) assert.equal(share.cardState(records[tank], share.wantedCard(tank), true), 'published', `${tank}: its card is the one wanted`);
  assert.equal(readFileSync(join(ROOT, share.CARD_RECORDS), 'utf8'), share.cardRecordsText(records), 'the records file is in its written form');
}

// census: the table publishes through cardState only, and the tool writes a card through renderDue's whole-or-nothing write
{
  const source = readFileSync(join(ROOT, 'tools/media-r5/tank-share.mjs'), 'utf8');
  assert.ok(!/card: existsSync\(/.test(source), 'no table entry decided by the file\'s existence alone');
  assert.ok(!source.includes('writeFileSync('), 'every write is whole or not at all (writeFileAtomic)');
  assert.equal(source.match(/writeFileAtomic\(target/g)?.length, 1, 'one card writer (renderDue)');
}

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
