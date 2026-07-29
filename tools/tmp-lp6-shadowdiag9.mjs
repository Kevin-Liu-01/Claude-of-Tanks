// TEMP lighting_post r6: dump cascade shadow-map color buffers as ASCII density
// maps (who is actually rendered into the maps?).
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const vite = await createServer({
  server: { port: 5701, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5701/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

const dump = await page.evaluate(async () => {
  const D = window.__DEBUG;
  const renderer = D.renderer;
  const out = {};
  for (let ci = 0; ci < 2; ci++) {
    const shadow = D.lighting.csm.lights[ci].shadow;
    const rt = shadow.map;
    if (!rt) { out[`cascade${ci}`] = 'no map'; continue; }
    const w = rt.width, h = rt.height;
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    // downsample to 64x32 ascii: mark cells whose min value differs from clear
    const gw = 64, gh = 32;
    let rows = [];
    let histo = {};
    for (let gy = 0; gy < gh; gy++) {
      let row = '';
      for (let gx = 0; gx < gw; gx++) {
        let mn = 255, mx = 0;
        for (let sy = 0; sy < 4; sy++) {
          for (let sx = 0; sx < 4; sx++) {
            const px = Math.floor(((gx + sx / 4) / gw) * w);
            const py = Math.floor(((gy + sy / 4) / gh) * h);
            const v = buf[(py * w + px) * 4]; // red channel
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
        }
        histo[mn] = (histo[mn] || 0) + 1;
        row += mn === 255 ? '.' : (mn > 200 ? '-' : (mn > 120 ? '+' : '#'));
      }
      rows.push(row);
    }
    out[`cascade${ci}`] = { size: [w, h], rows, histoKeys: Object.keys(histo).slice(0, 12) };
  }
  return out;
});
for (const [k, v] of Object.entries(dump)) {
  console.log(`== ${k} ${JSON.stringify(v.size || v)} histo:${(v.histoKeys || []).join(',')}`);
  if (v.rows) console.log(v.rows.join('\n'));
}
await browser.close();
await vite.close();
