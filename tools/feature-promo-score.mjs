// Assemble the 40-second feature-promo score from licensed Apple Loops.
//
// This is a real stem arrangement—not synthesized test tones: four coherent
// families supply drums, bass, orchestral hits, strings/brass, piano, synth
// lead, and arpeggios. Apple licenses the GarageBand loop library for use in
// original music productions; the raw loops are never copied into the repo.
//
// Usage:
//   node tools/feature-promo-score.mjs
//   node tools/feature-promo-score.mjs --out shots/promo-40s/music/score.wav

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LOOP_ROOT = '/Library/Audio/Apple Loops/Apple/01 Hip Hop';
const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg')
  ? '/opt/homebrew/bin/ffmpeg'
  : 'ffmpeg';
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const OUT = resolve(ROOT, option(
  'out',
  'shots/promo-40s/music/claude-of-tanks-original-score.wav',
));

const stem = (file, section, volume, tone = '') => ({
  path: join(LOOP_ROOT, file), section, volume, tone,
});
const sections = {
  // Garage/logo reveal into the map rail: restrained and ominous.
  legend: { delayMs: 0, duration: 5.35, fadeIn: 0.45, fadeOut: 0.50 },
  // Combat reels + live HUD: a full rhythmic drop. The beat thins while the
  // player scopes, then returns on the 11.52 s kill.
  epoch: { delayMs: 4850, duration: 12.65, fadeIn: 0.25, fadeOut: 0.50 },
  // Scene Studio + modern library + Gallery/Docs: orchestral, spacious, and readable.
  rise: { delayMs: 17000, duration: 13.80, fadeIn: 0.40, fadeOut: 0.50 },
  // Every Map finale through the end lockup: complete beat and brass climax.
  stone: { delayMs: 30300, duration: 9.70, fadeIn: 0.40, fadeOut: 0.90 },
};
const stems = [
  stem('Legend Synth Drone.caf', 'legend', 0.36, 'highpass=f=35,lowpass=f=6000'),
  stem('Legend Dark Synth Pad.caf', 'legend', 0.34, 'highpass=f=80'),
  stem('Legend Sub Bass.caf', 'legend', 0.25, 'lowpass=f=180'),

  stem('Epoch Beat.caf', 'epoch',
    "if(between(t,5.50,6.70),0.14,0.40)", 'highpass=f=38'),
  stem('Epoch Orchestra Hits.caf', 'epoch', 0.52, 'highpass=f=75'),
  stem('Epoch Sub Bass.caf', 'epoch', 0.34, 'lowpass=f=210'),
  stem('Epoch Synth Arp.caf', 'epoch', 0.23, 'highpass=f=150'),
  stem('Epoch Synth Lead.caf', 'epoch', 0.17, 'highpass=f=180'),

  stem('Rise Up Strings and Brass.caf', 'rise', 0.52, 'highpass=f=70'),
  stem('Rise Up Piano.caf', 'rise', 0.31, 'highpass=f=120'),
  stem('Rise Up Plucks.caf', 'rise', 0.16, 'highpass=f=220'),
  stem('Rise Up Bass.caf', 'rise', 0.21, 'lowpass=f=230'),

  stem('Stone Cold Beat.caf', 'stone', 0.44, 'highpass=f=38'),
  stem('Stone Cold Orchestra Hits.caf', 'stone', 0.62, 'highpass=f=65'),
  stem('Stone Cold Sub Bass.caf', 'stone', 0.36, 'lowpass=f=220'),
  stem('Stone Cold Warped Piano.caf', 'stone', 0.24, 'highpass=f=105'),
  stem('Stone Cold Synth Bass.caf', 'stone', 0.20, 'highpass=f=130'),
];

for (const item of stems) {
  if (!existsSync(item.path)) {
    throw new Error(
      `missing licensed Apple Loop: ${item.path}\n` +
      'Install the GarageBand sound library before regenerating the score.',
    );
  }
}
mkdirSync(dirname(OUT), { recursive: true });

const inputs = stems.flatMap((item) => ['-i', item.path]);
const filters = stems.map((item, index) => {
  const section = sections[item.section];
  const fadeOutAt = section.duration - section.fadeOut;
  return `[${index}:a]atrim=duration=${section.duration},asetpts=PTS-STARTPTS,` +
    `${item.tone ? `${item.tone},` : ''}` +
    `volume='${item.volume}',` +
    `afade=t=in:st=0:d=${section.fadeIn},` +
    `afade=t=out:st=${fadeOutAt.toFixed(2)}:d=${section.fadeOut},` +
    `adelay=${section.delayMs}|${section.delayMs},` +
    `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[s${index}]`;
});
filters.push(
  `${stems.map((_, index) => `[s${index}]`).join('')}` +
  `amix=inputs=${stems.length}:duration=longest:normalize=0,` +
  'atrim=duration=40,afade=t=out:st=39.10:d=0.90,' +
  'alimiter=limit=.88:level=false[outa]',
);

const result = spawnSync(FFMPEG, [
  '-hide_banner', '-loglevel', 'error', '-y',
  ...inputs,
  '-filter_complex', filters.join(';'),
  '-map', '[outa]', '-t', '40', '-ar', '48000', '-ac', '2',
  '-c:a', 'pcm_s24le', OUT,
], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (result.status !== 0) {
  throw new Error(`feature-promo score render failed\n${result.stderr.trim()}`);
}
console.log(`[feature-promo-score] complete: ${OUT}`);
