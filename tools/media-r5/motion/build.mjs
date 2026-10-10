#!/usr/bin/env node
// Builds a motion project (HyperFrames) from its edl.json:
//   index.html (footage + audio + sub-composition hosts)
//   compositions/{frame,titles,flashes,endcard,grain}.html
// Large type only (owner direction 2026-10-02): no eyebrows, kickers, sub-lines, spec lines or HUD labels. Every
// line on screen is at least MIN_TYPE px at 1080p; the wordmark's second line and the end-card address are the
// smallest, and motion-type.selftest.mjs holds the floor.
//   node tools/media-r5/motion/build.mjs <project dir or name under shots/media-r5/motion> [edl.json]
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { MOTION, SITE_URL } from '../paths.mjs';

export const MIN_TYPE = 56;
export const TITLE_KINDS = Object.freeze(['section', 'stat', 'line', 'logo', 'tank']);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r3 = x => Math.round(x * 1000) / 1000;
const FONTS = `@font-face{font-family:'Monument';src:url('assets/fonts/ABCMonumentGrotesk-Regular.woff2') format('woff2');font-weight:400;}
@font-face{font-family:'Monument';src:url('assets/fonts/ABCMonumentGrotesk-Medium.woff2') format('woff2');font-weight:500;}
@font-face{font-family:'Monument';src:url('assets/fonts/ABCMonumentGrotesk-Bold.woff2') format('woff2');font-weight:700;}`;

function writeGrain(file) {
  if (existsSync(file)) return;
  const c = createCanvas(256, 256), g = c.getContext('2d'), img = g.createImageData(256, 256);
  let a = 0x2545F491;
  const rnd = () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 1000) / 1000; };
  for (let i = 0; i < 256 * 256; i++) { const v = Math.round(128 + (rnd() + rnd() + rnd() - 1.5) * 120); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v)); img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); writeFileSync(file, c.toBuffer('image/png'));
}

/** Writes the project's compositions and index.html from an EDL object; returns { files } (relative path -> html). */
export function buildProject(dir, edl) {
  const W = edl.width ?? 1920, H = edl.height ?? 1080, D = edl.duration, FPS = edl.fps ?? 30;
  const BAR = edl.letterbox ? Math.round((H - W / edl.letterbox) / 2) : 0;
  const SAFE_B = edl.safeBottom ?? BAR;
  const PORTRAIT = H > W;
  const S = (PORTRAIT ? W / 1080 : W / 1920) * (edl.typeScale ?? 1); // type scale for other canvas sizes
  const px = v => `${Math.round(v * S)}px`;
  const files = {};
  const sub = (id, dur, css, markup, script) => `<!doctype html>
<html><head><meta charset="UTF-8" /></head>
<body>
<template>
<style>
${FONTS}
#root{position:absolute;inset:0;overflow:hidden;font-family:'Monument',sans-serif;color:#e8edf2}
.clip{position:absolute;inset:0}
${css}
</style>
<div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}" data-duration="${r3(dur)}">
${markup}
</div>
<script>
const tl = gsap.timeline({ paused: true });
${script}
window.__timelines["${id}"] = tl;
</script>
</template>
</body></html>
`;
  for (const t of edl.titles ?? []) if (!TITLE_KINDS.includes(t.kind)) throw new Error(`title kind '${t.kind}' is not part of the large-type system`);

  // ------------------------------------------------------------- frame (letterbox mattes only)
  if (BAR) {
    const js = [`tl.fromTo('#lb-top', {yPercent:-100}, {yPercent:0, duration:0.9, ease:'power3.out'}, ${edl.letterboxIn ?? 0.2});`,
      `tl.fromTo('#lb-bot', {yPercent:100}, {yPercent:0, duration:0.9, ease:'power3.out'}, ${edl.letterboxIn ?? 0.2});`];
    files['compositions/frame.html'] = sub('frame', D, `.bar{position:absolute;left:0;width:100%;height:${BAR}px;background:#07090c}
#lb-top{top:0}#lb-bot{bottom:0}`, `<div id="lb-top" class="bar"></div><div id="lb-bot" class="bar"></div>`, js.join('\n'));
  }

  // ------------------------------------------------------------- titles
  {
    const js = [], els = [];
    const letters = (text, cls = 'lt') => [...text].map(ch => `<span class="${cls}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
    for (const [i, t] of (edl.titles ?? []).entries()) {
      const id = `t${i}`, st = r3(t.start), du = r3(t.dur), out = r3(t.start + t.dur - 0.32);
      if (t.kind === 'section') {
        els.push(`<div id="${id}" class="clip ttl ttl-section ${t.align ?? 'left'}" data-start="${st}" data-duration="${du}"><div class="inner"><div class="word">${letters(t.text)}</div></div></div>`);
        js.push(`tl.fromTo('#${id} .lt', {yPercent:110}, {yPercent:0, duration:0.55, ease:'expo.out', stagger:0.045}, ${r3(t.start + 0.04)});`);
        js.push(`tl.fromTo('#${id} .inner', {clipPath:'inset(0 0 0 0%)'}, {clipPath:'inset(0 0 0 100%)', duration:0.3, ease:'power3.in'}, ${out});`);
      } else if (t.kind === 'stat') {
        const n = String(t.num);
        els.push(`<div id="${id}" class="clip ttl ttl-stat ${t.align ?? 'left'}" data-start="${st}" data-duration="${du}"><div class="inner"><div class="num">${'0'.repeat(n.length)}</div><div class="lab">${esc(t.label)}</div></div></div>`);
        js.push(`tl.to({ v: 0 }, { v: ${t.num}, duration: 0.9, ease: 'power4.out', onUpdate() { document.querySelector('#${id} .num').textContent = String(Math.round(this.targets()[0].v)).padStart(${n.length}, '0'); } }, ${st});`);
        js.push(`tl.fromTo('#${id} .num', {opacity:0}, {opacity:1, duration:0.12, ease:'none'}, ${st});`);
        js.push(`tl.fromTo('#${id} .lab', {opacity:0, x:-20}, {opacity:1, x:0, duration:0.35, ease:'power3.out'}, ${r3(t.start + 0.25)});`);
        js.push(`tl.fromTo('#${id} .inner', {clipPath:'inset(0 0 0 0%)'}, {clipPath:'inset(0 0 0 100%)', duration:0.28, ease:'power3.in'}, ${out});`);
      } else if (t.kind === 'line') {
        els.push(`<div id="${id}" class="clip ttl ttl-line ${t.align ?? 'left'}" data-start="${st}" data-duration="${du}"><div class="inner"><div class="ln">${esc(t.text)}</div></div></div>`);
        js.push(`tl.fromTo('#${id} .ln', {opacity:0, scale:1.07, color:'#ffffff'}, {opacity:1, scale:1, color:'#e8edf2', duration:0.16, ease:'expo.out'}, ${st});`);
        js.push(`tl.fromTo('#${id} .inner', {clipPath:'inset(0 0 0 0%)'}, {clipPath:'inset(0 0 0 100%)', duration:0.26, ease:'power3.in'}, ${out});`);
      } else if (t.kind === 'logo') {
        els.push(`<div id="${id}" class="clip ttl ttl-logo" data-start="${st}" data-duration="${du}"><div class="dim"></div><div class="lockup"><img class="mk" src="assets/brand/logo-mark-metal.svg" alt=""><div class="wm"><div class="a">${letters('CLAUDE', 'l')}</div><div class="b">${letters('OF TANKS', 'l')}</div></div></div></div>`);
        js.push(`tl.fromTo('#${id} .dim', {opacity:0}, {opacity:0.62, duration:0.12, ease:'none'}, ${st});`);
        js.push(`tl.fromTo('#${id} .mk', {scale:1.35, opacity:0}, {scale:1, opacity:1, duration:0.22, ease:'expo.out'}, ${st});`);
        js.push(`tl.fromTo('#${id} .a span', {opacity:0, y:${Math.round(40 * S)}}, {opacity:1, y:0, duration:0.4, ease:'expo.out', stagger:0.03}, ${r3(t.start + 0.05)});`);
        js.push(`tl.fromTo('#${id} .b span', {opacity:0, y:${Math.round(-24 * S)}}, {opacity:1, y:0, duration:0.4, ease:'expo.out', stagger:0.03}, ${r3(t.start + 0.12)});`);
        js.push(`tl.fromTo('#${id} .lockup', {scale:1.0}, {scale:1.04, duration:${r3(t.dur)}, ease:'none'}, ${st});`);
        js.push(`tl.to('#${id} .lockup, #${id} .dim', {opacity:0, duration:0.3, ease:'power2.in'}, ${r3(t.start + t.dur - 0.3)});`);
      } else if (t.kind === 'tank') {
        // a tank's public name rising letter by letter — the name is the whole title
        els.push(`<div id="${id}" class="clip ttl ttl-tank" data-start="${st}" data-duration="${du}"><div class="inner"><div class="word">${letters(t.name.toUpperCase())}</div></div></div>`);
        js.push(`tl.fromTo('#${id} .lt', {yPercent:105}, {yPercent:0, duration:0.42, ease:'expo.out', stagger:0.022}, ${r3(t.start + 0.04)});`);
        js.push(`tl.to('#${id} .inner', {opacity:0, duration:0.14, ease:'none'}, ${r3(t.start + t.dur - 0.14)});`);
      }
    }
    const lift = SAFE_B + Math.round(64 * S);
    const css = `.ttl{pointer-events:none}
.ttl .inner{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end}
.ttl-section .inner,.ttl-stat .inner,.ttl-line .inner,.ttl-tank .inner{padding:0 0 ${lift}px ${px(96)}}
.ttl-section.right .inner{align-items:flex-end;padding-right:${px(96)}}
.ttl-section .word{display:flex;overflow:hidden;font-weight:700;font-size:${px(208)};line-height:.9;letter-spacing:-.02em;color:#e8edf2;text-shadow:0 6px 40px rgba(7,9,12,.45)}
.ttl-section .lt,.ttl-tank .lt{display:block}
.ttl-stat .num{font-weight:700;font-size:${px(184)};line-height:1;color:#ffd27a;font-variant-numeric:tabular-nums;display:flex;text-shadow:0 6px 40px rgba(7,9,12,.5)}
.ttl-stat .lab{font-weight:700;font-size:${px(72)};letter-spacing:.1em;text-transform:uppercase;margin-top:${px(6)};text-shadow:0 4px 30px rgba(7,9,12,.5)}
.ttl-line.center .inner{align-items:center;justify-content:center;padding:0}
.ttl-line .ln{font-weight:700;font-size:${px(88)};letter-spacing:.03em;text-transform:uppercase;line-height:1.02;max-width:${px(PORTRAIT ? 900 : 1728)};text-wrap:balance;text-shadow:0 6px 40px rgba(7,9,12,.5)}
.ttl-line.center .ln{text-align:center}
.ttl-logo .dim{position:absolute;inset:0;background:#07090c}
.ttl-logo .lockup{position:absolute;inset:0;display:flex;${PORTRAIT ? 'flex-direction:column;' : ''}align-items:center;justify-content:center;gap:${px(40)}}
.ttl-logo .mk{width:${px(200)};height:${px(200)}}
.ttl-logo .wm{display:flex;flex-direction:column;${PORTRAIT ? 'align-items:center;' : ''}gap:${px(8)}}
.ttl-logo .wm span{display:inline-block}
.ttl-logo .a{font-weight:700;font-size:${px(156)};line-height:.9;letter-spacing:.02em}
.ttl-logo .b{font-weight:500;font-size:${px(64)};line-height:1;letter-spacing:.34em;color:#ffd27a}
.ttl-tank .word{display:flex;overflow:hidden;font-weight:700;font-size:${px(PORTRAIT ? 112 : 152)};line-height:.92;letter-spacing:-.01em;color:#e8edf2;text-shadow:0 6px 40px rgba(7,9,12,.5)}`;
    files['compositions/titles.html'] = sub('titles', D, css, els.join('\n'), js.join('\n'));
  }

  // ------------------------------------------------------------- flashes (under the frame mattes)
  {
    const js = [], els = [];
    for (const [i, f] of (edl.flashes ?? []).entries()) {
      const id = `fl${i}`, dur = (f.frames ?? 3) / FPS;
      els.push(`<div id="${id}" class="clip flash" data-start="${r3(f.t)}" data-duration="${r3(dur + 0.2)}" style="background:${f.color ?? '#fff6e6'}"></div>`);
      js.push(`tl.fromTo('#${id}', {opacity:${f.peak ?? 0.9}}, {opacity:0, duration:${r3(dur + 0.2)}, ease:'power2.in'}, ${r3(f.t)});`);
    }
    files['compositions/flashes.html'] = sub('flashes', D, `.flash{mix-blend-mode:screen}`, els.join('\n'), js.join('\n'));
  }

  // ------------------------------------------------------------- end card: crest, shield trace, wordmark, the address
  if (edl.endcard) {
    const e = edl.endcard, du = D - e.start, js = [];
    const word = (id, text) => `<div id="${id}">${[...text].map(ch => `<span>${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</div>`;
    js.push(`tl.fromTo('#end-bg', {opacity:0}, {opacity:1, duration:0.5, ease:'power2.inOut'}, 0);`);
    js.push(`tl.fromTo('#end-glow', {opacity:0, scale:0.8}, {opacity:1, scale:1, duration:2.4, ease:'power2.out'}, 0.2);`);
    js.push(`tl.fromTo('#crest', {opacity:0, scale:1.18, filter:'blur(14px)'}, {opacity:1, scale:1, filter:'blur(0px)', duration:0.9, ease:'expo.out'}, 0.25);`);
    js.push(`tl.fromTo('#trace .tr', {strokeDashoffset:1000}, {strokeDashoffset:0, duration:1.5, ease:'power3.inOut'}, 0.15);`);
    js.push(`tl.fromTo('#w1 span', {opacity:0, x:(i,el,all)=>(i-(all.length-1)/2)*${Math.round(46 * S)}}, {opacity:1, x:0, duration:1.0, ease:'expo.out', stagger:{each:0.025, from:'center'}}, 0.6);`);
    js.push(`tl.fromTo('#w2 span', {opacity:0, x:(i,el,all)=>(i-(all.length-1)/2)*${Math.round(30 * S)}}, {opacity:1, x:0, duration:1.0, ease:'expo.out', stagger:{each:0.025, from:'center'}}, 0.75);`);
    js.push(`tl.fromTo('#url', {opacity:0, y:14}, {opacity:1, y:0, duration:0.6, ease:'power3.out'}, 1.6);`);
    // The trace follows the crest's own shield (owner 2026-10-04: "not a circle around a shield but a thing that traces
    // the shield"): logo-mark-metal.svg's outline (256-unit box), scaled 1.16 about its centre so the line runs ~17
    // units out — the bevelled band reaches 9 — and drawn from the bottom point up both flanks to meet at the top.
    const sx = x => r3(128 + (x - 128) * 1.16), sy = y => r3(132 + (y - 132) * 1.16);
    const flank = m => `M${sx(128)} ${sy(238)} C${sx(m(196))} ${sy(214)} ${sx(m(236))} ${sy(174)} ${sx(m(236))} ${sy(112)} V${sy(40)} L${sx(m(222))} ${sy(26)} H${sx(128)}`;
    const markup = `<div id="end-bg"></div><div id="end-glow"></div>
<svg id="trace" viewBox="-16 -16 288 288"><path class="tr" pathLength="1000" d="${flank(x => x)}"/><path class="tr" pathLength="1000" d="${flank(x => 256 - x)}"/></svg>
<img id="crest" src="assets/brand/logo-mark-metal.svg" alt="">
<div id="wordmark">${word('w1', 'CLAUDE')}${word('w2', 'OF TANKS')}</div>
<div id="url">${esc(e.url ?? SITE_URL)}</div>`;
    const css = `#end-bg{position:absolute;inset:0;background:#0b0e11}
#end-glow{position:absolute;left:50%;top:44%;width:${px(1400)};height:${px(900)};margin:${px(-450)} 0 0 ${px(-700)};background:radial-gradient(closest-side,rgba(240,161,46,.22),rgba(240,161,46,0))}
#crest{position:absolute;left:50%;top:${Math.round(H * 0.12)}px;width:${px(300)};height:${px(300)};margin-left:${px(-150)}}
#trace{position:absolute;left:50%;top:${Math.round(H * 0.12 - 18.75 * S)}px;width:${px(337.5)};height:${px(337.5)};margin-left:${px(-168.75)};overflow:visible}
#trace .tr{fill:none;stroke:rgba(240,161,46,.9);stroke-width:2.6;stroke-linejoin:miter;stroke-linecap:round;stroke-dasharray:1000;filter:drop-shadow(0 0 ${px(6)} rgba(240,161,46,.6))}
#wordmark{position:absolute;left:0;right:0;top:${Math.round(H * 0.47)}px;display:flex;flex-direction:column;align-items:center;gap:${px(12)}}
#wordmark span{display:inline-block}
#w1{font-weight:700;font-size:${px(132)};line-height:1;letter-spacing:.06em}
#w2{font-weight:500;font-size:${px(MIN_TYPE)};line-height:1;letter-spacing:.24em;color:#ffd27a}
#url{position:absolute;left:0;right:0;top:${Math.round(H * (PORTRAIT ? 0.7 : 0.74))}px;text-align:center;font-weight:700;font-size:${px(MIN_TYPE)};letter-spacing:.08em;color:#f0a12e}`;
    files['compositions/endcard.html'] = sub('endcard', du, css, markup, js.join('\n'));
  }

  // ------------------------------------------------------------- grain
  {
    const frames = Math.round(D * FPS);
    const js = `const g = document.querySelector('#grain-g');
tl.to({ k: 0 }, { k: ${frames}, duration: ${D}, ease: 'none', onUpdate() { const k = Math.floor(this.targets()[0].k); const h = Math.imul(k + 1, 2654435761) >>> 0; g.style.backgroundPosition = (h % 256) + 'px ' + ((h >>> 8) % 256) + 'px'; } }, 0);`;
    files['compositions/grain.html'] = sub('grain', D,
      `#grain-g{position:absolute;inset:0;background:url('assets/grain.png');opacity:${edl.grain ?? 0.07};mix-blend-mode:overlay}`, `<div id="grain-g" data-layout-allow-occlusion></div>`, js);
  }

  // ------------------------------------------------------------- index
  {
    const body = [];
    for (const [i, s] of edl.shots.entries()) {
      const id = `v${String(i + 1).padStart(2, '0')}`;
      body.push(`<video id="${id}" class="clip shot" src="${esc(s.src)}" muted playsinline data-start="${r3(s.start)}" data-duration="${r3(s.dur)}" data-media-start="${r3(s.in ?? 0)}" data-track-index="${1 + (i % 2)}"${s.rate ? ` data-playback-rate="${s.rate}"` : ''}></video>`);
    }
    const host = (id, start, dur, track) => `<div id="${id}-host" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${r3(start)}" data-duration="${r3(dur)}" data-track-index="${track}" data-width="${W}" data-height="${H}"></div>`;
    body.push(host('flashes', 0, D, 5));
    if (BAR) body.push(host('frame', 0, D, 6));
    body.push(host('titles', 0, D, 7));
    if (edl.endcard) body.push(host('endcard', edl.endcard.start, D - edl.endcard.start, 8));
    body.push(host('grain', 0, D, 9));
    if (edl.audio) body.push(`<audio id="mix" src="${esc(edl.audio)}" data-start="0" data-duration="${D}" data-track-index="20" data-volume="1"></audio>`);
    files[edl.out ?? 'index.html'] = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#07090c}
#root{position:relative;width:100%;height:100%;overflow:hidden;background:#07090c}
.clip{position:absolute;inset:0}
video.shot{width:100%;height:100%;object-fit:cover;background:#07090c}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="${W}" data-height="${H}">
${body.join('\n')}
</div>
<script>
const tl = gsap.timeline({ paused: true });
${edl.shots.map((s, i) => s.push ? `tl.fromTo('#v${String(i + 1).padStart(2, '0')}', {scale:${s.push[0]}}, {scale:${s.push[1]}, duration:${r3(s.dur)}, ease:'none'}, ${r3(s.start)});` : '').filter(Boolean).join('\n')}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`;
  }

  if (dir) {
    mkdirSync(join(dir, 'compositions'), { recursive: true });
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeGrain(join(dir, 'assets/grain.png'));
    for (const [rel, html] of Object.entries(files)) writeFileSync(join(dir, rel), html);
    if (!BAR) rmSync(join(dir, 'compositions/frame.html'), { force: true }); // an older build's HUD frame
  }
  return { files, letterbox: BAR };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv[2];
  if (!arg) throw new Error('usage: build.mjs <project> [edl.json]');
  const dir = existsSync(arg) ? resolve(arg) : join(MOTION, arg);
  const edl = JSON.parse(readFileSync(join(dir, process.argv[3] ?? 'edl.json'), 'utf8'));
  const { letterbox } = buildProject(dir, edl);
  console.log(`built ${dir}: ${edl.shots.length} shots, ${(edl.titles ?? []).length} titles, ${edl.duration}s, letterbox ${letterbox}px`);
}
