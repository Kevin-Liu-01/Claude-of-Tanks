#!/usr/bin/env node
// Air Support's look and the strike marks' cost (air-support-270). One capture hold (tools/capture-hold.mjs runWarmHold):
// the warm, outside the lock, starts a dev server and a guarded browser and brings two pages into an Air Support battle
// on Verdant (a desktop page, and a phone-tier page at a phone's landscape viewport); the hold only stages and shoots.
//
//   node tools/air-support-shots.mjs --out=DIR [--map=verdant] [--only=desktop|phone] [--no-perf] [--aircraft]
//     [--gauntlet] [--locale=en-US|zh-CN]
//
// Shots (DIR/*.png): the strip in third person; the strike view's binoculars with each call-in's reticle on the ground;
// each strike from a camera over its mark (the recon jet's pass, the barrage, the strafing jet's run, the bomb, the AC-130
// in its orbit); the phone's strip, binoculars and CALL. Receipt (DIR/air-support-shots.json): every call accepted and
// the page's errors; with perf, the phone tier's GPU frame time with eight marks up against none, paired and alternated
// (the post chain's own timer, engine/gpuFrameTimer.ts), and the same on the desktop page.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { runWarmHold, rememberWarm, rewarmPage, stubViteSocket } from './capture-hold.mjs';
import { datumProblems } from './datum-census.mjs';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mapProbeLaunchOptions, mapProbeServerOptions, beginSoloBattle, sleep } from './map-probe-runtime.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const out = path.resolve(arg('out', '.qa-dev/air-support'));
const mapId = arg('map', 'verdant');
const only = arg('only');
const perf = !argv.includes('--no-perf');
// --aircraft: the desktop page films the aircraft (shootAircraft) in place of the strip, views and strikes
const aircraft = argv.includes('--aircraft');
// --gauntlet: the UI gauntlet's frames (UI-GAUNTLET.md): each page through its sizes, three states each, in --locale
const gauntlet = argv.includes('--gauntlet');
const locale = arg('locale', 'en-US');
const GAUNTLET_SIZES = {
  desktop: [[2560, 1440], [1920, 1080], [1440, 900], [1280, 800], [1024, 600], [900, 700]],
  phone: [[844, 390], [390, 844]],
};
mkdirSync(out, { recursive: true });
const root = process.cwd();
const receipt = { map: mapId, locale, shots: [], calls: [], errors: {}, perf: {}, gauntlet: {} };

const VIEWPORTS = {
  desktop: { width: 1600, height: 900 },
  phone: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const TIERS = { desktop: 'desktop', phone: 'phone' };

/** In the page: the player's points to the cap, the nearest enemy parked 260 m ahead (the marks' subject). */
const stage = () => {
  const D = window.__DEBUG, game = D.game, air = game.matchModeController.airSupport;
  const saved = air.capture();
  saved.points = saved.points.map(([id, value]) => [id, id === game.player.id ? air.rules.points.cap : value]);
  air.restore(saved);
  const p = game.player.state.pos, yaw = game.player.state.yaw;
  const enemy = game.tanks.find((t) => t.team !== game.player.team && !t.combat.destroyed);
  const x = p.x + Math.sin(yaw) * 260, z = p.z + Math.cos(yaw) * 260;
  if (enemy) { enemy.state.pos.set(x, D.world.heightField.getHeightAt(x, z), z); enemy.state.speed = 0; }
  return { x, z, yaw, px: p.x, pz: p.z };
};

/** The pause panel a thawed page can come back under (its visibility changed): resumed before every shot. */
const resume = (page) => page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((b) => /^\s*resume\s*$/i.test(b.textContent ?? '') && b.offsetParent);
  button?.click();
  return !!button;
});
const shot = async (page, name) => {
  if (await resume(page)) await sleep(300);
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  receipt.shots.push(name);
};

async function shootDesktop(page, signal, tag) {
  const spot = await page.evaluate(stage);
  await sleep(600);
  await shot(page, `${tag}-strip`);
  for (const kind of ['bomb', 'strafe', 'gunship', 'artillery', 'recon']) {
    if (signal.aborted) return;
    await page.evaluate((kind) => window.__DEBUG.bus.emit('ui:strikePick', { kind }), kind);
    await sleep(kind === 'bomb' ? 1200 : 700);
    // the binoculars laid on the parked enemy 260 m out (the scope opens on the gun's line, often into the near grass)
    await page.evaluate((spot) => {
      const D = window.__DEBUG, p = D.game.player.state.pos, hf = D.world.heightField;
      const pitch = Math.atan2(hf.getHeightAt(spot.x, spot.z) - (p.y + 2.6), 260);
      D.rig.snapSniper(4, Math.atan2(spot.x - p.x, spot.z - p.z), pitch);
    }, spot);
    await sleep(500);
    await shot(page, `${tag}-view-${kind}`);
  }
  // each call-in on the mark ahead, filmed from a camera over the mark; the next waits for the side's air
  for (const kind of ['recon', 'artillery', 'strafe', 'bomb', 'gunship']) {
    if (signal.aborted) return;
    // the strike is called straight on the parked enemy (the strike view's own call is the receipts' and the view shots'):
    // the film's subject is the strike, framed on its mark
    const accepted = await page.evaluate((kind) => {
      const D = window.__DEBUG, game = D.game, air = game.matchModeController.airSupport;
      const saved = air.capture();
      saved.points = saved.points.map(([id, value]) => [id, id === game.player.id ? air.rules.points.cap : value]);
      air.restore(saved);
      const p = game.player.state.pos, yaw = game.player.state.yaw;
      const x = p.x + Math.sin(yaw) * 260, z = p.z + Math.cos(yaw) * 260;
      const before = air.capture().strikes.length;
      const ok = air.requestStrike(game.player.id, kind, x, z, game.timeS);
      const mine = air.capture().strikes.filter((s) => s.callerId === game.player.id);
      return ok ? { ...mine[mine.length - 1], before, player: [p.x, p.z] } : null;
    }, kind);
    receipt.calls.push({ kind, accepted: !!accepted, mark: accepted ? [accepted.x, accepted.z] : null, player: accepted?.player ?? null });
    if (!accepted) continue;
    await page.evaluate(() => window.__DEBUG.bus.emit('ui:strikeViewClose', {}));
    const film = async (name, atS, cam) => {
      await page.waitForFunction((t) => window.__DEBUG.game.timeS >= t, { timeout: 60_000, polling: 100 }, atS);
      await page.evaluate((s, cam) => {
        const D = window.__DEBUG, V = D.camera.position.constructor, hf = D.world.heightField;
        const y = hf.getHeightAt(s.x, s.z);
        D.rig.setExternalPose(new V(s.x + cam[0], y + cam[1], s.z + cam[2]), new V(s.x, y + cam[3], s.z), cam[4] ?? 55);
      }, accepted, cam);
      await sleep(350);
      await shot(page, `${tag}-${kind}-${name}`);
    };
    const h = accepted.heading, back = [-Math.sin(h) * 140 + Math.cos(h) * 90, 45, -Math.cos(h) * 140 - Math.sin(h) * 90, 8];
    if (kind === 'gunship') {
      await film('orbit', accepted.landsS + 3, [140, 30, 140, 150, 60]);
      await film('fire', accepted.landsS + 6, back);
    } else if (kind === 'recon') {
      await film('pass', accepted.landsS - 0.2, back);
    } else {
      // the footprint from overhead while its warning runs (the targeted side's view of the danger)
      await film('footprint', accepted.calledS + 1.2, [0.01, 170, 0.01, 0, 60]);
      await film('warning', accepted.calledS + 1.6, back);
      await film('inbound', accepted.landsS - (kind === 'bomb' ? 1.2 : 0.6), back);
      await film('impact', accepted.landsS + (kind === 'artillery' ? 2 : 0.35), back);
    }
    await page.evaluate(() => window.__DEBUG.rig.release());
    await page.waitForFunction((end) => window.__DEBUG.game.timeS >= end, { timeout: 90_000, polling: 250 },
      Math.min(accepted.endS, accepted.landsS + 6));
  }
}

/**
 * The aircraft as a crew would find them (owner 2026-11-06: "show me what our planes look like if u were to try to look
 * for them"): each flying call-in on the mark ahead, filmed from the crew's own hatch looking up at it (the plain eye),
 * through the binoculars' field of view, and from a chase camera beside it with the HUD off. Every shot calls its own
 * strike (points and cooldowns restored) and a page-side follow loop re-aims the pinned camera at the airframe each
 * frame, so a jet stays framed however late a loaded page takes the shot.
 */
async function shootAircraft(page, signal, tag) {
  await page.evaluate(stage);
  await page.evaluate(() => {
    const D = window.__DEBUG, V = D.camera.position.constructor;
    const eye = new V(), at = new V(), dir = new V();
    const style = document.createElement('style');
    style.textContent = 'html.as-hud-hidden :is(.cot-hud,.cot-dp,.cot-si-stats,.cot-hints,.cot-medal-toasts,.cot-touch,'
      + '.cot-mode-status,.cot-mp-strip,.cot-strike-rack,.cot-binoculars,.cot-strike-warning){display:none!important}';
    document.head.append(style);
    /** The followed airframe: a jet by its strike's own name; the AC-130's sits beside its anchor (the visible one
     *  nearest the mark). */
    window.__airCraft = (f) => {
      if (!f) return null;
      if (!f.gunship) { const o = D.scene.getObjectByName(f.name); return o?.visible ? o : null; }
      let craft = null, best = Infinity;
      D.scene.traverseVisible((o) => {
        if (o.name !== 'AC-130 gunship') return;
        const d = Math.hypot(o.position.x - f.x, o.position.z - f.z);
        if (d < best) { best = d; craft = o; }
      });
      return craft;
    };
    window.__airFollow = null;
    const loop = () => {
      const f = window.__airFollow;
      const craft = window.__airCraft(f);
      if (craft) {
        craft.getWorldPosition(at);
        if (f.from === 'crew') {
          const p = D.game.player.state.pos;
          eye.set(p.x, p.y + 4.2, p.z);
        } else {
          // beside the airframe: behind its heading, off its port side and above it
          craft.getWorldDirection(dir);
          dir.y = 0; dir.normalize();
          eye.set(at.x - dir.x * f.back + dir.z * f.side, at.y + f.up, at.z - dir.z * f.back - dir.x * f.side);
        }
        D.rig.setExternalPose(eye, at, f.fov);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const call = (kind) => page.evaluate((kind) => {
    const D = window.__DEBUG, game = D.game, air = game.matchModeController.airSupport;
    const saved = air.capture();
    saved.points = saved.points.map(([id, value]) => [id, id === game.player.id ? air.rules.points.cap : value]);
    saved.cooldowns = saved.cooldowns.filter(([key]) => !key.startsWith(`${game.player.id}:`));
    air.restore(saved);
    const p = game.player.state.pos, yaw = game.player.state.yaw;
    const x = p.x + Math.sin(yaw) * 260, z = p.z + Math.cos(yaw) * 260;
    const ok = air.requestStrike(game.player.id, kind, x, z, game.timeS);
    const mine = air.capture().strikes.filter((s) => s.callerId === game.player.id);
    return ok ? mine[mine.length - 1] : null;
  }, kind);
  const SHOTS = {
    strafe: [['eye', 'crew', 55, 900], ['binoculars', 'crew', 8, 1400], ['close', { back: 16, side: 9, up: 4 }, 42],
      ['firing', { back: 20, side: 10, up: 3 }, 50, null, 'firing']],
    bomb: [['eye', 'crew', 55, 900], ['binoculars', 'crew', 8, 1400], ['close', { back: 16, side: 9, up: 4 }, 42]],
    gunship: [['eye', 'crew', 55], ['binoculars', 'crew', 6], ['close', { back: 40, side: 32, up: 10 }, 45]],
  };
  for (const [kind, shots] of Object.entries(SHOTS)) {
    for (const [label, from, fov, withinM, when] of shots) {
      if (signal.aborted) return;
      // a fresh strike for each shot (the side's air may be full of the bots' own for a while)
      let accepted = null;
      for (let tries = 0; !accepted && tries < 120 && !signal.aborted; tries++) {
        accepted = await call(kind);
        if (!accepted) await sleep(1500);
      }
      receipt.calls.push({ kind, label, accepted: !!accepted });
      if (!accepted) continue;
      await page.evaluate(() => window.__DEBUG.bus.emit('ui:strikeViewClose', {}));
      const follow = { name: `air-support ${kind === 'gunship' ? 'gunship' : 'jet'} ${accepted.id}`, gunship: kind === 'gunship',
        x: accepted.x, z: accepted.z, fov, ...(from === 'crew' ? { from } : { from: 'chase', ...from }) };
      const hud = from === 'crew';
      await page.evaluate((follow, hud) => {
        document.documentElement.classList.toggle('as-hud-hidden', !hud);
        window.__airFollow = follow;
      }, follow, hud);
      // the moment: a jet inside its range of the crew (or firing); the AC-130 settled into its orbit
      await page.waitForFunction((f, withinM, when, s) => {
        const D = window.__DEBUG, craft = window.__airCraft(f);
        if (!craft) return false;
        if (when === 'firing') return D.game.timeS >= s.landsS + 0.3;
        if (f.gunship) return D.game.timeS >= s.landsS + 2;
        if (!withinM) return D.game.timeS >= s.landsS - 1.4;
        const p = D.game.player.state.pos, w = craft.getWorldPosition(D.camera.position.clone());
        return Math.hypot(w.x - p.x, w.z - p.z) < withinM;
      }, { timeout: 90_000, polling: 50 }, follow, withinM ?? null, when ?? null, accepted);
      await sleep(150);
      await shot(page, `${tag}-${kind}-${label}`);
      await page.evaluate(() => { window.__airFollow = null; document.documentElement.classList.remove('as-hud-hidden'); window.__DEBUG.rig.release(); });
      await page.waitForFunction((end) => window.__DEBUG.game.timeS >= end, { timeout: 120_000, polling: 250 },
        Math.min(accepted.endS, accepted.landsS + 6));
    }
  }
}

/** In the page: Air Support's surfaces cut or spilling off the screen, and any of their plates over another opaque HUD
 *  plate or control (ancestors, descendants and full-screen layers aside). */
const surfaceCheck = () => {
  const vw = innerWidth, vh = innerHeight;
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width >= 1;
  const name = (el) => `${el.tagName.toLowerCase()}${el.classList.length ? `.${[...el.classList].join('.')}` : ''}`;
  const mine = [...document.querySelectorAll('.cot-strike-rack, .strike-support, .cot-binoculars .binocular-readout, '
    + '.cot-binoculars .binocular-hint, .cot-strike-warning, .binocular-call, .binocular-close')].filter(shown);
  const clipped = [], off = [], overlaps = [];
  for (const root of mine) {
    const r = root.getBoundingClientRect();
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) off.push(name(root));
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (!shown(el) || !el.textContent.trim() || el.closest('.tip')) continue;
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') clipped.push(`${name(el)} "${el.textContent.trim()}"`);
    }
  }
  const opaque = (el) => {
    const cs = getComputedStyle(el);
    return el.tagName === 'BUTTON' || cs.backgroundImage !== 'none' || !/rgba\([^)]*,\s*0\)|transparent/.test(cs.backgroundColor);
  };
  const others = [...document.querySelectorAll('body *')].filter((el) => {
    if (!shown(el) || mine.some((m) => m.contains(el) || el.contains(m))) return false;
    if (el.closest('.cot-binoculars, .tip, canvas') || el.tagName === 'CANVAS') return false;
    const r = el.getBoundingClientRect();
    return r.width < vw * 0.9 && r.height < vh * 0.9 && r.width * r.height >= 300 && opaque(el);
  });
  for (const m of mine) {
    const a = m.getBoundingClientRect();
    for (const o of others) {
      const b = o.getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 1 && h > 1) overlaps.push(`${name(m)} x ${name(o)} (${Math.round(w)}x${Math.round(h)})`);
    }
  }
  for (const a of mine) for (const b of mine) {
    if (a === b || a.contains(b) || b.contains(a) || a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 1 && h > 1) overlaps.push(`${name(a)} x ${name(b)} (${Math.round(w)}x${Math.round(h)})`);
  }
  return { clipped, off, overlaps: [...new Set(overlaps)].slice(0, 40) };
};

/**
 * The UI gauntlet (UI-GAUNTLET.md; Main 2026-11-07): Support at rest, the binoculars with an enemy bomb coming in on
 * the crew (the call-in row, the readout, the keys and INCOMING), and the binoculars short of points with a barrage
 * reloading (the disabled states), at each of the page's sizes. Every frame carries the datum census and the surfaces'
 * own clip and overlap check. The enemy's bomb is struck off again before it lands.
 */
async function shootGauntlet(page, tag) {
  const spot = await page.evaluate(stage);
  await page.evaluate(() => {
    const D = window.__DEBUG, game = D.game, air = game.matchModeController.airSupport;
    const enemy = () => game.tanks.find((t) => t.team !== game.player.team && !t.combat.destroyed);
    window.__gx = {
      reset(points, cooling) {
        const s = air.capture();
        s.strikes = [];
        s.points = s.points.filter(([id]) => id !== game.player.id).concat([[game.player.id, points]]);
        s.cooldowns = s.cooldowns.filter(([key]) => !key.startsWith(`${game.player.id}:`))
          .concat(cooling.map((kind) => [`${game.player.id}:${kind}`, game.timeS + air.rules[kind].cooldownS * 0.6]));
        air.restore(s);
      },
      incoming() {
        const foe = enemy();
        if (!foe) return false;
        const s = air.capture();
        s.points = s.points.filter(([id]) => id !== foe.id).concat([[foe.id, air.rules.points.cap]]);
        // (g1: the first size's call left the foe's bomb cooling, so every later size had nothing incoming)
        s.cooldowns = s.cooldowns.filter(([key]) => !key.startsWith(`${foe.id}:`));
        air.restore(s);
        const p = game.player.state.pos;
        return air.requestStrike(foe.id, 'bomb', p.x, p.z, game.timeS);
      },
    };
  });
  const frame = async (name) => {
    const file = `${tag}-${locale}-${name}`;
    // (g3: a focus loss on a loaded machine raised the pause veil over one frame; the veil is not this surface)
    if (await page.evaluate(() => { const go = document.querySelector('.cot-resume.show .rz-go'); go?.click(); return !!go; })) await sleep(600);
    await shot(page, file);
    receipt.gauntlet[file] = { ...(await page.evaluate(surfaceCheck)), datum: await datumProblems(page) };
  };
  const aim = () => page.evaluate((spot) => {
    const D = window.__DEBUG, p = D.game.player.state.pos, hf = D.world.heightField;
    D.rig.snapSniper(4, Math.atan2(spot.x - p.x, spot.z - p.z), Math.atan2(hf.getHeightAt(spot.x, spot.z) - (p.y + 2.6), 260));
  }, spot);
  for (const [width, height] of GAUNTLET_SIZES[tag]) {
    await page.setViewport({ ...VIEWPORTS[tag], width, height });
    await sleep(1500);
    const size = `${width}x${height}`;
    await page.evaluate(() => { window.__gx.reset(window.__DEBUG.game.matchModeController.airSupport.rules.points.cap, []); window.__DEBUG.bus.emit('ui:strikeViewClose', {}); });
    await sleep(900);
    await frame(`${size}-rest`);
    await page.evaluate(() => window.__DEBUG.bus.emit('ui:strikePick', { kind: 'strafe' }));
    await sleep(900);
    await aim();
    // (g3: one size's request was refused under load; ask once more before the frame)
    const incoming = await page.evaluate(() => window.__gx.incoming()) || (await sleep(400), await page.evaluate(() => window.__gx.incoming()));
    receipt.calls.push({ size, kind: 'bomb', incoming });
    await sleep(700);
    await frame(`${size}-view`);
    await page.evaluate(() => { window.__gx.reset(350, ['artillery']); window.__DEBUG.bus.emit('ui:strikePick', { kind: 'bomb' }); });
    await sleep(700);
    await aim();
    await sleep(300);
    await frame(`${size}-view-short`);
    await page.evaluate(() => window.__DEBUG.bus.emit('ui:strikeViewClose', {}));
  }
}

/**
 * Paired GPU frame time: eight marks up against none, alternated. Every animation-frame callback's GL work is timed with
 * its own TIME_ELAPSED query (EXT_disjoint_timer_query_webgl2; the post chain's governor timer pauses once it pins), so
 * a pair compares the whole frame's GPU time with and without the marks' term. Null without the extension.
 */
async function measureMarks(page, tag) {
  return page.evaluate(async () => {
    const marks = await import('/src/engine/strikeMarks.ts');
    const D = window.__DEBUG, gl = D.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return { timer: false };
    const p = D.game.player.state.pos, yaw = D.game.player.state.yaw;
    const list = Array.from({ length: marks.STRIKE_MARK_MAX }, (_, i) => ({
      x: p.x + Math.sin(yaw) * (60 + i * 25), y: p.y, z: p.z + Math.cos(yaw) * (60 + i * 25),
      shape: ['circle', 'lane', 'orbit', 'aim-circle'][i % 4], sizeA: i % 4 === 1 ? 70 : i % 4 === 2 ? 140 : 30, sizeB: 12,
      heading: yaw, r: 0.2, g: 0.5, b: 1, urgency: 0.5,
    }));
    const pending = [], done = [];
    let label = 'off';
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => {
      if (label === 'on') marks.setStrikeMarks(list, t / 1000); else marks.clearStrikeMarks();
      const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      try { cb(t); } finally { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push([q, label]); }
    });
    const poll = () => {
      while (pending.length && gl.getQueryParameter(pending[0][0], gl.QUERY_RESULT_AVAILABLE)) {
        const [q, l] = pending.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) done.push([l, Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6]);
        gl.deleteQuery(q);
      }
    };
    const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const pairs = [];
    for (let i = 0; i < 6; i++) {
      for (const which of ['off', 'on']) {
        label = which; done.length = 0;
        const until = performance.now() + 2000;
        while (performance.now() < until) { await new Promise((r) => setTimeout(r, 50)); poll(); }
        pairs.push({ which, ms: median(done.filter(([l]) => l === which).map(([, ms]) => ms)), n: done.length });
      }
    }
    window.requestAnimationFrame = raf;
    marks.clearStrikeMarks();
    const deltas = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) if (pairs[i].ms != null && pairs[i + 1].ms != null) deltas.push(pairs[i + 1].ms - pairs[i].ms);
    return { timer: true, pairs, medianDeltaMs: median(deltas), medianOffMs: median(pairs.filter((x) => x.which === 'off').map((x) => x.ms)),
      canvas: [D.renderer.domElement.width, D.renderer.domElement.height], preset: D.quality?.resolvePresetName?.() ?? null };
  }).then((result) => { receipt.perf[tag] = result; return result; });
}

let server = null;
await runWarmHold({
  label: 'air-support-270',
  place: `air-support-270-shots-${only ?? 'all'}`,
  // a battle page frozen in the queue is checked (and re-warmed if it reloaded) only past this
  maxFrozenMinutes: 30,
  warm: async () => {
    server = await createServer(mapProbeServerOptions(root, path.join(root, '.qa-dev/vite-air-support')));
    await server.listen();
    const port = server.httpServer.address().port;
    const browser = await launchGuardedBrowser(puppeteer, mapProbeLaunchOptions({ width: 1600, height: 900 }), { label: 'air-support-shots' });
    const pages = {};
    for (const tag of Object.keys(VIEWPORTS)) {
      if (only && only !== tag) continue;
      const errors = receipt.errors[tag] = [];
      // warmPage's own load, with the locale stored before the first document (i18n reads it once, at boot)
      const page = await browser.newPage();
      await page.setViewport(VIEWPORTS[tag]);
      await stubViteSocket(page);
      if (locale !== 'en-US') await page.evaluateOnNewDocument((value) => { try { localStorage.setItem('cot.locale', value); } catch {} }, locale);
      rememberWarm(page, {
        url: `http://127.0.0.1:${port}/?nosplash=1&tier=${TIERS[tag]}&gfxreset=1`, ready: 'window.__GAME_READY === true',
        after: (page) => beginSoloBattle(page, { specId: 'm1a1_abrams_hc', mapId, gameMode: 'air_support', settleMs: 2500, timeoutMs: 900_000 }),
      });
      await rewarmPage(page);
      page.on('pageerror', (error) => errors.push(String(error?.message ?? error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)); });
      pages[tag] = page;
    }
    return { pages: Object.values(pages), byTag: pages, close: async () => { await browser.close(); await server.close(); } };
  },
  shoot: async ({ byTag, signal }) => {
    if (gauntlet) {
      for (const tag of ['desktop', 'phone']) if (byTag[tag] && !signal.aborted) await shootGauntlet(byTag[tag], tag);
      return;
    }
    if (byTag.desktop && aircraft) {
      await shootAircraft(byTag.desktop, signal, 'aircraft');
    } else if (byTag.desktop) {
      await shootDesktop(byTag.desktop, signal, 'desktop');
      if (perf && !signal.aborted) await measureMarks(byTag.desktop, 'desktop');
    }
    if (byTag.phone && !signal.aborted) {
      const page = byTag.phone;
      await page.evaluate(stage);
      await sleep(600);
      await shot(page, 'phone-strip');
      await page.evaluate(() => window.__DEBUG.bus.emit('ui:strikePick', { kind: 'strafe' }));
      await sleep(1000);
      await shot(page, 'phone-view-strafe');
      await page.evaluate(() => window.__DEBUG.bus.emit('ui:strikeViewClose', {}));
      if (perf && !signal.aborted) await measureMarks(page, 'phone');
    }
  },
});
writeFileSync(path.join(out, `air-support-shots${gauntlet ? `-gauntlet-${locale}` : ''}${only ? `-${only}` : ''}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ shots: receipt.shots.length, calls: receipt.calls, perf: receipt.perf, errors: Object.fromEntries(Object.entries(receipt.errors).map(([k, v]) => [k, v.length])) }));
