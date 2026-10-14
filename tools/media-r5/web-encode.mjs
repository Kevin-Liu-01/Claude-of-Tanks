// web-encode.mjs — the site's videos at the weight they need (owner 2026-10-14: "we dont need them all to be super duuper
// highh quality 4k, they can be good quality but shouldnt be too heavy on storage or take a long time to load in"; the
// coordinator: VMAF 93 at least for the loops and the reel against their masters, 90 for the 960 px loops, the bitrate
// dropped only while that holds). A file is a two-pass encode at the lowest rate of a short ladder whose picture holds
// the floor: VMAF's mean over the frames at least `floor` and no frame under floor - 20, scored at the file's own size
// against its master scaled there (lanczos), frame by frame on the master's rate (a webm's millisecond timestamps drift off a
// 30 fps master's, and libvmaf's own sync then paired neighbours: s04 scored 52 where it scores 80). The ladder is searched from its middle, so a file costs two or
// three encodes. The sound, if any, is muxed after: Opus in a webm, AAC in an mp4.
//   import { webEncode } from './web-encode.mjs';
//   webEncode({ src, out, codec: 'vp9' | 'h264', size: [1920, 1080], audio: 'keep' | 'none', floor: 93, rates: [4500, 3600, 2900, 2300, 1800] })
//     -> { kbps, vmaf: { mean, harmonic, min }, bytes, tried: [[kbps, mean, min], ...] }
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ff = (args) => execFileSync('nice', ['-n', '10', 'ffmpeg', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
const rateOf = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();
const hasAudio = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim().length > 0;

function encode({ src, out, codec, size: [w, h], kbps, work }) {
  const vf = `scale=${w}:${h}:flags=lanczos,format=yuv420p`, log = join(work, `pass-${kbps}`);
  const enc = codec === 'vp9'
    ? ['-c:v', 'libvpx-vp9', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-minrate', `${Math.round(kbps * 0.5)}k`, '-row-mt', '1',
      '-tile-columns', w >= 1280 ? '2' : '1', '-deadline', 'good', '-auto-alt-ref', '1', '-lag-in-frames', '25', '-g', '240']
    : ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`,
      '-bufsize', `${kbps * 2}k`, '-g', '120', '-movflags', '+faststart'];
  ff(['-i', src, '-an', '-vf', vf, ...enc, ...(codec === 'vp9' ? ['-cpu-used', '4'] : []), '-pass', '1', '-passlogfile', log, '-f', codec === 'vp9' ? 'webm' : 'mp4', '/dev/null']);
  ff(['-i', src, '-an', '-vf', vf, ...enc, ...(codec === 'vp9' ? ['-cpu-used', '3'] : []), '-pass', '2', '-passlogfile', log, out]);
}

function vmaf({ dist, src, size: [w, h], work, tag }) {
  const rate = rateOf(src), log = join(work, `vmaf-${tag}.json`);
  ff(['-i', dist, '-i', src, '-lavfi',
    `[0:v]fps=${rate},scale=${w}:${h}:flags=bicubic,setpts=PTS-STARTPTS[d];[1:v]fps=${rate},scale=${w}:${h}:flags=lanczos,setpts=PTS-STARTPTS[r];` +
    `[d][r]libvmaf=log_fmt=json:log_path=${log}:n_threads=6`, '-f', 'null', '-']);
  const p = JSON.parse(readFileSync(log, 'utf8')).pooled_metrics.vmaf;
  return { mean: +p.mean.toFixed(2), harmonic: +p.harmonic_mean.toFixed(2), min: +p.min.toFixed(2) };
}

/** One file at the lowest ladder rate that holds the floor (see the head). Throws when even the top rate misses it. */
export function webEncode({ src, out, codec, size, audio = 'none', floor, rates }) {
  const ladder = [...rates].sort((a, b) => b - a), work = `${out}.ladder`, ext = codec === 'vp9' ? 'webm' : 'mp4';
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const tried = [], scored = new Map();
  const at = (i) => {
    if (!scored.has(i)) {
      const kbps = ladder[i], file = join(work, `v-${kbps}.${ext}`);
      encode({ src, out: file, codec, size, kbps, work });
      const v = vmaf({ dist: file, src, size, work, tag: kbps });
      scored.set(i, { kbps, file, v, ok: v.mean >= floor && v.min >= floor - 20 });
      tried.push([kbps, v.mean, v.min]);
    }
    return scored.get(i);
  };
  // the lowest passing rate: from the ladder's middle, down while it holds, up while it does not
  let i = Math.floor((ladder.length - 1) / 2), best = null;
  if (at(i).ok) { best = at(i); while (i + 1 < ladder.length && at(i + 1).ok) best = at(++i); }
  else { while (i > 0 && !at(i - 1).ok) i--; best = i > 0 ? at(i - 1) : null; }
  if (!best) throw new Error(`${out}: no rate on the ladder (${ladder.join(', ')} kbit/s) holds VMAF ${floor}: ${JSON.stringify(tried)}`);
  mkdirSync(dirname(out), { recursive: true });
  const muxed = join(work, `out.${ext}`);
  if (audio === 'keep' && hasAudio(src)) {
    ff(['-i', best.file, '-i', src, '-map', '0:v', '-map', '1:a:0', '-c:v', 'copy',
      ...(codec === 'vp9' ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']), '-shortest', muxed]);
  } else renameSync(best.file, muxed);
  renameSync(muxed, out);
  rmSync(work, { recursive: true, force: true });
  return { kbps: best.kbps, vmaf: best.v, bytes: statSync(out).size, tried };
}

