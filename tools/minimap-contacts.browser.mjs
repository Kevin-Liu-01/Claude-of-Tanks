#!/usr/bin/env node
// Render the real HUD canvas through wave reserve/activation/spotting changes.
// Run against a Vite server; hold the shared capture lease in the caller.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const url = process.argv.find(arg => arg.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:5189';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${url}/tools/fixtures/battle-hud-layout.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.__HUD_LAYOUT);
  const receipt = await page.evaluate(async () => {
    await document.fonts.ready;
    const { hud, frame, tanks } = window.__HUD_LAYOUT;
    const player = tanks[0], enemy = tanks[8], ally = tanks[1];
    frame.tanks = [player];
    frame.timeS = 60;
    frame.spotting = { isSpotted: () => true };
    const canvas = document.querySelector('.cot-minimap canvas');
    const paint = async () => {
      await new Promise(resolve => setTimeout(resolve, 65));
      hud.update(frame);
      return canvas.toDataURL();
    };
    const baseline = await paint();
    frame.tanks = [player, enemy, ally];
    enemy.modeActive = ally.modeActive = false;
    enemy.combat.destroyed = true;
    const reserves = await paint();
    enemy.combat.destroyed = false;
    enemy.modeActive = true;
    const activated = await paint();
    enemy.modeActive = false;
    const deactivated = await paint();
    enemy.modeActive = true;
    frame.spotting = { isSpotted: () => false };
    const hiddenNextWave = await paint();
    frame.spotting = { isSpotted: () => true };
    const spotted = await paint();
    frame.spotting = { isSpotted: () => false };
    const lastKnown = await paint();
    return {
      reservesHidden: reserves === baseline,
      activatedVisible: activated !== baseline,
      deactivatedRemoved: deactivated === baseline,
      nextWaveHasNoStaleContact: hiddenNextWave === baseline,
      spottedVisible: spotted !== baseline,
      lastKnownDistinct: lastKnown !== baseline && lastKnown !== spotted,
    };
  });
  assert.deepEqual(errors, []);
  for (const [name, passed] of Object.entries(receipt)) assert.equal(passed, true, name);
  console.log(JSON.stringify(receipt, null, 2));
} finally { await browser.close(); }
