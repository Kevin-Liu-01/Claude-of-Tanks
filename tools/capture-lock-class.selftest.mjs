// The lock class a hold gets by default is visible (2026-11-02 audit S4). A command whose script names match neither the
// timing nor the render patterns is classed timing, an exclusive hold: kept (a render read as timing costs throughput; a
// timing hold read as a render would share the GPU with what it measures), but no longer silent. The acquire says so once
// per process, the owner record and the hold log carry `classFrom: 'default'`, and the media renderers, which rendered
// under the default, name their class.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyCommand, createCaptureLock } from './capture-lock.mjs';

const LOCK_ENV = [...new Set([...readFileSync(new URL('./capture-lock.mjs', import.meta.url), 'utf8')
  .matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]))];
for (const name of LOCK_ENV) delete process.env[name];
const root = mkdtempSync(join(tmpdir(), 'cot-lock-class-'));
try {
  assert.deepEqual(classifyCommand('node tools/media-production/cinema.mjs --jobs=a.json'), { lockClass: 'timing', from: 'default' },
    'the film renderer\'s name matches neither pattern');
  const lines = [];
  const lockDir = join(root, 'lock'), logFile = join(root, 'holds.log');
  const lock = createCaptureLock({ lockDir, queueDir: join(root, 'queue'), logFile, log: (line) => lines.push(line) });
  for (let i = 0; i < 2; i++) {
    await lock.acquire(2_000, { command: 'node tools/some-unnamed-tool.mjs' });
    if (i === 0) assert.equal(JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf8')).classFrom, 'default', 'the owner record says how it was classed');
    lock.release();
  }
  const notes = lines.filter((line) => /classed timing by default/.test(line));
  assert.equal(notes.length, 1, `a defaulted class is said once per process (${lines.join(' | ')})`);
  assert.match(notes[0], /some-unnamed-tool\.mjs.*pass lockClass/);
  await lock.acquire(2_000, { command: 'node tools/some-unnamed-tool.mjs', lockClass: 'render' });
  lock.release();
  await lock.acquire(2_000, { command: 'node tools/perf-probe.mjs' });
  lock.release();
  assert.equal(lines.filter((line) => /classed timing by default/.test(line)).length, 1, 'a named class or a matched script says nothing');
  const holds = readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((record) => record.e === 'hold');
  assert.deepEqual(holds.map((record) => record.classFrom), ['default', 'default', 'lockClass', 'command'], 'the hold log keeps it');
  // the media renderers name their class at the call
  for (const rel of ['./media-production/cinema.mjs', './media-production/produce.mjs']) {
    // (round 2 U38) held through the one wrapper's open form, which takes the acquire options
    assert.match(readFileSync(new URL(rel, import.meta.url), 'utf8'), /openCaptureHold\(\{[^\n]*lockClass: 'render'/, `${rel} names its class`);
  }
  console.log('capture-lock-class.selftest: a defaulted (exclusive) class is said once and recorded; the media renderers name theirs');
} finally {
  rmSync(root, { recursive: true, force: true });
}
