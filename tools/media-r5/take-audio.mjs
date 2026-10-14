#!/usr/bin/env node
// The site fifty's sound (owner 2026-10-09: "make sure our videos have audio"). Each delivered take is scored from its
// own scene with the game's recorded library, nothing synthesized and no music:
//  1. score/sfx-cues.mjs --take: the take's gun reports, kills, hits, blasts, crushes, the crew's radio calls, every
//     moving hull's engine and tracks, burning wrecks and fire fields, and the map's ambience bed, each panned and
//     levelled against the lens at its instant;
//  2. score/score.mjs --music=none: mixed and mastered to -16 LUFS integrated, -1.5 dBTP;
//  3. the take's 6.6 s mix looped exactly as site-loops.mjs loops the picture: the last XFADE_MS (0.6 s) crossfaded
//     into the head, here at equal power, then the body, so the loop's sound wraps where its picture does;
//  4. muxed into every delivered video with the picture copied bit for bit: <id>-4k.mp4 and <id>.mp4 (AAC-LC 256 kbit/s,
//     AudioToolbox), <id>-mobile.mp4 (AAC-LC 160 kbit/s), <id>.webm (Opus 160 kbit/s). <id>-audio.wav (the loop's sound,
//     48 kHz 24-bit) ships beside them, and <id>.audio.json records the cues, the master and every file's hashes.
// The GIFs stay silent. The work files go to audio-<round>/<id>/ beside deliver-<round>/.
//   node tools/media-r5/take-audio.mjs <deliverDir> [ids,...] [--force]
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { TOOL } from './paths.mjs';
import { XFADE_MS } from './site50.mjs';

const argv = process.argv.slice(2), flags = new Set(argv.filter((a) => a.startsWith('--'))), pos = argv.filter((a) => !a.startsWith('--'));
const deliver = resolve(pos[0] ?? '');
if (!pos[0] || !existsSync(deliver)) throw Error('take-audio: <deliverDir> (a site-fifty delivery, e.g. shots/media-r5/site50/deliver-r13)');
const only = pos[1]?.split(',').filter(Boolean);
const work = join(dirname(deliver), basename(deliver).replace(/^deliver/, 'audio'));
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const TOOLS = ['take-audio.mjs', 'score/sfx-cues.mjs', 'score/score.mjs'].map((f) => join(TOOL, f));
const toolSha = createHash('sha256').update(TOOLS.map(sha).join(':')).digest('hex');
const LUFS = -16;
// [file suffix, audio encoder args]: the picture is copied, never re-encoded
const FORMATS = [
  ['-4k.mp4', ['-c:a', 'aac_at', '-b:a', '256k']],
  ['.mp4', ['-c:a', 'aac_at', '-b:a', '256k']],
  ['-mobile.mp4', ['-c:a', 'aac_at', '-b:a', '160k']],
  ['.webm', ['-c:a', 'libopus', '-b:a', '160k']],
];
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,duration', '-of', 'json', f], { encoding: 'utf8' }));
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw Error(`${basename(cmd)} ${args.slice(0, 3).join(' ')}… failed: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-4).join(' | ')}`);
  return r.stdout;
};

const ids = readdirSync(deliver).filter((d) => /^s\d\d-/.test(d) && existsSync(join(deliver, d, `${d}.scene.json`)) && existsSync(join(deliver, d, `${d}.mp4`)))
  .filter((d) => !only || only.some((o) => d.startsWith(o))).sort();
const index = existsSync(join(deliver, 'audio-index.json')) ? JSON.parse(readFileSync(join(deliver, 'audio-index.json'), 'utf8')) : { takes: {} };
let done = 0, kept = 0;
for (const id of ids) {
  const dir = join(deliver, id), scene = join(dir, `${id}.scene.json`), receiptFile = join(dir, `${id}.audio.json`);
  const videos = FORMATS.map(([suffix, enc]) => [join(dir, `${id}${suffix}`), enc]).filter(([f]) => existsSync(f));
  const sceneSha = sha(scene);
  if (!flags.has('--force') && existsSync(receiptFile)) {
    const r = JSON.parse(readFileSync(receiptFile, 'utf8'));
    const current = r.sceneSha256 === sceneSha && r.toolSha256 === toolSha
      && videos.every(([f]) => r.files?.[basename(f)]?.sha256 === sha(f));
    if (current) { kept++; continue; }
  }
  const wd = join(work, id);
  mkdirSync(wd, { recursive: true });
  const s = JSON.parse(readFileSync(scene, 'utf8')), takeS = (s.storyboard?.durationMs ?? 6600) / 1000, xfadeS = XFADE_MS / 1000, loopS = +(takeS - xfadeS).toFixed(3);
  // 1. the cues: the take as a one-cut edit of its own scene
  copyFileSync(scene, join(wd, `${id}.json`));
  writeFileSync(join(wd, 'edl.json'), JSON.stringify({ shots: [{ src: `${id}.mp4`, start: 0, dur: takeS, in: 0 }] }, null, 1));
  // levelled as the game levels it (score.mjs gameLaw: each cue's distance law on its bus); the world ducks under the
  // crews by the game's VOICE_DUCK (-4 dB, the ambience -10), and the crews keep the films' +6 dB
  writeFileSync(join(wd, 'cues-in.json'), JSON.stringify({ title: id, durationSec: takeS, lufs: LUFS, sfxDb: -2, radioDb: 6, worldDuckDb: -4,
    gameLaw: true, fadeOutSec: 0, sections: [], hits: [] }, null, 1));
  const cuesLog = run('node', [join(TOOL, 'score/sfx-cues.mjs'), join(wd, 'edl.json'), wd, join(wd, 'cues-in.json'), join(wd, 'cues.json'), '--take']).trim();
  // 2. the mix
  const scoreLog = run('node', [join(TOOL, 'score/score.mjs'), `--cues=${join(wd, 'cues.json')}`, '--music=none', `--out=${wd}`]).trim();
  const score = JSON.parse(readFileSync(join(wd, 'score-receipt.json'), 'utf8'));
  // 3. the loop's sound: tail (L..D) into head (0..X) at equal power, then the body (X..L), as site-loops.mjs loops the picture
  const graph = `[0:a]asplit=3[a][b][c];[a]atrim=start=0:end=${xfadeS},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${xfadeS}:curve=qsin[head];`
    + `[b]atrim=start=${xfadeS}:end=${loopS},asetpts=PTS-STARTPTS[body];[c]atrim=start=${loopS}:end=${takeS},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${xfadeS}:curve=qsin[tail];`
    + `[tail][head]amix=inputs=2:normalize=0:duration=longest[blend];[blend][body]concat=n=2:v=0:a=1[loop]`;
  const loopWav = join(wd, 'loop.wav');
  run('ffmpeg', ['-v', 'error', '-y', '-i', join(wd, 'mix.wav'), '-filter_complex', graph, '-map', '[loop]', '-c:a', 'pcm_s24le', '-ar', '48000', loopWav]);
  const loopDur = Number(probe(loopWav).format.duration);
  if (Math.abs(loopDur - loopS) > 0.005) throw Error(`${id}: the loop's sound is ${loopDur}s, not ${loopS}s`);
  // 4. into every delivered video: the picture copied, the sound encoded; written aside, checked, then moved over
  const files = {};
  for (const [file, enc] of videos) {
    const before = probe(file), video = before.streams.filter((x) => x.codec_type === 'video');
    const picDur = Number(before.format.duration);
    if (video.length !== 1 || Math.abs(picDur - loopS) > 0.04) throw Error(`${basename(file)}: ${video.length} video streams, ${picDur}s (the loop is ${loopS}s)`);
    const prior = JSON.parse(existsSync(receiptFile) ? readFileSync(receiptFile, 'utf8') : '{}').files?.[basename(file)];
    const silentSha256 = before.streams.some((x) => x.codec_type === 'audio') ? prior?.silentSha256 ?? null : sha(file);
    const tmp = file.replace(/(\.\w+)$/, '.audio-tmp$1');
    run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-i', loopWav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', ...enc, '-ar', '48000', '-ac', '2',
      ...(file.endsWith('.mp4') ? ['-movflags', '+faststart'] : []), '-metadata:s:a:0', 'title=The game\'s recorded sound (take-audio.mjs)', tmp]);
    const after = probe(tmp), audio = after.streams.find((x) => x.codec_type === 'audio');
    if (!audio || after.streams.filter((x) => x.codec_type === 'video').length !== 1) throw Error(`${basename(tmp)}: missing a stream`);
    if (Math.abs(Number(after.format.duration) - picDur) > 0.05) throw Error(`${basename(tmp)}: ${after.format.duration}s against the picture's ${picDur}s`);
    renameSync(tmp, file);
    files[basename(file)] = { sha256: sha(file), bytes: statSync(file).size, audio: `${audio.codec_name} ${enc[enc.indexOf('-b:a') + 1]}`, silentSha256 };
  }
  copyFileSync(loopWav, join(dir, `${id}-audio.wav`));
  files[`${id}-audio.wav`] = { sha256: sha(join(dir, `${id}-audio.wav`)), bytes: statSync(join(dir, `${id}-audio.wav`)).size, audio: 'pcm_s24le 48 kHz stereo' };
  const cues = JSON.parse(readFileSync(join(wd, 'cues.json'), 'utf8')).sfx ?? [];
  const kinds = cues.reduce((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {});
  const receipt = {
    tool: 'media-r5 take-audio', toolSha256: toolSha, id, sceneSha256: sceneSha, takeS, loopS, xfadeS, crossfade: 'equal power (quarter sine)',
    cues: { kinds, radio: cues.filter((e) => e.kind === 'radio').map((e) => `${e.t}s ${e.lang} ${e.line}`), drives: cues.filter((e) => e.kind === 'drive').map((e) => `${e.actor} ${e.engine} ${e.speed} m/s`) },
    master: { targetLufs: LUFS, integratedLufs: score.integratedLufs, truePeakDbfs: score.truePeakDbfs, recordings: score.recordings, provenance: score.provenance },
    files,
  };
  writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
  index.takes[id] = { loopS, integratedLufs: score.integratedLufs, truePeakDbfs: score.truePeakDbfs, files: Object.keys(files), receipt: `${id}/${id}.audio.json` };
  writeFileSync(join(deliver, 'audio-index.json'), JSON.stringify(index, null, 2) + '\n');
  done++;
  console.log(`${id}: ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}; ${score.integratedLufs} LUFS, ${score.truePeakDbfs} dBTP; ${Object.keys(files).length} files [${cuesLog.split('\n').at(-1).replace(/ -> .*/, '')}] [${scoreLog.split('\n').at(-1).replace(/ -> .*/, '').replace('[score] ', '')}]`);
}
console.log(`take-audio: ${done} scored and muxed, ${kept} already current, ${ids.length} takes in ${deliver}`);
