// 2026-11-02 audit F10: the battle FX runtime's own lifecycles, on the real runtime (fx/effects.ts):
//  - deferred beats: a beat due under the killcam's suppression fires (its particles join the hidden emitters; it was
//    dropped for good), a light due then stays dark, and a deferred wreck made for one life of a visual never lands on
//    the next (a Studio actor reset inside the delay was wrecked again);
//  - a building's stages: a replayed or doubled stage event lays nothing again (its dust, the mask's collapse stamp, the
//    stage builders ran twice: a building stood up and fell again);
//  - smoke columns: a fire raised with no hit before it smokes where its hull stands, a fire seen burning whose
//    burning:false was lost goes out with the combat record, and a late joiner's already-burning hull smokes; the scan
//    reads only hulls this viewer sees (a hidden one's frozen record re-lit a column for ever) and never evicts a column;
//  - a hull's event point (round 4 merge review r2): a beat no hit names (a ram's or a crash's thrown track, a fire
//    raised later) lands on the hull where it stands now, at its last hit's point on the hull (the hit's own spot when
//    it came with the hit), never where the hull was first placed in this life, where it last died or where an older
//    hit struck it; a mode respawn forgets the last life's point; (round 5 U16) a hit on a network hull this seat does
//    not see is not measured on it from its last sample's pose (once seen again, its beats landed off it by the distance
//    it went unseen), while an unspotted solo hull's hit stays on the hull;
//  - one HE round, one burst: its hull event and its expiry split across frames (a network peer's queue) drew two; a
//    direct hull hit (no expiry ever follows it) bursts on the next update, and a late wall expiry still strikes its
//    building; (round 8 Y6, s4-01: regression guards for the ground hit's named options) a late ground expiry keeps its
//    marks and draws no second burst, and a solid round grazing the ground sprays forward and low where a plunge stands
//    its spurt up;
//  - under the killcam's suppression the runtime keeps its scene graph hidden whatever its subsystems write each frame
//    (they re-showed themselves), hides a child added meanwhile, and the release restores what each owner asked for
//    (round 2 U31: by the veil its visuals are made under, never their own flags: replayVeil.selftest);
//  - a bus takes one runtime: binding twice, or a second runtime (a failed initializer's retry) binding the same bus,
//    never doubles the effects or leaves the first reacting; one runtime bound to two buses (the page's, then the
//    Studio's) keeps hearing both (the Studio's binding dropped the page's: no battle FX after a Studio visit);
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
camera.position.set(0, 3, -40); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true);
function runtime(entities = new Map(), options = {}) {
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) },
    { seed: 5, resolveEntity: (id) => entities.get(id) ?? null, auxiliaryEntities: () => entities.values(), ...options });
  scene.add(fx.group);
  const handlers = new Map();
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => { const l = handlers.get(n); l.splice(l.indexOf(f), 1); }; },
    emit(n, p) { for (const f of [...(handlers.get(n) ?? [])]) f(p); }, handlers };
  fx.bindBus(bus);
  const frames = (n, dt = 1 / 60, shells = []) => { for (let i = 0; i < n; i++) fx.update(dt, shells, camera, (id) => entities.get(id) ?? null); };
  return { fx, bus, frames };
}
function fakeVisual() {
  const root = new THREE.Group();
  scene.add(root);
  return { root, wrecks: 0, life: 0, wrecked: false,
    setDestroyed() { this.wrecks++; this.wrecked = true; }, isDestroyed() { return this.wrecked; }, wreckLife() { return this.life; } };
}

// ---- deferred beats ----
{
  const { fx, frames } = runtime();
  frames(2);
  // a composed kill's wreck is deferred 0.15 s; the killcam opens inside it
  const killed = fakeVisual();
  fx.destruction(new THREE.Vector3(0, 0, 0), killed, 'ammorack');
  assert.equal(killed.wrecks, 0, 'the wreck waits for the fireball');
  fx.setReplaySuppressed(true);
  frames(20);
  assert.equal(killed.wrecks, 1, 'a beat due under the suppression fires (it was dropped for good)');
  const debug = fx.getReplaySuppressionDebug();
  assert.deepEqual(debug.lightIntensities, [0, 0], 'and the lights stay dark while suppressed');
  fx.setReplaySuppressed(false);
  // a Studio actor restaged inside the delay: the deferred wreck was made for the life it ended
  const restaged = fakeVisual();
  fx.destruction(new THREE.Vector3(30, 0, 0), restaged, 'ammorack');
  restaged.life++;
  frames(20);
  assert.equal(restaged.wrecks, 0, 'a deferred wreck never lands on a visual reset since');
  fx.resetAll();
}

// ---- a building's stages are laid once ----
{
  const { fx, bus, frames } = runtime();
  frames(2);
  // what the stage threw: its chunks (and any media), summed over the pools
  const media = () => {
    let n = 0;
    fx.group.traverse((o) => { if (/^fx-(chunks-|volume-media)/.test(o.name) && o.geometry) n += o.geometry.instanceCount ?? 0; });
    return n;
  };
  const stage = (stage, previous) => ({ structureId: 3, massClass: 'house', cx: 10, cz: 5, hw: 4, hd: 5, yaw: 0, baseY: 0, topY: 7,
    stage, previous, cause: 'blast', munition: 'he', x: 10, y: 2, z: 0, dirX: 0, dirZ: 1, points: 300, integrity: 0 });
  bus.emit('structure:stage', stage('collapsed', 'breached'));
  frames(6);
  const once = media();
  assert.ok(once > 0, `a collapse throws its debris (${once} pieces)`);
  fx.resetAll();
  frames(2);
  bus.emit('structure:stage', stage('collapsed', 'breached'));
  bus.emit('structure:stage', stage('collapsed', 'breached'));
  bus.emit('structure:stage', stage('breached', 'damaged'));
  frames(6);
  assert.equal(media(), once, 'a doubled collapse and a late lower stage lay nothing again');
  fx.resetAll();
  frames(2);
  bus.emit('structure:stage', stage('collapsed', 'breached'));
  frames(6);
  assert.equal(media(), once, 'a reset forgets what was laid: the next match lays it again');
  fx.resetAll();
}

// ---- smoke columns follow the fire, not only its events ----
{
  const hull = (id, x, burning) => ({ id, visual: { root: new THREE.Group() }, state: { pos: new THREE.Vector3(x, 0, 12) },
    combat: { destroyed: false, fire: { burning } } });
  const entities = new Map([['burner', hull('burner', 5, true)], ['late', hull('late', -8, true)]]);
  const { fx, bus, frames } = runtime(entities);
  const live = () => fx.getAttachmentDebug().subjects.map((s) => s.id).sort();
  bus.emit('tank:fire', { id: 'burner', burning: true });
  frames(3);
  assert.ok(live().includes('burner'), 'a fire raised with no hit before it smokes where its hull stands');
  const at = fx.getAttachmentDebug().subjects.find((s) => s.id === 'burner');
  assert.ok(Math.abs(at.pos[0] - 5) < 1.5 && Math.abs(at.pos[2] - 12) < 1.5, `at the hull (${at.pos.map((v) => v.toFixed(1))})`);
  frames(40);
  assert.ok(live().includes('late'), "a late joiner's already-burning hull smokes (no tank:fire edge reached it)");
  entities.get('burner').combat.fire.burning = false; // its burning:false lost
  frames(3);
  assert.ok(!live().includes('burner'), 'a fire seen burning goes out with the combat record');
  fx.resetAll();
}

// ---- the burn scan: only a hull this viewer sees, only into a free slot ----
{
  const hull = (id, x, extra = {}) => ({ id, visual: { root: new THREE.Group() }, state: { pos: new THREE.Vector3(x, 0, 12) },
    combat: { destroyed: false, fire: { burning: true } }, ...extra });
  const entities = new Map([['hidden', hull('hidden', 20, { networkVisible: false })], ['seen', hull('seen', -20)]]);
  const { fx, bus, frames } = runtime(entities);
  const live = () => fx.getAttachmentDebug().subjects.map((s) => s.id).filter((id) => !id.startsWith('wreck:')).sort();
  frames(40);
  assert.deepEqual(live(), ['seen'], "a hidden hull's last-sample burning record lights no column (a peer's out-of-sight actor)");
  // a hull seen burning that goes out of sight still burning (its record frozen at burning): its column runs out on its
  // own time and is never lit again at its last-seen place (it was, every half second, for ever)
  entities.get('seen').networkVisible = false;
  frames(200, 0.5);
  assert.deepEqual(live(), [], 'a column whose hull went out of sight ends on its own time');
  fx.resetAll();
  // the cap (four): four fires' columns from their events, and a fifth burning hull the scan finds
  entities.clear();
  for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) {
    entities.set(id, hull(id, i * 6));
    bus.emit('tank:fire', { id, burning: true });
  }
  entities.set('e', hull('e', 30));
  frames(40);
  assert.deepEqual(live(), ['a', 'b', 'c', 'd'], 'the scan never evicts a column for a hull it found');
  entities.get('a').combat.fire.burning = false;
  frames(40);
  assert.deepEqual(live(), ['b', 'c', 'd', 'e'], 'and lights one when a slot frees');
  fx.resetAll();
}

// ---- (round 4 merge review r2) a hull's event point is on the hull where it stands now ----
{
  const hull = { id: 'foe', visual: { root: new THREE.Group() }, state: { pos: new THREE.Vector3(0, 0, 0), yaw: 0 },
    combat: { destroyed: false, fire: { burning: false } } };
  const entities = new Map([['foe', hull]]);
  const { fx, bus, frames } = runtime(entities);
  frames(5);
  // the scorch a thrown track stamps (the pooled ground discs: renderOrder 2, written in world space): its centre
  const discs = [];
  fx.group.traverse((o) => { if (o.isMesh && o.renderOrder === 2 && o.matrixAutoUpdate === false) discs.push(o); });
  const scorchOf = (emit) => {
    const versions = discs.map((m) => m.geometry.attributes.position.version);
    emit();
    const disc = discs.find((m, i) => m.geometry.attributes.position.version !== versions[i]);
    if (!disc) return null;
    const a = disc.geometry.attributes.position.array, n = a.length / 3;
    let x = 0, z = 0;
    for (let i = 0; i < a.length; i += 3) { x += a[i]; z += a[i + 2]; }
    return [x / n, z / n];
  };
  const thrown = (module, source) => () => bus.emit('module:state', { id: 'foe', module, state: 'red', source });
  const at = (p, x, z, what) => assert.ok(p && Math.hypot(p[0] - x, p[1] - z) < 0.5,
    `${what}: at (${x}, ${z}), not (${p?.map((v) => v.toFixed(1))})`);
  // a mode respawn (restart E6a): it died at (60, 60), lives again at (0, 0) and throws a track by a ram
  hull.state.pos.set(60, 0, 60);
  bus.emit('tank:destroyed', { id: 'foe', cause: 'shot', pos: [60, 0, 60] });
  hull.combat.destroyed = true;
  frames(30);
  hull.combat.destroyed = false;
  hull.state.pos.set(0, 0, 0);
  bus.emit('mode:respawn', { type: 'mode_respawn', id: 'foe', team: 'bravo' });
  frames(30);
  at(scorchOf(thrown('trackL', 'ram')), 0, 0, "a new life's ram-thrown track scorches where the hull stands, not at its wreck");
  // one life, no hit: a crash throws one track at (10, 10), a ram the other at (90, 90)
  hull.state.pos.set(10, 0, 10);
  at(scorchOf(thrown('trackL', 'impact')), 10, 10, 'a crash-thrown track scorches where the hull stands');
  frames(30);
  hull.state.pos.set(90, 0, 90);
  frames(30);
  at(scorchOf(thrown('trackR', 'ram')), 90, 90, 'and a later ram-thrown one where it stands then, not at the first');
  // a hit names its point: the track it throws in the same step scorches there; the hull drives on and turns, a ram
  // throws the other track and a fire is raised later (the marketing deck fire): both on the hull where it stands now,
  // at the hit's point on it (its height kept), not where the round struck it
  hull.state.pos.set(20, 0, -20);
  bus.emit('shell:hit', { targetId: 'foe', kind: 'pen', caliberMm: 120, pos: [21, 1.2, -20], normal: [1, 0, 0] });
  at(scorchOf(thrown('trackL', 'hit')), 21, -20, "a hit's thrown track scorches at the hit");
  frames(30);
  hull.state.pos.set(50, 0, 30);
  hull.state.yaw = Math.PI / 2;
  frames(30);
  // the hit sat 1 m to the hull's +X at 1.2 m; turned a quarter (yaw pi/2), that point is 1 m to the world's -Z
  at(scorchOf(thrown('trackR', 'ram')), 50, 29,
    'a later ram-thrown track scorches on the hull where it stands, not at the old hit (21, -20)');
  bus.emit('tank:fire', { id: 'foe', burning: true });
  frames(1);
  const column = fx.getAttachmentDebug().subjects.find((s) => s.id === 'foe');
  assert.ok(column && Math.hypot(column.pos[0] - 50, column.pos[2] - 29) < 0.5 && Math.abs(column.pos[1] - 1.2) < 0.3,
    `a fire raised later is born at the hit's point on the hull where it stands (${column?.pos.map((v) => v.toFixed(1))})`);
  bus.emit('tank:fire', { id: 'foe', burning: false });
  // a hull that no longer resolves keeps its last point in this life, and loses it at a respawn (no beat at the wreck)
  bus.emit('tank:destroyed', { id: 'foe', cause: 'shot', pos: [70, 0, -70] });
  entities.delete('foe');
  at(scorchOf(thrown('trackL', 'impact')), 70, -70, 'a hull that does not resolve: its last point in this life');
  bus.emit('mode:respawn', { type: 'mode_respawn', id: 'foe', team: 'bravo' });
  assert.equal(scorchOf(thrown('trackR', 'ram')), null, "after a respawn its last life's point draws nothing");
  fx.resetAll();
}

// ---- (round 5 U16) a hit on a hull this seat does not see ----
// A network peer's actor out of this seat's spotting carries networkVisible false and its last sample's pose (it moves
// only when a sample comes), and a shooter still hears its own hit on it. Measured on the hull from that pose, the hit
// was off by the distance the hull went unseen, and a beat no hit names once it is seen again (a ram's thrown track,
// the burn scan's column) landed that far off the hull. The hit keeps its world point but no point on the hull. A solo
// hull out of the player's spotting (the page's auxiliaryVisible) stands where its state says: its point stays on it.
{
  const disc = (fx) => {
    const discs = [];
    fx.group.traverse((o) => { if (o.isMesh && o.renderOrder === 2 && o.matrixAutoUpdate === false) discs.push(o); });
    return (emit) => {
      const versions = discs.map((m) => m.geometry.attributes.position.version);
      emit();
      const d = discs.find((m, i) => m.geometry.attributes.position.version !== versions[i]);
      if (!d) return null;
      const a = d.geometry.attributes.position.array, n = a.length / 3;
      let x = 0, z = 0;
      for (let i = 0; i < a.length; i += 3) { x += a[i]; z += a[i + 2]; }
      return [x / n, z / n];
    };
  };
  const near = (p, x, z, what) => assert.ok(p && Math.hypot(p[0] - x, p[1] - z) < 0.5,
    `${what}: at (${x}, ${z}), not (${p?.map((v) => v.toFixed(1))})`);
  const peer = (extra) => ({ id: 'foe', visual: { root: new THREE.Group() },
    state: { pos: new THREE.Vector3(0, 0, 0), yaw: 0 }, combat: { destroyed: false, fire: { burning: false } }, ...extra });
  const hit = (bus, x) => bus.emit('shell:hit',
    { targetId: 'foe', shooterId: 'me', kind: 'pen', caliberMm: 120, pos: [x, 1.2, 0], normal: [-1, 0, 0] });
  // last seen at (0, 0); struck unseen at (hitX, 1.2, 0); seen again at (seenX, 0): a ram throws a track, then the
  // hull is seen burning (its fire's tank:fire edge withheld while it was hidden: the scan starts the column)
  const unseenHit = (hitX, seenX, order) => {
    const hull = peer({ networkVisible: false });
    const entities = new Map([['foe', hull]]);
    const { fx, bus, frames } = runtime(entities);
    const scorchOf = disc(fx);
    frames(5);
    hit(bus, hitX);
    frames(30);
    hull.networkVisible = true;
    hull.state.pos.set(seenX, 0, 0);
    frames(5);
    near(scorchOf(() => bus.emit('module:state', { id: 'foe', module: 'trackL', state: 'red', source: 'ram' })), seenX, 0,
      `${order}: a ram-thrown track once the hull is seen again scorches on the hull`);
    hull.combat.fire.burning = true;
    frames(45);
    const column = fx.getAttachmentDebug().subjects.find((s) => s.id === 'foe');
    assert.ok(column && Math.hypot(column.pos[0] - seenX, column.pos[2]) < 0.5,
      `${order}: the burn scan's column stands on the hull at (${seenX}, 0), not (${column?.pos.map((v) => v.toFixed(1))})`);
    fx.resetAll();
  };
  unseenHit(30, 32, 'struck 30 m from where it was last seen, seen again 2 m on');
  unseenHit(1, 60, 'struck 1 m from where it was last seen, seen again 59 m on');
  // solo: an unspotted hull (auxiliaryVisible false, no networkVisible) is where its state says; the hit 1 m to its +X
  // rides it 20 m on and through a quarter turn (1 m to the world's -Z)
  const hull = peer({});
  hull.state.pos.set(29, 0, 0);
  const entities = new Map([['foe', hull]]);
  const { fx, bus, frames } = runtime(entities, { auxiliaryVisible: () => false });
  const scorchOf = disc(fx);
  frames(5);
  hit(bus, 30);
  frames(30);
  hull.state.pos.set(50, 0, 0);
  hull.state.yaw = Math.PI / 2;
  frames(5);
  near(scorchOf(() => bus.emit('module:state', { id: 'foe', module: 'trackL', state: 'red', source: 'ram' })), 50, -1,
    "an unspotted solo hull's hit stays on the hull (its state is live, not a last sample)");
  fx.resetAll();
}

/** (round 8 Y6, s4-01) the ground-end guards' readings, for the log */
const groundEnds = {};
// ---- one burst per HE round, whatever frames its events land on ----
{
  // the building a wall expiry consults (its look, its strike's seam): counted, so a skipped strike shows
  let asked = 0;
  const world = { structureDamage: () => { asked++; return null; } };
  const { fx, bus, frames } = runtime(new Map(), { world: () => world });
  // the media bodies drawn: a hull's plate burst ~25, the ground's ~100, both ~125
  const bodies = () => fx.group.getObjectByName('fx-volume-media').children[0].geometry.instanceCount;
  const flash = () => fx.getReplaySuppressionDebug().lightIntensities[1];
  const near = (a, b) => Math.abs(a - b) <= 5;
  let id = 100;
  const fired = (shellId) => bus.emit('shell:fired', { shellId, shooterId: 'g', pos: [0, 30, -60], muzzlePos: [0, 30, -60], dir: [0, -0.4, 0.9],
    shellType: 'HE', caliberMm: 125, shellName: '125 mm HE', munition: 'he', chargeKg: 3.4 });
  // the detonation the solo step (and a peer, from the shell_hit's blast) raises on the struck hull before its hull event
  const hullBlast = (munition = 'he') => bus.emit('munition:blast', { munition, chargeKg: 3.4, x: 1, y: 0.8, z: 0, nx: 0, ny: 1, nz: 0,
    surface: 'tank' });
  const hit = (shellId, kind = 'he_splash', extra = {}) => bus.emit('shell:hit', { shellId, attackerId: 'g', targetId: 't', kind,
    damage: 40, pos: [1, 0.8, 0], normal: [0, 1, 0], caliberMm: 125, shellType: 'HE', destroyed: false, ...extra });
  const expired = (shellId, impactAngleDeg) => bus.emit('shell:expired', { shellId, pos: [0, 0, 0], hitTerrain: true, munition: 'he',
    chargeKg: 3.4, caliberMm: 125, shellType: 'HE', ...(impactAngleDeg === undefined ? {} : { impactAngleDeg }) });
  const wallExpired = (shellId) => bus.emit('shell:expired', { shellId, pos: [0, 1.5, 3], hitTerrain: false, hitKind: 'prop',
    structureId: 7, normal: [0, 0, -1], munition: 'he', chargeKg: 3.4, caliberMm: 125, shellType: 'HE' });
  const run = (script) => { fx.resetAll(); frames(2); const shellId = id++; fired(shellId); script(shellId); frames(12); return bodies(); };
  // a ground burst in one step (the solo step's world hit: its hull events, then its expiry): the ground's burst, the
  // hull's fragments
  const sameFrame = run((s) => { hit(s); expired(s); frames(1); });
  // a direct hull hit (the solo step's tank hit: the hull blast, then the hull event, and no expiry ever): its burst
  // draws on the next update (it waited 0.1 s for an expiry that never comes, its flash cut)
  let firstFlash = -1;
  const direct = run((s) => { hullBlast(); hit(s, 'he_pen'); frames(1); firstFlash = flash(); });
  assert.ok(firstFlash > 0, `a direct hull hit flashes on the next update (${firstFlash})`);
  assert.ok(direct > 0 && direct < sameFrame, `and bursts on the hull (${direct})`);
  // a peer's direct hit carries its blast on the hull event
  const peerDirect = run((s) => { hit(s, 'he_pen', { blast: [1, 0.8, 0, 0, 1, 0] }); frames(1); firstFlash = flash(); });
  assert.ok(firstFlash > 0 && near(peerDirect, direct), `a peer's direct hit bursts on the next update too (${firstFlash}, ${peerDirect})`);
  // a network peer's split orders (its budgeted queue lands a round's events up to 4 ticks apart): one burst
  const hullThenExpiry = run((s) => { hit(s); frames(2); expired(s); });
  assert.ok(near(hullThenExpiry, sameFrame), `a hull event, then its expiry two frames later: one burst (${hullThenExpiry} vs ${sameFrame})`);
  const expiryThenHull = run((s) => { expired(s); frames(2); hit(s); });
  assert.ok(near(expiryThenHull, sameFrame), `an expiry, then its hull event two frames later: one burst (${expiryThenHull} vs ${sameFrame})`);
  // a cook-off's blast on a hull names no round: the next splash still waits for its expiry
  const afterCookOff = run((s) => { hullBlast('cook_off'); hit(s); frames(2); expired(s); });
  assert.ok(near(afterCookOff, sameFrame), `a cook-off's blast does not make a splash a direct hit (${afterCookOff} vs ${sameFrame})`);
  const hullOnly = run((s) => { hit(s); });
  assert.ok(hullOnly > 0 && hullOnly < sameFrame, `a splash whose expiry never lands bursts on the hull after its wait (${hullOnly})`);
  // a wall expiry later than the wait: no second burst, but the wall still takes its strike (its hole, its own dust)
  asked = 0;
  const wallInTime = run((s) => { hit(s); wallExpired(s); frames(1); });
  const askedInTime = asked;
  asked = 0;
  const wallLate = run((s) => { hit(s); frames(10); wallExpired(s); });
  assert.ok(askedInTime > 0 && asked === askedInTime, `a late wall expiry still strikes its building (${asked} vs ${askedInTime})`);
  // (the wall's own burst is ~19 bodies: on top of the hull's it would read ~44)
  assert.ok(near(wallLate, hullOnly), `and draws no second burst (${wallLate} vs the hull's ${hullOnly}; the wall's own ${wallInTime})`);
  // (round 8 Y6, s4-01; a regression guard, ROUND8 amendment 7) the same on open ground: a terrain expiry later than the
  // hull's wait (HE_WAIT_S 0.1 s) and inside its burst's keep (HE_BURST_KEEP_S 0.5 s) keeps its ground marks and draws no
  // second burst. Its glancing angle (86 deg) never reaches a charged round's burst. Red on 269's own effects.ts (its
  // per-frame records) and on a merge that passes the hull's burstDrawn in 269's graze slot (the round 8 sweep, s4-01)
  const groundLate = run((s) => { hit(s); frames(10); expired(s, 86); });
  assert.ok(near(groundLate, hullOnly), `a late ground expiry draws no second burst (${groundLate} vs the hull's ${hullOnly}; both ${sameFrame})`);
  // a solid round's end on the ground by its angle, on the media layer: a graze (86 deg incidence, sim/shellSurface.ts
  // grazes) sprays its ground forward and low along its path, a plunge (20 deg) stands its spurt up. Its arrival is the
  // sweep from its muzzle (shell:fired, then the expiry with no frame between: a frame without the round in its shells
  // drops the sweep). Red on a merge that passes graze in the noBurst slot (no strike at all)
  const kineticEnd = (impactAngleDeg) => {
    fx.resetAll(); frames(2);
    const shellId = id++;
    bus.emit('shell:fired', { shellId, shooterId: 'g', pos: [0, 1.2, -60], muzzlePos: [0, 1.2, -60], dir: [0, -0.02, 1],
      shellType: 'APFSDS', caliberMm: 120, shellName: '120 mm APFSDS', munition: 'kinetic', chargeKg: 0 });
    bus.emit('shell:expired', { shellId, pos: [0, 0, 0], hitTerrain: true, munition: 'kinetic', chargeKg: 0, caliberMm: 120,
      shellType: 'APFSDS', impactAngleDeg });
    frames(5); // (a graze lays its bodies 12 ms apart along its furrow)
    // the bodies thrown round the strike (the muzzle's own gas and dust lie 60 m back): how far forward they were born
    // (along +z, the round's path) and how steeply they leave (rise over run, as strikeLooks.selftest reads it)
    const mesh = fx.group.getObjectByName('fx-volume-media').children[0];
    const { aPB, aVL } = mesh.geometry.attributes;
    let n = 0, ahead = -Infinity, steep = 0;
    for (let i = 0; i < mesh.geometry.instanceCount; i++) {
      const [x, , z] = aPB.array.subarray(i * 4, i * 4 + 3), [vx, vy, vz] = aVL.array.subarray(i * 4, i * 4 + 3);
      if (Math.hypot(x, z) > 15 || Math.hypot(vx, vz) + Math.abs(vy) <= 4) continue;
      n++; ahead = Math.max(ahead, z); steep += vy / Math.max(1e-6, Math.hypot(vx, vz));
    }
    return { n, ahead, steep: n ? steep / n : NaN };
  };
  const skip = kineticEnd(86), plunge = kineticEnd(20);
  assert.ok(skip.n > 0 && plunge.n > 0, `a solid round strikes the ground at either angle (${skip.n}, ${plunge.n} sprayed bodies)`);
  assert.ok(skip.steep < 0.5 && skip.ahead > 1, `a graze sprays forward and low (rise/run ${skip.steep.toFixed(2)}, ${skip.ahead.toFixed(2)} m on)`);
  assert.ok(plunge.steep > 1 && plunge.ahead < skip.ahead, `a plunge stands its spurt up (rise/run ${plunge.steep.toFixed(2)}, ${plunge.ahead.toFixed(2)} m on)`);
  Object.assign(groundEnds, { groundLate, hullOnly, sameFrame, grazeRiseRun: +skip.steep.toFixed(2), grazeAheadM: +skip.ahead.toFixed(2),
    plungeRiseRun: +plunge.steep.toFixed(2), plungeAheadM: +plunge.ahead.toFixed(2) });
  fx.resetAll();
}

// ---- the scene graph stays hidden under the suppression ----
{
  const { fx, frames } = runtime();
  frames(2);
  const veil = fx.group.getObjectByName('fx-replay-veil');
  const drawn = (o) => { for (let n = o; n && n !== scene; n = n.parent) if (!n.visible) return false; return true; };
  const shown = () => veil.children.filter((c) => drawn(c)).map((c) => c.name || c.type);
  // live rounds keep their subsystems writing every frame: a tracer, a wire-guided missile
  const shells = [
    { id: 71, pos: new THREE.Vector3(0, 2, 10), vel: new THREE.Vector3(0, 0, 1500), spec: { tracer: 'TANK' }, shooterId: 'g', ageS: 0.05, distM: 60 },
    { id: 72, pos: new THREE.Vector3(4, 3, 20), vel: new THREE.Vector3(0, 0, 250), spec: { guided: true, tracer: 'ATGM' }, shooterId: 'g', ageS: 1, distM: 250 },
  ];
  frames(3, 1 / 60, shells);
  const before = shown();
  assert.ok(before.length > 0, `live rounds draw (${before})`);
  const ownerHidden = veil.children.find((c) => !c.visible);
  fx.setReplaySuppressed(true);
  assert.deepEqual(shown(), [], 'the suppression hides the scene graph at once');
  frames(3, 1 / 60, shells);
  assert.deepEqual(shown(), [], 'and keeps it hidden through the subsystems\' own per-frame writes');
  const late = new THREE.Group();
  late.name = 'late-child';
  veil.add(late);
  frames(1, 1 / 60, shells);
  assert.equal(drawn(late), false, 'a child added under the suppression is hidden too');
  fx.setReplaySuppressed(false);
  assert.ok(before.every((name) => shown().includes(name)), 'the release shows what its owners asked for');
  if (ownerHidden) assert.equal(drawn(ownerHidden), false, 'never a mesh its owner had hidden');
  veil.remove(late);
  fx.resetAll();
}

// ---- a bus takes one runtime, once ----
{
  const groundBurst = (bus, shellId) => {
    bus.emit('shell:fired', { shellId, shooterId: 'g', pos: [0, 30, -60], muzzlePos: [0, 30, -60], dir: [0, -0.4, 0.9], shellType: 'HE',
      caliberMm: 125, shellName: '125 mm HE', munition: 'he', chargeKg: 3.4 });
    bus.emit('shell:expired', { shellId, pos: [0, 0, 0], hitTerrain: true, munition: 'he', chargeKg: 3.4, caliberMm: 125, shellType: 'HE' });
  };
  const media = (fx) => fx.group.getObjectByName('fx-volume-media').children[0].geometry.instanceCount;
  const once = runtime();
  once.frames(2); groundBurst(once.bus, 501); once.frames(6);
  const single = media(once.fx);
  const twice = runtime();
  twice.fx.bindBus(twice.bus);
  twice.frames(2); groundBurst(twice.bus, 502); twice.frames(6);
  assert.ok(Math.abs(media(twice.fx) - single) <= 5, `a bus bound twice reacts once (${media(twice.fx)} vs ${single})`);
  // a second runtime on the first one's bus takes it over
  const first = runtime();
  const second = runtime();
  second.fx.bindBus(first.bus);
  first.bus.emit('tank:destroyed', { id: 'x', cause: 'shot', pos: [3, 0, 3] });
  // (read before a frame: with no corpse to ride, the wreck column leaves at the next update)
  const wreckOf = (fx) => fx.getAttachmentDebug().subjects.some((c) => c.id === 'wreck:x');
  assert.equal(wreckOf(second.fx), true, 'the runtime that bound the bus last reacts');
  assert.equal(wreckOf(first.fx), false, 'the one it replaced no longer does');
  // one runtime on two buses (the page's, then the Studio's private one): binding the second keeps the first, and
  // rebinding either undoes only that bus's earlier binding
  const page = runtime();
  const studioHandlers = new Map();
  const studioBus = { on(n, f) { (studioHandlers.get(n) ?? studioHandlers.set(n, []).get(n)).push(f);
    return () => { const l = studioHandlers.get(n); l.splice(l.indexOf(f), 1); }; },
  emit(n, p) { for (const f of [...(studioHandlers.get(n) ?? [])]) f(p); } };
  const listeners = (handlers) => [...handlers.values()].reduce((n, l) => n + l.length, 0);
  const pageListeners = listeners(page.bus.handlers);
  page.fx.bindBus(studioBus);
  page.fx.bindBus(studioBus);
  assert.equal(listeners(page.bus.handlers), pageListeners, 'binding a second bus keeps the first bus\'s subscriptions');
  assert.equal(listeners(studioHandlers), pageListeners, 'and the second, bound twice, holds one set');
  page.bus.emit('tank:destroyed', { id: 'p', cause: 'shot', pos: [3, 0, 3] });
  studioBus.emit('tank:destroyed', { id: 's', cause: 'shot', pos: [-3, 0, 3] });
  const wrecks = page.fx.getAttachmentDebug().subjects.map((c) => c.id).filter((id) => id.startsWith('wreck:')).sort();
  assert.deepEqual(wrecks, ['wreck:p', 'wreck:s'], `the runtime reacts once to each bus (${wrecks})`);
  page.fx.resetAll(); page.frames(2); groundBurst(page.bus, 503); page.frames(6);
  assert.ok(Math.abs(media(page.fx) - single) <= 5, `the page bus still bursts once after the Studio's binding (${media(page.fx)} vs ${single})`);
  for (const r of [once, twice, first, second, page]) r.fx.resetAll();
}

console.log(`fxLifecycles.selftest: deferred beats fire under suppression and never outlive their visual's life; a building's stages are laid once; smoke columns follow the fire; a hull's event point is on the hull where it stands now, never measured from an unseen hull's last sample; one burst per HE round (ground ends ${JSON.stringify(groundEnds)}); the scene graph stays hidden under the suppression; a bus takes one runtime`);
