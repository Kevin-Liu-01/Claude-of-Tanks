// Actual HUD and touch controls with deterministic drone telemetry, without WebGL.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { withMapProbeSession } from './map-probe-runtime.mjs';

const out = resolve('.qa-dev/drone-hud');
mkdirSync(out, { recursive: true });
const lock = createCaptureLock(); let heartbeat;
const reports = [];
try {
  await lock.acquire(); heartbeat = setInterval(() => lock.refresh(), 30000);
  console.log('drone-hud: acquired browser slot');
  await withMapProbeSession({ root: process.cwd() }, async ({ browser, baseUrl }) => {
    for (const [width,height,touch,locale] of [[1280,800,false,'en-US'],[568,320,true,'en-US'],[480,270,true,'en-US'],[320,568,true,'en-US'],[568,320,true,'zh-CN']]) {
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewport({ width, height, isMobile: touch, hasTouch: touch });
      await page.goto(`${baseUrl}/tools/fixtures/battle-hud-layout.html?locale=${locale}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => !!window.__HUD_LAYOUT);
      await page.evaluate(async () => {
        await import('/src/ui/aerialHud.css');
        const { PerspectiveCamera } = await import('/node_modules/three/build/three.module.js');
        const f = window.__HUD_LAYOUT;
        f.frame.camera = new PerspectiveCamera(55, innerWidth / innerHeight, .1, 2000);
        f.frame.camera.position.set(0, 20, -20); f.frame.camera.lookAt(0, 0, 50);
        f.frame.camera.userData.thermalFlight = true;
        f.frame.matchModeState = { id: 'drone' };
        f.frame.player.aerial = { kind: 'drone', active: true, launching: false, x: 150, y: 30, z: 150, yaw: 0, pitch: 0, batteryS: 28, cooldownS: 0 };
        window.__droneReturns = 0;
        f.bus.on('ui:drone', () => window.__droneReturns++);
        f.hud.update(f.frame);
      });
      for (const view of ['infrared','thermal','night','daylight']) {
        await page.evaluate(async view => {
          const { setAerialVision } = await import('/src/engine/aerialVision.ts'); setAerialVision(view);
          const f = window.__HUD_LAYOUT; f.hud.update(f.frame);
        }, view);
        await new Promise(resolve => setTimeout(resolve, 100));
        const report = await page.evaluate(() => {
          const root = document.querySelector('.cot-flight-hud');
          const controls = [...document.querySelectorAll('.flight-view-switch,.cot-drone-return,.cot-touch .joy,.cot-touch .flight-climb')].filter(el => el.checkVisibility());
          const rects = controls.map(el => { const r=el.getBoundingClientRect(); return { name:el.className, x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; });
          const failures = [];
          for (const [i,a] of rects.entries()) {
            if(a.x<0||a.y<0||a.right>innerWidth+.5||a.bottom>innerHeight+.5) failures.push(`offscreen ${a.name}`);
            if(a.height<44||a.width<44) failures.push(`small target ${a.name}`);
            for(const b of rects.slice(i+1)) if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1) failures.push(`${a.name} overlaps ${b.name}`);
          }
          for(const el of root.querySelectorAll('.flight-feed,.cot-drone-return,.flight-telemetry')) if(el.scrollWidth>el.clientWidth+1) failures.push(`clipped content ${el.className}`);
          const button = root.querySelector('.flight-view-switch');
          if(getComputedStyle(button,'::before').clipPath==='none') failures.push('sensor shape is rectangular');
          if(getComputedStyle(root.querySelector('.flight-console')).backgroundImage!=='none') failures.push('old panel backing remains');
          return { failures, rects, view:root.dataset.view, activeSteps:root.querySelectorAll('.flight-view-track .active').length, label:button.getAttribute('aria-label') };
        });
        await page.screenshot({ path: resolve(out, `${width}-${height}-${locale}-${view}.png`) });
        reports.push({ width,height,locale,...report });
        assert.deepEqual(report.failures, [], JSON.stringify(reports.at(-1)));
        assert.equal(report.view, view); assert.equal(report.activeSteps, 1); assert.ok(report.label);
      }
      // Both pointer and keyboard activate the real sensor callback; returning emits once.
      await page.click('.flight-view-switch');
      await page.evaluate(() => { const f=window.__HUD_LAYOUT;f.hud.update(f.frame); });
      assert.equal(await page.$eval('.cot-flight-hud', el=>el.dataset.view),'infrared');
      await page.focus('.flight-view-switch'); await page.keyboard.press('Enter');
      await page.evaluate(() => { const f=window.__HUD_LAYOUT;f.hud.update(f.frame); });
      assert.equal(await page.$eval('.cot-flight-hud', el=>el.dataset.view),'thermal');
      await page.click('.cot-drone-return');
      assert.equal(await page.evaluate(()=>window.__droneReturns),1);
      assert.deepEqual(errors, []); await page.close();
    }
  });
  writeFileSync(resolve(out,'report.json'),JSON.stringify(reports,null,2));
  console.log('drone-hud: five viewport/locale cases, four sensors, touch clearance and keyboard/pointer controls passed');
} finally { clearInterval(heartbeat); await lock.release(); }
