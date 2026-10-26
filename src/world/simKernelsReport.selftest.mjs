// The world kernels' fallback is observable (simKernelsStatus.ts, simKernelsReport.ts): a failed load is named by its
// cause — a Content Security Policy without 'wasm-unsafe-eval', an HTTP error, a failed fetch, bytes the engine refuses, a
// server binary missing — and the page's report sets __SIM_KERNELS's mode, source and reason. A fallback is reported
// once a session; an explicit opt-out ('off') is recorded and nothing more. Outside a browser no telemetry is touched.
import assert from 'node:assert/strict';
import { simKernelsFailureReason } from './simKernelsStatus.ts';
import { reportSimKernels } from './simKernelsReport.ts';

const csp = new WebAssembly.CompileError("WebAssembly.compile(): Refused to compile or instantiate WebAssembly module because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive");
assert.equal(simKernelsFailureReason(csp), 'csp');
assert.equal(simKernelsFailureReason(new Error('world kernels: HTTP 404')), 'http_404');
assert.equal(simKernelsFailureReason(new TypeError('Failed to fetch')), 'network');
assert.equal(simKernelsFailureReason(new TypeError('Load failed')), 'network');
let compileError;
try { new WebAssembly.Module(new Uint8Array([0, 1, 2, 3])); } catch (error) { compileError = error; }
assert.equal(simKernelsFailureReason(compileError), 'compile');
assert.equal(simKernelsFailureReason(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })), 'missing');
assert.equal(simKernelsFailureReason(new Error('something else')), 'error');
assert.equal(simKernelsFailureReason(undefined), 'error');

// the page's record: an opt-out, then a fallback (its solo report's other fields kept), then a later status
globalThis.__SIM_KERNELS = { mode: 'wasm', worlds: 2, check: { compared: 0 } };
reportSimKernels('solo', { mode: 'ts', reason: 'off' });
assert.deepEqual(globalThis.__SIM_KERNELS, { mode: 'ts', worlds: 2, check: { compared: 0 }, source: 'solo', reason: 'off' });
reportSimKernels('host', { mode: 'ts', reason: 'csp' }, csp);
assert.equal(globalThis.__SIM_KERNELS.source, 'host');
assert.equal(globalThis.__SIM_KERNELS.reason, 'csp');
reportSimKernels('host', { mode: 'wasm' });
assert.equal(globalThis.__SIM_KERNELS.mode, 'wasm');
assert.equal(globalThis.__SIM_KERNELS.reason, null);
delete globalThis.__SIM_KERNELS;

console.log('simKernelsReport.selftest: csp, http_404, network, compile, missing and error named; __SIM_KERNELS carries the mode, source and reason');
