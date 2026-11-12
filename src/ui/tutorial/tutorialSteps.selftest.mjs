#!/usr/bin/env node
// tutorialSteps.selftest.mjs — the first-game tutorial's step data, its strings, its media and its claims (272).
// Copyright © 2026 Kevin B. Liu.
//
// Walks every step (src/ui/tutorial/tutorialSteps.ts) and holds:
//  1. the chapters: each player's hands (keyboard, touch, pad) get the Garage's six subjects, the battle's drive, fire,
//     reload, shells, spotting, minimap and win, and five to eight strategy tips;
//  2. the strings: every title and body is in en-US and zh-CN, and a body's {placeholders} are exactly the key caps the
//     step names (each a bound action; a pad step's actions bound on the pad too);
//  3. the media: every file is in public/, a still at most STILL_MAX bytes and a loop at most LOOP_MAX, all of them
//     together at most MEDIA_TOTAL_MAX (they load only while the card shows them, never on boot);
//  4. the targets: every selector is one its owner file draws (the browser receipt, tools/tutorial.browser.mjs, finds
//     each on its live screen);
//  5. the claims: the battle steps and the tips say only what the simulation does (the numbers come from its tables);
//  6. the record: a new player gets every chapter, a returning one none, Skip ends them all and Replay brings them back.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUTORIAL_STEPS, chapterSteps } from './tutorialSteps.ts';
import {
  TUTORIAL_CHAPTERS, hasPlayedBefore, markTutorialChapter, readTutorialRecord, resetTutorialRecord, tutorialChapterDue,
} from './tutorialRecord.ts';
import { DEFAULT_BINDINGS, DEFAULT_PAD_BINDINGS } from '../../game/input.ts';
import { SHELL_BEHAVIOR } from '../../sim/damage.ts';
import { SIGNAL_RANGE_M, combineCamo, fireBloomAt } from '../../sim/spotting.ts';
import { BASE_CAMO, equipCamoBonus } from '../../sim/spottingStats.ts';
import { camoSelectionBonus } from '../../sim/camoPaint.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';

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
  assert.ok(TUTORIAL_CHAPTERS.includes(step.chapter), `${step.id}: a known chapter`);
  assert.ok(step.id.startsWith(`${step.chapter}.`), `${step.id}: named for its chapter`);
  const hands = typeof step.when === 'string' ? [step.when] : step.when ?? [];
  assert.ok(hands.every((input) => INPUTS.includes(input)), `${step.id}: a known input`);
  assert.ok(Array.isArray(step.target), `${step.id}: a selector list`);
}
const subjects = (chapter, input) => chapterSteps(chapter, input).map((step) => step.id.split('.')[1].replace(/(Touch|Pad)$/, ''));
for (const input of INPUTS) {
  assert.deepEqual(subjects('garage', input), ['welcome', 'tank', 'nation', 'ammo', 'kit', 'camo', 'deploy'], `the Garage chapter (${input})`);
  assert.deepEqual(subjects('battle', input), ['drive', 'fire', 'reload', 'ammo', 'spotting', 'minimap', 'win'], `the battle chapter (${input})`);
  const tips = chapterSteps('tips', input).filter((step) => step.id !== 'tips.done');
  assert.ok(tips.length >= 5 && tips.length <= 8, `five to eight strategy tips (${tips.length})`);
  assert.equal(chapterSteps('tips', input).at(-1).id, 'tips.done', `${input}: the tips close on a card that says where Replay lives`);
  const acts = chapterSteps('battle', input).map((step) => step.advance.on);
  for (const deed of ['drive', 'fire', 'shell']) assert.ok(acts.includes(deed), `${input}: the battle chapter moves on when the player does ${deed}`);
  assert.equal(chapterSteps('garage', input).at(-1).advance.on, 'press', `${input}: the Garage chapter ends on the Deploy press`);
}
assert.equal(TUTORIAL_STEPS.find((step) => step.id === 'battle.drive').advance.metres, 20, 'the drive step asks for 20 m');

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
  ...TUTORIAL_CHAPTERS.map((chapter) => `tutorial.chapter.${chapter}`), 'settings.tutorial.title', 'settings.tutorial.replay',
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
  '.cot-country-chips': ['src/ui/garage.ts', 'cot-country-chips'],
  '.cot-ammo-tiles': ['src/ui/garage.ts', 'cot-ammo-tiles'],
  '.cot-lt-consumables': ['src/ui/garage.ts', 'cot-lt-consumables'],
  '.cot-lt-paint': ['src/ui/garage.ts', 'cot-lt-paint'],
  '.cot-overview-section': ['src/ui/garage.ts', 'cot-overview-section'],
  '.cot-compact-equipment-trigger': ['src/ui/garage.ts', 'cot-compact-equipment-trigger'],
  '.cot-battle': ['src/ui/garage.ts', 'cot-battle'],
  '[data-tabbar="deploy"]': ['src/ui/garage.ts', 'data-tabbar'],
  '[data-drive-speed]': ['src/ui/hud.ts', 'data-drive-speed'],
  '.cot-touch .joy': ['src/ui/touchControls.ts', 'joy'],
  '.cot-touch .round.fire': ['src/ui/touchControls.ts', 'fire'],
  '.cot-ret-reload': ['src/ui/hud.ts', 'cot-ret-reload'],
  '.cot-shells .cot-shell.sel': ['src/ui/hud.ts', '.cot-shell.sel'],
  '.cot-shells': ['src/ui/hud.ts', 'cot-shells'],
  '.cot-minimap': ['src/ui/hud.ts', 'cot-minimap'],
  '.cot-top': ['src/ui/hud.ts', 'cot-top'],
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
assert.match(text('tips.angle.body'), /20 to 30°/);
// round: HE never bounces, and armour eats its damage
assert.equal(SHELL_BEHAVIOR.HE.ricochetDeg, Infinity, 'HE never bounces');
assert.match(read('src/sim/damage.ts'), /Math\.max\(0, 0\.5 \* dmgRoll \* falloff - HE_ARMOR_ABSORB \* armorMm\)/,
  'HE damage falls with the armour it meets, to nothing on heavy plate (damage.ts)');
// team: the radio shares spots within SIGNAL_RANGE_M
assert.ok(text('tips.team.body').includes(`${SIGNAL_RANGE_M} m`), `the team tip names the radio's ${SIGNAL_RANGE_M} m`);
// reveal: firing strips most of the shooter's camouflage for a few seconds, and bushes within 15 m stop hiding it
assert.ok(combineCamo({ base: 0.3, bloom: 1, fireLoss: 0.55 }) < 0.15, 'a shot strips at least half the own camo');
assert.ok(fireBloomAt(0, 1) > 0.4 && fireBloomAt(0, 6) === 0, 'the bloom lasts a few seconds');
const transparent = /BUSH_FIRE_TRANSPARENT_M = (\d+)/.exec(read('src/sim/spotting.ts'));
assert.ok(transparent && text('tips.reveal.body').includes(`${transparent[1]} m`), 'the reveal tip names the 15 m rule');
// spotting: a bush on the sightline adds to the camo whether or not the tank moves (combineCamo has no motion input)
assert.ok(combineCamo({ base: 0.1, bush: 0.35 }) > combineCamo({ base: 0.1 }), 'a bush hides the tank');
assert.match(read('src/sim/spotting.ts'), /export function combineCamo\(p: CamoParts\)/, 'the bush bonus rides on top of the base camo');
// camo: a matching pattern, or Auto, earns a small spotting bonus
assert.ok(camoSelectionBonus('auto', null, 'verdant') > 0 && camoSelectionBonus('auto', null, 'verdant') < 0.1, 'Auto earns a small bonus');
// win: Standard is elimination on a clock that ends in a draw
const standard = matchRulesetFor('standard');
assert.equal(standard.timeout, 'draw', 'a Standard battle that runs out of time is a draw');
assert.ok(standard.timeLimitS > 0, 'Standard runs on a clock');
// reload: a gun's reload is the gun's (or the shell's), not a crew skill: no skill table exists
assert.ok(!existsSync(resolve(ROOT, 'src/sim/crewSkills.ts')), 'no crew skills change a reload');

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
assert.ok(!hasPlayedBefore(fresh) && TUTORIAL_CHAPTERS.every((chapter) => tutorialChapterDue(chapter, fresh)), 'a new player gets every chapter');
markTutorialChapter('garage', 'done', fresh);
assert.deepEqual(readTutorialRecord(fresh), { garage: 'done' });
assert.ok(!tutorialChapterDue('garage', fresh) && tutorialChapterDue('battle', fresh), 'the battle follows the Garage');
markTutorialChapter('all', 'skipped', fresh);
assert.deepEqual(readTutorialRecord(fresh), { garage: 'done', battle: 'skipped', tips: 'skipped' }, 'Skip ends every chapter left');
resetTutorialRecord(fresh);
assert.ok(TUTORIAL_CHAPTERS.every((chapter) => tutorialChapterDue(chapter, fresh)), 'Replay brings them all back');
const returning = memory();
returning.setItem('cot.profile.v2', '{"matches":4}');
assert.ok(hasPlayedBefore(returning) && TUTORIAL_CHAPTERS.every((chapter) => !tutorialChapterDue(chapter, returning)), 'a returning player gets none');
resetTutorialRecord(returning);
assert.ok(tutorialChapterDue('garage', returning), 'a returning player who asks to replay gets it');
assert.ok(!tutorialChapterDue('garage', null), 'no storage: never a tutorial it could not remember finishing');

console.log(`tutorialSteps.selftest: ${TUTORIAL_STEPS.length} steps in ${TUTORIAL_CHAPTERS.length} chapters for ${INPUTS.length} kinds of hands; `
  + `every string in both locales, ${targets.size} targets on their owners, ${media.length} media files (${mediaBytes} bytes, lazy), `
  + 'every claim (and the boot tips\' checkable ones) held to the simulation, the record replayable PASS');
