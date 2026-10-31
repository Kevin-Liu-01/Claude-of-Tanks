import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The soak measures host time (tick rate, tick cost, stalls, ack lag) in a thread it shares with a loaded machine.
// (267, main's load class: 265's default tier failed four of its gates at load1 22, under the old 1.5×-CPUs load1 skip,
// and passed alone) The skip guessed from the load at the start; the soak now measures what the machine withheld from its
// thread (starvation-meter.mjs) and judges each gate net of it, so it runs at any load. The negative control
// (--plant-stall) spends 400 ms of CPU inside one server tick: the ticks that stall drops must be charged to the server.
// The short, seeded soak: four headless wire clients (2v2) against the in-process
// match service for 20 s through 40 ms +- 10 ms latency and 2 % replaceable-frame
// loss; every soak gate except the five-minute memory drift and the tick-cost child.
const script = fileURLToPath(new URL('./mp-soak.mjs', import.meta.url));
const child = spawn(process.execPath, ['--expose-gc', script, '--short', '--plant-stall'], { stdio: ['ignore', 'pipe', 'inherit'] });
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
const code = await new Promise((resolve) => child.on('close', resolve));
assert.equal(code, 0, 'the short soak passes every gate');
assert.match(output, /all gates passed/);
assert.match(output, /welcomed\+spawned\s+PASS/);
assert.match(output, /pose continuity\s+PASS/);
assert.match(output, /creator killed, match runs\s+PASS/);
assert.match(output, /negative control\s+PASS/, 'the planted stall is the server\'s');
const starvation = output.match(/starvation: this thread lost (\d+) ms/);
assert.ok(starvation, 'the soak reports what the machine withheld');
console.log(`mp-soak.selftest: the short deterministic soak passed every gate (${starvation[1]} ms starved, judged net of it; the planted stall charged to the server)`);
