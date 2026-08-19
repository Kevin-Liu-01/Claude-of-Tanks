// Headless verify: tank visuals must be fully revived on battle restart,
// including a restart issued WHILE the kill-cam replay (x-ray ghost) is live.
// Run from the repo root: node <this file>
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const port = 5900 + Math.floor(Math.random() * 90);
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
console.log(`[revive] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.error('[page error]', e.message));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

// ---- in-page helpers -------------------------------------------------------
await page.evaluate(() => {
  // Burnt material is the only one with emissive 0xff5a18 (materials.js).
  window.__countBurnt = (ent) => {
    let burnt = 0, total = 0;
    ent.visual.root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      total++;
      const m = o.material;
      if (m.emissive && m.emissive.getHex() === 0xff5a18 && m.emissiveMap) burnt++;
    });
    return { burnt, total };
  };
  window.__playerSnapshot = () => {
    const D = window.__DEBUG;
    const p = D.game.player;
    const v = p.visual;
    const { burnt, total } = window.__countBurnt(p);
    // turretG/gunG are closed over inside the visual — infer askew-ness from
    // the world-space barrel direction instead (muzzle minus trunnion).
    const Vector3 = D.scene.position.constructor;
    const m1 = new Vector3();
    const m2 = new Vector3();
    v.gunMuzzleWorld(m1);
    v.gunPivotWorld(m2);
    const dir = { x: m1.x - m2.x, y: m1.y - m2.y, z: m1.z - m2.z };
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= len; dir.y /= len; dir.z /= len;
    // hull forward from state yaw (turretYaw should be ~0 right after spawn)
    const yaw = p.state.yaw + p.state.turretYaw;
    const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const dot = dir.x * fwd.x + dir.z * fwd.z;
    const yawErrDeg = Math.acos(Math.min(1, Math.max(-1,
      dot / (Math.hypot(dir.x, dir.z) || 1)))) * 180 / Math.PI;
    const pitchDeg = Math.asin(Math.min(1, Math.max(-1, dir.y))) * 180 / Math.PI;
    return {
      destroyedFlag: v.isDestroyed(),
      burnt, total,
      gunYawErrDeg: +yawErrDeg.toFixed(2),
      gunPitchDeg: +pitchDeg.toFixed(2),
    };
  };
});

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };

async function freshBattle() {
  await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
  await page.waitForFunction(
    () => window.__DEBUG.game.phase === 'battle' && window.__DEBUG.game.player,
    { timeout: 30000 });
  // settle a beat of sim so syncFromState has run
  await page.evaluate(() => window.__DEBUG.fastForward(0.5));
}

async function dieAndWaitForResult() {
  const spawned = await page.evaluate(() => window.__DEBUG.spawnKillShell());
  if (!spawned) fail('spawnKillShell returned false');
  await page.evaluate(() => window.__DEBUG.fastForward(2));
  const result = await page.evaluate(() => window.__DEBUG.game.result);
  // Team play may continue after the player's death; both the mid-battle
  // death replay and battle-deciding defeat replay exercise the same visual
  // teardown contract this probe owns.
  if (result !== null && result !== 'defeat') fail(`unexpected death result ${result}`);
  const post = await page.evaluate(() => window.__playerSnapshot());
  console.log('[revive] post-death snapshot:', JSON.stringify(post));
  if (!post.destroyedFlag) fail('player visual not flagged destroyed after death');
  if (post.burnt === 0) fail('no burnt materials applied after death');
}

// ---- scenario A: plain rematch (killcam cancelled before restart) ----------
console.log('\n[revive] scenario A: die -> cancel killcam -> restart');
await freshBattle();
await dieAndWaitForResult();
await page.evaluate(() => window.__DEBUG.killcam.cancel());
await freshBattle();
let snap = await page.evaluate(() => window.__playerSnapshot());
console.log('[revive] A post-restart snapshot:', JSON.stringify(snap));
if (snap.destroyedFlag) fail('A: destroyed flag survived restart');
if (snap.burnt > 0) fail(`A: ${snap.burnt}/${snap.total} meshes still burnt after restart`);
if (snap.gunYawErrDeg > 5) fail(`A: gun yaw ${snap.gunYawErrDeg} deg askew after restart`);
if (Math.abs(snap.gunPitchDeg) > 8) fail(`A: gun pitch ${snap.gunPitchDeg} deg after restart`);

// ---- scenario B: restart WHILE the x-ray ghost is applied ------------------
console.log('\n[revive] scenario B: die -> wait for x-ray ghost -> restart mid-replay');
await freshBattle();
await dieAndWaitForResult();
// The render loop starts the replay on the next frame; the ghost swap happens
// when the x-ray phase begins. Ghost applied == killcam active AND zero burnt
// materials on the (dead) player.
const ghostSeen = await page.waitForFunction(() => {
  const D = window.__DEBUG;
  if (!D.killcam.isActive()) return false;
  const { burnt } = window.__countBurnt(D.game.player);
  return burnt === 0; // every mesh swapped to the ghost material
}, { timeout: 30000, polling: 100 }).then(() => true).catch(() => false);
if (!ghostSeen) {
  fail('B: x-ray ghost never observed (killcam inactive or burnt mats persisted)');
} else {
  console.log('[revive] B: x-ray ghost confirmed applied, restarting mid-replay');
  await freshBattle();
  snap = await page.evaluate(() => window.__playerSnapshot());
  console.log('[revive] B post-restart snapshot:', JSON.stringify(snap));
  if (snap.destroyedFlag) fail('B: destroyed flag survived restart');
  if (snap.burnt > 0) fail(`B: ${snap.burnt}/${snap.total} meshes still burnt after mid-replay restart`);
  if (snap.gunYawErrDeg > 5) fail(`B: gun yaw ${snap.gunYawErrDeg} deg askew after restart`);
  if (Math.abs(snap.gunPitchDeg) > 8) fail(`B: gun pitch ${snap.gunPitchDeg} deg after restart`);

  // shot-straightness: aim at the nearest enemy, settle, fire, and check the
  // recorded muzzle direction against the aim line (the original bug fired
  // 28 deg askew because tryFire derives direction from the wreck pose).
  const aim = await page.evaluate(() => {
    const D = window.__DEBUG;
    let t = null;
    for (let i = 0; i < 20 && !t; i++) { t = D.aimAtNearest(); if (!t) D.fastForward(1); }
    if (!t) return null;
    for (let i = 0; i < 40; i++) {
      D.fastForward(0.25);
      const s = D.aimState();
      if (s && s.errMrad < 2 && s.reloadT <= 0) break;
    }
    return { err: D.gunAimError() * 180 / Math.PI, state: D.aimState() };
  });
  console.log('[revive] B aim-settle:', JSON.stringify(aim));
  if (!aim) fail('B: no aim target found after restart');
  else if (aim.err > 3) fail(`B: gunAimError ${aim.err.toFixed(2)} deg after settle (should be ~0)`);
}

// ---- scenario C: leave to garage while kill-cam UI owns the frame ---------
console.log('\n[revive] scenario C: active killcam -> leave battle -> clean garage');
await freshBattle();
await dieAndWaitForResult();
const replaySeen = await page.waitForFunction(
  () => window.__DEBUG.killcam.isActive() && document.body.classList.contains('cot-kc-live'),
  { timeout: 30000, polling: 100 },
).then(() => true).catch(() => false);
if (!replaySeen) {
  fail('C: active kill-cam UI was never observed');
} else {
  await page.evaluate(() => window.__DEBUG.enterGarage());
  await page.waitForFunction(() => window.__DEBUG.game.phase === 'garage', { timeout: 10000 });
  const exitState = await page.evaluate(() => {
    const kc = document.querySelector('.cot-kc');
    const hud = document.querySelector('.cot-hud');
    const stats = document.querySelector('.cot-si-stats');
    const damage = document.querySelector('.cot-dp');
    return {
      active: window.__DEBUG.killcam.isActive(),
      bodyLive: document.body.classList.contains('cot-kc-live'),
      report: document.body.classList.contains('cot-si-report'),
      killcamClasses: kc ? [...kc.classList] : [],
      killcamDisplay: kc ? getComputedStyle(kc).display : null,
      fadeCount: document.querySelectorAll('.cot-kc-fadeblk').length,
      hudInlineDisplay: hud?.style.display || '',
      statsInlineVisibility: stats?.style.visibility || '',
      statsShown: !!stats?.classList.contains('show'),
      damageInlineVisibility: damage?.style.visibility || '',
    };
  });
  console.log('[revive] C garage state:', JSON.stringify(exitState));
  if (exitState.active) fail('C: killcam controller remained active in garage');
  if (exitState.bodyLive) fail('C: cot-kc-live body class leaked into garage');
  if (exitState.report || exitState.statsShown) fail('C: battle report leaked into garage');
  if (exitState.killcamDisplay !== 'none') fail(`C: killcam root display is ${exitState.killcamDisplay}`);
  if (exitState.killcamClasses.some((name) => name !== 'cot-kc')) {
    fail(`C: killcam transition classes leaked (${exitState.killcamClasses.join(',')})`);
  }
  if (exitState.fadeCount) fail(`C: ${exitState.fadeCount} killcam fade layer(s) leaked`);
  if (exitState.statsInlineVisibility) fail('C: replay stats visibility veil was not released');
  if (exitState.damageInlineVisibility) fail('C: replay damage-panel veil was not released');
  await freshBattle();
  const nextBattle = await page.evaluate(() => ({
    hudDisplay: getComputedStyle(document.querySelector('.cot-hud')).display,
    bodyLive: document.body.classList.contains('cot-kc-live'),
    report: document.body.classList.contains('cot-si-report'),
    killcamDisplay: getComputedStyle(document.querySelector('.cot-kc')).display,
    statsShown: document.querySelector('.cot-si-stats')?.classList.contains('show'),
    damageVisibility: document.querySelector('.cot-dp')?.style.visibility || '',
  }));
  console.log('[revive] C next-battle state:', JSON.stringify(nextBattle));
  if (nextBattle.hudDisplay === 'none') fail('C: interrupted replay kept the next battle HUD hidden');
  if (nextBattle.bodyLive || nextBattle.report || nextBattle.statsShown) {
    fail('C: interrupted replay UI classes leaked into the next battle');
  }
  if (nextBattle.killcamDisplay !== 'none') fail('C: killcam UI reopened in the next battle');
  if (nextBattle.damageVisibility) fail('C: next-battle damage panel remained veiled');
}

await browser.close();
await server.close();
console.log(process.exitCode ? '\n[revive] FAILED' : '\n[revive] ALL GREEN');
