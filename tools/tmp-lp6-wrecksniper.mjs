// TEMP lighting_post r6: (1) reproduce sequence explosion black deck, then hide
// the victim's shadowProxy meshes -> deck recovers? (2) sniper murk: A/B the
// scope grade term and the aerial zoom floor.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5714, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5714/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));

// --- sequence like the harness (subset) then explosion
for (const v of ['battlefield', 'player_view', 'combat_firing']) {
  await page.evaluate(`window.__SHOTS.set('${v}')`);
  await new Promise((r) => setTimeout(r, 700));
}
await page.evaluate("window.__SHOTS.set('explosion')");
await new Promise((r) => setTimeout(r, 1500));
writeFileSync('shots/_lp6_ex_seq.png', await page.screenshot({ type: 'png' }));

// hide shadow proxies on the destroyed tank
const info = await page.evaluate(() => {
  const D = window.__DEBUG;
  let hid = 0;
  const victims = D.game.tanks.filter((t) => t.team === 'enemy');
  const ent = victims[2];
  const names = [];
  ent.visual.root.traverse((o) => {
    if (o.isMesh && o.name && o.name.startsWith('shadowProxy')) { o.visible = false; hid++; names.push(o.name); }
  });
  // also record which meshes now wear mats.burnt (material with burntTri key)
  let burntSwapped = 0;
  ent.visual.root.traverse((o) => {
    if (o.isMesh && o.visible && o.material && o.material.customProgramCacheKey &&
        String(o.material.customProgramCacheKey()).includes('burnt')) burntSwapped++;
  });
  return { hid, names, burntSwapped, specId: ent.specId };
});
console.log(JSON.stringify(info));
await new Promise((r) => setTimeout(r, 400));
writeFileSync('shots/_lp6_ex_noproxy.png', await page.screenshot({ type: 'png' }));

// --- sniper murk decomposition
await page.evaluate("window.__SHOTS.set('sniper_view')");
await new Promise((r) => setTimeout(r, 1400));
writeFileSync('shots/_lp6_sn_base.png', await page.screenshot({ type: 'png' }));
// (a) hud hidden
await page.evaluate(() => { window.__DEBUG.scene.userData.__x = 1; });
await page.evaluate(() => {
  const hud = document.querySelector('canvas.cot-hud, #hud, .hud');
  // hud is likely canvas overlays; hide ALL siblings of the GL canvas
  const gl = window.__DEBUG.renderer.domElement;
  for (const el of document.body.querySelectorAll('canvas, div')) {
    if (el !== gl && el.tagName === 'CANVAS') el.style.visibility = 'hidden';
  }
});
await new Promise((r) => setTimeout(r, 300));
writeFileSync('shots/_lp6_sn_nohud.png', await page.screenshot({ type: 'png' }));
// (b) scope grade term off (uScope -> 0 by clearing the rig flag)
await page.evaluate(() => { window.__DEBUG.camera.userData.scoped = false; });
await new Promise((r) => setTimeout(r, 400));
writeFileSync('shots/_lp6_sn_noscope.png', await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
