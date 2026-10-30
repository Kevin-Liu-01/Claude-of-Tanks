import assert from 'node:assert/strict';
import { drawNationalInsignia, drawTacticalNumber } from './vehicleMarkings.ts';

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
  'se-crowns', 'ua-trident', 'br-eb-arms', 'br-cruzeiro', 'br-ring', 'br-osorio', 'unknown-shield',
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

// 264: a tactical number fits its bounds once measured. A measuring context (bold capitals ~0.72 em, digits ~0.56 em, a space ~0.28,
// as the Cot UI face sets them): a digit number keeps the 1.75-per-character size it always had; the Leopard 2A3's
// letter code OTCO, which ran past both ends of its 252 px designation decal, comes down until it and its outline fit.
function measuringContext() {
  const drawn = { font: '', lineWidth: 0, texts: [] };
  const size = () => Number(/(\d+(?:\.\d+)?)px/.exec(drawn.font)[1]);
  return { drawn, canvas: { width: 256, height: 256 }, save() {}, restore() {},
    set font(value) { drawn.font = value; }, get font() { return drawn.font; },
    set lineWidth(value) { drawn.lineWidth = value; }, set strokeStyle(_) {}, set fillStyle(_) {},
    set textAlign(_) {}, set textBaseline(_) {},
    measureText: (text) => ({ width: [...text].reduce((sum, c) => sum + (c === ' ' ? 0.28 : /[0-9-]/.test(c) ? 0.56 : 0.72), 0) * size() }),
    strokeText(text) { drawn.texts.push(text); }, fillText() {} };
}
const bounds = { x: 2, y: 34, width: 252, height: 188 };
for (const [number, fits] of [['32', true], ['732', true], ['OTCO', false]]) {
  const ctx = measuringContext();
  drawTacticalNumber(ctx, { tacticalNumber: number }, bounds);
  const rule = Math.min(bounds.height * 0.68, bounds.width / number.length * 1.75);
  const drawnSize = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.drawn.font)[1]);
  const width = ctx.measureText(number).width + ctx.drawn.lineWidth;
  if (fits) assert.equal(drawnSize, Math.max(16, rule), `${number}: a number that fits keeps the per-character size`);
  else assert.ok(drawnSize < rule, `${number}: a number wider than its bounds comes down (${drawnSize} < ${rule})`);
  assert.ok(width <= bounds.width * 0.94 + 1e-9, `${number}: ${width.toFixed(1)} px with its outline fits ${bounds.width} px`);
}

console.log('vehicleMarkingsCanvas.selftest: all insignia painters and fallback pass; tactical numbers fit their bounds');
