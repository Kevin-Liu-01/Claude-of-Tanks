import assert from 'node:assert/strict';
import { createProfileBuilders } from './profileBuilderAdapter.ts';

const calls = [];
const profiles = {
  custom: {
    marker: 'custom',
    build(builder, profile) {
      calls.push(['custom', builder, profile.marker]);
      return 'custom-result';
    },
  },
  donor: { marker: 'donor', base: 'foundation' },
  generic: { marker: 'generic' },
};
const builders = createProfileBuilders(profiles, {
  buildDonorVariant(builder, profile) {
    calls.push(['donor', builder, profile.marker]);
    return 'donor-result';
  },
  buildProfile(builder, profile) {
    calls.push(['generic', builder, profile.marker]);
    return 'generic-result';
  },
});

assert.deepEqual(Object.keys(builders), ['custom', 'donor', 'generic']);
assert.equal(builders.custom('custom-port'), 'custom-result');
assert.equal(builders.donor('donor-port'), 'donor-result');
assert.equal(builders.generic('generic-port'), 'generic-result');
assert.deepEqual(calls, [
  ['custom', 'custom-port', 'custom'],
  ['donor', 'donor-port', 'donor'],
  ['generic', 'generic-port', 'generic'],
]);
assert.throws(
  () => createProfileBuilders({ broken: { build: 'not-callable' } }, {
    buildDonorVariant() {},
    buildProfile() {},
  }),
  /Profile builder broken must be a function/,
);

console.log('profileBuilderAdapter.selftest: custom, donor, generic, and invalid builder paths passed');
