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

function outerFactory(value: number): number {
  function nestedHelper(limit: number): number {
    let total = 0;
    for (let index = 0; index < limit; index++) {
      if (index % 2 === 0) total += index;
      else if (index % 3 === 0) total -= index;
    }
    return total;
  }
  return value + nestedHelper(value);
}
`);

const straight = report.functions.find((metric) => metric.name === 'straight');
const nested = report.functions.find((metric) => metric.name === 'nested');
const outerFactory = report.functions.find((metric) => metric.name === 'outerFactory');
assert.ok(straight);
assert.ok(nested);
assert.ok(outerFactory);
assert.equal(straight.cyclomatic, 1);
assert.equal(straight.cognitive, 0);
assert.ok(straight.halsteadDifficulty > 0);
assert.equal(nested.cyclomatic, 7,
  'if, two logical groups, loop, nested if, and else-if add independent paths');
assert.ok(nested.cognitive > straight.cognitive,
  'nesting and structural branches raise cognitive complexity');
assert.equal(outerFactory.cyclomatic, 1,
  'a factory is measured independently from its nested helper branches');
assert.ok(outerFactory.halsteadDifficulty < CODE_QUALITY_LIMITS.halsteadDifficulty,
  'nested helper tokens are not double-counted in the factory Halstead score');
assert.deepEqual(report.explicitTypes.map(({ kind }) => kind).sort(), ['any', 'unknown']);
assert.deepEqual(CODE_QUALITY_LIMITS, {
  cyclomatic: 22,
  cognitive: 22,
  halsteadDifficulty: 80,
});

console.log('code-quality-metrics.selftest: deterministic complexity and explicit-type accounting passed');
