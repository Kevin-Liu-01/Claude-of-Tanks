// The HUD editor's preview frame (site/hud-preview.html -> hudEditorPreview.ts) builds its fourteen preview tanks from
// the base spec table alone: it never loads the fleet factory, which registers the rest of the roster. On
// 2026-10-16 the pinch-zoom probe found it asking for 'leo2a4_v', which is not in that table: createTankState threw
// "malformed TankSpec", prepare() rejected and the settings HUD editor reported cot:hud-preview-error on every open.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { createTankState } from '../sim/movement.ts';
import { createCombatState } from '../sim/damage.ts';

const source = readFileSync(new URL('./hudEditorPreview.ts', import.meta.url), 'utf8');
const listed = source.match(/const PREVIEW_SPEC_IDS = \[([^\]]*)\] as const;/)?.[1];
assert.ok(listed, 'the preview names its spec ids in one PREVIEW_SPEC_IDS list');
const ids = [...listed.matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]);
assert.ok(ids.length >= 2, `the preview shows more than one vehicle (${ids.join(', ')})`);
assert.match(source, /TANK_SPECS\[PREVIEW_SPEC_IDS\[i%PREVIEW_SPEC_IDS\.length\]!\]!/,
  'every preview tank takes its spec from that list');
assert.doesNotMatch(source, /TANK_SPECS\[\[/, 'no inline id list beside it');
assert.doesNotMatch(source, /fleetFactory|fleetRegistry|authorityFleet/,
  'the frame stays on the base spec table (the list below must hold for that table alone)');

for (const id of ids) {
  const spec = TANK_SPECS[id];
  assert.ok(spec, `${id} is in the base spec table the preview frame loads`);
  assert.equal(spec.id, id);
  assert.doesNotThrow(() => createTankState(spec, new Vector3(), 0), `${id}: the preview builds its tank state`);
  assert.doesNotThrow(() => createCombatState(spec), `${id}: the preview builds its combat state`);
}
console.log(`hudEditorPreview.selftest: the HUD editor preview's ${ids.length} spec ids (${ids.join(', ')}) build from the base table`);
