// Receipt: no two vehicles read the same (SSOT 2.19, the coordinator's 2026-10-13 ruling).
// Across the whole saved roster, every display name is unique, every garage card short name is unique, no card's
// short name is another vehicle's display name, and no public name keeps an "X" suffix (the 2026-09-15 naming ruling).
import assert from 'node:assert/strict';
import './tankFactory.ts';
import { SAVED_TANK_IDS, TANK_SPECS } from './specs.ts';

const key = (text) => String(text).normalize('NFC').trim().toLocaleLowerCase('en-US');
const owners = new Map();
const claim = (text, id, field) => {
  const k = key(text);
  const prior = owners.get(k);
  if (prior && prior.id !== id) {
    assert.fail(`"${text}" is ${field} of ${id} and ${prior.field} of ${prior.id}: two cards or names read the same`);
  }
  owners.set(k, { id, field });
};
for (const id of SAVED_TANK_IDS) {
  const label = TANK_SPECS[id].label;
  assert.ok(label?.displayName && label?.shortName, `${id} has a public label`);
  assert.doesNotMatch(label.displayName, /\sX$/, `${id}: "${label.displayName}" keeps an X suffix`);
  assert.doesNotMatch(label.shortName, /\sX$/, `${id}: card "${label.shortName}" keeps an X suffix`);
  claim(label.displayName, id, 'the display name');
}
for (const id of SAVED_TANK_IDS) {
  const { displayName, shortName } = TANK_SPECS[id].label;
  if (key(shortName) !== key(displayName)) claim(shortName, id, 'the card short name');
}

// The 2026-10-13 rulings themselves.
const label = (id) => TANK_SPECS[id].label;
assert.equal(label('type90').shortName, 'Type 90 Kyū-maru');
assert.equal(label('type90_x').displayName, 'Type 90');
assert.equal(label('warrior_tes_h').displayName, 'Warrior TES(H)');
assert.equal(label('warrior_tes_h').shortName, 'Warrior TES(H)');
assert.ok(label('warrior_tes_h').searchAliases.includes('Warrior MILAN X'), 'the old name still finds it');
assert.equal(label('warrior_tes_h').noteKey, 'gallery.brief.note.warriorTesH', 'its brief names the MILAN firing post');

console.log(`tankLabelUniqueness selftest: ${SAVED_TANK_IDS.length} vehicles, every display and card name unique, no X suffix`);
