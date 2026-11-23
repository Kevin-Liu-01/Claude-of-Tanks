#!/usr/bin/env node
// tutorialGuide.selftest.mjs — the tutorial's guidance over the battle (273). Copyright © 2026 Kevin B. Liu.
//
// Holds:
//  1. the geometry (tutorialGuideMath.ts): the ring closes at its radius; an actor's own frame turns with its yaw; a box
//     behind the camera is none; a point behind the camera is never on screen (the way there, its trail and the edge of
//     the screen, are the pointer layer's since 275: ui/pointers/pointerPlan.selftest.mjs);
//  2. the step data: a reach step has a marker; an actor's bracket, a hit, spot or destroy step names the actor it waits
//     for; every guide label and the distance line are in en-US and zh-CN;
//  3. the 272.1 rules for the guide: neither of its layers takes the pointer (it can never swallow a press or leave a
//     live control under an inert dim), it hides with the card (a pause, a covering surface) and goes with its run (the
//     screen check's close ends it with the card), and it draws in screen space only (no Three.js, nothing in the scene).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  actorCorners, actorPoint, groundDistance, onScreen, ringPoints, screenBox,
} from './tutorialGuideMath.ts';
import { TRAINING_STEPS, TUTORIAL_STEPS, chapterSteps } from './tutorialSteps.ts';
import { DEFAULT_BINDINGS, DEFAULT_PAD_BINDINGS } from '../../game/input.ts';
import { TRAINING_POINTS, TRAINING_RULES, planTrainingRange, trainingRoster, trainingRulesFor } from '../../sim/trainingGround.ts';
import { GAME_MODE_DEFINITIONS, DEPLOY_MODE_ORDER, isPracticeMode, isTutorialMode } from '../../sim/gameModeCatalog.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 1. The geometry.
{
  const ring = ringPoints({ x: 10, z: -4 }, 6, 24);
  assert.equal(ring.length, 25, 'the ring samples its segments and repeats its first point');
  assert.ok(near(ring[0].x, ring[24].x) && near(ring[0].z, ring[24].z), 'the ring closes');
  for (const p of ring) assert.ok(near(groundDistance(p, { x: 10, z: -4 }), 6, 1e-9), 'every ring point at its radius');
}
{
  const pose = { x: 5, y: 2, z: 7, yaw: 0 };
  const ahead = actorPoint(pose, 3, 1, 0);
  assert.ok(near(ahead.x, 5) && near(ahead.y, 3) && near(ahead.z, 10), 'yaw 0: along is +z');
  const right = actorPoint(pose, 0, 0, 2);
  assert.ok(near(right.x, 7) && near(right.z, 7), 'yaw 0: across is +x (the hull\'s left, as the battle camera shows it)');
  const turned = actorPoint({ ...pose, yaw: Math.PI / 2 }, 3, 0, 0);
  assert.ok(near(turned.x, 8, 1e-9) && near(turned.z, 7, 1e-9), 'a yaw of 90° turns along toward +x');
  assert.equal(actorCorners(pose, 4, 2, 3).length, 8, 'a box has eight corners');
  assert.equal(screenBox([{ x: 1, y: 1, behind: false }, { x: 5, y: 9, behind: true }]), null, 'a box partly behind the camera is none');
  assert.deepEqual(screenBox([{ x: 1, y: 8, behind: false }, { x: 5, y: 2, behind: false }]), { left: 1, top: 2, right: 5, bottom: 8 });
}
{
  const view = { width: 1000, height: 600 };
  assert.ok(onScreen({ x: 500, y: 300, behind: false }, view, 50) && !onScreen({ x: 20, y: 300, behind: false }, view, 50));
  assert.ok(!onScreen({ x: 500, y: 300, behind: true }, view), 'behind the camera is never on screen');
}

// 2. The step data.
const en = JSON.parse(read('src/ui/i18nCatalog.en-US.json'));
const zh = JSON.parse(read('src/ui/i18nCatalog.zh-CN.json'));
for (const catalog of [en, zh]) assert.match(catalog['tutorial.guide.distance'] ?? '', /\{m\}/, 'the distance line names {m}');
for (const step of [...TUTORIAL_STEPS, ...TRAINING_STEPS]) {
  const advance = step.advance;
  if (advance.on === 'reach') assert.ok(step.guide?.marker, `${step.id}: a reach step has a marker`);
  if (['spot', 'destroy'].includes(advance.on)) assert.ok(advance.actor, `${step.id}: names its actor`);
  for (const label of [step.guide?.marker?.label, step.guide?.actor?.label].filter(Boolean)) {
    assert.ok(en[label] && zh[label], `${step.id}: guide label ${label} in en-US and zh-CN`);
  }
  if (step.guide?.aimAt) assert.ok(step.guide.actor?.id === step.guide.aimAt.id, `${step.id}: the aim ghost's actor is the bracketed one`);
}

// 2b. The training battle (273): its steps, strings and ground.
{
  for (const input of ['keyboard', 'touch', 'pad']) {
    const ids = chapterSteps('training', input).map((step) => step.id.replace(/(Touch|Pad)$/, ''));
    assert.deepEqual(ids.slice(0, 3), ['training.drive', 'training.turret', 'training.zoom'],
      `${input}: the training opens on the drive, then the turret and the sight (no card before the first move)`);
    // (Kevin, 2026-11-20: "shorter and fewer") about half the 45 cards it had; one card that only explains, and it waits for
    // a hand that has no armour key
    assert.ok(ids.length <= 22, `${input}: ${ids.length} training cards, at most 22`);
    const reads = chapterSteps('training', input).filter((step) => step.advance.on === 'next').map((step) => step.id);
    assert.deepEqual(reads, input === 'keyboard' ? [] : ['training.armourTouch'], `${input}: the cards that only explain`);
  }
  for (const step of TRAINING_STEPS) {
    for (const key of [step.title, step.body]) assert.ok(en[key] && zh[key], `${step.id}: ${key} in en-US and zh-CN`);
    const named = Object.keys(step.keys ?? {}).sort();
    for (const catalog of [en, zh]) {
      const used = [...(catalog[step.body] ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(used, named, `${step.id}: the body's placeholders are exactly its key caps`);
    }
    const inputs = step.when ? [step.when].flat() : ['keyboard', 'touch', 'pad'];
    for (const action of Object.values(step.keys ?? {})) {
      if (inputs.includes('keyboard')) assert.ok(DEFAULT_BINDINGS[action], `${step.id}: ${action} has a key`);
      if (inputs.includes('pad')) assert.ok(DEFAULT_PAD_BINDINGS[action] != null, `${step.id}: ${action} has a pad button`);
    }
    if (step.advance.on === 'turret') assert.ok(step.guide?.marker, `${step.id}: a turret step points at a marker`);
    if (step.arrive) assert.ok(step.guide?.marker && step.advance.on !== 'reach', `${step.id}: a step that asks for its ring first shows the ring`);
    assert.equal(step.chapter, 'training');
  }
  // the ground: every actor a distinct tank, none the loaner; seated in roster order on their own marks
  const roster = trainingRoster(TRAINING_RULES);
  assert.equal(new Set(roster).size, roster.length, 'each actor a distinct tank (a solo roster keys hulls by spec)');
  assert.ok(!roster.includes(TRAINING_RULES.loanerSpecId), 'no actor is the loaner');
  const layout = planTrainingRange(TRAINING_RULES);
  assert.deepEqual([layout.origin.x, layout.origin.z], [TRAINING_RULES.start.x, TRAINING_RULES.start.z], 'the player on the start');
  // (the actors, then S14's skirmish bots: trainingRoster's order)
  const seated = [...TRAINING_RULES.actors, ...TRAINING_RULES.skirmish.allies, ...TRAINING_RULES.skirmish.enemies];
  assert.equal(layout.lanes.length, roster.length, 'a mark for every hull of the roster');
  layout.lanes.forEach((lane, i) => assert.deepEqual([lane.x, lane.z], [seated[i].x, seated[i].z], `hull ${i} on its own mark`));
  for (const point of Object.values(TRAINING_POINTS)) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z) && point.radiusM > 0);
  // the mode: never offered, no record, no clock, its own seed and roster size
  assert.ok(isTutorialMode('training') && !isPracticeMode('training') && !DEPLOY_MODE_ORDER.includes('training'),
    'the training battle is the tutorial\'s mode, never in Deploy\'s picker');
  assert.ok(GAME_MODE_DEFINITIONS.training, 'a mode definition');
  const ruleset = matchRulesetFor('training');
  assert.equal(ruleset.records, false, 'nothing recorded');
  assert.equal(ruleset.timeLimitS, null, 'no clock');
  // the field: the scenes' hulls and S14's enemy bots; the allies S14's allied bots
  const enemies = TRAINING_RULES.actors.length + TRAINING_RULES.skirmish.enemies.length;
  assert.equal(ruleset.enemies, enemies, 'the field is the scenes\' hulls and the skirmish\'s enemies');
  assert.equal(ruleset.allies, TRAINING_RULES.skirmish.allies.length, 'the allies the skirmish\'s');
  assert.equal(ruleset.training, true, 'the ruleset marks the training battle and carries none of its data (274: the rooms Worker reads the table)');
  assert.equal(trainingRulesFor(ruleset), TRAINING_RULES, 'the solo battle reads the rules through the mark');
  assert.equal(trainingRulesFor(matchRulesetFor('standard')), null, 'and no other mode has them');
  const arranged = matchRulesetFor('training', null, { allies: 5, enemies: 9, teamNations: 'random' });
  assert.ok(arranged.enemies === enemies && arranged.allies === TRAINING_RULES.skirmish.allies.length, 'no arrangement changes it');
}

// 3. The 272.1 rules for the guide.
const css = read('src/ui/tutorial/tutorial.css');
assert.match(css, /\.cot-tut-guide\{[^}]*pointer-events:none/, 'the guide layers never take the pointer');
assert.doesNotMatch(css.slice(css.indexOf('/* the guide')), /pointer-events:\s*auto/, 'no guide piece takes it back');
const guide = read('src/ui/tutorial/tutorialGuide.ts');
assert.doesNotMatch(guide, /from 'three'|THREE\./, 'the guide draws in screen space: no Three.js, nothing added to the scene');
assert.match(guide, /root\.setAttribute\('aria-hidden', 'true'\)/, 'its layers are hidden from assistive tech (the card speaks)');
// (guidance-pointers-275) the way there is the pointer layer's: the guide posts its place and draws no trail or edge arrow
assert.match(guide, /setGuideFollow\(\{ id: 'tutorial', kind: 'waypoint'/, 'the marker goes to the pointer layer as a waypoint');
assert.equal(guide.match(/setGuideFollow\(null\)/g)?.length ?? 0, 3, 'and comes off it with no subject, hidden, and destroyed');
assert.doesNotMatch(guide + css, /cot-tut-guide-(chevron|edge)/, 'no chevrons or edge arrow of the guide\'s own');
const runner = read('src/ui/tutorial/tutorialRunner.ts');
assert.match(runner, /overlay\.destroy\(\{[^}]*\}\);\s*guide\?\.destroy\(\);/, 'the guide goes with its run, wherever the run ends (done, skip, screen gone)');
const hides = runner.match(/overlay\.setHidden\(hiddenByPause \|\| covered\);\s*guide\?\.setHidden\(hiddenByPause \|\| covered\);/g) ?? [];
assert.equal(hides.length, 2, 'the guide hides with the card on a pause and under a covering surface');

console.log('tutorialGuide.selftest: PASS (geometry, step data, inert and lifetime rules)');
