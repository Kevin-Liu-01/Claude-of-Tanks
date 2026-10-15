// web-encode.mjs — the site's videos at the weight they need (owner 2026-10-14: "we dont need them all to be super duuper
// highh quality 4k, they can be good quality but shouldnt be too heavy on storage or take a long time to load in"; the
// coordinator: VMAF 93 at least for the loops and the reel against their masters, 90 for the 960 px loops, the bitrate
// dropped only while that holds). A file is a constrained-quality encode (VP9 two-pass with -crf and its bitrate cap
// as -b:v, or x264 -crf under a -maxrate cap), the lightest of a short CRF ladder's rungs tried that hold the floor: VMAF's
// mean over the frames at least `floor` and no frame under floor - 20, scored at the file's own size against its master
// scaled there (lanczos), frame by frame on the master's rate (a webm's millisecond timestamps drift off a 30 fps
// master's, and libvmaf's own sync then paired neighbours: s04 scored 52 where it scores 80). CRF tracks VMAF across
// content (2026-10-14: VP9 CRF 40 scored 92.7 on s07 at 3.4 Mbit/s and 93.0 on s04 at 9.5 Mbit/s), so the ladder,
// searched from its middle, costs a file one or two encodes. Footage the floor cannot reach under the cap (smoke and
// fire over the whole frame) ships at the cap if it holds `capFloor` there (the coordinator's 90 for the heaviest action
// loops, 85 for the 960 px ones), the best-scoring rung tried, marked `capped`. The sound, if any, is muxed after: Opus in a webm, AAC in an mp4.
//   import { webEncode } from './web-encode.mjs';
//   webEncode({ src, out, codec: 'vp9' | 'h264', size: [1920, 1080], audio: 'keep' | 'none', floor: 93, capFloor: 90,
//     shipAtCap: false, crfs: [34, 37, 40, 43, 46], capKbps: 8000 })
//     -> { crf, kbps, vmaf: { mean, harmonic, min }, bytes, tried: [[crf, kbps, mean, min], ...], capped? }
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ff = (args) => execFileSync('nice', ['-n', '10', 'ffmpeg', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
const probe = (file, entries) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', entries, '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();
const hasAudio = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim().length > 0;
const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

function encode({ src, out, codec, size: [w, h], crf, capKbps, cpuUsed = 4, work }) {
  const vf = `scale=${w}:${h}:flags=lanczos,format=yuv420p`, log = join(work, `pass-${crf}`);
  if (codec === 'vp9') {
    const enc = ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', `${capKbps}k`, '-row-mt', '1', '-tile-columns', w >= 1280 ? '2' : '1',
      '-deadline', 'good', '-auto-alt-ref', '1', '-lag-in-frames', '25', '-g', '240'];
    ff(['-i', src, '-an', '-vf', vf, ...enc, '-cpu-used', '4', '-pass', '1', '-passlogfile', log, '-f', 'webm', '/dev/null']);
    ff(['-i', src, '-an', '-vf', vf, ...enc, '-cpu-used', String(cpuUsed), '-pass', '2', '-passlogfile', log, out]);
  } else {
    ff(['-i', src, '-an', '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-crf', String(crf), '-maxrate', `${capKbps}k`,
      '-bufsize', `${capKbps * 2}k`, '-g', '120', '-movflags', '+faststart', out]);
  }
}

function vmaf({ dist, src, size: [w, h], work, tag }) {
  const rate = probe(src, 'stream=r_frame_rate'), log = join(work, `vmaf-${tag}.json`);
  ff(['-i', dist, '-i', src, '-lavfi',
    `[0:v]fps=${rate},scale=${w}:${h}:flags=bicubic,setpts=PTS-STARTPTS[d];[1:v]fps=${rate},scale=${w}:${h}:flags=lanczos,setpts=PTS-STARTPTS[r];` +
    // (every frame scored: scoring every other one (n_subsample=2) read 90.24 for the s05 960 px loop that every frame
    // scores 88.13, 2026-10-14, and so passed files the floor fails)
    `[d][r]libvmaf=log_fmt=json:log_path=${log}:n_threads=6`, '-f', 'null', '-']);
  const p = JSON.parse(readFileSync(log, 'utf8')).pooled_metrics.vmaf;
  return { mean: +p.mean.toFixed(2), harmonic: +p.harmonic_mean.toFixed(2), min: +p.min.toFixed(2) };
}

/** One file, the lightest ladder rung tried that holds the floor (see the head). Throws when none holds it, or capFloor at the cap. */
// `cpuUsed`: VP9's second-pass speed (4 by default for the ladders; 2026-10-14, the reel at 1 held VMAF 91.5 where 4 held
// 86.9, at the same cap and size: a slower pass for a file that ships at its cap)
export function webEncode({ src, out, codec, size, audio = 'none', floor, capFloor = floor, shipAtCap = false, crfs, capKbps, cpuUsed = 4 }) {
  const ladder = [...crfs].sort((a, b) => a - b), work = `${out}.ladder`, ext = codec === 'vp9' ? 'webm' : 'mp4', secs = seconds(src);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const tried = [], scored = new Map();
  const at = (i) => {
    if (!scored.has(i)) {
      const crf = ladder[i], file = join(work, `v-${crf}.${ext}`);
      encode({ src, out: file, codec, size, crf, capKbps, cpuUsed, work });
      const v = vmaf({ dist: file, src, size, work, tag: crf }), kbps = Math.round(statSync(file).size * 8 / secs / 1000);
      scored.set(i, { crf, kbps, file, v, ok: v.mean >= floor && v.min >= floor - 20 });
      tried.push([crf, kbps, v.mean, v.min]);
    }
    return scored.get(i);
  };
  // the highest passing CRF: from the ladder's middle, up while it holds, down while it does not; then, of the rungs
  // tried that pass, the smallest file, the better picture on a tie (under the cap a higher CRF is not always lighter,
  // 2026-10-14: s23's loop ran 6462 kbit/s at CRF 42 and 6597 at 44)
  let i = Math.floor((ladder.length - 1) / 2), best = null;
  if (at(i).ok) { best = at(i); while (i + 1 < ladder.length && at(i + 1).ok) best = at(++i); }
  else { while (i > 0 && !at(i - 1).ok) i--; best = i > 0 ? at(i - 1) : null; }
  if (best) best = [...scored.values()].filter((s) => s.ok).sort((a, b) => a.kbps - b.kbps || b.v.mean - a.v.mean)[0];
  let capped = false;
  // shipAtCap (the coordinator's ruling for the reel, 2026-10-14: its size is the budget, so it ships at its cap
  // whatever that holds): the best-scoring rung tried at the cap, marked capped, with no capFloor to meet
  if (!best && shipAtCap) { best = [...scored.values()].sort((a, b) => b.v.mean - a.v.mean || b.crf - a.crf)[0]; capped = true; }
  if (!best && capFloor < floor) {
    // at the cap the rungs differ little in rate, and the lowest CRF is not the best picture there (2026-10-14: s05's
    // 960 px loop scored 88.13 at CRF 42, 88.00 at 39 and 87.61 at 36, all near 1980 kbit/s): the best-scoring rung
    // tried that holds capFloor ships, the lighter on a tie
    const holds = [...scored.values()].filter((s) => s.v.mean >= capFloor && s.v.min >= capFloor - 20);
    best = holds.sort((a, b) => b.v.mean - a.v.mean || b.crf - a.crf)[0] ?? null;
    capped = !!best;
  }
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
