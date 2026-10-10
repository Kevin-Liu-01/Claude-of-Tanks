#!/usr/bin/env node
// Key-art poster system as HyperFrames compositions: the 4K master and the lockup, nothing else (no eyebrows,
// captions, fact lines or HUD). 'cinema' scopes the landscape art to 2.39:1 and sets a one-line lockup in the
// lower matte; 'keyart' lays the two-line lockup over a soft scrim.
//   node tools/media-r5/motion/posters-build.mjs [posters.json]   -> shots/media-r5/motion/posters-{land,port,square}/index.html
// Each poster i occupies [i, i+1) s; a snapshot at i + 0.5 renders it.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MOTION, REPO, TOOL } from '../paths.mjs';
import { MIN_TYPE } from './build.mjs';

const list = JSON.parse(readFileSync(resolve(process.argv[2] ?? join(TOOL, 'motion/posters.json')), 'utf8'));
const FORMATS = { land: [3840, 2160], port: [2160, 3840], square: [2160, 2160] };
const FONTS = `@font-face{font-family:'Monument';src:url('assets/fonts/ABCMonumentGrotesk-Regular.woff2') format('woff2');font-weight:400;}
@font-face{font-family:'Monument';src:url('assets/fonts/ABCMonumentGrotesk-Medium.woff2') format('woff2');font-weight:500;}
@font-face{font-family:'Monument';src:url('assets/fonts/ABCMonumentGrotesk-Bold.woff2') format('woff2');font-weight:700;}`;
const extname = p => /\.[a-z0-9]+$/i.exec(p)?.[0] ?? '.png';
for (const [fmt, [W, H]] of Object.entries(FORMATS)) {
  const items = list.filter(p => p.formats?.includes(fmt) ?? fmt === 'land');
  if (!items.length) continue;
  const dir = join(MOTION, `posters-${fmt}`);
  mkdirSync(join(dir, 'assets/art'), { recursive: true });
  const u = W / (fmt === 'land' ? 1920 : 1080); // unit scale from the 1080p design grid
  const px = v => `${Math.round(v * u)}px`;
  const BAR = fmt === 'land' ? Math.round((H - W / 2.39) / 2) : 0;
  const els = [], index = [];
  items.forEach((p, i) => {
    const art = p[`art_${fmt}`] ?? p.art;
    const name = `${p.id}-${fmt}${extname(art)}`;
    copyFileSync(join(REPO, art), join(dir, 'assets/art', name));
    const t = p.treatment ?? 'cinema';
    // pos_<fmt>: where a crop sits on the art (CSS object-position), for a hero that is not centred in the landscape frame
    const pos = p[`pos_${fmt}`];
    let inner = `<img class="art" src="assets/art/${name}"${pos ? ` style="object-position:${pos}"` : ''} alt="">`;
    if (fmt === 'land' && t === 'cinema') inner += `<div class="bar top"></div><div class="bar bot"><div class="line"><img src="assets/brand/logo-mark-metal.svg" alt=""><span>CLAUDE <em>OF TANKS</em></span></div></div>`;
    else if (t !== 'clean') inner += `<div class="scrim"></div><div class="lock"><img class="mk" src="assets/brand/logo-mark-metal.svg" alt=""><div class="wm"><div class="a">CLAUDE</div><div class="b">OF TANKS</div></div></div>`;
    els.push(`<div id="p${i}" class="clip poster ${t}" data-start="${i}" data-duration="1">${inner}</div>`);
    index.push({ id: p.id, fmt, treatment: t, at: i + 0.5 });
  });
  const css = `${FONTS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#07090c}
#root{position:relative;width:100%;height:100%;overflow:hidden;font-family:'Monument',sans-serif;color:#e8edf2}
.clip{position:absolute;inset:0}
.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.bar{position:absolute;left:0;width:100%;height:${BAR}px;background:#07090c;display:flex;align-items:center;justify-content:center}
.bar.top{top:0}.bar.bot{bottom:0}
.bar .line{display:flex;align-items:center;gap:${px(22)}}
.bar .line img{width:${px(84)};height:${px(84)}}
.bar .line span{font-weight:700;font-size:${px(Math.max(MIN_TYPE, 60))};letter-spacing:.1em;line-height:1}
.bar .line em{font-style:normal;font-weight:500;color:#ffd27a;letter-spacing:.2em;margin-left:.25em}
.scrim{position:absolute;inset:0;background:${fmt === 'port'
    ? 'linear-gradient(0deg, rgba(7,9,12,.78) 0%, rgba(7,9,12,.42) 18%, rgba(7,9,12,0) 34%)'
    : 'radial-gradient(70% 60% at 0% 100%, rgba(7,9,12,.7) 0%, rgba(7,9,12,0) 70%)'}}
.lock{position:absolute;${fmt === 'port' ? `left:0;right:0;bottom:${px(220)};flex-direction:column;align-items:center;` : `left:${px(80)};bottom:${px(96)};align-items:center;`}display:flex;gap:${px(30)}}
.lock .mk{width:${px(fmt === 'port' ? 220 : 190)};height:${px(fmt === 'port' ? 220 : 190)}}
.lock .wm{display:flex;flex-direction:column;${fmt === 'port' ? 'align-items:center;' : ''}gap:${px(6)}}
.lock .a{font-weight:700;font-size:${px(fmt === 'port' ? 168 : 148)};line-height:.9;letter-spacing:.02em;text-shadow:0 4px 30px rgba(7,9,12,.5)}
.lock .b{font-weight:500;font-size:${px(fmt === 'port' ? 70 : 62)};letter-spacing:.3em;color:#ffd27a;text-shadow:0 2px 18px rgba(7,9,12,.5)}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=${W}, height=${H}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>${css}</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${items.length}" data-width="${W}" data-height="${H}">
${els.join('\n')}
</div>
<script>
const tl = gsap.timeline({ paused: true });
tl.set({}, {}, ${items.length});
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body></html>
`;
  writeFileSync(join(dir, 'index.html'), html);
  writeFileSync(join(dir, 'posters-index.json'), JSON.stringify(index, null, 1));
  console.log(`${fmt}: ${items.length} posters -> ${dir}`);
}
