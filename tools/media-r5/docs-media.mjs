#!/usr/bin/env node
// docs-media.mjs — the field manual's Filming page media (public/media/filming-r1/): eight site-fifty takes at every
// stage their rounds went through, re-encoded for the page, with a manifest recording each file's source.
//
//   node tools/media-r5/docs-media.mjs [--ids=s05,s22] [--stages=final,review2] [--final=deliver-r13] [--force] [--dry-run]
// --force re-encodes the selected stages (all by default); the frames strip, the cards and the figures follow.
//
// A take ships each stage whose source exists under shots/media-r5/; src/docs/filming.ts lists what shipped and
// src/docs/filming.selftest.mjs holds the two together. Stages, in the order the rounds made them:
//   r4       round four's delivered loop (4 Oct): site50/deliver/<id>/<id>.mp4, 1280×720
//   review1  engine review 1 (PR #9's engine, the first motion plan, before the fixes): site50/review-r5-pr9m, 540 px
//   previz   the schematic previz of round six's motion plan: previz50-r6/<id>.mp4, 1280×720
//   review2  engine review 2 (round six, after the fixes): site50/review-r6/<id>.mp4, 960 px
//   review3  engine review 3 (round seven: the plan re-staged on the 2.0 maps): site50/review-r7/<id>.mp4, 960 px
//   final    the 4K final on the 2.0 maps (round seven), shown at 1920×1080: site50/deliver-r7/<id>/<id>.mp4
// Every stage writes <id>-<stage>.mp4 (H.264 High, yuv420p, fast start, silent) and <id>-<stage>.webp (its first
// frame, the player's poster). <id>-frames.webp is four frames, start to end, of the take's latest engine render;
// <id>-thumb.webp is the take picker's card. The two figures are the previz sheet and the Studio's Plan view.
// <id>.scene.json is the take's scene as the Studio saves it, from the shot library (SCENE_LIBRARY).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = join(ROOT, 'shots/media-r5');
const OUT = join(ROOT, 'public/media/filming-r1');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const flag = (name) => process.argv.includes(`--${name}`);

/** The featured takes: each tells part of the story (see src/docs/filming.ts for what the page says about them). */
export const DOCS_TAKES = [
  's05-barn-advance', 's22-walking-barrage', 's21-fields-assault', 's47-ironworks-crane',
  's04-column-under-fire', 's13-farm-race', 's44-oasis-sunset', 's11-container-rows',
];

/** Stage sources and encodes, in the order the rounds made them. `size` null keeps the source's size. */
export const DOCS_STAGES = {
  r4: { src: (id) => `site50/deliver/${id}/${id}.mp4`, size: [1280, 720], crf: 25 },
  review1: { src: (id) => `site50/review-r5-pr9m/${id}.mp4`, size: null, crf: 27 },
  previz: { src: (id) => `previz50-r6/${id}.mp4`, size: [1280, 720], crf: 26 },
  review2: { src: (id) => `site50/review-r6/${id}.mp4`, size: null, crf: 26 },
  review3: { src: (id) => `site50/review-r7/${id}.mp4`, size: null, crf: 26 },
  // --final=deliver-r13 (launch night, 2026-10-09: each finals round delivers into its own folder)
  // (launch day, 2026-10-09) the launch finals are grainy 4K renders: at CRF 24 alone their 6.6 s took 7-11 MB, over the
  // page's 4.5 MB clip budget (filming.selftest.mjs), so the rate is capped at 4.4 Mbit/s (a VBV cap on the CRF encode)
  final: { src: (id) => `site50/${arg('final') ?? 'deliver-r7'}/${id}/${id}.mp4`, size: [1920, 1080], crf: 24, maxrateM: 4.4 },
};
// The frames strip and the picker card come from the latest engine render a take has.
export const ENGINE_LATEST = ['final', 'review3', 'review2', 'review1'];
export const CARD_FROM = ['final', 'review3', 'review2', 'r4'];
const FRAME_TIMES = [0, 2.2, 4.37, 6.53];
// The cover (the manual index's card and the page's social image) is round four's still of take 13.
export const FIGURES = [
  { name: 'previz-sheet', src: 'previz50-r6/s05-barn-advance.jpg', width: 1920, q: 84 },
  { name: 'plan-view', src: 'plan-view-s21.png', width: 2000, q: 84 },
  { name: 'cover', src: 'site50/deliver/s13-farm-race/s13-farm-race.jpg', width: 1920, q: 84 },
];

// The scene each take was filmed from, as the Studio saves it: the shot library's code (tools/media-r5/site50-shots/<id>.json;
// its history is each take's version history and library.json names each version). The page offers it to download,
// for the Studio's Load JSON, and opens it in the Studio (/studio?scene=<file>, src/game/studioSceneLink.ts).
export const SCENE_LIBRARY = 'tools/media-r5/site50-shots';

const ids = arg('ids') ? DOCS_TAKES.filter((id) => arg('ids').split(',').some((p) => id.startsWith(p))) : DOCS_TAKES;
const stageFilter = arg('stages')?.split(',');
const force = flag('force');
const dryRun = flag('dry-run');
const TMP = join(OUT, '.tmp');

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);
function probe(file) {
  const info = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,r_frame_rate:format=duration', '-of', 'json', file]));
  const { width, height, r_frame_rate: rate } = info.streams[0];
  const [num, den] = rate.split('/').map(Number);
  const seconds = Number(info.format?.duration);
  return { width, height, fps: Math.round((num / den) * 100) / 100, seconds: Number.isFinite(seconds) ? Math.round(seconds * 100) / 100 : 0 };
}
const webp = (png, out, q) => run('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', String(q), png, '-o', out]);

function encodeStage(id, stage, spec, source) {
  const video = join(OUT, `${id}-${stage}.mp4`);
  const poster = join(OUT, `${id}-${stage}.webp`);
  const redo = force && (!stageFilter || stageFilter.includes(stage));
  if (redo || !existsSync(video)) {
    const scale = spec.size ? `scale=${spec.size[0]}:${spec.size[1]}:flags=lanczos,` : '';
    const cap = spec.maxrateM ? ['-maxrate', `${spec.maxrateM}M`, '-bufsize', `${spec.maxrateM * 2}M`] : [];
    run('ffmpeg', ['-v', 'error', '-y', '-i', source, '-an', '-vf', `${scale}format=yuv420p`, '-c:v', 'libx264',
      '-preset', 'slow', '-crf', String(spec.crf), ...cap, '-profile:v', 'high', '-movflags', '+faststart', video]);
  }
  if (redo || !existsSync(poster)) {
    const png = join(TMP, `${id}-${stage}.png`);
    run('ffmpeg', ['-v', 'error', '-y', '-i', video, '-frames:v', '1', png]);
    webp(png, poster, 82);
  }
  return { video, poster };
}

function shipScene(id) {
  const source = join(ROOT, SCENE_LIBRARY, `${id}.json`);
  if (!existsSync(source)) return null;
  const code = readFileSync(source);
  const sha256 = createHash('sha256').update(code).digest('hex');
  const library = JSON.parse(readFileSync(join(ROOT, SCENE_LIBRARY, 'library.json'), 'utf8'));
  const version = library.shots[id]?.versions.findLast((entry) => entry.sha256 === sha256)?.version ?? null;
  if (!dryRun) writeFileSync(join(OUT, `${id}.scene.json`), code);
  return { file: `/media/filming-r1/${id}.scene.json`, source: `${SCENE_LIBRARY}/${id}.json`, version, sha256, bytes: code.length };
}

function framesStrip(id, video, out) {
  const { seconds, fps } = probe(video);
  const last = Math.max(0, seconds - 1 / fps);
  const pngs = FRAME_TIMES.map((t, i) => {
    const png = join(TMP, `${id}-frame${i}.png`);
    run('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.min(t, last)), '-i', video, '-frames:v', '1',
      '-vf', 'scale=480:270:flags=lanczos', png]);
    return png;
  });
  const strip = join(TMP, `${id}-frames.png`);
  run('ffmpeg', ['-v', 'error', '-y', ...pngs.flatMap((p) => ['-i', p]), '-filter_complex', 'hstack=inputs=4', strip]);
  webp(strip, out, 80);
  return FRAME_TIMES.map((t) => Math.round(Math.min(t, last) * 100) / 100);
}

// The manual index's card: one take across the pipeline, left to right — its previz, its latest engine review and
// its most finished still (the 4K final's once delivered, else round four's), 640×360 panels with 4 px gaps.
export const CARD = { take: 's13-farm-race', previzS: 2.2, engineS: 1.4 };
function cardStrip(takes) {
  const take = takes[CARD.take];
  const engine = ['review3', 'review2', 'review1'].find((stage) => take?.stages[stage]);
  const still = [`site50/deliver-r7/${CARD.take}/${CARD.take}.jpg`, `site50/deliver/${CARD.take}/${CARD.take}.jpg`]
    .find((path) => existsSync(join(SHOTS, path)));
  if (!take?.stages.previz || !engine || !still) return null;
  const png = join(TMP, 'card.png');
  const out = join(OUT, 'card.webp');
  run('ffmpeg', ['-v', 'error', '-y', '-ss', String(CARD.previzS), '-i', join(OUT, `${CARD.take}-previz.mp4`),
    '-ss', String(CARD.engineS), '-i', join(OUT, `${CARD.take}-${engine}.mp4`), '-i', join(SHOTS, still), '-filter_complex',
    '[0:v]scale=640:360:flags=lanczos,trim=end_frame=1[a];[1:v]scale=640:360:flags=lanczos,trim=end_frame=1[b];'
    + '[2:v]scale=640:360:flags=lanczos[c];color=c=0x080a0c:s=4x360:d=1,split[s1][s2];[a][s1][b][s2][c]hstack=inputs=5',
    '-frames:v', '1', png]);
  webp(png, out, 84);
  return { name: 'card', image: '/media/filming-r1/card.webp', width: 1928, height: 360,
    source: `${CARD.take}: previz at ${CARD.previzS} s | ${engine} at ${CARD.engineS} s | ${still}`, bytes: statSync(out).size };
}

function main() {
  const manifestFile = join(OUT, 'manifest.json');
  const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : null;
  const takes = Object.fromEntries((previous?.takes ?? []).map((take) => [take.id, take]));
  mkdirSync(TMP, { recursive: true });

  for (const id of ids) {
    const take = { id, stages: {} };
    for (const [stage, spec] of Object.entries(DOCS_STAGES)) {
      const source = join(SHOTS, spec.src(id));
      if (!existsSync(source)) continue;
      if (dryRun) { take.stages[stage] = { source: spec.src(id) }; continue; }
      const { video, poster } = encodeStage(id, stage, spec, source);
      take.stages[stage] = {
        video: `/media/filming-r1/${id}-${stage}.mp4`, poster: `/media/filming-r1/${id}-${stage}.webp`,
        ...probe(video), bytes: statSync(video).size, source: spec.src(id), sourceSha256: sha(source),
      };
    }
    const scene = shipScene(id);
    if (scene) take.scene = scene;
    if (dryRun) { console.log(id, Object.keys(take.stages).join(' '), scene ? `scene ${scene.version}` : 'no scene'); continue; }
    const engine = ENGINE_LATEST.find((stage) => take.stages[stage]);
    if (engine) {
      const out = join(OUT, `${id}-frames.webp`);
      const times = framesStrip(id, join(OUT, `${id}-${engine}.mp4`), out);
      take.frames = { image: `/media/filming-r1/${id}-frames.webp`, from: engine, times, width: 1920, height: 270 };
    }
    const card = CARD_FROM.find((stage) => take.stages[stage]);
    if (card) {
      const png = join(TMP, `${id}-thumb.png`);
      run('ffmpeg', ['-v', 'error', '-y', '-i', join(OUT, `${id}-${card}.mp4`), '-frames:v', '1', '-vf', 'scale=384:216:flags=lanczos', png]);
      webp(png, join(OUT, `${id}-thumb.webp`), 80);
      take.thumb = { image: `/media/filming-r1/${id}-thumb.webp`, from: card };
    }
    takes[id] = take;
    console.log(`${id}: ${Object.entries(take.stages).map(([s, v]) => `${s} ${Math.round(v.bytes / 1024)} KB`).join(', ')}`);
  }

  if (!dryRun) {
    const figures = FIGURES.map((figure) => {
      const source = join(SHOTS, figure.src);
      const out = join(OUT, `${figure.name}.webp`);
      if (force || !existsSync(out)) {
        const png = join(TMP, `${figure.name}.png`);
        run('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vf', `scale=${figure.width}:-2:flags=lanczos`, png]);
        webp(png, out, figure.q);
      }
      const { width, height } = probe(out);
      return { name: figure.name, image: `/media/filming-r1/${figure.name}.webp`, width, height, source: figure.src,
        sourceSha256: sha(source), bytes: statSync(out).size };
    });
    const card = cardStrip(takes);
    if (card) figures.push(card);
    rmSync(TMP, { recursive: true, force: true });
    const ordered = DOCS_TAKES.filter((id) => takes[id]).map((id) => takes[id]);
    const bytes = ordered.reduce((sum, take) => sum + Object.values(take.stages).reduce((s, v) => s + v.bytes, 0), 0);
    writeFileSync(manifestFile, `${JSON.stringify({
      collection: 'filming-r1',
      page: '/docs/filming',
      author: 'Kevin B. Liu',
      description: 'Site-fifty takes at each stage of the media rounds: round four, the engine reviews, the previz and the 4K finals, all rendered by the game engine (the previz by tools/media-r5/previz.mjs).',
      generatedBy: relative(ROOT, fileURLToPath(import.meta.url)),
      video: { codec: 'H.264 High', pixelFormat: 'yuv420p', audio: false, fastStart: true },
      takes: ordered,
      figures,
      videoBytes: bytes,
    }, null, 2)}\n`);
    console.log(`manifest: ${ordered.length} takes, ${(bytes / 1048576).toFixed(1)} MB of video -> ${relative(ROOT, manifestFile)}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
