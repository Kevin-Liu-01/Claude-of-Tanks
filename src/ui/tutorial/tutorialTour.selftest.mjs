#!/usr/bin/env node
// tutorialTour.selftest.mjs — after the training battle: the debrief, the five-stop tour and the close (273).
// Copyright © 2026 Kevin B. Liu.
//
// Storyboard §6. Holds:
//  1. the steps: the debrief is one card (the run's figures, the lessons' checklist, "Show me around"); the tour lights
//     Gallery, Tech Tree, Studio, Record and Docs in that order, each on every layout its control has, then closes on
//     Deploy; every selector is one its owner file draws;
//  2. the strings: every title and body in en-US and zh-CN, the debrief's figures named alike in both, each stop's three
//     lines (tells, shows, lets);
//  3. the lessons: twelve, each proved by a training step; a run that finished ticks all, one that stopped ticks those it
//     got past, none without a run;
//  4. the chapters: each runs when the journey brings it, and its outcome is recorded (274, the journey's record); the
//     access chains them: the training battle complete, its debrief on the Garage, the tour from "Show me around", Skip
//     ending the journey, the stats counted only while the training battle runs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AFTER_TRAINING_STEPS, TRAINING_LESSONS, TRAINING_STEPS, chapterSteps } from './tutorialSteps.ts';
import { markTutorialChapter, readTutorialRecord, tutorialChapterDue } from './tutorialRecord.ts';
import { trainingLessonTicks } from './tutorialRunner.ts';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const en = JSON.parse(read('src/ui/i18nCatalog.en-US.json'));
const zh = JSON.parse(read('src/ui/i18nCatalog.zh-CN.json'));

// 1. The steps.
for (const input of ['keyboard', 'touch', 'pad']) {
  assert.deepEqual(chapterSteps('debrief', input).map((s) => s.id), ['debrief.summary'], `${input}: the debrief is one card`);
  assert.deepEqual(chapterSteps('tour', input).map((s) => s.id),
    ['tour.gallery', 'tour.techTree', 'tour.studio', 'tour.record', 'tour.docs', 'tour.complete'], `${input}: the five stops, then the close`);
}
const debrief = AFTER_TRAINING_STEPS[0];
assert.equal(debrief.params, 'trainingSummary');
assert.equal(debrief.checklist, 'trainingLessons');
assert.equal(debrief.nextLabel, 'tutorial.debrief.next', 'its Next reads "Show me around"');
const garage = read('src/ui/garage.ts');
const drawnBy = (selector) => {
  const attr = selector.match(/^\[(data-[a-z-]+)="([A-Za-z]+)"\]$/);
  if (attr) return garage.includes(`${attr[1]}="${attr[2]}"`);
  return garage.includes(selector.replace(/^\./, '')); // a class: .cot-record-trigger, .cot-battle
};
for (const step of AFTER_TRAINING_STEPS) {
  for (const selector of step.target) assert.ok(drawnBy(selector), `${step.id}: ${selector} is drawn by the Garage`);
  if (step.chapter === 'tour') assert.ok(step.target.length, `${step.id} lights its control`);
}

// 2. The strings.
for (const step of AFTER_TRAINING_STEPS) {
  for (const key of [step.title, step.body, step.nextLabel].filter(Boolean)) {
    assert.ok(en[key] && zh[key], `${key} in both locales`);
    const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    assert.equal(names(zh[key]), names(en[key]), `${key}: the same figures in both`);
  }
  if (step.id.startsWith('tour.') && step.id !== 'tour.complete') {
    assert.equal(en[step.body].split('\n').length, 3, `${step.id}: three lines (tells, shows, lets)`);
    assert.equal(zh[step.body].split('\n').length, 3, `${step.id}: three lines in zh-CN`);
  }
}
assert.deepEqual([...en['tutorial.debrief.body'].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), ['destroyed', 'held', 'pens', 'shots', 'time'],
  'the debrief names the run\'s time, shots, penetrations, held rounds and kills');

// 3. The lessons.
assert.equal(TRAINING_LESSONS.length, 12, 'twelve lessons');
const trainingIds = new Set(TRAINING_STEPS.map((s) => s.id));
for (const lesson of TRAINING_LESSONS) {
  assert.ok(trainingIds.has(lesson.proof), `${lesson.id}: proved by a training step (${lesson.proof})`);
  assert.ok(en[lesson.label] && zh[lesson.label], `${lesson.label} in both locales`);
}
assert.ok(trainingLessonTicks(null).every((t) => !t.done), 'no run, no ticks');
const view = (shown, complete) => ({ seconds: 600, shots: 1, pens: 1, held: 0, destroyed: 0, shown, complete });
assert.ok(trainingLessonTicks(view([], true)).every((t) => t.done), 'a finished run ticks all');
const ids = TRAINING_STEPS.filter((s) => !s.when || s.when === 'keyboard' || (Array.isArray(s.when) && s.when.includes('keyboard'))).map((s) => s.id);
const partial = ids.slice(0, ids.indexOf('training.fireHE') + 1);
assert.deepEqual(trainingLessonTicks(view(partial, false)).map((t) => t.done),
  [true, true, true, true, true, false, false, false, false, false, false, false], 'a stopped run ticks the lessons it got past');
assert.ok(trainingLessonTicks(view(['training.driveTouch', 'training.turretTouch'], false))[0].done, 'a hand\'s variant of the proof counts');
assert.ok(!trainingLessonTicks(view(['training.drive'], false))[0].done, 'standing on the proof is not past it');

// 4. The chapters and the access.
const memory = new Map();
const store = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
assert.equal(tutorialChapterDue('debrief', store), true);
assert.equal(tutorialChapterDue('tour', store), true);
markTutorialChapter('debrief', 'done', store);
markTutorialChapter('tour', 'done', store);
assert.deepEqual(readTutorialRecord(store), { debrief: 'done', tour: 'done' }, 'each is recorded');
assert.equal(tutorialChapterDue('tour', store), true, 'and still runs when the journey brings it (a replay)');
const access = read('src/app/tutorialAccess.ts');
assert.match(access, /training\.complete = true;\s*training\.endedAt = performance\.now\(\);\s*debriefDue = true;\s*deps\.trainingComplete\(\);/,
  'the training battle complete: its debrief due, the battle ended');
assert.match(access, /if \(debriefDue\) \{ start\('debrief', deps\.onGarage\); return; \}/, 'the debrief on the Garage');
assert.match(access, /else if \(chapter === 'debrief'\) \{ debriefDue = false; start\('tour', deps\.onGarage\); \}/,
  'Show me around brings the tour');
assert.match(access, /if \(outcome === 'skipped'\) \{ markTutorialChapter\('all', 'skipped'\); debriefDue = false; return; \}/,
  'Skip anywhere ends the journey');
assert.match(access, /const counting = \(\): boolean => !!training && run\?\.chapter === 'training';/, 'stats counted only while the training battle runs');
const runner = read('src/ui/tutorial/tutorialRunner.ts');
assert.match(runner, /nextLabel: t\(step\.nextLabel \?\? \(last \? 'tutorial\.done' : 'tutorial\.next'\)\),/, 'a step\'s own Next words');
assert.match(runner, /onStep\?\.\(step\.id\);/, 'each step shown is reported');

console.log(`tutorialTour.selftest: PASS (the debrief, ${chapterSteps('tour', 'keyboard').length - 1} stops and the close on every layout; ${TRAINING_LESSONS.length} lessons ticked from the run; both locales)`);
