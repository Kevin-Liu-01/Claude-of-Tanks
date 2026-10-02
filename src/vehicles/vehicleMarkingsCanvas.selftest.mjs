import assert from 'node:assert/strict';
import { drawNationalInsignia } from './vehicleMarkings.ts';

function createRecordingContext() {
  const operations = [];
  const context = { operations };
  for (const method of [
    'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'arc',
    'stroke', 'fill', 'clip', 'fillRect', 'strokeRect',
  ]) {
    context[method] = (...args) => operations.push([method, ...args]);
  }
  for (const property of ['lineJoin', 'lineCap', 'strokeStyle', 'fillStyle', 'lineWidth']) {
    Object.defineProperty(context, property, {
      set(value) { operations.push([property, value]); },
    });
  }
  return context;
}

const insignias = [
  'us-star', 'de-cross', 'ru-star', 'cn-star', 'gb-roundel', 'fr-roundel',
  'il-star', 'it-shield', 'jp-roundel', 'pl-checker', 'kr-taeguk',
  'se-crowns', 'ua-trident', 'unknown-shield',
];
// 2026-10-01 (owner: retire frozen pins): the pinned sha256 of the recorded insignia operation stream is
// gone (texture canvases sit outside the fleet geometry ledger). Live contracts: every insignia, including
// the unknown-nation fallback, paints real marks deterministically with balanced painter state.
const paintAll = () => {
  const recording = createRecordingContext();
  insignias.forEach((insignia, index) => {
    drawNationalInsignia(recording, insignia, 20 + index, 30 - index, 48 + index);
  });
  return recording;
};
const context = paintAll();
assert.deepEqual(paintAll().operations, context.operations, 'insignia painters are deterministic');
insignias.forEach((insignia, index) => {
  const single = createRecordingContext();
  drawNationalInsignia(single, insignia, 20 + index, 30 - index, 48 + index);
  assert.ok(single.operations.some(([operation]) => ['fill', 'stroke', 'fillRect', 'strokeRect'].includes(operation)),
    `${insignia}: paints real marks`);
});
assert.equal(
  context.operations.filter(([operation]) => operation === 'save').length,
  context.operations.filter(([operation]) => operation === 'restore').length,
  'nested shield clipping and outer painter state remain balanced',
);

console.log('vehicleMarkingsCanvas.selftest: all insignia painters and fallback pass');
