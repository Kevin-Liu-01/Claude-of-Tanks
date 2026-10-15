// VH.14 (coordinator ruling 2026-10-14, the owner's field-equipment standard): roof weapons match the real vehicle and
// every drawn gun works. No drawn weapon fitting outside the main gun's rig may be a decorative pintle: each is a working
// station (src/vehicles/inertDrawnWeapons.generated.ts lists any that are not, by tools/vehicle-controls-inventory.mjs).
// A vehicle whose real counterpart carries no roof weapon (src/vehicles/roofWeaponPolicy.ts) draws none, and the
// standard check's census holds it at zero instead of the old "at least one" rule.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TANK_SPECS } from './specs.ts';
import './tankFactory.ts';
import { AUXILIARY_INVENTORY } from './auxiliaryInventory.generated.ts';
import { INERT_DRAWN_WEAPONS } from './inertDrawnWeapons.generated.ts';
import { NO_ROOF_WEAPON, carriesNoRoofWeapon } from './roofWeaponPolicy.ts';
import { roofEquipmentVerdict } from '../../tools/source-equipment-policy.mjs';

const decorative = Object.entries(INERT_DRAWN_WEAPONS).map(([id, guns]) => `${id}: ${guns.map((g) => `${g.name} (${g.caliberMm ?? '?'} mm)`).join(', ')}`);
assert.deepEqual(decorative, [], `every drawn gun works: ${decorative.length} vehicles draw a gun that is not a working station\n${decorative.join('\n')}`);

for (const [id, reason] of Object.entries(NO_ROOF_WEAPON)) {
  assert.ok(TANK_SPECS[id], `${id}: a playable vehicle`);
  assert.ok(reason.length > 40, `${id}: the real vehicle's armament is stated`);
  assert.equal(AUXILIARY_INVENTORY[id]?.guns.length ?? 0, 0, `${id}: no roof weapon on the real vehicle, none drawn`);
}
assert.ok(carriesNoRoofWeapon('bmpt_t90') && !carriesNoRoofWeapon('m1a2'), 'the list is the exemption, not the rule');

// the standard check's census: a listed vehicle needs zero, every other still needs a gun
const census = (mg) => ({ mg, dressing: 0, invalidWeaponMarkers: 0 });
assert.equal(roofEquipmentVerdict('bmpt_t90', census(0), null).passed, true, 'a listed vehicle passes with no roof gun');
assert.equal(roofEquipmentVerdict('bmpt_t90', census(1), null).passed, false, 'and fails with a decorative one');
assert.equal(roofEquipmentVerdict('m1a2', census(0), null).passed, false, 'an unlisted vehicle still needs its roof gun');

const standard = readFileSync(new URL('../../docs/BUILD-STANDARD.md', import.meta.url), 'utf8');
assert.match(standard, /ROOF WEAPONS MATCH THE REAL VEHICLE AND EVERY DRAWN GUN\s+WORKS/, 'the build standard states the rule');
assert.doesNotMatch(standard, /add a tastefully-integrated pintle MG even where the ref\s+lacks one/, 'the decorative-gun rule is gone');
console.log(`roofWeaponPolicy: every drawn gun is a working station; ${Object.keys(NO_ROOF_WEAPON).length} vehicles carry no roof weapon, each with its reason`);
