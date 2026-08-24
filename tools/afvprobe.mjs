// Headless verify: IFV per-shell reloads (autocannon bursts vs. ATGM rails).
// Guards: burst cadence, missile pricing on BOTH switch paths (player hotkey
// via selectShell and the bot fire-time slot flip in tryFire), belt-scale
// ammo counts, and an MBT single-reload regression check.
// Run from the repo root: node tools/afvprobe.mjs
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const port = 5800 + Math.floor(Math.random() * 90);
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port, strictPort: false },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[afv] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.error('[page error]', e.message));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };
const ok = (msg) => console.log(`  ok  ${msg}`);

await page.evaluate(() => {
  window.__playerShots = 0;
  window.__DEBUG.bus.on('shell:fired', (p) => { if (p.isPlayer) window.__playerShots++; });
});

async function battle(specId) {
  await page.evaluate(async (id) => {
    window.__DEBUG.flags.forceFire = false;
    await window.__DEBUG.startBattle(id);
  }, specId);
  await page.waitForFunction(
    () => window.__DEBUG.game.phase === 'battle' &&
      window.__DEBUG.game.player && window.__DEBUG.game.preBattleS === 0,
    { timeout: 60000 });
  await page.evaluate(() => window.__DEBUG.fastForward(0.5));
}

const shots = () => page.evaluate(() => window.__playerShots);
const reload = () => page.evaluate(() => ({
  t: +window.__DEBUG.game.player.combat.reload.t.toFixed(3),
  total: +window.__DEBUG.game.player.combat.reload.totalS.toFixed(3),
  slot: window.__DEBUG.game.player.combat.shellSlot,
}));

// ---- 1. Bradley: 0.5 s autocannon bursts --------------------------------
console.log('\n[afv] bradley: burst cadence + belt counts');
await battle('m2a2_bradley');
const cards = await page.evaluate(() => {
  const D = window.__DEBUG;
  return D.game.player.spec.gun.shells.map((s) => ({ name: s.name, reloadS: s.reloadS, count: s.count }));
});
console.log('  shells:', JSON.stringify(cards));
if (cards[0].count !== 225 || cards[1].count !== 7) fail('bradley shell counts not applied');
else ok('belt/rail counts on spec (225 AP / 7 TOW)');

let s0 = await shots();
await page.evaluate(() => { window.__DEBUG.flags.forceFire = true; window.__DEBUG.fastForward(6); });
let fired = (await shots()) - s0;
console.log(`  autocannon shots in 6 s: ${fired}`);
if (fired < 10) fail(`bradley burst cadence too slow (${fired} shots in 6 s, expected ~12)`);
else ok('sustained ~2 rps support fire');
let r = await reload();
if (Math.abs(r.total - 0.5) > 0.05) fail(`burst reload totalS ${r.total}, expected 0.5`);
else ok('burst reload totalS 0.5 s');

// ---- 2. TOW pricing via the player hotkey path ---------------------------
console.log('[afv] bradley: TOW rail pays 14 s on switch (hotkey path)');
await page.evaluate(() => {
  window.__DEBUG.flags.forceFire = false;
  window.__DEBUG.bus.emit('ui:shellSelect', { slot: 1 });
});
r = await reload();
console.log('  post-switch reload:', JSON.stringify(r));
if (r.slot !== 1 || Math.abs(r.total - 14) > 0.05 || r.t < 13.5) {
  fail(`switching to TOW must restart a 14 s load (got ${JSON.stringify(r)})`);
} else ok('TOW switch restarted a full 14 s load');
s0 = await shots();
await page.evaluate(() => { window.__DEBUG.flags.forceFire = true; window.__DEBUG.fastForward(2); });
if ((await shots()) - s0 !== 0) fail('TOW fired during its 14 s load');
else ok('no shot while the rail loads');
await page.evaluate(() => window.__DEBUG.fastForward(12.5));
fired = (await shots()) - s0;
if (fired < 1) fail('TOW never fired after its load elapsed');
else if (fired > 2) fail(`TOW cadence broken: ${fired} missiles in 14.5 s`);
else ok(`missile away after the full load (${fired} in 14.5 s)`);

// ---- 3. switch back down is fast ------------------------------------------
await page.evaluate(() => {
  window.__DEBUG.flags.forceFire = false;
  window.__DEBUG.bus.emit('ui:shellSelect', { slot: 0 });
});
r = await reload();
if (Math.abs(r.total - 0.5) > 0.05) fail(`switch back to AC should load 0.5 s (got ${r.total})`);
else ok('back on the autocannon in 0.5 s');

// ---- 4. bot path: raw input.shellSlot flip prices the missile -------------
console.log('[afv] bot fire-time slot flip pays the rail (tryFire guard)');
await page.evaluate(() => window.__DEBUG.fastForward(1)); // AC loaded
s0 = await shots();
r = await page.evaluate(() => {
  const D = window.__DEBUG;
  D.game.player.input.shellSlot = 1; // bypass selectShell, like a bot
  D.flags.forceFire = true;
  D.fastForward(2);
  return {
    t: +D.game.player.combat.reload.t.toFixed(2),
    total: +D.game.player.combat.reload.totalS.toFixed(2),
    slot: D.game.player.combat.shellSlot,
  };
});
fired = (await shots()) - s0;
console.log(`  post-flip: ${JSON.stringify(r)}, shots: ${fired}`);
if (fired !== 0) fail(`raw slot flip fired ${fired} instant missile(s)`);
else ok('no instant missile off the burst timer');
if (r.slot !== 1 || Math.abs(r.total - 14) > 0.05) fail('flip did not start the 14 s rail load');
else ok('rail load running after the flip');

// ---- 5. Warrior: RARDEN loadout, no inherited TOW -------------------------
console.log('[afv] fv510 warrior: RARDEN 30mm, 2-shell loadout');
await battle('fv510');
const w = await page.evaluate(() => {
  const g = window.__DEBUG.game.player.spec.gun;
  return { n: g.shells.length, names: g.shells.map((s) => s.name), reloadS: g.reloadS };
});
console.log('  loadout:', JSON.stringify(w));
if (w.n !== 2 || !w.names[0].includes('L14A2')) fail('warrior RARDEN loadout missing');
else ok('30 mm RARDEN belts, missile gone');
s0 = await shots();
await page.evaluate(() => { window.__DEBUG.flags.forceFire = true; window.__DEBUG.fastForward(5); });
fired = (await shots()) - s0;
console.log(`  warrior shots in 5 s: ${fired}`);
if (fired < 9) fail(`warrior cadence too slow (${fired} in 5 s, expected ~11)`);
else ok('warrior dispenses sustained fire');

// ---- 6. MBT regression: single gun-level reload untouched -----------------
console.log('[afv] m1a2: single-reload regression');
await battle('m1a2');
const mbt = await page.evaluate(() => window.__DEBUG.game.player.spec.gun.reloadS);
s0 = await shots();
await page.evaluate((n) => { window.__DEBUG.flags.forceFire = true; window.__DEBUG.fastForward(n); }, mbt * 2 + 1);
fired = (await shots()) - s0;
r = await reload();
console.log(`  gun.reloadS ${mbt}s — shots in ${(mbt * 2 + 1).toFixed(1)} s: ${fired}, reload ${JSON.stringify(r)}`);
if (fired < 2 || fired > 3) fail(`MBT cadence changed (${fired} shots across two reloads)`);
else ok('MBT cadence unchanged');
if (Math.abs(r.total - mbt) > mbt * 0.35) fail(`MBT reload totalS ${r.total} vs spec ${mbt}`);
else ok('MBT reload duration from gun.reloadS');

await browser.close();
await server.close();
console.log(process.exitCode ? '\n[afv] FAILED' : '\n[afv] ALL GREEN');
