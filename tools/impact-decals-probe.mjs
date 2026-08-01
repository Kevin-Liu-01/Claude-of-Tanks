// TEMP impact-decals verification probe (impact-decals-r1).
// Usage: node tools/impact-decals-probe.mjs [phase...]  phases: closeups realfire wreck perf
//
// Boots the game headless on a PRIVATE vite (71xx, hmr off, watch disabled —
// immune to sibling agents saving files mid-capture), stages a battle via
// window.__DEBUG, then:
//  - closeups: stamps every mark family (pen / crit pen / ricochet gouge /
//    HE scorch / non-pen scuff) through the REAL shell:hit bus path at two
//    calibers (76 / 152 mm) on BOTH a procedural enemy and a GLB-swapped
//    vehicle, capturing per-kind closeups to shots/impact-decals-r1/.
//    Synthetic events carry armor-model-derived surface points + localPos /
//    localDir exactly like sim events (same fields, same handler).
//  - realfire: player AP shots at a flat-side target through the live
//    ballistics pipeline; asserts decals appeared for real hits.
//  - wreck: kills a scarred tank and asserts its decals are cleared (the
//    old black-rhombus wreck regression) + captures the clean wreck.
//  - perf: 24 decals on one vehicle, median frame time decals-on vs
//    decals-off over N synced frames + draw-call delta.
// Exits non-zero on console errors or failed assertions.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const phases = process.argv.slice(2).length ? process.argv.slice(2)
  : ['closeups', 'realfire', 'wreck', 'perf'];
const outDir = resolve('shots/impact-decals-r1');
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  clearScreen: false,
  server: {
    port: 7100 + Math.floor(Math.random() * 80),
    strictPort: false,
    hmr: false,
    watch: { ignored: ['**/*'] },
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/?nosplash`;
const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
}
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[impact-decals] ${name}.png`);
}

// ---------------------------------------------------------------------------
// In-page staging helpers (installed once per load)
// ---------------------------------------------------------------------------
const HELPERS = `(() => {
  const D = window.__DEBUG;
  const rotY = (v, a) => [v[0]*Math.cos(a)+v[2]*Math.sin(a), v[1], -v[0]*Math.sin(a)+v[2]*Math.cos(a)];
  const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const isGlb = (t) => { const h = t.visual && t.visual.root.getObjectByName('rig_hull'); return !!(h && h.userData.__glbSwapped); };

  /** right-side hull surface point from the ARMOR MODEL (hull-local). */
  function sidePoint(ent, zFrac, yFrac) {
    const plates = (ent.spec.armor.hullPlates || []).filter((p) => {
      if (!Array.isArray(p.verts) || p.kind === 'era') return false;
      let nx = 0, cx = 0;
      for (const v of p.verts) cx += v[0];
      cx /= p.verts.length;
      // side plate: verts near-constant +x
      const xs = p.verts.map((v) => v[0]);
      const spread = Math.max(...xs) - Math.min(...xs);
      return cx > 0.4 && spread < 0.5;
    });
    if (!plates.length) {
      const w2 = ent.spec.dims.widthM / 2;
      return [w2, ent.spec.dims.heightM * (0.3 + 0.3 * yFrac), (zFrac - 0.5) * ent.spec.dims.overallLengthM * 0.6];
    }
    // OUTERMOST side plate (skirts included) — an inner main plate would put
    // the mark behind the skirt visual; tie-break by plate area
    let best = plates[0], bestX = -1, bestA = -1;
    for (const p of plates) {
      const xs2 = p.verts.map((v) => v[0]);
      const cx = xs2.reduce((s, v) => s + v, 0) / xs2.length;
      const ys = p.verts.map((v) => v[1]), zs = p.verts.map((v) => v[2]);
      const a = (Math.max(...ys) - Math.min(...ys)) * (Math.max(...zs) - Math.min(...zs));
      if (a < 0.4) continue; // ignore slivers
      if (cx > bestX + 0.04 || (Math.abs(cx - bestX) <= 0.04 && a > bestA)) {
        bestX = cx; bestA = a; best = p;
      }
    }
    const xs = best.verts.map((v) => v[0]);
    const ys = best.verts.map((v) => v[1]);
    const zs = best.verts.map((v) => v[2]);
    const x = xs.reduce((s, v) => s + v, 0) / xs.length;
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const z0 = Math.min(...zs), z1 = Math.max(...zs);
    return [x, y0 + (y1 - y0) * (0.25 + 0.55 * yFrac), z0 + (z1 - z0) * (0.18 + 0.64 * zFrac)];
  }

  /** turret-side surface point (hull-local) from the armor turret envelope. */
  function turretPoint(ent, zFrac) {
    const env = { mn: [9e9, 9e9, 9e9], mx: [-9e9, -9e9, -9e9] };
    (ent.spec.armor.turretPlates || []).forEach((p) => (p.verts || []).forEach((v) => {
      for (let a = 0; a < 3; a++) { env.mn[a] = Math.min(env.mn[a], v[a]); env.mx[a] = Math.max(env.mx[a], v[a]); }
    }));
    if (env.mn[0] > env.mx[0]) return null;
    const tp = ent.spec.armor.turretPivot || [0, 1.4, 0];
    const ty = ent.state.turretYaw || 0;
    const tLocal = [env.mx[0] - 0.02, (env.mn[1] + env.mx[1]) * 0.5,
      env.mn[2] + (env.mx[2] - env.mn[2]) * (0.2 + 0.6 * zFrac)];
    return { hullLocal: add(tp, rotY(tLocal, ty)), ty };
  }

  /** Emit one synthetic-but-complete shell:hit through the real bus. */
  function hit(ent, kind, localPos, localNormal, localDir, cal, extra = {}) {
    const st = ent.state;
    const yaw = st.yaw;
    D.bus.emit('shell:hit', Object.assign({
      kind, shellId: -1, shellType: 'AP', caliberMm: cal,
      attackerId: null, targetId: ent.id,
      pos: add([st.pos.x, st.pos.y, st.pos.z], rotY(localPos, yaw)),
      normal: rotY(localNormal, yaw),
      impactAngleDeg: 25, damage: 0, targetHpAfter: ent.combat.hp,
      modulesHit: [], crewHit: [], fireStarted: false, ammoRacked: false,
      destroyed: false, zone: 'side_hull',
      localPos, localDir, timeS: D.game.timeS,
    }, extra));
  }

  /** Park the camera looking at a hull-local point from along its normal. */
  function camAt(ent, localPos, dist, upM, sideM, fov) {
    const st = ent.state;
    const w = rotY(localPos, st.yaw);
    const n = rotY([1, 0, 0], st.yaw);
    const f = rotY([0, 0, 1], st.yaw);
    const look = D.rig.aimPoint.clone().set(st.pos.x + w[0], st.pos.y + w[1], st.pos.z + w[2]);
    const cam = look.clone();
    cam.x += n[0] * dist + f[0] * (sideM || 0);
    cam.y += (upM == null ? 0.5 : upM);
    cam.z += n[2] * dist + f[2] * (sideM || 0);
    // terrain clearance: a slope-side framing must never sink the lens
    const hf = D.world && D.world.heightField;
    if (hf && hf.getHeightAt) cam.y = Math.max(cam.y, hf.getHeightAt(cam.x, cam.z) + 0.7);
    D.rig.setExternalPose(cam, look, fov || 34);
  }

  // freeze the SIM only: the fx clock keeps running on real time so the
  // transient impact flash/sparks from staged hits decay away before the
  // capture, leaving the persistent decals alone on the plate
  function freeze() { D.game.phase = 'shot'; }
  function thaw() { D.game.phase = 'battle'; }

  window.__IDP = { D, rotY, add, isGlb, sidePoint, turretPoint, hit, camAt, freeze, thaw };
  return true;
})()`;

async function install() {
  await page.evaluate(HELPERS);
}

/** Stage a battle and return {procId, glbId} target ids. */
async function stage(specId = 'm1a2', expectPlayerGlb = true) {
  await page.evaluate((sid) => {
    const { D } = window.__IDP;
    D.startBattle(sid);
    // kill the battle-open flyby so setExternalPose sticks (fxprobe pattern)
    D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false });
    D.fastForward(0.6);
  }, specId);
  // Let the lazy GLB parse queue SETTLE before classifying targets — an ally
  // that looks procedural at t=0.6 s can swap to its GLB seconds later,
  // mid-capture. Wait for the player's swap (when GLB-backed),
  // then a grace beat for ally swaps to pump through the same queue.
  const st = await page.evaluate(async (waitPlayerGlb) => {
    const { D, isGlb } = window.__IDP;
    if (waitPlayerGlb) {
      for (let i = 0; i < 30 && !isGlb(D.game.player); i++) await new Promise((r) => setTimeout(r, 500));
    }
    await new Promise((r) => setTimeout(r, 2500));
    const all = D.game.tanks.filter((t) => !t.isPlayer && t.visual && !t.combat.destroyed);
    const allies = all.filter((t) => t.team !== 'enemy');
    // most of the fleet is GLB-backed now — accept a procedural ENEMY too
    // (captures force-show it; unspotted enemies are otherwise hidden)
    const procs = allies.filter((t) => !isGlb(t)).concat(all.filter((t) => t.team === 'enemy' && !isGlb(t)));
    const glbAlly = allies.find((t) => isGlb(t));
    const glb = glbAlly || (isGlb(D.game.player) ? D.game.player : null);
    return {
      procId: procs.length ? procs[0].id : null,
      procIds: procs.map((t) => t.id),
      glbId: glb ? glb.id : null,
      glbIsPlayer: glb === D.game.player,
      roster: all.map((t) => `${t.id}:${t.team}${isGlb(t) ? '(glb)' : ''}`),
    };
  }, expectPlayerGlb);
  // hold the battle frozen for the whole capture set: live AI crossfire was
  // detracking/wrecking the very tanks being photographed between captures
  await page.evaluate(() => window.__IDP.freeze());
  return st;
}

/** Stamp one mark family on a target and capture a closeup. */
async function closeup(targetId, fam, cal, label) {
  const info = await page.evaluate((tid, famIn, calIn) => {
    const { D, hit, sidePoint, turretPoint, camAt, freeze } = window.__IDP;
    const ent = D.game.tankById.get(tid);
    if (!ent) return { err: 'no ent' };
    const zed = { pen: 0.7, gouge: 0.45, scorch: 0.3, scuff: 0.62, crit: 0.5 };
    const p = sidePoint(ent, zed[famIn] ?? 0.5, 0.8);
    const n = [1, 0, 0];
    if (famIn === 'pen') {
      hit(ent, 'pen', p, n, [-0.88, -0.1, -0.46], calIn);
      // second pen slightly aft so variant jitter is visible in-frame
      hit(ent, 'pen', sidePoint(ent, 0.4, 0.5), n, [-0.92, -0.05, 0.39], calIn);
    } else if (famIn === 'crit') {
      hit(ent, 'pen', p, n, [-1, -0.08, 0.1], calIn,
        { modulesHit: [{ module: 'ammoRack', newState: 'red' }], fireStarted: true });
    } else if (famIn === 'gouge') {
      // shallow-angle scrapes: direction nearly tangential to the plate
      hit(ent, 'ricochet', p, n, [-0.16, 0.06, -0.985], calIn, { impactAngleDeg: 76 });
      hit(ent, 'ricochet', sidePoint(ent, 0.28, 0.35), n, [-0.2, -0.3, 0.93], calIn, { impactAngleDeg: 72 });
    } else if (famIn === 'scorch') {
      hit(ent, 'he_splash', p, n, [-0.9, -0.2, 0.4], calIn, { damage: 40 });
    } else if (famIn === 'scuff') {
      hit(ent, 'nonpen', p, n, [-0.97, -0.1, 0.2], calIn);
    } else if (famIn === 'turret') {
      const t = turretPoint(ent, 0.55);
      if (t) {
        const { rotY } = window.__IDP;
        hit(ent, 'pen', t.hullLocal, rotY([1, 0, 0], t.ty), rotY([-0.85, 0, -0.5], t.ty), calIn, { zone: 'turret_side' });
        hit(ent, 'ricochet', window.__IDP.add(t.hullLocal, [0, 0.1, 0.34]), rotY([1, 0, 0], t.ty), rotY([-0.15, 0, -0.99], t.ty), calIn, { zone: 'turret_side', impactAngleDeg: 78 });
      }
    }
    const dist = famIn === 'scorch' ? 5.0 : 4.0;
    camAt(ent, famIn === 'turret' ? [p[0], ent.spec.armor.turretPivot[1] + 0.4, 0] : p, dist, 1.0, 0.9, 32);
    freeze();
    ent.visual.setVisible(true); // enemy targets: unspotted visuals are hidden
    return { ok: true, stats: D.fx.impactDecalStats() };
  }, targetId, fam, cal);
  await sleep(2400);
  const dbg = await page.evaluate((tid) => {
    const { D } = window.__IDP;
    const ent = D.game.tankById.get(tid);
    let meshes = 0;
    if (ent) ent.visual.root.traverse((o) => { if (o.name === 'fx_impactDecals') meshes++; });
    return {
      cam: D.camera.position.toArray().map((v) => +v.toFixed(1)),
      tank: ent ? ent.state.pos.toArray().map((v) => +v.toFixed(1)) : null,
      phase: D.game.phase,
      stats: D.fx.impactDecalStats(),
      meshesUnderTarget: meshes,
    };
  }, targetId);
  console.log(`[impact-decals] ${label} dbg:`, JSON.stringify(dbg));
  await shot(label);
  return info;
}

try {
  await ready();
  await install();

  if (phases.includes('closeups')) {
    // ---- procedural target, two calibers --------------------------------
    let t = await stage('t34_85', false);
    console.log('[impact-decals] roster:', JSON.stringify(t));
    if (!t.procId) throw new Error('no procedural ally target found');
    const procAt = (i) => t.procIds[i % t.procIds.length];
    let seq = 0;
    for (const [fam, cal, label] of [
      ['pen', 152, 'pen_152mm_proc'],
      ['crit', 152, 'pen_crit_152mm_proc'],
      ['gouge', 152, 'bounce_152mm_proc'],
      ['scorch', 152, 'he_152mm_proc'],
      ['turret', 152, 'turret_152mm_proc'],
    ]) {
      const r = await closeup(t.procId, fam, cal, label);
      if (r.err) throw new Error(`${label}: ${r.err}`);

    }
    // fresh battle so the 76 mm marks are not mixed with the 152 mm ones
    t = await stage('t34_85', false);
    seq = 0;
    for (const [fam, cal, label] of [
      ['pen', 76, 'pen_76mm_proc'],
      ['gouge', 76, 'bounce_76mm_proc'],
      ['scorch', 76, 'he_76mm_proc'],
      ['scuff', 76, 'scuff_76mm_proc'],
    ]) {
      const r = await closeup(t.procId, fam, cal, label);
      if (r.err) throw new Error(`${label}: ${r.err}`);

    }
    // ---- GLB target (enemy if the roster rolled one, else the player) ----
    t = await stage('t34_85', false);
    if (!t.glbId) console.log('[impact-decals] WARN: no GLB vehicle available');
    else {
      for (const [fam, cal, label] of [
        ['pen', 152, 'pen_152mm_glb'],
        ['gouge', 152, 'bounce_152mm_glb'],
        ['scorch', 152, 'he_152mm_glb'],
        ['pen', 76, 'pen_76mm_glb'],
        ['gouge', 76, 'bounce_76mm_glb'],
        ['scorch', 76, 'he_76mm_glb'],
        ['turret', 105, 'turret_105mm_glb'],
      ]) {
        const r = await closeup(t.glbId, fam, cal, label);
        if (r.err) throw new Error(`${label}: ${r.err}`);
      }
    }
    // ---- the full language on one flank ---------------------------------
    t = await stage('t34_85', false);
    await page.evaluate((tid) => {
      const { D, hit, sidePoint, camAt, freeze } = window.__IDP;
      const ent = D.game.tankById.get(tid);
      const n = [1, 0, 0];
      hit(ent, 'pen', sidePoint(ent, 0.78, 0.62), n, [-0.9, -0.1, -0.42], 120);
      hit(ent, 'pen', sidePoint(ent, 0.55, 0.42), n, [-0.95, 0, 0.3], 120,
        { modulesHit: [{ module: 'engine', newState: 'orange' }] });
      hit(ent, 'ricochet', sidePoint(ent, 0.34, 0.72), n, [-0.17, 0.05, -0.98], 120, { impactAngleDeg: 75 });
      hit(ent, 'he_splash', sidePoint(ent, 0.18, 0.4), n, [-0.8, -0.3, 0.5], 152, { damage: 55 });
      hit(ent, 'nonpen', sidePoint(ent, 0.9, 0.35), n, [-0.96, -0.1, 0.26], 90);
      const p = sidePoint(ent, 0.5, 0.55);
      camAt(ent, p, 5.6, 0.7, 0.4, 38);
      freeze();
      return true;
    }, t.procId);
    await sleep(2400);
    await shot('language_full_side_proc');
    await page.evaluate(() => window.__IDP.thaw());
  }

  if (phases.includes('realfire')) {
    const res = await page.evaluate(async () => {
      const { D, camAt, freeze } = window.__IDP;
      D.startBattle('m1a2');
      D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false });
      // teleport the nearest live enemy 55 m ahead of the player, flat side-on
      const p = D.game.player;
      const enemy = D.game.tanks.find((t) => !t.isPlayer && t.team === 'enemy' && t.visual && !t.combat.destroyed);
      if (!enemy) return { err: 'no enemy' };
      const yaw = p.state.yaw;
      enemy.state.pos.set(
        p.state.pos.x + Math.sin(yaw) * 55,
        enemy.state.pos.y,
        p.state.pos.z + Math.cos(yaw) * 55,
      );
      enemy.state.yaw = yaw + Math.PI / 2; // flat side toward the shooter
      enemy.state.speed = 0;
      // survival HP: a killed target CLEARS its decals (by design), which
      // would zero the very count this phase asserts on
      enemy.combat.hp = 99999;
      const kinds = [];
      D.bus.on('shell:hit', (e) => { if (e.targetId === enemy.id) kinds.push(e.kind); });
      D.aimAtNearest();
      D.fastForward(4); // gun settles
      const before = D.fx.impactDecalStats();
      for (let shots = 0; shots < 3; shots++) {
        D.flags.forceFire = true;
        let mine = false;
        for (let i = 0; i < 300; i++) {
          D.fastForward(1 / 60);
          if (D.game.shells.some((s) => s.isPlayer && !s.dead)) { mine = true; break; }
        }
        D.flags.forceFire = false;
        if (!mine) break;
        for (let i = 0; i < 300 && D.game.shells.some((s) => s.isPlayer && !s.dead); i++) D.fastForward(1 / 60);
        D.fastForward(0.3);
        D.aimAtNearest();
        D.fastForward(3);
      }
      const after = D.fx.impactDecalStats();
      // closeup of whatever the pipeline stamped (force-show for the capture:
      // an unspotted target's visual is hidden by the spotting system)
      const st = enemy.state;
      enemy.visual.setVisible(true);
      const look = D.rig.aimPoint.clone().set(st.pos.x, st.pos.y + enemy.spec.dims.heightM * 0.5, st.pos.z);
      const toP = D.rig.aimPoint.clone().set(p.state.pos.x - st.pos.x, 0, p.state.pos.z - st.pos.z).normalize();
      const cam = look.clone().addScaledVector(toP, 6.0); cam.y += 1.0;
      D.rig.setExternalPose(cam, look, 36);
      freeze();
      enemy.visual.setVisible(true);
      return { kinds, before, after, enemyId: enemy.id, hp: enemy.combat.hp };
    });
    console.log('[impact-decals] realfire:', JSON.stringify(res));
    await sleep(2400);
    await shot('realfire_closeup');
    if (!res.err) {
      const gained = res.after.decals - (res.before.decals || 0);
      const landed = (res.kinds || []).filter((k) => ['pen', 'he_pen', 'ricochet', 'nonpen', 'era', 'he_splash'].includes(k)).length;
      if (landed > 0 && gained <= 0) throw new Error(`real hits landed (${res.kinds}) but no decals stamped`);
      console.log(`[impact-decals] realfire kinds=${res.kinds} decals+${gained}`);
    }
    await page.evaluate(() => window.__IDP.thaw());
  }

  if (phases.includes('wreck')) {
    const res = await page.evaluate(() => {
      const { D, hit, sidePoint } = window.__IDP;
      D.startBattle('m1a2');
      D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false });
      D.fastForward(0.6);
      const enemy = D.game.tanks.find((t) => !t.isPlayer && t.team === 'enemy' && t.visual && !t.combat.destroyed);
      if (!enemy) return { err: 'no enemy' };
      const n = [1, 0, 0];
      for (let i = 0; i < 6; i++) {
        hit(enemy, i % 2 ? 'pen' : 'ricochet', sidePoint(enemy, 0.2 + 0.12 * i, 0.5), n,
          [-0.7, 0, -0.7], 120, i % 2 ? {} : { impactAngleDeg: 75 });
      }
      const withDecals = D.fx.impactDecalStats();
      // kill ONLY this tank through the exact announce ordering the game
      // uses (setDestroyed BEFORE tank:destroyed — the order that used to
      // burn-swap the old scar quads into opaque black rhombi); sparing the
      // rest of the roster keeps the battle (and the capture) alive
      enemy.combat.hp = 0;
      enemy.combat.destroyed = true;
      enemy._destroyedAnnounced = true;
      enemy.visual.setDestroyed();
      D.bus.emit('tank:destroyed', {
        id: enemy.id, specId: enemy.specId,
        pos: [enemy.state.pos.x, enemy.state.pos.y, enemy.state.pos.z],
        killerId: D.game.player ? D.game.player.id : null, cause: 'shot',
      });
      const afterKill = D.fx.impactDecalStats();
      // any decal mesh still parented under this wreck?
      let strays = 0;
      enemy.visual.root.traverse((o) => { if (o.name === 'fx_impactDecals') strays++; });
      window.__IDP_WRECK = enemy.id;
      return { enemyId: enemy.id, withDecals, afterKill, strays };
    });
    console.log('[impact-decals] wreck:', JSON.stringify(res));
    if (!res.err) {
      if (res.withDecals.decals < 6) throw new Error('staging failed: <6 decals before kill');
      if (res.strays > 0) throw new Error(`wreck still carries ${res.strays} decal mesh(es)`);
    }
    // let the destruction fx + burn sweep play in live time, THEN pose the
    // camera (posing before would be overridden by the live chase rig)
    await sleep(2800);
    await page.evaluate(() => {
      const { D, camAt, freeze } = window.__IDP;
      const enemy = D.game.tankById.get(window.__IDP_WRECK);
      enemy.visual.setVisible(true); // unspotted wrecks stay hidden otherwise
      camAt(enemy, [0, enemy.spec.dims.heightM * 0.5, 0], 6.5, 1.4, 1.2, 40);
      freeze();
    });
    await sleep(500);
    await shot('wreck_cleared');
    await page.evaluate(() => window.__IDP.thaw());
  }

  if (phases.includes('perf')) {
    const res = await page.evaluate(async () => {
      const { D, hit, sidePoint } = window.__IDP;
      D.startBattle('m1a2');
      D.fastForward(0.6);
      const enemy = D.game.tanks.find((t) => !t.isPlayer && t.team === 'enemy' && t.visual && !t.combat.destroyed);
      if (!enemy) return { err: 'no enemy' };
      // fill the ring: 24 live decals on one vehicle (30 stamps -> cap 24)
      const n = [1, 0, 0];
      for (let i = 0; i < 30; i++) {
        const fam = i % 3;
        hit(enemy, fam === 0 ? 'pen' : fam === 1 ? 'ricochet' : 'he_splash',
          sidePoint(enemy, (i % 10) / 10, ((i * 37) % 100) / 100), n,
          [-0.6, 0, -0.8], 90 + (i % 3) * 30, fam === 1 ? { impactAngleDeg: 74 } : { damage: 30 });
      }
      const stats = D.fx.impactDecalStats();
      D.game.phase = 'shot';
      D.fx.setFrozen(true, D.game.timeS);
      // camera close enough that the decal quads rasterize meaningfully
      const st = enemy.state;
      const look = D.rig.aimPoint.clone().set(st.pos.x, st.pos.y + 1.2, st.pos.z);
      const cam = look.clone(); cam.x += 7; cam.y += 1.2; cam.z += 2;
      D.rig.setExternalPose(cam, look, 40);
      const gl = D.renderer.getContext();
      const px = new Uint8Array(4);
      const meshes = [];
      D.scene.traverse((o) => { if (o.name === 'fx_impactDecals') meshes.push(o); });
      function bench(frames) {
        // warm
        for (let i = 0; i < 12; i++) D.post.render(0);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const times = [];
        for (let i = 0; i < frames; i++) {
          const t0 = performance.now();
          D.post.render(0);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // GPU sync
          times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        return times[Math.floor(times.length / 2)];
      }
      D.post.render(0);
      const callsOn = D.renderer.info.render.calls;
      const on = bench(140);
      for (const m of meshes) m.visible = false;
      D.post.render(0);
      const callsOff = D.renderer.info.render.calls;
      const off = bench(140);
      for (const m of meshes) m.visible = true;
      return {
        stats, meshCount: meshes.length,
        medianOnMs: +on.toFixed(3), medianOffMs: +off.toFixed(3),
        deltaMs: +(on - off).toFixed(3),
        drawCallsOn: callsOn, drawCallsOff: callsOff,
      };
    });
    console.log('[impact-decals] perf:', JSON.stringify(res));
    await shot('perf_24_decals');
    await page.evaluate(() => window.__IDP.thaw());
  }

  if (errs.length) {
    console.error('[impact-decals] CONSOLE ERRORS:');
    for (const e of errs) console.error('  ' + e);
    process.exitCode = 1;
  } else {
    console.log('[impact-decals] no console errors');
  }
} catch (err) {
  console.error('[impact-decals] FAIL:', err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
