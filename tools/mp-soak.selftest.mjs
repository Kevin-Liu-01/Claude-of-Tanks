import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SELFTEST_STARVED_EXIT } from './selftest-verdict.mjs';

// The soak measures host time (tick rate, tick cost, stalls, ack lag) in a thread it shares with a loaded machine.
// (267, main's load class: 265's default tier failed four of its gates at load1 22, under the old 1.5×-CPUs load1 skip,
// and passed alone) The skip guessed from the load at the start; the soak now measures what the machine withheld from its
// thread (starvation-meter.mjs) and judges each gate net of it, so it runs at any load. The negative control
// (--plant-stall) spends 400 ms of CPU inside one server tick: the ticks that stall drops must be charged to the server.
// (267, the residual) The input acknowledgement is judged in the server's own ticks over spans that ran on schedule;
// --plant-late-input and --plant-late-ack must exceed its bound, and a server slow on its own thread
// (--plant-slow-server) must fail a server gate. The clients aim their controls with the real client's clock
// (src/mp/match/clock.ts), and a control that left past the server's input ring is set aside and counted: the soak's
// copy of the ring size is pinned to the server's here. A gate the machine starved is the STARVED verdict
// (tools/selftest-verdict.mjs): this receipt exits with it, so the runner reports it apart, neither PASS nor FAIL.
// The short, seeded soak: four headless wire clients (2v2) against the in-process
// match service for 20 s through 40 ms +- 10 ms latency and 2 % replaceable-frame
// loss; every soak gate except the five-minute memory drift and the tick-cost child.
const script = fileURLToPath(new URL('./mp-soak.mjs', import.meta.url));
async function soak(args) {
  const child = spawn(process.execPath, ['--expose-gc', script, '--short', ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
  const code = await new Promise((resolve) => child.on('close', resolve));
  return { code, output };
}
const starvedVerdict = (what, output) => {
  console.log(`mp-soak.selftest: STARVED (${what}: ${output.match(/\[mp-soak\] STARVED: ([^(\n]*)/)?.[1]?.trim() ?? 'gates starved'})`);
  process.exit(SELFTEST_STARVED_EXIT);
};

const ringOf = (file, name) => Number(readFileSync(file, 'utf8').match(new RegExp(`^const ${name} = (\\d+);$`, 'm'))?.[1]);
const serverRing = ringOf(new URL('../server/match/inputBuffer.ts', import.meta.url), 'RING');
assert.ok(Number.isInteger(serverRing), 'the server\'s input ring size is read');
assert.equal(ringOf(script, 'INPUT_RING_TICKS'), serverRing, 'mp-soak sets aside controls past the server\'s own input ring');

const main = await soak(['--plant-stall', '--plant-late-input', '--plant-late-ack']);
assert.doesNotMatch(main.output, /\[mp-soak\] FAILED/, 'no soak gate failed');
assert.match(main.output, /welcomed\+spawned\s+PASS/);
assert.match(main.output, /pose continuity\s+PASS/);
assert.match(main.output, /creator killed, match runs\s+PASS/);
assert.match(main.output, /negative control\s+PASS/, 'the planted stall is the server\'s');
const starvation = main.output.match(/starvation: this thread lost (\d+) ms/);
assert.ok(starvation, 'the soak reports what the machine withheld');
if (main.code === SELFTEST_STARVED_EXIT) starvedVerdict('the soak', main.output);
assert.equal(main.code, 0, 'the short soak passes every gate');
assert.match(main.output, /all gates passed/);
assert.match(main.output, /input ack lag\s+PASS\s+p50 \d+ \/ p95 \d+ \/ max \d+ ticks/, 'the acknowledgement is judged in server ticks');
assert.match(main.output, /late input control\s+PASS/, 'controls held past their tick exceed the acknowledgement bound');
assert.match(main.output, /late ack control\s+PASS/, 'acknowledgements reported late exceed the bound');

// the server slow on its own thread (9 ms of CPU in every tick, past the 6 ms budget): a server gate fails it, so the
// spans the acknowledgement gate leaves out (a catch-up after a stall) hide no slow server
const slow = await soak(['--duration=10', '--plant-slow-server']);
if (slow.code === SELFTEST_STARVED_EXIT) starvedVerdict('the slow-server control', slow.output);
assert.equal(slow.code, 1, 'a slow server fails the soak');
assert.match(slow.output, /\[mp-soak\] FAILED: .*(server tick p95|tick rate)/, 'a server gate (tick cost or tick rate) fails a slow server');

console.log(`mp-soak.selftest: the short deterministic soak passed every gate (${starvation[1]} ms starved, judged net of it; the planted stall `
  + 'charged to the server; late controls and late acknowledgements past the bound in server ticks); a slow server fails a server gate');
