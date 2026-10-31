// The test commands (test:lane, test:recommend) exit with their children (266, Main: a 600 s alarm on `npm run test:lane`
// killed npm and left the node child running): SIGALRM and SIGTERM stop the command and every child it tracks
// (tools/test-diff.mjs exitWithParent, runTracked). The negative control: a child spawned untracked outlives a SIGTERM'd
// command. And a signal lands during a synchronous selection (266, the M60 lane: a 2,904-path dry run ignored its alarm
// for 11 minutes): with no tracked child no listener holds the signal back, so the default action ends the command at
// once; the control, a listener attached during the busy loop, keeps it running. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const helpers = JSON.stringify(new URL('./test-diff.mjs', import.meta.url).href);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const settle = async (pid, ms) => { for (let wait = 0; wait < ms / 100 && alive(pid); wait++) await new Promise((done) => setTimeout(done, 100)); };

/** Start a command that runs one long child, signal it, and report whether the child is still running 5 s later. */
async function survives(signal, { tracked }) {
  // the child holds none of the command's stdio (an orphan holding its stdout would keep this receipt waiting)
  const start = tracked ? "runTracked(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })"
    : "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })";
  const script = `import { spawn } from 'node:child_process'; import { exitWithParent, runTracked } from ${helpers};
exitWithParent(); const run = ${start}; console.log((run.child ?? run).pid); await new Promise(() => setInterval(() => {}, 1000));`;
  const command = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
  const child = await new Promise((done) => command.stdout.once('data', (chunk) => done(Number(String(chunk).trim()))));
  await new Promise((done) => setTimeout(done, 500)); // the child's own start
  command.kill(signal);
  await new Promise((done) => command.once('exit', done));
  await settle(child, 5000);
  const running = alive(child);
  if (running) process.kill(child, 'SIGKILL'); // this receipt's own child
  return running;
}

for (const signal of ['SIGALRM', 'SIGTERM']) {
  assert.equal(await survives(signal, { tracked: true }), false, `${signal}: the tracked child stops with its command`);
}
assert.equal(await survives('SIGTERM', { tracked: false }), true, 'negative control: an untracked child outlives its command');

/** A command busy in a synchronous loop for 20 s: does `signal` end it within 3 s? */
async function endsWhileBusy(signal, { listener = false, afterChild = false } = {}) {
  const script = `import { exitWithParent, runTracked } from ${helpers}; exitWithParent();
${afterChild ? "await runTracked(process.execPath, ['-e', ''], { stdio: 'ignore' });" : ''}
${listener ? `process.on('${signal}', () => process.exit(1));` : ''} console.log('busy'); const end = Date.now() + 20_000; while (Date.now() < end) {}`;
  const command = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((done) => command.stdout.once('data', done));
  const exited = new Promise((done) => command.once('exit', () => done(true)));
  command.kill(signal);
  const ended = await Promise.race([exited, new Promise((done) => setTimeout(() => done(false), 3000))]);
  if (!ended) command.kill('SIGKILL'); // this receipt's own command
  return ended;
}

for (const signal of ['SIGALRM', 'SIGTERM']) {
  assert.equal(await endsWhileBusy(signal), true, `${signal} ends a command busy in a synchronous selection`);
}
assert.equal(await endsWhileBusy('SIGALRM', { afterChild: true }), true, 'and after a tracked child finished (its listeners come off again)');
assert.equal(await endsWhileBusy('SIGALRM', { listener: true }), false, 'negative control: a listener holds the alarm until the loop yields');

console.log('test-commands-exit.selftest: SIGALRM and SIGTERM stop the command and its tracked child (an untracked one is orphaned) and land during a synchronous selection (a held listener does not)');
