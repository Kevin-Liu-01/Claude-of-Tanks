#!/usr/bin/env node
// tutorial-guide.browser.mjs — the tutorial's guide drawn over a live battle (273). First-party tooling: Kevin B. Liu.
//
// Boots the game (a player whose tutorial is done, so no chapter runs), starts a solo battle, and shows guide specs
// through the diagnostics hook (window.__TUTORIAL_GUIDE, main.ts):
//   ahead   a marker 50 m ahead with its path, a bracket on the nearest enemy and the HUD chevron on the shells: the ring,
//           at least three chevrons of the pointer layer's trail on the ground (guidance-pointers-275), the bracket and the
//           chevron draw, and a press where they stand reaches the game (neither layer takes the pointer);
//   behind  the marker 60 m behind: no ring, the turn arrow painted on the ground ahead of the tank (never an arrow on the screen's edge:
//           Kevin, "for stuff for you to follow, its on ground");
//   aside   the marker 90 m to the side: the turn arrow, its head on the marker's side;
//   warn    the battle held still (src/dev/battleHold.ts), two enemies set down round the tank, one on the flank with its gun
//           laid on it and one close behind, and the marker ahead: the warnings' red bubbles on the screen's rim (never on
//           the ground: Kevin, "for the warnings / indicators thats in the ui") beside the trail;
//   turret  (guidance-pointers-276, Kevin: "they get clipped off if you aim to ur side") the marker 50 m ahead of the hull with
//           the turret at 0, 90, 180 and 270 degrees (the hull turned under the held camera and gun): the trail at 0, the turn
//           arrow at the rest, and no piece of either past the screen's edge;
//   clear   null: nothing of the guide is left in the page, and the pointer layer draws no way to follow.
// --mode=zone_control: a capture-zone battle: no way to follow on the ground ("remove the arrows on ground for obvious
// stuff. like capturing bases"). --mode=turbo_ball: the ball set down ahead (no indicator), behind and aside (one ball
// indicator on the rim each: "add that for the ball too if it out of view").
// Each case is shot to the evidence folder with its snapshot in report.json. --before records without asserting the 276
// behaviour (a run against the source before it).
//
//   node tools/tutorial-guide.browser.mjs --view=desktop --locale=en
//   node tools/tutorial-guide.browser.mjs --view=phone --locale=cn
//   node tools/tutorial-guide.browser.mjs --view=phone --mode=turbo_ball --out=<dir>
//
// Holds the shared capture lock (render class) for one short batch, and launches its browser through
// launchGuardedBrowser.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const VIEW = arg('view', 'desktop');
const LOCALE = arg('locale', 'en');
const MODE = arg('mode', 'standard');
const STRICT = !process.argv.includes('--before');
const VIEWS = {
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
assert.ok(VIEWS[VIEW] && (LOCALE === 'en' || LOCALE === 'cn') && ['standard', 'zone_control', 'turbo_ball'].includes(MODE),
  'usage: --view=desktop|phone --locale=en|cn [--mode=standard|zone_control|turbo_ball] [--before]');
const OUT = resolve(arg('out', resolve(process.cwd(), `../tutorial-journey-272-evidence/guide-${VIEW}-${LOCALE}`)));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const touch = VIEW === 'phone';
const report = { view: VIEW, locale: LOCALE, mode: MODE, strict: STRICT, cases: {}, errors: [], startedAt: new Date().toISOString() };

let server, browser, hold;
try {
  hold = await openCaptureHold({ label: 'tutorial-guide', place: `guide-${VIEW}-${LOCALE}`, lockClass: 'render', timeoutMs: 90 * 60_000 });
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      `--window-size=${VIEWS[VIEW].width},${VIEWS[VIEW].height + 120}`] }), { label: 'tutorial-guide' });
  const page = await browser.newPage();
  await page.setViewport(VIEWS[VIEW]);
  if (touch) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    try { await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]); } catch { /* older engine */ }
  }
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text().slice(0, 300)}`); });
  await page.evaluateOnNewDocument(() => {
    Document.prototype.hasFocus = () => true;
    try {
      localStorage.setItem('cot.telemetry', 'off');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
      localStorage.setItem('cot.tutorial.v1', '{"v":2,"garage":"skipped","training":"skipped","debrief":"skipped","tour":"skipped","offer":"later"}'); // the journey finished, its offer answered (tutorialRecord.ts TUTORIAL_FINISHED_RECORD)
    } catch { /* none */ }
  });
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}${LOCALE === 'cn' ? '/cn' : ''}/?nosplash=1&telemetry=off&tier=${touch ? 'mobile' : 'desktop'}`,
    { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG && !!window.__TUTORIAL_GUIDE`, { timeout: 600_000, polling: 500 });
  // (guidance-pointers-275) the battle held alive and still, so the staged warnings stand where they are set down
  await page.evaluate((mode) => { window.__DEBUG.battleHold?.set(true); return window.__DEBUG.beginSoloBattle(mode === 'standard' ? {} : { gameMode: mode }); }, MODE);
  await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });
  await sleep(1500);

  /** The battle as the guide sees it: the player's pose and the nearest enemy's id. */
  const pose = () => page.evaluate(() => {
    const game = window.__DEBUG.game;
    const me = game.player;
    const enemies = [...game.tankById.values()].filter((t) => t.state?.pos && t.team !== me.team && !t.combat?.destroyed);
    enemies.sort((a, b) => Math.hypot(a.state.pos.x - me.state.pos.x, a.state.pos.z - me.state.pos.z)
      - Math.hypot(b.state.pos.x - me.state.pos.x, b.state.pos.z - me.state.pos.z));
    return { x: me.state.pos.x, z: me.state.pos.z, yaw: me.state.yaw, enemy: enemies[0]?.id ?? null };
  });
  /** Show a spec, let it draw, shoot it and read what it drew and what a press at each piece would reach. */
  async function show(name, spec) {
    const snapshot = await page.evaluate(async (s) => { const read = await window.__TUTORIAL_GUIDE(s); window.__guideRead = read; return null; }, spec);
    void snapshot;
    await sleep(700);
    const facts = await page.evaluate(() => {
      const drawn = window.__guideRead?.() ?? null;
      const shown = (el) => el.getAttribute('display') !== 'none' && !el.hidden && !!el.closest('.is-on');
      const pieces = [...document.querySelectorAll('.cot-tut-guide-ring, .cot-ptr-chevron, .cot-ptr-turn, .cot-tut-guide-bracket, .cot-tut-guide-hud')]
        .filter(shown);
      // the pointer layer's way to follow (ui/pointers/pointerLayer.ts): its trail's chevrons, and the turn arrow's head
      const chevrons = [...document.querySelectorAll('.cot-ptr-chevron')].filter(shown).length;
      const head = [...document.querySelectorAll('.cot-ptr-turn-head')].find(shown)?.getBoundingClientRect() ?? null;
      const turn = head ? { x: head.left + head.width / 2, y: head.top + head.height / 2 } : null;
      // a press where a piece stands: the element there is never the guide's
      const hits = pieces.map((el) => {
        const r = el.getBoundingClientRect();
        const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
        const top = document.elementFromPoint(x, y);
        return { piece: el.getAttribute('class'), guideTakesIt: !!top?.closest('.cot-tut-guide, .cot-ptr') };
      });
      const layers = [...document.querySelectorAll('.cot-tut-guide, .cot-ptr')].map((el) => getComputedStyle(el).pointerEvents);
      const bubbles = [...document.querySelectorAll('.cot-ptr-bubble')].filter(shown).map((el) => {
        const r = el.getBoundingClientRect();
        return { kind: el.dataset.kind, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
      // (276) a way piece past the screen's edge: cut
      const clipped = [...document.querySelectorAll('.cot-ptr-chevron, .cot-ptr-turn')].filter(shown).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5;
      }).length;
      return { drawn: { ...(drawn ?? {}), chevrons, turn, bubbles, clipped }, hits, layers };
    });
    await page.screenshot({ path: resolve(OUT, `${name}.png`) });
    report.cases[name] = { spec, ...facts };
    console.log(`[guide] ${name}: ${JSON.stringify(facts.drawn)}`);
    for (const hit of facts.hits) assert.ok(!hit.guideTakesIt, `${name}: a press on ${hit.piece} reaches the game, not the guide`);
    for (const events of facts.layers) assert.equal(events, 'none', `${name}: the guide's layers take no pointer`);
    return facts.drawn;
  }

  /** (276) The mode cases: a capture-zone battle draws no way on the ground; the Turbo Ball ball's rim indicator. */
  async function modeCases() {
    if (MODE === 'zone_control') {
      const zone = await show('zone', null);
      if (STRICT) assert.ok(zone.chevrons === 0 && !zone.turn, 'zone: no way to follow on the ground for a capture zone');
      return;
    }
    const start = await pose();
    // the ball set down relative to the camera (behind the hull at the start), the clock nudged so the markers re-derive
    // the ball set down, the hold let go for a moment so the marker derivation sees it, and its place read back: it can
    // roll or bounce in that moment, so the case holds only where it ended in its region (ahead, behind, aside of the
    // start pose), set down again at most three times until it does
    const region = { 'ball-ahead': (a, c) => a > 15 && Math.abs(c) < 15, 'ball-behind': (a) => a < -20, 'ball-aside': (a, c) => c > 40 };
    const place = async (name, along, across) => {
      let at = { along: NaN, across: NaN };
      for (let attempt = 0; attempt < 3 && !region[name](at.along, at.across); attempt++) {
        at = await page.evaluate(async ({ a, c, p }) => {
          const ball = window.__DEBUG.game.matchModeState?.ball;
          if (!ball) return { along: NaN, across: NaN };
          const x = p.x + Math.sin(p.yaw) * a + Math.cos(p.yaw) * c, z = p.z + Math.cos(p.yaw) * a - Math.sin(p.yaw) * c;
          const setDown = () => { ball.x = x; ball.z = z; ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.y = window.__DEBUG.game.player.state.pos.y + 2.2; };
          setDown();
          window.__DEBUG.battleHold?.set(false);
          await new Promise((done) => setTimeout(done, 150));
          window.__DEBUG.battleHold?.set(true);
          const now = window.__DEBUG.game.matchModeState?.ball ?? ball;
          const dx = now.x - p.x, dz = now.z - p.z;
          return { along: Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz, across: Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz };
        }, { a: along, c: across, p: start });
      }
      const read = await show(name, null);
      report.cases[name].ballAt = { along: Number(at.along.toFixed(1)), across: Number(at.across.toFixed(1)) };
      assert.ok(region[name](at.along, at.across), `${name}: the ball ends in its region (${at.along.toFixed(1)} m along, ${at.across.toFixed(1)} m across)`);
      return read.bubbles.filter((b) => b.kind === 'ball').length;
    };
    const ahead = await place('ball-ahead', 40, 0), behind = await place('ball-behind', -60, 0), aside = await place('ball-aside', 0, 80);
    report.cases.ballIndicators = { ahead, behind, aside };
    if (STRICT) {
      assert.equal(ahead, 0, 'ball ahead, on the screen: no indicator');
      assert.equal(behind, 1, 'ball behind: one indicator');
      assert.equal(aside, 1, 'ball aside: one indicator');
    }
  }

  standard: {
  if (MODE !== 'standard') {
    await modeCases();
    break standard;
  }
  const me = await pose();
  const at = (along, across) => ({ x: me.x + Math.sin(me.yaw) * along + Math.cos(me.yaw) * across, z: me.z + Math.cos(me.yaw) * along - Math.sin(me.yaw) * across });
  const ahead = await show('ahead', {
    marker: { ...at(50, 0), radiusM: 6, label: 'A' }, path: true,
    ...(me.enemy ? { actor: { id: me.enemy, label: 'Target' } } : {}), hud: ['.cot-shells', '.cot-touch .round.fire'],
  });
  assert.ok(ahead.ring, 'ahead: the ring draws');
  assert.equal(ahead.follow, 'trail', 'ahead: the marker goes to the pointer layer with its trail');
  assert.ok(ahead.chevrons >= 3, 'ahead: the trail lays at least three chevrons on the ground');
  assert.ok(ahead.hud, 'ahead: the HUD chevron stands at its control');
  assert.equal(ahead.turn, null, 'ahead: no turn arrow for a marker in view');
  report.cases.ahead.enemyOnScreen = ahead.bracket;

  const behind = await show('behind', { marker: { ...at(-60, 0), radiusM: 6, label: 'B' }, path: true });
  assert.ok(!behind.ring && behind.turn, 'behind: no ring, the turn arrow on the ground');
  const vp = VIEWS[VIEW];
  assert.ok(behind.turn.y > vp.height / 3, 'behind: the turn arrow lies on the ground ahead of the tank, low on the screen');

  const aside = await show('aside', { marker: { ...at(0, 90), radiusM: 6, label: 'C' }, path: true });
  assert.ok(aside.turn, 'aside: the turn arrow');
  report.cases.aside.side = aside.turn.x > vp.width / 2 ? 'right' : 'left';
  for (const [name, read] of [['behind', behind], ['aside', aside]]) {
    assert.ok(read.turn.x >= 0 && read.turn.x <= vp.width && read.turn.y >= 0 && read.turn.y <= vp.height,
      `${name}: the turn arrow's head stands on the screen`);
  }

  // (276) the turret aside: the hull turned under the held camera and gun, the marker 50 m ahead of the hull
  for (const deg of [0, 90, 180, 270]) {
    await page.evaluate((d) => {
      const tank = window.__DEBUG.game.player;
      tank.__baseYaw ??= tank.state.yaw;
      tank.__baseTurret ??= tank.state.turretYaw ?? 0;
      const r = (d * Math.PI) / 180;
      tank.state.yaw = tank.__baseYaw - r;
      tank.state.turretYaw = tank.__baseTurret + r;
      if (typeof tank.state.prevYaw === 'number') tank.state.prevYaw = tank.state.yaw;
    }, deg);
    const now = await pose();
    const read = await show(`turret-${deg}`, { marker: { x: now.x + Math.sin(now.yaw) * 50, z: now.z + Math.cos(now.yaw) * 50, radiusM: 6, label: 'T' }, path: true });
    if (STRICT) {
      assert.equal(read.clipped, 0, `turret ${deg}: no piece of the way is cut by the screen's edge`);
      if (deg === 0) assert.ok(read.chevrons >= 3 && !read.turn, 'turret 0: the trail, no turn arrow');
      else assert.ok(read.turn && read.chevrons === 0, `turret ${deg}: the turn arrow, no trail`);
    }
  }
  await page.evaluate(() => {
    const tank = window.__DEBUG.game.player;
    tank.state.yaw = tank.__baseYaw; tank.state.turretYaw = tank.__baseTurret;
    if (typeof tank.state.prevYaw === 'number') tank.state.prevYaw = tank.state.yaw;
  });

  // the warnings: one enemy on the flank, its gun laid on the tank, one close behind
  const staged = await page.evaluate(() => {
    const game = window.__DEBUG.game;
    const me = game.player;
    const p = me.state.pos, yaw = me.state.yaw;
    const enemies = [...game.tankById.values()].filter((t) => t.state?.pos && t.team !== me.team && !t.combat?.destroyed);
    const place = (tank, along, across) => {
      const x = p.x + Math.sin(yaw) * along + Math.cos(yaw) * across, z = p.z + Math.cos(yaw) * along - Math.sin(yaw) * across;
      tank.state.pos.set(x, p.y, z);
      tank.state.prevPos?.set?.(x, p.y, z);
      tank.state.turretYaw = Math.atan2(p.x - x, p.z - z) - tank.state.yaw;
      return tank.id;
    };
    return enemies.length >= 2 ? [place(enemies[0], 30, 150), place(enemies[1], -30, -8)] : null;
  });
  report.cases.staged = staged;
  await sleep(1500);
  const warn = await show('warn', { marker: { ...at(55, 0), radiusM: 6, label: 'A' }, path: true });
  assert.ok(staged, 'warn: two enemies to stage');
  assert.ok(warn.bubbles.length >= 1 && warn.bubbles.every((b) => b.kind === 'tank'), 'warn: the warnings stand on the rim as tank bubbles');
  assert.ok(warn.chevrons >= 3, 'warn: the trail stays on the ground beside them');

  await page.evaluate(() => window.__TUTORIAL_GUIDE(null));
  await sleep(200);
  const left = await page.evaluate(() => document.querySelectorAll('.cot-tut-guide').length);
  const way = await page.evaluate(() => [...document.querySelectorAll('.cot-ptr.is-on :is(.cot-ptr-chevron, .cot-ptr-turn)')]
    .filter((el) => el.getAttribute('display') !== 'none').length);
  report.cases.clear = { layersLeft: left, wayLeft: way };
  await page.evaluate(() => window.__DEBUG.battleHold?.set(false));
  assert.equal(left, 0, 'clear: nothing of the guide is left');
  assert.equal(way, 0, 'clear: the pointer layer draws no way to follow');
  }
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await hold?.release();
  console.log(`[guide] ${report.ok ? 'PASS' : 'FAIL'} → ${OUT}`);
}
