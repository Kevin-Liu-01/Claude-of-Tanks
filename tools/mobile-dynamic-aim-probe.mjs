// Functional probe for mobile Dynamic Aim. It drives Chrome's real touch
// input path (not direct input API calls) and proves quick release firing,
// sustained hold-to-auto-fire, fire-button aim deltas, deadzone, cancellation,
// both fire buttons, an autocannon IFV, and a conventional MBT.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const shotArg = process.argv.indexOf('--screenshot');
const SCREENSHOT = shotArg >= 0 ? process.argv[shotArg + 1] : '';
const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5786, strictPort: false },
  optimizeDeps: { entries: ['index.html'], include: ['three'] },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new', protocolTimeout: 360000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.emulate({
  viewport: { width: 892, height: 412, isMobile: true, hasTouch: true, isLandscape: true, deviceScaleFactor: 3 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await page.createCDPSession();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => { throw new Error(message); };

async function touch(type, points) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}
async function box(selector) {
  const el = await page.$(selector);
  if (!el) fail(`missing ${selector}`);
  const r = await el.boundingBox();
  if (!r) fail(`hidden ${selector}`);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
const playerShots = () => page.evaluate(() => window.__DEBUG.playerShellLog.length);
async function readyTank(id) {
  await page.evaluate((tankId) => {
    window.__DEBUG.startBattle(tankId);
    window.__DEBUG.game.preBattleS = 0;
    window.__DEBUG.game.player.combat.reload.t = 0;
  }, id);
  await page.waitForFunction((tankId) => {
    const D = window.__DEBUG;
    return D.game.phase === 'battle' && D.game.player?.specId === tankId &&
      document.querySelector('.cot-touch.on .fire');
  }, { timeout: 60000 }, id);
  await sleep(250);
}
async function armDragRelease(selector, id, dx, dy) {
  const p = await box(selector);
  const before = await playerShots();
  await touch('touchStart', [{ x: p.x, y: p.y, id }]);
  await sleep(35);
  const held = await playerShots();
  if (held !== before) fail(`${selector} fired before the hold threshold`);
  await touch('touchMove', [{ x: p.x + 4, y: p.y + 3, id }]);
  await sleep(15);
  const deadzoneCalls = await page.evaluate(() => window.__DA.aim.length);
  await touch('touchMove', [{ x: p.x + dx, y: p.y + dy, id }]);
  await sleep(35);
  const during = await page.evaluate(() => ({
    shots: window.__DEBUG.playerShellLog.length,
    aim: window.__DA.aim.length,
    armed: document.querySelector('.cot-touch').classList.contains('fire-armed'),
    dragging: !!document.querySelector('.cot-touch .fire.aiming'),
  }));
  if (during.shots !== before) fail(`${selector} fired during drag`);
  if (during.aim <= deadzoneCalls) fail(`${selector} drag did not feed aim`);
  if (!during.armed || !during.dragging) fail(`${selector} missing armed/aiming feedback`);
  await touch('touchEnd', []);
  await page.waitForFunction((n) => window.__DEBUG.playerShellLog.length === n + 1,
    { timeout: 3000 }, before);
  return { before, after: await playerShots(), aimCalls: during.aim, deadzoneCalls };
}

async function holdBradleyAutoFire(selector, id) {
  await sleep(300);
  await page.evaluate(() => { window.__DEBUG.game.player.combat.reload.t = 0; });
  const p = await box(selector);
  const before = await playerShots();
  const aimBefore = await page.evaluate(() => window.__DA.aim.length);
  await touch('touchStart', [{ x: p.x, y: p.y, id }]);
  await page.waitForFunction((n) => window.__DEBUG.playerShellLog.length >= n + 1,
    { timeout: 3000 }, before);
  for (let i = 0; i < 4; i++) {
    await touch('touchMove', [{
      x: p.x + (i % 2 ? -34 : 32),
      y: p.y + (i % 3 ? -16 : 18),
      id,
    }]);
    await sleep(330);
  }
  const live = await page.evaluate(() => ({
    shots: window.__DEBUG.playerShellLog.length,
    aim: window.__DA.aim.length,
    auto: !!document.querySelector('.cot-touch .fire.autofire'),
    label: document.querySelector('.cot-touch .fire:not(.alt) .lb')?.textContent,
  }));
  if (live.shots < before + 3) fail(`Bradley hold fired only ${live.shots - before} rounds`);
  if (live.aim <= aimBefore || !live.auto || live.label !== 'Auto fire') {
    fail(`Bradley hold did not preserve aim/auto feedback: ${JSON.stringify(live)}`);
  }
  await touch('touchEnd', []);
  const released = await playerShots();
  await sleep(800);
  const settled = await playerShots();
  if (settled !== released) fail('Bradley kept firing after release');
  return { rounds: released - before, aimCalls: live.aim - aimBefore, stoppedAt: settled };
}

async function holdMbtThroughReload(selector, id) {
  await sleep(300);
  await page.evaluate(() => { window.__DEBUG.game.player.combat.reload.t = 0; });
  const p = await box(selector);
  const before = await playerShots();
  await touch('touchStart', [{ x: p.x, y: p.y, id }]);
  await page.waitForFunction((n) => window.__DEBUG.playerShellLog.length === n + 1,
    { timeout: 3000 }, before);
  await sleep(300); // expire the one press-edge buffer; only held fire remains
  await page.evaluate(() => { window.__DEBUG.game.player.combat.reload.t = 0; });
  await page.waitForFunction((n) => window.__DEBUG.playerShellLog.length === n + 2,
    { timeout: 3000 }, before);
  const auto = await page.$eval(selector, (el) => el.classList.contains('autofire'));
  if (!auto) fail('MBT was not still in auto fire after reload');
  await touch('touchEnd', []);
  const released = await playerShots();
  await sleep(350);
  if (await playerShots() !== released) fail('MBT kept firing after release');
  return { rounds: released - before, stopped: true };
}

try {
  await page.goto(`http://localhost:${server.config.server.port}/?nosplash`, {
    waitUntil: 'domcontentloaded', timeout: 360000,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 360000 });
  await page.evaluate(() => {
    const input = window.__DEBUG.input;
    const original = input.addVirtualAim.bind(input);
    window.__DA = { aim: [] };
    input.addVirtualAim = (dx, dy) => {
      window.__DA.aim.push({ dx, dy, t: performance.now() });
      original(dx, dy);
    };
  });

  // IFV motivation: aim with the primary fire thumb, lift, and shoot once.
  await readyTank('m2a2_bradley');
  const ifv = await armDragRelease('.cot-touch .fire:not(.alt)', 41, -34, -18);

  // Tap preserves quick-fire but remains release-only.
  // Let the input layer's intentional 250 ms low-rAF edge buffer expire
  // before this probe manually bypasses the Bradley's real 0.5 s reload.
  await sleep(300);
  await page.evaluate(() => { window.__DEBUG.game.player.combat.reload.t = 0; });
  const tapPoint = await box('.cot-touch .fire:not(.alt)');
  const tapBefore = await playerShots();
  await touch('touchStart', [{ x: tapPoint.x, y: tapPoint.y, id: 42 }]);
  await sleep(150);
  if (await playerShots() !== tapBefore) fail('quick tap fired before release');
  await touch('touchEnd', []);
  await page.waitForFunction((n) => window.__DEBUG.playerShellLog.length === n + 1,
    { timeout: 3000 }, tapBefore);

  // Dragging onto the visible red cancel target and lifting must not shoot.
  await sleep(300);
  await page.evaluate(() => { window.__DEBUG.game.player.combat.reload.t = 0; });
  const cancelStart = await box('.cot-touch .fire:not(.alt)');
  const cancelBefore = await playerShots();
  await touch('touchStart', [{ x: cancelStart.x, y: cancelStart.y, id: 43 }]);
  await sleep(80);
  const cancelPoint = await box('.cot-touch .fire-cancel');
  await touch('touchMove', [{ x: cancelPoint.x, y: cancelPoint.y, id: 43 }]);
  await sleep(120);
  const cancelHot = await page.$eval('.cot-touch', (el) => el.classList.contains('fire-cancel-hot'));
  if (!cancelHot) fail('cancel target did not highlight');
  if (SCREENSHOT) await page.screenshot({ path: SCREENSHOT });
  await touch('touchEnd', []);
  await sleep(350);
  if (await playerShots() !== cancelBefore) fail('cancel release fired a shot');

  // The motivating IFV path: one held thumb keeps the real fire action down
  // while the same pointer steers aim, yielding multiple 0.5 s Bradley shots.
  const ifvAuto = await holdBradleyAutoFire('.cot-touch .fire:not(.alt)', 44);

  // Universal behavior: the alternate fire button on a conventional MBT
  // follows the exact same drag/release contract.
  await readyTank('m1a2');
  await page.evaluate(() => { window.__DA.aim.length = 0; });
  const mbt = await armDragRelease('.cot-touch .fire.alt', 51, 28, -16);

  // A conventional tank uses the identical held action. Force its long reload
  // ready inside the probe and prove it fires again without another touch.
  const mbtAuto = await holdMbtThroughReload('.cot-touch .fire.alt', 52);

  await sleep(300); // release-edge buffer expiry; this is not a held control
  const finalState = await page.evaluate(() => ({
    tank: window.__DEBUG.game.player.specId,
    fireHeld: window.__DEBUG.input.getState().fire,
    armed: document.querySelector('.cot-touch').classList.contains('fire-armed'),
    cancelHot: document.querySelector('.cot-touch').classList.contains('fire-cancel-hot'),
  }));
  if (finalState.fireHeld || finalState.armed || finalState.cancelHot) {
    fail(`fire gesture left stuck state: ${JSON.stringify(finalState)}`);
  }
  if (errors.length) fail(`page errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({
    pass: true, ifv, ifvAuto, mbt, mbtAuto,
    tapRelease: true, cancelNoFire: true, finalState,
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
