// Deterministic 1200x630 social cards composed from approved in-engine captures.
// The default game card and every route companion share the owner-approved
// bottom-left Monument Grotesk lockup, rendered from the current crest master.
// Preview a subset with --only=game,home,docs-models before regenerating all.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = join(ROOT, 'public/brand/og');
const LOGO = join(ROOT, 'public/brand/logo-mark.svg');

export const OG_IMAGE_CARDS = [
  ['game', '', 'public/media/featured/f7_studio_t90_column_fire.webp', '50% 38%'],
  ['home', 'HOME', 'public/media/showcase-r1/87_action_verdant_column_massacre.webp', '50% 48%'],
  ['gallery', 'TANK GALLERY', 'public/media/showcase-r2/11_gallery_hero.webp', '50% 48%'],
  ['studio', 'SCENE STUDIO', 'public/media/showcase-r2/15_studio_workspace.webp', '50% 50%'],
  ['private-room', 'PRIVATE BATTLE', 'public/media/multiplayer-r1/dual-perspective.webp', '50% 50%'],
  ['docs', 'TECHNICAL FIELD MANUAL', 'public/media/presentation-r1/12_urban_crossfire_x.webp', '50% 52%'],
  ['docs-build', 'BUILD WORKFLOW', 'public/media/showcase-r2/17_live_player_hud.webp', '50% 48%'],
  ['docs-models', 'MODEL & ICON PIPELINE', 'public/media/showcase-r2/12_gallery_armor.webp', '50% 48%'],
  ['docs-simulation', 'COMBAT SIMULATION', 'public/media/showcase-r2/24_live_killcam_impact.webp', '50% 46%'],
  ['docs-vehicles', 'VEHICLES & RUNNING GEAR', 'public/media/showcase-r1/118_foreground_verdant_meadow_duel.webp', '50% 50%'],
  ['docs-rendering', 'RENDERING & LIGHTING', 'public/media/showcase-r1/101_foreground_urban_street_duel.webp', '50% 48%'],
  ['docs-performance', 'PERFORMANCE ENGINEERING', 'public/media/showcase-r2/18_live_spectator.webp', '50% 46%'],
  ['docs-worlds', 'BATTLEFIELDS & DESTRUCTION', 'public/media/showcase-r1/110_foreground_desert_wadi_gauntlet.webp', '50% 48%'],
  ['docs-ai', 'BOTS & TACTICAL AI', 'public/media/showcase-r1/120_foreground_verdant_overwatch_ridge.webp', '50% 50%'],
  ['docs-multiplayer', 'MULTIPLAYER ARCHITECTURE', 'public/media/multiplayer-r1/dual-perspective.webp', '50% 50%'],
  ['docs-audio', 'AUDIO & BATTLEFIELD FX', 'public/media/showcase-r1/86_action_coastal_harbor_kill.webp', '50% 48%'],
  ['docs-interface', 'INTERFACE & CONTROLS', 'public/media/showcase-r2/19_live_sniper.webp', '50% 50%'],
  ['docs-studio', 'SCENE STUDIO & CAPTURE', 'public/media/showcase-r2/15_studio_workspace.webp', '50% 50%'],
];

function asDataUrl(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

export function cardHtml(label, source, position, fit = 'cover') {
  const image = asDataUrl(join(ROOT, source), 'image/webp');
  const logo = asDataUrl(LOGO, 'image/svg+xml');
  const font = asDataUrl(join(ROOT, 'public/fonts/abc-monument-grotesk/ABCMonumentGrotesk-Bold.woff2'), 'font/woff2');
  const contain = fit === 'contain';
  return `<!doctype html><html><head><style>
    @font-face{font-family:'ABC Monument Grotesk';src:url(${font}) format('woff2');font-weight:700 900;font-display:block}
    *{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#071018}
    .card,.backdrop,.hero,.shade,.grain{position:absolute;inset:0}
    .backdrop{width:100%;height:100%;object-fit:cover;object-position:${position};filter:blur(${contain ? 18 : 0}px) saturate(.88) brightness(.6);transform:scale(${contain ? 1.08 : 1})}
    .hero{width:100%;height:100%;object-fit:${contain ? 'contain' : 'cover'};object-position:${position};filter:saturate(.96) contrast(1.04) brightness(.9)}
    .shade{background:linear-gradient(180deg,rgba(3,9,14,.46) 0%,rgba(3,9,14,.03) 42%,rgba(3,9,14,.18) 59%,rgba(3,9,14,.94) 100%),linear-gradient(90deg,rgba(3,9,14,.38),transparent 52%,rgba(3,9,14,.16))}
    .grain{opacity:.13;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E");mix-blend-mode:soft-light}
    .rule{position:absolute;top:42px;right:48px;width:92px;height:3px;background:#f5a623;box-shadow:0 0 18px rgba(245,166,35,.28)}
    .label{position:absolute;top:57px;right:48px;color:#f4f7f9;font:700 15px/1 Arial,sans-serif;letter-spacing:3.3px;text-shadow:0 2px 7px #000;text-align:right}
    .lockup{position:absolute;left:64px;bottom:46px;display:flex;align-items:center;gap:20px;font-family:'ABC Monument Grotesk',sans-serif}
    .crest{width:150px;height:150px;flex:none;object-fit:contain;filter:drop-shadow(0 6px 26px rgba(0,0,0,.65))}
    .wordmark{font-weight:800;font-size:64px;letter-spacing:.10em;color:#f2f7fb;line-height:1;text-shadow:0 2px 24px rgba(0,0,0,.8)}
    .wordmark-subtitle{margin-top:0;font-weight:700;font-size:25px;letter-spacing:.30em;color:#f0a030}
    .edge{position:absolute;inset:14px;border:1px solid rgba(189,207,218,.2)}
    .game .backdrop,.game .grain,.game .edge{display:none}
    .game .hero{filter:none}
    .game .shade{background:linear-gradient(0deg,rgba(5,8,11,.82) 0%,rgba(5,8,11,.42) 24%,rgba(5,8,11,0) 48%)}
  </style></head><body><div class="card${label ? '' : ' game'}">
    <img class="backdrop" src="${image}"><img class="hero" src="${image}">
    <div class="shade"></div><div class="grain"></div><div class="edge"></div>
    ${label ? `<div class="rule"></div><div class="label">${label}</div>` : ''}
    <div class="lockup" aria-label="Claude of Tanks">
      <img class="crest" src="${logo}" alt="">
      <div><div class="wordmark">CLAUDE</div><div class="wordmark-subtitle">OF TANKS</div></div>
    </div>
  </div></body></html>`;
}

export async function generateOgImages(cards = OG_IMAGE_CARDS) {
  mkdirSync(OUTPUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

    for (const [name, label, source, position, fit = 'cover'] of cards) {
      await page.setContent(cardHtml(label, source, position, fit), { waitUntil: 'load' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        if (!document.fonts.check('800 64px "ABC Monument Grotesk"')) throw new Error('brand font failed to load');
        await Promise.all([...document.images].map((image) => image.complete
          ? (image.naturalWidth ? Promise.resolve() : Promise.reject(new Error('image failed to decode')))
          : new Promise((resolveImage, rejectImage) => {
              image.addEventListener('load', resolveImage, { once: true });
              image.addEventListener('error', rejectImage, { once: true });
            })));
      });
      const target = name === 'game' ? join(ROOT, 'public/brand/og-image.png') : join(OUTPUT, `${name}.jpg`);
      const format = name === 'game' ? { type: 'png' } : { type: 'jpeg', quality: 88 };
      await page.screenshot({ path: target, ...format, captureBeyondViewport: false });
      console.log(`wrote ${target}`);
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
