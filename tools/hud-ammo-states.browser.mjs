#!/usr/bin/env node
// Owner 2026-10-17: "if you are out of ammo, the reload indicators should have a special edge case, including
// autoloader/missile indicators. and for special modes like juggernaut, ammo should be endless."
// Rendered proof of the out-of-ammo and unlimited-rounds HUD states: the flow, its cases and its checks live in
// tools/hud-ammo-capture.mjs (runCapture), which tools/hud-ammo-frame-ink.selftest.mjs drives against a recording page.
// This entry point takes no screenshot itself: it hands runCapture Playwright's Chromium and the capture lock.
// Takes the capture lock (NORMAL band) and accepts an existing dev server. --ticket-stamp=<ms> rejoins the queue at an
// earlier ticket of the same run (capture-lock ticketAt: a relaunched run keeps its place); --case= and --stages= filter:
// node tools/hud-ammo-states.browser.mjs --url=http://127.0.0.1:5189 --out=outputs/hud-ammo-states
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock, ticketAt } from './capture-lock.mjs';
import { runCapture } from './hud-ammo-capture.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const out = resolve(arg('out', 'outputs/hud-ammo-states'));
const { chromium } = await import(arg('playwright-module', 'playwright'));
// NORMAL band: an ordinary FIFO ticket (or this run's earlier one); wait behind the queue (default three hours).
const stamp = Number(arg('ticket-stamp', '0'));
const { reports, failures } = await runCapture({
  chromium, url: arg('url', 'http://127.0.0.1:5189'), out, stageFilter: arg('stages', ''), caseFilter: arg('case', ''),
  lock: { acquire: acquireCaptureLock, refresh: refreshCaptureLock, release: releaseCaptureLock },
  lockTimeoutMs: Number(arg('lock-timeout-ms', String(3 * 3600 * 1000))), lockOptions: stamp > 0 ? { ticket: ticketAt(stamp) } : {},
  writeFile, mkdir,
});
console.log(`${reports.length} HUD ammo frames; ${failures.length} failures. ${out}`);
if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }
