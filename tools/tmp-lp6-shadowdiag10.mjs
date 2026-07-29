// TEMP lighting_post r6: pixel-diff cascade0 map with props casters on vs off.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const vite = await createServer({
  server: { port: 5702, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5702/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1200));

const res = await page.evaluate(async () => {
  const D = window.__DEBUG;
  const renderer = D.renderer;
  const read = () => {
    const rt = D.lighting.csm.lights[0].shadow.map;
    const w = rt.width, h = rt.height;
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    return buf;
  };
  const wait2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));

  const bufA = read();
  // toggle: props group casters OFF
  const world = D.scene.children.find((c) => c.name && c.name.startsWith('world'));
  const props = world.children.find((c) => c.name === 'props');
  const flipped = [];
  props.traverse((o) => {
    if ((o.isMesh || o.isInstancedMesh) && o.castShadow) { o.castShadow = false; flipped.push(o); }
  });
  D.lighting.update(true);
  await wait2();
  const bufB = read();
  let diff = 0, totalA = 0, totalB = 0;
  for (let i = 0; i < bufA.length; i += 4) {
    if (bufA[i] !== 255) totalA++;
    if (bufB[i] !== 255) totalB++;
    if (Math.abs(bufA[i] - bufB[i]) > 6) diff++;
  }
  // restore
  for (const o of flipped) o.castShadow = true;
  return { flippedCasters: flipped.length, pxWithGeomA: totalA, pxWithGeomB: totalB, pxDiff: diff, mapPx: bufA.length / 4 };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
await vite.close();
