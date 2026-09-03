import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const APP_VERSION_TOKEN = '{{COT_APP_VERSION}}';

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const REVISION_ENV_KEYS = Object.freeze([
  'COT_BUILD_REVISION',
  'VERCEL_GIT_COMMIT_SHA',
  'GITHUB_SHA',
  'CF_PAGES_COMMIT_SHA',
  'COMMIT_REF',
]);

type BuildEnvironment = Readonly<Record<string, string | undefined>>;

function normalizedRevision(value: unknown): string {
  const match = String(value || '').trim().match(/^[0-9a-f]{7,40}$/i);
  return match ? match[0].toLowerCase().slice(0, 9) : '';
}

function gitOutput(root: string, args: readonly string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function formatAppVersion(
  packageVersion: string,
  revision = '',
  dirty = false,
): string {
  const version = String(packageVersion || '').trim();
  if (!SEMVER_RE.test(version)) {
    throw new Error(`[app-version] package.json contains invalid semver: ${version || '(empty)'}`);
  }

  const plus = version.indexOf('+');
  const core = plus === -1 ? version : version.slice(0, plus);
  const metadata = plus === -1 ? [] : [version.slice(plus + 1)];
  const shortRevision = normalizedRevision(revision);
  if (shortRevision) metadata.push(`g${shortRevision}`);
  if (dirty) metadata.push('dirty');
  return `v${core}${metadata.length ? `+${metadata.join('.')}` : ''}`;
}

export function resolveAppVersion(root: string, env: BuildEnvironment = process.env): string {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    version?: string;
  };
  const envRevision = REVISION_ENV_KEYS
    .map((key) => normalizedRevision(env[key]))
    .find(Boolean) || '';
  const revision = envRevision || normalizedRevision(gitOutput(root, ['rev-parse', 'HEAD']));
  const dirty = !envRevision && Boolean(gitOutput(root, [
    'status', '--porcelain', '--untracked-files=normal',
  ]));
  return formatAppVersion(packageJson.version || '', revision, dirty);
}

export function replaceAppVersionTokens(html: string, version: string): string {
  return html.replaceAll(APP_VERSION_TOKEN, version);
}
