import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { objectiveMarkers, markersStandOnSpawns, zoneLetter, objectiveSide } from './minimapObjectives.ts';
import { OBJECTIVE_PALETTE, sideColor, sideFill } from './objectiveGlyphs.ts';

// tactical map 2026-09-15: the minimap and the world presentation share one derivation of
// objective markers from the mode state — sides from the viewer's team, zone letters,
// sector statuses, flag statuses, spawns per mode.

const base = {
  perspectiveTeam: 'alpha', respawns: true, flags: [], zones: [], ball: null, goals: [], pickups: [],
  spawns: [{ team: 'alpha', x: -300, y: 1, z: -300 }, { team: 'bravo', x: 300, y: 1, z: 300 }],
};
const kinds = (markers) => markers.map((marker) => marker.kind);

assert.deepEqual(objectiveMarkers(null), []);
assert.deepEqual(objectiveMarkers({ ...base, id: 'standard' }), [], 'Standard draws its bases from the roster, not from mode markers');
assert.deepEqual(objectiveMarkers({ ...base, id: undefined }), []);

assert.equal(zoneLetter(0), 'A');
assert.equal(zoneLetter(2), 'C');
assert.equal(zoneLetter(9), '10');
assert.equal(objectiveSide('alpha', 'alpha'), 'own');
assert.equal(objectiveSide('alpha', 'bravo'), 'enemy');
assert.equal(objectiveSide(null, 'alpha'), 'enemy');

// palette: the HUD blip colours
assert.equal(sideColor('own'), '#7ee87e');
assert.equal(sideColor('enemy'), '#f05a5a');
assert.equal(sideColor('contested'), OBJECTIVE_PALETTE.contested);
assert.match(sideFill('neutral'), /^rgba\(/);

// Zone Control: both spawns, three lettered zones, control arcs toward the capturing side
{
  const zones = [
    { id: 'zone-1', x: -100, z: 0, control: 1, owner: 'alpha', contested: false },
    { id: 'zone-2', x: 0, z: 0, control: -0.4, owner: null, contested: true },
    { id: 'zone-3', x: 100, z: 0, control: 0, owner: null, contested: false },
  ];
  const markers = objectiveMarkers({ ...base, id: 'zone_control', zones });
  assert.deepEqual(kinds(markers), ['spawn', 'spawn', 'zone', 'zone', 'zone'], 'spawns first, then the zones');
  assert.deepEqual(markers.slice(0, 2).map((m) => [m.side, m.status]), [['own', 'respawn'], ['enemy', 'respawn']]);
  const [a, b, c] = markers.slice(2);
  assert.deepEqual([a.label, b.label, c.label], ['A', 'B', 'C']);
  assert.equal(a.side, 'own'); assert.equal(a.progress, 1);
  assert.equal(b.side, 'contested'); assert.equal(b.pulse, true);
  assert.equal(b.progress, 0.4); assert.equal(b.progressSide, 'enemy', 'negative control is bravo taking it');
  assert.equal(c.side, 'neutral'); assert.equal(c.progress, 0);
  assert.equal(markersStandOnSpawns(markers), true, 'the spawn marks replace the generic base rings');
  // the same match from bravo's seat
  const flipped = objectiveMarkers({ ...base, perspectiveTeam: 'bravo', id: 'zone_control', zones });
  assert.deepEqual(flipped.slice(0, 2).map((m) => m.side), ['enemy', 'own']);
  assert.equal(flipped[2].side, 'enemy', 'alpha-owned zone is the enemy zone for bravo');
  assert.equal(flipped[3].progressSide, 'own', 'bravo sees its own progress');
  // no spawns in the state (older authority): zones only, bases fall back to the roster
  const legacy = objectiveMarkers({ ...base, spawns: undefined, id: 'zone_control', zones });
  assert.deepEqual(kinds(legacy), ['zone', 'zone', 'zone']);
  assert.equal(markersStandOnSpawns(legacy), false);
}

// Capture the Flag: bases stay put, flags travel; the flag bases stand on the spawns
{
  const flags = [
    { team: 'alpha', baseX: -300, baseZ: -300, x: -300, z: -300, status: 'home', carrierId: null },
    { team: 'bravo', baseX: 300, baseZ: 300, x: 40, z: -20, status: 'carried', carrierId: 'p1' },
  ];
  const markers = objectiveMarkers({ ...base, id: 'capture_the_flag', flags });
  assert.deepEqual(kinds(markers), ['flagBase', 'flagBase', 'flag', 'flag']);
  assert.deepEqual(markers.slice(0, 2).map((m) => [m.side, m.status, m.x]), [['own', 'home', -300], ['enemy', 'away', 300]]);
  const carried = markers.find((m) => m.kind === 'flag' && m.side === 'enemy');
  assert.deepEqual([carried.x, carried.z, carried.status, carried.pulse], [40, -20, 'carried', true]);
  const home = markers.find((m) => m.kind === 'flag' && m.side === 'own');
  assert.deepEqual([home.status, home.pulse], ['home', false]);
  assert.ok(carried.priority > home.priority, 'a moving flag draws over a parked one');
  assert.equal(markersStandOnSpawns(markers), true);
  const dropped = objectiveMarkers({ ...base, id: 'capture_the_flag',
    flags: [{ ...flags[1], status: 'dropped', carrierId: null }] });
  assert.equal(dropped.find((m) => m.kind === 'flag').status, 'dropped');
}

// Frontline Assault: numbered sectors — taken / active / locked, then holding the last one
{
  const zones = [
    { id: 'line-1', x: -60, z: 0, control: 1, owner: 'alpha', contested: false },
    { id: 'line-2', x: 0, z: 0, control: 0.55, owner: null, contested: true },
    { id: 'line-3', x: 60, z: 0, control: 0, owner: null, contested: false },
  ];
  const markers = objectiveMarkers({ ...base, id: 'frontline_assault', respawns: false, zones, line: { index: 1, total: 3, holdS: 0 } });
  assert.deepEqual(kinds(markers), ['spawn', 'sector', 'sector', 'sector'], 'only the human side spawn is a place');
  assert.equal(markers[0].side, 'own');
  const [s1, s2, s3] = markers.slice(1);
  assert.deepEqual([s1.label, s1.status, s1.side, s1.progress], ['1', 'taken', 'own', 1]);
  assert.deepEqual([s2.label, s2.status, s2.side, s2.progress, s2.pulse], ['2', 'active', 'contested', 0.55, true]);
  assert.deepEqual([s3.label, s3.status, s3.side], ['3', 'locked', 'enemy']);
  const holding = objectiveMarkers({ ...base, id: 'frontline_assault', respawns: false,
    zones: zones.map((zone) => ({ ...zone, control: 1, owner: 'alpha', contested: false })), line: { index: 3, total: 3, holdS: 12 } });
  const last = holding[holding.length - 1];
  assert.deepEqual([last.status, last.pulse, last.side], ['holding', true, 'own']);
  assert.deepEqual(holding.slice(1, 3).map((m) => m.status), ['taken', 'taken']);
}

// Turbo Ball: goals on the spawns, the ball on top; Endless Horde: caches, own spawn only
{
  const turbo = objectiveMarkers({ ...base, id: 'turbo_ball',
    goals: [{ team: 'alpha', x: -300, z: -300 }, { team: 'bravo', x: 300, z: 300 }], ball: { x: 3, z: -4 } });
  assert.deepEqual(kinds(turbo), ['goal', 'goal', 'ball']);
  assert.deepEqual(turbo.map((m) => m.side), ['own', 'enemy', 'neutral']);
  assert.equal(turbo[2].pulse, true);
  const horde = objectiveMarkers({ ...base, id: 'endless_horde', respawns: false,
    pickups: [{ kind: 'heal', x: 1, z: 2, active: true }, { kind: 'ammo', x: 3, z: 4, active: true }, { kind: 'ammo', x: 5, z: 6, active: false }] });
  assert.deepEqual(kinds(horde), ['spawn', 'pickup', 'pickup'], 'inactive caches are not marked');
  assert.deepEqual(horde.slice(1).map((m) => m.status), ['heal', 'ammo']);
  assert.equal(horde[0].status, 'spawn', 'no revive in horde: a plain spawn mark');
}

// wiring: the HUD paints the markers from this derivation after the roster bases, the world
// presentation mirrors them, and the sim publishes the spawn centres the markers rely on
const hudSource = await readFile(new URL('./hud.ts', import.meta.url), 'utf8');
assert.match(hudSource, /const markers = objectiveMarkers\(frame\.matchModeState\);\s*if \(spawnFlags && !markersStandOnSpawns\(markers\)\) drawMinimapBases\(plMapX, plMapY\);/,
  'the minimap skips its generic base rings when the mode marks the spawns itself');
assert.match(hudSource, /drawMinimapObjectives\(markers, frame\.timeS, plMapX, plMapY, !!player\?\.combat\?\.destroyed\)/);
assert.match(hudSource, /export interface HudMatchModeState extends ObjectiveStateView/);
assert.match(hudSource, /paintMinimapRelief\(bctx, heightField, N\)/, 'the baked map carries the hillshade');
assert.match(hudSource, /paintMinimapShorelines\(octx, f\.waterOrSoft, pal\)/, 'water carries a shoreline');
const worldSource = await readFile(new URL('../game/matchModeWorldPresentation.ts', import.meta.url), 'utf8');
assert.match(worldSource, /const marks = objectiveMarkers\(state\);/, 'the world presentation derives the same markers');
assert.match(worldSource, /from '\.\.\/ui\/objectiveGlyphs\.ts'/, 'world icons are rasterised from the shared glyphs');
const simSource = await readFile(new URL('../sim/matchModes.ts', import.meta.url), 'utf8');
assert.match(simSource, /spawns: state\.spawns\.map\(\(spawn\) => \(\{ \.\.\.spawn \}\)\)/, 'serialize clones the spawn centres');


// The attackers remain alpha even when the observer follows a defender.
{
  const state = { ...base, id: 'frontline_assault', perspectiveTeam: 'bravo',
    line: { index: 1, total: 3, holdS: 0 },
    zones: [0, 1, 2].map(i => ({ x: i * 50, z: 0, control: i === 0 ? 1 : 0,
      owner: i === 0 ? 'alpha' : null, contested: false })) };
  const marks = objectiveMarkers(state);
  assert.deepEqual(marks.filter(m => m.kind === 'spawn').map(m => [m.x, m.side]), [[-300, 'enemy']]);
  assert.deepEqual(marks.filter(m => m.kind === 'sector').map(m => m.side), ['enemy', 'neutral', 'own']);
  state.line.index = 3; state.line.holdS = 10;
  assert.equal(objectiveMarkers(state).find(m => m.status === 'holding').side, 'enemy');
}

console.log('minimapObjectives.selftest: sides, zones, flags, sectors, turbo, horde, spawns and wiring passed');
