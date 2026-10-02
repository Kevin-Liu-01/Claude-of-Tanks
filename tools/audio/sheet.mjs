#!/usr/bin/env node
// tools/audio/sheet.mjs — contact sheet (spectrogram + waveform per file) for
// any shipped audio files, for visual review of mastered assets.
//
//   node tools/audio/sheet.mjs out.png public/audio/sfx/weapons/gun_120_close_0.webm …

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { ffmpeg } from './pcm.mjs';

const [out, ...files] = process.argv.slice(2);
if (!out || !files.length) {
  console.log('usage: sheet.mjs out.png file…');
  process.exit(1);
}
const tmp = mkdtempSync(join(tmpdir(), 'cot-sheet-'));
const parts = files.map((file, i) => {
  const png = join(tmp, `${i}.png`);
  console.log(`${i}: ${basename(file)}`);
  ffmpeg(['-i', file, '-filter_complex',
    '[0:a]aformat=channel_layouts=mono,asplit=2[a][b];[a]showspectrumpic=s=760x170:legend=0:scale=log:fscale=log:color=intensity[s];[b]showwavespic=s=760x50:colors=white[w];[s][w]vstack=2[o]',
    '-map', '[o]', png]);
  return png;
});
ffmpeg([...parts.flatMap((p) => ['-i', p]), '-filter_complex', `${parts.map((_, i) => `[${i}:v]`).join('')}vstack=${parts.length}[o]`, '-map', '[o]', out]);
rmSync(tmp, { recursive: true, force: true });
console.log(out);
