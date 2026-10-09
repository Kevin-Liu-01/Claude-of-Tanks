#!/usr/bin/env node
// Assemble the r5 media kit from final renders: films (motion projects), the fifty frames,
// key art, posters, logos, copy -> kit/manifest.json (+ kit-page.mjs renders index.html).
//   node tools/media-r5/kit-assemble.mjs [finalRoot=shots/media-r5/final] [kit=shots/media-r5/kit]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, statSync, linkSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { FINAL as DEFAULT_FINAL, KIT as DEFAULT_KIT, MOTION, TOOL, REPO } from './paths.mjs';
import { CAST_NAMES } from './cast.mjs';
import { getMapName } from '../../src/world/maps/mapIds.ts';
const FINAL = resolve(process.argv[2] ?? DEFAULT_FINAL);
const KIT = resolve(process.argv[3] ?? DEFAULT_KIT);
const copy = JSON.parse(readFileSync(join(TOOL, 'kit-copy.json'), 'utf8'));
for (const d of ['films', 'frames50', 'key-art', 'posters', 'logos']) mkdirSync(join(KIT, d), { recursive: true });
const rel = p => p.slice(KIT.length + 1);
const jpg = (src, dst, w) => { if (!existsSync(dst)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale=${w}:-2`, '-q:v', '3', dst]); return dst; };
const { createCanvas, loadImage } = await import('@napi-rs/canvas');
// ffmpeg here has no libwebp: encode previews with the canvas library instead
async function webp(src, dst, w) {
  if (existsSync(dst)) return dst;
  const im = await loadImage(readFileSync(src)); const h = Math.round(im.height * w / im.width);
  const c = createCanvas(w, h); c.getContext('2d').drawImage(im, 0, 0, w, h);
  writeFileSync(dst, c.toBuffer('image/webp', 86)); return dst;
}
const mapName = id => getMapName(id) ?? id;
const fmtExp = ms => !ms ? '' : ms >= 100 ? `${(ms / 1000).toFixed(ms >= 1000 ? 0 : 2).replace(/0$/, '')} s exposure` : `1/${Math.round(1000 / ms)} s`;

// --- fifty frames ---------------------------------------------------------------------
const manifest50 = existsSync(join(FINAL, 'blur50-manifest.json')) ? JSON.parse(readFileSync(join(FINAL, 'blur50-manifest.json'), 'utf8')) : [];
const frames50 = [];
for (const m of manifest50) {
  const dirs = [join(FINAL, 'blur-v3', m.id, 'stills'), join(FINAL, 'blur-v2', m.id, 'stills'), join(FINAL, 'blur', m.id, 'stills')].filter(existsSync);
  const png = dirs.map(d => readdirSync(d).filter(f => f.endsWith('.png')).map(f => join(d, f))[0]).find(Boolean);
  if (!png) continue;
  const stem = `${String(m.frame).padStart(2, '0')}-${m.id.replace(/^b\d+-/, '')}`;
  const full = join(KIT, 'frames50', `${stem}-4k.png`); if (!existsSync(full) || statSync(full).size !== statSync(png).size) copyFileSync(png, full);
  const prev = await webp(png, join(KIT, 'frames50', `${stem}-1600.webp`), 1600);
  frames50.push({ n: m.frame, technique: m.technique, title: m.title, tank: m.heroName, mapName: mapName(m.map), time: m.time,
    exposure: fmtExp(m.exposureMs), file: rel(full), preview: rel(prev) });
}

// --- films (motion projects' renders + clean in-engine shots) ----------------------------
const films = [];
const FILM_INFO = [
  ['trailer-24h', 'Around the Clock', 'Eighty seconds from midnight to midnight: the newest main battle tanks across 20 battlefields at every hour, tracked, panned and craned through Scene Studio. Original procedural score.', '1920×1080 · 30 fps · 80 s · stereo'],
  ['lineup', 'The Lineup', 'Twenty-four tanks from across the fleet, each in its own fight: KF51 Panther, Leopard 2A6, M1A2 Abrams TUSK, Leclerc XLR, T-90M, T-14 Armata, Stridsvagn 122, M1A2 Abrams, Leopard 2A7V, ZTZ-100, Challenger 1, T-90MS Tagil, K2 Black Panther, T-80U, C1 Ariete, Merkava Mk 3D, Merkava Mk 4, K1A1, Type 90, Type 10, Chieftain Mk 10, M1A2 Abrams SEPv3, T-90SM, Leopard 2A5.', '1920×1080 · 30 fps · 39.5 s · stereo'],
  ['cut-30', 'Around the Clock · 30 s', 'The trailer, cut to thirty seconds.', '1920×1080 · 30 fps · 30 s · stereo'],
  ['vertical-15', 'Around the Clock · vertical 15 s', 'For phones: six hours of the day in fifteen seconds.', '1080×1920 · 30 fps · 15 s · stereo'],
  ['studio-feature', 'Scene Studio', 'The real Studio, captured frame by frame: stage any tank, block the camera, pick any hour, grade it like film and export with real motion blur.', '1920×1080 · 30 fps · 30 s · stereo'],
];
for (const [id, title, description, spec] of FILM_INFO) {
  const src = [join(MOTION, id, 'renders', `${id}.mp4`), join(MOTION, id, `${id}.mp4`)].find(existsSync);
  if (!src) continue;
  const dst = join(KIT, 'films', `${id}.mp4`); copyFileSync(src, dst);
  const poster = join(KIT, 'films', `${id}-poster.jpg`);
  if (!existsSync(poster)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', id === 'lineup' ? '5.3' : '6.2', '-i', src, '-frames:v', '1', '-q:v', '3', poster]);
  films.push({ id, title, description, spec, files: { mp4_1080: rel(dst), poster: rel(poster) } });
}

// --- key art ----------------------------------------------------------------------------
const stills = [];
const keyRoot = join(FINAL, 'keyart');
// curated out after the 4K review (soft focus, occluded or empty frames)
const KEYART_SKIP = new Set(['blackglass-day-towers--tower-low', 'ruinspires-dusk-avenue--avenue-mid', 'ruinspires-dusk-avenue--rear', 'steinburg-night-street--tele-street',
  'verdant-day-assault--f7', 'redrock-golden-kill--target-side', 'kestrel-dawn-runway--runway-tele', 'saltmere-sunset-strand--dune-high', 'ironworks-night-yard--stacks', 'ironworks-night-yard--front-low']);
if (existsSync(keyRoot)) for (const d of readdirSync(keyRoot).sort()) {
  if (KEYART_SKIP.has(d)) continue;
  const sd = join(keyRoot, d, 'stills'); if (!existsSync(sd)) continue;
  const pngs = readdirSync(sd).filter(f => f.endsWith('.png'));
  const pick = fmt => pngs.find(f => f.includes(`-${fmt}-`)); const land = pick('landscape'); if (!land) continue;
  const scene = JSON.parse(readFileSync(join(FINAL, 'resolved', `${d.split('--')[0]}.resolved.json`), 'utf8'));
  const files = {};
  for (const [fmt, key] of [['landscape', 'land_png'], ['portrait', 'port_png'], ['square', 'square_png']]) {
    const f = pick(fmt); if (!f) continue;
    const dst = join(KIT, 'key-art', `${d}-${fmt}.png`); if (!existsSync(dst)) copyFileSync(join(sd, f), dst); files[key] = rel(dst);
  }
  files.land_webp = rel(await webp(join(sd, land), join(KIT, 'key-art', `${d}-landscape.webp`), 2560));
  files.preview = rel(await webp(join(sd, land), join(KIT, 'key-art', `${d}-preview.webp`), 960));
  const tanks = [...new Set(scene.actors.filter(a => !a.name.startsWith('foe')).map(a => CAST_NAMES[a.id]?.[0] ?? a.id))];
  stills.push({ id: d, mapName: mapName(scene.map), time: ['moon', 'mars'].includes(scene.map) ? 'space' : scene.timeOfDay, tanks, files });
}

// --- posters, logos -----------------------------------------------------------------------
const posters = [];
for (const fmt of ['land', 'port', 'square']) {
  const sd = join(MOTION, `posters-${fmt}`, 'snapshots'); if (!existsSync(sd)) continue;
  for (const f of readdirSync(sd).filter(f => f.endsWith('.png')).sort()) {
    const dst = join(KIT, 'posters', `${fmt}-${f}`); copyFileSync(join(sd, f), dst);
    const prev = await webp(dst, join(KIT, 'posters', `${fmt}-${f.replace(/\.png$/, '')}-preview.webp`), fmt === 'land' ? 1600 : 900);
    posters.push({ fmt, file: rel(dst), preview: rel(prev) });
  }
}
const logos = [];
for (const [name, label] of [['logo-mark-metal.svg', 'Crest, metal'], ['logo-mark.svg', 'Crest']]) {
  const file = join(REPO, 'public/brand', name); if (!existsSync(file)) continue; const dst = join(KIT, 'logos', basename(file)); copyFileSync(file, dst); logos.push({ file: rel(dst), label });
}

// --- the site fifty (site-loops.mjs deliverables, linked in place: they are already in the site's formats) -------
const siteShots = [];
const SITE = join(FINAL, '..', 'site50');
const siteMeta = existsSync(join(SITE, 'site50-manifest.json')) ? JSON.parse(readFileSync(join(SITE, 'site50-manifest.json'), 'utf8')) : [];
const delivered = existsSync(join(SITE, 'deliver/deliver-index.json')) ? JSON.parse(readFileSync(join(SITE, 'deliver/deliver-index.json'), 'utf8')) : [];
if (delivered.length) {
  mkdirSync(join(KIT, 'site'), { recursive: true });
  for (const d of delivered) {
    const meta = siteMeta.find(m => m.id === d.id); if (!meta) continue;
    const files = {};
    for (const [key, f] of Object.entries(d.files)) {
      if (key === 'still4k') continue; // the 4K master stays in the deliver folder
      const dst = join(KIT, 'site', f.split('/').pop());
      const src = join(SITE, 'deliver', f);
      if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) {
        rmSync(dst, { force: true });
        try { linkSync(src, dst); } catch { copyFileSync(src, dst); } // the loops are large: share the deliver copy
      }
      files[{ webm: 'webm', mp4: 'loop', mobile: 'mobile', poster: 'poster', still: 'still' }[key] ?? key] = rel(dst);
    }
    files.preview = files.still ?? files.poster;
    siteShots.push({ n: meta.n, id: d.id, kind: meta.kind, title: meta.title, mapName: mapName(meta.map), time: meta.time, loopS: d.loopS, files });
  }
  siteShots.sort((a, b) => a.n - b.n);
}

const out = { release: copy.release, generatedAt: new Date().toISOString(), facts: copy.facts, boilerplate: copy.boilerplate, footer: copy.footer,
  films, siteShots, frames50, stills, posters, logos };
writeFileSync(join(KIT, 'manifest.json'), JSON.stringify(out, null, 1));
console.log(`kit: ${films.length} films, ${siteShots.length} site shots, ${frames50.length} of fifty frames, ${stills.length} key art, ${posters.length} posters, ${logos.length} logos -> ${KIT}`);
