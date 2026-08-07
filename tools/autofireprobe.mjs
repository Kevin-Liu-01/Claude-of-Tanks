// Verify full-auto hold-to-fire: desktop (mouse hold, pointer lock or
// cursor-aim fallback) and mobile (touch HUD fire button hold), plus
// click-stays-single-shot. Uses the Bradley (0.5 s bursts) via real input.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5770, strictPort: false },
  optimizeDeps: {
    entries: ['index.html'],
    include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js'],
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const fail = (m) => { console.error(`FAIL: ${m}`); process.exitCode = 1; };
const ok = (m) => console.log(`  ok  ${m}`);

async function boot(page) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 360000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 360000 });
  await page.evaluate(() => {
    window.__playerShots = [];
    window.__DEBUG.bus.on('shell:fired', (p) => {
      if (p.isPlayer) window.__playerShots.push(performance.now());
    });
    window.__DEBUG.startBattle('m2a2_bradley');
  });
  await page.waitForFunction(
    () => window.__DEBUG.game.phase === 'battle' && window.__DEBUG.game.preBattleS <= 0,
    { timeout: 60000, polling: 200 });
}
const shots = (page) => page.evaluate(() => window.__playerShots.length);

// ---- desktop: mouse hold on the canvas ------------------------------------
console.log('\n[auto] desktop: mouse hold = full auto');
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await boot(page);
// first click acquires pointer lock (or trips cursor-aim fallback)
await page.mouse.click(800, 450);
await new Promise((r) => setTimeout(r, 700));
const lockState = await page.evaluate(() => ({
  locked: window.__DEBUG.bus && document.pointerLockElement != null,
}));
console.log('  lock state after click:', JSON.stringify(lockState));
let s0 = await shots(page);
let sim0 = await page.evaluate(() => window.__DEBUG.game.timeS);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 8000));
await page.mouse.up();
const heldShots = (await shots(page)) - s0;
let simD = (await page.evaluate(() => window.__DEBUG.game.timeS)) - sim0;
const expected = simD / 0.5;
console.log(`  shots during hold: ${heldShots} over ${simD.toFixed(1)} s sim (expect ~${expected.toFixed(0)})`);
if (heldShots >= Math.max(3, expected * 0.7)) ok('desktop hold streams full auto');
else fail(`desktop hold fired ${heldShots} over ${simD.toFixed(1)} s sim (expected ~${expected.toFixed(0)})`);

// release must stop it
s0 = await shots(page);
await new Promise((r) => setTimeout(r, 1500));
if ((await shots(page)) - s0 === 0) ok('release stops fire');
else fail('gun kept firing after release');

// single click = single shot
s0 = await shots(page);
sim0 = await page.evaluate(() => window.__DEBUG.game.timeS);
await page.mouse.down(); await new Promise((r) => setTimeout(r, 60)); await page.mouse.up();
await page.waitForFunction(
  (t0) => window.__DEBUG.game.timeS - t0 > 2.0, { timeout: 60000, polling: 300 }, sim0);
const clickShots = (await shots(page)) - s0;
if (clickShots === 1) ok('quick click stays one shot (2 s sim elapsed)');
else fail(`quick click fired ${clickShots} shots across 2 s sim`);
await page.close();

// ---- mobile: touch HUD fire button hold ------------------------------------
console.log('[auto] mobile: touch fire button hold = full auto');
const mpage = await browser.newPage();
await mpage.emulate({
  viewport: { width: 892, height: 412, isMobile: true, hasTouch: true, isLandscape: true },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
});
await boot(mpage);
const fireBtn = await mpage.waitForSelector('.cot-touch .fire:not(.alt)', { visible: true, timeout: 20000 })
  .catch(() => null);
if (!fireBtn) {
  fail('mobile touch HUD fire button not found');
} else {
  const box = await fireBtn.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  let m0 = await shots(mpage);
  const msim0 = await mpage.evaluate(() => window.__DEBUG.game.timeS);
  const cdp = await mpage.createCDPSession();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }],
  });
  await new Promise((r) => setTimeout(r, 8000));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touchShots = (await shots(mpage)) - m0;
  const msimD = (await mpage.evaluate(() => window.__DEBUG.game.timeS)) - msim0;
  const mexp = msimD / 0.5;
  console.log(`  shots during touch hold: ${touchShots} over ${msimD.toFixed(1)} s sim (expect ~${mexp.toFixed(0)})`);
  if (touchShots >= Math.max(3, mexp * 0.7)) ok('mobile hold streams full auto');
  else fail(`mobile hold fired ${touchShots} over ${msimD.toFixed(1)} s sim`);
  m0 = await shots(mpage);
  await new Promise((r) => setTimeout(r, 1500));
  if ((await shots(mpage)) - m0 === 0) ok('mobile release stops fire');
  else fail('mobile gun kept firing after release');
}
await mpage.close();

await browser.close();
await server.close();
console.log(process.exitCode ? '\n[auto] FAILED' : '\n[auto] ALL GREEN');
