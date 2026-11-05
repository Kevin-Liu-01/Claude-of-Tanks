// Round 2 (2026-11-03 critic U30): the Studio film's entry (game/studioFilm.ts enter) takes its two holds, the governor's
// (post.holdAdaptive) and temporal AA's (post.holdTemporalAA), inside the try whose catch leaves through leave(). They
// were taken while its saved state was built, before ports.setFilmMode(true) and outside the try: a film mode that threw
// kept the governor suspended and temporal AA off for the rest of the page, and the Studio refused every later still and
// film ("finish the film render first"). Run in Node on the real film owner with stub ports.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudioFilm } from './studioFilm.ts';

const taken = [], released = [];
const hold = (name) => { taken.push(name); return { release() { released.push(name); } }; };
const renderer = { getSize: (v) => v.set(800, 450), getPixelRatio: () => 1, setPixelRatio() {}, setSize() {}, capabilities: { maxTextureSize: 4096 } };
const post = { holdTemporalAA: () => hold('temporal-aa'), holdAdaptive: () => hold('governor'), lensFlare: { fixedDt: null },
  pinDynScale() {}, resetPerfTrims() {}, setSize() {} };
const modes = [];
let refuse = true;
const film = createStudioFilm({ renderer, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100), post,
  lighting: { updateFrustums() {}, update() {} }, clockMs: () => 0, cutTimes: () => [], seek() {}, prepareWorld() {}, refreshFxForCamera() {},
  setFilmMode(on) { modes.push(on); if (on && refuse) throw new Error('film mode refused'); } });

assert.throws(() => film.renderStill({ width: 64, height: 64 }), /film mode refused/, 'the film mode throws');
assert.deepEqual(taken, ['temporal-aa', 'governor'], 'both holds were taken');
assert.deepEqual(released.sort(), ['governor', 'temporal-aa'], 'a film mode that throws releases both holds');
assert.equal(modes.at(-1), false, 'and leaves film mode');
assert.throws(() => film.renderStill({ width: 64, height: 64 }), /film mode refused/, 'the next still tries again (no stale film state)');
assert.equal(released.length, 4, 'and releases its own holds again');

// a hold that throws after the first was taken still releases the first
refuse = false;
taken.length = released.length = 0;
const holdAdaptive = post.holdAdaptive;
post.holdAdaptive = () => { throw new Error('governor busy'); };
assert.throws(() => film.renderStill({ width: 64, height: 64 }), /governor busy/);
assert.deepEqual([taken, released], [['temporal-aa'], ['temporal-aa']], 'a second hold that throws releases the first');
post.holdAdaptive = holdAdaptive;
console.log('studioFilmHolds.selftest: a film entry that throws gives its governor and temporal-AA holds back');
