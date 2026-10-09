#!/usr/bin/env node
// Final renders of the site fifty from a lab-resolved directory: film jobs (2160p by default since the owner asked for
// super high quality on 2026-10-03; the scene's own film block) and motion-blur still jobs (2160p, supersampled 1.5x, at
// each shot's still moment), through tools/media-production/cinema.mjs under the shared capture lock, then
// site-loops.mjs for every format (it drops each ProRes film master once its formats are written; the disk is tight).
//   node tools/media-r5/site50-finals.mjs <resolvedDir> [--only=s01,s02] [--chunk=10] [--film-resolution=2160]
//     [--still-supersample=1.5] [--film-master=prores|none] [--keep-film-masters] [--skip-films] [--skip-stills] [--skip-loops]
//     [--min-free-gb=6] [--keep-place[=<stamp ms>]] [--lease-min=45] [--yield-holds=2] [--yield-fifo2=<runner.json>] [--film-proxy=false]
//     [--order=s01,s04,…] [--portrait] [--master-after] [--masters-in-flight=2]
// The disk is shared with other sessions: a chunk starts only while --min-free-gb is free (a 2160p take with its formats
// is ~0.35 GB); below it the run stops once the encodes in flight finish, and a re-run resumes where it stopped.
// --film-master=none renders no ProRes master: site-loops encodes from the 2160p H.264 proxy (crf 14, ~97 Mbit/s), so
// chunks can be large (few capture-lock waits) without ~0.77 GB of master per take on the shared disk.
// cinema.mjs holds the shared capture lock for a whole job list, so the films go in chunks (default 10 per lease) and
// other sessions' captures get the GPU between them. A chunk runs take by take, each film with its stills (one map load).
// --keep-place (the coordinator's alternating finals, 2026-10-07): every lease joins the capture queue at the run's first
// stamp (renders/ticket-stamp, kept across relaunches; --keep-place=<ms> sets it, e.g. the lane's earlier place in the
// line), and a lease ends before a take that would carry it past --lease-min (45): the rest of the chunk takes the next
// lease. Between leases --yield-holds (2) other holds take and release the lock first (the coordinator's revised share,
// about 55 % of the GPU while some forty lane tickets wait).
// --film-proxy=false renders no 2160p H.264 proxy: its encode (~5 min a take) ran inside the GPU lease, and site-loops
// encodes from the ProRes master (keep it with --keep-film-masters, so the full take stays at 4K). A take that started
// keeps the settings its receipt records, so its resume holds; a chunk renders only its pending jobs.
// <resolvedDir> is a lab run over shots/media-r5/site50/scenes (its *.resolved.json); the source scenes supply the
// still moments. Outputs: shots/media-r5/site50/renders/{films,stills}/<id>/, shots/media-r5/site50/deliver/<id>/;
// --tag=<round> writes renders-<round>/ and deliver-<round>/ instead, so every round's renders stay (owner 2026-10-03).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SHOTS, TOOL } from './paths.mjs';
import { CAPTURE_LOCK_DIR, createCaptureLock } from '../capture-lock.mjs';

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
// Between leases, --yield-holds other holds take the lock first. A hold is one lock directory (its inode and birth time).
// The next lease starts once the last yielded hold has begun, so its ticket, back at the stamp, is first in line when
// that hold ends. With nobody waiting and the lock free for a minute (five at most), the finals go on.
const yieldHolds = Math.max(0, Number(flags['yield-holds'] ?? 2));
// --yield-fifo2=<fifo2 runner.json> (the coordinator's overnight pacing, 2026-10-08: one media hold of at most 20 minutes
// for every two holds of the capture service): count that service's own holds since the last lease ended, rather than
// lock directories, which other lanes' holds also make.
const fifo2 = flags['yield-fifo2'] ?? null;
const fifo2Holds = () => { try { const n = Number(JSON.parse(readFileSync(fifo2, 'utf8')).holds); return Number.isFinite(n) ? n : null; } catch { return null; } };
let fifo2Base = null;
const queue = createCaptureLock();
const holdId = () => { try { const s = statSync(CAPTURE_LOCK_DIR); return `${s.ino}:${s.birthtimeMs}`; } catch { return null; } };
// The share changes overnight without a restart (the coordinator's pacing, 2026-10-08: two holds of the capture service
// per media hold until 05:00, one after, and none during push 7's browser receipts): renders/yield-holds, when present,
// replaces --yield-holds at every lease, and while renders/pause exists no new lease starts.
const yieldHoldsFile = join(renders, 'yield-holds'), pauseFile = join(renders, 'pause');
const holdsWanted = () => { try { const n = Number(readFileSync(yieldHoldsFile, 'utf8').trim()); return Number.isFinite(n) ? Math.max(0, n) : yieldHolds; } catch { return yieldHolds; } };
async function waitPause() {
  let said = false;
  while (existsSync(pauseFile) && !stopping) {
    if (!said) { console.log(`[finals] paused while ${pauseFile} exists ${new Date().toTimeString().slice(0, 8)}`); said = true; }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (said) console.log(`[finals] resumed ${new Date().toTimeString().slice(0, 8)}`);
}
async function yieldGpu() {
  const yieldHolds = holdsWanted();
  if (!yieldHolds) return;
  const seen = new Set();
  let freeSince = Date.now(), served = 0, readAt = 0;
  for (;;) {
    if (stopping) return;
    const id = holdId();
    if (id) { seen.add(id); freeSince = Date.now(); }
    if (fifo2 && Date.now() - readAt > 5000) {
      readAt = Date.now();
      const now = fifo2Holds();
      // (a relaunch counts from its first look; a restarted runner counts from zero again)
      if (now != null && (fifo2Base == null || now < fifo2Base)) fifo2Base = now;
      served = now != null ? now - fifo2Base : 0;
    }
    if ((fifo2 ? served : seen.size) >= yieldHolds) break;
    const free = id ? 0 : Date.now() - freeSince;
    if ((free > 60000 && queue.waiting() === 0) || free > 300000) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const yielded = fifo2 ? `${served} fifo2 hold${served === 1 ? '' : 's'} (${seen.size} in all)` : `${seen.size} hold${seen.size === 1 ? '' : 's'}`;
  console.log(`[finals] yielded to ${yielded}; rejoining the queue at ${stamp} ${new Date().toTimeString().slice(0, 8)}`);
}
const only = flags.only ? [`--only=${flags.only}`] : [];
const chunk = Math.max(1, Number(flags.chunk ?? 10));
const minFreeGb = Number(flags['min-free-gb'] ?? 6);
const freeGb = () => { const s = statfsSync(renders); return (s.bavail * s.bsize) / 1e9; };
// --portrait (launch night, 2026-10-09): the portrait takes of vertical-15, from a lab resolve made with --format=portrait
// (each shot's lens widened so the hero keeps its width): films only, into films-portrait/<id>, with cinema's proxy as
// the film the cut links (motion/sync-footage.mjs) and no master, stills or site formats.
const portrait = 'portrait' in flags;
if (portrait) Object.assign(flags, { 'skip-stills': 'true', 'skip-loops': 'true' });
// --master-after (launch night, 2026-10-09): the films render their frames only, and each chunk's masters are made from
// the kept frames outside the GPU lease (film-master.mjs, at once and apart from the slower site formats), since the
// master's encode and its counted probe held the lease as long as the frames themselves on a loaded machine
const masterAfter = 'master-after' in flags && !portrait;
const filmKind = portrait ? 'films-portrait' : 'films';
const filmArgs = portrait ? ['--formats=portrait', '--master=none'] : masterAfter ? ['--master=none', '--proxy=false', '--keep-frames=true'] : [`--master=${flags['film-master'] ?? 'prores'}`];
const filmJobs = join(renders, portrait ? 'jobs-portrait.json' : 'jobs-films.json'), stillJobs = join(renders, 'jobs-stills.json');
if (!('skip-films' in flags)) run('film jobs', 'node', [join(TOOL, 'cinema-jobs.mjs'), 'films', resolved, join(renders, filmKind), filmJobs, `--resolution=${flags['film-resolution'] ?? 2160}`, ...filmArgs, ...(flags['film-proxy'] === 'false' && !portrait ? ['--proxy=false'] : []), ...only]);
if (!('skip-stills' in flags)) run('still jobs', 'node', [join(TOOL, 'cinema-jobs.mjs'), 'blur', resolved, join(renders, 'stills'), stillJobs, '--resolution=2160', `--supersample=${flags['still-supersample'] ?? 1.5}`, ...only]);
const films = 'skip-films' in flags ? [] : JSON.parse(readFileSync(filmJobs, 'utf8'));
const stills = 'skip-stills' in flags ? [] : JSON.parse(readFileSync(stillJobs, 'utf8'));
const idOf = job => job.out.split('/').pop();
const receiptOf = job => { const file = join(job.out, 'cinema-receipt.json'); return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; };
// a started film keeps the master and proxy its receipt records (cinema refuses a resume with other settings)
for (const job of films) { const r = receiptOf(job); if (r) { job.master = r.config.master; job.proxy = String(r.config.proxy); } }
// A job is done when its receipt holds every film and still it asks for, complete (a row is complete only after its
// files are written, verified and hashed). Not `finished`: a batch killed by a signal never stamps that on rows it
// completed (2026-10-07). A batch whose sources changed under it discards everything it rendered.
const formatsOf = job => String(job.formats ?? 'landscape').split(',').length;
const done = job => {
  const r = receiptOf(job);
  if (!r || r.errors?.some(e => /inputs changed during capture/i.test(String(e.error)))) return false;
  const films = job.film === 'false' ? 0 : formatsOf(job), stillCount = job.stills ? String(job.stills).split(',').length * formatsOf(job) : 0;
  return r.films.filter(row => row.complete).length >= films && r.stills.filter(row => row.complete).length >= stillCount;
};
// an earlier lease of this run (also before a relaunch): yield before the next one
const leaseMark = join(renders, 'last-lease');
// --order=s01,s04,… (launch night, 2026-10-08: the films' takes first, so their re-cuts start while the rest render): ids
// matching an earlier prefix render first; the rest follow in id order.
const order = String(flags.order ?? '').split(',').map(p => p.trim()).filter(Boolean);
const rank = id => { const i = order.findIndex(p => id.startsWith(p)); return i < 0 ? order.length : i; };
const ids = [...new Set([...films, ...stills].map(idOf))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
// one lease per chunk: its films and stills together; its formats encode on the CPU while the next chunk renders. The
// encodes run one chunk at a time and niced (other sessions time frames on this machine), and a chunk renders only once
// the encode two chunks back is done: at most two chunks of 2160p ProRes masters (~0.77 GB a take) wait on disk.
const encoders = [];
let encodeChain = Promise.resolve();
// --master-after: each chunk's masters on a chain of their own, started as the chunk renders, so the kept frames (about
// 4 GB a 2160p take) never wait behind the previous chunk's formats; the chunk's formats wait for its masters
let masterChain = Promise.resolve();
const makeMasters = part => new Promise((done, fail) => {
  console.log(`[finals] masters for ${[...part][0]}… (background)`);
  const child = spawn('nice', ['-n', '15', 'node', join(TOOL, 'film-master.mjs'), renders, [...part].join(',')], { stdio: 'inherit' });
  child.on('exit', code => { if (code !== 0) console.log(`[finals] masters for ${[...part][0]}… exited ${code}; the run goes on`); done(); });
  child.on('error', fail);
});
// renders/pause-encodes (the release candidate's CPU quiet period, 2026-10-09): no site formats start while it exists;
// the GPU leases and the masters (which free the kept frames' disk) go on
const encodePauseFile = join(renders, 'pause-encodes');
const waitEncodePause = async () => {
  let said = false;
  while (existsSync(encodePauseFile)) {
    if (!said) { console.log(`[finals] site formats paused while ${encodePauseFile} exists ${new Date().toTimeString().slice(0, 8)}`); said = true; }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  if (said) console.log(`[finals] site formats resumed ${new Date().toTimeString().slice(0, 8)}`);
};
const encodeLoops = part => {
  const masters = masterAfter ? (masterChain = masterChain.then(() => makeMasters(part))) : Promise.resolve();
  encodeChain = Promise.all([encodeChain, masters]).then(waitEncodePause).then(() => new Promise((done, fail) => {
    console.log(`[finals] loops for ${[...part][0]}… (background)`);
    const child = spawn('nice', ['-n', '15', 'node', join(TOOL, 'site-loops.mjs'), renders, deliver, [...part].join(','),
      ...('keep-film-masters' in flags ? [] : ['--drop-film-masters'])], { stdio: 'inherit' });
    // a take whose formats fail is logged, not fatal: the run goes on and a re-run of site-loops redoes it
    child.on('exit', code => { if (code !== 0) console.log(`[finals] loops for ${[...part][0]}… exited ${code}; the run goes on`); done(); });
    child.on('error', fail);
  }));
  encoders.push(encodeChain);
};
// A job that fails waits for the retry pass at the end, alone in a fresh browser (2026-10-07: a still wedged the GPU
// process for 30 minutes and every later job of that batch would have waited on it); the rest of its chunk goes on.
const failed = new Map();
const errorsOf = job => receiptOf(job)?.errors ?? [];
const nameOf = job => job.out.split('/').slice(-2).join('/');
// Takes held back while their scene is re-planned (renders/defer: one id prefix a line, read at every chunk, so a
// running pass picks up a change): they render after the main pass from jobs rebuilt then, because the re-planned
// scene's resolve and still moments differ from the ones staged at launch.
const deferFile = join(renders, 'defer');
const isDeferred = id => (existsSync(deferFile) ? readFileSync(deferFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : [])
  .some(prefix => id.startsWith(prefix));
const held = new Set();
// one chunk of jobs, lease by lease: pending jobs only, a failed job set aside for the retry pass
async function renderJobs(label, all, file) {
  for (let leaseNo = 1; ; leaseNo++) {
    const jobs = all.filter(j => !done(j) && !failed.has(j.out)).map(j => ({ ...j, resume: 'true' }));
    if (!jobs.length) { if (leaseNo === 1) console.log(`[finals] ${label}: rendered in an earlier run`); return; }
    if (leaseNo > 8) throw new Error(`${label}: still pending after 8 leases`);
    writeFileSync(file, JSON.stringify(jobs, null, 1));
    await waitPause();
    if (keepPlace && existsSync(leaseMark)) await yieldGpu();
    await waitPause();
    const code = await cinema(`${label}, ${jobs.length} jobs${leaseNo > 1 ? `, lease ${leaseNo}` : ''}`,
      ['tools/media-production/cinema.mjs', `--jobs=${file}`, `--cache-dir=${cacheDir}`, '--resume=true', ...lease]);
    // (a run stopped by a signal may never have held the lock: no mark, so a restart does not yield first)
    if (!stopping) writeFileSync(leaseMark, new Date().toISOString());
    if (fifo2) fifo2Base = fifo2Holds() ?? fifo2Base;
    if (stopping) throw new Error(`stopped by a signal in ${label}`);
    if (code === 75 && keepPlace) continue; // lease over: the remaining jobs rejoin the queue at the stamp
    if (code === 0) continue; // every job rendered: the next pass finds nothing pending
    const newly = jobs.filter(j => !done(j) && errorsOf(j).length);
    if (!newly.length) throw new Error(`${label} failed (${code})`);
    for (const j of newly) {
      failed.set(j.out, String(errorsOf(j).at(-1)?.error ?? '').split('\n')[0].slice(0, 160));
      console.log(`[finals] ${nameOf(j)} failed (${failed.get(j.out)}); it retries at the end, alone`);
    }
  }
}
for (let i = 0; i < ids.length; i += chunk) {
  const k = i / chunk;
  // (the wait bounds the masters on disk when the encodes drop them; kept masters, or none, need no wait, and a starved
  // encode under a loaded machine must not hold the GPU work back: 2026-10-07, load average 450)
  // --masters-in-flight=N (2): how many chunks' masters may wait for their site formats (a 2160p master is ~0.77 GB);
  // raised while renders/pause-encodes holds the formats, so the GPU work goes on
  const inFlight = Math.max(1, Number(flags['masters-in-flight'] ?? 2));
  if (flags['film-master'] !== 'none' && !('keep-film-masters' in flags) && k >= inFlight && encoders[k - inFlight]) await encoders[k - inFlight];
  if (freeGb() < minFreeGb) {
    await Promise.all(encoders);
    throw new Error(`${freeGb().toFixed(1)} GB free, under --min-free-gb=${minFreeGb}: stopped before chunk ${k + 1} of ${Math.ceil(ids.length / chunk)}`);
  }
  const part = new Set(ids.slice(i, i + chunk).filter(id => { if (!isDeferred(id)) return true; held.add(id); console.log(`[finals] ${id}: deferred`); return false; }));
  if (!part.size) continue;
  // cinema.mjs reads resume per job: a re-run keeps every finished film and still
  const all = [...part].flatMap(id => [...films.filter(j => idOf(j) === id), ...stills.filter(j => idOf(j) === id)]);
  await renderJobs(`chunk ${k + 1} (${[...part][0]}…)`, all, join(renders, `jobs-${portrait ? 'portrait-' : ''}chunk-${String(k).padStart(2, '0')}.json`));
  if (!('skip-loops' in flags)) encodeLoops(part);
}
// The deferred pass: a held take renders once it is off the defer list, from its scene as staged and resolved now.
for (const id of [...held]) {
  if (isDeferred(id)) { console.log(`[finals] ${id}: still deferred; re-run the finals once its scene is resolved`); continue; }
  copyFileSync(join(scenes, `${id}.json`), join(resolved, `${id}.scene.json`));
  const filmFile = join(renders, `jobs-${portrait ? 'portrait' : 'films'}-${id}.json`), stillFile = join(renders, `jobs-stills-${id}.json`);
  run(`film job ${id}`, 'node', [join(TOOL, 'cinema-jobs.mjs'), 'films', resolved, join(renders, filmKind), filmFile, `--resolution=${flags['film-resolution'] ?? 2160}`,
    ...filmArgs, ...(flags['film-proxy'] === 'false' && !portrait ? ['--proxy=false'] : []), `--only=${id}`]);
  if (!portrait) run(`still jobs ${id}`, 'node', [join(TOOL, 'cinema-jobs.mjs'), 'blur', resolved, join(renders, 'stills'), stillFile, '--resolution=2160',
    `--supersample=${flags['still-supersample'] ?? 1.5}`, `--only=${id}`]);
  const jobsNow = [...JSON.parse(readFileSync(filmFile, 'utf8')), ...(portrait ? [] : JSON.parse(readFileSync(stillFile, 'utf8')))];
  // the re-planned take replaces this run's entries for it, so the retry pass retries the rebuilt jobs
  for (const list of [films, stills]) for (let j = list.length - 1; j >= 0; j--) if (idOf(list[j]) === id) list.splice(j, 1);
  for (const job of jobsNow) (job.film === 'false' ? stills : films).push(job);
  await renderJobs(`deferred ${id}`, jobsNow, join(renders, `jobs-deferred-${portrait ? 'portrait-' : ''}${id}.json`));
  held.delete(id);
  if (!('skip-loops' in flags)) encodeLoops(new Set([id]));
}
// The retry pass: each failed job once more, by itself, in a fresh browser; its take's formats follow if it renders.
for (const job of [...films, ...stills].filter(j => failed.has(j.out))) {
  const file = join(renders, `jobs-retry-${idOf(job)}-${job.film === 'false' ? 'stills' : portrait ? 'portrait' : 'film'}.json`);
  writeFileSync(file, JSON.stringify([{ ...job, resume: 'true' }], null, 1));
  await waitPause();
  if (keepPlace && existsSync(leaseMark)) await yieldGpu();
  await waitPause();
  const code = await cinema(`retry ${nameOf(job)}`, ['tools/media-production/cinema.mjs', `--jobs=${file}`, `--cache-dir=${cacheDir}`, '--resume=true', ...lease]);
  if (!stopping) writeFileSync(leaseMark, new Date().toISOString());
  if (fifo2) fifo2Base = fifo2Holds() ?? fifo2Base;
  if (stopping) throw new Error(`stopped by a signal in the retry of ${nameOf(job)}`);
  if (done(job)) {
    failed.delete(job.out);
    console.log(`[finals] retry ${nameOf(job)}: rendered`);
    if (!('skip-loops' in flags)) encodeLoops(new Set([idOf(job)]));
  } else console.log(`[finals] retry ${nameOf(job)}: failed again (${code}); left for a look`);
}
await Promise.all(encoders);
console.log(`[finals] done${failed.size ? `; ${failed.size} job(s) failed twice: ${[...failed.keys()].map(out => out.split('/').slice(-2).join('/')).join(', ')}` : ''}`);
