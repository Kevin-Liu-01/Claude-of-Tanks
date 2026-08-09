#!/usr/bin/env node
/**
 * Inventory QA artifacts without changing them. The output records relative
 * path, size, SHA-256, media kind, and Git-tracked state so a round can prove
 * exactly which evidence existed even when the raw bundle lives elsewhere.
 *
 * Usage:
 *   node tools/qa-evidence-manifest.mjs
 *   node tools/qa-evidence-manifest.mjs --out docs/qa-evidence-manifest.json
 *   node tools/qa-evidence-manifest.mjs --root .qa-round --root shots
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const values = (flag) => args
  .filter((arg) => arg.startsWith(`${flag}=`))
  .map((arg) => arg.slice(flag.length + 1));
const separateValues = (flag) => {
  const out = [];
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag) out.push(args[i + 1]);
  }
  return out;
};
const option = (flag, fallback) => {
  const inline = values(flag).at(-1);
  if (inline !== undefined) return inline;
  const separate = separateValues(flag).at(-1);
  return separate === undefined ? fallback : separate;
};

const cwd = process.cwd();
const requestedRoots = [...separateValues('--root'), ...values('--root')];
const roots = requestedRoots.length
  ? requestedRoots
  : ['.qa-bots', '.qa-dev', '.qa-loading', '.qa-smoke', 'shots'];
const outPath = option('--out', 'docs/qa-evidence-manifest.json');

const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd })
  .toString('utf8').split('\0').filter(Boolean));
const entries = [];

async function walk(relative) {
  const absolute = path.resolve(cwd, relative);
  let info;
  try { info = await stat(absolute); } catch { return; }
  if (info.isDirectory()) {
    const names = await readdir(absolute);
    names.sort((a, b) => a.localeCompare(b));
    for (const name of names) await walk(path.join(relative, name));
    return;
  }
  if (!info.isFile() || path.basename(relative) === '.DS_Store') return;
  const repoPath = path.relative(cwd, absolute).split(path.sep).join('/');
  const bytes = await readFile(absolute);
  const ext = path.extname(repoPath).toLowerCase();
  const kind = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? 'image'
    : ['.json', '.jsonl'].includes(ext) ? 'data'
      : ['.cpuprofile', '.trace'].includes(ext) ? 'profile'
        : 'support';
  entries.push({
    path: repoPath,
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    kind,
    tracked: tracked.has(repoPath),
  });
}

for (const root of roots) await walk(root);
entries.sort((a, b) => a.path.localeCompare(b.path));

const rootSummaries = roots.map((root) => {
  const prefix = root.replace(/\/$/, '') + '/';
  const files = entries.filter((entry) => entry.path === root || entry.path.startsWith(prefix));
  return {
    root,
    files: files.length,
    images: files.filter((entry) => entry.kind === 'image').length,
    bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    tracked: files.filter((entry) => entry.tracked).length,
  };
});

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  note: 'A manifest proves artifact identity; tracked=false bytes still require durable external retention.',
  roots: rootSummaries,
  totals: {
    files: entries.length,
    images: entries.filter((entry) => entry.kind === 'image').length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    tracked: entries.filter((entry) => entry.tracked).length,
  },
  artifacts: entries,
};

await writeFile(path.resolve(cwd, outPath), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`QA manifest: ${manifest.totals.files} files, ${manifest.totals.images} images, ${manifest.totals.bytes} bytes -> ${outPath}`);
