#!/usr/bin/env node
// The Tank Gallery's per-tank share cards (og-r2, the owner 2026-11-01: "we need better og images and og videos, for
// cot.kevinliu.studio and all its associatd links"). A link to one tank, /gallery?id=<id> or its /cn twin, shares that
// tank's name and, when the media lane has filmed its take, a card of that take (<id>-card.jpg: a file named by a bare
// tank id reads to test:recommend as a change to that tank, tools/test-diff.mjs): the take's 4K still under the share
// cards' design (tools/marketing-shots/generate-og-images.mjs cardHtml) with the tank's name for its title, in the
// quieter of the two top corners, through the master filter. middleware.ts answers such a link from
// src/presentation/tankShare.json through src/presentation/tankShareMeta.ts, so a plain Gallery visit loads nothing more.
//   node tools/media-r5/tank-share.mjs                          write the table: every visible tank's name, and its card
//   node tools/media-r5/tank-share.mjs --cards=<stills.json> [--only=a,b] [--force]
//        render the cards that are due (all of them with --force) from the take stills (<stills.json>: { <vehicle>: <4K still path> }, the media lane's
//        deliveries), then write the table
//   node tools/media-r5/tank-share.mjs --check                  exit 1 when the table is stale
//
// A card's state is its file plus its provenance (round 8 Y9 s6-08, 2026-11-08): tools/media-r5/tank-cards.json records
// what each card was rendered from ({ source: 'still' } or { source: 'film', frame }, and the source file's digest).
// cardState is the one classifier: no file is 'none'; a file whose record is the card CARD_FRAME wants (the same source
// and frame) is 'published'; any other file, or one with no record, is 'stale' and stays out of the table. renderDue is
// the one writer: it renders a card that is missing, stale, forced, or whose source file changed (cardDue), prints every
// card it renders and every one it leaves, writes the card whole or not at all, then its record. So a CARD_FRAME edit
// fails --check until the card is rendered again, instead of passing with the old card published (268 dropped REFILM's
// gate, and the renderer kept any existing file).
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
const TABLE = join(ROOT, 'src/presentation/tankShare.json');
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

/** The card a tank should have: a frame of its take's film at CARD_FRAME[id] s, else its 4K still. */
export const wantedCard = (id, cardFrame = CARD_FRAME) =>
  (cardFrame[id] === undefined ? { source: 'still' } : { source: 'film', frame: cardFrame[id] });

/** A card's states: 'none' (no file), 'published' (its record is the wanted card), 'stale' (any other file). */
export const CARD_STATES = Object.freeze(['none', 'stale', 'published']);
export function cardState(record, want, exists) {
  if (!exists) return 'none';
  const same = !!record && record.source === want.source && (want.source !== 'film' || record.frame === want.frame);
  return same ? 'published' : 'stale';
}

/**
 * Why a card is due for a render ('missing' | 'unrecorded' | 'source' | 'frame' | 'forced' | 'digest'), or null when it
 * is up to date. A digest counts only when the record and the wanted card both name one (the cards rendered before the
 * records were seeded without one).
 */
export function cardDue(record, want, { force = false, exists = true } = {}) {
  const state = cardState(record, want, exists);
  if (state === 'none') return 'missing';
  if (state === 'stale') return !record ? 'unrecorded' : record.source !== want.source ? 'source' : 'frame';
  if (force) return 'forced';
  if (record.digest && want.digest && record.digest !== want.digest) return 'digest';
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
export function tankShareTable({ root = ROOT, records = readCardRecords(root), cardFrame = CARD_FRAME } = {}) {
  const tanks = {};
  for (const id of [...VISIBLE_TANK_IDS].sort()) {
    const card = `${TANK_CARD_DIR}/${id}-card.jpg`;
    const state = cardState(records[id], wantedCard(id, cardFrame), existsSync(join(root, 'public', card)));
    tanks[id] = { name: tankDisplayName(TANK_SPECS[id]), card: state === 'published' ? `/${card}` : null };
  }
  return { schemaVersion: 1, tanks };
}
const tableText = () => `${JSON.stringify(tankShareTable(), null, 1)}\n`;

/** Visible tanks whose card file is stale (on disk, out of the table), with why. */
export function staleCards({ root = ROOT, records = readCardRecords(root), cardFrame = CARD_FRAME } = {}) {
  return [...VISIBLE_TANK_IDS].sort().flatMap((id) => {
    const want = wantedCard(id, cardFrame);
    const exists = existsSync(join(root, 'public', TANK_CARD_DIR, `${id}-card.jpg`));
    return cardState(records[id], want, exists) === 'stale' ? [{ id, due: cardDue(records[id], want, { exists }), want }] : [];
  });
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
};

/**
 * Render the due cards of `stills` ({ <vehicle>: <4K still path> }): for each, the wanted card (cardDue against its
 * record), its source (the still, or the film's frame at CARD_FRAME[id] s), and `render(id, source, read)`'s JPEG bytes,
 * written whole or not at all, then its record (saveRecords). A source too dark to be a card (a broken delivery) leaves
 * any older card as it is: still published when it is the card wanted, else still stale. Every card rendered and every
 * one left is printed. Returns { wrote, upToDate, skipped }.
 */
export async function renderDue({ stills, only = null, force = false, root = ROOT, records = readCardRecords(root), cardFrame = CARD_FRAME,
  schema, render, readSource = readStill, frameAt = filmFrame, digestOf = sourceDigest, frameDir = tmpdir(),
  saveRecords = (next) => writeFileAtomic(join(root, CARD_RECORDS), cardRecordsText(next)), log = console.log }) {
  const dir = join(root, 'public', TANK_CARD_DIR);
  mkdirSync(dir, { recursive: true });
  for (const name of sweepPartials(dir)) log(`removed a killed run's partial ${TANK_CARD_DIR}/${name}`);
  const wrote = [], upToDate = [], skipped = [];
  for (const [key, still] of Object.entries(stills)) {
    const id = resolveTankId(key, schema);
    if (only && !only.includes(id)) continue;
    if (!TANK_SPECS[id] || !still || !existsSync(still)) { skipped.push(`${id}: no still`); continue; }
    const want = wantedCard(id, cardFrame);
    const film = join(dirname(still), `${basename(dirname(still))}.mp4`);
    const from = want.source === 'film' ? film : still;
    if (!existsSync(from)) { skipped.push(`${id}: no film for its frame at ${want.frame} s`); continue; }
    const target = join(dir, `${id}-card.jpg`);
    const exists = existsSync(target);
    const digest = digestOf(from);
    const due = cardDue(records[id], { ...want, digest }, { force, exists });
    if (!due) { upToDate.push(id); continue; }
    let source = still;
    if (want.source === 'film') {
      source = join(frameDir, `tank-card-${id}.jpg`);
      // never read a frame an earlier run left: a seek past the film's end writes nothing
      rmSync(source, { force: true });
      frameAt(film, want.frame, source);
      if (!existsSync(source)) { skipped.push(`${id}: its film has no frame at ${want.frame} s (${DUE_TEXT[due]})`); continue; }
    }
    const read = await readSource(source);
    if (read.luma < 0.12) {
      const state = cardState(records[id], want, exists);
      skipped.push(`${id}: source too dark (${read.luma.toFixed(2)}); ${state === 'published' ? 'kept the older card, from the source wanted'
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
  if (skipped.length) log(`no card: ${skipped.join('; ')}`);
  return { wrote, upToDate, skipped };
}

/** renderDue with the real card design and master filter; the browser starts at the first due card. */
async function renderCards(stills, only) {
  const { cardHtml } = await import('../marketing-shots/generate-og-images.mjs');
  const { launchGuardedBrowser } = await import('../browser-launch.mjs');
  const { filterPublishedImage, masterFilter } = await import('./master-filter.mjs');
  const puppeteer = (await import('puppeteer')).default;
  const filter = masterFilter();
  if (!filter) throw new Error('no master filter (set COT_MASTER_FILTER)');
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
  const reportStale = () => {
    for (const { id, due, want } of staleCards()) {
      console.log(`tank-share: ${id}'s card is unpublished: ${DUE_TEXT[due]} (wanted from its ${want.source}${want.source === 'film' ? ` at ${want.frame} s` : ''}; `
        + `node tools/media-r5/tank-share.mjs --cards=<stills.json> --only=${id})`);
    }
  };
  if (process.argv.includes('--check')) {
    reportStale();
    const current = existsSync(TABLE) && readFileSync(TABLE, 'utf8') === tableText();
    console.log(current ? 'tank-share: the table is current' : 'tank-share: src/presentation/tankShare.json is stale (node tools/media-r5/tank-share.mjs)');
    process.exit(current ? 0 : 1);
  }
  const stills = arg('cards');
  if (stills) await renderCards(JSON.parse(readFileSync(stills, 'utf8')), arg('only')?.split(','));
  writeFileAtomic(TABLE, tableText());
  reportStale();
  const table = tankShareTable();
  console.log(`tank-share: ${Object.keys(table.tanks).length} tanks, ${Object.values(table.tanks).filter((t) => t.card).length} with a card`);
  process.exit(0);
}
