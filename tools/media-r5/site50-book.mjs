#!/usr/bin/env node
// The site fifty's shot book: every shot as its picture and its code, side by side — the current still, the stills of
// earlier render rounds kept under site50/versions/, and the shot's scene read as a plan (map and hour, cast and
// paint, turret choreography, lens, the still moment, the effects timeline) with a link to the exact scene JSON in the
// tracked library (tools/media-r5/site50-shots/). For reviewing iterations; local, never published.
//   node tools/media-r5/site50-book.mjs [out=shots/media-r5/site50/book]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { REPO, SHOTS } from './paths.mjs';
import { CAST_NAMES } from './cast.mjs';

const out = resolve(process.argv[2] ?? join(SHOTS, 'site50/book')), thumbs = join(out, 'thumbs');
mkdirSync(thumbs, { recursive: true });
const LIB = join(REPO, 'tools/media-r5/site50-shots'), SITE = join(SHOTS, 'site50');
const lib = JSON.parse(readFileSync(join(LIB, 'library.json'), 'utf8'));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const stillIn = dir => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.png')).sort()[0] : null);
// a 960 px thumbnail per still (cached by path)
const thumb = (png, name) => {
  const file = join(thumbs, `${name}.jpg`);
  if (!existsSync(file)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', 'scale=960:-2:flags=lanczos', '-q:v', '3', file]);
  return relative(out, file);
};
const name = id => CAST_NAMES[id]?.[0] ?? id;
const cards = [];
for (const [id, entry] of Object.entries(lib.shots)) {
  const scene = JSON.parse(readFileSync(join(LIB, `${id}.json`), 'utf8')), m = scene.meta ?? {};
  // stills: the live round in renders/, then every archived round
  const pics = [];
  const live = stillIn(join(SITE, 'renders/stills', id, 'stills'));
  const liveRound = (entry.renders ?? []).filter(r => !r.superseded).at(-1);
  if (live) pics.push({ label: `${liveRound?.round ?? 'current'} · current`, src: thumb(join(SITE, 'renders/stills', id, 'stills', live), `${id}--live`) });
  for (const r of [...(entry.renders ?? [])].reverse().filter(x => x.superseded)) {
    const png = stillIn(join(SITE, 'versions', r.round, 'stills', id, 'stills'));
    if (png) pics.push({ label: `${r.round} · ${r.superseded.why ?? 'superseded'}`, src: thumb(join(SITE, 'versions', r.round, 'stills', id, 'stills', png), `${id}--${r.round}`), old: true });
  }
  const allies = scene.actors.filter(a => !a.name.startsWith('foe')), foes = scene.actors.filter(a => a.name.startsWith('foe'));
  const sb = scene.storyboard, cams = sb.shots, c0 = cams[0], c1 = cams.at(-1);
  const fx = scene.effects.map(e => `${(e.tMs / 1000).toFixed(2)}s ${e.type}${e.actor ? ` · ${e.actor}` : ''}${e.choreo ? ' · turret round' : ''}`);
  const code = [
    ['map · hour', `${scene.map} · ${m.time}`],
    ['unit', `${allies.map(a => `${a.name} ${name(a.id)}`).join(', ')} — ${m.paint?.unit}`],
    ['enemy', foes.length ? `${foes.map(a => `${name(a.id)}${a.state && a.state !== 'intact' ? ` (${a.state})` : ''}`).join(', ')} — ${m.paint?.enemy}` : '—'],
    ['turrets', `${m.turrets?.style} · ${(m.turrets?.plan ?? []).join(' | ')}`],
    ['lens', `${cams.length} keys, fov ${c0.fov}→${c1.fov}, ${Math.hypot(c1.pos[0] - c0.pos[0], c1.pos[2] - c0.pos[2]).toFixed(1)} m travel${m.cameraFix ? `, ${m.cameraFix}` : ''}`],
    ['still', `${(m.still?.tMs / 1000).toFixed(2)} s, ${m.still?.exposureMs} ms shutter`],
    ['picture', JSON.stringify(scene.picture?.exposure != null ? { exposure: scene.picture.exposure } : {})],
    ['versions', (entry.versions ?? []).map(v => `${v.version} ${v.sha256.slice(0, 10)}`).join(', ')],
    ['renders', (entry.renders ?? []).map(r => `${r.round}${r.superseded ? ' (superseded)' : ''} by ${r.renderer}`).join(', ') || 'none yet'],
  ];
  cards.push(`<article id="${id}">
<h2><span class="n">${esc(id.slice(1, 3))}</span> ${esc(m.title)}</h2>
<div class="pics">${pics.map(p => `<figure class="${p.old ? 'old' : ''}"><img loading="lazy" src="${esc(p.src)}" alt=""><figcaption>${esc(p.label)}</figcaption></figure>`).join('') || '<p class="none">not rendered yet</p>'}</div>
<dl>${code.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
<details><summary>effects timeline (${fx.length})</summary><pre>${esc(fx.join('\n'))}</pre></details>
<p class="src"><a href="${esc(relative(out, join(LIB, `${id}.json`)))}">${esc(`tools/media-r5/site50-shots/${id}.json`)}</a></p>
</article>`);
}
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site Fifty Shot Book</title>
<style>
:root{--bg:#0b0e11;--card:#141a20;--ink:#e8edf2;--dim:#9fb0bf;--gold:#ffd27a;--line:#26303a}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f4f1ea;--card:#fffdf8;--ink:#1d232a;--dim:#5c6873;--gold:#9a6a00;--line:#ddd6c8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
header{padding:20px 16px 8px}h1{margin:0;font-size:22px}header p{margin:6px 0 0;color:var(--dim)}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,560px),1fr));gap:16px;padding:16px}
article{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;min-width:0}
h2{margin:0 0 10px;font-size:16px}.n{color:var(--gold);font-variant-numeric:tabular-nums;margin-right:6px}
.pics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
figure{margin:0}figure img{width:100%;border-radius:6px;display:block}figure.old img{opacity:.8}
figcaption{font-size:12px;color:var(--dim);margin-top:3px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:12px 0 6px;font-size:13px}
dt{color:var(--dim)}dd{margin:0;overflow-wrap:anywhere;font-family:ui-monospace,Menlo,monospace;font-size:12px}
details{font-size:13px}pre{white-space:pre-wrap;font-size:12px;color:var(--dim)}.src{margin:6px 0 0;font-size:12px}
a{color:var(--gold)}.none{color:var(--dim)}
</style></head>
<body><header><h1>Site Fifty Shot Book</h1>
<p>Every shot as its picture and its code: the scene each render is made from lives in tools/media-r5/site50-shots/ (git keeps its versions); earlier render rounds stay under site50/versions/. ${Object.keys(lib.shots).length} shots.</p></header>
<main>
${cards.join('\n')}
</main></body></html>
`;
writeFileSync(join(out, 'index.html'), html);
console.log(`${join(out, 'index.html')}: ${cards.length} shots`);
