// restore.selftest.mjs — the films' tracked sources recreate their HyperFrames projects (restore.mjs). A dry run of every
// film into a temp dir lists exactly its sources, its decoded music bed where it has one, the shared brand marks and
// fonts and the grain, and writes nothing; a film without a bed restores for real, byte for byte, keeps a local edit
// unless --force, and draws the grain every project had.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { REPO } from '../paths.mjs';
import { BED, FILMS_DIR, SHARED, listFilms, restore } from './restore.mjs';

const FILMS = ['cut-30', 'lineup', 'posters-land', 'posters-port', 'posters-square', 'studio-feature', 'trailer-24h', 'vertical-15'];
const BEDS = new Set(['cut-30', 'lineup', 'trailer-24h', 'vertical-15']);
// motion/build.mjs's grain tile, as every film project carried it on 2026-10-12
const GRAIN_SHA256 = 'c4531f9cd34517fd1fba837ffce9ca8babaf54ab2bed52f5714a7df6ff03f2c1';
const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
  .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name))]));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

assert.deepEqual(listFilms(), FILMS, 'the eight film projects are kept');
const out = mkdtempSync(join(tmpdir(), 'cot-films-restore-'));
try {
  for (const film of FILMS) {
    const sources = walk(join(FILMS_DIR, film));
    assert.equal(sources.includes(BED), BEDS.has(film), `${film}: its music bed is kept exactly when it has one`);
    for (const rel of ['index.html', 'design.md', 'hyperframes.json', 'meta.json', 'package.json']) assert.ok(sources.includes(rel), `${film}: ${rel}`);
    for (const rel of sources) {
      assert.doesNotMatch(rel, /^(?:renders|assets|snap[^/]*|score-[^/]*|node_modules)\/|(?:^|\/)(?:AGENTS|CLAUDE)\.md$|\.(?:bak|log)$/,
        `${film}/${rel}: renders, assets, scores, snapshots, logs and backups stay out of git`);
      if (rel !== BED) assert.ok(readFileSync(join(FILMS_DIR, film, rel)).length <= 1 << 20, `${film}/${rel}: over 1 MB`);
    }
    const { steps } = await restore(film, { out, dry: true });
    const want = [...sources.filter((r) => r !== BED), ...(BEDS.has(film) ? ['music/music-gen.wav'] : []),
      ...SHARED.map(([, rel]) => rel), 'assets/grain.png'].sort();
    assert.deepEqual(steps.map((s) => s.rel), want, `${film}: the restore's file list`);
    for (const s of steps) assert.equal(s.to, join(out, film, s.rel), `${film}: ${s.rel} lands in the project`);
    assert.deepEqual(steps.filter((s) => s.op === 'decode').map((s) => s.rel), BEDS.has(film) ? ['music/music-gen.wav'] : []);
  }
  assert.deepEqual(readdirSync(out), [], 'a dry run writes nothing');

  // a film without a bed, for real: every source and shared asset byte for byte, and the grain
  const film = 'posters-port';
  const first = await restore(film, { out });
  const steps = first.steps;
  assert.equal(first.tally.new.length, steps.length, 'an empty project takes every file');
  for (const s of steps) {
    const have = readFileSync(s.to);
    if (s.op === 'grain') assert.equal(sha256(have), GRAIN_SHA256, 'the grain motion/build.mjs draws');
    else assert.ok(have.equals(readFileSync(s.from)), `${film}: ${s.rel} restored byte for byte`);
  }
  for (const [from, rel] of SHARED) assert.ok(readFileSync(join(out, film, rel)).equals(readFileSync(join(REPO, from))), `${rel} is ${from}`);
  assert.deepEqual(walk(join(out, film)).sort(), steps.map((s) => s.rel), 'nothing else is written');

  // a local edit survives a second restore, and --force puts git's version back
  const index = join(out, film, 'index.html');
  writeFileSync(index, '<!-- a local tweak -->\n');
  const again = await restore(film, { out });
  assert.deepEqual(again.tally.kept, ['index.html']);
  assert.equal(again.tally.same.length, steps.length - 1);
  assert.equal(readFileSync(index, 'utf8'), '<!-- a local tweak -->\n', 'kept without --force');
  const forced = await restore(film, { out, force: true });
  assert.deepEqual(forced.tally.replaced, ['index.html']);
  assert.ok(readFileSync(index).equals(readFileSync(join(FILMS_DIR, film, 'index.html'))), '--force restores the tracked source');
} finally {
  rmSync(out, { recursive: true, force: true });
}
console.log(`restore.selftest: ${FILMS.length} films restore from git (${BEDS.size} with their music beds); a real restore is byte for byte`);
