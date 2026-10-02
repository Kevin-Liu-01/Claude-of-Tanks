#!/usr/bin/env node
// The versioned production release (2026-10-01; infra audit P14/P17, hygiene H2d). It replaces the
// scratchpad-only deploy driver (`deploy-prod-main.sh`) with one Node tool any teammate can run from a
// clone. Deploys stay manual, once per round, after a green `node tools/gate.mjs`; nothing here runs
// in CI. Every subcommand takes --dry-run, which prints each command and changes nothing (it runs
// only read-only git, never Vercel, wrangler or a network request).
//
//   build <sha>    temporary git worktree of <sha>; npm ci; vercel pull --yes --environment=production;
//                  drop the redacted VITE_*="[SENSITIVE]" lines the pull writes; vercel build --prod;
//                  restore the lockfile the build's install rewrites; node tools/vercel-output-immutable.mjs
//                  and its --check. The pulled .vercel/.env*.local files are deleted in a finally block.
//   deploy <sha>   vercel deploy --prebuilt --prod from that worktree with the git metadata of <sha>,
//                  then verify, then remove the worktree (--keep keeps it, --no-verify skips verify).
//   verify <sha>   the served application-version stamp names <sha> (retried while the alias moves);
//                  --sweep also requires every chunk the served index names to answer 200 and a
//                  missing chunk to stay uncacheable (the 2026-09-25 rule).
//   rollback       promote the production deployment before the one serving the live stamp, or
//                  --to=<deployment url|id>. `vercel promote` also turns production-domain
//                  auto-assignment back on, which a plain `vercel rollback` leaves off.
//   workers <sha>  temporary worktree of <sha>; per Worker (rooms, telemetry; --only=<name>): npm ci,
//                  typecheck, test, wrangler deploy --tag <sha12> --message "<sha12> <subject>".
//   clean <sha>    remove the build worktree of <sha>.
//
// Options: --scope=<team> (env COT_VERCEL_SCOPE; default kl01s-projects), --site=<origin>
// (default https://cot.kevinliu.studio), --dir=<build worktree> (default <tmp>/cot-release-<sha12>).
// The Vercel CLI is `vercel` on PATH (or COT_VERCEL_BIN) and must be major version VERCEL_CLI_MAJOR.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_DEFAULTS = Object.freeze({
  scope: 'kl01s-projects',
  site: 'https://cot.kevinliu.studio',
  project: 'claude-of-tanks',
  ref: 'main',
  githubLogin: 'Kevin-Liu-01',
  githubOrg: 'Kevin-Liu-01',
  githubRepo: 'Claude-of-Tanks',
  githubRepoId: '1316388080',
});
export const VERCEL_CLI_MAJOR = 58;
const COMMANDS = new Set(['build', 'deploy', 'verify', 'rollback', 'workers', 'clean']);
const NEEDS_SHA = new Set(['build', 'deploy', 'verify', 'workers', 'clean']);

/** Parse the command line; throws on misuse (exit 2). */
export function parseReleaseArgs(argv, env = process.env) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) throw new Error(`Usage: node tools/release.mjs <${[...COMMANDS].join('|')}> [<sha>] [options] [--dry-run]`);
  const options = { command, sha: null, dryRun: false, scope: env.COT_VERCEL_SCOPE || RELEASE_DEFAULTS.scope,
    site: RELEASE_DEFAULTS.site, dir: null, title: null, ref: RELEASE_DEFAULTS.ref, to: null, only: null,
    attempts: 12, intervalMs: 10_000, sweep: false, keep: false, verify: true };
  for (const arg of rest) {
    const [flag, ...parts] = arg.split('=');
    const value = parts.join('=');
    if (!arg.startsWith('--') && !options.sha && NEEDS_SHA.has(command)) options.sha = arg;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (flag === '--scope' && /^[\w.-]+$/.test(value)) options.scope = value;
    else if (flag === '--site' && /^https?:\/\/[^/\s]+$/.test(value)) options.site = value;
    else if (flag === '--dir' && value) options.dir = resolve(value);
    else if (flag === '--title' && value && command === 'deploy') options.title = value;
    else if (flag === '--ref' && /^[\w./-]+$/.test(value) && command === 'deploy') options.ref = value;
    else if (flag === '--to' && /^[\w.:/-]+$/.test(value) && command === 'rollback') options.to = value;
    else if (flag === '--only' && /^[a-z][\w-]*$/.test(value) && command === 'workers') options.only = value;
    else if (flag === '--attempts' && /^[1-9]\d*$/.test(value) && command !== 'rollback') options.attempts = Number(value);
    else if (flag === '--interval' && /^\d+$/.test(value) && command !== 'rollback') options.intervalMs = Number(value) * 1000;
    else if (arg === '--sweep' && command === 'verify') options.sweep = true;
    else if (arg === '--keep' && command === 'deploy') options.keep = true;
    else if (arg === '--no-verify' && command === 'deploy') options.verify = false;
    else throw new Error(`Unknown or misplaced option for ${command}: ${arg}`);
  }
  if (NEEDS_SHA.has(command) && !options.sha) throw new Error(`${command} needs the commit to release: node tools/release.mjs ${command} <sha>`);
  if (options.sha && !/^[\w./^~-]+$/.test(options.sha)) throw new Error(`Not a revision: ${options.sha}`);
  return options;
}

/**
 * `vercel pull` writes this project's sensitive variables as the literal [SENSITIVE]; vite build refuses
 * such a VITE_* value (tools/publicBuildEnv.ts), and an unset one resolves the official Workers from
 * src/officialHost.ts. Only those redacted browser-visible lines are dropped; every other line, secrets
 * included, is left exactly as pulled. Returns the names dropped, never a value.
 */
export function stripRedactedPublicEnv(text) {
  const dropped = [];
  const kept = text.split('\n').filter((line) => {
    const match = /^(VITE_[A-Z0-9_]*)=(["']?)\[SENSITIVE\]\2\s*$/.exec(line);
    if (match) dropped.push(match[1]);
    return !match;
  });
  return { text: kept.join('\n'), dropped };
}

/** The application-version meta of a served page: { version, revision, dirty } or null. */
export function parseVersionStamp(html) {
  const tag = /<meta\b[^>]*\bname=["']application-version["'][^>]*>/i.exec(html)?.[0];
  const version = tag && /\bcontent=["']([^"']+)["']/i.exec(tag)?.[1];
  if (!version) return null;
  const revision = /(?:^|[+.])g([0-9a-f]{7,40})(?=$|\.)/.exec(version)?.[1] ?? null;
  return { version, revision, dirty: /(?:^|[+.])dirty(?=$|\.)/.test(version) };
}

/** A clean stamp whose revision is a prefix of the full commit. */
export function stampNames(stamp, commit) {
  return Boolean(stamp?.revision && !stamp.dirty && String(commit).toLowerCase().startsWith(stamp.revision));
}

/** { org, repo } of a GitHub remote URL (https or ssh), or null. */
export function githubSlug(url) {
  const match = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url ?? '').trim());
  return match ? { org: match[1], repo: match[2] } : null;
}

/** The `-m key=value` deployment metadata the CLI deploy has always attached (branch link, title). */
export function deployMetadata({ commit, subject, author, title, ref = RELEASE_DEFAULTS.ref, org = RELEASE_DEFAULTS.githubOrg,
  repo = RELEASE_DEFAULTS.githubRepo, repoId = RELEASE_DEFAULTS.githubRepoId, login = RELEASE_DEFAULTS.githubLogin }) {
  const name = title || subject;
  return Object.entries({
    githubDeployment: '1', githubCommitRef: ref, githubCommitSha: commit, githubCommitMessage: name,
    githubCommitAuthorName: author, githubCommitAuthorLogin: login, githubOrg: org, githubRepo: repo, githubRepoId: repoId,
    githubCommitOrg: org, githubCommitRepo: repo, githubCommitRepoId: repoId, title: name, gateHead: commit,
  }).flatMap(([key, value]) => ['-m', `${key}=${value}`]);
}

/**
 * The deployment a rollback promotes: the newest READY production deployment older than the one whose
 * commit the live stamp names (or than the newest, when no listed deployment names it), with a
 * different commit. Accepts `vercel list --format json` output (an array or { deployments }).
 */
export function previousProductionDeployment(listing, servedRevision) {
  const rows = (Array.isArray(listing) ? listing : listing?.deployments ?? [])
    .filter((row) => row && (row.url || row.uid))
    .filter((row) => !row.state && !row.readyState ? true : (row.state ?? row.readyState) === 'READY')
    .filter((row) => !row.target || row.target === 'production')
    .map((row) => ({ ...row, createdMs: Number(row.createdAt ?? row.created ?? 0), commit: String(row.meta?.githubCommitSha ?? '') }))
    .sort((a, b) => b.createdMs - a.createdMs);
  if (!rows.length) return null;
  const live = servedRevision ? rows.findIndex((row) => row.commit.startsWith(servedRevision)) : -1;
  const current = rows[live >= 0 ? live : 0];
  return rows.slice((live >= 0 ? live : 0) + 1).find((row) => !current.commit || row.commit !== current.commit) ?? null;
}

/** Hashed chunks a served index names. */
export function chunkPaths(html) {
  return [...new Set([...String(html).matchAll(/\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g)].map((match) => match[0]))];
}

/** A cache policy that would keep a missing chunk's 404 at the edge. */
export function cacheControlIsLong(value) {
  return /immutable|max-age=[1-9]\d{3,}/.test(String(value ?? ''));
}

/** The wrangler deploy arguments that name the commit on the Worker version. */
export function workerDeployArgs({ commit, subject }) {
  const tag = commit.slice(0, 12);
  return ['wrangler', 'deploy', '--tag', tag, '--message', `${tag} ${subject}`.slice(0, 100)];
}

// ---------------------------------------------------------------------------------------------
// Execution

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const vercelBin = () => process.env.COT_VERCEL_BIN || 'vercel';
const gitText = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A command as it would be typed: arguments with spaces or shell characters single-quoted. */
export function displayCommand(argv) {
  return argv.map((arg) => /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${String(arg).replace(/'/g, "'\\''")}'`).join(' ');
}

/** Prints each command; executes it unless dry-run. capture returns stdout and stderr (also echoed). */
export function createRunner({ dryRun, log = console.log }) {
  const prefix = dryRun ? '[dry-run] ' : '';
  return {
    dryRun,
    note: (text) => log(`${prefix}${text}`),
    run(argv, { cwd, env, capture = false } = {}) {
      log(`${prefix}$ ${displayCommand(argv)}${cwd ? `    (in ${cwd})` : ''}`);
      if (dryRun) return Promise.resolve({ status: 0, stdout: '', stderr: '' });
      return new Promise((resolveRun, rejectRun) => {
        const child = spawn(argv[0], argv.slice(1), { cwd, env: env ?? process.env, stdio: ['inherit', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'] });
        let stdout = '', stderr = '';
        if (capture) {
          child.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
          child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
        }
        child.once('error', rejectRun);
        child.once('close', (status) => status === 0 ? resolveRun({ status, stdout, stderr })
          : rejectRun(new Error(`${argv.slice(0, 3).join(' ')} exited ${status}`)));
      });
    },
  };
}

function resolveCommit(root, revision) {
  try { return gitText(root, 'rev-parse', '--verify', `${revision}^{commit}`); }
  catch { throw new Error(`Unknown commit ${revision}; fetch it first`); }
}
const buildDir = (options, commit) => options.dir ?? join(tmpdir(), `cot-release-${commit.slice(0, 12)}`);

async function checkVercelCli(runner) {
  if (runner.dryRun) { runner.note(`check: ${vercelBin()} --version is major ${VERCEL_CLI_MAJOR}`); return; }
  const text = execFileSync(vercelBin(), ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const major = Number(/(\d+)\.\d+\.\d+/.exec(text)?.[1]);
  if (major !== VERCEL_CLI_MAJOR) throw new Error(`Vercel CLI ${text.trim()} is not major ${VERCEL_CLI_MAJOR}; install vercel@${VERCEL_CLI_MAJOR} or update VERCEL_CLI_MAJOR in tools/release.mjs with a verified dry run`);
}

function deletePulledEnvFiles(dir, runner) {
  const vercelDir = join(dir, '.vercel');
  const files = [...(existsSync(vercelDir) ? readdirSync(vercelDir).filter((name) => /^\.env.*\.local$/.test(name)).map((name) => join(vercelDir, name)) : []),
    ...(existsSync(join(dir, '.env.local')) ? [join(dir, '.env.local')] : [])];
  if (runner.dryRun) { runner.note(`finally: delete ${join(vercelDir, '.env*.local')} (pulled environment, never kept)`); return; }
  for (const file of files) rmSync(file, { force: true });
  runner.note(`deleted ${files.length} pulled environment file(s)`);
}

async function build(options, { root, runner }) {
  const commit = resolveCommit(root, options.sha);
  const dir = buildDir(options, commit);
  await checkVercelCli(runner);
  if (existsSync(dir)) {
    if (gitText(dir, 'rev-parse', 'HEAD') !== commit) throw new Error(`${dir} holds another commit; node tools/release.mjs clean <sha> first`);
    runner.note(`reusing the build worktree ${dir}`);
  } else await runner.run(['git', 'worktree', 'add', '--detach', dir, commit], { cwd: root });
  const project = join(dir, '.vercel', 'project.json');
  if (!existsSync(project)) {
    const linked = join(root, '.vercel', 'project.json');
    if (existsSync(linked)) {
      if (runner.dryRun) runner.note(`copy ${linked} -> ${project}`);
      else { mkdirSync(dirname(project), { recursive: true }); copyFileSync(linked, project); }
    } else if (!process.env.VERCEL_ORG_ID || !process.env.VERCEL_PROJECT_ID) {
      const hint = `no .vercel/project.json: run \`vercel link --scope ${options.scope} --project ${RELEASE_DEFAULTS.project}\` once in ${root}`;
      if (runner.dryRun) runner.note(`would stop: ${hint}`); else throw new Error(hint);
    }
  }
  try {
    await runner.run([npm, 'ci'], { cwd: dir, env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' } });
    await runner.run([vercelBin(), 'pull', '--yes', '--environment=production', '--scope', options.scope], { cwd: dir });
    for (const file of [join(dir, '.vercel', '.env.production.local'), join(dir, '.env.local')]) {
      if (runner.dryRun) { runner.note(`drop redacted VITE_*="[SENSITIVE]" lines from ${file}`); continue; }
      if (!existsSync(file)) continue;
      const { text, dropped } = stripRedactedPublicEnv(readFileSync(file, 'utf8'));
      if (dropped.length) { writeFileSync(file, text); runner.note(`dropped redacted public settings: ${dropped.join(' ')}`); }
    }
    await runner.run([vercelBin(), 'build', '--prod', '--yes', '--scope', options.scope], { cwd: dir });
    // the build's install step rewrites the lockfile; it never changes what ships
    await runner.run(['git', 'checkout', '--', 'package-lock.json'], { cwd: dir });
    if (!runner.dryRun) {
      const dirty = gitText(dir, 'status', '--porcelain', '--untracked-files=no');
      if (dirty) throw new Error(`the build left tracked changes in ${dir}:\n${dirty}`);
    }
    if (runner.dryRun || existsSync(join(dir, 'tools', 'vercel-output-immutable.mjs'))) {
      await runner.run(['node', 'tools/vercel-output-immutable.mjs'], { cwd: dir });
      await runner.run(['node', 'tools/vercel-output-immutable.mjs', '--check'], { cwd: dir });
    } else runner.note(`tools/vercel-output-immutable.mjs is not in ${commit.slice(0, 12)}: no per-file immutable routes`);
  } finally {
    deletePulledEnvFiles(dir, runner);
  }
  runner.note(`${runner.dryRun ? 'would build' : 'built'} ${commit.slice(0, 12)} in ${dir}; next: node tools/release.mjs deploy ${commit.slice(0, 12)}${options.dir ? ` --dir=${dir}` : ''}`);
}

async function deploy(options, { root, runner, fetchImpl }) {
  const commit = resolveCommit(root, options.sha);
  const dir = buildDir(options, commit);
  await checkVercelCli(runner);
  if (!runner.dryRun && !existsSync(join(dir, '.vercel', 'output'))) throw new Error(`no prebuilt output in ${dir}: node tools/release.mjs build ${options.sha}`);
  if (!runner.dryRun && gitText(dir, 'rev-parse', 'HEAD') !== commit) throw new Error(`${dir} holds another commit`);
  let slug = null;
  try { slug = githubSlug(gitText(root, 'remote', 'get-url', 'origin')); } catch { /* defaults */ }
  const metadata = deployMetadata({ commit, subject: gitText(root, 'log', '-1', '--format=%s', commit),
    author: gitText(root, 'log', '-1', '--format=%an', commit), title: options.title, ref: options.ref,
    org: slug?.org, repo: slug?.repo && slug.repo.toLowerCase() === RELEASE_DEFAULTS.githubRepo.toLowerCase() ? RELEASE_DEFAULTS.githubRepo : slug?.repo });
  const result = await runner.run([vercelBin(), 'deploy', '--prebuilt', '--prod', '--yes', '--scope', options.scope, ...metadata], { cwd: dir, capture: true });
  const url = /https:\/\/[\w.-]+\.vercel\.app/.exec(`${result.stdout}\n${result.stderr}`)?.[0];
  runner.note(`deployment ${url ?? '(url printed above)'}`);
  if (options.verify) await verify({ ...options, attempts: Math.max(options.attempts, 12) }, { root, runner, fetchImpl });
  if (!options.keep) await runner.run(['git', 'worktree', 'remove', '--force', dir], { cwd: root });
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

export async function verify(options, { root, runner, fetchImpl = fetch, sleep = (ms) => new Promise((done) => setTimeout(done, ms)) }) {
  const commit = /^[0-9a-f]{40}$/.test(options.sha) ? options.sha : resolveCommit(root, options.sha);
  const site = `${options.site}/`;
  if (runner.dryRun) {
    runner.note(`GET ${site} until its application-version stamp names ${commit.slice(0, 9)} (${options.attempts} x ${options.intervalMs / 1000} s)`);
    if (options.sweep) runner.note('GET every /assets chunk the served index names (200 each); HEAD a missing chunk (must stay uncacheable)');
    return true;
  }
  let stamp = null, html = '';
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    html = await fetchText(fetchImpl, site);
    stamp = parseVersionStamp(html);
    if (stampNames(stamp, commit)) break;
    if (attempt < options.attempts) await sleep(options.intervalMs);
  }
  if (!stampNames(stamp, commit)) throw new Error(`${site} serves ${stamp?.version ?? 'no version stamp'}, not ${commit.slice(0, 9)}`);
  runner.note(`${site} serves ${stamp.version}`);
  if (options.sweep) {
    const failures = [];
    for (const path of chunkPaths(html)) {
      const response = await fetchImpl(`${options.site}${path}`, { method: 'GET' });
      if (response.status !== 200) failures.push(`${path}:${response.status}`);
    }
    if (failures.length) throw new Error(`chunks the served index names do not answer 200: ${failures.join(' ')}`);
    const missing = await fetchImpl(`${options.site}/assets/main-DOESNOTEXIST1.js`, { method: 'HEAD' });
    const cacheControl = missing.headers.get('cache-control');
    if (cacheControlIsLong(cacheControl)) throw new Error(`a missing /assets path is cacheable (${cacheControl}); the edge would keep the 404`);
    runner.note(`chunk sweep: ${chunkPaths(html).length} chunks answer 200; a missing chunk is ${cacheControl ?? 'uncached'}`);
  }
  return true;
}

async function rollback(options, { root, runner, fetchImpl = fetch }) {
  let target = options.to;
  await checkVercelCli(runner);
  if (!target) {
    const list = [vercelBin(), 'list', RELEASE_DEFAULTS.project, '--environment', 'production', '--status', 'READY', '--format', 'json', '--limit', '20', '--scope', options.scope];
    if (runner.dryRun) {
      runner.note(`read the live stamp from ${options.site}/`);
      await runner.run(list, { cwd: root });
      runner.note('pick the newest READY production deployment older than the live one, with another commit');
      target = '<previous production deployment>';
    } else {
      const served = parseVersionStamp(await fetchText(fetchImpl, `${options.site}/`));
      const listing = JSON.parse((await runner.run(list, { cwd: root, capture: true })).stdout);
      const previous = previousProductionDeployment(listing, served?.revision);
      if (!previous) throw new Error('no earlier READY production deployment to promote; pass --to=<deployment>');
      target = previous.url ?? previous.uid;
      runner.note(`live ${served?.version ?? '(no stamp)'}; promoting ${target} (${previous.commit.slice(0, 12) || 'unknown commit'})`);
    }
  }
  await runner.run([vercelBin(), 'promote', target, '--yes', '--scope', options.scope], { cwd: root });
  runner.note('promote also re-enables production-domain auto-assignment; confirm with node tools/release.mjs verify <promoted sha>');
}

async function workers(options, { root, runner }) {
  const commit = resolveCommit(root, options.sha);
  const subject = gitText(root, 'log', '-1', '--format=%s', commit);
  const dir = join(tmpdir(), `cot-workers-${commit.slice(0, 12)}`);
  const available = readdirSync(join(root, 'cloudflare'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const names = options.only ? [options.only] : available;
  if (options.only && !available.includes(options.only)) throw new Error(`no Worker cloudflare/${options.only}; expected ${available.join(' or ')}`);
  if (existsSync(dir)) throw new Error(`${dir} exists; remove it (git worktree remove --force ${dir})`);
  await runner.run(['git', 'worktree', 'add', '--detach', dir, commit], { cwd: root });
  try {
    for (const name of names) {
      const workerDir = join(dir, 'cloudflare', name);
      await runner.run([npm, 'ci'], { cwd: workerDir });
      await runner.run([npm, 'run', 'typecheck'], { cwd: workerDir });
      await runner.run([npm, 'test'], { cwd: workerDir });
      await runner.run([npx, ...workerDeployArgs({ commit, subject })], { cwd: workerDir });
    }
  } finally {
    await runner.run(['git', 'worktree', 'remove', '--force', dir], { cwd: root });
  }
  runner.note(`Workers ${names.join(', ')} ${runner.dryRun ? 'would deploy' : 'deployed'} at ${commit.slice(0, 12)}; roll back with \`npx wrangler rollback\` in the Worker's directory (never across a Durable Object migration tag)`);
}

async function clean(options, { root, runner }) {
  const dir = buildDir(options, resolveCommit(root, options.sha));
  if (!runner.dryRun && !existsSync(dir)) { runner.note(`nothing to clean at ${dir}`); return; }
  await runner.run(['git', 'worktree', 'remove', '--force', dir], { cwd: root });
}

export async function runRelease(options, { root = REPO_ROOT, runner = createRunner({ dryRun: options.dryRun }), fetchImpl = fetch } = {}) {
  const commands = { build, deploy, verify, rollback, workers, clean };
  await commands[options.command](options, { root, runner, fetchImpl });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options;
  try { options = parseReleaseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
  if (options) {
    try { await runRelease(options); }
    catch (error) { console.error(`[release] ${options.command} failed: ${error.message}`); process.exitCode = 1; }
  }
}
