// Brand asset renderer (logo agent). Two modes:
//   sheet:  node tools/brand-render.mjs sheet <svg> <out.png>
//           -> contact sheet: hero render + true-raster 128/64/32/16 px views
//              (nearest-neighbor upscaled so pixel-level mud is visible) on the
//              game's dark background, plus a light-bg sanity patch.
//   export: node tools/brand-render.mjs export <svg> <out.png> <width> [height] [bg]
//           -> single PNG at exact size; bg 'transparent' (default), a CSS
//              color, or 'cot-dark' for the official social-card gradient.
// SVGs are rasterized via data-URI <img> onto <canvas>, so only pure-path SVGs
// (no <text>) are size-faithful; brand marks here are pure paths by design.
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , mode, svgPath, outPath, wArg, hArg, bgArg] = process.argv;
if (!mode || !svgPath || !outPath) {
  console.error('usage: brand-render.mjs sheet|export <svg> <out.png> [w] [h] [bg]');
  process.exit(2);
}
const svgText = readFileSync(resolve(svgPath), 'utf8');
const svgUri = `data:image/svg+xml;base64,${Buffer.from(svgText).toString('base64')}`;

const browser = await puppeteer.launch({ headless: 'shell' });
const page = await browser.newPage();

if (mode === 'sheet') {
  await page.setViewport({ width: 1360, height: 1240, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#0b1117;font:12px monospace;color:#9fb0bf">
    <div style="padding:18px">
      <div id="hero" style="display:inline-block;background:
        radial-gradient(118% 82% at 50% 22%, #16202b 0%, #0b1117 42%, #05080b 78%)"></div>
      <div id="small" style="margin-top:14px;display:flex;gap:22px;align-items:flex-start"></div>
      <div id="true" style="margin-top:14px;display:flex;gap:18px;align-items:center;background:#0b1117;padding:8px"></div>
      <div style="margin-top:14px;background:#e8e4da;display:inline-block;padding:12px" id="light"></div>
    </div>
    <script>
      const uri = ${JSON.stringify(svgUri)};
      function rasterize(img, px, scale, label, parent, dark) {
        const ar = img.naturalHeight / img.naturalWidth;
        const w = px, h = Math.round(px * ar);
        const c = document.createElement('canvas');
        c.width = w * scale; c.height = h * scale;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true; // downscale AA like a browser favicon
        const t = document.createElement('canvas'); t.width = w; t.height = h;
        t.getContext('2d').drawImage(img, 0, 0, w, h);
        g.imageSmoothingEnabled = false; // NN upscale to inspect pixels
        g.drawImage(t, 0, 0, w * scale, h * scale);
        const box = document.createElement('div');
        box.style.cssText = 'text-align:center;color:#9fb0bf;font:11px monospace';
        if (dark) c.style.background = '#0b1117';
        box.appendChild(c);
        const cap = document.createElement('div'); cap.textContent = label; box.appendChild(cap);
        parent.appendChild(box);
      }
      const img = new Image();
      img.onload = () => {
        const hero = img.cloneNode(); hero.style.height = '560px'; hero.style.display = 'block';
        hero.style.padding = '30px';
        document.getElementById('hero').appendChild(hero);
        const small = document.getElementById('small');
        rasterize(img, 128, 4, '128px x4', small, true);
        rasterize(img, 64, 6, '64px x6', small, true);
        rasterize(img, 32, 8, '32px x8', small, true);
        rasterize(img, 16, 10, '16px x10', small, true);
        const tr = document.getElementById('true');
        for (const px of [128, 64, 48, 32, 16]) {
          const i = img.cloneNode(); i.style.width = px + 'px'; tr.appendChild(i);
        }
        const li = img.cloneNode(); li.style.width = '160px';
        document.getElementById('light').appendChild(li);
        document.title = 'ready';
      };
      img.src = uri;
    </script></body></html>`);
  await page.waitForFunction(() => document.title === 'ready', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: resolve(outPath), fullPage: true });
} else if (mode === 'export') {
  const w = parseInt(wArg, 10);
  const h = hArg && hArg !== 'auto' ? parseInt(hArg, 10) : 0;
  const bg = bgArg || 'transparent';
  await page.setViewport({ width: Math.max(w, 8), height: Math.max(h || w, 8), deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0"><script>
    const img = new Image();
    img.onload = () => {
      const ar = img.naturalHeight / img.naturalWidth;
      const W = ${w}, H = ${h} || Math.round(W * ar);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const bg = ${JSON.stringify(bg)};
      if (bg === 'cot-dark') {
        const field = g.createLinearGradient(0, 0, 0, H);
        field.addColorStop(0, '#101a24');
        field.addColorStop('.56', '#0c131b');
        field.addColorStop(1, '#0b0f12');
        g.fillStyle = field;
        g.fillRect(0, 0, W, H);
        const glow = g.createRadialGradient(W * .42, H * .18, 0, W * .42, H * .18, W * .58);
        glow.addColorStop(0, 'rgba(48, 68, 85, .18)');
        glow.addColorStop(1, 'rgba(11, 15, 18, 0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
      } else if (bg !== 'transparent') {
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);
      }
      // contain-fit
      const s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      c.id = 'out'; document.body.appendChild(c); document.title = 'ready';
    };
    img.src = ${JSON.stringify(svgUri)};
  </script></body></html>`);
  await page.waitForFunction(() => document.title === 'ready', { timeout: 15000 });
  const el = await page.$('#out');
  await el.screenshot({ path: resolve(outPath), omitBackground: bg === 'transparent' });
} else {
  console.error(`unknown mode ${mode}`);
  process.exit(2);
}
await browser.close();
console.log(`${mode} -> ${outPath}`);
