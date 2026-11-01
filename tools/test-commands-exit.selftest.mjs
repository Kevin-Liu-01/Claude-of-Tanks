// The test commands (test:lane, test:recommend) exit with their children (266, Main: a 600 s alarm on `npm run test:lane`
// killed npm and left the node child running): SIGALRM and SIGTERM stop the command and every child it tracks
// (tools/test-diff.mjs exitWithParent, runTracked). The negative control: a child spawned untracked outlives a SIGTERM'd
// command. And a signal lands during a synchronous selection (266, the M60 lane: a 2,904-path dry run ignored its alarm
// for 11 minutes): with no tracked child no listener holds the signal back, so the default action ends the command at
// once; the control, a listener attached during the busy loop, keeps it running. First-party tooling: Kevin B. Liu.
// (267, load 339: a fixed 5 s settle read a tracked child still stopping as one that outlived its command.) Each wait is on
// the event itself: a child's start on its own ready line, its stop on its pid going away (a generous cap fails with the
// pid named), a command's end on its exit and how it ended. The windows that must stay open are measured: an untracked or
// signal-ignoring child must outlive four times the slowest stop the tracked children took.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const helpers = JSON.stringify(new URL('./test-diff.mjs', import.meta.url).href);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const STOP_CAP_MS = 60_000;
/** Wait until `pid` is gone, at most `capMs`: the ms it took, or null when it still runs. */
async function waitGone(pid, capMs) {
  const from = performance.now();
  while (alive(pid)) {
    if (performance.now() - from > capMs) return null;
    await new Promise((done) => setTimeout(done, 20));
  }
  return performance.now() - from;
}
// a child that says when it is ready (its signal handling set up), then idles; `ignore` keeps it through a SIGTERM
const childSource = (ignore) => `${ignore ? "process.on('SIGTERM', () => {});" : ''} console.log('ready'); setInterval(() => {}, 1000);`;

/** Start a command that runs one long child, signal it once the child is ready: the command and its child's pid. */
async function commandWithChild(signal, { tracked, ignore = false }) {
  // the child's stdout is the command's pipe, not this receipt's (an orphan holding it would keep the receipt waiting)
  const start = `${tracked ? 'runTracked' : 'spawn'}(process.execPath, ['-e', ${JSON.stringify(childSource(ignore))}], { stdio: ['ignore', 'pipe', 'ignore'] })`;
  const script = `import { spawn } from 'node:child_process'; import { exitWithParent, runTracked } from ${helpers};
exitWithParent(); const run = ${start}; const child = run.child ?? run;
child.stdout.once('data', () => console.log(child.pid)); await new Promise(() => setInterval(() => {}, 1000));`;
  const command = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
  const child = await new Promise((done) => command.stdout.once('data', (chunk) => done(Number(String(chunk).trim()))));
  const exited = new Promise((done) => command.once('exit', done));
  command.kill(signal);
  await exited;
  return child;
}

const stopMs = [];
for (const signal of ['SIGALRM', 'SIGTERM']) {
  const child = await commandWithChild(signal, { tracked: true });
  const took = await waitGone(child, STOP_CAP_MS);
  if (took === null) process.kill(child, 'SIGKILL'); // this receipt's own child
  assert.ok(took !== null, `${signal}: the tracked child ${child} still ran ${STOP_CAP_MS / 1000} s after its command stopped`);
  stopMs.push(took);
}
// the controls must outlive the stops just measured, four times over (2 s at least)
const outliveMs = Math.max(2000, 4 * Math.max(...stopMs));
for (const [label, options] of [['an untracked child', { tracked: false }], ['a tracked child that ignores SIGTERM', { tracked: true, ignore: true }]]) {
  const child = await commandWithChild('SIGTERM', options);
  const took = await waitGone(child, outliveMs);
  if (took === null) process.kill(child, 'SIGKILL'); // this receipt's own child
  assert.equal(took, null, `negative control: ${label} outlives its command (it stopped after ${took?.toFixed(0)} ms)`);
}

/** A command busy in a synchronous loop: how it ends after `signal`, `signal` (its default action) or `code N` (a listener). */
async function endWhileBusy(signal, { listener = false, afterChild = false } = {}) {
  // the listener's run is short and then idles, so the held signal lands whenever it arrives; the others stay busy 20 s
  const script = `import { exitWithParent, runTracked } from ${helpers}; exitWithParent();
${afterChild ? "await runTracked(process.execPath, ['-e', ''], { stdio: 'ignore' });" : ''}
${listener ? `process.on('${signal}', () => process.exit(1));` : ''} console.log('busy'); const end = Date.now() + ${listener ? 2000 : 20_000}; while (Date.now() < end) {}
await new Promise(() => setInterval(() => {}, 1000));`;
  const command = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((done) => command.stdout.once('data', done));
  const exited = new Promise((done) => command.once('exit', (code, endedBy) => done(endedBy ?? `code ${code}`)));
  command.kill(signal);
  let timer;
  const ended = await Promise.race([exited, new Promise((done) => { timer = setTimeout(() => done(null), STOP_CAP_MS); })]);
  clearTimeout(timer);
  if (ended === null) command.kill('SIGKILL'); // this receipt's own command
  assert.ok(ended !== null, `${signal}: the busy command ${command.pid} still ran ${STOP_CAP_MS / 1000} s after it`);
  return ended;
}

for (const signal of ['SIGALRM', 'SIGTERM']) {
  assert.equal(await endWhileBusy(signal), signal, `${signal} ends a command busy in a synchronous selection`);
}
assert.equal(await endWhileBusy('SIGALRM', { afterChild: true }), 'SIGALRM', 'and after a tracked child finished (its listeners come off again)');
assert.equal(await endWhileBusy('SIGALRM', { listener: true }), 'code 1', 'negative control: a listener holds the alarm until the loop yields');

console.log(`test-commands-exit.selftest: SIGALRM and SIGTERM stop the command and its tracked child (in ${stopMs.map((ms) => ms.toFixed(0)).join(' and ')} ms; an untracked or signal-ignoring child outlives ${(outliveMs / 1000).toFixed(1)} s) and end a synchronous selection by their default action (a held listener ends it with its own code)`);
