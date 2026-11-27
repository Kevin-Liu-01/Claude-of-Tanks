#!/usr/bin/env node
// Big output (every film, any other file of 256 KB or more) belongs on Vercel Blob: after this tool, run `node tools/blob-media.mjs adopt --sweep` and `families --write` (media-blob-279; tools/blob-media-cutover.selftest.mjs fails while a big file is in public/media).
// The Tank Gallery's per-tank share cards (og-r2, the owner 2026-11-01: "we need better og images and og videos, for
// cot.kevinliu.studio and all its associatd links"). A link to one tank, /gallery?id=<id> or its /cn twin, shares that
// tank's name and, when the media lane has filmed its take, a card of that take (<id>-card.jpg: a file named by a bare
// tank id reads to test:recommend as a change to that tank, tools/test-diff.mjs): the take's 4K still under the share
// cards' design (tools/marketing-shots/generate-og-images.mjs cardHtml) with the tank's name for its title, in the
// quieter of the two top corners, through the master filter. middleware.ts answers such a link from
// src/presentation/tankShare.json through src/presentation/tankShareMeta.ts, so a plain Gallery visit loads nothing more.
//   node tools/media-r5/tank-share.mjs                          write the table: every visible tank's name, and its card
//   node tools/media-r5/tank-share.mjs --cards=<stills.json> [--only=a,b] [--force]
//        render the cards that are due (all of them with --force; the first run also renders once each card seeded
//        without a digest, below) from the take stills (<stills.json>: { <vehicle>: <4K still path> }, the media lane's
//        deliveries), then write the table
//   node tools/media-r5/tank-share.mjs --render [--only=a,b] [--force]
//        render the cards of the tanks no take has filmed from their hero card layer (274.0: { source: 'render' }, the
//        shipped public/icons/hero/<id>-960.avif over its flag layer, digest recorded); a filmed take always wins
//   node tools/media-r5/tank-share.mjs --check                  exit 1 when the table is stale or a card on disk is
//        unpublished (stale: it stays out of the table until it is rendered again), listing each with its command
//
// A card's state is its file plus its provenance (round 8 Y9 s6-08, 2026-11-08): tools/media-r5/tank-cards.json records
// what each card was rendered from ({ source: 'still' } or { source: 'film', frame }, and the source file's digest).
// cardState is the one classifier: no file is 'none'; a file whose record is the card CARD_FRAME wants (the same source
// and frame) is 'published'; any other file, or one with no record, is 'stale' and stays out of the table. renderDue is
// the one writer: it renders a card that is missing, stale, forced, whose source file changed, or whose record names no
// digest of its source (cardDue), prints every card it renders and every one it leaves, writes the card whole or not at
// all, then its record. So a CARD_FRAME edit fails --check (checkShare) and tank-share.selftest until the card is
// rendered again, whether or not the table was rewritten meanwhile (the write takes the old card out of the table),
// instead of passing with the old card published (268 dropped REFILM's gate, and the renderer kept any existing file).
// The 184 cards rendered before the records were seeded without a digest (2026-11-08: their sources are the media lane's
// deliveries, outside the repository, and nothing records which bytes each card came from), so the first --cards run
// that reads such a card's source renders it once and records the digest, the card staying published meanwhile; from
// then on a refilmed or re-delivered take makes its card due (review r4: counted as a match, a refilm went unseen).
// Copyright © 2026 Kevin B. Liu.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sweepPartials, writeFileAtomic } from './atomic-output.mjs';
import '../../src/vehicles/tankFactory.ts';
import { TANK_SPECS, VISIBLE_TANK_IDS } from '../../src/vehicles/specs.ts';
import { tankDisplayName } from '../../src/vehicles/tankLabels.ts';
import { resolveTankId } from '../../src/vehicles/tankIdAliases.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TABLE_PATH = 'src/presentation/tankShare.json';
const TABLE = join(ROOT, TABLE_PATH);
export const TANK_CARD_DIR = 'brand/og-r2/tanks';
/** Each rendered card's provenance, tool-side (tankShare.json ships to the site, and middleware reads it per request). */
export const CARD_RECORDS = 'tools/media-r5/tank-cards.json';
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
/** Takes whose 4K still does not show their tank clearly (the review of every rendered card, 2026-11-01): the card is a
 *  frame of the take's film where it does, at these seconds (the review of eight frames a take). */
export const CARD_FRAME = Object.freeze({
  challenger3_proto: 3.3, fv4034: 1.05, leo2a4_v: 2.55, leo2a6: 3.3, leo2a4_otco: 4.8, m1a1_abrams_hc: 1.05,
  m1a2_abrams_tusk: 1.05, sabra_mk2: 1.05, type10_tk_x: 5.55, type10: 1.05, type89: 4.05, ztz99_longwei: 1.05,
  t72b3m_hetman_ii: 4.8, udes03: 1.05,
});

/**
 * The card a tank should have: a frame of its take's film at CARD_FRAME[id] s, else its 4K still; and, for a tank no take
 * has no card cut from a take (`filmed` given and without it), its render (274.0, Kevin via Main 2026-11-22, "Render-based in 274"): the
 * shipped hero card's tank layer over its nation's flag layer (tools/genHeroCards.mjs, first-party procedural pixels), in
 * the same share design. A filmed take always wins: a tank leaves render the moment the media lane cuts its take's card.
 */
export const wantedCard = (id, cardFrame = CARD_FRAME, filmed = null) =>
  (cardFrame[id] !== undefined ? { source: 'film', frame: cardFrame[id] }
    : !filmed || filmed.has(id) ? { source: 'still' } : { source: 'render' });

/**
 * The tanks whose card is cut from a take (its record a still or a film frame). A tank the media lane has filmed but whose
 * card is not cut yet (its 4K still not delivered here) keeps its render card until the take's card is cut: renderDue
 * counts a take handed to the run as filmed, so the still or frame then wins and replaces the render.
 */
export function filmedIds({ root = ROOT, records = readCardRecords(root) } = {}) {
  return new Set(Object.entries(records).filter(([, record]) => record?.source === 'still' || record?.source === 'film').map(([id]) => id));
}
/** A render card's source: the shipped hero card's 960 px tank layer (public/icons/hero, hero-cards-compose ship). */
export const heroLayerPath = (id, root = ROOT) => join(root, 'public/icons/hero', `${id}-960.avif`);
/** The nation's flag layer a render card stands its tank on (the hero card's own, hero-cards.json's row). */
function heroFlagPath(id, root) {
  const file = join(root, 'public/icons/hero/hero-cards.json');
  const flag = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).tanks?.[id]?.flag : null;
  return flag ? join(root, 'public/icons/hero', `flag-${flag}-960.avif`) : null;
}

/**
 * A render card's picture: the tank layer over its flag layer on the cards' dark ground, at 2400 x 1260 (the 1200 x 630
 * card's cover at twice its pixels), the tank right of centre and low, so the title's top corners stay clear. PNG at `out`.
 */
export async function composeRenderSource(id, out, root = ROOT) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const layer = heroLayerPath(id, root);
  if (!existsSync(layer)) throw new Error(`${id}: no hero card layer at ${layer} (render it first: node tools/genHeroCards.mjs --ids=${id}, then hero-cards-compose.mjs ship)`);
  const W = 2400, H = 1260, canvas = createCanvas(W, H), context = canvas.getContext('2d');
  const ground = context.createLinearGradient(0, 0, 0, H);
  ground.addColorStop(0, '#0d151b'); ground.addColorStop(0.62, '#0a1015'); ground.addColorStop(1, '#05080b');
  context.fillStyle = ground; context.fillRect(0, 0, W, H);
  const flag = heroFlagPath(id, root);
  if (flag && existsSync(flag)) {
    // the cloth past the card's top and right edges, its hoist side faded into the ground (no hard edge under the title)
    const cloth = await loadImage(flag), fw = 2200, fh = Math.round(fw * cloth.height / cloth.width);
    const layer = createCanvas(fw, fh), lc = layer.getContext('2d');
    lc.drawImage(cloth, 0, 0, fw, fh);
    lc.globalCompositeOperation = 'destination-in';
    const fade = lc.createLinearGradient(0, 0, fw * 0.55, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    lc.fillStyle = fade; lc.fillRect(0, 0, fw, fh);
    context.globalAlpha = 0.5;
    context.drawImage(layer, W - fw + 80, -90, fw, fh);
    context.globalAlpha = 1;
  }
  const glow = context.createRadialGradient(W * 0.58, H * 0.82, 40, W * 0.58, H * 0.82, 980);
  glow.addColorStop(0, 'rgba(120,150,165,0.20)'); glow.addColorStop(1, 'rgba(120,150,165,0)');
  context.fillStyle = glow; context.fillRect(0, 0, W, H);
  const tank = await loadImage(layer), tw = 1960, th = tw * tank.height / tank.width;
  context.drawImage(tank, W * 0.58 - tw / 2, H - th - 20, tw, th);
  writeFileAtomic(out, canvas.toBuffer('image/png'));
  return out;
}

/** A card's states: 'none' (no file), 'published' (its record is the wanted card), 'stale' (any other file). */
export const CARD_STATES = Object.freeze(['none', 'stale', 'published']);
export function cardState(record, want, exists) {
  if (!exists) return 'none';
  const same = !!record && record.source === want.source && (want.source !== 'film' || record.frame === want.frame);
  return same ? 'published' : 'stale';
}

/**
 * Why a card is due for a render ('missing' | 'unrecorded' | 'source' | 'frame' | 'forced' | 'undigested' | 'digest'),
 * or null when it is up to date. The digests count when the wanted card names one (renderDue read its source): a record
 * without one (a card seeded before the records) cannot tell that source from a refilm, so it is due once to record it.
 */
export function cardDue(record, want, { force = false, exists = true } = {}) {
  const state = cardState(record, want, exists);
  if (state === 'none') return 'missing';
  if (state === 'stale') return !record ? 'unrecorded' : record.source !== want.source ? 'source' : 'frame';
  if (force) return 'forced';
  if (want.digest && !record.digest) return 'undigested';
  if (want.digest && record.digest !== want.digest) return 'digest';
  return null;
}

/** The provenance records ({} when there are none yet). */
export function readCardRecords(root = ROOT) {
  const file = join(root, CARD_RECORDS);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}
/** The records as committed: one card per line, sorted. */
export function cardRecordsText(records) {
  const ids = Object.keys(records).sort();
  return `{\n${ids.map((id, i) => `  ${JSON.stringify(id)}: ${JSON.stringify(records[id])}${i < ids.length - 1 ? ',' : ''}`).join('\n')}\n}\n`;
}

/** The table as the fleet stands: each visible tank's display name, and its card's site path when it is published. */
export function tankShareTable({ root = ROOT, records = readCardRecords(root), cardFrame = CARD_FRAME, filmed = filmedIds({ root, records }) } = {}) {
  const tanks = {};
  for (const id of [...VISIBLE_TANK_IDS].sort()) {
    const card = `${TANK_CARD_DIR}/${id}-card.jpg`;
    const state = cardState(records[id], wantedCard(id, cardFrame, filmed), existsSync(join(root, 'public', card)));
    tanks[id] = { name: tankDisplayName(TANK_SPECS[id]), card: state === 'published' ? `/${card}` : null };
  }
  return { schemaVersion: 1, tanks };
}
const tableText = (options) => `${JSON.stringify(tankShareTable(options), null, 1)}\n`;

/** Visible tanks whose card file is stale (on disk, out of the table), with why. */
export function staleCards({ root = ROOT, records = readCardRecords(root), cardFrame = CARD_FRAME, filmed = filmedIds({ root, records }) } = {}) {
  return [...VISIBLE_TANK_IDS].sort().flatMap((id) => {
    const want = wantedCard(id, cardFrame, filmed);
    const exists = existsSync(join(root, 'public', TANK_CARD_DIR, `${id}-card.jpg`));
    return cardState(records[id], want, exists) === 'stale' ? [{ id, due: cardDue(records[id], want, { exists }), want }] : [];
  });
}

/**
 * --check: whether the committed table is the one the fleet gives (`current`), the cards on disk it leaves out until
 * they are rendered again (`stale`), and the exit code: 0 only when the table is current and no card is stale, so a
 * CARD_FRAME edit fails until the card is rendered, whether or not the table was rewritten meanwhile.
 */
export function checkShare({ root = ROOT, records = readCardRecords(root), cardFrame = CARD_FRAME, filmed = filmedIds({ root, records }) } = {}) {
  const file = join(root, TABLE_PATH);
  const current = existsSync(file) && readFileSync(file, 'utf8') === tableText({ root, records, cardFrame, filmed });
  const stale = staleCards({ root, records, cardFrame, filmed });
  return { current, stale, code: current && !stale.length ? 0 : 1 };
}

/** A still's mean luma (0-1) and, for each top corner's text box, its busyness (mean absolute luma gradient). */
export async function readStill(path) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const image = await loadImage(path), W = 300, H = 158;
  const canvas = createCanvas(W, H), context = canvas.getContext('2d');
  // the card's cover crop: the still's full width, its middle 1.905:1 band
  const band = image.width / (1200 / 630);
  context.drawImage(image, 0, (image.height - band) / 2, image.width, band, 0, 0, W, H);
  const px = context.getImageData(0, 0, W, H).data, luma = (x, y) => {
    const i = (y * W + x) * 4;
    return (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
  };
  let sum = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sum += luma(x, y);
  // the text block's box at card scale (64 px in, 58 px down, about 560 x 190 for a two-line title), here a quarter
  const busy = (x0) => {
    let g = 0, n = 0;
    for (let y = 15; y < 63; y++) for (let x = x0; x < x0 + 140; x++) { g += Math.abs(luma(x + 1, y) - luma(x, y)) + Math.abs(luma(x, y + 1) - luma(x, y)); n++; }
    return g / n;
  };
  return { luma: sum / (W * H), tl: busy(16), tr: busy(W - 17 - 140) };
}

/** A source file's digest: a re-delivered still or film makes its card due. */
export const sourceDigest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);

/** One frame of a take's film at `seconds`, as a JPEG at `out` (nothing there when the film has no such frame). */
const filmFrame = (film, seconds, out) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(seconds), '-i', film, '-frames:v', '1', '-q:v', '2', out]);

const DUE_TEXT = {
  missing: 'no card yet', unrecorded: 'its card has no record of its source', source: 'its card is from the other source',
  frame: 'its card is from another second of the film', forced: '--force', digest: 'its source file changed',
  undigested: 'its card has no digest of its source yet, seeded before the records',
};

/**
 * Render the due cards of `stills` ({ <vehicle>: <4K still path> }): for each, the wanted card (cardDue against its
 * record), its source (the still, or the film's frame at CARD_FRAME[id] s), and `render(id, source, read)`'s JPEG bytes,
 * written whole or not at all, then its record (saveRecords). A source that is missing or too dark to be a card (a
 * broken delivery) leaves any older card as it is: still published when it is the card wanted ('kept published', said
 * apart from the tanks with no card), else still stale ('no card'). Every card rendered and every one left is printed.
 * A tank no take has filmed (`stills` maps it to null; --render lists them all) wants its render card: its source is
 * composeRenderSource's picture of its shipped hero layer, its digest the layer's, and a missing layer throws by name.
 * Returns { wrote, upToDate, kept, skipped }.
 */
export async function renderDue({ stills, only = null, force = false, root = ROOT, records = readCardRecords(root), cardFrame = CARD_FRAME,
  schema, render, readSource = readStill, frameAt = filmFrame, digestOf = sourceDigest, frameDir = tmpdir(),
  composeRender = composeRenderSource, heroLayer = heroLayerPath,
  saveRecords = (next) => writeFileAtomic(join(root, CARD_RECORDS), cardRecordsText(next)), log = console.log }) {
  const dir = join(root, 'public', TANK_CARD_DIR);
  mkdirSync(dir, { recursive: true });
  for (const name of sweepPartials(dir)) log(`removed a killed run's partial ${TANK_CARD_DIR}/${name}`);
  const wrote = [], upToDate = [], kept = [], skipped = [];
  // a tank this run hands a take for is filmed, whatever the index says yet
  const filmed = filmedIds({ root, records });
  for (const [key, still] of Object.entries(stills)) if (still) filmed.add(resolveTankId(key, schema));
  for (const [key, still] of Object.entries(stills)) {
    // (a take is keyed in its scene's id schema; a render entry, null, names a current id)
    const id = still === null ? key : resolveTankId(key, schema);
    if (only && !only.includes(id)) continue;
    const want = wantedCard(id, cardFrame, filmed);
    const target = join(dir, `${id}-card.jpg`);
    const exists = existsSync(target);
    const state = cardState(records[id], want, exists);
    /** This run leaves the card as it is: a published one stays published, listed apart from the tanks with no card. */
    const leave = (why) => (state === 'published' ? kept : skipped).push(`${id}: ${why}`);
    let source, digest, due;
    if (want.source === 'render') {
      if (!TANK_SPECS[id]) { leave('not a tank'); continue; }
      const layer = heroLayer(id, root);
      if (!existsSync(layer)) throw new Error(`${id}: its render card needs its hero card layer, and ${layer} is missing (node tools/genHeroCards.mjs --ids=${id}, then hero-cards-compose.mjs ship)`);
      digest = digestOf(layer);
      due = cardDue(records[id], { ...want, digest }, { force, exists });
      if (!due) { upToDate.push(id); continue; }
      source = await composeRender(id, join(frameDir, `tank-card-${id}-render.png`), root);
    } else {
      if (!TANK_SPECS[id] || !still || !existsSync(still)) { leave('no still'); continue; }
      const film = join(dirname(still), `${basename(dirname(still))}.mp4`);
      const from = want.source === 'film' ? film : still;
      if (!existsSync(from)) { leave(`no film for its frame at ${want.frame} s`); continue; }
      digest = digestOf(from);
      due = cardDue(records[id], { ...want, digest }, { force, exists });
      if (!due) { upToDate.push(id); continue; }
      source = still;
      if (want.source === 'film') {
        source = join(frameDir, `tank-card-${id}.jpg`);
        // never read a frame an earlier run left: a seek past the film's end writes nothing
        rmSync(source, { force: true });
        frameAt(film, want.frame, source);
        if (!existsSync(source)) { leave(`its film has no frame at ${want.frame} s (${DUE_TEXT[due]})`); continue; }
      }
    }
    const read = await readSource(source);
    // (a render card has no darkness bar: its ground is the cards' own dark by design, and the tank layer is lit)
    if (want.source !== 'render' && read.luma < 0.12) {
      leave(`source too dark (${read.luma.toFixed(2)}); ${state === 'published' ? 'kept the older card, from the source wanted'
        : state === 'stale' ? 'its older card stays unpublished (not from the source wanted)' : 'the link keeps the Gallery\'s card'}`);
      continue;
    }
    // the card whole or not at all, then its record: a run killed between them leaves the card due, never a stale one published
    writeFileAtomic(target, await render(id, source, read));
    records[id] = { ...want, digest };
    saveRecords(records);
    wrote.push(id);
    log(`wrote ${TANK_CARD_DIR}/${id}-card.jpg from its ${want.source}${want.source === 'film' ? ` at ${want.frame} s` : ''} (${DUE_TEXT[due]}; ${read.tr < read.tl ? 'tr' : 'tl'})`);
  }
  if (upToDate.length) log(`up to date (${upToDate.length}): ${upToDate.join(', ')}`);
  if (kept.length) log(`kept published, its source unusable (${kept.length}): ${kept.join('; ')}`);
  if (skipped.length) log(`no card: ${skipped.join('; ')}`);
  return { wrote, upToDate, kept, skipped };
}

/** renderDue with the real card design and master filter; the browser starts at the first due card. */
async function renderCards(stills, only) {
  const { cardHtml } = await import('../marketing-shots/generate-og-images.mjs');
  const { launchGuardedBrowser } = await import('../browser-launch.mjs');
  const { filterPublishedImage, masterFilter } = await import('./master-filter.mjs');
  const puppeteer = (await import('puppeteer')).default;
  const filter = masterFilter();
  // a take's still is graded through the master filter; a render card (first-party procedural pixels) goes through it
  // when one is configured and is published as rendered otherwise
  if (!filter && Object.values(stills).some(Boolean)) throw new Error('no master filter (set COT_MASTER_FILTER)');
  const index = JSON.parse(readFileSync(join(ROOT, 'public/media/site50-r14/fleet/index.json'), 'utf8'));
  let browser = null, page = null;
  const render = async (id, source, read) => {
    if (!page) {
      browser = await launchGuardedBrowser(puppeteer, { headless: 'new', args: ['--js-flags=--max-old-space-size=3072', '--no-sandbox', '--disable-dev-shm-usage'] });
      page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    }
    const mime = source.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const data = `data:${mime};base64,${readFileSync(source).toString('base64')}`;
    await page.setContent(cardHtml(tankDisplayName(TANK_SPECS[id]), data, '50% 50%', read.tr < read.tl ? 'tr' : 'tl', 'en'), { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.load('700 76px "Chakra Petch"');
      await Promise.all([...document.images].map((image) => image.decode()));
    });
    const shot = await page.screenshot({ type: 'jpeg', quality: 84 });
    return filterPublishedImage(Buffer.from(shot), `og-tank-${id}`, { type: 'image/jpeg', quality: 84 });
  };
  try {
    await renderDue({ stills, only, force: process.argv.includes('--force'), schema: index.tankIdSchema, render });
  } finally {
    if (browser) await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reportStale = (stale = staleCards()) => {
    for (const { id, due, want } of stale) {
      console.log(`tank-share: ${id}'s card is unpublished: ${DUE_TEXT[due]} (wanted from its ${want.source}${want.source === 'film' ? ` at ${want.frame} s` : ''}; `
        + `node tools/media-r5/tank-share.mjs --cards=<stills.json> --only=${id})`);
    }
  };
  if (process.argv.includes('--check')) {
    const check = checkShare();
    reportStale(check.stale);
    console.log(check.current ? 'tank-share: the table is current' : 'tank-share: src/presentation/tankShare.json is stale (node tools/media-r5/tank-share.mjs)');
    if (check.stale.length) console.log(`tank-share: ${check.stale.length} card(s) on disk stay unpublished until rendered again (above)`);
    process.exit(check.code);
  }
  const stillsFile = arg('cards');
  const stills = stillsFile ? JSON.parse(readFileSync(stillsFile, 'utf8')) : {};
  // --render: every visible tank with no card cut from a take gets its render card (the hero card layer in the share design)
  if (process.argv.includes('--render')) {
    const filmed = filmedIds();
    for (const id of VISIBLE_TANK_IDS) if (!filmed.has(id) && CARD_FRAME[id] === undefined && !(id in stills)) stills[id] = null;
  }
  if (Object.keys(stills).length) await renderCards(stills, arg('only')?.split(','));
  writeFileAtomic(TABLE, tableText());
  reportStale();
  const table = tankShareTable();
  console.log(`tank-share: ${Object.keys(table.tanks).length} tanks, ${Object.values(table.tanks).filter((t) => t.card).length} with a card`);
  process.exit(0);
}
