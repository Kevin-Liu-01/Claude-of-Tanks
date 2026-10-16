// Receipt: tools/tank-id-move-files.mjs moves id-named icons, thumbnails and geometry gate records through a swap
// (leo2a6m_x -> leo2a6m while leo2a6m -> leo2a4_otco) without losing or crossing a file, stages exactly what it
// moved, leaves untracked files alone, and refuses a second run (SSOT 2.19, ID.04/05).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), 'tank-id-move-files.mjs');
const repo = mkdtempSync(join(tmpdir(), 'tank-id-move-receipt-'));
const table = `${repo}-table.json`;
writeFileSync(table, JSON.stringify({ renames: { leo2a6m_x: 'leo2a6m', leo2a6m: 'leo2a4_otco' } }));
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', NODE_OPTIONS: '--max-old-space-size=1024' };
const git = (...argv) => execFileSync('git', ['-c', 'user.name=receipt', '-c', 'user.email=receipt@example.invalid',
  '-c', 'commit.gpgsign=false', ...argv], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const run = (...argv) => spawnSync(process.execPath, [TOOL, `--table=${table}`, '--schema=3', ...argv],
  { cwd: repo, env, encoding: 'utf8', timeout: 60_000 });
const write = (rel, text) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
const read = (rel) => readFileSync(join(repo, rel), 'utf8');

git('init', '-q');
for (const id of ['leo2a6m', 'leo2a6m_x']) {
  write(`public/icons/${id}_angle.webp`, `angle of ${id}`);
  write(`public/icons/${id}_armor_side.png`, `armor of ${id}`);
  write(`public/icons/thumbs/${id}_angle.webp`, `thumb of ${id}`);
}
write('docs/geometry-gate/leo2a6m_x.json', 'gate of leo2a6m_x');
write('public/icons/other_angle.webp', 'another vehicle');
git('add', '-A'); git('commit', '-q', '-m', 'base');
write('public/icons/untracked_note.txt', 'not ours');

let r = run('--dry-run');
assert.equal(r.status, 0, r.stderr);
assert.match(r.stdout, /7 files to move .* 3 land on a name another file gave up/);
r = run('--apply');
assert.equal(r.status, 0, r.stderr);
assert.equal(read('public/icons/leo2a4_otco_angle.webp'), 'angle of leo2a6m', 'the giver moves to its new id');
assert.equal(read('public/icons/leo2a6m_angle.webp'), 'angle of leo2a6m_x', 'the taker lands on the freed name');
assert.equal(read('public/icons/thumbs/leo2a6m_angle.webp'), 'thumb of leo2a6m_x');
assert.equal(read('docs/geometry-gate/leo2a6m.json'), 'gate of leo2a6m_x');
assert.ok(!existsSync(join(repo, 'public/icons/leo2a6m_x_angle.webp')), 'nothing is left under a retired id');
assert.equal(read('public/icons/other_angle.webp'), 'another vehicle', 'other files stay');
const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
assert.ok(!staged.includes('public/icons/untracked_note.txt'), 'only moved paths are staged');
assert.equal(git('status', '--porcelain', '--', 'public/icons/untracked_note.txt').trim(), '?? public/icons/untracked_note.txt');
const before = git('status', '--porcelain');
r = run('--apply');
assert.equal(r.status, 3, 'a second run is refused');
assert.equal(git('status', '--porcelain'), before, 'and changes nothing');
git('commit', '-q', '-m', 'rename tank ids\n\nTank-Id-Schema: 3');
assert.equal(run('--apply').status, 3, 'a tree that holds the rename commit is refused');

console.log('tank-id-move-files selftest: swap moves without crossing, exact staging, single run');
