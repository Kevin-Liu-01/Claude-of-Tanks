#!/usr/bin/env node
// Focused SOUND r3 browser gate:
//   1. a cannon 12 m from the occupied tank has the same audible level in
//      third-person and sniper view (camera pullback must not change range),
//   2. the real lethal-shell -> kill-cam path produces a dedicated audible
//      replay impact whose debris layers run at the visual 0.55x rate,
//   3. live combat ducks under that replay while the cinematic bus stays up.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (msg) => { throw new Error(msg); };
const db = (x) => x > 0 ? 20 * Math.log10(x) : -Infinity;

function analyze(i16) {
  let peak = 0;
  let energy = 0;
  let differenceEnergy = 0;
  for (let i = 0; i < i16.length; i++) {
    const x = i16[i] / 32768;
    peak = Math.max(peak, Math.abs(x));
    energy += x * x;
    if (i >= 2) {
      // Interleaved stereo: compare each channel with its own previous sample.
      const prev = i16[i - 2] / 32768;
      const d = x - prev;
      differenceEnergy += d * d;
    }
  }
  const rms = Math.sqrt(energy / Math.max(1, i16.length));
  return {
    peakDb: db(peak),
    rmsDb: db(rms),
    highRatio: differenceEnergy / Math.max(1e-12, energy),
    samples: i16.length,
  };
}

const port = 7920 + Math.floor(Math.random() * 70);
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
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

let browser;
const pageErrors = [];
try {
  await server.listen();
  const url = `http://localhost:${server.config.server.port}/`;
  console.log(`[audio-spatial-killcam] vite up at ${url}`);
  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--use-gl=angle', '--enable-webgl', '--no-sandbox',
      '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) pageErrors.push(msg.text());
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.mouse.click(640, 360); // real user gesture -> AudioContext.resume
  await sleep(250);
  await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
  await page.waitForFunction(
    'window.__COT_AUDIO && window.__COT_AUDIO.ctx && window.__COT_AUDIO.ctx.currentTime > 0',
    { timeout: 20000 },
  );
  await page.waitForFunction('window.__COT_AUDIO.sfxLoaded === true', { timeout: 20000 });
  // Hold the live simulation while the A/B shot is captured. The render loop,
  // camera rig and audio listener continue updating through the countdown.
  await page.evaluate(() => {
    window.__DEBUG.game.preBattleS = 999;
    window.__DEBUG.bus.emit('ui:volumes',
      { master: 0.8, engine: 0, combat: 1, ambience: 0, ui: 0, voice: 0 });
  });
  await sleep(800);

  async function readTap() {
    const n = await page.evaluate(() => window.__COT_AUDIO.stopTap());
    const parts = [];
    const chunk = 1 << 20;
    for (let off = 0; off < n; off += chunk) {
      const b64 = await page.evaluate(
        (o, count) => window.__COT_AUDIO.readTapB64(o, count),
        off, Math.min(chunk, n - off));
      parts.push(Buffer.from(b64, 'base64'));
    }
    await page.evaluate(() => window.__COT_AUDIO.clearTap());
    const all = Buffer.concat(parts);
    return new Int16Array(all.buffer, all.byteOffset, all.length / 2);
  }

  async function pose() {
    return page.evaluate(() => {
      const D = window.__DEBUG;
      const A = window.__COT_AUDIO;
      const p = D.game.player.state.pos;
      const c = D.camera.position;
      const l = A.listenerState();
      const at = A.spatialAt(p.x + 12, p.y + 1.5, p.z);
      return {
        mode: D.rig.mode,
        scoped: !!D.camera.userData.scoped,
        listener: l,
        gain12m: at.gain,
        cameraTankM: Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z),
        listenerTankM: Math.hypot(l.x - p.x, l.y - p.y, l.z - p.z),
      };
    });
  }

  let shotSeq = 987654;
  async function captureShot(distanceM, own = false, holdMs = 3000) {
    const beforeSeq = await page.evaluate(() => window.__COT_AUDIO.soundLog.at(-1)?.seq || 0);
    await page.evaluate(() => window.__COT_AUDIO.startTap(6));
    await sleep(150);
    await page.evaluate(({ distanceM, own, shellId }) => {
      const D = window.__DEBUG;
      const p = D.game.player.state.pos;
      const enemy = D.game.tanks.find((t) => t.team === 'enemy' && t.state);
      const shooter = own ? D.game.player : enemy;
      D.bus.emit('shell:fired', {
        shellId, shooterId: shooter.id, isPlayer: own,
        shellType: 'AP', shellName: 'probe', caliberMm: 122,
        muzzlePos: [p.x + distanceM, p.y + 1.5, p.z], dir: [0, 0, 1],
      });
    }, { distanceM, own, shellId: ++shotSeq });
    await sleep(holdMs);
    const audio = analyze(await readTap());
    const event = await page.evaluate((seq) =>
      window.__COT_AUDIO.soundLog.find((entry) => entry.seq > seq && entry.type === 'shell:fired') || null,
    beforeSeq);
    return { ...audio, event };
  }

  const arcadePose = await pose();
  const arcadeShot = await captureShot(12);
  if (arcadePose.listener.kind !== 'player-tank') fail(`arcade listener kind ${arcadePose.listener.kind}`);
  if (arcadePose.cameraTankM < 8) fail(`arcade camera unexpectedly near tank (${arcadePose.cameraTankM.toFixed(2)} m)`);
  if (arcadePose.listenerTankM > 3) fail(`audio listener missed tank (${arcadePose.listenerTankM.toFixed(2)} m)`);
  if (arcadePose.gain12m < 0.99) fail(`nearby arcade source attenuated to ${arcadePose.gain12m.toFixed(3)}`);
  if (arcadeShot.rmsDb < -45) fail(`nearby arcade cannon too quiet (${arcadeShot.rmsDb.toFixed(1)} dBFS RMS)`);

  await page.keyboard.down('Shift');
  await page.waitForFunction(
    'window.__DEBUG.rig.mode === "SNIPER" && window.__DEBUG.camera.userData.scoped === true',
    { timeout: 5000 },
  );
  await sleep(450);
  const sniperPose = await pose();
  const sniperShot = await captureShot(12);
  await page.keyboard.up('Shift');
  await page.evaluate(() => window.__DEBUG.rig.exitSniper(true));
  const anchorDelta = Math.hypot(
    arcadePose.listener.x - sniperPose.listener.x,
    arcadePose.listener.y - sniperPose.listener.y,
    arcadePose.listener.z - sniperPose.listener.z,
  );
  const shotDeltaDb = Math.abs(arcadeShot.rmsDb - sniperShot.rmsDb);
  if (sniperPose.listener.kind !== 'player-tank') fail(`sniper listener kind ${sniperPose.listener.kind}`);
  if (anchorDelta > 0.4) fail(`scope moved audio range anchor ${anchorDelta.toFixed(3)} m`);
  if (Math.abs(arcadePose.gain12m - sniperPose.gain12m) > 0.01) fail('scope changed nearby source gain');
  if (shotDeltaDb > 3) fail(`scope changed cannon RMS by ${shotDeltaDb.toFixed(2)} dB`);

  console.log('[audio-spatial-killcam] nearby cannon A/B', JSON.stringify({
    arcade: { pose: arcadePose, audio: arcadeShot },
    sniper: { pose: sniperPose, audio: sniperShot },
    anchorDeltaM: +anchorDelta.toFixed(3), rmsDeltaDb: +shotDeltaDb.toFixed(2),
  }));

  // The occupied gun keeps its pressure in scope, but moves to the authored
  // interior/headset spectrum. Remote world sources remain unchanged above.
  await page.waitForFunction('window.__DEBUG.rig.mode === "ARCADE"', { timeout: 5000 });
  await sleep(350);
  const ownArcadeShot = await captureShot(2, true);
  await page.keyboard.down('Shift');
  await page.waitForFunction(
    'window.__DEBUG.rig.mode === "SNIPER" && window.__DEBUG.camera.userData.scoped === true',
    { timeout: 5000 },
  );
  await sleep(450);
  const ownSniperShot = await captureShot(2, true);
  await page.keyboard.up('Shift');
  await page.evaluate(() => window.__DEBUG.rig.exitSniper(true));
  if (ownArcadeShot.rmsDb < -42 || ownSniperShot.rmsDb < -42) {
    fail(`occupied cannon became quiet (arcade ${ownArcadeShot.rmsDb.toFixed(1)}, scope ${ownSniperShot.rmsDb.toFixed(1)} dBFS)`);
  }
  if (Math.abs(ownArcadeShot.rmsDb - ownSniperShot.rmsDb) > 8) {
    fail(`scope changed occupied cannon level by more than 8 dB (${ownArcadeShot.rmsDb.toFixed(1)} vs ${ownSniperShot.rmsDb.toFixed(1)})`);
  }
  if (!(ownSniperShot.highRatio < ownArcadeShot.highRatio * 0.82)) {
    fail(`scope did not move occupied cannon to interior spectrum (${ownArcadeShot.highRatio.toFixed(4)} -> ${ownSniperShot.highRatio.toFixed(4)})`);
  }
  if (!ownArcadeShot.event?.own || ownArcadeShot.event.scoped) fail('arcade occupied-shot routing is wrong');
  if (!ownSniperShot.event?.own || !ownSniperShot.event.scoped) fail('scope occupied-shot routing is wrong');
  console.log('[audio-spatial-killcam] occupied cannon perspective A/B', JSON.stringify({
    arcade: ownArcadeShot,
    sniper: ownSniperShot,
  }));

  // World-cannon horizon: every step must get quieter and darker, but even a
  // 900 m shot must produce real PCM rather than a silent hard cutoff.
  await page.waitForFunction('window.__DEBUG.rig.mode === "ARCADE"', { timeout: 5000 });
  const distanceShots = [{ distanceM: 12, audio: arcadeShot }];
  for (const distanceM of [80, 250, 600, 900]) {
    distanceShots.push({ distanceM, audio: await captureShot(distanceM, false, 4200) });
  }
  for (let i = 1; i < distanceShots.length; i++) {
    const near = distanceShots[i - 1];
    const far = distanceShots[i];
    if (!(far.audio.event?.gain < near.audio.event?.gain)) {
      fail(`cannon gain is not distance-ordered at ${near.distanceM}/${far.distanceM} m`);
    }
    if (!(far.audio.rmsDb < near.audio.rmsDb + 1)) {
      fail(`cannon PCM is not distance-ordered at ${near.distanceM}/${far.distanceM} m`);
    }
  }
  if (distanceShots.at(-1).audio.rmsDb < -78) {
    fail(`900 m cannon is effectively silent (${distanceShots.at(-1).audio.rmsDb.toFixed(1)} dBFS)`);
  }
  console.log('[audio-spatial-killcam] cannon distance matrix', JSON.stringify(distanceShots));

  // Continuous engine horizon. Solo-filtering is a debug-only verification
  // aid so the occupied idle loop cannot hide the distant source under test.
  const engineIds = await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__AUDIO_PROBE_POSES = D.game.tanks.filter((t) => t.state?.pos).map((t) => ({
      id: t.id,
      pos: [t.state.pos.x, t.state.pos.y, t.state.pos.z],
      speed: t.state.speed,
      throttle: t.input?.throttle || 0,
    }));
    return {
      player: D.game.player.id,
      enemy: D.game.tanks.find((t) => t.team === 'enemy' && t.state)?.id,
    };
  });
  await page.evaluate((enemyId) => {
    const D = window.__DEBUG;
    D.bus.emit('ui:volumes', { master: 0.8, engine: 1, combat: 0, ambience: 0, ui: 0, voice: 0 });
    window.__COT_AUDIO.setEngineProbeSolo(enemyId);
  }, engineIds.enemy);

  async function captureEngine(distanceM) {
    await page.evaluate(({ enemyId, distanceM }) => {
      const D = window.__DEBUG;
      const p = D.game.player.state.pos;
      const enemy = D.game.tanks.find((t) => t.id === enemyId);
      enemy.state.pos.set(p.x + distanceM, p.y, p.z);
      enemy.state.speed = 9;
      if (enemy.input) enemy.input.throttle = 0.72;
    }, { enemyId: engineIds.enemy, distanceM });
    await sleep(900);
    await page.evaluate(() => window.__COT_AUDIO.startTap(6));
    await sleep(2200);
    const audio = analyze(await readTap());
    const state = await page.evaluate((id) =>
      window.__COT_AUDIO.engineState().find((entry) => entry.id === id) || null,
    engineIds.enemy);
    return { distanceM, audio, state };
  }

  const engineDistance = [];
  for (const distanceM of [40, 160, 420, 850]) engineDistance.push(await captureEngine(distanceM));
  for (let i = 0; i < engineDistance.length; i++) {
    const cur = engineDistance[i];
    if (!cur.state) fail(`${cur.distanceM} m engine did not own an active voice`);
    if (i > 0) {
      const prev = engineDistance[i - 1];
      if (!(cur.state.gain < prev.state.gain)) fail(`engine gain is not distance-ordered at ${cur.distanceM} m`);
      if (!(cur.state.cutoffHz < prev.state.cutoffHz)) fail(`engine air absorption is not distance-ordered at ${cur.distanceM} m`);
      if (!(cur.audio.rmsDb < prev.audio.rmsDb + 1)) fail(`engine PCM is not distance-ordered at ${cur.distanceM} m`);
    }
  }
  if (engineDistance.at(-1).audio.rmsDb < -80) {
    fail(`850 m engine is effectively silent (${engineDistance.at(-1).audio.rmsDb.toFixed(1)} dBFS)`);
  }
  console.log('[audio-spatial-killcam] engine distance matrix', JSON.stringify(engineDistance));

  // Occupied engine perspective: scope filters exposed track/turbine detail
  // but preserves the low mechanical bed and actual level.
  await page.evaluate((playerId) => {
    const D = window.__DEBUG;
    const p = D.game.player;
    p.state.speed = 9;
    if (p.input) p.input.throttle = 0.72;
    window.__COT_AUDIO.setEngineProbeSolo(playerId);
  }, engineIds.player);
  await sleep(900);
  async function captureCurrentEngine() {
    await page.evaluate(() => window.__COT_AUDIO.startTap(6));
    await sleep(2200);
    return {
      audio: analyze(await readTap()),
      state: await page.evaluate((id) =>
        window.__COT_AUDIO.engineState().find((entry) => entry.id === id) || null,
      engineIds.player),
    };
  }
  const ownEngineArcade = await captureCurrentEngine();
  await page.keyboard.down('Shift');
  await page.waitForFunction(
    'window.__DEBUG.rig.mode === "SNIPER" && window.__DEBUG.camera.userData.scoped === true',
    { timeout: 5000 },
  );
  await sleep(500);
  const ownEngineSniper = await captureCurrentEngine();
  await page.keyboard.up('Shift');
  await page.evaluate(() => window.__DEBUG.rig.exitSniper(true));
  console.log('[audio-spatial-killcam] occupied engine perspective A/B', JSON.stringify({
    arcade: ownEngineArcade,
    sniper: ownEngineSniper,
  }));
  if (!ownEngineArcade.state?.own || ownEngineArcade.state.scoped) fail('arcade occupied-engine routing is wrong');
  if (!ownEngineSniper.state?.own || !ownEngineSniper.state.scoped) fail('scope occupied-engine routing is wrong');
  if (ownEngineSniper.state.cutoffHz > 1500) fail(`scope engine cutoff too bright (${ownEngineSniper.state.cutoffHz.toFixed(0)} Hz)`);
  if (Math.abs(ownEngineArcade.audio.rmsDb - ownEngineSniper.audio.rmsDb) > 6) {
    fail(`scope made occupied engine too quiet (${ownEngineArcade.audio.rmsDb.toFixed(1)} vs ${ownEngineSniper.audio.rmsDb.toFixed(1)} dBFS)`);
  }
  if (!(ownEngineSniper.audio.highRatio < ownEngineArcade.audio.highRatio * 0.9)) {
    fail(`scope did not darken occupied engine spectrum (${ownEngineArcade.audio.highRatio.toFixed(6)} -> ${ownEngineSniper.audio.highRatio.toFixed(6)})`);
  }

  await page.waitForFunction('window.__DEBUG.rig.mode === "ARCADE"', { timeout: 5000 });
  await page.evaluate(() => {
    const D = window.__DEBUG;
    for (const saved of window.__AUDIO_PROBE_POSES || []) {
      const ent = D.game.tanks.find((t) => t.id === saved.id);
      if (!ent?.state?.pos) continue;
      ent.state.pos.set(saved.pos[0], saved.pos[1], saved.pos[2]);
      ent.state.speed = saved.speed;
      if (ent.input) ent.input.throttle = saved.throttle;
    }
    window.__COT_AUDIO.setEngineProbeSolo(null);
    D.bus.emit('ui:volumes', { master: 0.8, engine: 0, combat: 1, ambience: 0, ui: 0, voice: 0 });
  });
  await sleep(600);

  // Replicated/local tank:ram is a first-class collision event, not scenery.
  const ramBefore = await page.evaluate(() => window.__COT_AUDIO.soundLog.at(-1)?.seq || 0);
  await page.evaluate(() => window.__COT_AUDIO.startTap(4));
  await page.evaluate(({ playerId, enemyId }) => {
    const D = window.__DEBUG;
    const p = D.game.player.state.pos;
    D.bus.emit('tank:ram', {
      aId: playerId, bId: enemyId, aIsPlayer: true, bIsPlayer: false,
      dmgA: 90, dmgB: 180, closingMps: 10,
      pos: [p.x + 2, p.y + 0.8, p.z],
    });
  }, { playerId: engineIds.player, enemyId: engineIds.enemy });
  await sleep(1800);
  const ramAudio = analyze(await readTap());
  const ramEvent = await page.evaluate((seq) =>
    window.__COT_AUDIO.soundLog.find((entry) => entry.seq > seq && entry.type === 'tank:ram') || null,
  ramBefore);
  if (!ramEvent?.occupied) fail('tank:ram did not route as an occupied collision');
  if (ramAudio.rmsDb < -48) fail(`tank:ram collision is too quiet (${ramAudio.rmsDb.toFixed(1)} dBFS)`);
  console.log('[audio-spatial-killcam] tank ram', JSON.stringify({ event: ramEvent, audio: ramAudio }));

  // Use the real lethal-shell helper and real replay clock. Starting the tap
  // after player death removes the original live shot from the capture. A
  // team result need not exist yet: the death replay precedes spectating
  // while allies remain alive.
  const before = await page.evaluate(() => ({
    kc: window.__COT_AUDIO.killcamSfxLog.length,
    seq: window.__COT_AUDIO.sfxLog.length ? window.__COT_AUDIO.sfxLog.at(-1).seq : 0,
  }));
  const spawned = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.preBattleS = 0;
    const ok = D.spawnKillShell();
    D.fastForward(2);
    return ok;
  });
  if (!spawned) fail('real lethal-shell helper did not spawn');
  await page.waitForFunction(
    'window.__DEBUG.game.player && window.__DEBUG.game.player.combat.destroyed === true',
    { timeout: 10000 },
  );
  await page.waitForFunction('window.__DEBUG.killcam.isActive() === true', { timeout: 10000 });
  await page.evaluate(() => window.__COT_AUDIO.startTap(20));
  await page.waitForFunction(
    (n) => window.__COT_AUDIO.killcamSfxLog.length > n,
    { timeout: 30000 }, before.kc,
  );
  await sleep(150); // sample bus automation while the impact replay owns AV
  const impactState = await page.evaluate(() => ({
    listener: window.__COT_AUDIO.listenerState(),
    buses: window.__COT_AUDIO.busGains(),
    phase: window.__DEBUG.killcam.phase,
  }));
  await sleep(4200); // keep the stretched debris/turret tail in the PCM gate
  const replayAudio = analyze(await readTap());
  const replay = await page.evaluate(({ kc, seq }) => {
    const A = window.__COT_AUDIO;
    return {
      impact: A.killcamSfxLog.slice(kc),
      layers: A.sfxLog.filter((x) => x.seq > seq && x.killcam),
    };
  }, before);
  if (replayAudio.rmsDb < -50) fail(`kill-cam replay inaudible (${replayAudio.rmsDb.toFixed(1)} dBFS RMS)`);
  if (!replay.impact.length) fail('kill-cam impact did not reach audio');
  if (Math.abs(replay.impact.at(-1).slowRate - 0.55) > 1e-6) fail('kill-cam rate did not match 0.55x visual rate');
  if (!replay.layers.some((x) => x.n === 'expl_tank_debris' && Math.abs(x.r - 0.55) < 1e-6)) {
    fail('stretched kill-cam debris layer missing');
  }
  if (impactState.listener.kind !== 'killcam-camera') fail(`replay listener kind ${impactState.listener.kind}`);
  if (impactState.buses.sfx > 0.42) fail(`live combat not ducked (${impactState.buses.sfx.toFixed(3)})`);
  if (impactState.buses.cinematic < 0.9) fail(`cinematic bus ducked (${impactState.buses.cinematic.toFixed(3)})`);
  if (replayAudio.peakDb > -1) fail(`kill-cam master too hot (${replayAudio.peakDb.toFixed(1)} dBFS)`);
  console.log('[audio-spatial-killcam] real kill-cam', JSON.stringify({ ...replay, impactState, audio: replayAudio }));

  await page.evaluate(() => window.__DEBUG.killcam.cancel());
  await sleep(500);
  const restored = await page.evaluate(() => window.__COT_AUDIO.busGains());
  if (restored.sfx < 0.9) fail(`combat bus did not restore (${restored.sfx.toFixed(3)})`);
  await page.evaluate(() => window.__DEBUG.enterGarage());
  await sleep(250);
  const garageAudio = await page.evaluate(() => ({
    engines: window.__COT_AUDIO.engineState(),
    listener: window.__COT_AUDIO.listenerState(),
  }));
  if (garageAudio.engines.length) fail(`battle engine loops leaked into garage (${garageAudio.engines.length})`);
  if (pageErrors.length) fail(`browser errors: ${pageErrors.join(' | ')}`);
  console.log('[audio-spatial-killcam] GREEN');
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
