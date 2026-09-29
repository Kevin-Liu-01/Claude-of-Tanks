import assert from 'node:assert/strict';
import { assertPublicBuildEnv } from './publicBuildEnv.ts';
assert.doesNotThrow(() => assertPublicBuildEnv({ VITE_ROOMS_URL: 'wss://rooms.example.test', VITE_SELF_HOSTED: '1' }));
assert.doesNotThrow(() => assertPublicBuildEnv({ SERVER_TOKEN: '[SENSITIVE]' }));
assert.doesNotThrow(() => assertPublicBuildEnv({}));
assert.throws(() => assertPublicBuildEnv({ VITE_ICE_CONFIG_URL: '[SENSITIVE]', VITE_ROOMS_URL: '[SENSITIVE]', SERVER_TOKEN: 'do-not-print' }),
  error => /VITE_ICE_CONFIG_URL, VITE_ROOMS_URL/.test(error.message) && !error.message.includes('do-not-print'));
console.log('publicBuildEnv.selftest: redacted browser configuration blocks builds without exposing server values');
