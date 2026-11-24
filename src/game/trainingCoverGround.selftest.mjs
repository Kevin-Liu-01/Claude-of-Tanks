// trainingCoverGround.selftest.mjs — S11's wall hides the whole loaner from Sentry 3 on Verdant's own ground (276
// tutorial-s11-cover). Copyright © 2026 Kevin B. Liu.
//
// The sim-det-trig lane found (2026-11-24) that "take cover behind the wall" could not be done: Sentry 3 stands 9.5 m over
// ring P on Verdant, and from no spot 0.5 to 14 m behind the wall was the loaner's turret hidden. trainingThreat.selftest
// held the wall on flat ground and the stamp's analytic height (offsetAt, 2.8 m); the battle's sight and the page's
// running gear read the overlay on the contact lattice's triangles (sim/terrainDeformation.ts contactOffsetAt, 1.33 m
// apart), where the wall's 1 m top fell between the points and stood 2.08 m. The wall now stands 7 m out with a 2 m top,
// 3 m high (sim/trainingGround.ts). Held on Verdant's committed shard, the authority's world, with the map's craters and
// the training stamps laid as setup lays them (game/state.ts setupBattle) and read by the step's own rule (groundFor:
// contact, else the fast, else the plain sampler; the page's sampler reads the same contact surface):
//   - at ring P, from Sentry 3 standing on that ground, the whole tank (hull and turret, sim/trainingSight.ts
//     trainingExposure) is hidden nose on, along the wall and both reversed, and still hidden 0.5 m higher;
//   - across the ring (to its back and its sides) nose on, along the wall toward Q and tail on, hidden whole;
//   - out at ring Q, seen, hull and turret: the peek still shows the tank;
//   - controls: the first wall (6 m out, 1 m top, 2.8 m) on the same ground shows the turret at P; the same wall on the
//     flat analytic ground the old receipt read hides it (why that receipt passed); with no wall, P is seen.
import assert from 'node:assert/strict';

const { TRAINING_POINTS, TRAINING_RULES, planTrainingRange, trainingActor } = await import('../sim/trainingGround.ts');
const { trainingExposure } = await import('../sim/trainingSight.ts');
const { createDeformedHeightField, createTerrainDeformation } = await import('../sim/terrainDeformation.ts');
const { mapCraterStampsOf, stampMapCraters } = await import('../world/mapCraters.ts');
const { createDedicatedWorldCollision } = await import('../../server/dedicatedWorldCollision.ts');

const SENTRY3 = trainingActor(TRAINING_RULES, 'sentry3');
const P = TRAINING_POINTS.ringP, Q = TRAINING_POINTS.ringQ;
const WALL = TRAINING_RULES.earthworks.find((work) => work.toward === 'sentry3');
assert.ok(SENTRY3 && WALL, 'Sentry 3 and the wall stamped toward it');
/** The headroom the cover keeps over the tank at P (m): a pitch, a settle or a lattice split away from showing it. */
const HEADROOM_M = 0.5;
/** The first wall (273 S11), the planted control: 6 m in front of P, a 1 m top, 2.8 m high. */
const L = Math.hypot(SENTRY3.x - P.x, SENTRY3.z - P.z), ux = (SENTRY3.x - P.x) / L, uz = (SENTRY3.z - P.z) / L;
const OLD_WALL = Object.freeze({ ...WALL, x: P.x + ux * 6, z: P.z + uz * 6, profile: Object.freeze([-1.6, 0, -0.5, 2.8, 0.5, 2.8, 1.6, 0]) });

const world = createDedicatedWorldCollision(TRAINING_RULES.mapId, { retain: true });
try {
  assert.equal(typeof world.heightField.getContactHeightAt, 'function', 'the shard\'s field has the contact surface the step reads');
  const craters = mapCraterStampsOf(world);
  /** The battle's ground for `earthworks` as setup lays it (the map's craters, then the training stamps) and the step reads
   *  it (game/state.ts groundFor), and the overlay's peak on the contact surface across `work`'s line. */
  const groundWith = (earthworks) => {
    const overlay = createTerrainDeformation();
    stampMapCraters(overlay, craters);
    for (const stamp of planTrainingRange({ ...TRAINING_RULES, earthworks }).course.stamps) overlay.addCourse(stamp);
    const field = createDeformedHeightField(world.heightField, overlay);
    const sample = field.getContactHeightAt ?? field.getHeightAtFast ?? field.getHeightAt;
    return { groundY: (x, z) => sample.call(field, x, z), overlay };
  };
  const peakOf = (overlay, work) => {
    let peak = 0;
    for (let s = -3; s <= 3; s += 0.05) peak = Math.max(peak, overlay.contactOffsetAt(work.x + ux * s, work.z + uz * s));
    return peak;
  };
  const others = TRAINING_RULES.earthworks.filter((work) => work !== WALL);
  const now = groundWith(TRAINING_RULES.earthworks), old = groundWith([...others, OLD_WALL]), none = groundWith(others);
  const eyeOn = ({ groundY }) => ({ x: SENTRY3.x, y: groundY(SENTRY3.x, SENTRY3.z), z: SENTRY3.z });
  const eye = eyeOn(now);
  const pY = now.groundY(P.x, P.z);
  assert.ok(eye.y - pY > 9, `the scene's premise: Sentry 3 stands over 9 m above ring P (${(eye.y - pY).toFixed(2)} m)`);

  const facing = Math.atan2(ux, uz), along = Math.atan2(Q.x - P.x, Q.z - P.z);
  const deg = (yaw) => `${Math.round(yaw * 180 / Math.PI)}`;
  const exposure = (ground, x, z, yaw, raise = 0) => trainingExposure(eyeOn(ground), { x, y: ground.groundY(x, z) + raise, z, yaw }, ground.groundY);
  const hidden = (e) => !e.hull && !e.turret;

  // at ring P: hidden whole every way the hull stands in cover, with headroom
  for (const yaw of [facing, along, facing + Math.PI, along + Math.PI]) {
    assert.ok(hidden(exposure(now, P.x, P.z, yaw)), `at ring P the whole tank is hidden from Sentry 3 (yaw ${deg(yaw)})`);
    assert.ok(hidden(exposure(now, P.x, P.z, yaw, HEADROOM_M)), `and still hidden ${HEADROOM_M} m higher (yaw ${deg(yaw)})`);
  }
  // across the ring: its back half and both sides, nose on, along the wall toward Q and tail on
  let spots = 0;
  for (const back of [0, 1.5, 3]) for (const side of [-2.5, 0, 2.5]) for (const yaw of [facing, along, facing + Math.PI]) {
    const x = P.x - ux * back + uz * side, z = P.z - uz * back - ux * side;
    assert.ok(hidden(exposure(now, x, z, yaw)), `inside ring P (${back} m back, ${side} m over, yaw ${deg(yaw)}) the whole tank is hidden`);
    spots++;
  }
  // out at ring Q: seen, hull and turret
  for (const yaw of [facing, along]) {
    const atQ = exposure(now, Q.x, Q.z, yaw);
    assert.ok(atQ.hull && atQ.turret, `out at ring Q Sentry 3 sees hull and turret (yaw ${deg(yaw)})`);
  }

  // controls: the first wall on Verdant's ground shows the turret; on the old receipt's flat analytic ground it hid it
  const oldAtP = exposure(old, P.x, P.z, facing);
  assert.ok(oldAtP.turret, 'control: behind the first wall on Verdant\'s ground, Sentry 3 sees the turret at P');
  const flatOld = createTerrainDeformation();
  for (const stamp of planTrainingRange({ ...TRAINING_RULES, earthworks: [...others, OLD_WALL] }).course.stamps) flatOld.addCourse(stamp);
  const flatY = (x, z) => flatOld.offsetAt(x, z);
  assert.ok(hidden(trainingExposure({ x: SENTRY3.x, y: 0, z: SENTRY3.z }, { x: P.x, y: flatY(P.x, P.z), z: P.z, yaw: facing }, flatY)),
    'control: on flat analytic ground the first wall hid it (the old receipt\'s blind spot)');
  assert.ok(!hidden(exposure(none, P.x, P.z, facing)), 'control: with no wall, Sentry 3 sees the tank at P');
  // the cause: the first wall's 1 m top stood well under its 2.8 m on the contact lattice; the new top stands nearly whole
  const oldPeak = peakOf(old.overlay, OLD_WALL), newPeak = peakOf(now.overlay, WALL);
  assert.ok(oldPeak < 2.3, `the first wall stood ${oldPeak.toFixed(2)} m on the contact lattice, not 2.8`);
  assert.ok(newPeak > WALL.profile[3] - 0.15, `the wall stands ${newPeak.toFixed(2)} m of its ${WALL.profile[3]} on the contact lattice`);

  console.log(`trainingCoverGround.selftest: PASS (Verdant's shard, Sentry 3 ${(eye.y - pY).toFixed(1)} m over ring P: the whole loaner hidden at P `
    + `four ways with ${HEADROOM_M} m to spare and at ${spots} poses across the ring, seen at Q; the wall ${newPeak.toFixed(2)} m on the contact `
    + `lattice. Controls: the first wall (${oldPeak.toFixed(2)} m there) shows the turret, hid it on flat analytic ground; no wall, seen)`);
} finally {
  world.release?.();
}
