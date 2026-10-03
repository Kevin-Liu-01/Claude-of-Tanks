import assert from 'node:assert/strict';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.ts';

function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const wall = { min: [-20, -5, -85], max: [20, 20, 85] };
let heightSamples = 0;
const routeSpec = {
  enginePowerHp: 650,
  weightTons: 40,
  terrainResistance: { hard: 0.8, medium: 1.0, soft: 1.8 },
  trackTraction: 1,
};
const deps = {
  start: { x: -150, z: 0 },
  goal: { x: 150, z: 0 },
  heightField: {
    getHeightAt: () => { heightSamples++; return 0; },
    getGroundType: () => 'medium',
  },
  getObstacles: () => [wall],
  queryObstacles: (_minX, _minZ, _maxX, _maxZ, out) => {
    out.length = 0;
    out.push(wall);
    return out;
  },
  role: 'flanker',
  spec: routeSpec,
};
const navigation = createBotNavigationGrid(deps);
// one scan when the grid is built: the cells, then three samples along each edge for its steepest stretch
const scanSamples = heightSamples;
assert.ok(scanSamples >= 41 * 41 && scanSamples <= 41 * 41 * 13, `one bounded terrain scan (${scanSamples} samples)`);
const routeA = planBotRoute({ ...deps, navigation, rng: seeded(7) });
const routeA2 = planBotRoute({ ...deps, navigation, rng: seeded(7) });
const routeB = planBotRoute({ ...deps, navigation, rng: seeded(99) });
assert.equal(heightSamples, scanSamples, 'all bots share one terrain scan');
assert.deepEqual(routeA, routeA2, 'same match seed reproduces the opening');
assert.notDeepEqual(routeA, routeB, 'different match seeds vary the opening');
assert.ok(routeA.some(([, z]) => Math.abs(z) > 85), 'route clears the solid wall');
assert.ok(routeA.every(([x, z]) => !(x > -23.5 && x < 23.5 && z > -88.5 && z < 88.5)),
  'no waypoint occupies solid cover');
assert.deepEqual(routeA.at(-1), [150, 0], 'route still hunts the opposing spawn');

// Navigation must use the same tight compound footprint as movement. The
// broad-phase bounds span both wings, but the central courtyard is open and
// must not become an invisible 50 m wall in the bot grid.
const courtyard = {
  min: [-29, -2, -30], max: [29, 12, 30],
  shape2: {
    kind: 'compound', cx: 0, cz: 0,
    parts: [
      { kind: 'obb', cx: -25, cz: 0, hw: 4, hl: 30, yaw: 0 },
      { kind: 'obb', cx: 25, cz: 0, hw: 4, hl: 30, yaw: 0 },
    ],
  },
};
const courtyardNavigation = createBotNavigationGrid({
  heightField: { getHeightAt: () => 0 },
  getObstacles: () => [courtyard],
});
const centerCell = 20 * 41 + 20;
assert.equal(courtyardNavigation.blocked[centerCell], 0,
  'compound footprint keeps the open courtyard navigable');

// Vehicle capability must change the route over the same immutable terrain
// grid. A strong, high-grip tank can cross the short central ridge; a weak
// engine cannot sustain that climb and must use either end of the ridge.
// the ridge's faces climb at the cell-to-cell grade (72 %): the route search reads each edge's steepest stretch, so a
// vertical-walled block would be a wall for both tanks (2026-10-02)
const ridgeHeightField = {
  getHeightAt: (x, z) => Math.abs(z) < 125 ? Math.max(0, 18 * Math.min(1 - Math.abs(x) / 25, (125 - Math.abs(z)) / 25)) : 0,
  getGroundType: () => 'medium',
};
const ridgeNavigation = createBotNavigationGrid({ heightField: ridgeHeightField });
const ridgeBase = {
  start: { x: -150, z: 0 },
  goal: { x: 150, z: 0 },
  heightField: ridgeHeightField,
  navigation: ridgeNavigation,
  role: 'brawler',
};
const strongRoute = planBotRoute({
  ...ridgeBase,
  rng: seeded(17),
  spec: {
    ...routeSpec,
    enginePowerHp: 950,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.4 },
    trackTraction: 1.15,
  },
});
const weakRoute = planBotRoute({
  ...ridgeBase,
  rng: seeded(17),
  spec: {
    ...routeSpec,
    enginePowerHp: 220,
    terrainResistance: { hard: 1.1, medium: 1.35, soft: 2.4 },
    trackTraction: 0.85,
  },
});
assert.ok(strongRoute.every(([, z]) => Math.abs(z) < 125),
  'capable bot takes the central ridge instead of a fixed-angle detour');
assert.ok(weakRoute.some(([, z]) => Math.abs(z) >= 125),
  'engine-limited bot routes around terrain it cannot climb');

// Ground condition is part of the same route decision. A randomized role
// waypoint inside a bog must not force the tank through it when a firm route
// around the edge is materially cheaper.
const bogHeightField = {
  getHeightAt: () => 0,
  getGroundType: (x, z) => Math.abs(x) < 100 && Math.abs(z) < 110 ? 'soft' : 'hard',
};
const bogNavigation = createBotNavigationGrid({ heightField: bogHeightField });
const bogRoute = planBotRoute({
  start: { x: -150, z: 0 },
  goal: { x: 150, z: 0 },
  heightField: bogHeightField,
  navigation: bogNavigation,
  role: 'brawler',
  rng: seeded(19),
  spec: {
    ...routeSpec,
    enginePowerHp: 800,
    terrainResistance: { hard: 0.8, medium: 1.1, soft: 3.0 },
  },
});
assert.ok(bogRoute.some(([, z]) => Math.abs(z) >= 110),
  'bot prefers firm terrain over a costly soft-ground role waypoint');

console.log('botRoutePlanner.selftest: seeded, vehicle-aware traversability passed');

// A dry bank and the bridge deck may have equal heights with a gorge between
// them. Endpoint slope alone used to route a flag runner through the parapet.
{
  const deck = {x:0,z:0,ux:0,uz:1,halfLength:100,halfWidth:9,deckY:0,approachM:75};
  const field = {getHeightAt:(_x,z)=>Math.abs(z)<100?-30:0,
    getGroundType:()=> 'hard', bridgeDecks:[deck]};
  const navigation = createBotNavigationGrid({heightField:field});
  const route = planBotRoute({start:{x:-50,z:-150},goal:{x:50,z:150},navigation,
    spec:routeSpec,rng:seeded(612),useRoleDetour:false});
  assert.ok(route.length>0,'bridge crossing remains reachable');
  let previous=[-50,-150];
  for (const point of route) {
    const length=Math.hypot(point[0]-previous[0],point[1]-previous[1]);
    for(let d=0;d<=length;d+=1){
      const t=d/Math.max(1,length),x=previous[0]+(point[0]-previous[0])*t,z=previous[1]+(point[1]-previous[1])*t;
      if(Math.abs(z)<99)assert.ok(Math.abs(x)<=deck.halfWidth,'route enters through an abutment and stays on the deck');
    }
    previous=point;
  }
}
