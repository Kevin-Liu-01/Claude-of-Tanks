/**
 * The match build line (2026-10-13, MP stream plan step 13; src/mp/wire/matchBuild.ts): computed once at build time by
 * vite.config.ts and defined as `__COT_MATCH_BUILD__`, so every page and the host Worker of one build carry the same
 * line in their HELLO and the host can refuse a seat whose prediction code differs from its authority's.
 *
 * Each digest is the first 12 hex characters of a SHA-256 over the sorted source closure of its entries: every file a
 * relative static or dynamic import reaches (type-only imports skipped: they change no behaviour), as path and bytes.
 * Bare specifiers (three, the platform) are not followed; they move with package-lock, which is not what this guards.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { formatMatchBuild } from '../src/mp/wire/matchBuild.ts';

/** What a seat predicts with: the predictor, its collision world, the match client, the vehicle specs it reads. */
export const PREDICTION_ENTRIES: readonly string[] = Object.freeze([
  'src/mp/match/prediction.ts',
  'src/mp/presentation/predictionWorld.ts',
  'src/mp/match/matchClient.ts',
  'src/vehicles/specs.ts',
]);
/** What a host runs: the actor (the authority, its world and fleet) and the host core around it. */
export const AUTHORITY_ENTRIES: readonly string[] = Object.freeze([
  'server/match/matchActor.ts',
  'src/mp/host/matchHostCore.ts',
]);

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"\n]+)['"]|import\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const SOURCE_RE = /\.(?:ts|mts|mjs|js|json)$/;

type ReadSource = (absolutePath: string) => string;

/** Every source file the entries reach through relative imports, as root-relative paths, sorted. */
export function sourceClosure(root: string, entries: readonly string[], read: ReadSource = (path) => readFileSync(path, 'utf8'),
  exists: (absolutePath: string) => boolean = existsSync): string[] {
  const seen = new Set<string>();
  const stack = entries.map((entry) => resolve(root, entry));
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith('.json')) {
      for (const match of read(file).matchAll(IMPORT_RE)) {
        if (match[1]) continue;
        const specifier = match[2] ?? match[3];
        if (!specifier || !specifier.startsWith('.')) continue;
        const target = resolve(dirname(file), specifier);
        if (SOURCE_RE.test(target) && exists(target)) stack.push(target);
      }
    }
  }
  return [...seen].map((file) => relative(root, file)).sort();
}

/** The first 12 hex characters of SHA-256 over each file's path and bytes, in order. */
export function closureDigest(root: string, files: readonly string[], read: ReadSource = (path) => readFileSync(path, 'utf8')): string {
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update('\0').update(read(resolve(root, file))).update('\0');
  return hash.digest('hex').slice(0, 12);
}

function commitSeconds(root: string): number {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const seconds = Number(out);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  } catch { return 0; }
}

/** This tree's match build line (`appVersion` from tools/appVersion.ts). */
export function resolveMatchBuild(root: string, appVersion: string, read?: ReadSource): string {
  return formatMatchBuild({
    version: appVersion,
    committedAt: commitSeconds(root),
    prediction: closureDigest(root, sourceClosure(root, PREDICTION_ENTRIES, read), read),
    authority: closureDigest(root, sourceClosure(root, AUTHORITY_ENTRIES, read), read),
  });
}
