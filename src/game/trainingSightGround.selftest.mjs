// trainingSightGround.selftest.mjs — a training shooter that fires only at what it sees reads the simulation's ground
// (276 sim-det-trig; Main's ruling on the class of combat data only the page held). Copyright © 2026 Kevin B. Liu.
//
// S11's Sentry 3 and S13's Bulwark fire only at a player they can see over the ground (sim/trainingGround.ts whenSeen,
// sim/trainingSight.ts trainingExposure). The step read that ground from game._groundSampler, the drawn surface main.ts
// hands the page's running gear: a Node replay or any driver without a page has none, and there whenSeen held true (every
// tank seen through every wall and hill). The step now reads the battle's own ground (game/state.ts groundFor: the world's
// field plus the battle's overlay, the map's craters and the course stamps laid at setup), which every driver steps on.
// Held on Verdant's committed shard, the authority's world, with Sentry 3 cued and the player first where the battle's
// ground hides the whole tank from it (the hidden spot nearest ring Q, found on that ground), then out at ring Q:
//   - run with no page sampler and with a planted one that would hide every tank (its ground 1 km up), the battles are the
//     same step for step (each hull's pose, health and every round fired): the step reads no page sampler;
//   - the planted sampler is a strong control: from Sentry 3 it hides ring Q, where the battle's ground shows the player;
//   - and the ground decides it: Sentry 3 never fires while the player is hidden, starts its 4 s sight clock only once the
//     player is out at Q, and fires there no sooner than that.
// Builds the training roster and a world: MANUAL suite 'sims' (tools/selftest-tiers.mjs).
import assert from 'node:assert/strict';
import { Group } from 'three';
import { installCanvasFixture } from '../vehicles/canvasFixture.test-support.mjs';

installCanvasFixture();
const { ensureAuthorityFleet } = await import('../vehicles/authorityFleet.ts');
const { createBus, createCollider, createGameState, cueTrainingActor, setupBattle, simStep } = await import('./state.ts');
const { planBattleParticipantIds, spawnTanks } = await import('./rosterState.ts');
const { soloRosterPlan } = await import('./soloRosterPlan.ts');
const { TRAINING_POINTS, TRAINING_RULES, trainingActor } = await import('../sim/trainingGround.ts');
const { trainingExposure } = await import('../sim/trainingSight.ts');
const { createDeformedHeightField } = await import('../sim/terrainDeformation.ts');
const { createDedicatedWorldCollision } = await import('../../server/dedicatedWorldCollision.ts');

const LOANER = TRAINING_RULES.loanerSpecId;
const SENTRY3 = trainingActor(TRAINING_RULES, 'sentry3');
const Q = TRAINING_POINTS.ringQ;
/** Steps the battle settles before the scene, then hidden after the cue, then out at Q. */
const SETTLE_STEPS = 60, HIDDEN_STEPS = 600, OUT_STEPS = 900;
/** A page sampler whose ground stands 1 km up: read by the step, it would hide every tank from every shooter. */
const PLANTED = Object.assign(() => 1000, { prepareHull() {} });

const visualStub = () => ({ root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {}, resetDestroyed() {} });
const facing = (point) => Math.atan2(SENTRY3.x - point.x, SENTRY3.z - point.z);

/** The shard world given the page's spawn points as world/map.ts derives them from the layout (setup's placement anchors;
 *  the training battle seats every hull from its own layout), and the ground overlay setup binds kept for the receipt. */
function battleWorld() {
  const world = createDedicatedWorldCollision(TRAINING_RULES.mapId, { retain: true });
  const field = world.heightField, sp = field._layout.spawns;
  const at = (point) => ({ pos: [point.x, field.getHeightAt(point.x, point.z), point.z], yaw: point.yaw });
  world.spawnPoints = { player: at(sp.player), enemies: sp.enemies.map(at) };
  const bind = world.bindGroundOverlay;
  world.bindGroundOverlay = (overlay) => { world.boundOverlay = overlay; bind.call(world, overlay); };
  return world;
}

/** The hidden spot nearest Q: 40-160 m from Sentry 3, the whole tank (hull and turret) under the battle's ground. */
function hiddenSpot(eye, groundY) {
  let best = null;
  for (let r = 40; r <= 160; r += 5) for (let deg = 0; deg < 360; deg += 5) {
    const x = SENTRY3.x + r * Math.sin(deg * Math.PI / 180), z = SENTRY3.z + r * Math.cos(deg * Math.PI / 180);
    const seen = trainingExposure(eye, { x, y: groundY(x, z), z, yaw: facing({ x, z }) }, groundY);
    const toQ = Math.hypot(x - Q.x, z - Q.z);
    if (!seen.hull && !seen.turret && (!best || toQ < best.toQ)) best = { x, z, toQ };
  }
  return best;
}

/** Seats the loaner at `point` facing Sentry 3, at rest on the battle's ground. */
function seat(player, point, groundY) {
  player.state.pos.set(point.x, groundY(point.x, point.z), point.z);
  player.state.yaw = facing(point);
  player.state.speed = 0;
  if (player.state.vel) player.state.vel.set(0, 0, 0);
}

async function runS11(pageSampler) {
  const world = battleWorld();
  try {
    const game = createGameState({ rosterSeed: TRAINING_RULES.seed });
    game.mapId = TRAINING_RULES.mapId;
    game.gameMode = 'training';
    spawnTanks(game, { scene: { remove() {} } });
    for (const hull of game.allTanks) if (hull) hull.visual = visualStub();
    if (pageSampler) game._groundSampler = pageSampler;
    const plan = soloRosterPlan('training', null, true);
    const planned = planBattleParticipantIds(game, LOANER, true, plan.nations, plan.slots, plan.formationLead, plan.national, plan.exact);
    await ensureAuthorityFleet([LOANER, ...planned]);
    setupBattle(game, LOANER, world, { gameMode: 'training', random: true, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false });
    assert.ok(game.ruleset.training, 'a training battle');
    assert.ok(world.boundOverlay, 'setup binds the battle\'s ground overlay to the world');
    const sentry = game.tanks.find((hull) => hull.specId === SENTRY3.specId);
    assert.ok(sentry, 'Sentry 3 is on the roster');
    // the battle's ground as the step reads it (groundFor: the world's field under the overlay setup bound)
    const field = createDeformedHeightField(world.heightField, world.boundOverlay);
    const groundY = (x, z) => (field.getContactHeightAt ?? field.getHeightAt).call(field, x, z);
    const bus = createBus();
    const collider = createCollider(game, world);
    const fired = [];
    let now = 0;
    bus.on('shell:fired', (event) => { if (event.shooterId === sentry.id) fired.push(now); });
    const player = game.player;
    const rows = [];
    let seenFrom = null;
    // the battle's first steps settle its ground (its clocked overlay) and its hulls; the scene starts after them
    for (let step = 0; step < SETTLE_STEPS; step++) simStep(game, bus, world, null, collider);
    const eye = { x: sentry.state.pos.x, y: sentry.state.pos.y, z: sentry.state.pos.z };
    const hidden = hiddenSpot(eye, groundY);
    assert.ok(hidden, 'the battle\'s ground hides the whole tank somewhere near Sentry 3');
    // seated there (the solve carries the hull's height down to the ground over its first steps), it settles before the cue
    seat(player, hidden, groundY);
    for (let step = 0; step < SETTLE_STEPS * 2; step++) simStep(game, bus, world, null, collider);
    const settled = trainingExposure(eye, { x: player.state.pos.x, y: player.state.pos.y, z: player.state.pos.z, yaw: player.state.yaw }, groundY);
    assert.ok(!settled.hull && !settled.turret, 'settled there, the whole tank is under the ground Sentry 3 looks over');
    assert.ok(cueTrainingActor(game, 'sentry3', true), 'Sentry 3 takes its cue');
    for (let step = 0; step < HIDDEN_STEPS + OUT_STEPS; step++) {
      now = step;
      if (step === HIDDEN_STEPS) seat(player, Q, groundY);
      if (!player.combat.destroyed) { player.input.throttle = 0; player.input.steer = 0; player.input.brake = true; player.input.fire = false; }
      simStep(game, bus, world, null, collider);
      if (seenFrom === null && game._trainingSeenSince?.has('sentry3')) seenFrom = step;
      rows.push(game.tanks.map((hull) => [hull.state.pos.x, hull.state.pos.y, hull.state.pos.z, hull.state.yaw, hull.combat.hp].join(',')).join(';'));
    }
    return { rows, fired, seenFrom, eye, hidden, groundY };
  } finally {
    world.release?.();
  }
}

const bare = await runS11(null);
const planted = await runS11(PLANTED);

// the step reads no page sampler: the two battles are the same, step for step
assert.equal(planted.rows.length, bare.rows.length);
const parted = bare.rows.findIndex((row, i) => row !== planted.rows[i]);
assert.equal(parted, -1, `the battle with a page sampler leaves the one without at step ${parted + 1}`);
assert.deepEqual(planted.fired, bare.fired, 'and Sentry 3 fires the same rounds at the same steps');

// the control: read by the step, the planted sampler would have hidden the player Sentry 3 sees at Q
const atQ = { x: Q.x, y: bare.groundY(Q.x, Q.z), z: Q.z, yaw: facing(Q) };
const onGround = trainingExposure(bare.eye, atQ, bare.groundY);
const underPlanted = trainingExposure(bare.eye, atQ, PLANTED);
assert.ok(onGround.hull || onGround.turret, 'on the battle\'s ground Sentry 3 sees the player at ring Q');
assert.ok(!underPlanted.hull && !underPlanted.turret, 'control: the planted page sampler hides it there');

// the ground decides it: hidden it never fires and its sight clock stays empty; out at Q it counts and fires
assert.ok(bare.fired.every((step) => step >= HIDDEN_STEPS), `no round while the player was hidden (rounds at ${bare.fired.join(', ')})`);
assert.ok(bare.seenFrom !== null && bare.seenFrom >= HIDDEN_STEPS, `the sight clock starts only once the player is out at Q (step ${bare.seenFrom})`);
assert.ok(bare.fired.length >= 1, 'and out at Q, seen 4 s, Sentry 3 fires');
const firstOut = bare.fired[0] - HIDDEN_STEPS;
assert.ok(firstOut >= SENTRY3.volley.seenS * 60, `its first round only after ${SENTRY3.volley.seenS} s in sight (${(firstOut / 60).toFixed(2)} s)`);

console.log(`trainingSightGround.selftest: Sentry 3 on Verdant's shard, ${HIDDEN_STEPS + OUT_STEPS} steps, with and without a page sampler `
  + `(one hiding every tank): the same battle step for step; silent while the player stood hidden at `
  + `(${bare.hidden.x.toFixed(0)}, ${bare.hidden.z.toFixed(0)}), its sight clock from step ${bare.seenFrom}, its first round `
  + `${(firstOut / 60).toFixed(2)} s after the player came out at ring Q (${bare.fired.length} round(s))`);
