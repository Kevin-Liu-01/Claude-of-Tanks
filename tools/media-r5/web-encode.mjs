// web-encode.mjs — the site's videos at the weight they need (owner 2026-10-14: "we dont need them all to be super duuper
// highh quality 4k, they can be good quality but shouldnt be too heavy on storage or take a long time to load in"; the
// coordinator: VMAF 93 at least for the loops and the reel against their masters, 90 for the 960 px loops, the bitrate
// dropped only while that holds). A file is a constrained-quality encode (VP9 two-pass with -crf and its bitrate cap
// as -b:v, or x264 -crf under a -maxrate cap) at the highest CRF of a short ladder whose picture holds the floor: VMAF's
// mean over the frames at least `floor` and no frame under floor - 20, scored at the file's own size against its master
// scaled there (lanczos), frame by frame on the master's rate (a webm's millisecond timestamps drift off a 30 fps
// master's, and libvmaf's own sync then paired neighbours: s04 scored 52 where it scores 80). CRF tracks VMAF across
// content (2026-10-14: VP9 CRF 40 scored 92.7 on s07 at 3.4 Mbit/s and 93.0 on s04 at 9.5 Mbit/s), so the ladder,
// searched from its middle, costs a file one or two encodes. Footage the floor cannot reach under the cap (smoke and
// fire over the whole frame) ships at the cap if it holds `capFloor` there (the coordinator's 90 for the heaviest action
// loops), marked `capped`. The sound, if any, is muxed after: Opus in a webm, AAC in an mp4.
//   import { webEncode } from './web-encode.mjs';
//   webEncode({ src, out, codec: 'vp9' | 'h264', size: [1920, 1080], audio: 'keep' | 'none', floor: 93, capFloor: 90,
//     crfs: [34, 37, 40, 43, 46], capKbps: 8000 })
//     -> { crf, kbps, vmaf: { mean, harmonic, min }, bytes, tried: [[crf, kbps, mean, min], ...], capped? }
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ff = (args) => execFileSync('nice', ['-n', '10', 'ffmpeg', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
const probe = (file, entries) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', entries, '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();
const hasAudio = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim().length > 0;
const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

function encode({ src, out, codec, size: [w, h], crf, capKbps, work }) {
  const vf = `scale=${w}:${h}:flags=lanczos,format=yuv420p`, log = join(work, `pass-${crf}`);
  if (codec === 'vp9') {
    const enc = ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', `${capKbps}k`, '-row-mt', '1', '-tile-columns', w >= 1280 ? '2' : '1',
      '-deadline', 'good', '-auto-alt-ref', '1', '-lag-in-frames', '25', '-g', '240'];
    ff(['-i', src, '-an', '-vf', vf, ...enc, '-cpu-used', '4', '-pass', '1', '-passlogfile', log, '-f', 'webm', '/dev/null']);
    ff(['-i', src, '-an', '-vf', vf, ...enc, '-cpu-used', '3', '-pass', '2', '-passlogfile', log, out]);
  } else {
    ff(['-i', src, '-an', '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-crf', String(crf), '-maxrate', `${capKbps}k`,
      '-bufsize', `${capKbps * 2}k`, '-g', '120', '-movflags', '+faststart', out]);
  }
}

function vmaf({ dist, src, size: [w, h], work, tag }) {
  const rate = probe(src, 'stream=r_frame_rate'), log = join(work, `vmaf-${tag}.json`);
  ff(['-i', dist, '-i', src, '-lavfi',
    `[0:v]fps=${rate},scale=${w}:${h}:flags=bicubic,setpts=PTS-STARTPTS[d];[1:v]fps=${rate},scale=${w}:${h}:flags=lanczos,setpts=PTS-STARTPTS[r];` +
    `[d][r]libvmaf=log_fmt=json:log_path=${log}:n_threads=6`, '-f', 'null', '-']);
  const p = JSON.parse(readFileSync(log, 'utf8')).pooled_metrics.vmaf;
  return { mean: +p.mean.toFixed(2), harmonic: +p.harmonic_mean.toFixed(2), min: +p.min.toFixed(2) };
}

/** One file at the highest ladder CRF that holds the floor (see the head). Throws when even the lowest misses it. */
export function webEncode({ src, out, codec, size, audio = 'none', floor, capFloor = floor, crfs, capKbps }) {
  const ladder = [...crfs].sort((a, b) => a - b), work = `${out}.ladder`, ext = codec === 'vp9' ? 'webm' : 'mp4', secs = seconds(src);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const tried = [], scored = new Map();
  const at = (i) => {
    if (!scored.has(i)) {
      const crf = ladder[i], file = join(work, `v-${crf}.${ext}`);
      encode({ src, out: file, codec, size, crf, capKbps, work });
      const v = vmaf({ dist: file, src, size, work, tag: crf }), kbps = Math.round(statSync(file).size * 8 / secs / 1000);
      scored.set(i, { crf, kbps, file, v, ok: v.mean >= floor && v.min >= floor - 20 });
      tried.push([crf, kbps, v.mean, v.min]);
    }
    return scored.get(i);
  };
  // the highest passing CRF (the lightest file): from the ladder's middle, up while it holds, down while it does not
  let i = Math.floor((ladder.length - 1) / 2), best = null;
  if (at(i).ok) { best = at(i); while (i + 1 < ladder.length && at(i + 1).ok) best = at(++i); }
  else { while (i > 0 && !at(i - 1).ok) i--; best = i > 0 ? at(i - 1) : null; }
  let capped = false;
  if (!best && capFloor < floor && at(0).v.mean >= capFloor && at(0).v.min >= capFloor - 20) { best = at(0); capped = true; }
  if (!best) throw new Error(`${out}: no CRF on the ladder (${ladder.join(', ')}, cap ${capKbps} kbit/s) holds VMAF ${floor}${capFloor < floor ? ` (${capFloor} at the cap)` : ''}: ${JSON.stringify(tried)}`);
  mkdirSync(dirname(out), { recursive: true });
  const muxed = join(work, `out.${ext}`);
  if (audio === 'keep' && hasAudio(src)) {
    ff(['-i', best.file, '-i', src, '-map', '0:v', '-map', '1:a:0', '-c:v', 'copy',
      ...(codec === 'vp9' ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']), '-shortest', muxed]);
  } else renameSync(best.file, muxed);
  renameSync(muxed, out);
  rmSync(work, { recursive: true, force: true });
  return { crf: best.crf, kbps: best.kbps, vmaf: best.v, bytes: statSync(out).size, tried, ...(capped ? { capped } : {}) };
}
