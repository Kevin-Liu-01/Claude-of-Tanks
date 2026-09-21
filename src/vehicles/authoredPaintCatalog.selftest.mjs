import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import { AUTHORED_PAINT_ENTRIES, AUTHORED_PAINT_IDS } from './authoredPaintCatalog.ts';
import { CAMO_PATTERN_IDS, CAMO_PATTERN_LABEL, CAMO_TAG_IDS, sharedCamoPreset, isBuiltInCamoId } from './camoPolicy.ts';

// Round 31 (owner 2026-09-20): the generated authored paint catalog must match the fleet exactly and be wired in.
const generator = fileURLToPath(new URL('../../tools/gen-authored-paint-catalog.mjs', import.meta.url));
const check = spawnSync(process.execPath, [generator, '--check'], { encoding: 'utf8' });
assert.equal(check.status, 0, `the generated catalog is current:\n${check.stdout}${check.stderr}`);

assert.equal(AUTHORED_PAINT_IDS.length, AUTHORED_PAINT_ENTRIES.length);
assert.deepEqual([...AUTHORED_PAINT_IDS], AUTHORED_PAINT_ENTRIES.map((entry) => entry.id), 'ids and entries stay aligned');
assert.deepEqual([...AUTHORED_PAINT_IDS], [...AUTHORED_PAINT_IDS].sort(), 'entries are sorted by id so regeneration is stable');
const tagIds = new Set(CAMO_TAG_IDS);
const seenRecipes = new Set();
for (const entry of AUTHORED_PAINT_ENTRIES) {
  assert.ok(entry.id.startsWith('paint_'), entry.id);
  assert.ok(isBuiltInCamoId(entry.id), `${entry.id} is a built-in (match-safe) pattern id`);
  assert.ok(CAMO_PATTERN_IDS.includes(entry.id));
  assert.equal(CAMO_PATTERN_LABEL[entry.id], entry.label, `${entry.id} has its garage label`);
  assert.ok(entry.label.length > 3 && !entry.label.includes('undefined'), `${entry.id}: readable label (${entry.label})`);
  assert.ok(ALL_TANK_IDS.includes(entry.lead), `${entry.id}: lead ${entry.lead} is a fleet vehicle`);
  assert.ok(entry.sourceTankIds.includes(entry.lead) && entry.sourceTankIds.length >= 1);
  for (const id of entry.sourceTankIds) assert.ok(ALL_TANK_IDS.includes(id), `${entry.id}: source ${id} is a fleet vehicle`);
  for (const tag of entry.tags) assert.ok(tagIds.has(tag), `${entry.id}: tag ${tag} exists`);
  assert.ok(entry.tags.includes('signature'), `${entry.id}: filed under Signature`);
  const preset = sharedCamoPreset(entry.id);
  assert.ok(preset && preset.sourceTankId === entry.lead, `${entry.id}: resolves to a shared preset owned by its lead`);
  assert.equal(preset.visual.base, entry.visual.base);
  const key = JSON.stringify(entry.visual);
  assert.ok(!seenRecipes.has(key), `${entry.id}: identical recipes were combined into one entry`);
  seenRecipes.add(key);
  // the lead's own authored recipe is exactly this recipe
  const lead = getSpec(entry.lead).visual;
  assert.equal(lead.base, entry.visual.base); assert.equal(lead.scheme || 'solid', entry.visual.scheme);
  // a plain coat is normalised to no patches (its authored patch list is inert)
  if (entry.visual.scheme !== 'solid') assert.deepEqual([...(lead.patches || [])], [...entry.visual.patches]);
  else assert.deepEqual([...entry.visual.patches], []);
}
// the biggest shared recipes were combined (the Abrams family alone spans more than a dozen hulls)
assert.ok(AUTHORED_PAINT_ENTRIES.some((entry) => entry.sourceTankIds.length >= 10), 'shared authored recipes collapse into one entry');
// every hull is covered: its authored recipe is a preset (signature / service / national / authored paint)
const covered = new Set();
for (const id of ALL_TANK_IDS) {
  const v = getSpec(id).visual; if (!v?.base) continue;
  const owner = AUTHORED_PAINT_ENTRIES.find((entry) => entry.sourceTankIds.includes(id));
  if (owner) { covered.add(id); continue; }
  // otherwise a named preset carries the same recipe
  const key = JSON.stringify([v.scheme || 'solid', v.base, v.weather, [...(v.patches || [])]]);
  const match = [...CAMO_PATTERN_IDS].map(sharedCamoPreset).filter(Boolean)
    .some((preset) => JSON.stringify([preset.visual.scheme, preset.visual.base, preset.visual.weather, [...preset.visual.patches]]) === key);
  assert.ok(match, `${id}: authored recipe is selectable somewhere in the catalog`);
  covered.add(id);
}
assert.ok(covered.size >= 190, `fleet coverage ${covered.size}`);
console.log(`authoredPaintCatalog.selftest: ${AUTHORED_PAINT_ENTRIES.length} generated authored paints current, labelled, tagged and wired`);
