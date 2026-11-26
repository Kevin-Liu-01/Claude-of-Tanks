// The /tmp paths tools/no-tmp-state.mjs allows: locks, queues and scratch a reboot should clear, each with its reason
// (practice audit 2026-11-26, mechanism 10). An entry that matches no line any more fails tools/no-tmp-state.selftest.mjs.

/** Each allowed line: its file, a fragment of the line, and why /tmp is right for it. */
export const ALLOWED = Object.freeze([
  { file: 'tools/capture-lock.mjs', includes: "'/tmp/cot-shots.lock'", why: 'the lock: a reboot ends every hold, so it should clear' },
  { file: 'tools/capture-lock.mjs', includes: "'/tmp/cot-shots.queue'", why: 'the queue: a reboot ends every waiter, so it should clear' },
  { file: 'tools/capture-lock.mjs', includes: "PRE_AUDIT_LOG_FILE = '/tmp/cot-shots.log'",
    why: 'read only, by --status, while lanes on an older base still write there' },
  { file: 'tools/visual-census-lock.mjs', includes: "'/tmp/cot-shots.queue'", why: 'the capture lock queue (see capture-lock.mjs)' },
  { file: 'tools/visual-census-lock.mjs', includes: "'/tmp/cot-shots.lock'", why: 'the capture lock (see capture-lock.mjs)' },
  { file: 'tools/selftest-cache.mjs', includes: 'return join(tmpdir(), `cot-selftests-v',
    why: 'the pre-audit $TMPDIR store that selftest-cache-dir.mjs moves to ~/.cache; editing this file salts every proof key' },
  { file: 'tools/run-selftests.mjs', includes: 'NODE_COMPILE_CACHE: join(tmpdir(), `cot-selftest-compile-',
    why: "Node's compile cache rebuilds in seconds, and a durable copy would grow without bound" },
  { file: 'tools/release.mjs', includes: 'join(tmpdir(), `cot-release-${commit.slice(0, 12)}`)',
    why: 'a release build: after a reboot it is rebuilt from the gated commit, never deployed from a stale tree' },
  { file: 'tools/release.mjs', includes: 'join(tmpdir(), `cot-workers-${commit.slice(0, 12)}`)', why: 'as the release build' },
  { file: 'tools/gate.mjs', includes: 'join(tmpdir(), `cot-gate-preflight-', why: 'a reusable worktree the gate re-creates when it is gone' },
  { file: 'tools/black-world-repro.mjs', includes: 'path.dirname(dir) !== tmpdir()', why: 'a guard that removes only its own mkdtemp dir' },
  { file: 'tools/media-r5/tank-share.mjs', includes: 'frameDir = tmpdir()', why: 'scratch frames a render writes and reads in one run' },
  { file: 'tools/media-r5/master-filter.mjs', includes: "workDir = join(tmpdir(), 'cot-master-filter')", why: 'scratch PNG masters, re-made on every publish' },
  { file: 'tools/marketing-shots/publish-feature-evidence.mjs', includes: "join(tmpdir(), 'cot-master-filter', 'gallery')", why: 'as master-filter.mjs' },
  { file: 'tools/marketing-shots/publish-presentation-r1.mjs', includes: "join(tmpdir(), 'cot-master-filter', 'presentation')", why: 'as master-filter.mjs' },
  { file: 'tools/marketing-shots/publish-showcase-r2.mjs', includes: "join(tmpdir(), 'cot-master-filter', 'showcase')", why: 'as master-filter.mjs' },
]);
