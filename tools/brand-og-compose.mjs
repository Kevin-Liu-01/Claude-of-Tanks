// og-logo.png composer (brand agent): 1200x630 boot-splash-style dark
// radial backdrop + faint warm ground glow + logo-full.svg centered.
// Usage: node tools/brand-og-compose.mjs public/brand/logo-full.svg public/brand/og-logo.png
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , svgPath, outPath] = process.argv;
const svgText = readFileSync(resolve(svgPath), 'utf8');
const svgUri = `data:image/svg+xml;base64,${Buffer.from(svgText).toString('base64')}`;

const browser = await puppeteer.launch({ headless: 'shell' });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><body style="margin:0"><div id="card" style="
  width:1200px;height:630px;position:relative;overflow:hidden;
  background:
    radial-gradient(90% 60% at 50% 108%, rgba(240,160,48,.14) 0%, rgba(240,160,48,0) 60%),
    radial-gradient(118% 82% at 50% 22%, #16202b 0%, #0b1117 42%, #05080b 78%);
  display:flex;align-items:center;justify-content:center">
  <img id="lg" style="width:960px;display:block" />
</div><script>
  const i = document.getElementById('lg');
  i.onload = () => { setTimeout(() => { document.title = 'ready'; }, 120); };
  i.src = ${JSON.stringify(svgUri)};
</script></body></html>`);
await page.waitForFunction(() => document.title === 'ready', { timeout: 15000 });
const el = await page.$('#card');
await el.screenshot({ path: resolve(outPath) });
await browser.close();
console.log(`og -> ${outPath}`);
