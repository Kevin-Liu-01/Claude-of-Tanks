// Round 61 (2026-09-24, Amberford's bridge over the river): the navigation rules for a bridge deck — the pure
// geometry (a deck stands over a point; a route point within half a cell of the crossing's road axis snaps onto it,
// over the span at the deck's height, over an approach at the terrain's), the route grid built on a synthetic field
// (a water band across the map with one deck over it: deck cells dry, hard and at deck height, the water beside them
// liquid, a route that crosses on the axis where the same field without a deck fails closed), and the hull-rectangle
// liquid safety (clear on the deck, blocked beside it). No map, no renderer.
import assert from 'node:assert/strict';
import {
  BRIDGE_SNAP_APPROACH, BRIDGE_SNAP_DECK, BRIDGE_SNAP_NONE, bridgeDeckOver, snapToBridgeDeck,
} from './bridgeDeckNavigation.ts';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.ts';
import { createNavigationLiquidSafety } from './navigationLiquidSafety.ts';

// a deck along +z over a band of water |z| < 20, 12 m wide, 2 m over the bed, with 30 m approaches
const deck = Object.freeze({ x: 0, z: 0, ux: 0, uz: 1, halfLength: 23, halfWidth: 6, deckY: 2, approachM: 30 });
const decks = Object.freeze([deck]);

// ---------------------------------------------------------------- the pure geometry
assert.equal(bridgeDeckOver(decks, 0, 0), true, 'the deck centre');
assert.equal(bridgeDeckOver(decks, 5.9, 22.9), true, 'inside the span and the width');
assert.equal(bridgeDeckOver(decks, 6.1, 0), false, 'past the parapet line');
assert.equal(bridgeDeckOver(decks, 0, 23.1), false, 'past the abutment face');
assert.equal(bridgeDeckOver([], 0, 0), false, 'no decks');
const out = { x: NaN, z: NaN, y: NaN };
assert.equal(snapToBridgeDeck(decks, 11, 10, 12.5, out), BRIDGE_SNAP_DECK, 'within half a cell of the axis over the span');
assert.deepEqual(out, { x: 0, z: 10, y: 2 }, 'the axis point at the deck\'s height');
assert.equal(snapToBridgeDeck(decks, -8, -40, 12.5, out), BRIDGE_SNAP_APPROACH, 'over an approach');
assert.equal(out.x, 0); assert.equal(out.z, -40); assert.ok(Number.isNaN(out.y), 'the terrain owns the approach height');
out.x = 7; out.z = 7; out.y = 7;
assert.equal(snapToBridgeDeck(decks, 13, 0, 12.5, out), BRIDGE_SNAP_NONE, 'beyond the reach');
assert.equal(snapToBridgeDeck(decks, 0, 54, 12.5, out), BRIDGE_SNAP_NONE, 'beyond the approach');
assert.deepEqual(out, { x: 7, z: 7, y: 7 }, 'out untouched when no crossing claims the point');
assert.equal(snapToBridgeDeck(decks, 5.5, 0, 1, out), BRIDGE_SNAP_DECK, 'a reach narrower than the deck still admits the deck\'s own width');
assert.equal(snapToBridgeDeck([], 0, 0, 12.5, out), BRIDGE_SNAP_NONE);

// ---------------------------------------------------------------- the synthetic field
function makeField(withDeck) {
  return {
    navigationWaterPolicy: 'avoid-liquid',
    ...(withDeck ? { bridgeDecks: decks } : {}),
    getHeightAt: (x, z) => (Math.abs(z) < 20 ? -1 : 1),
    getWaterMaskAt: (x, z) => (Math.abs(z) < 20 ? 1 : 0),
    getGroundType: (x, z) => (Math.abs(z) < 20 ? 'soft' : 'medium'),
  };
}
const spec = { enginePowerHp: 900, weightTons: 60, terrainResistance: { hard: 1, medium: 1.2, soft: 1.8 } };
const N = 41, cell = (x, z) => ((z + 500) / 25) * N + (x + 500) / 25;

const bridged = createBotNavigationGrid({ heightField: makeField(true) });
assert.ok(bridged.cellPositions instanceof Float32Array && bridged.cellPositions.length === N * N * 2,
  'a field with decks routes its cells through explicit positions');
const span = cell(0, 0), south = cell(0, -25), beside = cell(25, 0), far = cell(0, -200);
assert.equal(bridged.blocked[span], 0, 'the span cell is dry ground');
assert.equal(bridged.heights[span], 2, 'at the deck\'s height');
assert.equal(bridged.groundTypes[span], 0, 'on stone');
assert.deepEqual([bridged.cellPositions[span * 2], bridged.cellPositions[span * 2 + 1]], [0, 0]);
assert.equal(bridged.blocked[south], 0, 'the approach cell is the road');
assert.equal(bridged.heights[south], 1, 'at the terrain\'s height');
assert.equal(bridged.blocked[beside], 1, 'the water beside the deck is liquid');
assert.deepEqual([bridged.cellPositions[far * 2], bridged.cellPositions[far * 2 + 1]], [0, -200], 'an ordinary cell keeps its centre');
assert.equal(bridged.waterBlockedEdges[south] & (1 << 3), 0, 'the edge from the approach onto the deck runs dry along the axis');

const plain = createBotNavigationGrid({ heightField: makeField(false) });
assert.equal(plain.cellPositions, undefined, 'a field without decks allocates no positions');
assert.equal(plain.blocked[span], 1, 'without a deck the crossing cell is water');

let seed = 11;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const start = { x: 0, z: -200 }, goal = { x: 0, z: 200 };
const crossing = planBotRoute({ start, goal, navigation: bridged, rng, spec, useRoleDetour: false });
assert.ok(crossing.length >= 2 && crossing[crossing.length - 1][1] >= 175, 'the route reaches the far bank');
const field = makeField(true);
for (const [x, z] of crossing) {
  assert.ok(field.getWaterMaskAt(x, z) === 0 || bridgeDeckOver(decks, x, z), `every route point is dry ground or the deck (${x},${z})`);
}
const straddle = crossing.findIndex(([, z], i) => i > 0 && crossing[i - 1][1] < 0 && z >= 0);
assert.ok(straddle > 0, 'the route crosses the band');
assert.ok(Math.abs(crossing[straddle - 1][0]) < 1e-6 && Math.abs(crossing[straddle][0]) < 1e-6,
  'and crosses it on the deck axis, not from a cell centre on the bank');
const blocked = planBotRoute({ start, goal, navigation: plain, rng, spec, useRoleDetour: false });
assert.ok(blocked.every(([, z]) => z <= -20), 'without a deck the dry policy fails closed on the near bank');

// ---------------------------------------------------------------- the hull-rectangle liquid safety
const safe = createNavigationLiquidSafety(field, { ...spec, dims: { hullLengthM: 7, widthM: 3.5, heightM: 2.4 } });
assert.equal(safe(0, 0, 0), true, 'a hull on the deck is on dry ground');
assert.equal(safe(0, 10, 0, 6), true, 'and so is its travel along the deck');
assert.equal(safe(9, 0, 0), false, 'a hull beside the deck is in the water');
assert.equal(safe(0, 100, 0), true, 'dry ground away from the river');
assert.equal(createNavigationLiquidSafety(makeField(false), { ...spec, dims: { hullLengthM: 7, widthM: 3.5, heightM: 2.4 } })(0, 0, 0), false,
  'without a deck the same point is water');

console.log('bridgeDeckNavigation.selftest: deck geometry, snapped deck and approach cells, the crossing route, the fail-closed control and the hull-rectangle safety pass');
