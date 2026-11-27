// What `npm run typecheck` (tools/typecheck.mjs) checks, and the one list of what it does not (typecheck-coverage-279).
//
// Every tracked script file has exactly one owner:
// - tsc: a .ts/.tsx/.mts/.cts file the compile of tsconfig.json lists (its include set, or reached by an import) and
//   that does not opt out with `// @ts-nocheck`. TypeScript reports every error class there, a name out of scope
//   (TS2304) included.
// - oxlint: a .js/.mjs/.cjs file outside .oxlintrc.json's ignorePatterns, with no file-wide disable. JavaScript has no
//   compiler here; the lint's no-undef (its JavaScript override) is what catches a name out of scope.
// - TYPECHECK_EXCLUDED below: a pattern with the reason and what checks those files instead.
// A file with no owner fails the typecheck, and so does an exclusion that covers nothing or a file a checker owns.
//
// Why (2026-11-24, dome-detail-275): a lane read "TypeScript 7 clean" while props.ts used two names out of scope, and
// only a receipt's runtime ReferenceError caught them. The compile had reported both: the lane read its last line
// through `| tail -1`, and that line was oxlint's. typecheck.mjs now ends every run with one PASSED or FAILED line.
// The search for the gap found a real one: oxlint's `src/vehicles/profiles/**` ignore, meant for the hash-pinned
// profile sources, hid 358 receipts and helpers there from no-undef, while tsc never reads .mjs. Nothing checked them.
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join, matchesGlob, relative, sep } from 'node:path';

/** Script files the census owns. */
export const SCRIPT_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const TS_FILE = /\.(?:ts|tsx|mts|cts)$/;

/** Tracked script files neither checker reads, each with why and what checks them instead. */
export const TYPECHECK_EXCLUDED = Object.freeze([
  {
    pattern: 'cloudflare/rooms/**',
    reason: 'the rooms Worker is its own package (own install, wrangler-generated worker types): '
      + '`npm run typecheck:rooms` compiles both its tsconfigs, and roomWorkerProgram.selftest runs it where installed',
  },
  {
    pattern: 'cloudflare/telemetry/**',
    reason: 'the telemetry Worker is its own package (own install, wrangler-generated worker types): '
      + '`npm run typecheck:telemetry:cloudflare` compiles it',
  },
]);

// A file-wide opt-out: tsc skips a file that says so, and a block disable with no rule list (or one naming no-undef)
// turns the lint's scope check off for the whole file. Both are comments that open a line: the same text inside a
// string (a receipt's fixture source) opts nothing out.
const TS_NOCHECK = /^\s*\/\/\s*@ts-nocheck\b/m;
const LINT_FILE_DISABLE = /^\s*\/\*\s*(?:eslint|oxlint)-disable(?:\s+[^*]*\bno-undef\b[^*]*)?\s*\*\//m;

/** .oxlintrc.json's ignorePatterns (the file is JSON with line comments). */
export function lintIgnorePatterns(root) {
  const text = readFileSync(join(root, '.oxlintrc.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(text).ignorePatterns ?? [];
}

/** The tracked script files, repository-relative. */
export function trackedScripts(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\0').filter((file) => SCRIPT_FILE.test(file));
}

/** The repository files a `tsc --listFiles` output names (absolute paths; node_modules and outside files dropped). */
export function listedSources(root, lines) {
  // The compiler prints real paths: compare with the root's own (a checkout reached through a link, /var's /private).
  let real = root;
  try { real = realpathSync(root); } catch { /* a fixture's root that does not exist */ }
  const prefix = real.endsWith(sep) ? real : real + sep;
  const listed = new Set();
  for (const line of lines) {
    if (!line.startsWith(prefix)) continue;
    const file = relative(real, line).split(sep).join('/');
    if (!file.startsWith('node_modules/')) listed.add(file);
  }
  return listed;
}

/**
 * The census: { owner: { tsc: [], oxlint: [] }, excluded: [{ pattern, files }], unchecked: [{ file, why }],
 * staleExclusions: [{ pattern, why }], ok }.
 * - tracked: repository-relative script files; tscListed: the Set the compile listed; lintIgnore: oxlint's patterns;
 *   source(file): its text (for the file-wide opt-outs).
 */
export function typecheckCoverage({ tracked, tscListed, lintIgnore, source, excluded = TYPECHECK_EXCLUDED }) {
  const owner = { tsc: [], oxlint: [] }, unchecked = [], staleExclusions = [];
  const hits = new Map(excluded.map(({ pattern }) => [pattern, []]));
  for (const file of tracked) {
    let why = null;
    if (TS_FILE.test(file)) {
      if (!tscListed.has(file)) why = 'outside the compile of tsconfig.json (its include set, or an import)';
      else if (TS_NOCHECK.test(source(file))) why = 'listed by the compile but opts out with // @ts-nocheck';
      else { owner.tsc.push(file); continue; }
    } else {
      const ignore = lintIgnore.find((pattern) => matchesGlob(file, pattern));
      if (ignore) why = `JavaScript under oxlint's ignore pattern ${ignore} (tsc reads no JavaScript)`;
      else if (LINT_FILE_DISABLE.test(source(file))) why = 'JavaScript with a file-wide lint disable (no-undef off)';
      else { owner.oxlint.push(file); continue; }
    }
    const entry = excluded.find(({ pattern }) => matchesGlob(file, pattern));
    if (entry) hits.get(entry.pattern).push(file);
    else unchecked.push({ file, why });
  }
  for (const { pattern } of excluded) {
    if (!hits.get(pattern).length) staleExclusions.push({ pattern, why: 'covers no unchecked tracked file' });
  }
  // An exclusion may not reach a file a checker owns: it would read as a hole where there is none, and hide one later.
  for (const file of [...owner.tsc, ...owner.oxlint]) {
    const entry = excluded.find(({ pattern }) => matchesGlob(file, pattern));
    if (entry) staleExclusions.push({ pattern: entry.pattern, why: `covers ${file}, which a checker owns` });
  }
  return {
    owner, unchecked, staleExclusions,
    excluded: excluded.map(({ pattern }) => ({ pattern, files: hits.get(pattern) })),
    ok: !unchecked.length && !staleExclusions.length,
  };
}

/** The census's report lines for a failing typecheck. */
export function coverageReport(census) {
  return [
    ...census.unchecked.map(({ file, why }) => `${file}: not typechecked: ${why}`),
    ...census.staleExclusions.map(({ pattern, why }) => `tools/typecheck-coverage.mjs: exclusion ${pattern} ${why}`),
  ];
}

/** One line for a passing run: what each checker owns. */
export function coverageSummary(census) {
  const excludedFiles = census.excluded.reduce((sum, { files }) => sum + files.length, 0);
  return `typecheck: coverage: TypeScript checked ${census.owner.tsc.length} tracked files, oxlint's no-undef `
    + `${census.owner.oxlint.length} JavaScript files; ${excludedFiles} excluded (tools/typecheck-coverage.mjs)`;
}
