#!/usr/bin/env node
// Salvo indicator probe (round 41, committed 2026-09-23 by owner approval). Rendered proof that a guided salvo rack
// drives the autoloader HUD indicator through the real desktop input path: the ZTZ-100 prototype's twin HJ-P9 rack
// shows two pips at rest, one pip with the intra-salvo keyline after the first launch (LMB on the canvas), an empty
// rack filling during the held group reload, two pips again after it. A cannon autoloader (control A, leclerc_x) and a
// single-shot gun (control B, t72b3m) are captured the same way. Each phase is a reticle crop
// <label>-<phase>.png plus the player's combat state in the receipt (reload kind / t / total, salvo shots, magazine).
// The battle starts through __DEBUG.startBattle (the QA cold entry) and the reload clock is held with __DEBUG so the
// HUD can be photographed mid-cycle; sim/magazineIndicator.selftest.mjs is the derivation's receipt, this is the
// rendered one. Uses the system Chrome when present (the pointer-lock path the round verified with).
//
//   node tools/salvo-indicator-probe.mjs --root=<worktree> --out=<dir> [--ids=ztz100_prototype:salvo,leclerc_x:autoloader,t72b3m:single]
//
// Hold the probe mutex and run under nice -n 19 (header of tools/map-probe-runtime.mjs). Exit 1 when a case failed.
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import {
  isMainModule, openGamePage, parseProbeArgs, probeHelp, runProbeCli, withMapProbeSession, writeProbeReceipt,
} from './map-probe-runtime.mjs';

const TOOL = 'salvo-indicator-probe';
const ACCEPTS = ['root', 'out', 'tag', 'ids', 'cache-dir', 'executable-path'];
const SALVO_PROBE_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
/** The reticle crop around the screen centre where the magazine indicator sits. */
const SALVO_PROBE_RETICLE = Object.freeze({ x: 640 - 170, y: 360 - 140, width: 340, height: 300 });
export const SALVO_PROBE_DEFAULT_CASES = Object.freeze(['ztz100_prototype:salvo', 'leclerc_x:autoloader', 't72b3m:single']);
const SALVO_PROBE_PHASES = Object.freeze(['1-rest', '2-after-first-shot', '3-after-second-shot', '4-refilled']);
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HELP = probeHelp({
  tool: TOOL, accepts: ACCEPTS, defaults: { ids: SALVO_PROBE_DEFAULT_CASES },
  summary: 'Reticle captures of the HUD magazine indicator through four phases of a salvo / autoloader / single-shot cycle.',
});

/** "specId:label" cases; the label names the capture files and defaults to the id. */
export function parseSalvoCases(list) {
  return list.map((entry) => {
    const [id, label] = entry.split(':');
    if (!/^[a-z0-9_]+$/.test(id || '')) throw new Error(`--ids entries are specId[:label], got "${entry}"`);
    if (label !== undefined && !/^[a-z0-9][a-z0-9-]*$/i.test(label)) throw new Error(`--ids label must be a file-name token, got "${label}"`);
    return { id, label: label || id };
  });
}

export function parseSalvoIndicatorArgs(argv) {
  const parsed = parseProbeArgs(argv, { tool: TOOL, accepts: ACCEPTS, defaults: { tag: 'salvo', ids: [...SALVO_PROBE_DEFAULT_CASES] } });
  if (parsed.help) return parsed;
  parsed.options.cases = parseSalvoCases(parsed.options.ids);
  if (!parsed.options.executablePath && existsSync(SYSTEM_CHROME)) parsed.options.executablePath = SYSTEM_CHROME;
  return parsed;
}

async function stageCase(page, { id, label }, out) {
  await page.evaluate(async (specId) => {
    const D = window.__DEBUG;
    await D.startBattle(specId);
    D.game.player.combat.reload.t = 0;
  }, id);
  await page.click('canvas');
  await page.waitForFunction(() => window.__DEBUG.input.isLocked() || window.__DEBUG.input.isCursorAim(), { timeout: 5000 });
  await page.mouse.move(640, 360);
  await page.mouse.move(640, 120, { steps: 10 });
  await page.waitForFunction(() => {
    const D = window.__DEBUG; const p = D.game.player;
    return p && p.combat && p.combat.reload.t <= 0 && D.gunAimError() < 0.05;
  }, { timeout: 8000 });
  const snap = (phase) => page.evaluate((ph) => {
    const p = window.__DEBUG.game.player;
    return {
      phase: ph, slot: p.combat.shellSlot, shell: p.spec.gun.shells[p.combat.shellSlot]?.name,
      reloadKind: p.combat.reload.kind, reloadT: +p.combat.reload.t.toFixed(2), reloadTotal: +p.combat.reload.totalS.toFixed(2),
      salvoShots: p.combat.launcherSalvoShots ?? null, magazine: p.combat.magazine ? { ...p.combat.magazine } : null,
    };
  }, phase);
  const shots = [];
  const capture = async (phase) => {
    // Let two frames render the HUD for the current combat state before the screenshot.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const file = `${label}-${phase}.png`;
    await page.screenshot({ path: path.join(out, file), clip: { ...SALVO_PROBE_RETICLE } });
    shots.push({ ...(await snap(phase)), file });
  };
  await capture(SALVO_PROBE_PHASES[0]);
  // First launch through the real desktop path (LMB), then hold the post-shot cycle so the HUD can be photographed.
  await page.mouse.click(640, 120);
  await page.waitForFunction(() => window.__DEBUG.game.player.combat.reload.t > 0, { timeout: 4000 });
  await page.evaluate(() => { const c = window.__DEBUG.game.player.combat; c.reload.t = Math.max(c.reload.t, 20); c.reload.totalS = Math.max(c.reload.totalS, 20); });
  await capture(SALVO_PROBE_PHASES[1]);
  // Release the cycle, second launch (for a group weapon this ends the group), hold the group reload at 75 % remaining.
  await page.evaluate(() => { window.__DEBUG.game.player.combat.reload.t = 0; });
  await page.waitForFunction(() => window.__DEBUG.game.player.combat.reload.t <= 0, { timeout: 4000 });
  await page.mouse.click(640, 120);
  await page.waitForFunction(() => window.__DEBUG.game.player.combat.reload.t > 0, { timeout: 4000 });
  await page.evaluate(() => { const c = window.__DEBUG.game.player.combat; c.reload.totalS = 20; c.reload.t = 15; });
  await capture(SALVO_PROBE_PHASES[2]);
  // Let the reload finish and photograph the refilled indicator.
  await page.evaluate(() => { window.__DEBUG.game.player.combat.reload.t = 0.05; });
  await page.waitForFunction(() => window.__DEBUG.game.player.combat.reload.t <= 0, { timeout: 4000 });
  await capture(SALVO_PROBE_PHASES[3]);
  return shots;
}

async function runSalvoIndicatorProbe(options) {
  mkdirSync(options.out, { recursive: true });
  const cases = [];
  let ok = true, pageErrors = [];
  await withMapProbeSession({
    root: options.root, cacheDir: options.cacheDir,
    launch: { ...SALVO_PROBE_VIEWPORT, executablePath: options.executablePath },
  }, async ({ browser, port }) => {
    const { page, errors } = await openGamePage(browser, { port, viewport: SALVO_PROBE_VIEWPORT, query: 'nogate&nosplash', readyTimeoutMs: 120000 });
    pageErrors = errors;
    try {
      for (const c of options.cases) {
        try {
          const shots = await stageCase(page, c, options.out);
          cases.push({ ...c, shots });
          console.log(`[${TOOL}] ${c.label} (${c.id}):`);
          for (const s of shots) console.log(`   ${s.phase}: kind=${s.reloadKind} t=${s.reloadT}/${s.reloadTotal} salvoShots=${s.salvoShots} magazine=${JSON.stringify(s.magazine)} shell=${s.shell} → ${s.file}`);
        } catch (error) {
          ok = false;
          cases.push({ ...c, failed: String(error?.message || error) });
          console.error(`[${TOOL}] ${c.label} FAILED: ${String(error?.stack || error).slice(0, 400)}`);
        }
      }
    } finally {
      await page.close().catch(() => {});
    }
  });
  const receipt = writeProbeReceipt(options, {
    ok, viewport: SALVO_PROBE_VIEWPORT, reticle: SALVO_PROBE_RETICLE, phases: SALVO_PROBE_PHASES,
    executablePath: options.executablePath ?? 'puppeteer', cases, pageErrors,
  });
  console.log(`[${TOOL}] ${ok ? 'done' : 'FAILED'}: ${cases.filter((c) => c.shots).length}/${cases.length} hulls → ${receipt}; page errors ${pageErrors.length}`);
  return { ok, receipt, cases };
}

if (isMainModule(import.meta.url)) await runProbeCli({ help: HELP, parse: parseSalvoIndicatorArgs, run: runSalvoIndicatorProbe });
