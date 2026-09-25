import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The short, seeded soak: four headless wire clients (2v2) against the in-process
// match service for 20 s through 40 ms +- 10 ms latency and 2 % replaceable-frame
// loss; every soak gate except the five-minute memory drift and the tick-cost child.
const script = fileURLToPath(new URL('./mp-soak.mjs', import.meta.url));
const child = spawn(process.execPath, ['--expose-gc', script, '--short'], { stdio: ['ignore', 'pipe', 'inherit'] });
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
const code = await new Promise((resolve) => child.on('close', resolve));
assert.equal(code, 0, 'the short soak passes every gate');
assert.match(output, /all gates passed/);
assert.match(output, /welcomed\+spawned\s+PASS/);
assert.match(output, /pose continuity\s+PASS/);
assert.match(output, /creator killed, match runs\s+PASS/);
console.log('mp-soak.selftest: the short deterministic soak passed every gate');
