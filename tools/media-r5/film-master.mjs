#!/usr/bin/env node
// ProRes film masters from the frames cinema kept, made outside the GPU lease (launch night, 2026-10-09: inside the lease
// the master's encode and its counted probe held the shared GPU 3–7.5 minutes a take on a loaded machine, as long as the
// frames themselves). For each take's complete film rows: the master from <stem>/frame-%05d.png, with cinema's settings
// (ProRes 422 HQ, BT.709 limited range), checked frame by frame like cinema checks it; then the frames go, except the
// review frames the receipt records. A row whose frames are not all there is reported and left alone.
//   node tools/media-r5/film-master.mjs <rendersRoot> <id,...> [--kind=films]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const [renders, idList = '', ...rest] = process.argv.slice(2);
if (!renders) throw new Error('usage: film-master.mjs <rendersRoot> <id,...> [--kind=films]');
const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const kind = flags.kind ?? 'films';
// tools/media-production/cinema.mjs: colorTags, frameName, the master's filter and its verification
const colorTags = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
const frameName = (index) => `frame-${String(index).padStart(5, '0')}.png`;
const toVideo = 'scale=out_color_matrix=bt709:out_range=tv';
const tagged = 'setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709';
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
  '-show_entries', 'stream=codec_name,width,height,nb_read_frames', '-of', 'json', file], { encoding: 'utf8' }));
let made = 0, failed = 0;
for (const id of idList.split(',').filter(Boolean)) {
  const out = join(renders, kind, id), receiptFile = join(out, 'cinema-receipt.json');
  if (!existsSync(receiptFile)) { console.log(`[master] ${id}: no receipt`); continue; }
  const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
  for (const row of receipt.films ?? []) {
    const frames = Array.isArray(row.frames) ? row.frames.length : 0;
    if (!row.complete || !frames) continue;
    const dir = join(out, 'films', row.stem), master = join(out, 'films', `${row.stem}-master.mov`);
    if (existsSync(master)) continue;
    let missing = 0;
    for (let i = 0; i < frames; i++) if (!existsSync(join(dir, frameName(i)))) missing++;
    if (missing) { console.log(`[master] ${id} ${row.stem}: ${missing} of ${frames} frames missing; left alone`); failed++; continue; }
    const part = master.replace(/\.mov$/, '.part.mov');
    try {
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(row.fps), '-i', join(dir, 'frame-%05d.png'),
        '-frames:v', String(frames), '-vf', `${toVideo},format=yuv422p10le,${tagged}`, '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0',
        '-pix_fmt', 'yuv422p10le', ...colorTags, '-f', 'mov', part]);
      const stream = probe(part).streams[0];
      if (Number(stream.nb_read_frames) !== frames || stream.width !== row.width || stream.height !== row.height || stream.codec_name !== 'prores') {
        throw new Error(`verification failed: ${JSON.stringify(stream)}`);
      }
      renameSync(part, master);
    } catch (error) {
      if (existsSync(part)) unlinkSync(part);
      console.log(`[master] ${id} ${row.stem}: ${String(error.message ?? error).split('\n')[0]}`);
      failed++;
      continue;
    }
    const keep = new Set((row.reviewFrames ?? []).map((f) => f.path));
    for (let i = 0; i < frames; i++) { const path = join(dir, frameName(i)); if (!keep.has(path)) unlinkSync(path); }
    console.log(`[master] ${id} ${row.stem}: ${frames} frames -> ${master.split('/').slice(-3).join('/')}`);
    made++;
  }
}
console.log(`[master] ${made} made, ${failed} failed`);
if (failed) process.exitCode = 1;
