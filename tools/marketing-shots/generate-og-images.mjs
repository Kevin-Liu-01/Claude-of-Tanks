// Deterministic 1200x630 social cards composed from approved in-engine captures.
// The default /brand/og-image.png remains the canonical game card; this tool
// creates route-specific companions with the same bottom-left brand lockup.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = join(ROOT, 'public/brand/og');
const LOGO = join(ROOT, 'public/brand/logo-full.svg');

export const OG_IMAGE_CARDS = [
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

function cardHtml(label, source, position, fit) {
  const image = asDataUrl(join(ROOT, source), 'image/webp');
  const logo = asDataUrl(LOGO, 'image/svg+xml');
  const contain = fit === 'contain';
  return `<!doctype html><html><head><style>
    *{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#071018}
    .card,.backdrop,.hero,.shade,.grain{position:absolute;inset:0}
    .backdrop{width:100%;height:100%;object-fit:cover;object-position:${position};filter:blur(${contain ? 18 : 0}px) saturate(.88) brightness(.6);transform:scale(${contain ? 1.08 : 1})}
    .hero{width:100%;height:100%;object-fit:${contain ? 'contain' : 'cover'};object-position:${position};filter:saturate(.96) contrast(1.04) brightness(.9)}
    .shade{background:linear-gradient(180deg,rgba(3,9,14,.46) 0%,rgba(3,9,14,.03) 42%,rgba(3,9,14,.18) 59%,rgba(3,9,14,.94) 100%),linear-gradient(90deg,rgba(3,9,14,.38),transparent 52%,rgba(3,9,14,.16))}
    .grain{opacity:.13;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E");mix-blend-mode:soft-light}
    .rule{position:absolute;top:42px;right:48px;width:92px;height:3px;background:#f5a623;box-shadow:0 0 18px rgba(245,166,35,.28)}
    .label{position:absolute;top:57px;right:48px;color:#f4f7f9;font:700 15px/1 Arial,sans-serif;letter-spacing:3.3px;text-shadow:0 2px 7px #000;text-align:right}
    .logo{position:absolute;left:42px;bottom:21px;width:350px;height:auto;filter:drop-shadow(0 3px 10px rgba(0,0,0,.78))}
    .edge{position:absolute;inset:14px;border:1px solid rgba(189,207,218,.2)}
  </style></head><body><div class="card">
    <img class="backdrop" src="${image}"><img class="hero" src="${image}">
    <div class="shade"></div><div class="grain"></div><div class="edge"></div>
    <div class="rule"></div><div class="label">${label}</div><img class="logo" src="${logo}">
  </div></body></html>`;
}

mkdirSync(OUTPUT, { recursive: true });
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

for (const [name, label, source, position, fit = 'cover'] of OG_IMAGE_CARDS) {
  await page.setContent(cardHtml(label, source, position, fit), { waitUntil: 'load' });
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((image) => image.complete
      ? (image.naturalWidth ? Promise.resolve() : Promise.reject(new Error('image failed to decode')))
      : new Promise((resolveImage, rejectImage) => {
          image.addEventListener('load', resolveImage, { once: true });
          image.addEventListener('error', rejectImage, { once: true });
        })));
  });
  const target = join(OUTPUT, `${name}.jpg`);
  await page.screenshot({ path: target, type: 'jpeg', quality: 88, captureBeyondViewport: false });
  console.log(`wrote ${target}`);
}

await page.close();
await browser.close();
