// The Turbo Ball lanes stay open (landmark-lanes-278): no set piece stands on the ball's run from the kick-off to either
// goal, on any map.
//
// 277's cliffbridge plaza de toros stood on the x=130 lane into bravo's goal and the ball never got past it; the composer's
// objective discs kept 18 m round the deployment centres, where the goals no longer stand (ball.goalAxisM sets them the
// middle ± 240 m along the axis, and the match placement moves one off ground it cannot hold). The goals exist only once
// the whole world stands, so this receipt reads them from the real thing: each map's Turbo Ball match on its committed
// collision world (server/dedicatedWorldCollision.ts, sim/authoritativeMatch.ts), the ball on its kick-off spot and the
// two goals the placement reserved. Every authored piece that is not dressing (plan.ts isDressingPiece: setts, a path)
// keeps its whole footprint (plan.ts landmarkFootprint, which holds every part it builds) OBJECTIVE_LANE_HALF_M from each
// kick-off-to-goal segment. A flag carrier routes round a solid as any hull does, so Capture the Flag keeps to the
// composer's discs.
//
// The reverted control: Earthrise's north station commons put back at (12, 88), where it stood on the lane into bravo's
// goal until 278 (a ball 120 m out stalled against it at (14, 82); without the dome it scored), fails here — as does the
// cliffbridge plaza de toros back at (106, 192).
//
// Usage: node src/world/landmarks/landmarkLanes.selftest.mjs [--maps=a,b]
import assert from 'node:assert/strict';
import '../../vehicles/fleetFactory.ts';
import { createAuthoritativeMatch } from '../../sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';
import { MAP_IDS, getMapConfig } from '../maps/index.ts';
import { isDressingPiece, landmarkFootprint } from './plan.ts';
import { OBJECTIVE_LANE_HALF_M, segmentFootprintGap } from './compose.ts';

const only = process.argv.find((arg) => arg.startsWith('--maps='))?.slice(7).split(',');

/** The real Turbo Ball lanes of a map: the kick-off spot (the ball at the start) to each goal the placement reserved. */
function turboBallLanes(mapId) {
  const world = createDedicatedWorldCollision(mapId);
  const match = createAuthoritativeMatch({
    mapId, gameMode: 'turbo_ball', seed: 6767, countdownS: 0, worldCollision: world,
    players: [{ id: 'a', specId: 'm551_sheridan', team: 'alpha', bot: true }, { id: 'b', specId: 't90am', team: 'bravo', bot: true }],
  });
  match.onMatchReady();
  const { ball, goals } = match.modeController.state;
  world.release?.();
  return goals.map((goal) => ({ team: goal.team, ax: ball.x, az: ball.z, bx: goal.x, bz: goal.z }));
}

/** The pieces of `landmarks` that stand on a lane: [label, lane, gap]. */
function onLanes(mapId, lanes, landmarks) {
  const out = [];
  for (const placement of landmarks) {
    if (isDressingPiece(placement)) continue;
    const [hw, hl] = landmarkFootprint(placement), yaw = (placement.yawDeg ?? 0) * Math.PI / 180;
    for (const lane of lanes) {
      const gap = segmentFootprintGap(lane.ax, lane.az, lane.bx, lane.bz, placement.x, placement.z, hw, hl, yaw);
      if (gap < OBJECTIVE_LANE_HALF_M) out.push(`${mapId}/${placement.name ?? placement.kind} on the lane to ${lane.team}'s goal `
        + `((${lane.ax.toFixed(0)}, ${lane.az.toFixed(0)}) -> (${lane.bx.toFixed(0)}, ${lane.bz.toFixed(0)})): ${gap.toFixed(1)} m of ${OBJECTIVE_LANE_HALF_M}`);
    }
  }
  return out;
}

// the geometry: a segment through a footprint meets it; one alongside measures its gap, turned with the piece
assert.equal(segmentFootprintGap(0, -50, 0, 50, 0, 0, 5, 5, 0), 0, 'a lane through a piece meets it');
assert.ok(Math.abs(segmentFootprintGap(20, -50, 20, 50, 0, 0, 5, 5, 0) - 15) < 1e-9, 'a lane 20 m off a 5 m half-width piece: 15 m');
assert.ok(Math.abs(segmentFootprintGap(20, -50, 20, 50, 0, 0, 2, 10, Math.PI / 2) - 10) < 1e-9, 'turned a quarter, its 10 m half-length faces the lane');
assert.ok(Math.abs(segmentFootprintGap(0, 30, 0, 50, 0, 0, 5, 5, 0) - 25) < 1e-9, 'a lane that ends short measures from its end');

const failures = [];
let maps = 0, pieces = 0;
for (const mapId of only ?? MAP_IDS) {
  const landmarks = getMapConfig(mapId).props?.landmarks ?? [];
  if (!landmarks.some((placement) => !isDressingPiece(placement)) && mapId !== 'cliffbridge' && mapId !== 'moon') continue;
  const lanes = turboBallLanes(mapId);
  assert.equal(lanes.length, 2, `${mapId}: two goals`);
  failures.push(...onLanes(mapId, lanes, landmarks));
  // the reverted controls: the pieces 278 moved off the lanes, put back where they stood, are refused
  if (mapId === 'moon') {
    const back = onLanes(mapId, lanes, [{ kind: 'stationDome', x: 12, z: 88, name: "the station's north commons (control)" }]);
    assert.ok(back.some((line) => line.includes("bravo's goal")), `moon: the north commons back at (12, 88) stands on bravo's lane (${back.join('; ') || 'not refused'})`);
  }
  if (mapId === 'cliffbridge') {
    const back = onLanes(mapId, lanes, [{ kind: 'bullring', x: 106, z: 192, yawDeg: -90, name: 'the plaza de toros (control)' }]);
    assert.ok(back.some((line) => line.includes("bravo's goal")), `cliffbridge: the plaza de toros back at (106, 192) stands on bravo's lane (${back.join('; ') || 'not refused'})`);
  }
  maps++;
  pieces += landmarks.filter((placement) => !isDressingPiece(placement)).length;
}
assert.deepEqual(failures, [], `${failures.length} set pieces on a Turbo Ball lane:\n${failures.join('\n')}`);
console.log(`landmarkLanes selftest: ${pieces} set pieces on ${maps} maps clear the Turbo Ball lanes (${OBJECTIVE_LANE_HALF_M} m each side), controls refused`);
