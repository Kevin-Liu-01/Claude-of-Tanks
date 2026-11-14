// Couch seats (docs/COUCH-MODE.md "Seats in the battle"): the first seat present drives the battle's first tank, the
// rest take the next tank on their side in roster order, a seat with no tank left sits out; a seat's controls hold
// levels until they change, carry a tap's press for one tick only, map the phone's keys onto the core's action bits and
// shell slots, turn the sight right on a rightward drag, and let everything go on release.
import assert from 'node:assert/strict';
import { assignCouchSeats, createCouchSeatControls, COUCH_AIM_DISTANCE_M } from './couchSeats.ts';
import { PLAYER_ACTION_BITS } from '../sim/playerActions.ts';
import { couchSeatSides } from '../sim/matchRuleset.ts';

// --- seating ------------------------------------------------------------------------------------------------------
{
  const tanks = ['player', 'a1', 'e1', 'a2', 'e2', 'a3', 'e3'];
  const allies = new Set(['player', 'a1', 'a2', 'a3']);
  const seated = (seats, sides) => assignCouchSeats(tanks, allies, seats, sides).map(({ seat, entity }) => [seat, entity]);
  assert.deepEqual(seated([1, 2, 3, 4], couchSeatSides('standard', 'teams', 4)), [[1, 'player'], [2, 'e1'], [3, 'a1'], [4, 'e2']],
    'teams alternate, each seat taking the next tank on its side');
  assert.deepEqual(seated([1, 2, 3], couchSeatSides('standard', 'together', 3)), [[1, 'player'], [2, 'a1'], [3, 'a2']]);
  assert.deepEqual(seated([2, 5, 3], couchSeatSides('standard', 'together', 3)), [[2, 'player'], [3, 'a1'], [5, 'a2']],
    'the first seat present drives the first tank, whatever its number');
  assert.deepEqual(seated([1, 2, 3, 4, 5, 6], couchSeatSides('standard', 'together', 6)).map(([seat]) => seat), [1, 2, 3, 4],
    'a seat with no tank left on its side sits out');
  assert.deepEqual(seated([], []), []);
  assert.equal(assignCouchSeats(tanks, allies, [1, 2, 3, 4, 5, 6, 7, 8, 9], couchSeatSides('standard', 'teams', 9)).length, 7,
    'never more seats than the sides allow, nor than tanks');
}

// --- controls ------------------------------------------------------------------------------------------------------
{
  const controls = createCouchSeatControls();
  const out = {};
  controls.setVirtualMove(0.5, -0.25);
  controls.pressVirtual('fire');
  controls.pressVirtual('handbrake');
  controls.take(out);
  assert.equal(out.throttle, -0.25);
  assert.equal(out.steer, -0.5, "the stick's right is negative hull yaw, as the player's touch stick");
  assert.equal(out.fire, true);
  assert.equal(out.brake, true);
  assert.equal(out.aimDistance, COUCH_AIM_DISTANCE_M);
  controls.take(out);
  assert.equal(out.fire, true, 'a level holds until it changes');
  controls.releaseVirtual('fire');
  assert.equal(controls.take(out).fire, false, 'and lets go when it does');
  controls.pressVirtual('fire');
  controls.releaseVirtual('fire');
  assert.equal(controls.take(out).fire, true, 'a tap inside one tick still pulls the trigger');
  assert.equal(controls.take(out).fire, false, 'once');

  controls.tapVirtual('consumable2');
  controls.tapVirtual('smoke');
  assert.equal(controls.take(out).actionBits, PLAYER_ACTION_BITS.FIRST_AID | PLAYER_ACTION_BITS.SMOKE, 'taps press on the next tick');
  assert.equal(controls.take(out).actionBits, 0, 'and only on that tick');
  controls.tapVirtual('sniperToggle');
  assert.equal(controls.take(out).actionBits, 0, "the scope is the pane camera's, never a press in the core");
  controls.tapVirtual('shell3');
  assert.equal(controls.take(out).shellSlot, 2, 'shell keys pick the slot');
  assert.equal(controls.take(out).shellSlot, 2, 'and the slot stays');

  controls.aimAlong(1);
  controls.addVirtualAim(10, 0);
  assert.ok(controls.take(out).aimYaw < 1, 'a rightward drag turns the sight right (the bearing falls)');
  controls.addVirtualAim(0, 1e6);
  assert.ok(Math.abs(controls.take(out).aimPitch) <= 0.35, 'the sight never pitches past its limit');

  // the split screen (phase 2): the phone's drag, scope and zoom are its pane camera's; the pane's sight lays the gun
  const intent = {};
  controls.aimAlong(0.5);
  controls.drainCamera(intent);
  controls.addVirtualAim(12, -4);
  controls.tapVirtual('sniperToggle');
  controls.tapVirtual('zoomIn');
  controls.tapVirtual('zoomIn');
  controls.tapVirtual('zoomOut');
  assert.deepEqual(controls.drainCamera(intent), { aimDx: 12, aimDy: -4, sniperToggles: 1, zoom: 1 }, 'the camera intent since the last frame');
  assert.deepEqual(controls.drainCamera(intent), { aimDx: 0, aimDy: 0, sniperToggles: 0, zoom: 0 }, 'drained once');
  controls.layAim(-1.25, 0.1, 237);
  controls.addVirtualAim(50, 0);
  controls.take(out);
  assert.deepEqual([out.aimYaw, out.aimPitch, out.aimDistance], [-1.25, 0.1, 237], 'a laid sight holds; the drag turns the camera, not the bearing');
  assert.equal(controls.drainCamera(intent).aimDx, 50);
  controls.pressVirtual('freeLook');
  assert.equal(controls.take(out).aimLocked, true, 'free look holds the gun on its lay');
  controls.releaseVirtual('freeLook');
  assert.equal(controls.take(out).aimLocked, false);
  controls.aimAlong(2);
  assert.equal(controls.take(out).aimDistance, COUCH_AIM_DISTANCE_M, 'a new battle starts unlaid, at the default range');

  controls.tapVirtual('consumable1');
  controls.pressVirtual('freeLook');
  controls.release();
  controls.take(out);
  assert.deepEqual([out.throttle, out.steer, out.fire, out.brake, out.actionBits, out.aimLocked], [0, 0, false, false, 0, false], 'release lets everything go');
}

console.log('couchSeats: PASS — seats by side in roster order, the first seat on the first tank, sit-outs; levels hold, a trigger tap inside a tick fires once, taps press once, shells, aim sense, the split screen camera intent and laid sight, free look, release');
