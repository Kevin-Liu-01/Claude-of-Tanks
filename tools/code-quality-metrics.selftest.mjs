import assert from 'node:assert/strict';

import {
  analyzeSourceText,
  CODE_QUALITY_LIMITS,
} from './code-quality-metrics.ts';

const report = analyzeSourceText('fixture.ts', `
function straight(value: number): number {
  return value + 1;
}

function nested(value: unknown): number {
  if (typeof value === 'number' && value > 0) {
    for (let index = 0; index < value; index++) {
      if (index % 2 === 0) continue;
    }
  } else if (value === null || value === false) {
    return 0;
  } else {
    return -1;
  }
  return value;
}

const unsafe = (value: any) => value;
`);

const straight = report.functions.find((metric) => metric.name === 'straight');
const nested = report.functions.find((metric) => metric.name === 'nested');
assert.ok(straight);
assert.ok(nested);
assert.equal(straight.cyclomatic, 1);
assert.equal(straight.cognitive, 0);
assert.ok(straight.halsteadDifficulty > 0);
assert.equal(nested.cyclomatic, 7,
  'if, two logical groups, loop, nested if, and else-if add independent paths');
assert.ok(nested.cognitive > straight.cognitive,
  'nesting and structural branches raise cognitive complexity');
assert.deepEqual(report.explicitTypes.map(({ kind }) => kind).sort(), ['any', 'unknown']);
assert.deepEqual(CODE_QUALITY_LIMITS, {
  cyclomatic: 22,
  cognitive: 22,
  halsteadDifficulty: 80,
});

console.log('code-quality-metrics.selftest: deterministic complexity and explicit-type accounting passed');
