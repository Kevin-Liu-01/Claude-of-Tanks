// Receipt (the 2.0 revival, 2026-10-06): every prop the world builds sounds of what it is, and the world reports the
// crushes that were silent. Each kind of the world's registries has its own recipe (no regex guess), every asset a
// recipe names ships, the old regex's slips stay fixed, topples land when the hinge does, and props.ts emits the
// telegraph poles' topples and the loose dressing's knocks through the destructibles seam the audio listens to.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESTRUCTIBLE_TYPES } from '../world/maps/inhabitKit.ts';
import { SCENERY_DESTRUCTIBLE_TYPES } from '../world/maps/sceneryKit.ts';
import { DESTRUCTIBLE_BUILDING_TYPES, REGIONAL_DESTRUCTIBLE_TYPES } from '../world/maps/structureKit.ts';
import { SFX_ASSETS } from './sfxManifest.generated.ts';
import { PROP_SOUND_KINDS, TOPPLE_LAND_S, hasPropSound, propSoundAssets, propSoundRecipe } from './propSounds.ts';

const propsSource = readFileSync(new URL('../world/props.ts', import.meta.url), 'utf8');
const frontSource = readFileSync(new URL('../world/frontlineAtmosphere.ts', import.meta.url), 'utf8');
const stateSource = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');

// ---- every world kind: the inhabiting kit, the scenery kit, the light buildings (and their regional variants, which
// keep their family's kind), the sandbag stacks props.ts defines locally, the telegraph poles, the AA guns, the trees.
const meta = { ...DESTRUCTIBLE_TYPES, ...SCENERY_DESTRUCTIBLE_TYPES };
const localKinds = [...propsSource.matchAll(/^ {4}(sandbag[a-z]+): \{$/gm)].map((m) => m[1]);
assert.deepEqual(localKinds.sort(), ['sandbagbig', 'sandbagsmall', 'sandbagwall'], 'props.ts LOCAL_TYPES still defines the three sandbag stacks');
for (const variants of Object.values(REGIONAL_DESTRUCTIBLE_TYPES)) {
  for (const [family, variant] of Object.entries(variants)) assert.equal(variant.id, family, `a regional ${family} keeps its family's kind`);
}
const frontKinds = [...frontSource.matchAll(/emitDestroyed\(\{ kind: '([A-Za-z]+)'/g)].map((m) => m[1]);
assert.deepEqual(frontKinds, ['aaGun'], 'the front reports its AA guns');
assert.match(stateSource, /kind: 'tree'/, 'a shell-felled trunk reports as a tree');
const worldKinds = [
  ...Object.keys(DESTRUCTIBLE_TYPES), ...Object.keys(SCENERY_DESTRUCTIBLE_TYPES), ...Object.keys(DESTRUCTIBLE_BUILDING_TYPES),
  ...localKinds, ...frontKinds, 'utility_pole', 'tree',
];
const unnamed = worldKinds.filter((kind) => !hasPropSound(kind));
assert.deepEqual(unnamed, [], `every world kind has its own sound: name ${unnamed.join(', ')} in src/audio/propSounds.ts`);
assert.ok(worldKinds.length >= 90, `${worldKinds.length} world kinds covered`);

// ---- every recipe's asset ships, and the battle set pins every one (audioEngine warmBattle).
for (const id of propSoundAssets()) assert.ok(SFX_ASSETS[id], `prop sound ${id} ships`);
const engine = readFileSync(new URL('./audioEngine.ts', import.meta.url), 'utf8');
assert.match(engine, /for \(const id of propSoundAssets\(\)\) ids\.add\(id\)/, 'the battle warm pins every prop sound');

const ids = (kind, h = 0) => propSoundRecipe(kind, h).map((layer) => layer.id);
const first = (kind) => ids(kind)[0];

// ---- the regex's slips (until 2026-10-06), fixed.
assert.equal(first('haycart'), 'cart_break', 'a haycart is a wooden cart ("cart" matched /car/)');
assert.equal(first('handcart'), 'cart_break');
assert.ok(ids('haycart').includes('straw_crush'), 'the haycart\'s load of hay goes down with it');
for (const kind of ['truck', 'jeep', 'sedan', 'wagon', 'pickup', 'van', 'truckbox', 'truckflatbed']) assert.equal(first(kind), 'car_crush', `${kind} crushes as a car`);
for (const kind of ['bale', 'stook', 'haystack', 'strawstack']) assert.equal(first(kind), 'straw_crush', `${kind} is straw, not a crate`);
for (const kind of ['tent', 'deserttent', 'commandtent', 'fieldhospital']) assert.equal(first(kind), 'tent_collapse', `${kind} is canvas`);
assert.notEqual(first('guardpost'), 'fence_wood', 'a steel guard post is no wooden fence ("post")');
assert.equal(first('guardpost'), 'container_crush');
assert.equal(first('barrel'), 'crate_break', 'bBarrel is a coopered wooden barrel, not a steel drum');
assert.equal(first('pot'), 'pottery_smash', 'clay jars shatter as terracotta');
assert.ok(ids('drumred').includes('fuel_drum_blast'), 'the red fuel drum explodes');
for (const kind of ['barrier', 'tomb', 'bildstock', 'wallstone']) assert.equal(first(kind), 'rubble_crunch', `${kind} is stone or concrete`);
assert.equal(first('bunker'), 'building_collapse');
assert.equal(first('transformer'), 'container_crush');
assert.deepEqual(ids('stall'), ['crate_break', 'tent_collapse'], 'a market stall: its wooden frame and its awning');

// ---- the telegraph pole: the foot cracks, the wires whip as it goes over, it lands with the hinge.
const pole = propSoundRecipe('utility_pole');
assert.deepEqual(pole.map((layer) => layer.id), ['pole_snap', 'pole_wires', 'pole_fall']);
assert.equal(pole[0].delayS, 0);
assert.ok(pole[1].delayS >= 0.2 && pole[1].delayS + pole[1].jitterS <= 0.5, 'the wires whip while the pole is still falling');
assert.equal(pole[2].delayS, TOPPLE_LAND_S, 'the pole lands when the hinge topple does');

// ---- every topple lands when the hinge does: the props' eased fall reaches the ground at 0.8 s.
assert.match(propsSource, /const u = Math\.min\(a\.t \/ 0\.8, 1\);/, 'props.ts: the hinge topple eases over 0.8 s');
assert.equal(TOPPLE_LAND_S, 0.8);
for (const [kind, m] of Object.entries(meta)) {
  if (m.cls !== 'topple') continue;
  assert.ok(propSoundRecipe(kind).some((layer) => layer.delayS === TOPPLE_LAND_S), `${kind} topples: its landing plays at ${TOPPLE_LAND_S} s`);
}
assert.deepEqual(ids('lamp'), ['fence_metal', 'metal_topple'], 'a lamp post bends, then crashes down with its glass');

// ---- loose dressing (cls 'physics') knocks; a cone is deliberately silent.
const physics = Object.entries(DESTRUCTIBLE_TYPES).filter(([, m]) => m.cls === 'physics').map(([kind]) => kind);
assert.ok(physics.length >= 8, 'the loose dressing kinds are found');
for (const kind of physics) {
  if (kind === 'cone') assert.deepEqual(ids(kind), [], 'a plastic cone under a hull is inaudible: no sound, by name');
  else if (kind === 'loosewheel') assert.deepEqual(ids(kind), ['sandbag_thump'], 'a loose tyre thumps');
  else assert.deepEqual(ids(kind), ['can_knock'], `a loose ${kind} clangs`);
}

// ---- trees, as before: a tall one falls through its branches after the snap.
assert.deepEqual(ids('tree', 2), ['tree_snap']);
assert.deepEqual(ids('tree', 9), ['tree_snap', 'tree_fall']);

// ---- a kind no entry names still gets the old guess, without its slip.
assert.equal(hasPropSound('oxcart'), false);
assert.equal(first('oxcart'), 'cart_break', 'an unknown cart is a cart');
assert.equal(first('watchtower'), 'building_collapse');
assert.equal(first('constructor'), 'crate_break', 'a prototype key is no table entry');

// ---- props.ts reports the crushes that were silent, through the seam the audio hears (prop:destroyed).
const crushProp = propsSource.slice(propsSource.indexOf('function crushProp('), propsSource.indexOf('function crushDestructible('));
assert.match(crushProp, /pushCrushAnim\(\{[\s\S]*?\}\);\s*\/\/ audio seam[^\n]*\n\s*emitDestroyed\(\{ kind: 'utility_pole', pos: \[c\.x, c\.y, c\.z\], cause: 'ram' \}\);\s*return true;/,
  'a toppled telegraph pole reports as utility_pole');
const kick = propsSource.slice(propsSource.indexOf('function kickLooseRecord('), propsSource.indexOf('function animateBrokenRecord('));
assert.match(kick, /ensureLooseActive\(rec as LooseDestructibleRecord\);[^\n]*\n(?:\s*\/\/[^\n]*\n)?\s*emitDestroyed\(\{ kind: rec\.kind, pos: \[rec\.x, rec\.y, rec\.z\], cause, loose: true \}\);/,
  'a knocked loose prop reports with loose: true, only once its kick applied');

const silent = [...PROP_SOUND_KINDS].filter((kind) => propSoundRecipe(kind).length === 0);
console.log(`propSounds.selftest: ${worldKinds.length} world kinds, ${PROP_SOUND_KINDS.size} named, ${propSoundAssets().length} assets; deliberately silent: ${silent.join(', ')}`);
