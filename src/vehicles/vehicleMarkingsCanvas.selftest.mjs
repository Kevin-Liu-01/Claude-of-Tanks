import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
const context = createRecordingContext();
insignias.forEach((insignia, index) => {
  drawNationalInsignia(context, insignia, 20 + index, 30 - index, 48 + index);
});

const digest = createHash('sha256')
  .update(JSON.stringify(context.operations))
  .digest('hex');
assert.equal(digest, 'cfb6dfffe4b55b6d1c34d80f73790511491f01ea5885bfc4d842061e3b75e27b',
  'all national insignia paths remain pixel-contract stable');
assert.equal(
  context.operations.filter(([operation]) => operation === 'save').length,
  context.operations.filter(([operation]) => operation === 'restore').length,
  'nested shield clipping and outer painter state remain balanced',
);

console.log('vehicleMarkingsCanvas.selftest: all insignia painters and fallback pass');
