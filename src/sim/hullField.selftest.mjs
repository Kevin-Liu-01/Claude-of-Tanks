#!/usr/bin/env node
// hullField.selftest.mjs — a hull off the field is off it for every reader of the hull list (273). Copyright © 2026 Kevin B. Liu.
//
// Main, 2026-11-18, after the whole-chapter walk found the training battle's parked hulls labelled, listed and drawn:
// fix the class, one predicate every consumer reads. Holds:
//  1. the predicate (sim/hullField.ts onField, fieldHulls): a parked hull (modeActive false) is off, any other on; the
//     list keeps order, reuses its array, and a hull its cue brings back is in the next list;
//  2. every consumer reads it: the HUD frame's hulls and roster (nameplates, health bars, minimap, rosters and the
//     ally / enemy lists, the armour paint's targets), both aim searches (the reticle's armour pick, the sticky ray),
//     the presentation's visibility (an allied hull was shown each frame), mobile auto-aim, and the tutorial guide's
//     actor (its bracket, edge pointer and arc);
//  3. the simulation's readers that already kept to it still do: spotting's alive, hull-to-hull contacts, the shells'
//     trace, the controls' step, the killcam's poses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldHulls, onField } from './hullField.ts';

// 1. The predicate.
const player = { id: 'player' }, parked = { id: 'parked', modeActive: false }, live = { id: 'live', modeActive: true };
assert.equal(onField(player), true, 'a hull with no flag is on the field');
assert.equal(onField(live), true);
assert.equal(onField(parked), false, 'a parked hull is off it');
assert.equal(onField(null), false);
const out = [];
const first = fieldHulls([player, parked, live], out);
assert.equal(first, out, 'the list is the caller\'s array, reused');
assert.deepEqual(first.map((hull) => hull.id), ['player', 'live'], 'in order, the parked hull out');
parked.modeActive = true; // its cue (game/state.ts cueTrainingActor)
assert.deepEqual(fieldHulls([player, parked, live], out).map((hull) => hull.id), ['player', 'parked', 'live'], 'back in after its cue');
assert.equal(out.length, 3, 'the array emptied and refilled, never grown past the field');

// 2. Every consumer reads it.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const hud = read('src/game/battleHudFrameRuntime.ts');
assert.match(hud, /const tanks = \(\): TEntity\[\] => fieldHulls\(game\.tanks, fieldTanks\);/, 'the HUD frame\'s hulls are the field\'s');
assert.match(hud, /const roster = \(\): TEntity\[\] => \(game\.rosterTanks \? fieldHulls\(game\.rosterTanks, fieldRoster\) : tanks\(\)\);/, 'and its roster');
assert.equal((hud.match(/frameInfo\.tanks = tanks\(\);/g) ?? []).length, 2, 'both writes of the frame\'s hulls (each frame, a reset)');
assert.equal((hud.match(/frameInfo\.rosterTanks = roster\(\);/g) ?? []).length, 2, 'both writes of its roster');
assert.ok(!/frameInfo\.(tanks|rosterTanks) = game\./.test(hud), 'no write of the raw list is left');
assert.match(hud, /for \(const entity of fieldTanks\) \{\s*if \(entity === localPlayer/, 'the armour paint\'s targets from the field\'s hulls');
const aim = read('src/game/aimController.ts');
assert.equal((aim.match(/!onField\(tank\)/g) ?? []).length, 2, 'both aim searches skip a hull off the field');
const present = read('src/game/battlePresentationRuntime.ts');
assert.match(present, /if \(!onField\(entity\)\) \{\s*visual\.setVisible\(false\);\s*return false;\s*\}/, 'the presentation never draws one');
assert.ok(present.indexOf('if (!onField(entity))') < present.indexOf('if (!entity.isPlayer) visual.setVisible(true);'), 'before an allied hull is shown');
const autoAim = read('src/game/mobileAutoAimRuntime.ts');
assert.match(autoAim, /pickTarget\(fieldHulls\(getTanks\(\), fieldScratch\)/, 'mobile auto-aim picks from the field');
const main = read('src/main.ts');
assert.match(main, /return tutorialPose\(hull && onField\(hull\) \? hull : null\);/, 'the guide has no pose for an actor off the field');

// 3. The simulation's readers.
assert.match(read('src/sim/spotting.ts'), /e\.modeActive !== false\);/, 'spotting\'s alive');
assert.match(read('src/sim/tankPairContact.ts'), /other\.modeActive === false/, 'hull-to-hull contacts');
const state = read('src/game/state.ts');
assert.match(state, /if \(entity\.modeActive === false \|\| entity\.id === shell\.shooterId/, 'the shells\' trace');
assert.match(state, /for \(const entity of game\.tanks\) \{\s*if \(entity\.modeActive === false\) continue;\s*\/\/ a held battle/, 'the controls\' step');
assert.match(read('src/game/killcam.ts'), /if \(!ent \|\| !ent\.state \|\| ent\.modeActive === false\) continue;/, 'the killcam\'s poses');

console.log('hullField.selftest: PASS (a parked hull off the field for the HUD\'s hulls and roster, both aim searches, the presentation, mobile auto-aim and the guide; spotting, contacts, shells, controls and the killcam already; back after its cue)');
