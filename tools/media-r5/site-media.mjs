#!/usr/bin/env node
// site-media.mjs — the public site's gameplay media from the site fifty (owner, 2026-10-11: "replace the old media with
// all my new ones", once every set is done). Builds public/media/<collection> (site50-r14) in the tree given by --root
// (an export of main, so the media worktree's own public/ and src/ stay untouched while its finals render) from the
// picks in tools/media-r5/site-media/picks.json, and the landing page's mobile proxies in public/media/web-video-r1.
// manifest.json records every file's source, bytes and sha256; archive.json is the visual archive's library.
//
//   node tools/media-r5/site-media.mjs --root=<tree> [--only=stills,loops,proxies,reels,frames,films,fleet,scenes] [--force]
//   node tools/media-r5/site-media.mjs --root=<tree> --plan       what each slot ships, and what is missing
// --fallback lets an older round stand in for a take the round has not delivered yet (drafts only: the manifest marks
// it, and the shipped build has every take from the picks' round, each with its sound).
//
// Outputs (public/media/site50-r14/):
//   stills/<id>.webp, stills/<id>-close.webp       the key moment and the close portrait at 1920×1080 (the delivery's own)
//   stills/<id>-thumb.webp, <id>-close-thumb.webp  640×360 previews from the 4K PNGs (the archive wall)
//   stills/<id>-4k.webp                            3840×2160 from the 4K PNG (featured takes marked fourK)
//   stills/<id>-boot.webp                          1280×720 (the boot splash: the featured take marked boot)
//   loops/<id>.webm, loops/<id>.jpg                the 6 s loop at 1920×1080 (VP9 with its sound) and its poster
//   loops/<id>-960.webm                            960×540 VP9, silent (the docs archive dialog)
//   reels/<id>.mp4, reels/<id>.webp                1280×720 H.264 with its sound (the delivery's mobile cut), poster
//   frames/<b>.webp, frames/<b>-thumb.webp         the fifty frames (R181) at 1920×1080 and 640×360
//   frames/sheet-<n>.webp                          contact sheets, ten frames each (2400 × 540)
//   films/trailer.mp4, films/trailer.jpg           the trailer at 1920×1080 with its score
//   films/reel.mp4, films/reel.jpg                 the picked takes crossfaded at 1920×1080, silent (the home page's loop)
//   manifest.json, archive.json
// public/media/web-video-r1/<id>-mobile.mp4, reel-mobile.mp4: 960×540, 24 fps, silent, under the landing page's
// nine-megabyte budget with the Studio card's proxy (landing-media.selftest.mjs).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MEDIA = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name) => process.argv.includes(`--${name}`);
const ROOT = resolve(arg('root') ?? MEDIA);
const PICKS = JSON.parse(readFileSync(join(MEDIA, 'tools/media-r5/site-media/picks.json'), 'utf8'));
const OUT = join(ROOT, 'public/media', PICKS.collection);
const PROXIES = join(ROOT, 'public/media/web-video-r1');
const BASE_URL = `/media/${PICKS.collection}`;
const only = arg('only')?.split(',');
const force = flag('force');
const fallback = flag('fallback');
const plan = flag('plan');
const TMP = join(MEDIA, 'shots/media-r5/tmp/site-media-build');

/** The landing page's mobile proxy budget (landing-media.selftest.mjs), with the Studio card's proxy kept. */
const PROXY_BUDGET_BYTES = 9_000_000;
const PROXY_KEPT = ['studio-knockout-mobile.mp4'];
const THUMB = [640, 360];
const SHEET = { cols: 5, rows: 2, tile: [480, 270], gap: 0, per: 10 };

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 1 << 26 });
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const want = (part) => !only || only.includes(part);
// a source inside the tree being built (the takes' scenes) is recorded by its path in the repo, not by where the export
// sits in the media worktree (2026-10-12: every export renamed fifty manifest rows); the deliveries stay worktree paths
const rel = (file) => { const inTree = relative(ROOT, file); return inTree.startsWith('..') ? relative(MEDIA, file) : inTree; };
function probe(file) {
  const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries',
    'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration', '-of', 'json', file]));
  const video = info.streams.find((s) => s.codec_type === 'video');
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  const seconds = Number(info.format?.duration);
  const [num, den] = String(video?.r_frame_rate ?? '0/1').split('/').map(Number);
  return { width: video?.width ?? 0, height: video?.height ?? 0, fps: den ? Math.round((num / den) * 100) / 100 : 0,
    seconds: Number.isFinite(seconds) ? Math.round(seconds * 1000) / 1000 : 0, audio: audio?.codec_name ?? null };
}
const webp = (src, out, q, size) => run('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', String(q),
  ...(size ? ['-resize', String(size[0]), String(size[1])] : []), src, '-o', out]);

// --- sources ------------------------------------------------------------------------------------------------------
// sources.deliverOver (r14b, 2026-10-12): a later round that re-filmed some takes (round 15: the rut-ring takes) is looked
// up first, so its takes replace round 14's and the rest stay round 14's; both are current
// sources.deliverFleet (2026-10-12): the fleet takes' own round (a take for every production vehicle, fleet-plan.mjs)
const CURRENT = [PICKS.sources.deliverOver, PICKS.sources.deliver, PICKS.sources.deliverFleet].filter(Boolean);
const ROUNDS = [...CURRENT, ...(fallback ? ['shots/media-r5/site50/deliver-r13', 'shots/media-r5/site50/deliver'] : [])];
const deliveries = new Map();
function delivery(id) {
  if (deliveries.has(id)) return deliveries.get(id);
  let found = null;
  for (const dir of ROUNDS) {
    const d = join(MEDIA, dir, id);
    if (!existsSync(join(d, `${id}-4k.mp4`))) continue;
    const f = (name) => (existsSync(join(d, name)) ? join(d, name) : null);
    const take = { id, round: dir, current: CURRENT.includes(dir), dir: d,
      moment: f(`${id}.webp`), close: f(`${id}-close.webp`), momentPng: f(`${id}-4k.png`), closePng: f(`${id}-close-4k.png`),
      poster: f(`${id}.jpg`), webm: f(`${id}.webm`), mobile: f(`${id}-mobile.mp4`), hd: f(`${id}.mp4`),
      sound: existsSync(join(d, `${id}.audio.json`)) };
    // a take still being delivered (site-loops writes the 4K first, the stills and web cuts after) does not count yet
    if (!take.moment || !take.momentPng || !take.poster || !take.webm || !take.mobile || !take.hd) continue;
    found = take;
    break;
  }
  deliveries.set(id, found);
  return found;
}

const takeIds = Object.keys(PICKS.takes);
const loopIds = [...new Set([PICKS.home.destruction, ...PICKS.home.paths, ...Object.values(PICKS.topics), ...PICKS.docs.archiveLoops])];
const proxyIds = [PICKS.home.destruction, ...PICKS.home.paths];
const reelIds = PICKS.docs.reels;
const fourK = PICKS.featured.filter((f) => f.fourK).map((f) => f.id);
const boot = PICKS.featured.find((f) => f.boot), bootId = boot?.id;
// a featured take may show its close portrait (`still: 'close'`, 2026-10-12: monsoon's best frame is s30's close),
// except the 4K showcase, which is made from the key moment's PNG; the boot splash is made from its own still's PNG
// (owner 2026-10-12: the default became s21's close, the T-90SM under a fireball)
for (const f of PICKS.featured) if (f.still === 'close' && f.fourK) throw new Error(`featured ${f.id}: the 4K shot is a key moment`);

// every slot that names a take, for --plan and for the checks below
function slots() {
  const out = [];
  const add = (slot, id, kind) => out.push({ slot, id, kind });
  PICKS.home.hero.forEach((h, i) => add(`home.hero[${i}]`, h.id, h.still));
  PICKS.home.rail.forEach((id, i) => add(`home.rail[${i}]`, id, 'moment'));
  PICKS.home.mosaic.forEach((m, i) => add(`home.mosaic[${i}]`, m.id, m.still));
  add('home.cta', PICKS.home.cta.id, PICKS.home.cta.still);
  add('home.destruction', PICKS.home.destruction, 'loop');
  PICKS.home.paths.forEach((id, i) => add(`home.paths[${i}]`, id, 'loop'));
  add('docs.hero', PICKS.docs.hero.id, PICKS.docs.hero.still);
  for (const [k, v] of Object.entries(PICKS.docs.chapters)) add(`docs.chapters.${k}`, v.id, v.still);
  reelIds.forEach((id, i) => add(`docs.reels[${i}]`, id, 'reel'));
  PICKS.docs.archiveLoops.forEach((id, i) => add(`docs.archiveLoops[${i}]`, id, 'loop'));
  for (const [k, id] of Object.entries(PICKS.topics)) add(`topics.${k}`, id, 'loop');
  for (const [k, v] of Object.entries(PICKS.topicMedia)) if (v.id) add(`topicMedia.${k}`, v.id, v.still);
  PICKS.featured.forEach((f, i) => add(`featured[${i}]`, f.id, f.still ?? 'moment'));
  for (const k of ['notFound', 'hudEditor', 'og']) add(k, PICKS[k].id, PICKS[k].still);
  for (const [k, v] of Object.entries(PICKS.ogCards ?? {})) add(`ogCards.${k}`, v.id, v.still);
  PICKS.home.reel.takes.forEach((id, i) => add(`home.reel[${i}]`, id, 'moment'));
  for (const [k, v] of Object.entries(PICKS.home.socialCards ?? {})) add(`home.socialCards.${k}`, v.id, v.still);
  (PICKS.readme?.stills ?? []).forEach((id, i) => add(`readme.stills[${i}]`, id, 'moment'));
  for (const k of ['worlds', 'worldKit', 'destruction']) if (PICKS.readme?.[k]) add(`readme.${k}`, PICKS.readme[k].id, PICKS.readme[k].still);
  (PICKS.readme?.wall ?? []).forEach((p, i) => add(`readme.wall[${i}]`, p.id, p.still));
  for (const [k, v] of Object.entries(PICKS.docs.figures ?? {})) add(`docs.figures.${k}`, v.id, v.still);
  return out;
}

function checkPicks() {
  const problems = [];
  for (const s of slots()) {
    if (!PICKS.takes[s.id]) { problems.push(`${s.slot}: ${s.id} is not one of the takes`); continue; }
    const d = delivery(s.id);
    if (!d) { problems.push(`${s.slot}: ${s.id} has no delivery${fallback ? '' : ` in ${PICKS.sources.deliver} (--fallback for a draft)`}`); continue; }
    if (s.kind === 'close' && !d.close) problems.push(`${s.slot}: ${s.id} has no close still in ${d.round}`);
    if ((s.kind === 'reel' || s.kind === 'loop') && !d.sound) problems.push(`${s.slot}: ${s.id} is delivered without its sound (${d.round})`);
  }
  return problems;
}

// --- outputs ------------------------------------------------------------------------------------------------------
const files = [];
function record(out, source, extra = {}) {
  const info = /\.(mp4|webm)$/.test(out) ? probe(out) : {};
  files.push({ path: relative(join(ROOT, 'public'), out).split('\\').join('/'), bytes: statSync(out).size, sha256: sha256(out),
    ...(info.width ? { width: info.width, height: info.height, fps: info.fps, seconds: info.seconds, audio: info.audio } : {}),
    source: source ? rel(source) : null, ...extra });
}
function make(out, source, build, extra) {
  mkdirSync(dirname(out), { recursive: true });
  if (force || !existsSync(out) || statSync(out).mtimeMs < statSync(source).mtimeMs) {
    const tmp = `${out}.tmp${out.slice(out.lastIndexOf('.'))}`;
    build(tmp);
    renameSync(tmp, out);
  }
  record(out, source, extra);
}
const copy = (out, source, extra) => make(out, source, (tmp) => copyFileSync(source, tmp), extra);

function buildStills() {
  for (const id of takeIds) {
    const d = delivery(id);
    if (!d) continue;
    const take = { take: id, round: d.round };
    if (d.moment) copy(join(OUT, 'stills', `${id}.webp`), d.moment, take);
    if (d.close) copy(join(OUT, 'stills', `${id}-close.webp`), d.close, take);
    if (d.momentPng) make(join(OUT, 'stills', `${id}-thumb.webp`), d.momentPng, (tmp) => webp(d.momentPng, tmp, 80, THUMB), take);
    if (d.closePng) make(join(OUT, 'stills', `${id}-close-thumb.webp`), d.closePng, (tmp) => webp(d.closePng, tmp, 80, THUMB), take);
    if (fourK.includes(id) && d.momentPng) make(join(OUT, 'stills', `${id}-4k.webp`), d.momentPng, (tmp) => webp(d.momentPng, tmp, 88), take);
    const bootPng = boot?.still === 'close' ? d.closePng : d.momentPng;
    if (id === bootId && bootPng) make(join(OUT, 'stills', `${id}-boot.webp`), bootPng, (tmp) => webp(bootPng, tmp, 80, [1280, 720]), take);
  }
}

function buildLoops() {
  for (const id of loopIds) {
    const d = delivery(id);
    if (!d?.webm || !d.poster) continue;
    const take = { take: id, round: d.round };
    copy(join(OUT, 'loops', `${id}.webm`), d.webm, take);
    copy(join(OUT, 'loops', `${id}.jpg`), d.poster, take);
    if (PICKS.docs.archiveLoops.includes(id)) {
      make(join(OUT, 'loops', `${id}-960.webm`), d.hd, (tmp) => run('ffmpeg', ['-v', 'error', '-y', '-i', d.hd, '-an',
        '-vf', 'scale=960:540:flags=lanczos', '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-row-mt', '1',
        '-deadline', 'good', '-cpu-used', '2', tmp]), take);
    }
  }
}

function proxy(source, out, crf) {
  run('ffmpeg', ['-v', 'error', '-y', '-i', source, '-an', '-vf', 'scale=960:540:flags=lanczos,fps=24,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-movflags', '+faststart', out]);
}
function buildProxies() {
  mkdirSync(PROXIES, { recursive: true });
  const jobs = proxyIds.map((id) => ({ path: `${id}-mobile.mp4`, source: delivery(id)?.hd, crf: 27 }))
    .concat([{ path: 'reel-mobile.mp4', source: join(OUT, 'films', 'reel.mp4'), crf: 29 }])
    .filter((job) => job.source && existsSync(job.source));
  const kept = PROXY_KEPT.filter((p) => existsSync(join(PROXIES, p)));
  const keptBytes = kept.reduce((sum, p) => sum + statSync(join(PROXIES, p)).size, 0);
  for (let pass = 0; pass < 6; pass++) {
    for (const job of jobs) {
      const out = join(PROXIES, job.path);
      if (pass > 0 || force || !existsSync(out) || statSync(out).mtimeMs < statSync(job.source).mtimeMs) {
        proxy(job.source, `${out}.tmp.mp4`, job.crf);
        renameSync(`${out}.tmp.mp4`, out);
      }
    }
    const total = keptBytes + jobs.reduce((sum, job) => sum + statSync(join(PROXIES, job.path)).size, 0);
    if (total < PROXY_BUDGET_BYTES) break;
    console.log(`[site-media] proxies ${total} B over the ${PROXY_BUDGET_BYTES} B budget: one CRF step down`);
    for (const job of jobs) job.crf += 1;
  }
  // a re-pick leaves proxies of takes no path names any more (retire.mjs would also drop them as unreferenced)
  const current = new Set(jobs.map((job) => job.path));
  for (const name of readdirSync(PROXIES)) if (/^s\d\d-[a-z0-9-]+-mobile\.mp4$/.test(name) && !current.has(name)) rmSync(join(PROXIES, name));
  const manifest = { schemaVersion: 1, purpose: 'Mobile landing-page video proxies',
    encoding: { codec: 'h264', width: 960, height: 540, framesPerSecond: 24, audio: false },
    files: [
      ...jobs.map((job) => ({ path: job.path, bytes: statSync(join(PROXIES, job.path)).size,
        source: job.path === 'reel-mobile.mp4' ? `${BASE_URL}/films/reel.mp4` : `${BASE_URL}/loops/${job.path.replace('-mobile.mp4', '.webm')}` })),
      ...kept.map((p) => ({ path: p, bytes: statSync(join(PROXIES, p)).size, source: '/media/landing-r1/studio-leclerc-knockout.mp4' })),
    ] };
  writeFileSync(join(PROXIES, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function buildReels() {
  for (const id of reelIds) {
    const d = delivery(id);
    if (!d?.mobile || !d.momentPng) continue;
    const take = { take: id, round: d.round };
    copy(join(OUT, 'reels', `${id}.mp4`), d.mobile, take);
    make(join(OUT, 'reels', `${id}.webp`), d.momentPng, (tmp) => webp(d.momentPng, tmp, 82, [1280, 720]), take);
  }
}

// the fifty frames: each frame's still (one PNG under <frames>/<id>/stills/) and its scene's meta (title, technique, map)
function frameList() {
  const dirs = [PICKS.sources.frames, ...(fallback ? [PICKS.sources.framesFallback] : [])].map((d) => join(MEDIA, d));
  const ids = new Set();
  for (const dir of dirs) if (existsSync(dir)) for (const name of readdirSync(dir)) if (/^b\d\d-/.test(name)) ids.add(name);
  const out = [];
  for (const id of [...ids].sort()) {
    const dir = dirs.find((d) => existsSync(join(d, id, 'stills')) && readdirSync(join(d, id, 'stills')).some((f) => f.endsWith('.png')));
    if (!dir) continue;
    const png = join(dir, id, 'stills', readdirSync(join(dir, id, 'stills')).find((f) => f.endsWith('.png')));
    const scene = join(dirname(dir), 'scenes', `${id}.json`);
    const meta = existsSync(scene) ? JSON.parse(readFileSync(scene, 'utf8')).meta ?? {} : {};
    out.push({ id, png, round: rel(dir), current: dir === dirs[0], n: meta.frame ?? Number(id.slice(1, 3)),
      title: meta.title ?? id, technique: meta.technique ?? '', map: meta.map ?? '', hero: meta.heroName ?? '' });
  }
  return out;
}
function buildFrames(frames) {
  for (const f of frames) {
    const extra = { frame: f.id, round: f.round };
    make(join(OUT, 'frames', `${f.id}.webp`), f.png, (tmp) => webp(f.png, tmp, 86, [1920, 1080]), extra);
    make(join(OUT, 'frames', `${f.id}-thumb.webp`), f.png, (tmp) => webp(f.png, tmp, 78, THUMB), extra);
  }
  mkdirSync(TMP, { recursive: true });
  for (let s = 0; s * SHEET.per < frames.length; s++) {
    const group = frames.slice(s * SHEET.per, (s + 1) * SHEET.per);
    const out = join(OUT, 'frames', `sheet-${s + 1}.webp`);
    const newest = group.reduce((a, f) => (statSync(f.png).mtimeMs > statSync(a.png).mtimeMs ? f : a));
    make(out, newest.png, (tmp) => {
      const [w, h] = SHEET.tile;
      const inputs = group.flatMap((f) => ['-i', f.png]);
      const scaled = group.map((_, i) => `[${i}:v]scale=${w}:${h}:flags=lanczos[t${i}]`).join(';');
      const layout = group.map((_, i) => `${(i % SHEET.cols) * w}_${Math.floor(i / SHEET.cols) * h}`).join('|');
      const png = join(TMP, `sheet-${s + 1}.png`);
      const pad = group.length < SHEET.per ? `,pad=${SHEET.cols * w}:${SHEET.rows * h}` : '';
      run('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex',
        `${scaled};${group.map((_, i) => `[t${i}]`).join('')}xstack=inputs=${group.length}:layout=${layout}${pad}`, '-frames:v', '1', png]);
      webp(png, tmp, 82);
    }, { sheet: s + 1, frames: group.map((f) => f.id) });
  }
}

// the landing page's reel: a clean montage of the picked takes (their 1080p deliveries, crossfaded, silent), since the
// films carry titles, end cards and letterbox bars that would sit under the section's own heading
function reelTakes() {
  return PICKS.home.reel.takes.map((id) => delivery(id)).filter((d) => d?.hd);
}
function buildFilms() {
  const trailer = join(MEDIA, PICKS.sources.trailer);
  const poster = PICKS.posters ?? { trailer: 3 };
  if (existsSync(trailer)) {
    make(join(OUT, 'films', 'trailer.mp4'), trailer, (tmp) => run('ffmpeg', ['-v', 'error', '-y', '-i', trailer,
      '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
      '-maxrate', '4.5M', '-bufsize', '9M', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', tmp]),
    { film: 'trailer-24h' });
    make(join(OUT, 'films', 'trailer.jpg'), trailer, (tmp) => run('ffmpeg', ['-v', 'error', '-y', '-ss', String(poster.trailer),
      '-i', trailer, '-frames:v', '1', '-vf', 'scale=1920:1080:flags=lanczos', '-q:v', '3', tmp]), { film: 'trailer-24h' });
  }
  const takes = reelTakes();
  if (takes.length === PICKS.home.reel.takes.length) {
    const x = PICKS.home.reel.crossfadeS;
    const lengths = takes.map((d) => probe(d.hd).seconds);
    const newest = takes.reduce((a, d) => (statSync(d.hd).mtimeMs > statSync(a.hd).mtimeMs ? d : a));
    const chain = [];
    let label = '[0:v]', at = 0;
    for (let i = 1; i < takes.length; i++) {
      at += lengths[i - 1] - x;
      chain.push(`${label}[${i}:v]xfade=transition=fade:duration=${x}:offset=${at.toFixed(3)}[v${i}]`);
      label = `[v${i}]`;
    }
    const extra = { film: 'reel', takes: takes.map((d) => d.id), crossfadeS: x };
    make(join(OUT, 'films', 'reel.mp4'), newest.hd, (tmp) => run('ffmpeg', ['-v', 'error', '-y', ...takes.flatMap((d) => ['-i', d.hd]),
      '-filter_complex', `${chain.join(';')};${label}format=yuv420p[out]`, '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'slow',
      '-crf', '20', '-maxrate', '8M', '-bufsize', '16M', '-profile:v', 'high', '-movflags', '+faststart', tmp]), extra);
    copy(join(OUT, 'films', 'reel.jpg'), takes[0].poster, extra);
  }
}

// --- the takes as Studio presets (owner 2026-10-12: "keep our code for these videos and setup preserved so we can always
// tweak them, and also just show them as presets u can access in /studio") ------------------------------------------
// Each take's scene exactly as the Studio saves it (its code in the shot library, tools/media-r5/site50-shots/<id>.json,
// whose git history is the take's version history), and scenes/index.json, which the Studio's Director workspace lists
// (src/ui/studioProductionPanel.ts): the take's titles in both languages, its map, its length, its thumbnail and its
// scene. Loading a card stages the take as it was filmed, ready to change and film again.
// The fleet (owner 2026-10-12: "make a special video for all tanks ... and use that everywhere"): every production
// vehicle's own take (tools/media-r5/vehicle-takes.json: its fleet take, else its take among the owner's nine, else the
// first of the fifty it leads) as a 640×360 silent VP9 loop (crf 48 held under 680 kbit/s, constrained quality: about
// 0.4-0.6 MB, where 960×540 crf 36 made ~2 MB; the panels show it a few hundred pixels wide) and a 640×360 poster (the
// coordinator's budget, 2026-10-13: loops ≤ 0.6 MB, posters ≤ 120 KB, fleet-media.selftest), and fleet/index.json, which the Tank Gallery's
// dossiers, the Garage's battle gallery, the manual and the Studio's Director read. A vehicle whose take is not delivered
// yet is left out of the index (the app shows nothing for it).
const FLEET_TAKES = join(ROOT, 'tools/media-r5/vehicle-takes.json'), FLEET_ROSTER = join(ROOT, 'tools/media-r5/fleet-roster.json');
const fleetRoster = existsSync(FLEET_ROSTER) ? JSON.parse(readFileSync(FLEET_ROSTER, 'utf8')) : [];
const fleetEntry = (takeId) => fleetRoster.find((r) => `s${r.n}-${r.id}` === takeId) ?? null;
/** A take's titles and map, from the fleet roster or the picks. */
function takeTitles(takeId) {
  const r = fleetEntry(takeId);
  if (r) return { title: r.title, short: r.short, map: r.map };
  const t = PICKS.takes[takeId];
  return t ? { title: { en: t.en, zh: t.zh }, short: { en: t.shortEn, zh: t.shortZh }, map: t.map } : null;
}
function buildFleet() {
  const map = existsSync(FLEET_TAKES) ? JSON.parse(readFileSync(FLEET_TAKES, 'utf8')) : {};
  const vehicles = {};
  for (const [vehicle, takeId] of Object.entries(map)) {
    const d = delivery(takeId), meta = takeTitles(takeId);
    if (!d?.hd || !d.poster || !meta) continue;
    const take = { take: takeId, round: d.round, vehicle };
    make(join(OUT, 'fleet', `${vehicle}.webm`), d.hd, (tmp) => run('ffmpeg', ['-v', 'error', '-y', '-i', d.hd, '-an',
      '-vf', 'scale=640:360:flags=lanczos', '-c:v', 'libvpx-vp9', '-crf', '48', '-b:v', '680k', '-row-mt', '1',
      '-deadline', 'good', '-cpu-used', '2', tmp]), take);
    make(join(OUT, 'fleet', `${vehicle}.jpg`), d.poster, (tmp) => run('ffmpeg', ['-v', 'error', '-y', '-i', d.poster,
      '-vf', 'scale=640:360:flags=lanczos', '-q:v', '5', tmp]), take);
    vehicles[vehicle] = { take: takeId, map: meta.map, title: meta.title, short: meta.short,
      loop: `${BASE_URL}/fleet/${vehicle}.webm`, poster: `${BASE_URL}/fleet/${vehicle}.jpg`, scene: `${BASE_URL}/scenes/${takeId}.scene.json` };
  }
  const index = join(OUT, 'fleet', 'index.json');
  mkdirSync(dirname(index), { recursive: true });
  writeFileSync(index, `${JSON.stringify({ schemaVersion: 1, collection: PICKS.collection, vehicles }, null, 1)}\n`);
  record(index, null, { vehicles: Object.keys(vehicles).length });
  return vehicles;
}

function buildScenes(fleet = {}) {
  const library = join(ROOT, 'tools/media-r5/site50-shots');
  const takes = [];
  for (const id of takeIds) {
    const source = join(library, `${id}.json`);
    if (!existsSync(source)) continue;
    copy(join(OUT, 'scenes', `${id}.scene.json`), source);
    const scene = JSON.parse(readFileSync(source, 'utf8'));
    const t = PICKS.takes[id];
    takes.push({ id, title: { en: t.en, zh: t.zh }, short: { en: t.shortEn, zh: t.shortZh }, map: scene.map ?? t.map,
      durationMs: scene.storyboard?.durationMs ?? null, scene: `${BASE_URL}/scenes/${id}.scene.json`,
      thumb: `${BASE_URL}/stills/${id}-thumb.webp` });
  }
  // the fleet's takes join the Director's list as their own group, each with its vehicle (the site's own takes stay first)
  for (const [vehicle, entry] of Object.entries(fleet)) {
    if (takes.some((t) => t.id === entry.take)) continue;
    const source = join(library, `${entry.take}.json`);
    if (!existsSync(source)) continue;
    copy(join(OUT, 'scenes', `${entry.take}.scene.json`), source);
    const scene = JSON.parse(readFileSync(source, 'utf8'));
    takes.push({ id: entry.take, group: 'fleet', vehicle, title: entry.title, short: entry.short, map: scene.map ?? entry.map,
      durationMs: scene.storyboard?.durationMs ?? null, scene: entry.scene, thumb: entry.poster });
  }
  const index = join(OUT, 'scenes', 'index.json');
  writeFileSync(index, `${JSON.stringify({ schemaVersion: 1, collection: PICKS.collection,
    source: 'The site fifty\'s takes as Studio scenes: each the scene its 4K final was filmed from (tools/media-r5/site50-shots)',
    takes }, null, 1)}\n`);
  record(index, null, { takes: takes.length });
}

// --- the archive and the manifest ---------------------------------------------------------------------------------
function mapNames() {
  const catalog = join(ROOT, 'src/ui/i18nCatalog.en-US.json');
  const en = existsSync(catalog) ? JSON.parse(readFileSync(catalog, 'utf8')) : {};
  return (id) => en[`map.${id}`] ?? id;
}
function archive(frames) {
  const mapName = mapNames();
  const shots = [];
  for (const f of frames) {
    if (!existsSync(join(OUT, 'frames', `${f.id}.webp`))) continue;
    shots.push({ src: `${BASE_URL}/frames/${f.id}.webp`, previewSrc: `${BASE_URL}/frames/${f.id}-thumb.webp`, alt: f.title,
      feature: f.technique, map: mapName(f.map), title: f.title, kind: 'frame', sequence: shots.length + 1 });
  }
  for (const id of takeIds) {
    const t = PICKS.takes[id];
    for (const [still, feature] of [['', 'Key moment'], ['-close', 'Close portrait']]) {
      if (!existsSync(join(OUT, 'stills', `${id}${still}.webp`))) continue;
      shots.push({ src: `${BASE_URL}/stills/${id}${still}.webp`, previewSrc: `${BASE_URL}/stills/${id}${still}-thumb.webp`,
        alt: t.en, feature, map: mapName(t.map), title: t.en, kind: 'take', take: id, sequence: shots.length + 1 });
    }
  }
  return { libraryId: `claude-of-tanks-${PICKS.collection}-archive`, schemaVersion: 1,
    source: 'The site fifty: the fifty frames (motion-blur stills, R181) and each take\'s key moment and close portrait, rendered at 4K in the game engine', shots };
}

function main() {
  const problems = checkPicks();
  if (plan) {
    for (const s of slots()) {
      const d = delivery(s.id);
      console.log(`${s.slot.padEnd(22)} ${s.id.padEnd(24)} ${s.kind.padEnd(7)} ${d ? `${relative('shots/media-r5/site50', d.round)}${d.sound ? '' : ' (silent)'}` : 'MISSING'}`);
    }
    const frames = frameList();
    console.log(`frames: ${frames.length} (${frames.filter((f) => f.current).length} from ${PICKS.sources.frames})`);
    console.log(`trailer: ${existsSync(join(MEDIA, PICKS.sources.trailer)) ? PICKS.sources.trailer : 'MISSING'}`);
    console.log(`reel: ${reelTakes().length} of ${PICKS.home.reel.takes.length} takes delivered (${PICKS.home.reel.takes.join(', ')})`);
    console.log(problems.length ? `${problems.length} problems:\n  ${problems.join('\n  ')}` : 'every slot has its take');
    return;
  }
  if (problems.length && !fallback) {
    console.error(`[site-media] ${problems.length} picks are not ready (--plan lists them; --fallback builds a draft):\n  ${problems.slice(0, 12).join('\n  ')}`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  // a run stopped mid-file leaves its <out>.tmp.<ext>; the outputs themselves are only ever renamed into place
  for (const dir of [OUT, PROXIES]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir, { recursive: true })) if (/\.tmp\.[a-z0-9]+$/.test(String(name))) rmSync(join(dir, String(name)));
  }
  const frames = frameList();
  if (want('stills')) buildStills();
  if (want('loops')) buildLoops();
  if (want('reels')) buildReels();
  if (want('frames')) buildFrames(frames);
  if (want('films')) buildFilms();
  const fleet = want('fleet') ? buildFleet() : {};
  if (want('scenes')) buildScenes(fleet);
  const proxies = want('proxies') ? buildProxies() : null;
  if (only) { console.log(`[site-media] ${files.length} files (${only.join(', ')}); the manifest is written by a full run`); return; }
  // a full run keeps only what it recorded: a re-pick (2026-10-12, wave m3) leaves the loops, reels and 4K stills of
  // takes no slot names any more, and the stage copies the draft's collection forward
  const recorded = new Set(files.map((f) => f.path));
  let pruned = 0, prunedBytes = 0;
  for (const name of readdirSync(OUT, { recursive: true })) {
    const abs = join(OUT, String(name));
    if (statSync(abs).isDirectory() || /^(manifest|archive)\.json$/.test(String(name))) continue;
    if (recorded.has(relative(join(ROOT, 'public'), abs).split('\\').join('/'))) continue;
    prunedBytes += statSync(abs).size;
    rmSync(abs);
    pruned++;
  }
  if (pruned) console.log(`[site-media] ${pruned} files no pick names any more were removed (${(prunedBytes / 1048576).toFixed(1)} MB)`);
  const takes = Object.fromEntries(takeIds.map((id) => {
    const d = delivery(id);
    return [id, { map: PICKS.takes[id].map, title: PICKS.takes[id].en, round: d ? relative('shots/media-r5/site50', d.round) : null,
      current: d?.current ?? false, sound: d?.sound ?? false }];
  }));
  const manifest = { libraryId: `claude-of-tanks-${PICKS.collection}`, schemaVersion: 1, round: PICKS.round,
    source: 'The site fifty, rendered at 4K in the game engine (tools/media-r5): fifty takes with their sound, the fifty frames and the films; picks in tools/media-r5/site-media/picks.json, built by tools/media-r5/site-media.mjs',
    draft: Object.values(takes).some((t) => !t.current) || frames.some((f) => !f.current) || undefined,
    takes, frames: frames.map((f) => ({ id: f.id, n: f.n, technique: f.technique, title: f.title, map: f.map, round: f.round })),
    files: files.sort((a, b) => a.path.localeCompare(b.path)) };
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  writeFileSync(join(OUT, 'archive.json'), `${JSON.stringify(archive(frames), null, 1)}\n`);
  const bytes = files.reduce((sum, f) => sum + f.bytes, 0);
  console.log(`[site-media] ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB in ${relative(ROOT, OUT)}${manifest.draft ? ' (a draft: older rounds stand in)' : ''}` +
    (proxies ? `; proxies ${proxies.files.reduce((s, f) => s + f.bytes, 0)} B` : ''));
}

main();
