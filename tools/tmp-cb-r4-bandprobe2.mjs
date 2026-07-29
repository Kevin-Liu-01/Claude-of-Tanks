// r4 content_breadth: which splat term paints the desert dark bands?
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = '/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad/bandprobe';
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5901, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: { entries: ['index.html'], include: ['three'] },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.error('PAGEERR', String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
await page.evaluate(() => window.__SHOTS.set('battlefield_desert'));
await new Promise((r) => setTimeout(r, 3500));

async function crop(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 300, y: 780, width: 900, height: 300 } });
  console.log('captured', name);
}

// find terrain splat shader uniforms
const found = await page.evaluate(() => {
  window.__tuni = [];
  window.__DEBUG.scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.userData) {
      const sh = o.material.userData.shader || o.material.__shader;
      if (sh && sh.uniforms && sh.uniforms.uRipple) window.__tuni.push(sh.uniforms);
    }
  });
  // fallback: onBeforeCompile stored elsewhere — scan all materials for uniforms map
  if (window.__tuni.length === 0) {
    window.__DEBUG.scene.traverse((o) => {
      if (o.isMesh && o.material && o.material.customProgramCacheKey &&
          String(o.material.customProgramCacheKey()).includes('world-terrain')) {
        window.__tmat = o.material;
      }
    });
  }
  return { n: window.__tuni.length, hasMat: !!window.__tmat };
});
console.log(JSON.stringify(found));

if (found.n === 0) {
  // patch via onBeforeRender? simpler: grab from renderer programs
  const ok = await page.evaluate(() => {
    const gl = window.__DEBUG.renderer;
    const props = gl.properties;
    let uni = null;
    window.__DEBUG.scene.traverse((o) => {
      if (uni || !o.isMesh || !o.material) return;
      const p = props.get(o.material);
      if (p && p.uniforms && p.uniforms.uRipple) { uni = p.uniforms; window.__tuni.push(uni); }
    });
    return !!uni;
  });
  console.log('renderer-props path:', ok);
}

async function setU(fn, name) {
  await page.evaluate(fn);
  await new Promise((r) => setTimeout(r, 500));
  await crop(name);
}

await setU(() => { for (const u of window.__tuni) { u.__rip = u.uRipple.value.z; u.uRipple.value.z = 0; } }, 'E_noripple');
await setU(() => { for (const u of window.__tuni) { u.uRipple.value.z = u.__rip; u.__mid = u.uMidRelief.value; u.uMidRelief.value = 0; } }, 'F_nomidrelief');
await setU(() => { for (const u of window.__tuni) { u.uMidRelief.value = u.__mid; u.uTintB.value.set(1, 1, 1); } }, 'G_notintB');

await browser.close(); await server.close(); process.exit(0);
