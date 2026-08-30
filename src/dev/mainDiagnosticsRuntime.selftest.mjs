import assert from 'node:assert/strict';
import { installMainDiagnosticsRuntime } from './mainDiagnosticsRuntime.ts';

function options(overrides = {}) {
  const calls = [];
  const warnings = [];
  return {
    calls,
    warnings,
    value: {
      telemetry: {},
      debugSurface: {},
      perfHud: {
        async preload() { calls.push('preload'); },
        setVisible(visible) { calls.push(`visible:${visible}`); },
      },
      showDebugHud: true,
      warn(message, error) { warnings.push({ message, error }); },
      installers: {
        createTelemetry() { calls.push('telemetry'); },
        installSurface() { calls.push('surface'); },
      },
      ...overrides,
    },
  };
}

{
  const test = options();
  await installMainDiagnosticsRuntime(test.value);
  assert.deepEqual(test.calls, ['telemetry', 'preload', 'visible:true', 'surface']);
  assert.deepEqual(test.warnings, []);
}

{
  const failure = new Error('optional chunk unavailable');
  const test = options({
    showDebugHud: false,
    perfHud: {
      async preload() {
        test.calls.push('preload');
        throw failure;
      },
      setVisible() { test.calls.push('unexpected-visible'); },
    },
  });
  await installMainDiagnosticsRuntime(test.value);
  assert.deepEqual(test.calls, ['telemetry', 'preload', 'surface']);
  assert.equal(test.warnings.length, 1);
  assert.equal(test.warnings[0].error, failure);
}

console.log('[mainDiagnosticsRuntime.selftest] PASS');
