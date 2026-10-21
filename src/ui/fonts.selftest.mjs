// fonts.ts receipt: the boot module carries no face data (the document's cot:type marker declares
// the faces once), injects the overlay rules once, never sets tabular figures, and warms only the two first-paint
// faces of the weight-voiced 'Cot UI' family. src/ui/typeSystem.selftest.mjs covers the faces, files and markers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Code only: the header comment names the retired faces and the rules it replaced.
const source = readFileSync(new URL('./fonts.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
assert.doesNotMatch(source, /@font-face/, 'fonts.ts declares no faces: the cot:type marker is the one declaration source');
assert.doesNotMatch(source, /tabular-nums/, 'no overlay root sets tabular figures (the .num class alone does)');
assert.doesNotMatch(source, /Monument|'Inter'|\bInter,/, 'the retired faces are gone from the shell stacks');

const original = globalThis.document;
try {
  const styles = new Map(), loads = [];
  globalThis.document = {
    getElementById: (id) => styles.get(id),
    createElement: () => ({ id: '', textContent: '' }),
    head: { appendChild: (node) => styles.set(node.id, node) },
    fonts: { load: (font) => { loads.push(font); return Promise.resolve([]); } },
  };
  const { ensureFonts, FONT_STACK, FONT_COND } = await import('./fonts.ts?test=warm');
  for (let i = 0; i < 20; i++) ensureFonts();
  assert.deepEqual([...styles.keys()], ['cot-fonts'], 'repeated overlays inject the overlay rules once and no faces');
  const rules = styles.get('cot-fonts').textContent;
  assert.match(rules, /font-weight:500/, 'overlay roots keep the 500 reading floor');
  assert.doesNotMatch(rules, /font-variant-numeric/, 'overlay roots keep proportional figures');
  assert.deepEqual(loads, ["500 16px 'Cot UI'", "700 16px 'Cot UI'"],
    'warm only the two first-paint faces (Plex Sans Medium, Chakra Petch Bold) once');
  assert.equal(FONT_COND, FONT_STACK, 'the numeral stack is the weight-voiced shell family');
  assert.match(FONT_STACK, /^'Cot UI','Cot Accents','Cot Symbols','Cot Fallback',/, 'the shell stack leads with the UI family, its accents and marks faces and its metric-matched fallback');
} finally {
  globalThis.document = original;
}
console.log('fonts: no face data at boot, overlay rules once, proportional roots, two-face warm passed');
