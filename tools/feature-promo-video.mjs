// tools/feature-promo-video.mjs
//
// Reproducible 40-second feature trailer assembled from current live-app UI
// recordings, the deterministic Direct Duel Scene Studio recordings, and
// one synchronized arranged score. No comparison/reference models,
// third-party footage, or separately layered game SFX enter the edit.
//
// Usage:
//   node tools/feature-promo-video.mjs
//   node tools/feature-promo-video.mjs --master-only
//   node tools/feature-promo-video.mjs --out shots/promo-40s/custom.mp4

// Required live-app recordings (see feature-promo-capture.mjs):
//   shots/promo-35s/ui-video/{garage,battle-entry,battle-live,studio,
//     gallery,docs}.webm plus Garage/Studio/HUD transparent overlays
// Required scenic rail sources:
//   shots/promo-map-rail-60fps/*.webm
// Required cinematic battle sources:
//   shots/studio-modern-all-maps-v4-60fps/*.webm
// Required arranged score (see feature-promo-score.mjs):
//   shots/promo-40s/music/claude-of-tanks-original-score.wav

// The edit is chaptered with clean motion-matched cuts. The source durations
// total 42.25 seconds; trimming 250 ms from the outgoing side of each of the
// first nine chapters keeps the output exactly 40 seconds without allowing
// the previous scene to bleed beneath the incoming chapter label.

import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg')
  ? '/opt/homebrew/bin/ffmpeg'
  : 'ffmpeg';
const FFPROBE = existsSync('/opt/homebrew/bin/ffprobe')
  ? '/opt/homebrew/bin/ffprobe'
  : 'ffprobe';
const args = process.argv.slice(2);
const MASTER_ONLY = args.includes('--master-only');
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const OUT = resolve(ROOT, opt('out', 'shots/promo-40s/claude-of-tanks-feature-promo-40s.mp4'));
const OUT_DIR = dirname(OUT);
const WORK = join(OUT_DIR, 'work');
const VERSIONS = join(OUT_DIR, 'versions');
const SOURCE_DIR = join(ROOT, 'shots/promo-35s');
const UI = join(SOURCE_DIR, 'ui-video');
const CINEMATIC = join(ROOT, 'shots/studio-modern-all-maps-v4-60fps');
const MAP_RAIL = join(ROOT, 'shots/promo-map-rail-60fps');
const LOGO = join(ROOT, 'public/brand/og-logo-transparent.png');
const FPS = 60;
const WIDTH = 1920;
const HEIGHT = 1080;
const PROMO_DURATION = 40;
const CHAPTER_CUT_TRIM_S = 0.25;
const INNER_CUT_TRIM_S = 0.10;

mkdirSync(WORK, { recursive: true });
mkdirSync(VERSIONS, { recursive: true });

const versionStamp = () => new Date().toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, 'Z');

function archiveMaster(path, label) {
  if (!existsSync(path)) return null;
  const archive = join(VERSIONS, `${versionStamp()}-${label}.mp4`);
  copyFileSync(path, archive);
  console.log(`[feature-promo] archived: ${archive}`);
  return archive;
}

function run(command, commandArgs, label) {
  console.log(`[feature-promo] ${label}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${label} failed${detail ? `\n${detail}` : ''}`);
  }
  return (result.stdout || '').trim();
}

function ffmpeg(commandArgs, label) {
  run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...commandArgs], label);
}

function assertMovingTail(chapter, outgoingTrim = CHAPTER_CUT_TRIM_S) {
  const duration = Number(run(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', chapter.path,
  ], `probe ${chapter.id} motion tail`));
  // The assembled master removes outgoingTrim from every live chapter. Probe
  // the 350 ms that actually reaches the cut, not the discarded handle after
  // it, so a harmless hold in that edit handle cannot mask or reject the cut.
  const start = Math.max(0, duration - outgoingTrim - 0.35).toFixed(3);
  const result = spawnSync(FFMPEG, [
    '-hide_banner', '-loglevel', 'info', '-ss', start, '-t', '0.35', '-i', chapter.path,
    // 0.1% full-frame delta still catches a parked rail or duplicated tail,
    // while allowing deliberate slow orbits beneath static HUD/title layers.
    '-vf', 'freezedetect=n=0.001:d=0.15', '-an', '-f', 'null', '-',
  ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`${chapter.id}: motion-tail probe failed\n${result.stderr.trim()}`);
  }
  if (/freeze_duration/.test(result.stderr)) {
    throw new Error(`${chapter.id}: final 350 ms contains a motion stall`);
  }
}

function sourceMotionScore(path, start, duration, reelId) {
  const result = spawnSync(FFMPEG, [
    '-hide_banner', '-loglevel', 'info', '-i', path,
    '-vf', `trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS,` +
      'scale=64:36,tblend=all_mode=difference,signalstats,metadata=print',
    '-an', '-f', 'null', '-',
  ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`${reelId}: source motion probe failed\n${result.stderr.trim()}`);
  }
  const values = [...result.stderr.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function assertSourceMotion(clip, reelId) {
  const sourceDuration = clip.sourceDuration || clip.duration;
  const probeDuration = Math.min(0.30, sourceDuration);
  const checks = sourceDuration <= 0.30
    ? [{ label: 'selected window', at: clip.start, floor: clip.motionFloor ?? 1.5 }]
    : [
      { label: 'starts', at: clip.start, floor: clip.motionFloor ?? 4 },
      {
        label: 'ends',
        at: clip.start + sourceDuration - probeDuration,
        floor: clip.tailMotionFloor ?? 2.5,
      },
    ];
  for (const check of checks) {
    const score = sourceMotionScore(clip.path, check.at, probeDuration, reelId);
    if (score >= check.floor) continue;
    const file = clip.path.split('/').at(-1);
    throw new Error(
      `${reelId}: ${file} ${check.label} on a parked camera frame ` +
      `(motion ${score.toFixed(2)} < ${check.floor.toFixed(2)})`,
    );
  }
}

function requireFile(path, label = path) {
  if (!existsSync(path)) throw new Error(`missing ${label}: ${path}`);
  return path;
}

const ui = {
  garage: requireFile(join(UI, 'garage.webm'), 'garage recording'),
  garageOverlay: requireFile(join(UI, 'garage-overlay.png'), 'garage UI layer'),
  entry: requireFile(join(UI, 'battle-entry.webm'), 'battle-entry recording'),
  live: requireFile(join(UI, 'battle-live.webm'), 'live battle recording'),
  liveReticle: requireFile(join(UI, 'battle-live-reticle.webm'), 'live battle reticle recording'),
  liveHud: requireFile(join(UI, 'battle-live-hud.png'), 'live battle HUD layer'),
  studio: requireFile(join(UI, 'studio.webm'), 'Studio recording'),
  studioOverlay: requireFile(join(UI, 'studio-overlay.png'), 'Studio UI layer'),
  gallery: requireFile(join(UI, 'gallery.webm'), 'Gallery recording'),
  docs: requireFile(join(UI, 'docs.webm'), 'Docs recording'),
};
requireFile(LOGO, 'brand logo');

const cinematicFiles = [
  '01_m1a2_sepv3_vs_t90m_verdant.webm',
  '02_strv122_vs_k2_desert.webm',
  '03_challenger_3_vs_leo2a7v_winter.webm',
  '04_type10b_vs_ztz99a2_urban.webm',
  '05_leclerc_xlr_vs_t14_coastal.webm',
  '06_kf51b_vs_abramsx_autumn.webm',
  '07_m1a2_tusk_vs_t90sm_steppe.webm',
  '08_ua_t84_oplot_m_vs_pt91_twardy_railyard.webm',
  '09_pl01_105_vs_k2b_frontier.webm',
  '10_merkava4b_vs_ariete_c2_fjord.webm',
  '11_m1a2_sepv2_vs_type99a_delta.webm',
  '12_leo2_revolution_vs_t72b3m_badlands.webm',
  '13_challenger2_vs_leclerc_monsoon.webm',
  '14_type10_vs_k1a1_alpine.webm',
  '15_m1a1ha_vs_t80u_caldera.webm',
  '16_ua_m1a1_vs_ua_t64bv_foundry.webm',
  '17_leo2a6m_vs_t90ms_desert.webm',
  '18_merkava3d_vs_amx40_winter.webm',
  '19_type90a_vs_pt91m_verdant.webm',
  '20_m1a2_vs_ua_t80u_kursk_coastal.webm',
].map((file) => requireFile(join(CINEMATIC, file), `cinematic battle clip ${file}`));

const mapRailFiles = [
  '01_verdant.webm', '02_desert.webm', '03_winter.webm', '04_urban.webm',
  '05_autumn.webm', '06_steppe.webm', '07_railyard.webm', '08_fjord.webm',
  '09_delta.webm', '10_coastal.webm',
].map((file) => requireFile(join(MAP_RAIL, file), `scenic map rail ${file}`));

const audio = {
  musicScore: requireFile(
    join(OUT_DIR, 'music/claude-of-tanks-original-score.wav'),
    'arranged feature-promo score (run tools/feature-promo-score.mjs)',
  ),
};

const overlayDefinitions = {
  opening: {
    layout: 'hero',
    title: 'CLAUDE OF TANKS',
    sub: 'COT.KEVINLIU.STUDIO',
  },
  entry: {
    title: '16 BATTLEFIELDS',
    sub: 'A ten-map video tour through the full battlefield roster',
  },
  combatA: {
    title: 'ARMOR  •  BALLISTICS  •  MODULE DAMAGE',
    sub: 'Deterministic 60 Hz simulation',
  },
  live: {
    title: 'FULL BATTLE HUD',
    sub: 'Spotting  •  ammunition  •  modules  •  teams  •  tactical map',
  },
  combatB: {
    title: 'TRACKED MOVEMENT  •  STABILIZED FIRE',
    sub: 'Forward-only hull motion with independent turret aim',
  },
  studio: {
    title: 'SCENE STUDIO',
    sub: 'Camera rails  •  tank choreography  •  effects  •  deterministic capture',
  },
  library: {
    title: 'MASSIVE MODERN TANK LIBRARY',
    sub: '120 first-party procedural vehicles',
  },
  gallery: {
    title: 'LIVE TANK GALLERY',
    sub: 'Interactive technical dossiers for the full fleet',
  },
  docs: {
    title: 'TECHNICAL DOCUMENTATION',
    sub: 'Architecture  •  simulation contracts  •  authoring tools',
  },
  finale: {
    title: 'EVERY MAP.  EVERY ANGLE.',
    sub: 'A browser-native armored combat sandbox',
  },
  end: {
    layout: 'hero',
    title: 'CLAUDE OF TANKS',
    sub: 'COT.KEVINLIU.STUDIO',
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function renderOverlays() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    const logoUri = `data:image/png;base64,${readFileSync(LOGO).toString('base64')}`;
    const [shieldUri, wordmarkUri] = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const crop = ({ x, y, width, height }) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(
          image,
          x, y, width, height,
          0, 0, width, height,
        );
        return canvas.toDataURL('image/png');
      };
      return [
        // Extra padding preserves the complete gold shield border.
        crop({ x: 24, y: 88, width: 456, height: 456 }),
        // Extra top/bottom padding prevents either wordmark line clipping.
        crop({ x: 520, y: 178, width: 648, height: 272 }),
      ];
    }, logoUri);
    for (const [id, definition] of Object.entries(overlayDefinitions)) {
      const hero = definition.layout === 'hero';
      const html = `<!doctype html>
<html><head><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#f4f4f1;letter-spacing:.02em}
.bottom-shade{position:absolute;inset:auto 0 0;height:44%;background:linear-gradient(0deg,rgba(4,7,10,.88),rgba(4,7,10,.54) 46%,transparent)}
.label{position:absolute;left:92px;bottom:76px;filter:drop-shadow(0 4px 12px rgba(0,0,0,.8))}
.title{font-size:58px;font-weight:850;letter-spacing:.045em;line-height:1.02;text-transform:uppercase}
.sub{margin-top:15px;color:#c7d0d8;font-size:23px;font-weight:560;letter-spacing:.065em}
.hero-shade{position:absolute;inset:0;background:radial-gradient(circle at 50% 43%,rgba(5,8,12,.06),rgba(5,8,12,.78) 76%),linear-gradient(0deg,rgba(4,7,10,.82),rgba(4,7,10,.18) 62%)}
.hero{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;filter:drop-shadow(0 7px 18px rgba(0,0,0,.85))}
.brand-lockup{position:relative;width:1160px;height:366px;margin-bottom:-26px}
.brand-piece{position:absolute}
.brand-piece img{display:block;width:100%;height:auto;margin:0}
.brand-shield{left:45px;top:5px;width:318px}
.brand-wordmark{left:420px;top:40px;width:700px}
.hero .sub{font-size:29px;letter-spacing:.22em;margin-top:6px}
</style></head><body>
${hero
    ? `<div class="hero-shade"></div><div class="hero"><div class="brand-lockup"><div class="brand-piece brand-shield"><img src="${shieldUri}" alt=""></div><div class="brand-piece brand-wordmark"><img src="${wordmarkUri}" alt=""></div></div><div class="sub">${escapeHtml(definition.sub)}</div></div>`
    : `<div class="bottom-shade"></div><div class="label"><div class="title">${escapeHtml(definition.title)}</div><div class="sub">${escapeHtml(definition.sub)}</div></div>`}
</body></html>`;
      await page.setContent(html, { waitUntil: 'load' });
      await page.screenshot({
        path: join(WORK, `overlay-${id}.png`),
        omitBackground: true,
      });
    }
  } finally {
    await browser.close();
  }
}

const grade = [
  `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos`,
  `crop=${WIDTH}:${HEIGHT}`,
  `fps=${FPS}`,
  'setsar=1',
  'eq=contrast=1.055:saturation=1.08:brightness=-0.008',
  'vignette=PI/6',
  'format=yuv420p',
].join(',');

function encodeUiVideo({ id, source, duration, overlay, darken = false, start = 0 }) {
  const output = join(WORK, `${id}.mp4`);
  const bgGrade = darken
    ? `${grade},eq=contrast=1.03:saturation=0.95:brightness=-0.08`
    : grade;
  ffmpeg([
    '-ss', String(start), '-t', String(duration), '-i', source,
    '-loop', '1', '-framerate', String(FPS), '-t', String(duration), '-i', join(WORK, `overlay-${overlay}.png`),
    '-filter_complex',
    `[0:v]setpts=PTS-STARTPTS,${bgGrade}[bg];` +
      '[1:v]format=rgba[ov];[bg][ov]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], `encode ${id}`);
  return { id, path: output, duration };
}

function encodeLayeredUiVideo({
  id, source, surfaceOverlay, duration, overlay, darken = false, start = 0,
}) {
  const output = join(WORK, `${id}.mp4`);
  const bgGrade = darken
    ? `${grade},eq=contrast=1.03:saturation=0.95:brightness=-0.08`
    : grade;
  ffmpeg([
    '-ss', String(start), '-t', String(duration), '-i', source,
    '-loop', '1', '-framerate', String(FPS), '-t', String(duration), '-i', surfaceOverlay,
    '-loop', '1', '-framerate', String(FPS), '-t', String(duration), '-i', join(WORK, `overlay-${overlay}.png`),
    '-filter_complex',
    `[0:v]setpts=PTS-STARTPTS,minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,${bgGrade}[scene];` +
      `[1:v]scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=rgba[surface];` +
      '[2:v]format=rgba[feature];' +
      '[scene][surface]overlay=0:0:format=auto[page];' +
      '[page][feature]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], `encode ${id}`);
  return { id, path: output, duration };
}

function encodeBattleHud({ id, duration, overlay, start = 0 }) {
  const output = join(WORK, `${id}.mp4`);
  ffmpeg([
    '-ss', String(start), '-t', String(duration), '-i', ui.live,
    '-c:v', 'libvpx-vp9', '-ss', String(start), '-t', String(duration), '-i', ui.liveReticle,
    '-loop', '1', '-framerate', String(FPS), '-t', String(duration), '-i', ui.liveHud,
    '-loop', '1', '-framerate', String(FPS), '-t', String(duration), '-i', join(WORK, `overlay-${overlay}.png`),
    '-filter_complex',
    `[0:v]setpts=PTS-STARTPTS,minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,${grade}[game];` +
      `[1:v]setpts=PTS-STARTPTS,fps=${FPS},scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=rgba[reticle];` +
      `[2:v]scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=rgba[hud];` +
      '[3:v]format=rgba[feature];' +
      '[game][reticle]overlay=0:0:format=auto[withReticle];' +
      '[withReticle][hud]overlay=0:0:format=auto[withHud];' +
      '[withHud][feature]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], `encode ${id}`);
  return { id, path: output, duration };
}

function encodeEndCard(duration) {
  const output = join(WORK, '09-end.mp4');
  ffmpeg([
    '-f', 'lavfi', '-i', `color=c=0x05080c:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${duration}`,
    '-loop', '1', '-framerate', String(FPS), '-t', String(duration), '-i', join(WORK, 'overlay-end.png'),
    '-filter_complex',
    `[0:v]format=yuv420p[bg];[1:v]format=rgba[ov];[bg][ov]overlay=0:0:format=auto,fade=t=in:st=0:d=0.3,fade=t=out:st=${(duration - 0.35).toFixed(2)}:d=0.35,format=yuv420p[v]`,
    '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], 'encode end card');
  return { id: '09-end', path: output, duration };
}

function encodeReel({ id, clips, overlay }) {
  const output = join(WORK, `${id}.mp4`);
  const commandArgs = [];
  for (const clip of clips) {
    assertSourceMotion(clip, id);
    // Decode the complete source and trim in the filter graph. Input-level
    // seeking can land on the preceding VP9 keyframe, which exposed a stray
    // landscape frame before several otherwise clean tank portraits.
    commandArgs.push('-i', clip.path);
  }
  commandArgs.push(
    '-loop', '1', '-framerate', String(FPS), '-t', String(clips.reduce((sum, clip) => sum + clip.duration, 0)),
    '-i', join(WORK, `overlay-${overlay}.png`),
  );
  const filters = [];
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    const sourceDuration = clip.sourceDuration || clip.duration;
    const speed = clip.duration / sourceDuration;
    const outputDuration = clip.duration - (index < clips.length - 1 ? INNER_CUT_TRIM_S : 0);
    filters.push(
      `[${index}:v]trim=start=${clip.start}:duration=${sourceDuration},` +
      `setpts=(PTS-STARTPTS)*${speed.toFixed(6)},` +
      // Direct Duel requests a 60 fps browser stream. Normalize its variable
      // timestamps to CFR without optical flow so foliage, tracks, and blast
      // debris cannot bend into artifacts during fast camera motion.
      `fps=${FPS},tpad=stop_mode=clone:stop_duration=0.20,` +
      `trim=duration=${outputDuration.toFixed(3)},setpts=PTS-STARTPTS,` +
      `${grade}[c${index}]`,
    );
  }
  const duration = clips.reduce((sum, clip) => sum + clip.duration, 0) -
    (clips.length - 1) * INNER_CUT_TRIM_S;
  filters.push(`${clips.map((_, index) => `[c${index}]`).join('')}` +
    `concat=n=${clips.length}:v=1:a=0[reel]`);
  const overlayIndex = clips.length;
  filters.push(
    `[${overlayIndex}:v]format=rgba[ov]`,
    '[reel][ov]overlay=0:0:format=auto,format=yuv420p[v]',
  );
  commandArgs.push(
    '-filter_complex', filters.join(';'),
    '-map', '[v]', '-an', '-t', duration.toFixed(3),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  );
  ffmpeg(commandArgs, `encode ${id}`);
  return { id, path: output, duration };
}

function encodeMapRail() {
  const duration = 2.4;
  const segmentDuration = duration / mapRailFiles.length;
  const output = join(WORK, '01-entry.mp4');
  const commandArgs = mapRailFiles.flatMap((path) => ['-t', '1', '-i', path]);
  commandArgs.push(
    '-loop', '1', '-framerate', String(FPS), '-t', String(duration),
    '-i', join(WORK, 'overlay-entry.png'),
  );
  const filters = mapRailFiles.map((_, index) =>
    `[${index}:v]trim=duration=1,setpts=(PTS-STARTPTS)*${segmentDuration.toFixed(6)},${grade}[map${index}]`,
  );
  filters.push(
    `${mapRailFiles.map((_, index) => `[map${index}]`).join('')}` +
      `concat=n=${mapRailFiles.length}:v=1:a=0[rail]`,
    `[${mapRailFiles.length}:v]format=rgba[ov]`,
    '[rail][ov]overlay=0:0:format=auto,format=yuv420p[v]',
  );
  commandArgs.push(
    '-filter_complex', filters.join(';'),
    '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  );
  ffmpeg(commandArgs, 'encode continuous scenic map rail');
  return { id: '01-entry', path: output, duration };
}

function encodeGalleryDocs() {
  const durationEach = 2.875;
  const output = join(WORK, '07-gallery-docs.mp4');
  ffmpeg([
    '-ss', '0.25', '-t', String(durationEach), '-i', ui.gallery,
    '-ss', '0.25', '-t', String(durationEach), '-i', ui.docs,
    '-loop', '1', '-framerate', String(FPS), '-t', String(durationEach), '-i', join(WORK, 'overlay-gallery.png'),
    '-loop', '1', '-framerate', String(FPS), '-t', String(durationEach), '-i', join(WORK, 'overlay-docs.png'),
    '-filter_complex',
    `[0:v]setpts=PTS-STARTPTS,${grade}[g];` +
      `[1:v]setpts=PTS-STARTPTS,${grade}[d];` +
      '[2:v]format=rgba[go];[3:v]format=rgba[do];' +
      '[g][go]overlay=0:0:format=auto[gl];[d][do]overlay=0:0:format=auto[dl];' +
      `[gl]trim=duration=${(durationEach - CHAPTER_CUT_TRIM_S).toFixed(3)},` +
      'setpts=PTS-STARTPTS[glCut];' +
      `[dl]trim=duration=${durationEach.toFixed(3)},setpts=PTS-STARTPTS[dlCut];` +
      '[glCut][dlCut]concat=n=2:v=1:a=0,format=yuv420p[v]',
    '-map', '[v]', '-an', '-t', '5.5',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], 'encode Gallery + Docs');
  return { id: '07-gallery-docs', path: output, duration: 5.5 };
}

function encodeLibrary() {
  return encodeReel({
    id: '06-library', overlay: 'library', clips: [
      // The unshaken ground-skimming reveal precedes every camera cue. Each
      // map gets an individually audited vehicle-first frame, never an empty
      // terrain or foliage pass.
      { path: cinematicFiles[1], start: 1.35, sourceDuration: 0.72, duration: 0.835714 },
      { path: cinematicFiles[2], start: 1.35, sourceDuration: 0.72, duration: 0.835714 },
      { path: cinematicFiles[6], start: 1.35, sourceDuration: 0.72, duration: 0.835714,
        motionFloor: 3, tailMotionFloor: 2 },
      { path: cinematicFiles[11], start: 1.35, sourceDuration: 0.72, duration: 0.835714,
        motionFloor: 3 },
      { path: cinematicFiles[16], start: 1.35, sourceDuration: 0.72, duration: 0.835714,
        motionFloor: 2.75 },
      { path: cinematicFiles[18], start: 1.35, sourceDuration: 0.72, duration: 0.835714 },
      { path: cinematicFiles[19], start: 1.35, sourceDuration: 0.72, duration: 0.835716,
        motionFloor: 3.25 },
    ],
  });
}

if (!MASTER_ONLY) await renderOverlays();

const chapters = MASTER_ONLY ? [
  { id: '00-opening', path: join(WORK, '00-opening.mp4'), duration: 3.2 },
  { id: '01-entry', path: join(WORK, '01-entry.mp4'), duration: 2.4 },
  { id: '02-combat-a', path: join(WORK, '02-combat-a.mp4'), duration: 5.5 },
  { id: '03-live', path: join(WORK, '03-live.mp4'), duration: 2.5 },
  { id: '04-combat-b', path: join(WORK, '04-combat-b.mp4'), duration: 4.9 },
  { id: '05-studio', path: join(WORK, '05-studio.mp4'), duration: 3.3 },
  { id: '06-library', path: join(WORK, '06-library.mp4'), duration: 5.25 },
  { id: '07-gallery-docs', path: join(WORK, '07-gallery-docs.mp4'), duration: 5.5 },
  { id: '08-finale', path: join(WORK, '08-finale.mp4'), duration: 7.6 },
  { id: '09-end', path: join(WORK, '09-end.mp4'), duration: 2.1 },
] : [
  encodeLayeredUiVideo({
    id: '00-opening', source: ui.garage, surfaceOverlay: ui.garageOverlay,
    duration: 3.2, overlay: 'opening', darken: true, start: 0.20,
  }),
  encodeMapRail(),
  encodeReel({
    id: '02-combat-a', overlay: 'combatA', clips: [
      // Armor-impact windows keep the struck vehicle centered. Camera shake
      // is confined to the visible impact/explosion in every selected beat.
      { path: cinematicFiles[1], start: 9.30, sourceDuration: 0.78, duration: 1.00 },
      { path: cinematicFiles[2], start: 9.30, sourceDuration: 0.78, duration: 1.00 },
      { path: cinematicFiles[4], start: 9.30, sourceDuration: 0.78, duration: 1.00 },
      { path: cinematicFiles[5], start: 9.30, sourceDuration: 0.78, duration: 1.00 },
      { path: cinematicFiles[11], start: 9.30, sourceDuration: 0.78, duration: 1.00 },
      { path: cinematicFiles[17], start: 9.30, sourceDuration: 0.78, duration: 1.00 },
    ],
  }),
  encodeBattleHud({ id: '03-live', duration: 2.5, overlay: 'live', start: 0.35 }),
  encodeReel({
    id: '04-combat-b', overlay: 'combatB', clips: [
      { path: cinematicFiles[0], start: 7.05, sourceDuration: 0.72, duration: 1.06 },
      { path: cinematicFiles[3], start: 7.05, sourceDuration: 0.72, duration: 1.06 },
      { path: cinematicFiles[7], start: 7.05, sourceDuration: 0.72, duration: 1.06 },
      { path: cinematicFiles[13], start: 7.05, sourceDuration: 0.72, duration: 1.06 },
      { path: cinematicFiles[19], start: 7.05, sourceDuration: 0.72, duration: 1.06 },
    ],
  }),
  encodeLayeredUiVideo({
    id: '05-studio', source: ui.studio, surfaceOverlay: ui.studioOverlay,
    duration: 3.3, overlay: 'studio', start: 8.40,
  }),
  encodeLibrary(),
  encodeGalleryDocs(),
  encodeReel({
    id: '08-finale', overlay: 'finale', clips: [
      { path: cinematicFiles[6], start: 9.30, sourceDuration: 0.78, duration: 1.17 },
      { path: cinematicFiles[8], start: 9.30, sourceDuration: 0.78, duration: 1.17 },
      { path: cinematicFiles[9], start: 9.30, sourceDuration: 0.78, duration: 1.17 },
      { path: cinematicFiles[10], start: 9.30, sourceDuration: 0.78, duration: 1.17 },
      { path: cinematicFiles[12], start: 9.30, sourceDuration: 0.78, duration: 1.17 },
      { path: cinematicFiles[15], start: 9.30, sourceDuration: 0.78, duration: 1.17 },
      // Finish on the direct armor-impact beat, before the pullback begins.
      { path: cinematicFiles[16], start: 9.30, sourceDuration: 0.78, duration: 1.18 },
    ],
  }),
  encodeEndCard(2.1),
];

// End card is deliberately still. Every live chapter must cut away while its
// camera or subject is still moving, never after a rail has parked.
for (const chapter of chapters.slice(0, -1)) assertMovingTail(chapter);

const chapterInputs = chapters.flatMap((chapter) => ['-i', chapter.path]);
const audioInputs = Object.values(audio).flatMap((path) => ['-i', path]);
const filters = [];
for (let index = 0; index < chapters.length; index += 1) {
  const trimDuration = chapters[index].duration -
    (index < chapters.length - 1 ? CHAPTER_CUT_TRIM_S : 0);
  filters.push(
    `[${index}:v]trim=duration=${trimDuration.toFixed(3)},` +
      `setpts=PTS-STARTPTS,format=yuv420p[chapter${index}]`,
  );
}
filters.push(
  `${chapters.map((_, index) => `[chapter${index}]`).join('')}` +
    `concat=n=${chapters.length}:v=1:a=0,trim=duration=${PROMO_DURATION},` +
    'setpts=PTS-STARTPTS,' +
    'format=yuv420p[outv]',
);

// Audio input indices begin after the ten chapter files.
const audioBase = chapters.length;
filters.push(
  // One authored score is the complete soundtrack. It is arranged to the
  // chapter timings and contains no separately triggered battle/UI effects.
  `[${audioBase}:a]atrim=duration=${PROMO_DURATION},asetpts=PTS-STARTPTS,` +
    'aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.5,' +
    'afade=t=out:st=39.2:d=0.8,' +
    'loudnorm=I=-14:LRA=9:TP=-1.0,alimiter=limit=.94:level=false,' +
    'volume=-1.5dB[outa]',
);

const previousVersionArchive = archiveMaster(OUT, 'pre-centered-cfr60-cut');
ffmpeg([
  ...chapterInputs,
  ...audioInputs,
  '-filter_complex', filters.join(';'),
  '-map', '[outv]', '-map', '[outa]',
  '-t', String(PROMO_DURATION),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high',
  '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-movflags', '+faststart', OUT,
], 'assemble final 40-second trailer');

const duration = Number(run(FFPROBE, [
  '-v', 'error', '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1', OUT,
], 'probe final duration'));
if (!Number.isFinite(duration) || Math.abs(duration - PROMO_DURATION) > 0.06) {
  throw new Error(`final duration ${duration}s is not 40.00s ± 0.06s`);
}

const poster = join(OUT_DIR, 'claude-of-tanks-feature-promo-40s-poster.png');
ffmpeg([
  '-ss', '34.85', '-i', OUT, '-frames:v', '1', poster,
], 'extract poster frame');
const currentVersionArchive = archiveMaster(OUT, 'centered-tanks-cfr60-library');

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  output: OUT.replace(`${ROOT}/`, ''),
  poster: poster.replace(`${ROOT}/`, ''),
  durationSeconds: duration,
  width: WIDTH,
  height: HEIGHT,
  fps: FPS,
  sourcePolicy: '60 fps-requested Direct Duel recordings normalized to CFR-60 without optical flow + live browser UI + licensed Apple Loop music stems',
  musicPolicy: 'one synchronized four-movement score; no separately layered game, voice, weapon, impact, or UI SFX',
  cameraShakePolicy: 'camera shake appears only inside visible gun-blast, armor-impact, or detonation windows',
  defaultShowcaseVehicle: 'm1a2_sepv2',
  previousVersionArchive: previousVersionArchive?.replace(`${ROOT}/`, '') ?? null,
  currentVersionArchive: currentVersionArchive.replace(`${ROOT}/`, ''),
  motionPolicy: 'every live chapter remains in motion through its final 350 ms',
  chapters: chapters.map((chapter) => ({ id: chapter.id, durationSeconds: chapter.duration })),
  chapterTransitionSeconds: 0,
  chapterOutgoingTrimSeconds: CHAPTER_CUT_TRIM_S,
  chapterCutPolicy: 'clean motion-matched hard cuts; no outgoing-scene bleed into incoming labels',
  cinematicSourceCount: cinematicFiles.length,
  featureSurfaces: ['garage', 'battle entry', 'battle HUD', 'Scene Studio', 'modern tank library', 'Tank Gallery', 'Documentation'],
  battleMaps: ['verdant', 'desert', 'winter', 'urban', 'autumn', 'steppe', 'railyard', 'fjord', 'delta', 'coastal'],
};
writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[feature-promo] complete: ${OUT}`);
console.log(`[feature-promo] duration: ${duration.toFixed(3)}s`);
