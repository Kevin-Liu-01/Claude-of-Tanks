import assert from 'node:assert/strict';
import { checkedIntegrationPort } from './checkedIntegrationPort.ts';

const port = {
  begin() { return 'ready'; },
  close() {},
};

assert.equal(
  checkedIntegrationPort(port, 'test port', ['begin', 'close']),
  port,
  'a complete port retains identity',
);
assert.throws(
  () => checkedIntegrationPort({ begin() {} }, 'test port', ['begin', 'close']),
  /test port integration requires close\(\)/,
  'a missing callable fails before the lazy owner receives the port',
);
assert.throws(
  () => checkedIntegrationPort({ begin: true }, 'test port', ['begin']),
  /test port integration requires begin\(\)/,
  'a non-callable member cannot satisfy a callable port',
);

console.log('checkedIntegrationPort.selftest: identity and fail-closed validation passed');
