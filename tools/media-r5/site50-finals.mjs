#!/usr/bin/env node
// Final renders of the site fifty from a lab-resolved directory: film jobs (1080p, the scene's own film block) and
// motion-blur still jobs (2160p at each shot's still moment), through tools/media-production/cinema.mjs under the
// shared capture lock, then site-loops.mjs for the site's formats.
//   node tools/media-r5/site50-finals.mjs <resolvedDir> [--only=s01,s02] [--chunk=10] [--skip-films] [--skip-stills] [--skip-loops]
// cinema.mjs holds the shared capture lock for a whole job list, so the films go in chunks (default 10 per lease) and
// other sessions' captures get the GPU between them.
// <resolvedDir> is a lab run over shots/media-r5/site50/scenes (its *.resolved.json); the source scenes supply the
// still moments. Outputs: shots/media-r5/site50/renders/{films,stills}/<id>/, shots/media-r5/site50/deliver/<id>/.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SHOTS, TOOL } from './paths.mjs';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v = 'true'] = a.slice(2).split('='); return [k, v]; }));
const resolved = resolve(args.find(a => !a.startsWith('--')) ?? join(SHOTS, 'site50/review2'));
const scenes = join(SHOTS, 'site50/scenes'), renders = join(SHOTS, 'site50/renders');
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
const only = flags.only ? [`--only=${flags.only}`] : [];
const chunk = Math.max(1, Number(flags.chunk ?? 10));
const filmJobs = join(renders, 'jobs-films.json'), stillJobs = join(renders, 'jobs-stills.json');
if (!('skip-films' in flags)) run('film jobs', 'node', [join(TOOL, 'cinema-jobs.mjs'), 'films', resolved, join(renders, 'films'), filmJobs, '--resolution=1080', '--master=prores', ...only]);
if (!('skip-stills' in flags)) run('still jobs', 'node', [join(TOOL, 'cinema-jobs.mjs'), 'blur', resolved, join(renders, 'stills'), stillJobs, '--resolution=2160', ...only]);
const films = 'skip-films' in flags ? [] : JSON.parse(readFileSync(filmJobs, 'utf8'));
const stills = 'skip-stills' in flags ? [] : JSON.parse(readFileSync(stillJobs, 'utf8'));
const idOf = job => job.out.split('/').pop();
const ids = [...new Set([...films, ...stills].map(idOf))].sort();
// one lease per chunk: its films and stills together; its loops encode on the CPU while the next chunk waits for the GPU
const encoders = [];
const encodeLoops = part => encoders.push(new Promise((done, fail) => {
  console.log(`[finals] loops for ${[...part][0]}… (background)`);
  const child = spawn('node', [join(TOOL, 'site-loops.mjs'), renders, join(SHOTS, 'site50/deliver'), [...part].join(',')], { stdio: 'inherit' });
  child.on('exit', code => (code === 0 ? done() : fail(new Error(`loops exited ${code}`))));
}));
for (let i = 0; i < ids.length; i += chunk) {
  const part = new Set(ids.slice(i, i + chunk));
  // cinema.mjs reads resume per job: a re-run keeps every finished film and still
  const jobs = [...films.filter(j => part.has(idOf(j))), ...stills.filter(j => part.has(idOf(j)))].map(j => ({ ...j, resume: 'true' }));
  const file = join(renders, `jobs-chunk-${String(i / chunk).padStart(2, '0')}.json`);
  writeFileSync(file, JSON.stringify(jobs, null, 1));
  run(`chunk ${i / chunk + 1} (${[...part][0]}…, ${jobs.length} jobs)`, 'node',
    ['tools/media-production/cinema.mjs', `--jobs=${file}`, `--cache-dir=${cacheDir}`, '--resume=true']);
  if (!('skip-loops' in flags)) encodeLoops(part);
}
await Promise.all(encoders);
console.log('[finals] done');
