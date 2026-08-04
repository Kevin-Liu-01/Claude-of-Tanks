// og-image.png composer (brand v4.6): 1200x630 OG key art — the T-90 column
// owner shot + lower-third scrim + the crest mark + CLAUDE / OF TANKS
// wordmark in ABC Monument Grotesk (fonts r4 tracking: .10em / .30em).
// Usage: node tools/brand-og-image-compose.mjs
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const b64 = (p, mime) => `data:${mime};base64,${readFileSync(resolve(p)).toString('base64')}`;
const shot = b64('public/media/featured/f7_studio_t90_column_fire.webp', 'image/webp');
const crest = b64('public/brand/logo-mark.svg', 'image/svg+xml');
const fMed = b64('public/fonts/abc-monument-grotesk/ABCMonumentGrotesk-Medium.woff2', 'font/woff2');
const fBold = b64('public/fonts/abc-monument-grotesk/ABCMonumentGrotesk-Bold.woff2', 'font/woff2');

const browser = await puppeteer.launch({ headless: 'shell' });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>
  @font-face { font-family: 'ABC Monument Grotesk'; src: url(${fMed}) format('woff2'); font-weight: 500 600; }
  @font-face { font-family: 'ABC Monument Grotesk'; src: url(${fBold}) format('woff2'); font-weight: 700 900; }
  * { margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; position: relative;
    font-family: 'ABC Monument Grotesk', sans-serif; background: #05080b; }
  img.bg { position: absolute; inset: 0; width: 1200px; height: 630px; object-fit: cover; object-position: 50% 38%; }
  .scrim { position: absolute; inset: 0;
    background: linear-gradient(0deg, rgba(5,8,11,.82) 0%, rgba(5,8,11,.42) 24%, rgba(5,8,11,0) 48%); }
  .lockup { position: absolute; left: 64px; bottom: 46px; display: flex; align-items: center; gap: 34px; }
  .lockup img { width: 150px; height: 150px; filter: drop-shadow(0 6px 26px rgba(0,0,0,.65)); }
  .l1 { font-weight: 800; font-size: 64px; letter-spacing: .10em; color: #f2f7fb; line-height: 1;
    text-shadow: 0 2px 24px rgba(0,0,0,.8); }
  .l2 { margin-top: 12px; font-weight: 700; font-size: 25px; letter-spacing: .30em; color: #f0a030; }
</style></head><body>
  <img class="bg" src="${shot}">
  <div class="scrim"></div>
  <div class="lockup">
    <img src="${crest}">
    <div><div class="l1">CLAUDE</div><div class="l2">OF TANKS</div></div>
  </div>
</body></html>`, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: resolve('public/brand/og-image.png') });
await browser.close();
console.log('og-image -> public/brand/og-image.png');
