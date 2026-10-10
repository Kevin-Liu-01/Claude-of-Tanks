#!/usr/bin/env node
// The films' music bed, generated (owner 2026-10-05: recorded SFX and generated music, nothing synthesized). A film's
// cue sheet becomes an Eleven Music composition plan on its bar grid: each section a chunk (merged up to the model's
// 3 s minimum) whose styles say what plays — the drone, the ticking clock, the string ostinato, the taiko — and whose
// directions place the sheet's hits (the braam and boom on a section's downbeat, the riser into the next). The take is
// cached by request (tools/audio/elevenlabs.mjs; the ledger records its credits), decoded to 48 kHz stereo and cut to
// the film's length for score.mjs.
//
//   node tools/media-r5/score/music.mjs --cues=<cues.json> --out=<dir> [--plan-only=1] [--take=0] [--seed=<n>]
//   ELEVENLABS_API_KEY_FILE=<file> for a take; --plan-only writes the plan without a call.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SR = 48000;
const MIN_CHUNK_S = 3;
const GLOBAL = ['epic cinematic trailer score', 'hybrid orchestral', 'instrumental', '96 BPM', 'D minor', 'taiko war drums',
  'low brass and staccato strings', 'modern military tension'];
const AVOID = ['vocals', 'choir singing words', 'lyrics', 'EDM', 'dubstep', 'rock guitar', 'piano ballad', 'lo-fi', 'jazz',
  'comedy', 'chiptune'];
const LAYER_STYLE = {
  drone: 'low sustained drone', ticks: 'ticking clock', ticks8: 'fast ticking clock', pulse: 'pulsing staccato strings',
  pulse16: 'driving sixteenth-note string ostinato', pad: 'warm string pad', taiko: 'sparse taiko hits',
  taiko2: 'pounding taiko ensemble', toms: 'tom fills', hats: 'hybrid trailer percussion', hats16: 'fast hi-hat sixteenths',
  rim: 'rimshot accents', open: 'bright and wide', heartbeat: 'heartbeat pulse', motif: 'solo bell motif', shimmer: 'ethereal high shimmering strings',
};
const energy = (db) => (db <= -10 ? 'very quiet and sparse' : db <= -5 ? 'restrained, building tension' : db <= -2 ? 'intense' : 'full power climax');
const clip = (line) => (line.length <= 200 ? line : `${line.slice(0, 198).replace(/,[^,]*$/, '')}}`);
const title = (name) => name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** The film's sections in seconds on its bar grid, cut to the film's length. */
export function sectionsOf(cues) {
  const bar = 4 * 60 / cues.bpm, offset = cues.offsetSec ?? 0, end = cues.durationSec;
  return cues.sections.map((s) => ({ ...s, from: offset + s.fromBar * bar, to: Math.min(end, offset + (s.toBar + 1) * bar) }))
    .filter((s) => s.to > s.from);
}

/** Merge sections shorter than the model's minimum into the next one (the last into the one before). */
export function mergeShort(sections) {
  const out = sections.map((s) => ({ ...s, parts: [s] }));
  for (let i = 0; i < out.length; i++) {
    if (out[i].to - out[i].from >= MIN_CHUNK_S || out.length === 1) continue;
    const into = i + 1 < out.length ? i + 1 : i - 1;
    const [a, b] = into > i ? [out[i], out[into]] : [out[into], out[i]];
    const merged = { ...b, from: a.from, to: b.to, parts: [...a.parts, ...b.parts] };
    out.splice(Math.min(i, into), 2, merged);
    i = Math.max(-1, Math.min(i, into) - 1);
  }
  return out;
}

/** The composition plan (music_v2 / music_v2_5 chunks) for a cue sheet. */
export function planFor(cues) {
  const chunks = mergeShort(sectionsOf(cues));
  const hits = cues.hits ?? [];
  return {
    chunks: chunks.map((chunk, k) => {
      const ms = Math.round((chunk.to - chunk.from) * 1000);
      const lines = [];
      for (const [p, part] of chunk.parts.entries()) {
        const layers = part.layers.map((l) => LAYER_STYLE[l]).filter(Boolean);
        const near = (h, t) => Math.abs(h.t - t) < 0.3;
        // the downbeat's hits open the part; a riser or reverse swell that lands on the next downbeat closes it
        const open = [hits.some((h) => h.kind === 'braam' && near(h, part.from)) && 'a massive low brass braam',
          hits.some((h) => h.kind === 'boom' && near(h, part.from)) && 'a sub boom impact'].filter(Boolean);
        const nextFrom = p + 1 < chunk.parts.length ? chunk.parts[p + 1].from : chunks[k + 1]?.from;
        const into = nextFrom == null ? [] : [hits.some((h) => h.kind === 'riser' && near(h, nextFrom)) && 'a rising riser',
          hits.some((h) => h.kind === 'swell' && near(h, nextFrom)) && 'a reverse swell'].filter(Boolean);
        const inside = hits.filter((h) => h.kind === 'taiko' && h.t > part.from + 0.3 && h.t < part.to - 0.3).length;
        const lead = p === 0 ? '' : `after ${Math.round((part.from - chunk.from) * 10) / 10} s: `;
        // one direction per line, each within the model's 200 characters
        const body = `${energy(part.gainDb ?? -6)}: ${layers.join(', ')}`;
        const said = [open.length && `opens on ${open.join(' and ')}`, body, inside && 'a taiko hit on every half bar',
          into.length && `ends with ${into.join(' and ')} into the next downbeat`].filter(Boolean);
        said.forEach((words, w) => lines.push(clip(`{${w === 0 ? lead : ''}${words}}`)));
      }
      if (!chunks[k + 1] && hits.some((h) => h.kind === 'stop')) lines.push('{ends on a hard stop into silence}');
      const local = [...new Set(chunk.parts.flatMap((part) => part.layers.map((l) => LAYER_STYLE[l]).filter(Boolean)))];
      return {
        text: [`[${chunk.parts.map((part) => title(part.name)).join(' / ')}]`, ...lines].join('\n'),
        duration_ms: ms,
        positive_styles: k === 0 ? [...GLOBAL, ...local] : [...GLOBAL.slice(0, 4), ...local].slice(0, 10),
        negative_styles: AVOID,
        context_adherence: 'high',
      };
    }),
  };
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z-]+)=(.*)$/.exec(a); if (!m) throw new Error(a); return [m[1], m[2]]; }));
if (args.cues) {
  const cues = JSON.parse(readFileSync(resolve(args.cues), 'utf8'));
  const out = resolve(args.out ?? '.');
  mkdirSync(out, { recursive: true });
  const plan = planFor(cues);
  const total = plan.chunks.reduce((sum, c) => sum + c.duration_ms, 0);
  writeFileSync(join(out, 'music-plan.json'), JSON.stringify(plan, null, 1));
  console.log(`[music] ${plan.chunks.length} chunks, ${(total / 1000).toFixed(1)} s for a ${cues.durationSec} s film -> ${join(out, 'music-plan.json')}`);
  if (args['plan-only'] !== '1') {
    const { music } = await import('../../audio/elevenlabs.mjs');
    const take = Number(args.take ?? 0), seed = args.seed != null ? Number(args.seed) : 9600 + take;
    const { file, cost, cached } = await music({ plan, seed, take });
    // decode to 48 kHz stereo float, cut (or pad) to the film's length
    const frames = Math.round(cues.durationSec * SR);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-af', `apad,atrim=end_sample=${frames}`, '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_f32le', join(out, 'music-gen.wav')]);
    const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();
    writeFileSync(join(out, 'music-receipt.json'), JSON.stringify({ model: 'music_v2_5', seed, take, source: file, generatedSeconds: Number(probe),
      filmSeconds: cues.durationSec, plannedSeconds: total / 1000, cost, cached, provenance: 'Eleven Music (ElevenLabs), generated from this film\'s cue sheet.' }, null, 1));
    console.log(`[music] take ${take} (seed ${seed}): ${Number(probe).toFixed(2)} s generated, ${cached ? 'cached' : `${cost} credits`} -> ${join(out, 'music-gen.wav')}`);
  }
}
