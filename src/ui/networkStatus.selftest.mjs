import assert from 'node:assert/strict';
import { networkStatusMessage } from './networkStatus.ts';

assert.equal(networkStatusMessage({ state: 'reconnecting', attempt: 2 }),
  'Connection interrupted · reconnecting 2');
assert.equal(networkStatusMessage({ state: 'reconnecting', reason: 'authority_stalled' }),
  'Host not responding · waiting for game updates');
assert.match(networkStatusMessage({ state: 'failed' }), /no result recorded/);
assert.equal(networkStatusMessage({ state: 'connected' }), '');
assert.equal(networkStatusMessage({ state: 'closed' }), '');
assert.equal(networkStatusMessage({ state: 'reconnected' }), 'Connection restored');
assert.ok(!networkStatusMessage({ state: 'failed', reason: '<script>bad</script>' }).includes('script'));
console.log('networkStatus.selftest: recovery, host stall and no-result messages PASS');
