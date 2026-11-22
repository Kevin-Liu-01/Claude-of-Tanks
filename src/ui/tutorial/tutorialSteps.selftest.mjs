#!/usr/bin/env node
// tutorialSteps.selftest.mjs — the first-game tutorial's step data, its strings, its media and its claims (272; the
// journey, the offer, the fit and the motion, 274). Copyright © 2026 Kevin B. Liu.
//
// Walks every step (src/ui/tutorial/tutorialSteps.ts) and holds:
//  1. the chapters (Kevin, 2026-11-20: "shorter and fewer"; 274: "Deploy launches the training battle"): each player's
//     hands (keyboard, touch, pad) get the Garage's tank, rounds and Deploy, whose press is the tutorial's own; the offer
//     is one card, Start or Not now; 272's first-battle chapter and its tips are gone (the training battle teaches them);
//  2. the strings: every title and body is in en-US and zh-CN, and a body's {placeholders} are exactly the key caps the
//     step names (each a bound action; a pad step's actions bound on the pad too);
//  3. the media: every file is in public/, a still at most STILL_MAX bytes and a loop at most LOOP_MAX, all of them
//     together at most MEDIA_TOTAL_MAX (they load only while the card shows them, never on boot);
//  4. the targets: every selector is one its owner file draws (the browser receipt, tools/tutorial.browser.mjs, finds
//     each on its live screen);
//  5. the claims: the battle steps and the tips say only what the simulation does (the numbers come from its tables);
//  6. the record: a new player gets the journey, a returning one (or 272's record) the offer once, answered for good, Skip
//     ends the journey and Replay brings it back;
//  7. the motion and the fit (274): every step the player completes by a deed plays the success beat, every Next card
//     cross-fades, a won chapter (the training battle, the tour) ends on the larger beat; every animation runs on the
//     shared duration tokens (1 ms under reduced motion), transform and opacity only, and the beat's check holds still
//     there; the card never scrolls (no overflow:auto) and fits by one ladder.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AFTER_TRAINING_STEPS, TRAINING_STEPS, TUTORIAL_STEPS, chapterSteps } from './tutorialSteps.ts';
import {
  TUTORIAL_CHAPTERS, TUTORIAL_FINISHED_RECORD, TUTORIAL_STORAGE_KEY, answerTutorialOffer, hasPlayedBefore, markTutorialChapter,
  readTutorialRecord, resetTutorialRecord, tutorialChapterDue, tutorialMayRun,
} from './tutorialRecord.ts';
import { completionWord, stepMotion } from './tutorialRunner.ts';
import { DEFAULT_BINDINGS, DEFAULT_PAD_BINDINGS } from '../../game/input.ts';
import { SHELL_BEHAVIOR } from '../../sim/damage.ts';
import { SIGNAL_RANGE_M, combineCamo, fireBloomAt } from '../../sim/spotting.ts';
import { BASE_CAMO, equipCamoBonus } from '../../sim/spottingStats.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { PEN_RATIO, penVerdict } from '../../sim/penVerdict.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const en = JSON.parse(read('src/ui/i18nCatalog.en-US.json'));
const zh = JSON.parse(read('src/ui/i18nCatalog.zh-CN.json'));
const INPUTS = ['keyboard', 'touch', 'pad'];
const STILL_MAX = 120_000;
const LOOP_MAX = 900_000;
const MEDIA_TOTAL_MAX = 3_000_000;

// 1. The chapters.
const ids = TUTORIAL_STEPS.map((step) => step.id);
assert.equal(new Set(ids).size, ids.length, 'every step id is unique');
for (const step of TUTORIAL_STEPS) {
  assert.ok([...TUTORIAL_CHAPTERS, 'offer'].includes(step.chapter), `${step.id}: a known chapter`);
  assert.ok(step.id.startsWith(`${step.chapter}.`), `${step.id}: named for its chapter`);
  const hands = typeof step.when === 'string' ? [step.when] : step.when ?? [];
  assert.ok(hands.every((input) => INPUTS.includes(input)), `${step.id}: a known input`);
  assert.ok(Array.isArray(step.target), `${step.id}: a selector list`);
}
const subjects = (chapter, input) => chapterSteps(chapter, input).map((step) => step.id.split('.')[1].replace(/(Touch|Pad)$/, ''));
for (const input of INPUTS) {
  assert.deepEqual(subjects('garage', input), ['tank', 'ammo', 'deploy'], `the Garage chapter (${input})`);
  const deploy = chapterSteps('garage', input).at(-1);
  assert.deepEqual(deploy.advance, { on: 'press', own: true }, `${input}: the Garage chapter ends on the Deploy press, the tutorial's own`);
  assert.deepEqual(chapterSteps('offer', input).map((step) => step.id), ['offer.training'], `${input}: the offer is one card`);
  for (const gone of ['battle', 'tips']) assert.equal(chapterSteps(gone, input).length, 0, `${input}: 272's ${gone} chapter is gone`);
}
assert.ok(!TUTORIAL_STEPS.some((step) => /^(battle|tips)\./.test(step.id)), 'no step of 272\'s battle or tips chapters is left');
const offer = TUTORIAL_STEPS.find((step) => step.id === 'offer.training');
assert.equal(offer.nextLabel, 'tutorial.offer.start', 'the offer\'s way on is Start');
assert.equal(offer.skipLabel, 'tutorial.offer.later', 'and its way out Not now');
assert.equal(offer.advance.on, 'next');
const access = read('src/app/tutorialAccess.ts');
assert.match(access, /if \(chapter === 'garage'\) deps\.launchTraining\(\);/, 'the Garage chapter done (its Deploy) launches the training battle');
assert.match(access, /answerOffer\(outcome === 'done' \? 'start' : 'later'\);\s*if \(outcome === 'done'\) deps\.launchTraining\(\);/,
  'the offer: Start launches the training battle, either answer recorded');
assert.match(access, /\} else if \(tutorialChapterDue\('offer'\)\) \{\s*start\('offer', deps\.onGarage\);/, 'the offer on the Garage when it is due');
assert.ok(!/isTutorialBattle|start\('(battle|tips)'|chapter === '(battle|tips)'|'tips'/.test(access), 'the access runs no 272 battle or tips chapter');
assert.match(read('src/main.ts'), /launchTraining: \(\) => \{\s*const rules = matchRulesetFor\('training'\)\.training;\s*if \(rules\) beginLocalBattle\(\{ specId: rules\.loanerSpecId, mapId: rules\.mapId, gameMode: 'training' \}\);/,
  'main launches the training battle: the loaner on its battlefield, the training mode');
const runnerSource = read('src/ui/tutorial/tutorialRunner.ts');
assert.match(runnerSource, /if \(advance\.own\) \{ event\.preventDefault\(\); event\.stopImmediatePropagation\(\); \}/, 'an owned press never reaches the control');
assert.match(runnerSource, /if \(press\?\.on === 'press' && press\.own\) moveOn/, 'and Enter on it is the press too, never the control\'s own');

// 2. The strings.
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
for (const step of TUTORIAL_STEPS) {
  for (const key of [step.title, step.body]) {
    assert.ok(key.startsWith('tutorial.'), `${step.id}: ${key} is in the tutorial's slice`);
    assert.ok(typeof en[key] === 'string' && en[key].length, `${step.id}: en-US has ${key}`);
    assert.ok(typeof zh[key] === 'string' && zh[key].length, `${step.id}: zh-CN has ${key}`);
    assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), `${step.id}: ${key} takes the same placeholders in both`);
  }
  assert.deepEqual(placeholders(en[step.title]), [], `${step.id}: the title names no key`);
  assert.deepEqual(placeholders(en[step.body]), Object.keys(step.keys ?? {}).sort(), `${step.id}: the body's caps are the step's keys`);
  for (const action of Object.values(step.keys ?? {})) {
    assert.ok(DEFAULT_BINDINGS[action], `${step.id}: ${action} has a default key`);
    if (step.when === 'pad' || (Array.isArray(step.when) && step.when.includes('pad'))) assert.ok(DEFAULT_PAD_BINDINGS[action] != null, `${step.id}: ${action} has a default pad button`);
  }
  // the kit hides key caps on a touch layout (components.css): a step a touch player sees names none
  const touchSees = !step.when || step.when === 'touch' || (Array.isArray(step.when) && step.when.includes('touch'));
  assert.ok(!(step.keys && touchSees), `${step.id}: a step a touch player sees names no key`);
}
for (const key of ['tutorial.label', 'tutorial.next', 'tutorial.back', 'tutorial.done', 'tutorial.skip', 'tutorial.doIt', 'tutorial.progress',
  ...[...TUTORIAL_CHAPTERS, 'offer'].map((chapter) => `tutorial.chapter.${chapter}`), 'tutorial.offer.start', 'tutorial.offer.later',
  'tutorial.beat.done', 'tutorial.complete.training', 'tutorial.complete.tour', 'settings.tutorial.title', 'settings.tutorial.replay',
  'settings.tutorial.replayNote', 'docs.start.replay', 'docs.start.replayLede']) {
  assert.ok(en[key] && zh[key], `the card's and the replay's ${key} in both locales`);
}
assert.deepEqual(placeholders(en['tutorial.progress']), ['n', 'total'], 'the progress line counts the step and the chapter');

// 3. The media.
let mediaBytes = 0;
const media = [];
for (const step of TUTORIAL_STEPS) {
  if (!step.media) continue;
  for (const [src, max] of [[step.media.src, step.media.kind === 'image' ? STILL_MAX : LOOP_MAX], ...(step.media.poster ? [[step.media.poster, STILL_MAX]] : [])]) {
    assert.ok(src.startsWith('/media/'), `${step.id}: ${src} is served from public/media`);
    const file = resolve(ROOT, 'public', src.slice(1));
    assert.ok(existsSync(file), `${step.id}: ${src} exists`);
    const bytes = statSync(file).size;
    assert.ok(bytes <= max, `${step.id}: ${src} is ${bytes} bytes, over ${max}`);
    mediaBytes += bytes;
    media.push(`${src} ${bytes}`);
  }
  if (step.media.kind === 'video') assert.ok(/\.(webm|mp4)$/.test(step.media.src) && step.media.poster, `${step.id}: a loop is webm or mp4 with a poster`);
}
assert.ok(mediaBytes <= MEDIA_TOTAL_MAX, `the tutorial's media total ${mediaBytes} bytes, over ${MEDIA_TOTAL_MAX}`);

// 4. The targets: each selector's class or attribute is drawn by its owner.
const TARGET_OWNERS = {
  '.cot-carousel': ['src/ui/garage.ts', 'cot-carousel'],
  '[data-tabbar="garage"]': ['src/ui/garage.ts', 'data-tabbar'],
  '.cot-ammo-tiles': ['src/ui/garage.ts', 'cot-ammo-tiles'],
  '.cot-overview-section': ['src/ui/garage.ts', 'cot-overview-section'],
  '.cot-battle': ['src/ui/garage.ts', 'cot-battle'],
  '[data-tabbar="deploy"]': ['src/ui/garage.ts', 'data-tabbar'],
};
const targets = new Set(TUTORIAL_STEPS.flatMap((step) => step.target));
for (const selector of targets) {
  const owner = TARGET_OWNERS[selector];
  assert.ok(owner, `${selector}: name its owner in TARGET_OWNERS`);
  assert.ok(read(owner[0]).includes(owner[1]), `${selector}: ${owner[0]} draws ${owner[1]}`);
}
for (const step of TUTORIAL_STEPS) {
  if (step.advance.on === 'press') assert.ok(step.target.length, `${step.id}: a press step lights the control it waits for`);
}

// 5. The claims.
const text = (id) => en[`tutorial.${id}`];
// angle: AP and APCR ricochet off steep plates and gain most from slope; HEAT and sabot care much less
assert.ok(SHELL_BEHAVIOR.AP.ricochetDeg <= 70 && SHELL_BEHAVIOR.APCR.ricochetDeg <= 70, 'AP and APCR glance off steep plates');
assert.ok(SHELL_BEHAVIOR.HEAT.ricochetDeg > SHELL_BEHAVIOR.AP.ricochetDeg && SHELL_BEHAVIOR.APFSDS.ricochetDeg > SHELL_BEHAVIOR.AP.ricochetDeg
  && SHELL_BEHAVIOR.HEAT.slopeExp < SHELL_BEHAVIOR.AP.slopeExp && SHELL_BEHAVIOR.APFSDS.slopeExp < SHELL_BEHAVIOR.AP.slopeExp,
'HEAT and sabot rounds care less about angle');
const slopeGain = (deg, kind) => 1 / Math.cos(((deg - SHELL_BEHAVIOR[kind].normDeg) * Math.PI) / 180) ** SHELL_BEHAVIOR[kind].slopeExp;
assert.ok(slopeGain(30, 'AP') > 1.1, `a 30° angle thickens a plate against AP (×${slopeGain(30, 'AP').toFixed(2)})`);
assert.match(text('tips.angle.body'), /20 to 30°/, 'the media library\'s angling caption (tools/media-library/sources.mjs)');
// round: HE never bounces, and armour eats its damage
assert.equal(SHELL_BEHAVIOR.HE.ricochetDeg, Infinity, 'HE never bounces');
assert.match(read('src/sim/damage.ts'), /Math\.max\(0, 0\.5 \* dmgRoll \* falloff - HE_ARMOR_ABSORB \* armorMm\)/,
  'HE damage falls with the armour it meets, to nothing on heavy plate (damage.ts)');
// spotting: a bush on the sightline adds to the camo whether or not the tank moves (combineCamo has no motion input)
assert.ok(combineCamo({ base: 0.1, bush: 0.35 }) > combineCamo({ base: 0.1 }), 'a bush hides the tank');
assert.match(read('src/sim/spotting.ts'), /export function combineCamo\(p: CamoParts\)/, 'the bush bonus rides on top of the base camo');
// armour (274): the colours are the reticle's own verdict for the loaded shell from where the player looks
// (sim/penVerdict.ts, which the reticle's ring and the scoped paint both band with): green at a penetration ratio of 1.15
// or more goes through, amber from 0.85 may, red below will not (game/armorAimOverlay.ts VERDICT_COLOR)
{
  assert.equal(penVerdict(PEN_RATIO.pen), 'pen', 'green goes through (1.15 and up)');
  assert.equal(penVerdict(1), 'marginal', 'amber may (0.85 to 1.15)');
  assert.equal(penVerdict(PEN_RATIO.marginal - 0.01), 'nopen', 'red will not (under 0.85)');
  const overlay = read('src/game/armorAimOverlay.ts');
  // the tones live in game/armorShadeColors.ts (one source for the paint and the first-use hint picture)
  assert.match(overlay, /pen: new THREE\.Color\(ARMOR_SHADE_PASSES\)/, 'the paint\'s "goes through" is the passes tone');
  assert.match(overlay, /marginal: new THREE\.Color\(ARMOR_SHADE_EDGE\)/, 'its "may" is the edge tone');
  assert.match(overlay, /nopen: new THREE\.Color\(ARMOR_SHADE_STOPS\)/, 'its "will not" is the stops tone');
  const shades = read('src/game/armorShadeColors.ts');
  assert.match(shades, /ARMOR_SHADE_PASSES = 0x48d985;/, 'passes is green');
  assert.match(shades, /ARMOR_SHADE_EDGE = 0xf0aa35;/, 'edge is amber');
  assert.match(shades, /ARMOR_SHADE_STOPS = 0xe53d35;/, 'stops is red');
  assert.match(text('training.armour.body'), /Green goes through, amber might, red won't/);
}

// 5b. The boot screen's tips (src/ui/bootScreen.ts TIP_KEYS) make claims of the same kind; the checkable ones are held
//     here too, so neither the tutorial nor the boot screen can drift from the simulation.
const boot = (id) => en[`boot.tip.${id}.body`];
// camouflage: a bush keeps hiding a moving tank (the bush bonus has no motion input); moving costs the hull's own camo,
// about a third for most of the fleet (the middle of BASE_CAMO's still→moving loss); a camouflage net counts only still
assert.doesNotMatch(boot('camouflage'), /every bonus|disappears/i, 'the camouflage tip never says moving loses every bonus');
assert.match(boot('camouflage'), /bush[^.]*even on the move/i, 'the camouflage tip says a bush hides a moving tank');
const moveLoss = Object.values(BASE_CAMO).map((row) => (row.still > 0 ? (row.still - row.moving) / row.still : 0)).sort((a, b) => a - b);
const quartile = (p) => moveLoss[Math.floor(p * (moveLoss.length - 1))];
assert.ok(quartile(0.25) >= 0.2 && quartile(0.75) <= 0.4 && quartile(0.5) > 0.25 && quartile(0.5) < 0.4,
  `"about a third for most tanks": the fleet's moving camo loss runs ${quartile(0.25).toFixed(2)}-${quartile(0.75).toFixed(2)} (median ${quartile(0.5).toFixed(2)})`);
assert.match(boot('camouflage'), /about a third/);
assert.ok(equipCamoBonus(['camo_net'], false) > 0 && equipCamoBonus(['camo_net'], true) === 0, 'a camouflage net counts only while still');
assert.match(boot('camouflage'), /net works only while you stand still/);
// angling: the same 20-30° the tutorial's tip names
assert.match(boot('angling'), /20 to 30°/, 'the boot tip angles the hull as the tutorial does');
// shell types: HE never bounces
assert.match(boot('shelltypes'), /HE never bounces/);
assert.equal(SHELL_BEHAVIOR.HE.ricochetDeg, Infinity, 'HE never bounces (damage.ts SHELL_BEHAVIOR)');

// 6. The record.
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), map }; };
const fresh = memory();
assert.ok(!hasPlayedBefore(fresh) && tutorialChapterDue('garage', fresh) && !tutorialChapterDue('offer', fresh), 'a new player gets the journey, no offer');
assert.ok(tutorialMayRun(fresh), 'and the boot loads the tutorial for it');
markTutorialChapter('garage', 'done', fresh);
assert.deepEqual(readTutorialRecord(fresh), { garage: 'done' });
assert.equal(JSON.parse(fresh.getItem(TUTORIAL_STORAGE_KEY)).v, 2, 'the record is written in the journey\'s format');
assert.ok(!tutorialChapterDue('garage', fresh) && tutorialChapterDue('training', fresh), 'the training battle follows the Garage');
markTutorialChapter('all', 'skipped', fresh);
assert.deepEqual(readTutorialRecord(fresh), { garage: 'done', training: 'skipped', debrief: 'skipped', tour: 'skipped' }, 'Skip ends the journey');
assert.ok(!tutorialMayRun(fresh), 'a finished journey loads nothing at boot');
resetTutorialRecord(fresh);
assert.ok(tutorialChapterDue('garage', fresh) && !tutorialChapterDue('offer', fresh), 'Replay brings the journey back, never the offer');
// a returning player: the offer, once
const returning = memory();
returning.setItem('cot.profile.v2', '{"matches":4}');
assert.ok(hasPlayedBefore(returning) && !tutorialChapterDue('garage', returning) && tutorialChapterDue('offer', returning), 'a returning player gets the offer');
answerTutorialOffer('later', returning);
assert.ok(!tutorialChapterDue('offer', returning) && !tutorialMayRun(returning), 'Not now: never offered again, nothing loads at boot');
assert.equal(readTutorialRecord(returning).offer, 'later');
const starter = memory();
starter.setItem('cot.battle.hints.v2', '{}');
answerTutorialOffer('start', starter);
assert.deepEqual(readTutorialRecord(starter), { offer: 'start', garage: 'done' }, 'Start: the Garage chapter passed, the training battle ahead');
assert.ok(!tutorialChapterDue('offer', starter) && !tutorialChapterDue('garage', starter), 'and the offer is answered');
// 272's record (garage, battle, tips; no v): the offer, whatever it says
for (const old of ['{"garage":"done","battle":"done","tips":"done"}', '{"garage":"skipped","battle":"skipped","tips":"skipped"}', '{"garage":"done"}']) {
  const legacy = memory();
  legacy.setItem(TUTORIAL_STORAGE_KEY, old);
  assert.equal(readTutorialRecord(legacy), null, `272's record ${old} is not the journey's`);
  assert.ok(tutorialChapterDue('offer', legacy) && !tutorialChapterDue('garage', legacy), `272's record ${old}: the offer, not the Garage chapter`);
}
resetTutorialRecord(returning);
assert.ok(tutorialChapterDue('garage', returning) && !tutorialChapterDue('offer', returning), 'a returning player who asks to replay gets the journey');
assert.equal(readTutorialRecord(returning).offer, 'later', 'and the replay keeps the offer answered');
assert.ok(!tutorialChapterDue('garage', null) && !tutorialChapterDue('offer', null), 'no storage: never a tutorial it could not remember finishing');
const finished = memory();
finished.setItem(TUTORIAL_STORAGE_KEY, TUTORIAL_FINISHED_RECORD);
assert.ok(!tutorialMayRun(finished) && !tutorialChapterDue('offer', finished), 'the tools\' finished record: nothing runs on the Garage');
assert.ok(!/garage['"]?:\s*['"]done['"],?\s*battle|"battle":"(done|skipped)"/.test(read('tools/game-readiness.mjs')), 'the launcher writes the journey\'s record');

// 7. The motion and the fit.
const allSteps = [...TUTORIAL_STEPS, ...TRAINING_STEPS, ...AFTER_TRAINING_STEPS];
for (const step of allSteps) {
  assert.equal(stepMotion(step), step.advance.on === 'next' ? 'crossfade' : 'beat', `${step.id}: ${step.advance.on === 'next' ? 'its words cross-fade' : 'a deed plays the success beat'}`);
}
const beats = allSteps.filter((step) => stepMotion(step) === 'beat').length;
assert.ok(beats >= TRAINING_STEPS.length / 2, `the training battle's deeds play the beat (${beats} steps)`);
assert.match(runnerSource, /moveOn\(stepMotion\(step\) === 'beat'\)/, 'a step met by its deed moves on with its motion');
assert.match(runnerSource, /overlay\.show\(view, \{ beat \}\);/, 'and the overlay plays it');
for (const chapter of ['training', 'tour']) assert.ok(completionWord(chapter), `${chapter}: a won end has the larger beat`);
for (const chapter of ['garage', 'offer', 'debrief']) assert.equal(completionWord(chapter), null, `${chapter}: closes without one`);
const css = read('src/ui/tutorial/tutorial.css');
const tokens = read('src/ui/tokens/tokens.css');
assert.match(tokens, /@media \(prefers-reduced-motion:reduce\)\{\s*:root:not\(\[data-motion\]\)\{\s*--dur-instant:1ms;--dur-fast:1ms;--dur-base:1ms;--dur-screen:1ms;--dur-stage:1ms;/,
  'reduced motion cuts every shared duration to 1 ms');
// (the card's motion and the guide's, every one finite on the shared tokens: tools/motion-lint.mjs holds the rest)
const cardMotion = [...css.matchAll(/animation:(cot-tut-(?:enter|swap|exit|beat-in|settle|ring|tick|complete|pulse|guide-[a-z-]+)[^;}]*)[;}]/g)].map((m) => m[1]);
assert.ok(cardMotion.length >= 7, `the card's animations (${cardMotion.length})`);
for (const rule of cardMotion) assert.match(rule, /var\(--dur-[a-z]+\)/, `animation "${rule.trim()}" runs on the shared tokens`);
for (const rule of cardMotion) assert.ok(!/infinite/.test(rule), `"${rule.trim()}" is finite (reduced motion's 1 ms never strobes)`);
for (const [, frames] of css.matchAll(/@keyframes cot-tut-(?:enter|swap|exit|beat-in|settle|ring|tick|complete)\{([^@]*?)\}\s*(?=\n|$)/g)) {
  const props = [...frames.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
  assert.ok(props.every((prop) => ['opacity', 'translate', 'scale'].includes(prop)), `motion is transform and opacity only (${props.join(', ')})`);
}
const overlaySource = read('src/ui/tutorial/tutorialOverlay.ts');
assert.match(overlaySource, /prefersReducedMotion\(\) \? STILL_BEAT_MS/, 'under reduced motion the beat\'s check holds still, unmoving');
assert.ok(!/overflow:auto|overflow-y:auto/.test(css), 'the card never scrolls');
assert.match(css, /\.cot-tut-card\{[^}]*overflow:hidden;/, 'and its max-height is a box it fits, not a scroll');
assert.match(overlaySource, /const FIT_LEVELS = \['0', '1', '2', '3'\] as const;/, 'one fit ladder');

console.log(`tutorialSteps.selftest: ${TUTORIAL_STEPS.length} Garage and offer steps for ${INPUTS.length} kinds of hands; `
  + `every string in both locales, ${targets.size} targets on their owners, ${media.length} media files (${mediaBytes} bytes, lazy), `
  + `every claim (and the boot tips' checkable ones) held to the simulation, the journey's record and the offer once, ${beats} steps `
  + 'with a success beat, motion on the shared tokens, no scroll PASS');
