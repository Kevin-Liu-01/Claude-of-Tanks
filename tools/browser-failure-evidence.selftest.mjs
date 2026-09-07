import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { browserOperationFailure, observeBrowserHealth } from './browser-failure-evidence.mjs';

for (const [name, message, expected] of [
  ['ProtocolError', 'Input.dispatchMouseEvent timed out. PRIVATE protocolTimeout', 'protocol-timeout'],
  ['ProtocolError', 'PRIVATE protocol rejection', 'protocol-error'],
  ['TargetCloseError', 'PRIVATE target address', 'target-closed'],
  ['ProtocolError', 'Protocol error: Session closed PRIVATE', 'target-closed'],
  ['TimeoutError', 'Waiting for PRIVATE failed', 'wait-timeout'],
  ['Error', 'Page crashed! PRIVATE', 'unknown'],
]) assert.equal(browserOperationFailure({ name, message }), expected);
assert.equal(browserOperationFailure({ operationFailure: 'PRIVATE' }), 'unknown');
assert.equal(browserOperationFailure({ operationFailure: 'deadline' }), 'deadline');

let time = 0;
const health = observeBrowserHealth(() => time);
const browser = new EventEmitter();
const host = new EventEmitter();
const guest = new EventEmitter();
health.watchBrowser(browser);
health.watchPage(host, 'host'); health.watchPage(guest, 'guest');
time = 10;
host.emit('pageerror', new Error('PRIVATE app stack'));
assert.equal(health.read().peers[0].rendererCrashCount, 0, 'app exceptions are not renderer crashes');
time = 15;
guest.emit('error', new Error('PRIVATE renderer stack'));
for (let n = 0; n < 20; n++) host.emit('pageerror', new Error('PRIVATE'));
browser.emit('disconnected');
const receipt = health.stop();
assert.equal(receipt.peers[0].appExceptionCount, 21);
assert.equal(receipt.peers[0].events.length, 16);
assert.equal(receipt.peers[0].eventsDropped, 5);
assert.equal(receipt.peers[1].rendererCrashCount, 1);
assert.equal(receipt.browserDisconnected, true);
assert.equal(receipt.peers[1].events[0].atMs, 15);
assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE|stack|https?:/);
host.emit('close');
assert.deepEqual(health.read(), receipt, 'intentional cleanup after stop cannot become failure evidence');
assert.equal(host.listenerCount('pageerror'), 0);
assert.equal(browser.listenerCount('disconnected'), 0);
console.log('browser failure evidence: safe categories, bounded lifecycle events and frozen cleanup passed');
