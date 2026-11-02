// Deterministic 1200x630 social cards composed from approved in-engine captures (og-r2, the owner 2026-11-01: "we need
// better og images and og videos, for cot.kevinliu.studio and all its associatd links").
// A card is its page's own shot, full-bleed and at its own brightness, with one text block in a quiet top corner: the
// owner-approved lockup (the commander mark and the outlined wordmark, public/brand/lockup.svg, tools/brand-marks.mjs)
// over the page's title, set large enough to read where a share shows the card a third of its size (a phone timeline,
// ~340 px wide: the 76 px title keeps a 22 px cap). A scrim darkens only that corner. The game and the home page are
// the brand's own cards: the lockup alone, larger. The text never stands on the hero tank: each row names the corner
// its shot leaves clear (tl or tr), and og-images.selftest finds the lockup in that corner of the shipped card.
// Each page's shot is the one it opens on (its banner take's poster, or a frame of its share clip, `<clip>.mp4#t=<s>`),
// so the card, the clip a share plays and the page itself show one take.
// Every labelled card is rendered twice: public/brand/og-r2/<id>.jpg for the English page and public/brand/og-r2/zh/<id>.jpg,
// the same picture with the title in the zh-CN catalog's words, for its /cn twin (src/presentation/localizedHtml.ts). The
// brand cards carry no words and serve both. The directory is new per design round so a platform that caches a card
// by URL (X for about 7 days) fetches the new one.
// Preview a subset with --only=game,home,docs-models before regenerating all.
import { launchGuardedBrowser } from '../browser-launch.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { filterPublishedImage, masterFilter } from '../media-r5/master-filter.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const OG_DIR = 'public/brand/og-r2';
const LOCKUP = join(ROOT, 'public/brand/lockup.svg');

// [id, title (English, '' for a brand card), source, focus (object-position), corner (tl | tr)]
export const OG_IMAGE_CARDS = [
  ['game', '', 'public/media/versus-r1/f6-leo2a6-steinburg-r6-3840.webp', '50% 50%', 'tr'],
  ['home', '', 'public/media/home-r2/vs03-reservoir-k2-vt4a1-1280.mp4#t=0.5', '50% 50%', 'tl'],
  ['gallery', 'Tank Gallery', 'public/media/home-r2/fleet-montage.mp4#t=3', '50% 50%', 'tr'],
  ['studio', 'Scene Studio', 'public/media/site50-r14/loops/s33-water-tower.jpg', '50% 50%', 'tl'],
  ['private-room', 'Private battle', 'public/media/versus-r1/vs01-desert-abrams-t90m-r6-3840.webp', '50% 50%', 'tl'],
  ['docs', 'Technical field manual', 'public/media/docs-r1/banner-2560.webp', '75% 50%', 'tl'],
  ['docs-modes', 'Game modes', 'public/media/site50-r14/loops/s21-fields-assault.jpg', '50% 50%', 'tl'],
  ['docs-controls', 'Controls & Watch mode', 'public/media/site50-r14/loops/s26-minaret-fire.jpg', '50% 50%', 'tl'],
  ['docs-start', 'Your first battle', 'public/media/docs-hero-r2/frontier-t90m-leo2a6.jpg', '50% 50%', 'tl'],
  ['docs-tanks', 'Tanks & equipment', 'public/media/site50-r14/loops/s05-barn-advance.jpg', '50% 50%', 'tl'],
  ['docs-fleet', 'Every tank', 'public/media/site50-r14/loops/s227-oasis-duel.jpg', '50% 50%', 'tl'],
  ['docs-combat', 'Armour, angling & spotting', 'public/media/site50-r14/loops/s29-fjord-road-kill.jpg', '50% 50%', 'tl'],
  ['docs-battlefields', 'Battlefields', 'public/maps/fjord.webp', '50% 50%', 'tl'],
  ['docs-build', 'How the game was built', 'public/media/site50-r14/loops/s23-village-crossroads.jpg', '50% 50%', 'tl'],
  ['docs-models', 'Procedural model pipeline', 'public/media/docs-hero-r2/verdant-challenger3-t80u.jpg', '50% 50%', 'tl'],
  ['docs-simulation', 'Simulation & authority', 'public/media/site50-r14/loops/s226-church-duel.jpg', '50% 50%', 'tl'],
  ['docs-rendering', 'Rendering & performance', 'public/media/site50-r14/loops/s20-road-return-fire.jpg', '50% 50%', 'tl'],
  ['docs-ai', 'Bots & tactical AI', 'public/media/site50-r14/loops/s04-column-under-fire.jpg', '50% 50%', 'tl'],
  ['docs-multiplayer', 'Multiplayer', 'public/media/site50-r14/loops/s18-street-knockout.jpg', '50% 50%', 'tl'],
  ['docs-audio', 'Sound & radio', 'public/media/site50-r14/loops/s01-main-street-push.jpg', '50% 50%', 'tl'],
  ['docs-studio', 'Scene Studio', 'public/media/site50-r14/loops/s33-water-tower.jpg', '50% 50%', 'tl'],
  ['docs-filming', 'Filming the media', 'public/media/site50-r14/loops/s07-lake-shellfire.jpg', '50% 50%', 'tl'],
  ['404', 'Route not found', 'public/media/versus-r1/vs08-winter-cv90-bmp3-r7-3840.webp', '50% 50%', 'tl'],
];

// The /cn pages' titles: each page's own words in the zh-CN catalog (its heading, nav label or title), so a card never
// says something its page does not.
const ZH = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.zh-CN.json'), 'utf8'));
// a page title's own words, without the site's name after it (' — ' or ' · ')
const zhTitle = (key) => ZH[key].split(/ — | · /)[0];
const zhTopic = (topic) => ZH[`docs.topic.${topic}.label`];
export const OG_ZH_LABELS = Object.freeze({
  gallery: ZH['gallery.archive.h1'],
  studio: ZH['studio.title'],
  'private-room': ZH['playMenu.private.title'],
  docs: zhTitle('metadata.docs.title'),
  ...Object.fromEntries(['modes', 'battlefields', 'combat', 'tanks', 'fleet', 'start', 'controls', 'build', 'models', 'simulation', 'rendering', 'ai',
    'multiplayer', 'audio', 'studio', 'filming'].map((topic) => [`docs-${topic}`, zhTopic(topic)])),
  404: zhTitle('notFound.metaTitle'),
});
/** A card's file: the zh twin for a /cn page when the card carries words, else the one card. */
export const ogCardPath = (id, locale = 'en') => {
  const titled = OG_IMAGE_CARDS.find(([card]) => card === id)?.[1];
  return `${OG_DIR}/${locale === 'zh' && titled ? 'zh/' : ''}${id}.jpg`;
};

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const asDataUrl = (path, mime) => `data:${mime};base64,${readFileSync(path).toString('base64')}`;
const MIME = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

/** A source as a data URL: a still as it is, a clip's frame (`<clip>.mp4#t=<s>`) through ffmpeg. */
export function sourceDataUrl(source) {
  const [file, at] = source.split('#t=');
  if (!at) return asDataUrl(join(ROOT, file), MIME[file.split('.').pop()]);
  const dir = mkdtempSync(join(tmpdir(), 'og-frame-'));
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', at, '-i', join(ROOT, file), '-frames:v', '1', join(dir, 'frame.png')]);
    return asDataUrl(join(dir, 'frame.png'), 'image/png');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The title's size and the lockup's: the numbers og-images.selftest holds the cards to. */
export const OG_TYPE = Object.freeze({ title: 76, titleZh: 80, lockup: 60, brandLockup: 116, inset: 64, top: 58 });

export function cardHtml(title, image, focus, corner, lang = 'en') {
  const right = corner === 'tr', brand = !title, { inset, top } = OG_TYPE;
  const lockup = asDataUrl(LOCKUP, 'image/svg+xml');
  const font = asDataUrl(join(ROOT, 'public/fonts/chakra-petch/ChakraPetch-Bold-Latin.woff2'), 'font/woff2');
  return `<!doctype html><html><head><style>
    @font-face{font-family:'Chakra Petch';src:url(${font}) format('woff2');font-weight:650 1000;font-display:block}
    *{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#05080b}
    .hero{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${focus};filter:contrast(1.04) saturate(1.06)}
    .scrim{position:absolute;inset:0;background:radial-gradient(ellipse 62% 70% at ${right ? '100%' : '0%'} 0%,rgba(3,7,10,.78) 0%,rgba(3,7,10,.5) 38%,rgba(3,7,10,0) 72%)}
    .block{position:absolute;top:${top}px;${right ? 'right' : 'left'}:${inset}px;display:flex;flex-direction:column;align-items:${right ? 'flex-end' : 'flex-start'};gap:${brand ? 0 : 22}px;max-width:640px}
    .lockup{height:${brand ? OG_TYPE.brandLockup : OG_TYPE.lockup}px;width:auto;filter:drop-shadow(0 2px 14px rgba(0,0,0,.55))}
    h1{margin:0;color:#fff;font:700 ${OG_TYPE.title}px/.94 'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.005em;text-align:${right ? 'right' : 'left'};text-shadow:0 2px 22px rgba(0,0,0,.55);text-wrap:balance}
    h1:lang(zh){font:600 ${OG_TYPE.titleZh}px/1.08 'PingFang SC','Hiragino Sans GB','Noto Sans CJK SC','Microsoft YaHei',sans-serif;letter-spacing:.04em;word-break:keep-all;line-break:strict}
  </style></head><body lang="${lang}"><img class="hero" src="${image}"><div class="scrim"></div>
    <div class="block"><img class="lockup" src="${lockup}" alt="Claude of Tanks">${title ? `<h1>${escapeHtml(title)}</h1>` : ''}</div>
  </body></html>`;
}

async function generateOgImages(cards = OG_IMAGE_CARDS) {
  mkdirSync(join(ROOT, OG_DIR, 'zh'), { recursive: true });
  const browser = await launchGuardedBrowser(puppeteer, {
    headless: 'new',
    // (the capture-browser rule, 2026-10-23: every capture browser runs with a 3 GB JavaScript heap)
    args: ['--js-flags=--max-old-space-size=3072', '--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    for (const [name, title, source, focus, corner] of cards) {
      const image = sourceDataUrl(source);
      for (const [locale, words] of [['en', title], ...(title ? [['zh', OG_ZH_LABELS[name]]] : [])]) {
        if (words === undefined) throw new Error(`${name}: no ${locale} title`);
        await page.setContent(cardHtml(words, image, focus, corner, locale), { waitUntil: 'load' });
        await page.evaluate(async () => {
          // the titles' face: loaded outright, so a brand card still proves the face resolves
          await document.fonts.load('700 76px "Chakra Petch"');
          if (!document.fonts.check('700 76px "Chakra Petch"')) throw new Error('brand font failed to load');
          await Promise.all([...document.images].map((image) => image.decode()));
        });
        const target = join(ROOT, ogCardPath(name, locale));
        await page.screenshot({ path: target, type: 'jpeg', quality: 86, captureBeyondViewport: false });
        if (masterFilter()) {
          writeFileSync(target, await filterPublishedImage(readFileSync(target), `og-${locale}-${name}`, { type: 'image/jpeg', quality: 86 }));
        }
        console.log(`wrote ${target}`);
      }
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice(7).split(',');
  if (only?.some((name) => !OG_IMAGE_CARDS.some(([id]) => id === name))) throw new Error('unknown OG card in --only');
  await generateOgImages(only ? OG_IMAGE_CARDS.filter(([name]) => only.includes(name)) : OG_IMAGE_CARDS);
}
