import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript-compiler-api';
import { createLayout } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { roadBorderCorridorStart, stampRoadBorderCorridors } from './maps/roadBorderCorridor.ts';
import { AUTHORED_EXIT_FIXTURE, assertAuthoredExitConfig, authoredApproachEntries,
  originalExitConfig } from '../../tools/road-authored-exit-fixture.mjs';

const expectedGates = {
  alpine: [[-420, -512], [-202, 512], [-112, -512], [-18, 512], [330, -512], [212, 512]],
  reservoir: [[-512, -72], [420, -512], [512, 400]],
};
const records = [];
for (const id of ['alpine', 'reservoir']) {
  const cfg = getMapConfig(id), original = originalExitConfig(cfg);
  assertAuthoredExitConfig(original, cfg);
  const before = createLayout(original), after = createLayout(cfg);
  const entries = authoredApproachEntries(cfg, after.roads);
  const rows = AUTHORED_EXIT_FIXTURE[id];
  const tails = entries.filter(p => Math.max(Math.abs(p.b[0]), Math.abs(p.b[1])) === 512);
  assert.deepEqual(tails.map(p => p.b), expectedGates[id], 'explicit boundary destinations, not extrapolated guesses');
  for (const tail of tails) {
    assert.equal(tail.length, 32, 'one ordinary sampling interval remains automatic');
    assert.ok(tail.ux === 0 || tail.uz === 0, 'exit meets the boundary normally');
  }
  assert.equal(entries.filter(p => p.kind === 'added-approach').length, id === 'alpine' ? 12 : 9,
    'every connector and tail is inspected');
  assert.equal(entries.filter(p => p.kind === 'original-tie-in').length, tails.length,
    'the actual original tangent at every tie-in is also inspected');
  for (let road = 0; road < after.roads.length; road++) {
    const row = rows.find(item => item.path === road);
    if (!row) {
      assert.deepEqual(after.roads[road], before.roads[road], 'all unowned sampled roads remain exact');
      continue;
    }
    const interior = layout => {
      const nodes = layout.roads[road];
      const start = nodes.findIndex(p => p[0] === row.original[0][0] && p[1] === row.original[0][1]);
      const end = nodes.findIndex(p => p[0] === row.original.at(-1)[0] && p[1] === row.original.at(-1)[1]);
      assert.ok(start >= 0 && end > start, 'both original anchors still exist');
      return nodes.slice(start, end + 1);
    };
    assert.deepEqual(interior(after), interior(before), 'every sampled original interior point is exact');
  }
  const start = roadBorderCorridorStart(id, after.roads, cfg.terrain.roads.paths, 0, 1024);
  assert.equal(start, 448, 'support admission follows the actual normal boundary approaches');
  const oldCW = new Float32Array(257 * 257).fill(.125), grid = oldCW.slice();
  stampRoadBorderCorridors(id, after.roads, cfg.terrain.roads.paths, 0, cfg.terrain.rimH, grid, 257, 1024);
  for (let z = 0; z < 257; z++) for (let x = 0; x < 257; x++) {
    const at = z * 257 + x;
    assert.ok(grid[at] >= oldCW[at], 'existing deployment ownership is never erased or repacked');
    if (Math.max(Math.abs(x * 4 - 512), Math.abs(z * 4 - 512)) <= 452) {
      assert.equal(grid[at], oldCW[at], 'no new inner-square support');
    }
  }
  for (const mutate of [
    c => { c.terrain.roads.paths[0][0][0] += 1; },
    c => { c.terrain.roads.paths[0].splice(0, 1); },
    c => { c.terrain.roads.paths[0][2][1] += 1; },
    c => { c.splat.roadTint[0] += .01; },
    c => { c.terrain.roads.paths[3].push([0, 0]); },
  ]) {
    const mutation = { ...cfg, terrain: { ...cfg.terrain, roads: {
      ...cfg.terrain.roads, paths: cfg.terrain.roads.paths.map(line => line.map(p => [...p])) } },
    splat: { ...cfg.splat, roadTint: [...cfg.splat.roadTint] } };
    mutate(mutation);
    assert.throws(() => assertAuthoredExitConfig(original, mutation), /exact finite authored additions/);
  }
  assert.throws(() => assertAuthoredExitConfig(original, original), /exact finite authored additions/,
    'the old detour/oblique exits are not silently accepted as the authored candidate');
  records.push({ id, start, approachSegments: entries.length, oldNodes: before.roads.map(r => r.length),
    newNodes: after.roads.map(r => r.length), oldStations: before.roadStations, newStations: after.roadStations });
}
const reservoir = getMapConfig('reservoir').terrain.roads.paths[4];
const at = reservoir.findIndex(p => p[0] === 370 && p[1] === -328);
const a = reservoir[at - 1], b = reservoir[at], c = reservoir[at + 1];
const angle = Math.acos(((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]))
  / (Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]))) * 180 / Math.PI;
assert.ok(angle < 60, 'spread the approach turn before the enemy pad; do not leave the 81-degree elbow');
const probe = readFileSync(new URL('../../tools/road-border-corridor-pilot.mjs', import.meta.url), 'utf8');
assert.match(probe, /assert\.deepEqual\(after\._layout\.roads, before\._layout\.roads\)/);
assert.match(probe, /assert\.deepEqual\(after\._layout\.roadStations, before\._layout\.roadStations\)/);
assert.match(probe, /\[-2, 0, p\.length, p\.length \+ 2\]/, 'tie-in/bend one-sided stations remain sampled');
function requireSupportOwnership(text) {
  const ast = ts.createSourceFile('probe.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let domain;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText() === 'domain') domain = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(domain && ts.isCallExpression(domain), 'actual domain assessment exists');
  assert.equal(domain.arguments[4]?.getText(), 'supportEntries', 'inspection tangents cannot grant earthwork ownership');
  return ast;
}
const probeAst = requireSupportOwnership(probe);
assert.throws(() => requireSupportOwnership(probe.replace('before, after, twin, supportEntries',
  'before, after, twin, entries')), /cannot grant earthwork ownership/);
const functionSource = name => {
  const node = probeAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, `actual ${name} exists`);
  return node.getText();
};
const support = new Function('declaredOpening', `${functionSource('segmentDistance')}
  ${functionSource('inDeclaredSupport')} return inDeclaredSupport;`)(() => 448);
const alpine = getMapConfig('alpine'), layout = createLayout(alpine);
const tie = authoredApproachEntries(alpine, layout.roads).find(p => p.road === 2 && p.end === 1 && p.kind === 'original-tie-in');
const noRoad = { _roadDist: () => Infinity, _layout: layout };
assert.equal(support(alpine, noRoad, [], 240, 293), false, 'unowned interior ground stays excluded');
assert.equal(support(alpine, noRoad, [tie], 240, 293), true,
  'negative fixture reproduces the old infinite inspection-strip loophole');
console.log(JSON.stringify({ test: 'roadAuthoredExits', records, reservoirSpawnTurnDegrees: angle,
  scope: 'exact finite path ownership and production layout/grid; physical grades and full dressing remain separate' }));
