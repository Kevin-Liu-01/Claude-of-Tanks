#!/usr/bin/env node
// Real Settings + input store, independent of the GPU-heavy playable world.
// Run under the shared capture lease (the same contract as custom-select.browser.mjs).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CREW_VOICE_NATIONS } from '../src/audio/crewVoice.ts';
import { flagIconCode } from '../src/ui/flagCodes.ts';

const arg = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const { chromium } = await import(arg('playwright-module', 'playwright'));
const out = resolve(arg('out', '.qa-dev/crew-voice'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu'] });
const errors = [];
let checked = 0;
try {
  for (const locale of ['en-US', 'zh-CN']) {
    for (const [name, width, height, touch] of [['desktop', 1280, 800, false], ['phone', 390, 844, true], ['landscape', 844, 390, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      const testAudio = locale === 'en-US' && name === 'desktop';
      await page.goto(`${arg('url', 'http://127.0.0.1:5173')}/tools/fixtures/crew-voice.html?locale=${locale}${testAudio ? '&audio=1' : ''}`, { waitUntil: 'networkidle' });
      const field = page.locator('[data-setting="crewVoice"]');
      const trigger = page.locator('.cot-set-crew-field .cot-custom-select-trigger');
      const popup = page.locator('.cot-custom-select-list:popover-open');
      await trigger.waitFor();
      assert.equal(await field.inputValue(), 'national');
      assert.equal(await field.locator('option').count(), 14);
      assert.equal(await field.isVisible(), false, 'the shared dropdown replaces the native field');
      assert.match(await trigger.getAttribute('aria-label'), locale === 'en-US' ? /Crew voices: National crews/ : /乘员语音: 各国乘员/);

      for (const [pack, nation] of Object.entries(CREW_VOICE_NATIONS)) {
        const before = await page.evaluate(() => window.__CREW_VOICE_TEST.volumes.length);
        await trigger.click();
        const bounds = await popup.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, `${locale} ${name}: popup fits viewport`);
        assert.equal(await popup.locator('.cot-flag').count(), 13);
        const option = popup.locator(`[data-value="${pack}"]`);
        if (touch) assert.ok((await option.boundingBox()).height >= 44, 'touch options have a 44 px target');
        await option.click();
        assert.equal(await field.inputValue(), pack);
        assert.equal(await trigger.locator('.cot-flag').getAttribute('data-country-code'), flagIconCode(nation));
        const state = await page.evaluate(() => ({
          stored: JSON.parse(localStorage.getItem('cot.settings.v1')).crewVoice,
          live: window.__CREW_VOICE_TEST.volumes.at(-1).crewVoice,
          events: window.__CREW_VOICE_TEST.volumes.length,
        }));
        assert.deepEqual(state, { stored: pack, live: pack, events: before + 1 }, 'one persisted change and one live mix event');
        if (testAudio) {
          await page.waitForFunction(pack => window.__COT_AUDIO?.crewLanguage === pack && window.__COT_AUDIO.voicesLoaded, pack, { timeout: 30000 });
          const playback = await page.evaluate(() => ({
            played: window.__COT_AUDIO.sayVoice('were_hit'),
            language: window.__COT_AUDIO.voiceLog.at(-1)?.lang,
            state: window.__COT_AUDIO.ctx.state,
          }));
          assert.deepEqual(playback, { played: true, language: pack, state: 'running' }, 'the real radio decodes and plays the chosen pack');
        }
        assert.equal(await popup.count(), 0);
        checked++;
      }
      await page.reload({ waitUntil: 'networkidle' });
      await trigger.waitFor();
      assert.equal(await field.inputValue(), 'he', 'last nation survives reload');
      await trigger.focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      assert.equal(await field.inputValue(), 'en-US', 'keyboard chooses a crew within the Settings capture boundary');
      await trigger.click();
      await page.keyboard.press('Escape');
      assert.equal(await popup.count(), 0);
      assert.equal(await page.evaluate(() => window.__CREW_VOICE_TEST.settings.isOpen()), true, 'first Escape only closes the dropdown');
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Escape restores trigger focus');
      await trigger.click();
      await page.keyboard.press('Tab');
      assert.equal(await popup.count(), 0, 'Tab dismisses the dropdown');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('.cot-settings')), true, 'Tab remains inside Settings');
      await trigger.click();
      await page.locator('.cot-set-hdr').click();
      assert.equal(await popup.count(), 0, 'outside click dismisses');
      await trigger.click();
      await page.evaluate(() => window.__CREW_VOICE_TEST.settings.close({ noRelock: true }));
      assert.equal(await popup.count(), 0, 'closing Settings leaves no top-layer popup');
      await page.evaluate(() => window.__CREW_VOICE_TEST.settings.open());
      await trigger.waitFor();
      assert.equal(await field.inputValue(), 'en-US', 'reopening preserves the choice');
      await page.locator('.cot-set-btn.reset').click();
      await trigger.waitFor();
      assert.equal(await field.inputValue(), 'national', 'Sound reset restores national crews');
      assert.equal(await page.evaluate(() => window.__CREW_VOICE_TEST.volumes.at(-1).crewVoice), 'national');
      await trigger.click();
      await page.screenshot({ path: resolve(out, `${locale}-${name}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no page overflow');
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${checked} nation choices across English/Chinese desktop, phone and landscape; flags, persistence, live events, keyboard, reset and dismissal; all 13 packs decoded and played through Web Audio.`);
} finally {
  await browser.close();
}
