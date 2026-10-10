#!/usr/bin/env node
// Real HUD/readout regression: desktop, touch portrait and short landscape.
// node tools/rapid-fire-feedback.browser.mjs --url=http://127.0.0.1:5197
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createCaptureLock } from './capture-lock.mjs';
const arg = (name, fallback) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const { chromium } = await import(arg('playwright-module', 'playwright'));
const lock = createCaptureLock();
await lock.acquire(Number(arg('lock-timeout', '60000')));
const refresh = setInterval(() => lock.refresh(), 30000);
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'] });
  const out = arg('out', '.qa-dev/rapid-fire-feedback'); await mkdir(out, { recursive: true });
  for (const [name, width, height, touch] of [['desktop',1366,768,false],['portrait',390,844,true],['landscape',568,320,true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${arg('url','http://127.0.0.1:5197')}/tools/fixtures/battle-hud-layout.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__HUD_LAYOUT);
    const receipt = await page.evaluate(async () => {
      const f = window.__HUD_LAYOUT;
      const { PerspectiveCamera } = await import('/node_modules/three/build/three.module.js');
      const camera = new PerspectiveCamera(60, innerWidth / innerHeight, .1, 1000);
      camera.position.set(0,4,0); camera.lookAt(0,2,50); camera.updateMatrixWorld();
      f.frame.camera = camera; f.state('idle'); f.hud.update(f.frame);
      const hit = { attackerId:f.frame.player.id,targetId:f.tanks[8].id,targetName:'Leopard 2A5',
        targetSpecId:'leo2a5',attackerSpecId:'t90m',damage:0,dmgRoll:40,penRoll:25,
        baseArmor:200,effectiveArmor:220,impactAngleDeg:30,shellType:'AP',shellName:'M2',
        caliberMm:12.7,zone:'hullFront',flightDistM:50,timeS:60,pos:[0,1,50],
        localPos:[0,1,2],localDir:[0,0,-1],kind:'nonpen' };
      const fire = patch => f.bus.emit('shell:hit', {...hit,...patch});
      fire({caliberMm:120,shellName:'Main',damage:400,kind:'pen'});
      const prior = document.querySelector('.cot-si-card');
      for(let i=0;i<40;i++) fire({kind:'ricochet'});
      const preserved = prior === document.querySelector('.cot-si-card');
      fire({damage:5,kind:'pen'});
      const mgCard = document.querySelector('.cot-si-card')?.dataset.weapon;
      fire({caliberMm:30,shellName:'Auto',damage:40,kind:'pen'});
      const autoCard = document.querySelector('.cot-si-card')?.dataset.weapon;
      const auto = document.querySelector('.cot-si-card'); fire({caliberMm:30,kind:'nonpen'});
      const autoPreserved = auto === document.querySelector('.cot-si-card');
      f.state('idle'); f.hud.update(f.frame);
      for(let i=0;i<40;i++)fire({damage:.4,kind:'pen'});
      const labels = [...document.querySelectorAll('.cot-dmgnum')];
      const first = labels[0];
      const total = first?.textContent;
      fire({targetId:f.tanks[9].id,damage:3,kind:'pen'});
      const separateTargets = document.querySelectorAll('.cot-dmgnum').length;
      for(let i=0;i<100;i++) fire({kind:'ricochet'});
      const afterBlocks = document.querySelectorAll('.cot-dmgnum').length;
      const rects = [...document.querySelectorAll('.cot-dmgnum')].map(el => {
        const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
      });
      return {preserved,mgCard,autoCard,autoPreserved,labelCount:labels.length,total,separateTargets,afterBlocks,rects};
    });
    assert.equal(receipt.preserved,true); assert.equal(receipt.autoPreserved,true);
    if(!touch){assert.equal(receipt.mgCard,'machineGun');assert.equal(receipt.autoCard,'cannon');}
    assert.equal(receipt.labelCount,1); assert.equal(receipt.total,'-16');
    assert.equal(receipt.separateTargets,2);assert.equal(receipt.afterBlocks,2);
    for(const r of receipt.rects)assert.ok(r.left>=0&&r.right<=width&&r.top>=0&&r.bottom<=height,`${name}: number stays onscreen`);
    await page.screenshot({path:`${out}/${name}.png`});
    await page.waitForTimeout(2100);
    assert.equal(await page.locator('.cot-dmgnum').count(),0,'quiet burst labels expire');
    assert.deepEqual(errors,[]); console.log(`${name}: penetration-only cards, totals, blocks, bounds and expiry passed`);
    await context.close();
  }
} finally { await browser?.close(); clearInterval(refresh); lock.release(); }
