import { Vector3 } from 'three';
import { createTankState, SIM_DT } from './movement.js';
import {
  prefersVerticalTankContact,
  resolveTankBodyContacts,
} from './tankBodyContacts.ts';

let checks = 0;
function assert(value, message) {
  checks++;
  if (!value) throw new Error(message);
}

const spec = {
  id: 'contact-fixture',
  weightTons: 60,
  enginePowerHp: 1200,
  topSpeedKmh: 60,
  reverseSpeedKmh: 25,
  hullTraverseDegS: 35,
  turretTraverseDegS: 35,
  gunPitchDegS: 20,
  gunElevationDeg: 20,
  gunDepressionDeg: 10,
  pivotStyle: 'neutral',
  terrainResistance: { hard: 1, medium: 1.2, soft: 2 },
  dims: { hullLengthM: 7.6, widthM: 3.6, heightM: 2.8 },
  gun: {
    caliberMm: 120,
    baseAccuracy: 0.3,
    aimTimeS: 2,
    reloadS: 6,
    bloom: { move: 0.1, hullRot: 0.1, turret: 0.1, afterShot: 3 },
  },
  armor: { turretPivot: [0, 1.4, 0], gunPivot: [0, 0.2, 0], gunBarrel: { lengthM: 5 } },
};

function entity(id, x, y, z, grounded) {
  const state = createTankState(spec, new Vector3(x, y, z), 0);
  state.grounded = grounded;
  state._ride.grounded = grounded;
  state._ride.y = y;
  return { id, spec, state };
}

// An off-center airborne landing resolves vertically, transfers impulse and
// creates angular momentum instead of shoving the upper tank sideways.
{
  const lower = entity('lower', 0, 0, 0, true);
  const upper = entity('upper', 0.9, 2.55, 0.5, false);
  upper.state.verticalSpeed = -7;
  upper.state._ride.v = -7;
  let impact = null;
  assert(prefersVerticalTankContact(upper, lower), 'vertically ordered overlap selects stack contact');
  const count = resolveTankBodyContacts([lower, upper], SIM_DT,
    (a, b, closing) => { impact = { a, b, closing }; });
  assert(count === 1, 'one tank-on-tank roof contact resolved');
  assert(upper.state.pos.y >= 2.79, `upper hull is seated above lower roof (${upper.state.pos.y})`);
  assert(upper.state.verticalSpeed >= 0, 'vertical landing impulse stops the falling hull');
  assert(Math.abs(upper.state._spring.pitchV) + Math.abs(upper.state._spring.rollV) > 0.2,
    'off-center roof impact produces angular impulse');
  assert(upper.state._body.tumbling, 'strong off-center roof impact enters tumble phase');
  assert(impact?.a === upper && impact?.b === lower && impact.closing >= 6.9,
    'vertical ram callback preserves pair and closing speed');
}

// Centered stacks remain bounded under repeated gravity/contact passes.
{
  const lower = entity('base', 0, 0, 0, true);
  const upper = entity('top', 0, 2.8, 0, false);
  for (let i = 0; i < 180; i++) {
    upper.state.verticalSpeed -= 9.81 * SIM_DT;
    upper.state._ride.v = upper.state.verticalSpeed;
    upper.state.pos.y += upper.state.verticalSpeed * SIM_DT;
    upper.state._ride.y = upper.state.pos.y;
    resolveTankBodyContacts([lower, upper], SIM_DT);
  }
  assert(Number.isFinite(upper.state.pos.y) && upper.state.pos.y >= 2.79,
    `stack remains finite and above the lower roof (${upper.state.pos.y})`);
  assert(Math.abs(upper.state._spring.pitchV) < 1e-6 &&
    Math.abs(upper.state._spring.rollV) < 1e-6,
  'centered support does not invent rollover torque');
}

// Same-height formations stay with the established horizontal capsule solver.
{
  const a = entity('a', 0, 0, 0, true);
  const b = entity('b', 0.5, 0, 0, true);
  assert(!prefersVerticalTankContact(a, b), 'same-height pair stays horizontal');
  assert(resolveTankBodyContacts([a, b], SIM_DT) === 0,
    'vertical overlay ignores ordinary side contact');
}

// Adjacent grounded tanks on a side slope are not a stack. Their world-Y
// separation can exceed the vertical-axis threshold, but neither body has
// entered a dynamic contact phase.
{
  const low = entity('slope-low', 0, 0, 0, true);
  const high = entity('slope-high', 0.5, 1.2, 0, true);
  assert(!prefersVerticalTankContact(low, high),
    'grounded slope traffic stays with horizontal collision');
  assert(resolveTankBodyContacts([low, high], SIM_DT) === 0,
    'grounded elevation difference cannot create roof support');
}

console.log(`tankBodyContacts.selftest: ${checks} assertions passed`);
