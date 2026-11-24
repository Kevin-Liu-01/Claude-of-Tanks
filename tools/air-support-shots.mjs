#!/usr/bin/env node
// Air Support's look and the strike marks' cost (air-support-270). One capture hold (tools/capture-hold.mjs runWarmHold):
// the warm, outside the lock, starts a dev server and a guarded browser and brings two pages into an Air Support battle
// on Verdant (a desktop page, and a phone-tier page at a phone's landscape viewport); the hold only stages and shoots.
//
//   node tools/air-support-shots.mjs --out=DIR [--map=verdant] [--only=desktop|phone] [--no-perf] [--aircraft | --runs]
//     [--gauntlet --locale=en-US [--sizes=WxH,WxH]]
//     [--gauntlet] [--locale=en-US|zh-CN]
//   node tools/air-support-shots.mjs --out=DIR --close-box [--sizes=WxH,...]
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
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { closeBoxProblems, measureCloseBox, putBackOldClose } from './air-support-close-box.mjs';
import { mapProbeLaunchOptions, mapProbeServerOptions, beginSoloBattle, sleep } from './map-probe-runtime.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const out = path.resolve(arg('out', '.qa-dev/air-support'));
const mapId = arg('map', 'verdant');
const only = arg('only');
const perf = !argv.includes('--no-perf');
// --aircraft: the desktop page films the aircraft (shootAircraft) in place of the strip, views and strikes
const aircraft = argv.includes('--aircraft');
// --runs (air-support-runs-272): each call-in's run as a frame sequence (shootRuns): a chase camera behind the aircraft on
// its mark, wide frames across the run, the AC-130 and the battery from a fixed oblique; each frame logs where the
// airframe stands against its run (sim/strikeRuns.ts runPose) and the run's axis
const runs = argv.includes('--runs');
// --frames=close: only the run frames whose label holds that text (a re-shoot of a few frames)
const framesFilter = arg('frames');
// (air-support-275) --kinds=missile,bomb: only those runs; 'shootdown' (a strafing jet brought down on its way in, its fall
// and its burst) and 'warning' (an enemy's Maverick run called on the crew: the HUD on, the minimap's inbound aircraft and
// the INCOMING notice) are runs of their own; 'dronecrash' (air-crash-he-276: an FPV drone into the nearest building, its
// crash's burst and hole) only when named. --burst: each run as a frame every 0.1 s across its moments, named
// <tag>-<kind>-burst-NNN, for a clip (ffmpeg at 10 fps: real time)
const kindsFilter = arg('kinds')?.split(',') ?? null;
const burst = argv.includes('--burst');
// --close-box (air-support-close-276; Kevin 2026-11-23: "the x button shouldnt just appear and disappear. its part of the
// ui for air support"): at each size, Support at rest, a press of Support raising the binoculars and one lowering them
// (frames across each change, for a clip), the boxes judged by tools/air-support-close-box.mjs closeBoxProblems, and its
// negative control: the old standalone close put back in the page, which must fail. Exit 1 on any problem.
const closeBox = argv.includes('--close-box');
// --gauntlet: the UI gauntlet's frames (UI-GAUNTLET.md): each page through its sizes, three states each, in --locale
const gauntlet = argv.includes('--gauntlet');
const locale = arg('locale', 'en-US');
const GAUNTLET_SIZES = closeBox ? {
  // the desktop's full tray and its stacked one; the phone's two orientations and the iPad's (touch layouts)
  desktop: [[1920, 1080], [900, 700]],
  phone: [[390, 844], [844, 390], [820, 1180], [1180, 820]],
} : {
  desktop: [[2560, 1440], [1920, 1080], [1440, 900], [1280, 800], [1024, 600], [900, 700]],
  phone: [[844, 390], [390, 844]],
};
// --sizes=1920x1080,900x700: a re-capture of only the frames a change touches
const sizesArg = arg('sizes');
if (sizesArg) {
  const keep = new Set(sizesArg.split(','));
  for (const page of Object.keys(GAUNTLET_SIZES)) GAUNTLET_SIZES[page] = GAUNTLET_SIZES[page].filter(([w, h]) => keep.has(`${w}x${h}`));
}
mkdirSync(out, { recursive: true });
const root = process.cwd();
const receipt = { map: mapId, locale, shots: [], calls: [], errors: {}, perf: {}, gauntlet: {}, closeBox: {} };

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

/** The pause panel a thawed page can come back under (its visibility changed): resumed before every shot. (air-crash-he-276)
 *  A lost pointer lock can open the settings panel instead, which holds the battle paused: closed with Escape, its own key. */
const resume = async (page) => {
  const settingsOpen = await page.evaluate(() => !!document.querySelector('.cot-settings.open'));
  if (settingsOpen) { await page.keyboard.press('Escape'); await sleep(250); }
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => /^\s*resume\s*$/i.test(b.textContent ?? '') && b.offsetParent);
    button?.click();
    return !!button;
  });
  return settingsOpen || clicked;
};
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

/**
 * Each call-in's run as a frame sequence (air-support-runs-272; owner 2026-11-11: "planes need to follow proper actual
 * flight paths, be aligned with the explosion highlight areas, and the bomb dropping should be from a jet"). The strike is
 * called on the mark 260 m ahead; a page-side loop holds the camera each frame: `chase` behind the aircraft and above it,
 * aimed at the mark's ground (the jet and its highlight on one line when they agree), `side` across the run from its
 * right, `fixed` an oblique over the mark (the AC-130's ring, the battery). HUD off; the marks on the ground stay. Each
 * frame records its strike time and the airframe's offset from the run's predicted pose and from the run's axis.
 */
async function shootRuns(page, signal, tag, checkpoint) {
  await page.evaluate(stage);
  const battleState = () => page.evaluate(() => {
    const D = window.__DEBUG, g = D.game;
    // (air-support-275) why a clock stands: the shot mode, the pause veil, the page's visibility and focus, and the
    // full-screen layers shown
    const layers = [...document.querySelectorAll('body > *')].filter((el) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9 && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0;
    }).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 12);
    return { timeS: +g.timeS.toFixed(2), phase: g.phase, result: g.result ?? null, rig: D.rig.mode ?? null,
      camera: [D.camera.position.x, D.camera.position.y, D.camera.position.z].map((v) => +v.toFixed(0)),
      shotMode: D.shotMode, veil: !!document.querySelector('.cot-resume.show'), visibility: document.visibilityState,
      focus: document.hasFocus(), layers };
  });
  receipt.runStart = await battleState();
  await sleep(1500);
  receipt.runStart1500 = await battleState();
  console.log(`[air-support-shots] the battle at the start: ${JSON.stringify(receipt.runStart)}; 1.5 s later: ${JSON.stringify(receipt.runStart1500)}`);
  await page.evaluate(async () => {
    const D = window.__DEBUG, V = D.camera.position.constructor;
    window.__runs = await import('/src/sim/strikeRuns.ts');
    const style = document.createElement('style');
    style.textContent = 'html.as-hud-hidden :is(.cot-hud,.cot-dp,.cot-si-stats,.cot-hints,.cot-medal-toasts,.cot-touch,'
      + '.cot-mode-status,.cot-mp-strip,.cot-strike-rack,.cot-binoculars,.cot-strike-warning,.cot-strike-dock,.cot-battle-notices){display:none!important}';
    document.head.append(style);
    document.documentElement.classList.add('as-hud-hidden');
    const eye = new V(), at = new V(), dir = new V();
    window.__runCraft = (f) => {
      if (f.kind === 'artillery') return null;
      if (f.kind !== 'gunship') {
        // the A-10 (recon, strafe) or the fighter (bomb, missile: air-support-275)
        const o = D.scene.getObjectByName(`air-support jet ${f.id}`) ?? D.scene.getObjectByName(`air-support fighter ${f.id}`);
        return o?.visible ? o : null;
      }
      let craft = null, best = Infinity;
      D.scene.traverseVisible((o) => {
        if (o.name !== 'AC-130 gunship') return;
        const d = Math.hypot(o.position.x - f.x, o.position.z - f.z);
        if (d < best) { best = d; craft = o; }
      });
      return craft;
    };
    window.__runCam = null;
    // the battle's clock held at each frame's moment (the debug surface's shot mode: the sim stands, frames still draw),
    // so a loaded machine's slow screenshot never lets the run fly on past the frame
    window.__runFreezeAt = null; window.__runFrozen = false;
    // checked in the simulation's own step (the mode's air step runs every fixed step): a loaded page whose
    // requestAnimationFrame starves is ticked by the frame loop's fallback interval, where a rAF check never runs
    const air = D.game.matchModeController.airSupport, step = air.step;
    // (air-support-275) the shoot-down run: its strike brought down by the enemy at a set moment of its run
    window.__downAt = null;
    air.step = (timeS, held) => {
      step(timeS, held);
      const down = window.__downAt;
      if (down && timeS >= down.t) {
        window.__downAt = null;
        const strike = air.strikes.find((s) => s.id === down.id);
        if (strike) air.damageAircraft(strike, down.by, strike.hp, timeS);
      }
      if (window.__runFreezeAt != null && !window.__runFrozen && D.game.timeS >= window.__runFreezeAt) {
        D.shotMode = true; window.__runFrozen = true;
      }
    };
    const loop = () => {
      const f = window.__runCam;
      if (f) {
        const sinH = Math.sin(f.heading), cosH = Math.cos(f.heading);
        // run frame -> world: along (sinH, cosH), left (cosH, -sinH)
        const world = (out, a, l, u) => out.set(f.x + sinH * a + cosH * l, f.y + u, f.z + cosH * a - sinH * l);
        if (f.cam === 'chase') {
          // behind the aircraft where its run puts it now (the drawn airframe is checked against the run per frame)
          const R = D.game.matchModeController.airSupport.rules;
          const p = window.__runs.runPose(R, f, D.game.timeS, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
          dir.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
          eye.set(p.x - dir.x * f.back, p.y + f.up, p.z - dir.z * f.back);
          // aimed at the mark, or (aimNose) along the aircraft's nose: its dive line, the mark ahead on it
          if (f.aimNose) {
            const cp = Math.cos(p.pitch);
            at.set(p.x + Math.sin(p.yaw) * cp * 120, p.y + Math.sin(p.pitch) * 120, p.z + Math.cos(p.yaw) * cp * 120);
          } else world(at, 0, 0, 0);
          D.rig.setExternalPose(eye, at, f.fov);
        } else if (f.cam === 'beside') {
          // outside the aircraft's turn, behind it and a little above, on the aircraft (its bank onto the mark reads)
          const R = D.game.matchModeController.airSupport.rules;
          const p = window.__runs.runPose(R, f, D.game.timeS, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
          const ox = p.x - f.x, oz = p.z - f.z, o = Math.hypot(ox, oz) || 1;
          eye.set(p.x + ox / o * f.out - Math.sin(p.yaw) * f.back, p.y + f.up, p.z + oz / o * f.out - Math.cos(p.yaw) * f.back);
          at.set(p.x, p.y - 4, p.z);
          D.rig.setExternalPose(eye, at, f.fov);
        } else if (f.cam === 'side') {
          world(eye, f.along - 120, -f.out, f.up); world(at, f.along, 0, f.up * 0.35);
          D.rig.setExternalPose(eye, at, f.fov);
        } else if (f.cam === 'fixed') {
          world(eye, -f.out, -f.out, f.up); world(at, 0, 0, f.aimUp ?? 0);
          D.rig.setExternalPose(eye, at, f.fov);
        } else if (f.cam === 'site') {
          // (air-crash-he-276) on the crash site: where the downed strike's fall (sim/strikeRuns.ts crashFall) meets the
          // ground, or the drone run's wall point; from window.__siteFrom's side (default the run's south-east)
          if (!window.__crashSite && f.id != null) {
            const R = D.game.matchModeController.airSupport.rules, hf = D.world.heightField;
            const strike = D.game.matchModeController.airSupport.strikes.find((x) => x.id === f.id);
            if (strike?.downedS != null) {
              const q = { x: 0, y: 0, z: 0 };
              for (let t = 0; t < 30; t += 0.02) {
                window.__runs.crashFall(R, strike, strike.downedS, strike.downedS + t, q);
                if (q.y <= hf.getHeightAt(q.x, q.z)) { window.__crashSite = { x: q.x, y: hf.getHeightAt(q.x, q.z), z: q.z }; break; }
              }
            }
          }
          const c = window.__crashSite, hf = D.world.heightField;
          if (c && !window.__siteFrom) {
            // the side whose ground stays furthest below the line of sight (a hill between hides the hole)
            let best = -Infinity;
            for (let k = 0; k < 16; k++) {
              const a = (k / 16) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
              let clear = Infinity;
              for (let i = 1; i <= 12; i++) {
                const s = i / 12, x = c.x + dx * 40 * s, z = c.z + dz * 40 * s;
                clear = Math.min(clear, c.y + 12 * s - hf.getHeightAt(x, z));
              }
              if (clear > best) { best = clear; window.__siteFrom = { x: dx, z: dz }; }
            }
          }
          if (c) {
            const from = window.__siteFrom ?? { x: 0.8, z: 0.6 };
            const ex = c.x + from.x * f.out, ez = c.z + from.z * f.out;
            eye.set(ex, Math.max(c.y + f.up, hf.getHeightAt(ex, ez) + 3), ez); at.set(c.x, c.y + (f.aimUp ?? 0), c.z);
            D.rig.setExternalPose(eye, at, f.fov);
          }
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const call = (run) => page.evaluate((run) => {
    const D = window.__DEBUG, game = D.game, air = game.matchModeController.airSupport;
    // 'shootdown' flies a strafing run; 'warning' is an enemy's Maverick run on the crew's own hull
    const kind = run === 'shootdown' ? 'strafe' : run === 'warning' ? 'missile' : run;
    const enemy = game.tanks.find((t) => t.team !== game.player.team && !t.combat.destroyed);
    const caller = run === 'warning' ? enemy : game.player;
    if (!caller) return null;
    const saved = air.capture();
    saved.points = saved.points.map(([id, value]) => [id, id === caller.id ? air.rules.points.cap : value]);
    saved.cooldowns = saved.cooldowns.filter(([key]) => !key.startsWith(`${caller.id}:`));
    // the side's air cleared of the bots' own calls: the film's one strike is the only one up
    saved.strikes = [];
    air.restore(saved);
    const p = game.player.state.pos, yaw = game.player.state.yaw;
    let x = p.x + Math.sin(yaw) * 260, z = p.z + Math.cos(yaw) * 260;
    if (run === 'shootdown') {
      // (air-crash-he-276b) toward the map's middle and further in: struck before its gun opens, the jet falls ~490 m
      // short of its mark, so the wreck comes down inside the terrain square, where the drawn ground is the dug terrain
      // (beyond ±512 m the horizon ring draws it, undug, and no hull ever stands there)
      const d = Math.hypot(p.x, p.z) || 1;
      x = p.x - (p.x / d) * 650; z = p.z - (p.z / d) * 650;
    }
    if (run === 'warning') {
      // the enemy 600 m ahead calls on our hull: its fighter comes in over its shoulder, toward us
      const ex = p.x + Math.sin(yaw) * 600, ez = p.z + Math.cos(yaw) * 600;
      caller.state.pos.set(ex, D.world.heightField.getHeightAt(ex, ez), ez); caller.state.speed = 0;
      x = p.x; z = p.z;
    }
    const ok = air.requestStrike(caller.id, kind, x, z, game.timeS);
    const mine = air.capture().strikes.filter((s) => s.callerId === caller.id);
    const accepted = ok ? mine[mine.length - 1] : null;
    if (accepted && run === 'shootdown' && enemy) window.__downAt = { id: accepted.id, by: enemy.id, t: accepted.landsS - 1.6 };
    return accepted;
  }, run);
  const release = (kind) => (kind === 'bomb' ? page.evaluate(() => window.__runs.bombReleaseOffsetS(window.__DEBUG.game.matchModeController.airSupport.rules))
    : kind === 'missile' ? page.evaluate(() => window.__runs.missileLaunchOffsetS(window.__DEBUG.game.matchModeController.airSupport.rules, 0)) : 0);
  // each frame: [label, seconds from the warning's end, camera]
  const chase = { cam: 'chase', back: 70, up: 22, fov: 55 };
  const side = (along) => ({ cam: 'side', along, out: 560, up: 160, fov: 55 });
  // the close frames (Main, 2026-11-11: the wide ones read the aircraft small): the jet in its dive from close behind,
  // the bomber at the release with the bomb off its pylon, the AC-130 beside it outside its ring, banked onto the mark
  const close = { cam: 'chase', back: 24, up: 6, fov: 42 };
  const FRAMES = {
    strafe: [['dive-close', 0.45, close],['ingress', -3.2, chase], ['dive', -1.2, chase], ['open-fire', 0.15, chase], ['walking', 0.85, chase],
      ['walking-side', 0.9, side(-300)], ['cease', 1.6, chase], ['pull-out', 2.6, chase], ['egress', 5, chase]],
    bomb: [['release-close', 'release+0.15', { ...close, aimNose: true, back: 26, up: 7 }], ['dive', -3.4, chase], ['release', 'release+0.15', chase], ['release-side', 'release+0.35', side(-260)],
      ['falling', 'release+1.1', chase], ['falling-side', 'release+1.6', side(-160)], ['impact', 0.5, chase], ['egress', 4, chase]],
    gunship: [['orbit-close', 20, { cam: 'beside', out: 40, back: 30, up: 10, fov: 45 }], ['inbound', -4, { cam: 'fixed', out: 420, up: 320, fov: 50, aimUp: 60 }], ['roll-in', 0.8, { cam: 'fixed', out: 420, up: 320, fov: 50, aimUp: 60 }],
      ['orbit', 7, { cam: 'fixed', out: 420, up: 320, fov: 50, aimUp: 60 }], ['orbit-chase', 12, { cam: 'chase', back: 60, up: 20, fov: 60 }],
      ['orbit-late', 22, { cam: 'fixed', out: 420, up: 320, fov: 50, aimUp: 60 }], ['roll-out', 31.5, { cam: 'fixed', out: 420, up: 320, fov: 50, aimUp: 60 }]],
    // (air-support-275) the Maverick run: the fighter close behind as its first missile leaves the rail, the ripple, the
    // missiles' lines from the side, the hits on the mark
    missile: [['launch-close', 'release+0.12', { ...close, aimNose: true, back: 26, up: 6 }], ['dive', -5, chase], ['launch', 'release+0.12', chase],
      ['ripple', 'release+1.25', chase], ['ripple-side', 'release+1.1', side(-500)], ['impact', 0.75, { cam: 'fixed', out: 120, up: 70, fov: 50 }],
      ['egress', 4.5, chase]],
    // a strafing A-10 brought down 1.6 s before its gun would open: struck, falling, its burst at the ground
    shootdown: [['struck', -1.5, { cam: 'chase', back: 60, up: 18, fov: 55 }], ['falling', 0.2, { cam: 'fixed', out: 380, up: 140, fov: 55, aimUp: 40 }],
      // (air-crash-he-276) on the crash site: the last of the fall, the burst, its hole and the airframe burning in it
      // (the burst's dust stands over the hole for ~30 s: the hole frames after it, looking down past the hills)
      ['falling-late', 3.2, { cam: 'site', out: 110, up: 30, fov: 50, aimUp: 30 }], ['crash', 3.95, { cam: 'site', out: 110, up: 30, fov: 50, aimUp: 12 }],
      ['crash-late', 4.6, { cam: 'site', out: 110, up: 30, fov: 50, aimUp: 12 }],
      ['wreck-burning', 30, { cam: 'site', out: 48, up: 10, fov: 40, aimUp: 2 }], ['wreck-low', 32, { cam: 'site', out: 30, up: 3, fov: 45, aimUp: 3 }],
      ['hole', 60, { cam: 'site', out: 10, up: 55, fov: 45 }],
      ['hole-close', 61, { cam: 'site', out: 26, up: 12, fov: 50, aimUp: 1 }], ['wreck-late', 62, { cam: 'site', out: 48, up: 10, fov: 40, aimUp: 2 }]],
    // the crew's own view (the HUD on: the minimap's inbound fighter and its approach line, the INCOMING notice)
    warning: [['called', -5.2, { cam: 'hud' }], ['inbound', -3, { cam: 'hud' }], ['inbound-late', -1, { cam: 'hud' }]],
    artillery: [['warning', -3, { cam: 'fixed', out: 260, up: 160, fov: 45 }], ['first', 0.2, { cam: 'fixed', out: 260, up: 160, fov: 45 }],
      ['barrage', 2.5, { cam: 'fixed', out: 260, up: 160, fov: 45 }], ['last', 5, { cam: 'fixed', out: 260, up: 160, fov: 45 }]],
  };
  // --burst: a frame every 0.1 s across each run's moments on one camera (its first frame's), for a clip
  const BURSTS = {
    strafe: [-1.2, 2.6, chase], bomb: ['release-0.4', 'release+2.7', { ...chase, back: 90, up: 30 }], missile: ['release-0.6', 'release+4.6', { ...chase, back: 90, up: 26 }],
    shootdown: [-1.2, 6.6, { cam: 'site', out: 150, up: 45, fov: 52, aimUp: 25 }], gunship: [0, 6, { cam: 'beside', out: 40, back: 30, up: 10, fov: 45 }],
  };
  const burstFrames = (kind) => {
    const [from, to, cam] = BURSTS[kind];
    const rel = (when) => (typeof when === 'string' ? { base: 'release', dt: Number(when.slice('release'.length)) } : { base: null, dt: when });
    const a = rel(from), b = rel(to), out = [];
    for (let i = 0, t = a.dt; t <= b.dt + 1e-9 && i < 80; i++, t = a.dt + i * 0.1) {
      out.push([`burst-${String(i).padStart(3, '0')}`, a.base ? `release${t >= 0 ? '+' : ''}${t.toFixed(2)}` : +t.toFixed(2), cam]);
    }
    return out;
  };
  receipt.runs = [];
  // (air-crash-he-276) every burst, crater and building stage the runs raise, on the battle clock (the receipt's proof
  // that a crash is one HE detonation and that the drone's struck its building)
  await page.evaluate(() => {
    const D = window.__DEBUG, log = (window.__crashLog = []);
    for (const ev of ['munition:blast', 'terrain:crater', 'structure:stage', 'structure:breach']) {
      D.bus.on(ev, (e) => { if (log.length < 200) log.push({ ev, t: +D.game.timeS.toFixed(3), ...JSON.parse(JSON.stringify(e ?? {})) }); });
    }
  });
  // (air-crash-he-276) only when asked for: its burst leaves a damaged building in the later runs' battle
  if (kindsFilter?.includes('dronecrash')) await droneCrash(page, tag, { shot, resume, signal });
  for (const [kind, framesOf] of Object.entries(FRAMES)) {
    if (kindsFilter && !kindsFilter.includes(kind)) continue;
    const all = burst ? (BURSTS[kind] ? burstFrames(kind) : []) : framesOf;
    const frames = all.filter(([label]) => !framesFilter || label.includes(framesFilter));
    if (!frames.length) continue;
    if (signal.aborted) return;
    let accepted = null;
    for (let tries = 0; !accepted && tries < 60 && !signal.aborted; tries++) { accepted = await call(kind); if (!accepted) await sleep(1500); }
    receipt.calls.push({ kind, accepted: !!accepted });
    if (!accepted) continue;
    // the warning run is the crew's own view: the HUD on and the battle camera theirs
    await page.evaluate((on) => { document.documentElement.classList.toggle('as-hud-hidden', !on); }, kind === 'warning');
    const releaseOffset = await release(kind === 'warning' ? 'missile' : kind === 'shootdown' ? 'strafe' : kind);
    const at = (when) => (typeof when === 'string' ? releaseOffset + Number(when.slice('release'.length)) : when);
    // in time order: the clock only runs forward
    for (const [label, when, cam] of [...frames].sort((a, b) => at(a[1]) - at(b[1]))) {
      if (signal.aborted) return;
      const rel = at(when);
      const runKind = kind === 'shootdown' ? 'strafe' : kind === 'warning' ? 'missile' : kind;
      await page.evaluate((f) => { window.__runCam = f.cam === 'hud' ? null : f; if (f.cam === 'hud') window.__DEBUG.rig.release(); },
        { ...cam, id: accepted.id, kind: runKind, x: accepted.x, y: accepted.y, z: accepted.z, heading: accepted.heading,
          calledS: accepted.calledS, landsS: accepted.landsS });
      try {
        // a thawed page can come back under the pause panel (its visibility changed): resumed, or the clock never runs
        await resume(page);
        await page.evaluate((t) => { window.__runFrozen = false; window.__runFreezeAt = t; }, accepted.landsS + rel);
        await page.waitForFunction(() => window.__runFrozen, { timeout: 120_000, polling: 50 });
      } catch {
        // the battle's clock stopped (a verdict, a pause): recorded, and the run moves on
        receipt.runs.push({ kind, label, stalled: await battleState() });
        await page.evaluate(() => { window.__runFreezeAt = null; window.__runFrozen = false; window.__DEBUG.shotMode = false; });
        break;
      }
      // a few drawn frames with the camera on its pose
      await sleep(600);
      const name = `${tag}-${kind}-${label}`;
      const before = await page.evaluate((s) => {
        const D = window.__DEBUG, R = D.game.matchModeController.airSupport.rules, t = D.game.timeS;
        const craft = window.__runCraft({ id: s.id, kind: s.kind, x: s.x, z: s.z });
        const pose = window.__runs.runPose(R, s, t, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
        const w = craft ? craft.getWorldPosition(D.camera.position.clone()) : null;
        // the airframe against its run (a drawn frame may trail the clock by a frame: ~3 m at a jet's speed)
        const sinH = Math.sin(s.heading), cosH = Math.cos(s.heading);
        const lateral = w ? (w.x - s.x) * cosH - (w.z - s.z) * sinH : null;
        const bomb = D.scene.getObjectByName(`air-support bomb ${s.id}`);
        const b = bomb?.visible ? bomb.getWorldPosition(D.camera.position.clone()) : null;
        // (air-crash-he-276) the airframe's parts' heights against the ground under it (is the wreck above the drawn ground?)
        let partsY = null;
        if (craft) {
          let lo = Infinity, hi = -Infinity, meshes = 0; const v = D.camera.position.clone();
          craft.updateMatrixWorld(true);
          craft.traverseVisible((o) => {
            if (!o.isMesh || !o.geometry) return;
            meshes++;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const b = o.geometry.boundingBox;
            for (let k = 0; k < 8; k++) {
              v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld);
              lo = Math.min(lo, v.y); hi = Math.max(hi, v.y);
            }
          });
          partsY = [lo, hi, w ? D.world.heightField.getHeightAt(w.x, w.z) : null, meshes].map((y) => (y == null ? null : +y.toFixed(2)));
          // its vertices against the drawn ground (the battle's vehicle ground sampler on the dug terrain, what airSupportWorld
          // seats a wreck on): how many stand above it, the lowest's gap; and whether every ancestor is drawn
          const hf = D.world.heightField, drawn = D.game._groundSampler ?? ((x, z) => hf.getContactHeightAt(x, z));
          let above = 0, total = 0, gap = Infinity;
          craft.traverseVisible((o) => {
            const pos = o.isMesh ? o.geometry?.attributes?.position : null;
            if (!pos) return;
            const step = Math.max(1, Math.floor(pos.count / 400));
            for (let i = 0; i < pos.count; i += step) {
              v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); total++;
              const g = drawn(v.x, v.z);
              if (v.y > g) above++;
              gap = Math.min(gap, v.y - g);
            }
          });
          // (probe) the drawn terrain's own vertex nearest a point (the chunk's current LOD geometry) beside the sampler there
          let terr = null; D.scene.traverse((o) => { if (!terr && o.userData?.craterMesh) terr = o; });
          const drawnVertex = (x, z) => {
            const c = terr?.userData.terrainChunks?.find((k) => x >= k.cx0 && x < k.cx0 + 128 && z >= k.cz0 && z < k.cz0 + 128);
            const g = c?.mesh?.geometry; if (!g) return null;
            const P = g.attributes.position, q = D.camera.position.clone(); c.mesh.updateMatrixWorld(true);
            let best = Infinity, y = null;
            for (let i = 0; i < P.count; i++) { q.fromBufferAttribute(P, i).applyMatrix4(c.mesh.matrixWorld); const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < best) { best = d; y = q.y; } }
            return { y: +y.toFixed(2), off: +Math.sqrt(best).toFixed(2), level: c.level, lodIs: c.lods.indexOf(g), sampler: +drawn(x, z).toFixed(2), hf: +hf.getHeightAt(x, z).toFixed(2) };
          };
          let low = null; { const u = D.camera.position.clone(); let ly = Infinity; craft.traverseVisible((o) => { const P = o.isMesh ? o.geometry?.attributes?.position : null; for (let i = 0; P && i < P.count; i++) { u.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); if (u.y < ly) { ly = u.y; low = [u.x, u.z]; } } }); }
          const terrainProbe = { stats: terr?.userData.craterMesh?.stats ? { ...terr.userData.craterMesh.stats } : null,
            atLowest: low ? drawnVertex(low[0], low[1]) : null, atSite: window.__crashSite ? drawnVertex(window.__crashSite.x, window.__crashSite.z) : null,
            overlay: !!terr?.userData.groundOverlay };
          let chain = [], a = craft; while (a) { chain.push(`${a.name || a.type}:${a.visible ? 1 : 0}:${a.layers?.mask}`); a = a.parent; }
          partsY = { lo: partsY[0], hi: partsY[1], hfAt: partsY[2], meshes, above, total, lowestGap: +gap.toFixed(2),
            contactAt: w ? +hf.getContactHeightAt(w.x, w.z).toFixed(2) : null, drawnAt: w ? +drawn(w.x, w.z).toFixed(2) : null,
            chain, scale: craft.scale?.x, terrainProbe };
        }
        return { found: !!craft, partsY, camera: [D.camera.position.x, D.camera.position.y, D.camera.position.z].map((v) => +v.toFixed(1)),
          result: D.game.result ?? null, t: +(t - s.landsS).toFixed(3), craft: w ? [w.x, w.y, w.z].map((v) => +v.toFixed(1)) : null,
          offRunM: w ? +Math.hypot(w.x - pose.x, w.y - pose.y, w.z - pose.z).toFixed(2) : null,
          offAxisM: lateral == null ? null : +lateral.toFixed(2), bank: +(pose.bank * 180 / Math.PI).toFixed(1),
          pitch: +(pose.pitch * 180 / Math.PI).toFixed(1), bomb: b ? [b.x, b.y, b.z].map((v) => +v.toFixed(1)) : null };
      }, { ...accepted, kind: kind === 'shootdown' ? 'strafe' : kind === 'warning' ? 'missile' : kind });
      await shot(page, name);
      receipt.runs.push({ kind, label, shot: name, cam: cam.cam, ...before });
      await page.evaluate(() => { window.__runFreezeAt = null; window.__runFrozen = false; window.__DEBUG.shotMode = false; });
    }
    if (kind === 'shootdown') receipt.crashLog = { ...receipt.crashLog, shootdown: await page.evaluate(() => window.__crashLog.splice(0)) };
    await page.evaluate(() => { window.__runCam = null; window.__crashSite = null; window.__siteFrom = null; window.__DEBUG.shotMode = false;
      window.__DEBUG.rig.release(); document.documentElement.classList.add('as-hud-hidden'); });
    await checkpoint?.();
  }
}

/**
 * (air-crash-he-276) 'dronecrash': an FPV drone into the nearest building in reach of the crew, its round on the page's
 * own shell path (a DRONE_WARHEAD shell, as a flight launches, flown straight at the wall at the drone's speed): it
 * meets the wall and bursts as the drone's crash (sim/airCrash.ts worldImpactSpec), its hole and the building's damage
 * shot from beside it. With --burst, a frame every 0.1 s for the clip.
 */
async function droneCrash(page, tag, { shot, resume, signal }) {
  const site = await page.evaluate(async () => {
    const D = window.__DEBUG, game = D.game, p = game.player.state.pos, hf = D.world.heightField;
    const { createShell } = await import('/src/sim/ballistics.ts');
    const { DRONE_WARHEAD, AERIAL_RULES } = await import('/src/sim/matchRuleset.ts');
    let best = null, bestD = Infinity;
    for (const o of D.world.getObstacles?.() ?? []) {
      // a house-sized building: a body the drone's line meets, not a mast's or a windmill's bounds
      const w = o.max[0] - o.min[0], dpt = o.max[2] - o.min[2], h = o.max[1] - o.min[1];
      if (o.kind !== 'structure' || o.structureIdx === undefined || o.crushed || h < 3 || h > 12 || w < 5 || dpt < 5) continue;
      const cx = (o.min[0] + o.max[0]) / 2, cz = (o.min[2] + o.max[2]) / 2, d = Math.hypot(cx - p.x, cz - p.z);
      if (d > 60 && d < 600 && d < bestD) { bestD = d; best = o; }
    }
    if (!best) return null;
    // the middle of the face toward the crew, 2.5 m up; the drone 35 m out along its normal, 4 m higher, flying at the
    // building's middle
    const cx = (best.min[0] + best.max[0]) / 2, cz = (best.min[2] + best.max[2]) / 2;
    const hw = (best.max[0] - best.min[0]) / 2, hd = (best.max[2] - best.min[2]) / 2;
    const alongX = Math.abs(p.x - cx) / hw > Math.abs(p.z - cz) / hd;
    const ux = alongX ? Math.sign(p.x - cx) || 1 : 0, uz = alongX ? 0 : Math.sign(p.z - cz) || 1, u = 1;
    const wx = cx + ux * hw, wz = cz + uz * hd;
    // level, 3 m over the higher of the ground at the wall and at the launch (its foundations run below the ground)
    const ground = Math.max(hf.getHeightAt(wx, wz), hf.getHeightAt(wx + ux * 35, wz + uz * 35), best.min[1]);
    const target = { x: wx, y: Math.min(ground + 3, best.max[1] - 1), z: wz };
    const V = D.camera.position.constructor;
    const from = new V(wx + ux * 35, target.y, wz + uz * 35);
    const dir = new V(cx - from.x, 0, cz - from.z).normalize();
    const shell = createShell(DRONE_WARHEAD, game.player.id, true, from, dir, game.nextShellId++);
    shell.gravityMps2 = 0; shell.vel.multiplyScalar(AERIAL_RULES.drone.speedMps / Math.max(1e-6, shell.vel.length()));
    game.shells.push(shell);
    window.__crashSite = { x: target.x, y: hf.getHeightAt(wx, wz), z: target.z };
    // the camera beside the drone's line, off the wall to the side, so the hole and the burst read
    window.__siteFrom = { x: (ux / u) * 0.7 + (uz / u) * 0.7, z: (uz / u) * 0.7 - (ux / u) * 0.7 };
    window.__runCam = { cam: 'site', out: 30, up: 9, fov: 52, aimUp: 2.5 };
    return { t0: game.timeS, structureId: best.structureIdx, wall: target, from: { x: from.x, y: from.y, z: from.z } };
  });
  receipt.calls.push({ kind: 'dronecrash', accepted: !!site });
  if (!site) return;
  const frames = burst ? Array.from({ length: 30 }, (_, i) => [`burst-${String(i).padStart(3, '0')}`, i * 0.1])
    : [['inbound', 0.45], ['impact', 0.86], ['hole', 2.5], ['hole-late', 6], ['hole-close', 7, { cam: 'site', out: 12, up: 4, fov: 50, aimUp: 3 }]];
  for (const [label, rel, cam] of frames) {
    if (signal.aborted) return;
    if (cam) await page.evaluate((c) => { window.__runCam = c; }, cam);
    try {
      await resume(page);
      await page.evaluate((t) => { window.__runFrozen = false; window.__runFreezeAt = t; }, site.t0 + rel);
      await page.waitForFunction(() => window.__runFrozen, { timeout: 120_000, polling: 50 });
    } catch {
      receipt.runs.push({ kind: 'dronecrash', label, stalled: true });
      break;
    }
    await sleep(600);
    const name = `${tag}-dronecrash-${label}`;
    await shot(page, name);
    receipt.runs.push({ kind: 'dronecrash', label, shot: name, structureId: site.structureId, wall: site.wall });
    await page.evaluate(() => { window.__runFreezeAt = null; window.__runFrozen = false; window.__DEBUG.shotMode = false; });
  }
  receipt.crashLog = { ...receipt.crashLog, dronecrash: await page.evaluate(() => window.__crashLog.splice(0)) };
  await page.evaluate(() => { window.__runCam = null; window.__crashSite = null; window.__siteFrom = null; window.__DEBUG.shotMode = false;
    window.__DEBUG.rig.release(); });
}

/** In the page: Air Support's surfaces cut or spilling off the screen, and any of their plates over another opaque HUD
 *  plate or control (ancestors, descendants and full-screen layers aside). */
const surfaceCheck = () => {
  const vw = innerWidth, vh = innerHeight;
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width >= 1;
  const name = (el) => `${el.tagName.toLowerCase()}${el.classList.length ? `.${[...el.classList].join('.')}` : ''}`;
  const mine = [...document.querySelectorAll('.cot-strike-rack, .strike-support, .cot-binoculars .binocular-readout, '
    + '.cot-binoculars .binocular-hint, .cot-strike-warning, .binocular-call')].filter(shown);
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
    window.__gx = {
      reset(points, cooling) {
        const s = air.capture();
        s.strikes = [];
        s.points = s.points.filter(([id]) => id !== game.player.id).concat([[game.player.id, points]]);
        s.cooldowns = s.cooldowns.filter(([key]) => !key.startsWith(`${game.player.id}:`))
          .concat(cooling.map((kind) => [`${game.player.id}:${kind}`, game.timeS + air.rules[kind].cooldownS * 0.6]));
        air.restore(s);
        const c = game.player.combat;
        if (!c.destroyed) c.hp = c.maxHp;
      },
      // (g5: the first live foe could stand out of its call-in's range; every live foe is asked in turn)
      incoming() {
        return game.tanks.filter((t) => t.team !== game.player.team && !t.combat.destroyed).some((foe) => this.ask(foe));
      },
      ask(foe) {
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
    // (g4: the battle went on around the frames and once destroyed the crew; the hull is topped up at every frame)
    const crew = await page.evaluate(() => { const c = window.__DEBUG.game.player.combat; if (!c.destroyed) c.hp = c.maxHp; return c.destroyed ? ['destroyed'] : []; });
    // (g3: a focus loss on a loaded machine raised the pause veil over one frame; the veil is not this surface)
    if (await page.evaluate(() => { const go = document.querySelector('.cot-resume.show .rz-go'); go?.click(); return !!go; })) await sleep(600);
    await shot(page, file);
    receipt.gauntlet[file] = { ...(await page.evaluate(surfaceCheck)), datum: await datumProblems(page), crew };
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

/** --close-box: at each size, Support's box at rest, raised by its own press and lowered by it again; frames across each
 *  change; the judge, and the judge on the old standalone close (which must fail). */
async function shootCloseBox(page, tag) {
  await page.evaluate(stage);
  const labels = await page.evaluate(async () => {
    const { t } = await import('/src/ui/i18n.ts');
    return { view: t('airSupport.view'), lower: t('airSupport.lower') };
  });
  const measure = () => page.evaluate(measureCloseBox, labels.lower);
  // frames across a change: a press of Support, then a frame as fast as the page gives them for 1.1 s (the raise is 0.7 s).
  // Under pointer lock (desktop) every click lands on the canvas and fires the gun, so Support is worked by the key printed
  // on it; without the lock (touch, cursor-aim) it is pressed in its own box.
  const pressedBy = [];
  const press = async (name) => {
    const frames = [];
    if (await page.evaluate(() => !!document.pointerLockElement)) {
      const key = await page.evaluate(() => document.querySelector('.strike-support .key')?.textContent?.trim() ?? 'X');
      await page.keyboard.down(`Key${key.toUpperCase()}`);
      await sleep(60);
      await page.keyboard.up(`Key${key.toUpperCase()}`);
      pressedBy.push(`key ${key}`);
    } else {
      await page.click('.strike-support');
      pressedBy.push('click');
    }
    const t0 = Date.now();
    for (let i = 0; Date.now() - t0 < 1100 && i < 40; i++) {
      const file = `${name}-${String(i).padStart(2, '0')}`;
      await page.screenshot({ path: path.join(out, `${file}.png`) });
      frames.push([file, Date.now() - t0]);
    }
    return frames;
  };
  for (const [width, height] of GAUNTLET_SIZES[tag]) {
    const kind = tag === 'phone' ? (Math.min(width, height) >= 700 ? 'ipad' : 'phone') : 'desktop';
    const size = `${kind}-${width}x${height}`;
    await page.setViewport({ ...VIEWPORTS[tag], width, height });
    await sleep(1500);
    await page.evaluate(() => { window.__DEBUG.bus.emit('ui:strikeViewClose', {}); const c = window.__DEBUG.game.player.combat; if (!c.destroyed) c.hp = c.maxHp; });
    await sleep(900);
    const rest = await measure();
    await shot(page, `close-${size}-rest`);
    const raise = await press(`close-${size}-raise`);
    await sleep(300);
    const up = await measure();
    await shot(page, `close-${size}-up`);
    // (Main 2026-11-23: Kevin saw "gunship overhead" over the old X) the binoculars up with an enemy AC-130 over the crew,
    // so the notices lane's placement and Support's box are checked in one frame; struck off again after it
    const gunship = await page.evaluate(() => {
      const D = window.__DEBUG, game = D.game, air = game.matchModeController.airSupport, p = game.player.state.pos;
      return game.tanks.filter((t) => t.team !== game.player.team && !t.combat.destroyed).some((foe) => {
        const s = air.capture();
        s.points = s.points.filter(([id]) => id !== foe.id).concat([[foe.id, air.rules.points.cap]]);
        s.cooldowns = s.cooldowns.filter(([k]) => !k.startsWith(`${foe.id}:`));
        air.restore(s);
        return !!air.requestStrike(foe.id, 'gunship', p.x, p.z, game.timeS);
      });
    });
    await sleep(900);
    await shot(page, `close-${size}-up-gunship`);
    await page.evaluate(() => { const air = window.__DEBUG.game.matchModeController.airSupport, s = air.capture(); s.strikes = []; air.restore(s); });
    await sleep(300);
    // the negative control: the old button back in the page, with the binoculars up
    const negative = await page.evaluate(putBackOldClose, labels.lower, true) && await measure();
    await shot(page, `close-${size}-negative-old-button`);
    await page.evaluate(putBackOldClose, labels.lower, false);
    const lower = await press(`close-${size}-lower`);
    await sleep(300);
    const down = await measure();
    await shot(page, `close-${size}-down`);
    const problems = closeBoxProblems(rest, up, labels);
    const downProblems = closeBoxProblems(down, up, labels).filter((p) => !p.startsWith('up:'));
    const negativeProblems = closeBoxProblems(rest, negative, labels);
    receipt.closeBox[size] = {
      pass: !problems.length && !downProblems.length && negativeProblems.length > 0,
      problems, downProblems, negativeProblems, gunship, support: { rest: rest.support, up: up.support, down: down.support },
      frames: { raise, lower }, pressedBy: pressedBy.splice(0),
    };
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
const writeReceipt = () => writeFileSync(path.join(out, `air-support-shots${closeBox ? '-close-box' : ''}${gauntlet ? `-gauntlet-${locale}` : ''}${runs ? '-runs' : ''}${burst ? '-burst' : ''}${only ? `-${only}` : ''}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
process.on('exit', () => { try { writeReceipt(); } catch {} });
await runWarmHold({
  label: 'air-support-275',
  // a film of the runs is a render (it shares the lock with other renders); the perf passes stay exclusive
  ...(runs || closeBox ? { lockClass: 'render' } : {}),
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
        url: `http://127.0.0.1:${port}/?nosplash=1&tier=${TIERS[tag]}&gfxreset=1`, ready: BOOT_LOADED_EXPRESSION,
        after: (page) => beginSoloBattle(page, { specId: 'm1a1_abrams_hc', mapId, gameMode: 'air_support', settleMs: 2500, timeoutMs: 900_000 }),
      });
      await rewarmPage(page);
      page.on('pageerror', (error) => errors.push(String(error?.message ?? error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)); });
      pages[tag] = page;
    }
    return { pages: Object.values(pages), byTag: pages, close: async () => { await browser.close(); await server.close(); } };
  },
  shoot: async ({ byTag, signal, checkpoint }) => {
    if (closeBox) {
      for (const tag of ['desktop', 'phone']) if (byTag[tag] && !signal.aborted) await shootCloseBox(byTag[tag], tag);
      return;
    }
    if (gauntlet) {
      for (const tag of ['desktop', 'phone']) if (byTag[tag] && !signal.aborted) await shootGauntlet(byTag[tag], tag);
      return;
    }
    if (byTag.desktop && runs) {
      await shootRuns(byTag.desktop, signal, 'runs', checkpoint);
    } else if (byTag.desktop && aircraft) {
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
writeReceipt();
if (closeBox) {
  const failed = Object.entries(receipt.closeBox).filter(([, r]) => !r.pass).map(([size]) => size);
  console.log(`air-support close-box: ${Object.keys(receipt.closeBox).length} sizes, ${failed.length ? `FAIL ${failed.join(', ')}` : 'PASS'}`);
  if (failed.length || !Object.keys(receipt.closeBox).length) process.exitCode = 1;
}
console.log(JSON.stringify({ shots: receipt.shots.length, calls: receipt.calls, perf: receipt.perf, errors: Object.fromEntries(Object.entries(receipt.errors).map(([k, v]) => [k, v.length])) }));
