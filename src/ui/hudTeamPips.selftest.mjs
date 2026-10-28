// hudTeamPips.selftest.mjs — (brand-ui 242) the team strip under the score (the direction's 06-battle-hud.html .pips and
// .sectors), over the recording DOM: a pip a tank on its side, the player's ringed, a destroyed tank's struck, a departed
// tank's gone, a team too large for the strip left to the rosters; a chip a capture zone, drawn by the shared glyph set
// from the shared markers (a contested zone's ring dashed in the contested ink), repainted only when its zone moves.
import { created, resizeObserved } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTeamPips } from './hudTeamPips.ts';
import { objectiveMarkers } from './minimapObjectives.ts';
import { sideColor } from './objectiveGlyphs.ts';

const host = document.createElement('div');
const strip = createTeamPips(host);
const tank = (id, team, extra = {}) => ({ id, team, spec: { id: 'm1a3' }, combat: { destroyed: false }, ...extra });
const ownSide = created.find((node) => node.classes.has('own') && node.classes.has('side'));
const enemySide = created.find((node) => node.classes.has('enemy') && node.classes.has('side'));
const pips = (side) => side.children.filter((node) => node.classes.has('pip'));

const roster = [tank('a1', 'alpha'), tank('p', 'alpha', { isPlayer: true }), tank('a2', 'alpha'), tank('e1', 'bravo'), tank('e2', 'bravo')];
strip.updateTeams(roster, 'alpha', 'p');
assert.equal(pips(ownSide).length, 3, 'a pip for every allied tank, the player among them');
assert.equal(pips(enemySide).length, 2, 'a pip for every enemy tank');
assert.equal(pips(ownSide).filter((pip) => pip.classes.has('me')).length, 1, 'the player\'s own pip is ringed');
assert.ok(pips(ownSide).every((pip) => /side_silhouette/.test(pip.style.getPropertyValue?.('--sil') ?? pip.style['--sil'] ?? '')),
  'every pip is its vehicle\'s side silhouette');
assert.equal(strip.root.classes.has('show'), true, 'the strip shows for two small teams');

roster[3].combat.destroyed = true;
strip.updateTeams(roster, 'alpha', 'p');
assert.deepEqual(pips(enemySide).map((pip) => pip.classes.has('dead')), [true, false], 'a destroyed tank\'s pip goes hollow and struck');
roster[3].combat.destroyed = false;
strip.updateTeams(roster, 'alpha', 'p');
assert.equal(pips(enemySide)[0].classes.has('dead'), false, 'a revived tank\'s pip returns');

strip.updateTeams(roster.filter((entry) => entry.id !== 'e2'), 'alpha', 'p');
assert.equal(pips(enemySide).length, 1, 'a tank that leaves takes its pip with it');

const large = Array.from({ length: 34 }, (_, index) => tank(`t${index}`, index < 17 ? 'alpha' : 'bravo'));
strip.updateTeams(large, 'alpha', null);
const row = created.find((node) => node.classes.has('cot-pips-row'));
assert.equal(row.hidden, true, 'seventeen a side leave the strip to the rosters\' silhouette grid');
assert.equal(strip.root.classes.has('show'), false, 'with no zones the strip hides');

const zones = [{ x: -150, z: 90, control: 1, owner: 'alpha', contested: false },
  { x: 0, z: 0, control: 0.4, owner: null, contested: true }, { x: 150, z: -90, control: -1, owner: 'bravo', contested: false }];
const markers = objectiveMarkers({ id: 'zone_control', perspectiveTeam: 'alpha', zones });
strip.updateSectors(markers);
// (each chip a span in the strip holding its uiCanvas and its letter, DOM over it: UI-LOCKDOWN A)
const chipNodes = () => created.filter((node) => node.classes.has('chip') && node.parentNode?.classes.has('cot-pips-sectors'));
const chips = () => chipNodes().map((node) => node.children.find((child) => child.tagName === 'CANVAS'));
assert.equal(chips().length, 3, 'a chip for every capture zone');
// (UI-LOCKDOWN A) each chip is a uiCanvas: it draws once its box is laid out (the wide plate's 38 x 42)
for (const chip of chips()) assert.equal(chip.getContext('2d').ops.length, 0, 'no chip draws before its box is measured');
for (const chip of chips()) resizeObserved(chip, 38, 42);
assert.ok(chips().every((chip) => chip.dataset.uiCanvas === ''), 'every chip is a uiCanvas');
// its letter is DOM over it (the kit's type and the 11 px floor), never canvas text
const chipLetters = chipNodes().map((node) => node.children.find((child) => child.classes.has('cot-ctext'))?.children[0]?.textContent);
assert.deepEqual(chipLetters, markers.filter((marker) => marker.kind === 'zone' || marker.kind === 'sector').map((marker) => marker.label),
  'each chip\'s letter is a DOM run over it');
assert.ok(chips().every((chip) => !chip.getContext('2d').ops.some((op) => op.op === 'fillText' || op.op === 'strokeText')),
  'no chip paints text');
assert.equal(strip.root.classes.has('show'), true, 'the chips show the strip on their own');
const contested = chips()[1].getContext('2d').ops;
assert.ok(contested.some((op) => op.op === 'stroke' && op.dash.length && op.style === sideColor('contested')),
  'a contested zone\'s capture ring is dashed in the contested ink');
const held = chips()[0].getContext('2d').ops;
assert.ok(held.some((op) => op.op === 'stroke' && op.style === sideColor('own') && !op.dash.length), 'a held zone\'s ring is its side\'s');
const before = chips().map((chip) => chip.getContext('2d').ops.length);
strip.updateSectors(objectiveMarkers({ id: 'zone_control', perspectiveTeam: 'alpha', zones }));
assert.deepEqual(chips().map((chip) => chip.getContext('2d').ops.length), before, 'an unchanged zone repaints nothing');
strip.updateSectors([]);
assert.equal(chips().length, 0, 'a mode without zones drops the chips');
// (owner 2026-10-25: the top block "less so big and wide") the pips ride the score plate where it hosts them, and the
// strip under it is the zone chips alone
const plate = document.createElement('div');
const plated = createTeamPips(document.createElement('div'), plate);
const platedRow = created.filter((node) => node.classes.has('cot-pips-row')).at(-1);
assert.ok(platedRow.parentNode === plate, 'the pips\' row goes into the score plate');
plated.updateTeams(roster, 'alpha', 'p');
assert.equal(platedRow.hidden, false, 'two small teams show their pips in the plate');
assert.equal(plated.root.classes.has('show'), false, 'without zones the strip under the plate stays hidden');
plated.updateSectors(markers);
assert.equal(plated.root.classes.has('show'), true, 'the zone chips show the strip under the plate');
assert.match(readFileSync(new URL('./hudTeamPips.ts', import.meta.url), 'utf8'), /\.cot-top \.cot-pips-row \.pip::before\{-webkit-mask:none;mask:none;transform:skewX\(-24deg\)\}/,
  'a pip in the plate is a slanted segment (a silhouette reads as a dash at its size)');
console.log('hudTeamPips.selftest: pips per side (the player ringed, the fallen struck, the departed gone, large teams to the rosters), the pips in the score plate, and zone chips from the shared glyphs passed');
