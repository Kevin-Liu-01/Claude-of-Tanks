// The recalled drone's landing, as drawn (owner 2026-10-14: "if we do [recall it], show the landing animation"). The
// authority holds the dock for the recall timing law's window (sim/droneRecall.ts): the flight home, then the landing,
// then the shorter recall cooldown. This pins the drawn side to it: from every distance and height in the link's range,
// at 30 and 60 frames a second and over a carrier driving away or across, the airframe flies home in one piece (drawn
// every frame, by exactly one owner), reaches the landing's first pose no later than the law allots and within a short
// beat of it, and the dock's landing animation runs its full length and parks the airframe before the authority counts
// it parked, so the next launch never cuts a landing. Verifier 2026-10-14: the law now bounds the transit (a recall
// from high above, far below or out at the link's edge flies home faster), so the sweep covers the whole envelope:
// from the column itself out to the link's edge, from 400 m below the dock to its ceiling 840 m above, climbing or
// diving flat out at the recall; a recall from above never drops under the cruise height on its way down.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createDronePresentation } from './dronePresentation.ts';
import { DRONE_ARRIVAL } from './droneArrival.ts';
import { syncMissionAttachment, clearMissionAttachment, missionAttachmentVisualFrame } from '../game/missionAttachmentVisual.ts';
import { missionAttachmentTurretPivot } from '../sim/missionAttachment.ts';
import { AERIAL_RULES } from '../sim/matchRuleset.ts';
import { droneReturnS, droneDockS } from '../sim/droneRecall.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';

const spec = TANK_SPECS.m1a2, RECALL = AERIAL_RULES.drone.recall, LANDING_S = DRONE_ARRIVAL.descentS + DRONE_ARRIVAL.spoolS;
const EARLY_S = 1.6;
/** A recall made climbing or diving flat out: the airframe's own way carries it part of the climb or sink the law
 * (which reads where it was) allots, so it may be home sooner, never later. */
const MOVING_EARLY_S = 3;

function flyHome({ h, above, fps = 60, carrierMps = 0, heading = 0, velocity = [12, 0, -4] }) {
  const dt = 1 / fps, root = new Group(), turret = new Group();
  turret.name = 'rig_turret'; turret.position.set(...missionAttachmentTurretPivot(spec)); root.add(turret);
  root.position.set(-30, 3, 12); root.rotation.y = .7; root.updateMatrixWorld(true);
  const view = { kind: 'drone', active: false, cooldownS: 0 };
  syncMissionAttachment(root, spec, view, false, dt);
  const group = new Group(), events = [];
  const pool = createDronePresentation(group, {
    world: () => ({ raycast: () => null }),
    onReturnEvent: (id, event, reason) => events.push(`${event}:${reason.split(' (')[0]}`),
    resolveCarrier: (owner) => owner === 'p1' ? { frame: missionAttachmentVisualFrame(root), destroyed: false, flying: view.active } : null,
  });
  const dock = missionAttachmentVisualFrame(root).getWorldPosition(new Vector3());
  const start = new Vector3(dock.x + h * Math.cos(heading + 1), dock.y + above, dock.z + h * Math.sin(heading + 1)), vel = new Vector3(...velocity);
  let time = 0;
  const drawn = () => group.children.filter((m) => m.name.includes('airframes')).reduce((sum, m) => sum + m.count, 0);
  const arrival = () => root.getObjectByName('Docked FPV arrival');
  const parked = () => root.getObjectByName('Docked FPV airframe detail');
  const frame = (flight) => {
    time += dt;
    root.position.x += Math.sin(heading) * carrierMps * dt; root.position.z += Math.cos(heading) * carrierMps * dt; root.updateMatrixWorld(true);
    syncMissionAttachment(root, spec, view, false, dt);
    pool.begin(time, new Vector3(0, 40, 0));
    if (flight) pool.write(flight, vel, 7, undefined, AERIAL_RULES.drone.launchS + 4, 'USA', undefined, 'p1');
    pool.end();
  };
  view.active = true;
  for (let i = 0; i < 6; i++) frame(start);
  // The recall: the authority retires the shell and holds the dock for the law's window, then the recall cooldown.
  const law = droneReturnS(h, above), window = droneDockS(h, above) + RECALL.cooldownS;
  view.active = false; view.cooldownS = window;
  let t = 0, handedAt = -1, landedAt = -1, gaps = 0, doubles = 0, landingFrames = 0, lowest = Infinity;
  const dockNow = new Vector3();
  while (t < window + 2) {
    frame(); t += dt; view.cooldownS = Math.max(0, window - t);
    const flight = pool.returning().get(7);
    if (flight?.phase === 'transit') lowest = Math.min(lowest, flight.pos.y - missionAttachmentVisualFrame(root).getWorldPosition(dockNow).y);
    const flying = drawn(), landing = arrival()?.visible === true, home = parked()?.visible === true && !landing;
    if (landing) { landingFrames++; if (handedAt < 0) handedAt = t; }
    if (flying && landing) doubles++;
    if (!flying && !landing && !home) gaps++;
    if (handedAt >= 0 && home && landedAt < 0) landedAt = t;
    if (landedAt >= 0) break;
  }
  clearMissionAttachment(root);
  return { h, above, fps, carrierMps, velocity, law, handedAt, landedAt, gaps, doubles, landingS: landingFrames * dt, events, lowest };
}

const rows = [], reach = (h, above) => Math.hypot(h, above) <= AERIAL_RULES.drone.rangeM + 10;
const OUT = [0, 20, 150, 350, 600, 840], UP = [-400, -80, 5, 15, 60, 160, 400, 840];
for (const fps of [60, 30]) for (const h of OUT) for (const above of UP) if (reach(h, above)) rows.push(flyHome({ h, above, fps }));
for (const carrierMps of [8, 16]) for (const heading of [0, 2.4]) for (const h of [0, 60, 300, 840]) for (const above of [20, 400]) {
  if (reach(h, above)) rows.push(flyHome({ h, above, carrierMps, heading }));
}
const VELOCITIES = [[0, 62, 0], [0, -62, 0], [30, -40, 30], [-42, 0, 0]];
for (const velocity of VELOCITIES) for (const h of [0, 150, 600]) for (const above of [5, 60, 400]) rows.push(flyHome({ h, above, velocity }));
let earliest = Infinity, latest = -Infinity, slowest = 0;
for (const r of rows) {
  const moving = VELOCITIES.includes(r.velocity);
  const label = `${r.h} m out, ${r.above} m up, ${r.fps} fps${r.carrierMps ? `, carrier ${r.carrierMps} m/s` : ''}${moving ? `, moving ${r.velocity}` : ''}`;
  assert.deepEqual(r.events, ['start:owner p1', 'end:handed over'], `${label}: flies home and hands over to the dock's landing`);
  assert.equal(r.gaps, 0, `${label}: drawn every frame (no vanish, no teleport)`);
  assert.equal(r.doubles, 0, `${label}: never two airframes`);
  assert.ok(r.handedAt > 0 && r.handedAt <= r.law, `${label}: at the landing's first pose by ${r.handedAt.toFixed(2)} s, inside the law's ${r.law.toFixed(2)} s`);
  assert.ok(r.handedAt >= r.law - (moving ? MOVING_EARLY_S : EARLY_S), `${label}: within a short beat of the authority's window (${(r.law - r.handedAt).toFixed(2)} s early)`);
  assert.ok(Math.abs(r.landingS - LANDING_S) <= 2 / r.fps, `${label}: the landing animation runs its full ${LANDING_S} s (${r.landingS.toFixed(2)} s)`);
  assert.ok(r.landedAt > 0 && r.landedAt <= r.law + RECALL.landingS, `${label}: parked by ${r.landedAt.toFixed(2)} s, before the authority counts it parked`);
  if (r.above >= RECALL.cruiseAboveDockM && !moving) {
    assert.ok(r.lowest >= RECALL.cruiseAboveDockM - 1, `${label}: comes down to the cruise height and levels off there (lowest ${r.lowest.toFixed(1)} m over the dock)`);
  }
  if (!moving) { earliest = Math.min(earliest, r.law - r.handedAt); latest = Math.max(latest, r.law - r.handedAt); }
  slowest = Math.max(slowest, r.landedAt);
}
console.log(`droneRecallReturn: ${rows.length} flights home (0-840 m out, 400 m below to 840 m above, 30/60 fps, carriers to 16 m/s, climbing or diving at the recall) land inside the recall law, ${earliest.toFixed(2)}-${latest.toFixed(2)} s ahead of it (parked by ${slowest.toFixed(2)} s at the latest); the ${LANDING_S} s landing parks inside the ${RECALL.landingS} s window`);
