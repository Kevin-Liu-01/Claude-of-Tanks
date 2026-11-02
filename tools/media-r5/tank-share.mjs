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
//        render the cards not yet rendered (all of them with --force) from the take stills (<stills.json>: { <vehicle>: <4K still path> }, the media lane's
//        deliveries), then write the table
//   node tools/media-r5/tank-share.mjs --check                  exit 1 when the table is stale
// Copyright © 2026 Kevin B. Liu.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../src/vehicles/tankFactory.ts';
import { TANK_SPECS, VISIBLE_TANK_IDS } from '../../src/vehicles/specs.ts';
import { tankDisplayName } from '../../src/vehicles/tankLabels.ts';
import { resolveTankId } from '../../src/vehicles/tankIdAliases.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TABLE = join(ROOT, 'src/presentation/tankShare.json');
export const TANK_CARD_DIR = 'brand/og-r2/tanks';
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
/** Takes whose 4K still does not show their tank clearly (the review of every rendered card, 2026-11-01): the card is a
 *  frame of the take's film where it does, at these seconds (the review of eight frames a take). */
export const CARD_FRAME = Object.freeze({
  challenger3_proto: 3.3, fv4034: 1.05, leo2a4_v: 2.55, leo2a6: 3.3, leo2a4_otco: 4.8, m1a1_abrams_hc: 1.05,
  m1a2_abrams_tusk: 1.05, sabra_mk2: 1.05, type10_tk_x: 5.55, type10: 1.05, type89: 4.05, ztz99_longwei: 1.05,
  t72b3m_hetman_ii: 4.8, udes03: 1.05,
});

/** The table as the fleet stands: each visible tank's display name, and its card's site path when one is rendered. */
export function tankShareTable() {
  const tanks = {};
  for (const id of [...VISIBLE_TANK_IDS].sort()) {
    const card = `${TANK_CARD_DIR}/${id}-card.jpg`;
    tanks[id] = { name: tankDisplayName(TANK_SPECS[id]), card: existsSync(join(ROOT, 'public', card)) ? `/${card}` : null };
  }
  return { schemaVersion: 1, tanks };
}
const tableText = () => `${JSON.stringify(tankShareTable(), null, 1)}\n`;

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

async function renderCards(stills, only) {
  const { cardHtml } = await import('../marketing-shots/generate-og-images.mjs');
  const { launchGuardedBrowser } = await import('../browser-launch.mjs');
  const { filterPublishedImage, masterFilter } = await import('./master-filter.mjs');
  const puppeteer = (await import('puppeteer')).default;
  const filter = masterFilter();
  if (!filter) throw new Error('no master filter (set COT_MASTER_FILTER)');
  mkdirSync(join(ROOT, 'public', TANK_CARD_DIR), { recursive: true });
  const index = JSON.parse(readFileSync(join(ROOT, 'public/media/site50-r14/fleet/index.json'), 'utf8'));
  const browser = await launchGuardedBrowser(puppeteer, { headless: 'new', args: ['--js-flags=--max-old-space-size=3072', '--no-sandbox', '--disable-dev-shm-usage'] });
  const skipped = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    for (const [key, still] of Object.entries(stills)) {
      const id = resolveTankId(key, index.tankIdSchema);
      if (only && !only.includes(id)) continue;
      // resumable: a card already rendered stays unless --force (the run is long; a laptop may sleep through it)
      if (!process.argv.includes('--force') && existsSync(join(ROOT, 'public', TANK_CARD_DIR, `${id}-card.jpg`))) continue;
      if (!TANK_SPECS[id] || !still || !existsSync(still)) { skipped.push(`${id}: no still`); continue; }
      // a chosen frame of the take's film (CARD_FRAME), else its 4K still
      const film = join(dirname(still), `${basename(dirname(still))}.mp4`);
      const source = CARD_FRAME[id] === undefined ? still : join(tmpdir(), `tank-card-${id}.jpg`);
      if (source !== still) {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(CARD_FRAME[id]), '-i', film, '-frames:v', '1', '-q:v', '2', source]);
      }
      const read = await readStill(source);
      // a broken delivery (a black frame) is no card: the link keeps the Gallery's until the take is filmed again
      if (read.luma < 0.12) { skipped.push(`${id}: still too dark (${read.luma.toFixed(2)})`); continue; }
      const mime = source.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const data = `data:${mime};base64,${readFileSync(source).toString('base64')}`;
      await page.setContent(cardHtml(tankDisplayName(TANK_SPECS[id]), data, '50% 50%', read.tr < read.tl ? 'tr' : 'tl', 'en'), { waitUntil: 'load' });
      await page.evaluate(async () => {
        await document.fonts.load('700 76px "Chakra Petch"');
        await Promise.all([...document.images].map((image) => image.decode()));
      });
      const target = join(ROOT, 'public', TANK_CARD_DIR, `${id}-card.jpg`);
      const shot = await page.screenshot({ type: 'jpeg', quality: 84 });
      writeFileSync(target, await filterPublishedImage(Buffer.from(shot), `og-tank-${id}`, { type: 'image/jpeg', quality: 84 }));
      console.log(`wrote ${TANK_CARD_DIR}/${id}-card.jpg (${read.tr < read.tl ? 'tr' : 'tl'})`);
    }
  } finally {
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
  }
  if (skipped.length) console.log(`no card: ${skipped.join('; ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const current = existsSync(TABLE) && readFileSync(TABLE, 'utf8') === tableText();
    console.log(current ? 'tank-share: the table is current' : 'tank-share: src/presentation/tankShare.json is stale (node tools/media-r5/tank-share.mjs)');
    process.exit(current ? 0 : 1);
  }
  const stills = arg('cards');
  if (stills) await renderCards(JSON.parse(readFileSync(stills, 'utf8')), arg('only')?.split(','));
  writeFileSync(TABLE, tableText());
  const table = tankShareTable();
  console.log(`tank-share: ${Object.keys(table.tanks).length} tanks, ${Object.values(table.tanks).filter((t) => t.card).length} with a card`);
  process.exit(0);
}
