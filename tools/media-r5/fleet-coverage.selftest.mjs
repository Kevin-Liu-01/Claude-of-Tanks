import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import '../../src/vehicles/tankFactory.ts';
import { PRODUCTION_TANK_IDS } from '../../src/vehicles/specs.ts';
import { CAST } from './cast.mjs';
import { FLEET, OWNER_NINE, SHOTS, siteScene } from './site50.mjs';
import { takeBars } from './take-bars.mjs';
import { surveyPath } from './paths.mjs';
import { resolveTankId } from '../../src/vehicles/tankIdAliases.ts';
import { sceneInCurrentTankIds } from '../../src/game/tankIdBoundaries.ts';

// The media lane's half of the fleet takes (267; fleet.selftest holds the roster alike on every machine): every
// production vehicle leads a take, and every fleet take clears the bars its battlefield's survey holds (routes, props,
// wires, lens, beats). Both are the media lane's to answer: a new vehicle's take is planned on the surveys
// (fleet-plan.mjs --append) and filmed, and the surveys are its local dumps (lab --features in a render hold, read from
// MEDIA_R5_FEATURES or shots/media-r5/features). A battlefield without a survey fails here, so the suite never passes on
// bars it skipped. Manual: npm run test:heavy -- media, where the dumps are.
const staged = (shot) => sceneInCurrentTankIds(siteScene(shot));
const scenes = new Map(FLEET.map((shot) => [shot[0], staged(shot)]));
const heroes = new Set([...[...SHOTS, ...OWNER_NINE].map((shot) => staged(shot).actors[0].id), ...[...scenes.values()].map((sc) => sc.actors[0].id)]);
const problems = PRODUCTION_TANK_IDS.filter((id) => !heroes.has(id)).map((id) => `${id}: leads no take (fleet-plan.mjs --append)`);
const maps = [...new Set([...scenes.values()].map((sc) => sc.map))].sort();
problems.push(...maps.filter((map) => !surveyPath(map) || !existsSync(surveyPath(map))).map((map) => `${map}: no survey at ${surveyPath(map) ?? '(MEDIA_R5_FEATURES=off)'}`));
// every take judged at once, the surveyed ones on their bars: one run names the whole backlog
const cast = new Set([...Object.values(CAST).map((id) => resolveTankId(id)), ...PRODUCTION_TANK_IDS]); // CAST is schema 1
problems.push(...FLEET.flatMap((shot) => takeBars(shot, { cast, scene: scenes.get(shot[0]) })));
assert.deepEqual(problems, [], `the fleet's media backlog: ${problems.length} items`);
console.log(`fleet-coverage.selftest: all ${PRODUCTION_TANK_IDS.length} production vehicles lead a take; ${FLEET.length} fleet takes clear the surveys of their ${maps.length} battlefields`);
