#!/usr/bin/env node
// Final renders of the site fifty from a lab-resolved directory: film jobs (2160p by default since the owner asked for
// super high quality on 2026-10-03; the scene's own film block) and motion-blur still jobs (2160p, supersampled 1.5x, at
// each shot's still moment), through tools/media-production/cinema.mjs under the shared capture lock, then
// site-loops.mjs for every format (it drops each ProRes film master once its formats are written; the disk is tight).
//   node tools/media-r5/site50-finals.mjs <resolvedDir> [--only=s01,s02] [--chunk=10] [--film-resolution=2160]
//     [--still-supersample=1.5] [--film-master=prores|none] [--keep-film-masters] [--skip-films] [--skip-stills] [--skip-loops]
//     [--min-free-gb=6] [--keep-place[=<stamp ms>]] [--lease-min=45]
// The disk is shared with other sessions: a chunk starts only while --min-free-gb is free (a 2160p take with its formats
// is ~0.35 GB); below it the run stops once the encodes in flight finish, and a re-run resumes where it stopped.
// --film-master=none renders no ProRes master: site-loops encodes from the 2160p H.264 proxy (crf 14, ~97 Mbit/s), so
// chunks can be large (few capture-lock waits) without ~0.77 GB of master per take on the shared disk.
// cinema.mjs holds the shared capture lock for a whole job list, so the films go in chunks (default 10 per lease) and
// other sessions' captures get the GPU between them. A chunk runs take by take, each film with its stills (one map load).
// --keep-place (the coordinator's alternating finals, 2026-10-07): every lease joins the capture queue at the run's first
// stamp (renders/ticket-stamp, kept across relaunches; --keep-place=<ms> sets it, e.g. the lane's earlier place in the
// line), so after each lease the finals follow whichever lane took the GPU, and a lease ends before a take that would
// carry it past --lease-min (45): the rest of the chunk takes the next lease.
// <resolvedDir> is a lab run over shots/media-r5/site50/scenes (its *.resolved.json); the source scenes supply the
// still moments. Outputs: shots/media-r5/site50/renders/{films,stills}/<id>/, shots/media-r5/site50/deliver/<id>/;
// --tag=<round> writes renders-<round>/ and deliver-<round>/ instead, so every round's renders stay (owner 2026-10-03).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SHOTS, TOOL } from './paths.mjs';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v = 'true'] = a.slice(2).split('='); return [k, v]; }));
const resolved = resolve(args.find(a => !a.startsWith('--')) ?? join(SHOTS, 'site50/review2'));
const tag = flags.tag ? `-${flags.tag}` : '';
const scenes = join(SHOTS, 'site50/scenes'), renders = join(SHOTS, `site50/renders${tag}`), deliver = join(SHOTS, `site50/deliver${tag}`);
const cacheDir = join(SHOTS, '.vite-cinema');
const run = (label, cmd, cmdArgs) => {
  console.log(`[finals] ${label}: ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', env: { ...process.env, MEDIA_R5_LIGHT: '1' } });
  if (r.status !== 0) throw new Error(`${label} failed (${r.status})`);
};
// cinema-jobs reads each still moment from <resolved>/<id>.scene.json: the site scenes are their own sources
let staged = 0;
for (const f of readdirSync(scenes).filter(f => /^s\d\d-.*\.json$/.test(f))) {
  const id = f.replace(/\.json$/, '');
  if (!existsSync(join(resolved, `${id}.resolved.json`))) continue;
  copyFileSync(join(scenes, f), join(resolved, `${id}.scene.json`)); staged++;
}
console.log(`[finals] ${staged} resolved site shots in ${resolved}`);
mkdirSync(renders, { recursive: true });
// cinema runs as a child the runner waits on without blocking its encodes; a signal stops the child, which releases the
// capture lock, and then the run
let cinemaChild = null, stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; cinemaChild?.kill(signal); });
const cinema = (label, cmdArgs) => new Promise((done, fail) => {
  if (stopping) { fail(new Error('stopped by a signal')); return; }
  console.log(`[finals] ${label}: node ${cmdArgs.join(' ')}`);
  cinemaChild = spawn('node', cmdArgs, { stdio: 'inherit', env: { ...process.env, MEDIA_R5_LIGHT: '1' } });
  cinemaChild.on('error', fail);
  cinemaChild.on('exit', (code, signal) => { cinemaChild = null; done(code ?? (signal ? 1 : 0)); });
});
const keepPlace = 'keep-place' in flags, leaseMin = Number(flags['lease-min'] ?? 45);
const stampFile = join(renders, 'ticket-stamp');
const givenStamp = /^\d+$/.test(flags['keep-place'] ?? '') ? Number(flags['keep-place']) : null;
const stamp = keepPlace ? givenStamp ?? (existsSync(stampFile) ? Number(readFileSync(stampFile, 'utf8')) : Date.now()) : null;
if (keepPlace) { writeFileSync(stampFile, String(stamp)); console.log(`[finals] every lease joins the queue at ${stamp}, ${leaseMin} min at most`); }
const lease = keepPlace ? [`--ticket-stamp=${stamp}`, `--lease-min=${leaseMin}`] : [];
// between leases the lane at the head of the queue takes the GPU (it polls every 300 ms)
const yieldGpu = () => new Promise(resolve => setTimeout(resolve, 5000));
const only = flags.only ? [`--only=${flags.only}`] : [];
const chunk = Math.max(1, Number(flags.chunk ?? 10));
const minFreeGb = Number(flags['min-free-gb'] ?? 6);
const freeGb = () => { const s = statfsSync(renders); return (s.bavail * s.bsize) / 1e9; };
const filmJobs = join(renders, 'jobs-films.json'), stillJobs = join(renders, 'jobs-stills.json');
if (!('skip-films' in flags)) run('film jobs', 'node', [join(TOOL, 'cinema-jobs.mjs'), 'films', resolved, join(renders, 'films'), filmJobs, `--resolution=${flags['film-resolution'] ?? 2160}`, `--master=${flags['film-master'] ?? 'prores'}`, ...only]);
if (!('skip-stills' in flags)) run('still jobs', 'node', [join(TOOL, 'cinema-jobs.mjs'), 'blur', resolved, join(renders, 'stills'), stillJobs, '--resolution=2160', `--supersample=${flags['still-supersample'] ?? 1.5}`, ...only]);
const films = 'skip-films' in flags ? [] : JSON.parse(readFileSync(filmJobs, 'utf8'));
const stills = 'skip-stills' in flags ? [] : JSON.parse(readFileSync(stillJobs, 'utf8'));
const idOf = job => job.out.split('/').pop();
const ids = [...new Set([...films, ...stills].map(idOf))].sort();
// one lease per chunk: its films and stills together; its formats encode on the CPU while the next chunk renders. The
// encodes run one chunk at a time and niced (other sessions time frames on this machine), and a chunk renders only once
// the encode two chunks back is done: at most two chunks of 2160p ProRes masters (~0.77 GB a take) wait on disk.
const encoders = [];
let encodeChain = Promise.resolve();
const encodeLoops = part => {
  encodeChain = encodeChain.then(() => new Promise((done, fail) => {
    console.log(`[finals] loops for ${[...part][0]}… (background)`);
    const child = spawn('nice', ['-n', '10', 'node', join(TOOL, 'site-loops.mjs'), renders, deliver, [...part].join(','),
      ...('keep-film-masters' in flags ? [] : ['--drop-film-masters'])], { stdio: 'inherit' });
    child.on('exit', code => (code === 0 ? done() : fail(new Error(`loops exited ${code}`))));
  }));
  encoders.push(encodeChain);
};
for (let i = 0; i < ids.length; i += chunk) {
  const k = i / chunk;
  // (masters on disk only: without them a chunk renders as soon as the lock allows)
  if (flags['film-master'] !== 'none' && k >= 2 && encoders[k - 2]) await encoders[k - 2];
  if (freeGb() < minFreeGb) {
    await Promise.all(encoders);
    throw new Error(`${freeGb().toFixed(1)} GB free, under --min-free-gb=${minFreeGb}: stopped before chunk ${k + 1} of ${Math.ceil(ids.length / chunk)}`);
  }
  const part = new Set(ids.slice(i, i + chunk));
  // cinema.mjs reads resume per job: a re-run keeps every finished film and still
  const jobs = [...part].flatMap(id => [...films.filter(j => idOf(j) === id), ...stills.filter(j => idOf(j) === id)]).map(j => ({ ...j, resume: 'true' }));
  const file = join(renders, `jobs-chunk-${String(i / chunk).padStart(2, '0')}.json`);
  writeFileSync(file, JSON.stringify(jobs, null, 1));
  for (let leaseNo = 1; ; leaseNo++) {
    if (keepPlace && (k > 0 || leaseNo > 1)) await yieldGpu();
    const code = await cinema(`chunk ${k + 1} (${[...part][0]}…, ${jobs.length} jobs)${leaseNo > 1 ? `, lease ${leaseNo}` : ''}`,
      ['tools/media-production/cinema.mjs', `--jobs=${file}`, `--cache-dir=${cacheDir}`, '--resume=true', ...lease]);
    if (stopping) throw new Error(`stopped by a signal in chunk ${k + 1}`);
    if (code === 75 && keepPlace) continue; // lease over: the chunk's remaining takes rejoin the queue at the stamp
    if (code !== 0) throw new Error(`chunk ${k + 1} failed (${code})`);
    break;
  }
  if (!('skip-loops' in flags)) encodeLoops(part);
}
await Promise.all(encoders);
console.log('[finals] done');
