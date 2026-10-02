#!/usr/bin/env node
// Final renders of the site fifty from a lab-resolved directory: film jobs (1080p, the scene's own film block) and
// motion-blur still jobs (2160p at each shot's still moment), through tools/media-production/cinema.mjs under the
// shared capture lock, then site-loops.mjs for the site's formats.
//   node tools/media-r5/site50-finals.mjs <resolvedDir> [--only=s01,s02] [--skip-films] [--skip-stills] [--skip-loops]
// <resolvedDir> is a lab run over shots/media-r5/site50/scenes (its *.resolved.json); the source scenes supply the
// still moments. Outputs: shots/media-r5/site50/renders/{films,stills}/<id>/, shots/media-r5/site50/deliver/<id>/.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
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
if (!('skip-films' in flags)) {
  const jobs = join(renders, 'jobs-films.json');
  run('film jobs', 'node', [join(TOOL, 'cinema-jobs.mjs'), 'films', resolved, join(renders, 'films'), jobs, '--resolution=1080', '--master=prores', ...only]);
  run('films', 'node', ['tools/media-production/cinema.mjs', `--jobs=${jobs}`, `--cache-dir=${cacheDir}`, '--resume=true']);
}
if (!('skip-stills' in flags)) {
  const jobs = join(renders, 'jobs-stills.json');
  run('still jobs', 'node', [join(TOOL, 'cinema-jobs.mjs'), 'blur', resolved, join(renders, 'stills'), jobs, '--resolution=2160', ...only]);
  run('stills', 'node', ['tools/media-production/cinema.mjs', `--jobs=${jobs}`, `--cache-dir=${cacheDir}`, '--resume=true']);
}
if (!('skip-loops' in flags)) run('loops', 'node', [join(TOOL, 'site-loops.mjs'), renders, join(SHOTS, 'site50/deliver'), ...(flags.only ? [flags.only] : [])]);
console.log('[finals] done');
