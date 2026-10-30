// The test commands (test:lane, test:recommend) exit with their children (266, Main: a 600 s alarm on `npm run test:lane`
// killed npm and left the node child running): SIGALRM and SIGTERM stop the command and every child it tracks
// (tools/test-diff.mjs exitWithParent, runTracked). The negative control: without exitWithParent the child outlives a
// SIGTERM'd command. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const helpers = JSON.stringify(new URL('./test-diff.mjs', import.meta.url).href);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Start a command that tracks one long child, signal it, and report whether the child is still running 5 s later. */
async function survives(signal, { guarded }) {
  // the child holds none of the command's stdio (an orphan holding its stdout would keep this receipt waiting)
  const script = `import { exitWithParent, runTracked } from ${helpers};
${guarded ? 'exitWithParent();' : ''} const run = runTracked(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
console.log(run.child.pid); await run;`;
  const command = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
  const child = await new Promise((done) => command.stdout.once('data', (chunk) => done(Number(String(chunk).trim()))));
  await new Promise((done) => setTimeout(done, 500)); // the child's own start
  command.kill(signal);
  await new Promise((done) => command.once('exit', done));
  for (let wait = 0; wait < 50 && alive(child); wait++) await new Promise((done) => setTimeout(done, 100));
  const running = alive(child);
  if (running) process.kill(child, 'SIGKILL'); // this receipt's own child
  return running;
}

for (const signal of ['SIGALRM', 'SIGTERM']) {
  assert.equal(await survives(signal, { guarded: true }), false, `${signal}: the tracked child stops with its command`);
}
assert.equal(await survives('SIGTERM', { guarded: false }), true, 'negative control: without exitWithParent the child outlives its command');

console.log('test-commands-exit.selftest: SIGALRM and SIGTERM stop the command and its tracked child (an unguarded one is orphaned)');
