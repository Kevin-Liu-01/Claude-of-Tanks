// A drone whose flight ends in the air (recall, battery, signal) flies home and lands on its carrier's dock (round 3,
// 2026-10-10). Presentation only: the sim's cooldown and every gameplay timing are untouched; the airframe is drawn by
// exactly one owner every frame (the flight pool until the dock takes the landing over); an airframe that struck
// something never returns; a destroyed or relaunched carrier, a blocked column or the time bound ends the flight home.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createDronePresentation } from './dronePresentation.ts';
import { DRONE_ARRIVAL, DRONE_RETURN } from './droneArrival.ts';
import { syncMissionAttachment, clearMissionAttachment, missionAttachmentVisualFrame, missionHoldDownOpen } from '../game/missionAttachmentVisual.ts';
import { missionAttachmentTurretPivot } from '../sim/missionAttachment.ts';
import { AERIAL_RULES } from '../sim/matchRuleset.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';

const dt = 1 / 60, spec = TANK_SPECS.m1a1_abrams_hc, measured = {};
function carrier() {
  const root = new Group(), turret = new Group();
  turret.name = 'rig_turret'; turret.position.set(...missionAttachmentTurretPivot(spec)); root.add(turret);
  root.position.set(40, 3, -25); root.rotation.y = .7; root.updateMatrixWorld(true);
  const view = { kind: 'drone', active: false, cooldownS: 0 };
  syncMissionAttachment(root, spec, view, false, dt);
  return { root, view, destroyed: false };
}
function scene({ blockColumn = false } = {}) {
  const tank = carrier(), group = new Group();
  let rays = 0, columnRays = 0;
  const world = { raycast(origin, direction, maxDist) {
    rays++;
    // A bough over the carrier: anything cast straight down within 2 m of the column meets it 6 m above the dock.
    const frame = missionAttachmentVisualFrame(tank.root), dock = frame.getWorldPosition(new Vector3());
    if (blockColumn && direction.y < -.9 && Math.hypot(origin.x - dock.x, origin.z - dock.z) < 2) {
      columnRays++;
      const dist = (origin.y - (dock.y + 6)) / -direction.y;
      return dist > 0 && dist < maxDist ? { dist } : null;
    }
    return null;
  } };
  const events = [];
  const pool = createDronePresentation(group, {
    onReturnEvent: (id, event, reason) => events.push(`${id}:${event}:${reason.split(' (')[0]}`),
    world: () => world,
    resolveCarrier: (ownerId) => ownerId === 'p1'
      ? { frame: missionAttachmentVisualFrame(tank.root), destroyed: tank.destroyed, flying: tank.view.active } : null,
  });
  const drawn = () => group.children.filter((m) => m.name.includes('airframes')).reduce((sum, m) => sum + m.count, 0);
  let time = 0;
  /** One rendered frame in the battle's order: the carriers' visuals, then the effects. */
  const frame = (writes = []) => {
    time += dt;
    syncMissionAttachment(tank.root, spec, tank.view, tank.destroyed, dt);
    pool.begin(time, new Vector3(0, 40, 0));
    for (const w of writes) pool.write(w.pos, w.vel, w.id, undefined, w.ageS, 'USA', undefined, w.owner);
    pool.end();
  };
  return { tank, group, pool, drawn, frame, events, rays: () => rays, columnRays: () => columnRays, now: () => time };
}

// 1. Recall over the battlefield: the airframe flies home at cruise height, descends the dock's column, hands over to
//    the dock's landing at its first pose, lands and sits on the cradle through the rest of the cooldown.
{
  const s = scene(), { tank, pool } = s, dock = missionAttachmentVisualFrame(tank.root).getWorldPosition(new Vector3());
  const start = new Vector3(dock.x + 260, dock.y + 38, dock.z - 140), vel = new Vector3(-20, 0, 6);
  tank.view.active = true;
  for (let i = 0; i < 30; i++) s.frame([{ pos: start.clone().addScaledVector(vel, i * dt), vel, id: 7, ageS: AERIAL_RULES.drone.launchS + 5 + i * dt, owner: 'p1' }]);
  assert.equal(s.drawn(), 1, 'the live flight draws');
  // The recall: the shell is gone and the cooldown starts; the sim never sees the flight home.
  tank.view.active = false; tank.view.cooldownS = AERIAL_RULES.drone.cooldownS;
  const phases = [], landingStart = { frame: -1 };
  let frames = 0, minTransitY = Infinity, handedOver = -1, overlaps = 0, gaps = 0;
  const arrival = () => tank.root.getObjectByName('Docked FPV arrival');
  while (frames < 60 * 30) {
    s.frame(); frames++;
    tank.view.cooldownS = Math.max(0, tank.view.cooldownS - dt);
    const r = pool.returning().get(7), landing = arrival()?.visible === true;
    if (r && phases[phases.length - 1] !== r.phase) phases.push(r.phase);
    if (r?.phase === 'transit' && r.t > 1.5) minTransitY = Math.min(minTransitY, r.pos.y);
    const flying = s.drawn();
    if (flying && landing) overlaps++;
    if (handedOver < 0 && landing) { handedOver = frames; landingStart.frame = frames; }
    if (phases.includes('handoff') && !flying && !landing && handedOver < 0) gaps++;
    if (handedOver > 0 && !landing && !r) break;
  }
  assert.deepEqual(phases, ['grace', 'transit', 'descent', 'handoff'], 'grace, transit, descent and hand-over in order');
  assert.ok(minTransitY >= dock.y + DRONE_RETURN.cruiseAboveDockM - 1, 'the transit holds its cruise height over the battlefield');
  assert.ok(handedOver > 0 && handedOver * dt < DRONE_RETURN.maxS, `home inside the bound (${(handedOver * dt).toFixed(1)} s)`);
  assert.equal(overlaps, 0, 'never two airframes: the flight copy stops the frame the dock takes the landing');
  assert.equal(gaps, 0, 'never none: the hand-over frame is drawn by the flight copy');
  Object.assign(measured, { homeS: +(handedOver * dt).toFixed(2), cruiseAboveDockM: +(minTransitY - dock.y).toFixed(1), landedS: +(frames * dt).toFixed(2) });
  assert.deepEqual(s.events, ['7:start:owner p1', '7:end:handed over'], 'the diagnostics report the start and the hand-over');
  const detail = tank.root.getObjectByName('Docked FPV airframe detail');
  assert.ok(detail.visible && tank.root.getObjectByName('Docked FPV mission payload').visible, 'the airframe sits on its cradle after the landing');
  assert.ok(tank.view.cooldownS > 0, 'it landed inside the cooldown, which ran unchanged');
  // the clamps flip down over the skids in their swing time (round 4b: 0.45 s, readable in 0.1 s stills)
  for (let i = 0; i < Math.ceil(.5 / dt) + 2; i++) s.frame();
  assert.equal(missionHoldDownOpen(tank.root), 0, 'the clamps close on the airframe that came home');
  // At the cooldown's end the airframe that came home is the ready one: no second landing.
  while (tank.view.cooldownS > 0) { s.frame(); tank.view.cooldownS = Math.max(0, tank.view.cooldownS - dt * 8); }
  for (let i = 0; i < 5; i++) { s.frame(); assert.ok(!arrival()?.visible && detail.visible, 'no second landing at the ready edge'); }
  clearMissionAttachment(tank.root);
}

// 2. An airframe that struck a tank or the world never flies home.
{
  const s = scene(), { tank, pool } = s, at = new Vector3(100, 30, 0), vel = new Vector3(0, -10, 30);
  tank.view.active = true;
  for (let i = 0; i < 10; i++) s.frame([{ pos: at, vel, id: 9, ageS: 10, owner: 'p1' }]);
  pool.markImpact(9); tank.view.active = false; tank.view.cooldownS = 25;
  s.frame(); s.frame();
  assert.equal(pool.returning().size, 0, 'an impact claims the airframe');
  assert.deepEqual(s.events, ['9:skip:impact'], 'the diagnostics name the impact');
  assert.equal(s.drawn(), 0);
  clearMissionAttachment(tank.root);
}

// 3. A flight that ends during the launch climb (still the dock's to draw) or a carrier lost mid-flight home.
{
  const s = scene(), { tank, pool } = s;
  tank.view.active = true;
  for (let i = 0; i < 10; i++) s.frame([{ pos: new Vector3(40, 6, -25), vel: new Vector3(0, 8, 0), id: 11, ageS: .5 + i * dt, owner: 'p1' }]);
  tank.view.active = false; tank.view.cooldownS = 25; s.frame();
  assert.equal(pool.returning().size, 0, 'a launch that never flew free does not fly home');
  tank.view.active = true;
  for (let i = 0; i < 10; i++) s.frame([{ pos: new Vector3(140, 30, -25), vel: new Vector3(20, 0, 0), id: 12, ageS: 9, owner: 'p1' }]);
  tank.view.active = false; tank.view.cooldownS = 25;
  for (let i = 0; i < 40; i++) s.frame();
  assert.equal(pool.returning().size, 1, 'flying home');
  tank.destroyed = true; s.frame();
  assert.equal(pool.returning().size, 0, 'a destroyed carrier ends the flight home');
  assert.equal(s.drawn(), 0);
  tank.destroyed = false;
  for (let i = 0; i < 10; i++) s.frame([{ pos: new Vector3(140, 30, -25), vel: new Vector3(20, 0, 0), id: 13, ageS: 9, owner: 'p1' }]);
  tank.view.cooldownS = 0; for (let i = 0; i < 40; i++) s.frame();
  tank.view.active = true; s.frame();
  assert.equal(pool.returning().size, 0, 'a relaunch from the carrier ends the flight home');
  clearMissionAttachment(tank.root);
}

// 4. A bough across the column: the flight home sees it on the world's own raycast and goes no further.
{
  const s = scene({ blockColumn: true }), { tank, pool } = s;
  tank.view.active = true;
  for (let i = 0; i < 10; i++) s.frame([{ pos: new Vector3(90, 30, -25), vel: new Vector3(-10, 0, 0), id: 21, ageS: 9, owner: 'p1' }]);
  tank.view.active = false; tank.view.cooldownS = 25;
  let reachedDescent = false;
  for (let i = 0; i < 60 * DRONE_RETURN.maxS && (pool.returning().size || i < 2); i++) {
    s.frame();
    if (pool.returning().get(21)?.phase === 'descent') reachedDescent = true;
  }
  assert.ok(s.columnRays() > 0, 'the column was checked on the world raycast');
  assert.equal(reachedDescent, false, 'a blocked column is never descended');
  assert.equal(pool.returning().size, 0, 'the flight home ends there');
  assert.ok(!tank.root.getObjectByName('Docked FPV arrival')?.visible, 'and no landing starts');
  clearMissionAttachment(tank.root);
}

// 5. The landing it hands over to is the dock's own law: from heightM straight down the certified column.
assert.ok(DRONE_ARRIVAL.heightM > 1 && DRONE_RETURN.maxS + DRONE_RETURN.graceS < AERIAL_RULES.drone.cooldownS, 'home before the next airframe is due');
console.log(`droneReturn (${JSON.stringify(measured)}): recall flies home at cruise height, descends the column, one drawer through the hand-over, lands inside the unchanged cooldown, clamps close; impacts, unflown launches, lost or relaunched carriers and blocked columns never fly home`);
