#!/usr/bin/env node
// Media kit review/press page from kit/manifest.json (relative links into the kit folder).
// Large type only: no eyebrows or letterspaced micro-labels, and nothing on the page is set below 16 px.
//   node tools/media-r5/kit-page.mjs [kitDir=shots/media-r5/kit]
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { KIT as DEFAULT_KIT, REPO } from './paths.mjs';

const KIT = resolve(process.argv[2] ?? DEFAULT_KIT);
const m = JSON.parse(readFileSync(join(KIT, 'manifest.json'), 'utf8'));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
mkdirSync(join(KIT, 'assets'), { recursive: true });
for (const f of ['ABCMonumentGrotesk-Regular.woff2', 'ABCMonumentGrotesk-Medium.woff2', 'ABCMonumentGrotesk-Bold.woff2'])
  if (!existsSync(join(KIT, 'assets', f))) copyFileSync(join(REPO, 'public/fonts/abc-monument-grotesk', f), join(KIT, 'assets', f));
if (!existsSync(join(KIT, 'assets/logo-mark-metal.svg'))) copyFileSync(join(REPO, 'public/brand/logo-mark-metal.svg'), join(KIT, 'assets/logo-mark-metal.svg'));
const TIME_ORDER = ['dawn', 'morning', 'day', 'golden', 'sunset', 'dusk', 'night', 'space'];
const TIME_LABEL = { dawn: 'Dawn', morning: 'Morning', day: 'High noon', golden: 'Golden hour', sunset: 'Sunset', dusk: 'Blue hour', night: 'Night', space: 'Beyond' };
const dl = (href, label) => href ? `<a class="dl" href="${esc(href)}" download>${esc(label)}</a>` : '';
const stillCard = s => `<figure class="still">
  <a class="img" href="${esc(s.files.land_png ?? s.files.land_webp)}"><img loading="lazy" src="${esc(s.files.preview ?? s.files.land_webp)}" alt="${esc(`${s.mapName} at ${TIME_LABEL[s.time] ?? s.time}`)}"></a>
  <figcaption><p class="cap">${esc(s.mapName)}${s.tanks?.length ? ` with the ${esc(s.tanks.join(', '))}` : ''}</p>
  <div class="dls">${dl(s.files.land_png, '4K PNG')}${dl(s.files.land_webp, 'WebP')}${dl(s.files.port_png, '9:16')}${dl(s.files.square_png, '1:1')}</div></figcaption>
</figure>`;
const byTime = TIME_ORDER.map(t => [t, (m.stills ?? []).filter(s => s.time === t)]).filter(([, l]) => l.length);
const video = v => `<article class="film">
  <video controls preload="none" playsinline poster="${esc(v.files.poster ?? '')}"><source src="${esc(v.files.preview ?? v.files.mp4_1080 ?? v.files.mp4)}" type="video/mp4"></video>
  <div class="ftxt"><h3>${esc(v.title)}</h3><p>${esc(v.description ?? '')}</p>
  <div class="dls">${dl(v.files.mp4_4k, '4K MP4')}${dl(v.files.mp4_1080, '1080p MP4')}${dl(v.files.mp4, 'MP4')}${dl(v.files.poster, 'Poster')}</div></div>
</article>`;
const frame = f => `<figure class="still"><a class="img" href="${esc(f.file)}"><img loading="lazy" src="${esc(f.preview ?? f.file)}" alt="${esc(`${f.technique}: ${f.title}`)}"></a>
  <figcaption><p class="cap"><b>${esc(f.technique)}.</b> ${esc(f.title)}</p><div class="dls">${dl(f.file, 'Full size')}</div></figcaption></figure>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Media Kit · Claude of Tanks</title>
<style>
@font-face{font-family:'Monument';src:url('assets/ABCMonumentGrotesk-Regular.woff2') format('woff2');font-weight:400}
@font-face{font-family:'Monument';src:url('assets/ABCMonumentGrotesk-Medium.woff2') format('woff2');font-weight:500}
@font-face{font-family:'Monument';src:url('assets/ABCMonumentGrotesk-Bold.woff2') format('woff2');font-weight:700}
:root{--bg:#05080b;--surface:#0a0f14;--ink:#edf3f7;--muted:#a9b8c4;--line:rgba(153,174,190,.2);--amber:#f0a030;--gold:#ffd27a;--pad:clamp(16px,4vw,64px)}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--ink);font-family:'Monument',system-ui,sans-serif;font-size:18px;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:inherit}img,video{display:block;max-width:100%}
.shell{width:min(100%,1480px);margin:auto;padding-inline:var(--pad)}
header.top{display:flex;align-items:center;gap:18px;padding-block:28px;border-bottom:1px solid var(--line)}
header.top img{width:56px;height:56px}header.top .t{font-weight:700;font-size:26px;letter-spacing:.04em}header.top .t b{color:var(--gold);font-weight:500}
.hero{padding:clamp(40px,6vw,90px) 0 28px}
.hero h1{margin:0 0 16px;font-size:clamp(44px,7vw,104px);line-height:.9;letter-spacing:-.01em;text-transform:uppercase}
.hero h1 em{font-style:normal;color:var(--amber)}
.hero p{max-width:820px;color:var(--muted);margin:0;font-size:20px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:32px 0 0}
.facts div{background:var(--surface);padding:20px 22px}.facts b{display:block;color:var(--gold);font-size:40px;line-height:1.05}.facts span{display:block;margin-top:6px;font-size:18px;color:var(--muted)}
section{padding:clamp(40px,5vw,72px) 0;border-top:1px solid var(--line)}
section>h2{margin:0 0 10px;font-size:clamp(32px,4vw,56px);text-transform:uppercase;line-height:.95}
section>p.lede{margin:0 0 28px;color:var(--muted);max-width:820px;font-size:20px}
.films{display:grid;gap:22px}
.film{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr);gap:24px;align-items:start;border:1px solid var(--line);background:var(--surface);padding:16px}
.film video{width:100%;aspect-ratio:16/9;background:#000}.film h3{margin:4px 0 10px;font-size:30px;line-height:1.05;text-transform:uppercase}.film p{margin:0 0 10px;color:var(--muted)}
.dls{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.dl{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border:1px solid var(--line);font-size:16px;font-weight:500;text-decoration:none;color:var(--ink)}
.dl:hover,.dl:focus-visible{border-color:var(--amber);color:var(--gold)}
.timeblock{margin:0 0 40px}.timeblock h3{margin:0 0 14px;font-size:32px;line-height:1;text-transform:uppercase;color:var(--gold)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:16px}
.still{margin:0;border:1px solid var(--line);background:var(--surface)}.still .img{display:block;overflow:hidden}.still img{width:100%;aspect-ratio:16/9;object-fit:cover;transition:transform .4s ease}.still .img:hover img{transform:scale(1.02)}
.still figcaption{padding:14px 16px 16px}.cap{margin:0;font-size:18px}.cap b{color:var(--gold);font-weight:700}
.f50{grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))}
.posters{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:16px;align-items:start}.poster{display:block;border:1px solid var(--line)}.poster img{width:100%;height:auto}.poster.land{grid-column:span 2}@media (max-width:820px){.poster.land{grid-column:auto}}
.logos{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}.logo{border:1px solid var(--line);background:var(--surface);padding:24px;display:flex;flex-direction:column;gap:14px}.logo img{height:120px;object-fit:contain}.logo b{font-size:20px}
.copy{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px}.copy article{border:1px solid var(--line);background:var(--surface);padding:22px}.copy h3{margin:0 0 10px;font-size:26px;line-height:1.05;text-transform:uppercase;color:var(--gold)}.copy p{margin:0;color:var(--ink)}
footer{padding-block:40px 64px;border-top:1px solid var(--line);color:var(--muted)}
@media (max-width:820px){.film{grid-template-columns:1fr}}
</style></head><body>
<header class="shell top"><img src="assets/logo-mark-metal.svg" alt=""><div class="t">CLAUDE <b>OF TANKS</b></div></header>
<main class="shell">
<div class="hero"><h1>Every hour of the <em>day.</em></h1><p>${esc(m.boilerplate?.Short ?? m.boilerplate?.short ?? '')}</p>
<div class="facts">${(m.facts ?? []).map(f => `<div><b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`).join('')}</div></div>
<section id="films"><h2>Films</h2><p class="lede">Trailers, cut-downs and clean in-engine shots. All footage is rendered in-engine by Scene Studio; scenes are staged, not recorded matches.</p>
<div class="films">${(m.films ?? []).map(video).join('\n')}</div></section>
${(m.siteShots ?? []).length ? `<section id="site"><h2>Site shots</h2><p class="lede">${esc(m.siteShotsLede ?? 'Fifty new shots of tanks, battles and battlefields for the site, each a short loop with a poster frame.')}</p>
<div class="grid">${m.siteShots.map(s => `<figure class="still"><a class="img" href="${esc(s.files.loop ?? s.files.still)}"><img loading="lazy" src="${esc(s.files.preview)}" alt="${esc(s.title)}"></a>
  <figcaption><p class="cap"><b>${esc(String(s.n).padStart(2, '0'))}.</b> ${esc(s.title)}</p><div class="dls">${dl(s.files.webm, 'WebM loop')}${dl(s.files.loop, 'MP4 loop')}${dl(s.files.mobile, 'Phone MP4')}${dl(s.files.poster, 'Poster')}${dl(s.files.still, 'Still')}</div></figcaption></figure>`).join('\n')}</div></section>` : ''}
<section id="key-art"><h2>Key art</h2><p class="lede">4K masters by time of day, with native portrait (9:16) and square (1:1) renders.</p>
${byTime.map(([t, list]) => `<div class="timeblock"><h3>${esc(TIME_LABEL[t] ?? t)}</h3><div class="grid">${list.map(stillCard).join('\n')}</div></div>`).join('\n')}</section>
${(m.frames50 ?? []).length ? `<section id="fifty"><h2>Fifty frames</h2><p class="lede">Motion blur, camera language, light and explosions. Each frame is one moment of a moving Studio scene, exposed through a real shutter: pans keep the tank sharp against streaked ground, long exposures draw tracers and flares.</p>
<div class="grid f50">${m.frames50.map(frame).join('\n')}</div></section>` : ''}
${(m.posters ?? []).length ? `<section id="posters"><h2>Posters</h2><p class="lede">Cinema-letterbox and key-art treatments over the 4K masters, in landscape, square and portrait.</p>
<div class="posters">${m.posters.map(p => `<a class="poster ${esc(p.fmt)}" href="${esc(p.file)}"><img loading="lazy" src="${esc(p.preview ?? p.file)}" alt="Poster"></a>`).join('')}</div></section>` : ''}
<section id="logos"><h2>Logos</h2><p class="lede">The crest is never recolored, skewed or cropped.</p><div class="logos">${(m.logos ?? []).map(l => `<div class="logo"><img src="${esc(l.preview ?? l.file)}" alt="${esc(l.label)}"><b>${esc(l.label)}</b><div class="dls">${(l.downloads ?? [{ href: l.file, label: 'SVG' }]).map(d => dl(d.href, d.label)).join('')}</div></div>`).join('')}</div></section>
<section id="copy"><h2>Copy</h2><div class="copy">${Object.entries(m.boilerplate ?? {}).map(([k, v]) => `<article><h3>${esc(k)}</h3><p>${esc(v)}</p></article>`).join('')}</div></section>
</main>
<footer class="shell">${esc(m.footer ?? 'In-engine footage · Scene Studio · Claude of Tanks')}</footer>
</body></html>`;
writeFileSync(join(KIT, 'index.html'), html);
console.log(`kit page: ${(m.siteShots ?? []).length} site shots, ${(m.stills ?? []).length} stills, ${(m.frames50 ?? []).length} of fifty frames, ${(m.films ?? []).length} films -> ${join(KIT, 'index.html')}`);
