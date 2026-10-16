// destruction-check.selftest.mjs — Steinburg's destructible buildings destroyed and judged (destruction stream,
// 2026-10-12; the owner's screenshot of a broken brick building: "these big rectangles pop up, so just make sure that
// destructible buildings are properly evaluated and their rubble properly falls down onto ground that can potentially be
// uneven"). Four of the kinds the owner fights through — the brick fire station (an open shell), the Fachwerk corner shop,
// a town house and the cottage — shot until they come down: every run textured (no flat grey room boxes), no rim of an
// earlier hole hanging in a later one, no still piece in the air, every thrown piece on the ground where it lands, every
// rigid body at rest on the ground, a body or a record, within the budgets. On main before the fix the same check fails
// every one of them (untextured rooms, 48-73 hanging rim triangles, 4-7 tiles in the air, 77-86 % of the thrown pieces
// over the ground, and 24-76 of the building's own triangles hanging over the heap late in the fall: the owner's "big
// rectangles", a roof slope or a tower's glazing hung from a vertex under the eave band until the fold).
import assert from 'node:assert/strict';
import { runDestructionCheck } from './destruction-check.mjs';

const report = await runDestructionCheck({ mapId: 'urban', builders: ['firestation', 'cornershop', 'rowhouse', 'cottage'] });
assert.equal(report.buildings, 4, `four buildings staged (${report.rows.map((r) => r.builder).join(', ')})`);
for (const r of report.rows) {
  assert.ok(!r.standing, `${r.builder} ${r.id} comes down under the volley`);
  assert.equal(r.untextured, 0, `${r.builder}: every run in the building's own texture`);
  assert.equal(r.hangingRim, 0, `${r.builder}: no rim unit hangs in a later hole`);
  assert.equal(r.hangingPanel, 0, `${r.builder}: nothing hangs from its fall (${r.hangingPanel} triangles up to ${r.hangingPanelM} m)`);
  assert.equal(r.pieces.stillHanging, 0, `${r.builder}: no still piece in the air`);
  assert.equal(r.pieces.overGround, 0, `${r.builder}: every thrown piece lies on the ground where it lands`);
  // (2026-10-15: on desktop the walls break as cells and the building comes down as its own pieces, bodies of the
  // fracture's pool, baked into heaps once still; the kit's rubble bodies are for what the fracture does not take)
  const fr = r.fracture;
  assert.ok((r.bodies.inWorld > 0 || fr?.asBodies) && r.bodies.moving === 0 && (fr?.moving ?? 0) === 0,
    `${r.builder}: its rigid rubble came to rest (${r.bodies.asleep}/${r.bodies.inWorld} asleep, ${r.bodies.moving} moving; fracture ${JSON.stringify(fr)})`);
  assert.equal(r.bodies.hanging + (fr?.hanging ?? 0), 0, `${r.builder}: no body at rest in the air`);
  assert.equal(fr?.highMeshes ?? 0, 0, `${r.builder}: nothing the fracture drew lies in the air`);
  if (r.bodies.inWorld > 0) assert.ok(r.bodies.onGround >= r.bodies.inWorld * 0.6, `${r.builder}: most of its bodies lie on the ground (${r.bodies.onGround}/${r.bodies.inWorld})`);
  assert.ok(r.pass, `${r.builder}: ${r.failures.join('; ')}`);
}
console.log(`destruction-check selftest: ${report.rows.map((r) => `${r.builder} (${r.bodies.inWorld} bodies, ${r.fracture ? `${r.fracture.asBodies ? 'down as bodies' : 'the kit\'s fall'}, ` : ''}${r.pieces.thrown} pieces)`).join(', ')} — textured, nothing hanging from the fall, no hanging rims or pieces, rubble at rest on the ground — ok`);
