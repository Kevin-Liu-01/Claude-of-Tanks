// Render eight genuinely different 40-second Claude of Tanks trailer cuts.
//
// The variants reuse the deterministic first-party captures from the approved
// feature trailer, but change story order, shot emphasis, alternate tank/map
// reels, and the arrangement of the licensed score. Documentation is omitted
// from every cut; Gallery remains as a live product surface.
//
// Usage:
//   node tools/feature-promo-variants.mjs


import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg')
  ? '/opt/homebrew/bin/ffmpeg'
  : 'ffmpeg';
const FFPROBE = existsSync('/opt/homebrew/bin/ffprobe')
  ? '/opt/homebrew/bin/ffprobe'
  : 'ffprobe';
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;
const DURATION = 40;
const CONTENT_DURATION = 37.9;
const WORK = join(ROOT, 'shots/promo-40s/work');
const OUT_DIR = join(ROOT, 'shots/promo-40s/variants');
const MUSIC_DIR = join(OUT_DIR, 'music');
const UI_DIR = join(ROOT, 'shots/promo-35s/ui-video');
const CINEMATIC_DIR = join(ROOT, 'shots/studio-modern-all-maps-v4-60fps');
const MAP_DIR = join(ROOT, 'shots/promo-map-rail-60fps');
const LOOP_DIR = '/Library/Audio/Apple Loops/Apple/01 Hip Hop';
const INNER_CUT_TRIM_S = 0.1;
const POST_ONLY = process.argv.includes('--post-only');

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(MUSIC_DIR, { recursive: true });

function run(command, commandArgs, label) {
  console.log(`[promo-variants] ${label}`);
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

function requireFile(path, label = path) {
  if (!existsSync(path)) throw new Error(`missing ${label}: ${path}`);
  return path;
}

function closeEnough(actual, expected, tolerance = 0.025) {
  return Math.abs(actual - expected) <= tolerance;
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

const baseBlocks = {
  opening: { path: join(WORK, '00-opening.mp4'), duration: 3.2, category: 'brand' },
  maps: { path: join(WORK, '01-entry.mp4'), duration: 2.4, category: 'maps' },
  combatA: { path: join(WORK, '02-combat-a.mp4'), duration: 5.5, category: 'combat' },
  hud: { path: join(WORK, '03-live.mp4'), duration: 2.5, category: 'hud' },
  combatB: { path: join(WORK, '04-combat-b.mp4'), duration: 4.9, category: 'movement' },
  studio: { path: join(WORK, '05-studio.mp4'), duration: 3.3, category: 'creator' },
  library: { path: join(WORK, '06-library.mp4'), duration: 5.25, category: 'fleet' },
  finale: { path: join(WORK, '08-finale.mp4'), duration: 7.6, category: 'combat' },
  end: { path: join(WORK, '09-end.mp4'), duration: 2.1, category: 'brand' },
};
for (const [id, block] of Object.entries(baseBlocks)) requireFile(block.path, id);

const cinematicNames = [
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
];
const cinematicFiles = cinematicNames.map((name) =>
  requireFile(join(CINEMATIC_DIR, name), name));
const mapFiles = [
  '01_verdant.webm', '02_desert.webm', '03_winter.webm', '04_urban.webm',
  '05_autumn.webm', '06_steppe.webm', '07_railyard.webm', '08_fjord.webm',
  '09_delta.webm', '10_coastal.webm',
].map((name) => requireFile(join(MAP_DIR, name), name));

function encodeGallery() {
  const output = join(WORK, '07-gallery-only.mp4');
  const source = requireFile(join(UI_DIR, 'gallery.webm'), 'Gallery recording');
  const overlay = requireFile(join(WORK, 'overlay-gallery.png'), 'Gallery feature label');
  ffmpeg([
    '-ss', '0.25', '-t', '3.4', '-i', source,
    '-loop', '1', '-framerate', String(FPS), '-t', '3.4', '-i', overlay,
    '-filter_complex',
    `[0:v]setpts=PTS-STARTPTS,${grade}[g];` +
      '[1:v]format=rgba[ov];[g][ov]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map', '[v]', '-an', '-t', '3.4',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  ], 'encode Gallery-only chapter');
  return { path: output, duration: 3.4, category: 'creator' };
}

function encodeMapTour() {
  const output = join(WORK, '01-entry-extended.mp4');
  const duration = 5.4;
  const perMap = duration / mapFiles.length;
  const args = mapFiles.flatMap((path) => ['-i', path]);
  args.push(
    '-loop', '1', '-framerate', String(FPS), '-t', String(duration),
    '-i', requireFile(join(WORK, 'overlay-entry.png'), 'Battlefields label'),
  );
  const filters = mapFiles.map((_, index) => {
    // Every source follows the same deterministic rail. Slightly staggered
    // positions reveal a different part of that rail without changing its
    // motion direction or ending on a parked camera.
    const start = 0.08 + (index % 3) * 0.05;
    return `[${index}:v]trim=start=${start}:duration=0.78,` +
      `setpts=(PTS-STARTPTS)*${(perMap / 0.78).toFixed(6)},${grade}[m${index}]`;
  });
  filters.push(
    `${mapFiles.map((_, index) => `[m${index}]`).join('')}concat=n=${mapFiles.length}:v=1:a=0[rail]`,
    `[${mapFiles.length}:v]format=rgba[ov]`,
    '[rail][ov]overlay=0:0:format=auto,format=yuv420p[v]',
  );
  args.push(
    '-filter_complex', filters.join(';'), '-map', '[v]', '-an', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  );
  ffmpeg(args, 'encode extended continuous battlefield tour');
  return { path: output, duration, category: 'maps' };
}

function encodeAlternateReel({ id, overlay, clips, category }) {
  const output = join(WORK, `${id}.mp4`);
  const args = clips.flatMap((clip) => ['-i', cinematicFiles[clip.index]]);
  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0) -
    (clips.length - 1) * INNER_CUT_TRIM_S;
  args.push(
    '-loop', '1', '-framerate', String(FPS), '-t', totalDuration.toFixed(3),
    '-i', requireFile(join(WORK, `overlay-${overlay}.png`), `${overlay} label`),
  );
  const filters = clips.map((clip, index) => {
    const sourceDuration = clip.sourceDuration;
    const displayedDuration = clip.duration -
      (index < clips.length - 1 ? INNER_CUT_TRIM_S : 0);
    const speed = clip.duration / sourceDuration;
    return `[${index}:v]trim=start=${clip.start}:duration=${sourceDuration},` +
      `setpts=(PTS-STARTPTS)*${speed.toFixed(6)},fps=${FPS},` +
      `trim=duration=${displayedDuration.toFixed(3)},setpts=PTS-STARTPTS,${grade}[r${index}]`;
  });
  filters.push(
    `${clips.map((_, index) => `[r${index}]`).join('')}concat=n=${clips.length}:v=1:a=0[reel]`,
    `[${clips.length}:v]format=rgba[ov]`,
    '[reel][ov]overlay=0:0:format=auto,format=yuv420p[v]',
  );
  args.push(
    '-filter_complex', filters.join(';'), '-map', '[v]', '-an', '-t', totalDuration.toFixed(3),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', output,
  );
  ffmpeg(args, `encode ${id}`);
  return { path: output, duration: totalDuration, category };
}

const generatedBlocks = POST_ONLY ? {
  gallery: {
    path: requireFile(join(WORK, '07-gallery-only.mp4')), duration: 3.4, category: 'creator',
  },
  mapsExtended: {
    path: requireFile(join(WORK, '01-entry-extended.mp4')), duration: 5.4, category: 'maps',
  },
  portraitAlt: {
    path: requireFile(join(WORK, '10-library-alt.mp4')), duration: 5.4, category: 'fleet',
  },
  actionAlt: {
    path: requireFile(join(WORK, '11-combat-alt.mp4')), duration: 5.4, category: 'combat',
  },
  movementAlt: {
    path: requireFile(join(WORK, '12-movement-alt.mp4')), duration: 5, category: 'movement',
  },
} : {
  gallery: encodeGallery(),
  mapsExtended: encodeMapTour(),
  portraitAlt: encodeAlternateReel({
    id: '10-library-alt', overlay: 'library', category: 'fleet',
    clips: [0, 3, 4, 5, 8, 9, 10].map((index) => ({
      index, start: 1.35, sourceDuration: 0.72, duration: 0.857143,
    })),
  }),
  actionAlt: encodeAlternateReel({
    id: '11-combat-alt', overlay: 'combatA', category: 'combat',
    clips: [0, 3, 7, 8, 10, 12].map((index, position) => ({
      index, start: 9.3, sourceDuration: 0.78, duration: position === 5 ? 0.9 : 1,
    })),
  }),
  movementAlt: encodeAlternateReel({
    id: '12-movement-alt', overlay: 'combatB', category: 'movement',
    // The winter Merkava/AMX-40 rail replaces the Caldera take here: the
    // latter spends its selected midpoint behind trees before reacquiring the
    // vehicle, which reads as an accidental landscape shot in a fast montage.
    clips: [5, 9, 12, 17, 15].map((index) => ({
      index, start: 7.05, sourceDuration: 0.72, duration: 1.08,
    })),
  }),
};
const blocks = { ...baseBlocks, ...generatedBlocks };

const families = {
  legend: [
    ['Legend Synth Drone.caf', 0.36, 'highpass=f=35,lowpass=f=6000'],
    ['Legend Dark Synth Pad.caf', 0.34, 'highpass=f=80'],
    ['Legend Sub Bass.caf', 0.25, 'lowpass=f=180'],
  ],
  epoch: [
    ['Epoch Beat.caf', 0.40, 'highpass=f=38'],
    ['Epoch Orchestra Hits.caf', 0.52, 'highpass=f=75'],
    ['Epoch Sub Bass.caf', 0.34, 'lowpass=f=210'],
    ['Epoch Synth Arp.caf', 0.23, 'highpass=f=150'],
    ['Epoch Synth Lead.caf', 0.17, 'highpass=f=180'],
  ],
  rise: [
    ['Rise Up Strings and Brass.caf', 0.52, 'highpass=f=70'],
    ['Rise Up Piano.caf', 0.31, 'highpass=f=120'],
    ['Rise Up Plucks.caf', 0.16, 'highpass=f=220'],
    ['Rise Up Bass.caf', 0.21, 'lowpass=f=230'],
  ],
  stone: [
    ['Stone Cold Beat.caf', 0.44, 'highpass=f=38'],
    ['Stone Cold Orchestra Hits.caf', 0.62, 'highpass=f=65'],
    ['Stone Cold Sub Bass.caf', 0.36, 'lowpass=f=220'],
    ['Stone Cold Warped Piano.caf', 0.24, 'highpass=f=105'],
    ['Stone Cold Synth Bass.caf', 0.20, 'highpass=f=130'],
  ],
};

function renderScore(variant) {
  const output = join(MUSIC_DIR, `${variant.slug}.wav`);
  const inputs = [];
  const filters = [];
  const labels = [];
  let inputIndex = 0;
  let offset = 0;
  for (const section of variant.score) {
    for (const [file, volume, tone] of families[section.family]) {
      const path = requireFile(join(LOOP_DIR, file), `licensed score stem ${file}`);
      inputs.push('-stream_loop', '-1', '-i', path);
      const fade = Math.min(0.35, section.duration / 5);
      const fadeOutAt = section.duration - fade;
      const label = `s${inputIndex}`;
      filters.push(
        `[${inputIndex}:a]atrim=duration=${section.duration},asetpts=PTS-STARTPTS,` +
        `${tone},volume=${volume},afade=t=in:st=0:d=${fade.toFixed(3)},` +
        `afade=t=out:st=${fadeOutAt.toFixed(3)}:d=${fade.toFixed(3)},` +
        `adelay=${Math.round(offset * 1000)}|${Math.round(offset * 1000)},` +
        `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[${label}]`,
      );
      labels.push(`[${label}]`);
      inputIndex += 1;
    }
    offset += section.duration;
  }
  if (!closeEnough(offset, DURATION, 0.001)) {
    throw new Error(`${variant.slug}: score sections total ${offset}, expected ${DURATION}`);
  }
  filters.push(
    `${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0,` +
    `atrim=duration=${DURATION},afade=t=in:st=0:d=0.35,afade=t=out:st=39.15:d=0.85,` +
    'alimiter=limit=.88:level=false[outa]',
  );
  ffmpeg([
    ...inputs, '-filter_complex', filters.join(';'), '-map', '[outa]',
    '-t', String(DURATION), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', output,
  ], `arrange ${variant.title} score`);
  return output;
}

function item(block, duration, start = 0) {
  return { block, duration, start };
}

const variants = [
  {
    number: 1, slug: 'balanced', title: 'Balanced Feature Cut',
    approach: 'The broadest overview: brand, maps, combat, HUD, creation tools, fleet, Gallery, and a sustained finale.',
    timeline: [
      item('opening', 3.2), item('maps', 2.4), item('combatA', 5.5), item('hud', 2.5),
      item('combatB', 4.9), item('studio', 3.3), item('library', 5.25),
      item('gallery', 3.4), item('finale', 7.45), item('end', 2.1),
    ],
    score: [
      { family: 'legend', duration: 5 }, { family: 'epoch', duration: 12 },
      { family: 'rise', duration: 13 }, { family: 'stone', duration: 10 },
    ],
  },
  {
    number: 2, slug: 'combat-first', title: 'Combat-First Cold Open',
    approach: 'Opens directly on armored combat, introduces the brand inside the action, then expands into the full product.',
    timeline: [
      item('actionAlt', 4), item('opening', 3.2), item('combatA', 5.5), item('hud', 2.5),
      item('maps', 2.4), item('movementAlt', 4), item('studio', 3), item('library', 4),
      item('gallery', 2.5), item('finale', 6.8), item('end', 2.1),
    ],
    score: [
      { family: 'epoch', duration: 15 }, { family: 'rise', duration: 16 },
      { family: 'stone', duration: 9 },
    ],
  },
  {
    number: 3, slug: 'fleet-showcase', title: 'Modern Fleet Showcase',
    approach: 'Leads with the breadth and silhouette variety of the first-party modern fleet before proving it in combat.',
    timeline: [
      item('opening', 3.2), item('library', 5.25), item('portraitAlt', 5.4),
      item('studio', 3.3), item('gallery', 3.4), item('maps', 2.4), item('combatB', 4.9),
      item('combatA', 4), item('hud', 2.5), item('finale', 3.55), item('end', 2.1),
    ],
    score: [
      { family: 'rise', duration: 21 }, { family: 'epoch', duration: 13 },
      { family: 'stone', duration: 6 },
    ],
  },
  {
    number: 4, slug: 'battlefield-tour', title: 'Battlefield Tour',
    approach: 'Uses the longer continuous rail to foreground map variety, then demonstrates how tanks read across those environments.',
    timeline: [
      item('opening', 3.2), item('mapsExtended', 5.4), item('combatB', 4.9),
      item('portraitAlt', 4.5), item('combatA', 4.5), item('hud', 2.5),
      item('library', 4), item('studio', 2.5), item('gallery', 2.5),
      item('finale', 3.9), item('end', 2.1),
    ],
    score: [
      { family: 'legend', duration: 4 }, { family: 'rise', duration: 12 },
      { family: 'epoch', duration: 18 }, { family: 'stone', duration: 6 },
    ],
  },
  {
    number: 5, slug: 'creator-studio', title: 'Creator and Studio Cut',
    approach: 'Puts Garage, Leclerc XLR Scene Studio, Gallery, and tank presentation ahead of the combat payoff.',
    timeline: [
      item('opening', 3.2), item('studio', 3.3), item('gallery', 3.4),
      item('portraitAlt', 5.4), item('library', 5.25), item('maps', 2.4),
      item('combatB', 4.9), item('hud', 2.5), item('combatA', 3.5),
      item('finale', 4.05), item('end', 2.1),
    ],
    score: [
      { family: 'rise', duration: 22 }, { family: 'epoch', duration: 12 },
      { family: 'stone', duration: 6 },
    ],
  },
  {
    number: 6, slug: 'tactical-hud', title: 'Tactical Battle Cut',
    approach: 'Frames movement, stabilized fire, the live scope/HUD encounter, and damage simulation as one tactical sequence.',
    timeline: [
      item('actionAlt', 3), item('opening', 3.2), item('combatB', 4.9),
      item('hud', 2.5), item('combatA', 5.5), item('movementAlt', 5),
      item('maps', 2.4), item('library', 4), item('studio', 2.5),
      item('gallery', 2), item('finale', 2.9), item('end', 2.1),
    ],
    score: [
      { family: 'epoch', duration: 18 }, { family: 'stone', duration: 6 },
      { family: 'rise', duration: 12 }, { family: 'stone', duration: 4 },
    ],
  },
  {
    number: 7, slug: 'explosive', title: 'Explosive Action Montage',
    approach: 'The fastest and most aggressive option: centered impacts, destruction, tracked motion, and the full action finale.',
    timeline: [
      item('actionAlt', 5.4), item('combatA', 5.5), item('opening', 3.2),
      item('finale', 7.6), item('movementAlt', 5), item('library', 3),
      item('maps', 2.4), item('hud', 2.5), item('studio', 1.3),
      item('gallery', 2), item('end', 2.1),
    ],
    score: [
      { family: 'epoch', duration: 11 }, { family: 'stone', duration: 11 },
      { family: 'rise', duration: 8 }, { family: 'epoch', duration: 4 },
      { family: 'stone', duration: 6 },
    ],
  },
  {
    number: 8, slug: 'prestige', title: 'Prestige Cinematic Cut',
    approach: 'A more spacious, premium cadence built around clean tank portraits and movement before a concise combat climax.',
    timeline: [
      item('opening', 3.2), item('portraitAlt', 5.4), item('library', 5.25),
      item('studio', 3.3), item('gallery', 3.4), item('maps', 2.4),
      item('combatB', 4.9), item('movementAlt', 5), item('combatA', 2),
      item('finale', 3.05), item('end', 2.1),
    ],
    score: [
      { family: 'legend', duration: 5 }, { family: 'rise', duration: 26 },
      { family: 'epoch', duration: 5 }, { family: 'stone', duration: 4 },
    ],
  },
];

function validateTimeline(variant) {
  const total = variant.timeline.reduce((sum, entry) => sum + entry.duration, 0);
  if (!closeEnough(total, DURATION, 0.001)) {
    throw new Error(`${variant.slug}: timeline totals ${total}, expected ${DURATION}`);
  }
  const liveTotal = variant.timeline
    .filter((entry) => entry.block !== 'end')
    .reduce((sum, entry) => sum + entry.duration, 0);
  if (!closeEnough(liveTotal, CONTENT_DURATION, 0.001)) {
    throw new Error(`${variant.slug}: live content totals ${liveTotal}, expected ${CONTENT_DURATION}`);
  }
  for (const entry of variant.timeline) {
    const block = blocks[entry.block];
    if (!block) throw new Error(`${variant.slug}: unknown block ${entry.block}`);
    if (entry.start + entry.duration > block.duration + 0.001) {
      throw new Error(
        `${variant.slug}: ${entry.block} requests ${entry.start + entry.duration}s ` +
        `from a ${block.duration}s source`,
      );
    }
  }
}

function renderVariant(variant) {
  validateTimeline(variant);
  const score = renderScore(variant);
  const output = join(
    OUT_DIR,
    `${String(variant.number).padStart(2, '0')}-${variant.slug}.mp4`,
  );
  const inputs = variant.timeline.flatMap((entry) => ['-i', blocks[entry.block].path]);
  inputs.push('-i', score);
  const filters = variant.timeline.map((entry, index) =>
    `[${index}:v]trim=start=${entry.start}:duration=${entry.duration},` +
    `setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p[v${index}]`,
  );
  filters.push(
    `${variant.timeline.map((_, index) => `[v${index}]`).join('')}` +
      `concat=n=${variant.timeline.length}:v=1:a=0,trim=duration=${DURATION},` +
      'setpts=PTS-STARTPTS,format=yuv420p[outv]',
  );
  const audioIndex = variant.timeline.length;
  filters.push(
    `[${audioIndex}:a]atrim=duration=${DURATION},asetpts=PTS-STARTPTS,` +
      'aformat=channel_layouts=stereo,loudnorm=I=-14:LRA=9:TP=-1.0,' +
      'alimiter=limit=.94:level=false,volume=-1.5dB[outa]',
  );
  ffmpeg([
    ...inputs, '-filter_complex', filters.join(';'),
    '-map', '[outv]', '-map', '[outa]', '-t', String(DURATION),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', output,
  ], `render ${variant.title}`);
  return output;
}

const outputs = variants.map((variant) => {
  const path = join(
    OUT_DIR,
    `${String(variant.number).padStart(2, '0')}-${variant.slug}.mp4`,
  );
  return {
    variant,
    path: POST_ONLY ? requireFile(path, `${variant.title} master`) : renderVariant(variant),
  };
});

for (const { variant, path } of outputs) {
  const probe = JSON.parse(run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_frames',
    '-show_entries', 'format=duration', '-of', 'json', path,
  ], `probe ${variant.title}`));
  const stream = probe.streams?.[0] || {};
  const duration = Number(probe.format?.duration);
  if (!closeEnough(duration, DURATION, 0.06) || stream.width !== WIDTH ||
      stream.height !== HEIGHT || stream.r_frame_rate !== '60/1' ||
      stream.avg_frame_rate !== '60/1' || Number(stream.nb_frames) !== 2400) {
    throw new Error(`${variant.slug}: invalid master properties ${JSON.stringify(probe)}`);
  }
}

const contactSheet = join(OUT_DIR, 'contact-sheet.jpg');
const contactInputs = outputs.flatMap(({ path }) => ['-ss', '10', '-i', path]);
const contactFilters = outputs.map((_, index) =>
  `[${index}:v]scale=640:360,format=yuv420p[f${index}]`,
);
contactFilters.push(
  `${outputs.map((_, index) => `[f${index}]`).join('')}xstack=inputs=8:` +
  'layout=0_0|640_0|1280_0|1920_0|0_360|640_360|1280_360|1920_360[v]',
);
ffmpeg([
  ...contactInputs, '-filter_complex', contactFilters.join(';'),
  '-map', '[v]', '-frames:v', '1', '-q:v', '2', contactSheet,
], 'render eight-variant contact sheet');

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  durationSeconds: DURATION,
  width: WIDTH,
  height: HEIGHT,
  fps: FPS,
  documentationIncluded: false,
  sourcePolicy: 'current first-party deterministic UI, map-rail, and Direct Duel captures only',
  audioPolicy: 'one synchronized licensed-loop score arrangement per cut; no separately layered SFX',
  cameraShakePolicy: 'shake is inherited only from selected visible impact/explosion capture windows',
  variants: outputs.map(({ variant, path }) => ({
    number: variant.number,
    slug: variant.slug,
    title: variant.title,
    approach: variant.approach,
    output: path.replace(`${ROOT}/`, ''),
    timeline: variant.timeline,
    score: variant.score,
  })),
  contactSheet: contactSheet.replace(`${ROOT}/`, ''),
};
writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[promo-variants] complete: ${OUT_DIR}`);
