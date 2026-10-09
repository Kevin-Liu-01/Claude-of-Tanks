// The collapse, seen (destruction P2, docs/DESTRUCTION.md §3.4, §5; wave 277: "the building is never seen to come
// down" — it stood, then was gone a second later behind its dust). With sections on, a structure whose whole crosses
// collapse comes down top first: the roof, then each storey from the top COLLAPSE_STOREY_TICKS apart, its standing faces
// falling with it (the last one's breach carries storeyDown), the ground storey to its stubs; its collision swap and
// its 'collapsed' stage COLLAPSE_SETTLE_TICKS after the last drop. Sections off: one event and the next tick's swap
// (P1). A ramming hull keeps driving through while it falls; a shell meets what still stands; a collapse restored
// mid-fall ends it once.
import assert from 'node:assert/strict';
import { nearestColliderHit, setCompoundShape, setObbShape } from '../world/collision.ts';
import { COLLAPSE_SETTLE_TICKS, collapseStoreyTicks, createStructureDamage } from './structureDamage.ts';

/** The house's storeys are 3.2 m: each takes sqrt(2·3.2/9.81) s to fall, rounded up to 49 ticks. */
const COLLAPSE_STOREY_TICKS = collapseStoreyTicks(3.2);
assert.equal(COLLAPSE_STOREY_TICKS, 49, 'a 3.2 m storey falls in 49 ticks (0.808 s rounded up)');
assert.equal(collapseStoreyTicks(0.3), 18, 'never faster than 18');

/** A three-storey house at the origin, 8 m across (x) and 10 m along (z): walls to 9.6 m in one filled band (three
 * storeys of 3.2 m), a pitched roof of four half-metre strips to 11.6 m. */
function house() {
  const tag = (record) => { record.kind = 'structure'; record.structureIdx = 0; return record; };
  const contact = tag(setObbShape({ min: [0, 0, 0], max: [0, 1.8, 0] }, 0, 0, 4, 5, 0));
  const walls = tag(setCompoundShape({ min: [0, 0, 0], max: [0, 9.6, 0] }, [{ kind: 'obb', cx: 0, cz: 0, hw: 4, hl: 5, yaw: 0 }]));
  const roof = [3.5, 2.5, 1.5, 0.5].map((hl, i) => tag(setCompoundShape({ min: [0, 9.6 + i * 0.5, 0], max: [0, 10.1 + i * 0.5, 0] },
    [{ kind: 'obb', cx: 0, cz: 0, hw: 4, hl, yaw: 0 }])));
  return { obstacles: [contact], colliders: [walls, ...roof] };
}
/** The blow that brings it down: a blast on the ground storey's −x face, past the whole's hit points. */
const blow = { cause: 'blast', munition: 'howitzer', x: -4, y: 2, z: 0, dirX: 1, dirZ: 0, holeRadiusM: 0 };
const hit = { distance: Infinity, record: null };
const normal = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
/** A level shell from the west at height y: the distance to what it meets (Infinity: it flies over the house). */
const shellAt = (records, y) => {
  nearestColliderHit(records, { x: -30, y, z: 0.5 }, { x: 1, y: 0, z: 0 }, 60, normal, hit);
  return hit.distance;
};

function bringDown(sections, ticks = 200, beforeStep = null) {
  const { obstacles, colliders } = house();
  const table = createStructureDamage(obstacles, colliders, { sections });
  const s0 = table.structures[0];
  table.applyPoints(s0, s0.maxHp * 1.01, blow);
  const stages = [], breaches = [], swapAt = [];
  for (let tick = 1; tick <= ticks; tick++) {
    beforeStep?.(tick, table, s0, colliders);
    table.step();
    const st = [], br = [];
    table.drainEvents(st);
    table.drainBreaches(br);
    for (const e of st) stages.push({ tick, stage: e.stage });
    for (const e of br) breaches.push({ tick, section: e.section, sectionDown: e.sectionDown, storeyDown: e.storeyDown === true, kind: e.sectionKind });
    if (!swapAt.length && colliders[0].dead) swapAt.push(tick);
  }
  return { table, s0, stages, breaches, swapAt: swapAt[0] ?? null, colliders };
}

// ---- sections on: the roof, the storeys top down, the swap after
{
  const shots = [];
  const run = bringDown(true, 300, (tick, table, s0, colliders) => {
    // a shell at 8 m (the top storey) and at 5 m (the middle one) before a step, so after the step before it: what still
    // stands stops it
    if ([1 + COLLAPSE_STOREY_TICKS, 2 + COLLAPSE_STOREY_TICKS, 1 + 2 * COLLAPSE_STOREY_TICKS, 2 + 2 * COLLAPSE_STOREY_TICKS].includes(tick)) shots.push({ tick, high: shellAt(colliders, 8), mid: shellAt(colliders, 5) });
    if (tick === 60) {
      // a hull ramming it while it falls drives through (it yields at full speed, as P1's one-tick wait did)
      assert.equal(table.yieldTo(s0, 60, 6, 6, { ...blow, cause: 'ram' }), 1, 'a falling building yields to a ramming hull');
    }
  });
  const { stages, breaches, s0 } = run;
  const falls = breaches.filter((b) => b.sectionDown);
  const storeyOf = (section) => (section === 12 ? 'roof' : Math.floor(section / 4));
  // the blow's own panel first (its section took the points), then the cascade
  assert.equal(falls[0].section, 0 * 4 + 3, 'the struck panel falls with the blow (the −x face of the ground storey)');
  const cascade = falls.slice(1);
  const order = [...new Set(cascade.map((b) => storeyOf(b.section)))];
  assert.deepEqual(order, ['roof', 2, 1, 0], `top first: the roof, then storeys 2, 1, 0 (${JSON.stringify(cascade.map((b) => [b.tick, b.section]))})`);
  const firstTick = (key) => Math.min(...cascade.filter((b) => storeyOf(b.section) === key).map((b) => b.tick));
  assert.equal(firstTick('roof'), 1, 'the roof at the first step');
  assert.equal(firstTick(2) - firstTick('roof'), COLLAPSE_STOREY_TICKS, 'the top storey a storey-interval later');
  assert.equal(firstTick(1) - firstTick(2), COLLAPSE_STOREY_TICKS, 'then the next');
  assert.equal(firstTick(0) - firstTick(1), COLLAPSE_STOREY_TICKS, 'then the ground storey');
  for (const k of [2, 1, 0]) {
    const own = cascade.filter((b) => storeyOf(b.section) === k);
    assert.equal(own.filter((b) => b.storeyDown).length, 1, `storey ${k}: one storeyDown (its heap)`);
    assert.ok(own[own.length - 1].storeyDown, `storey ${k}: on its last face`);
  }
  // every face of every storey down, the roof down: nothing stands but the stubs
  const sections = run.table.sectionsOf(s0);
  assert.ok([...sections.down].every((d) => d === 1), 'everything down');
  // the swap and the 'collapsed' stage a settle-interval after the ground storey
  const collapsed = stages.filter((e) => e.stage === 'collapsed');
  assert.equal(collapsed.length, 1, 'one collapse');
  assert.equal(collapsed[0].tick, firstTick(0) + COLLAPSE_STOREY_TICKS + COLLAPSE_SETTLE_TICKS, 'collapsed once the ground storey has landed and settled');
  assert.equal(run.swapAt, collapsed[0].tick, 'the collision swaps with it, not before');
  assert.ok(stages.findIndex((e) => e.stage === 'breached') < stages.findIndex((e) => e.stage === 'collapsed'), 'stages in order');
  // shells meet what still stands: the top storey stops a high shell until it drops (step 22); the middle one a shell
  // at 5 m until its turn (step 43)
  const after = (step) => shots.find((s) => s.tick === step + 1);
  const top = 1 + COLLAPSE_STOREY_TICKS, mid = 1 + 2 * COLLAPSE_STOREY_TICKS;
  assert.ok(Number.isFinite(after(top - 1).high) && !Number.isFinite(after(top).high), `the top storey stops a shell at 8 m until it drops (${after(top - 1).high}, ${after(top).high})`);
  assert.ok(Number.isFinite(after(mid - 1).mid) && !Number.isFinite(after(mid).mid), `the middle storey one at 5 m until its turn (${after(mid - 1).mid}, ${after(mid).mid})`);
  console.log(`  sections on: roof at tick ${firstTick('roof')}, storeys 2/1/0 at ${firstTick(2)}/${firstTick(1)}/${firstTick(0)}, collapsed and swapped at ${collapsed[0].tick} (${(collapsed[0].tick / 60).toFixed(2)} s)`);
}

// ---- sections off: P1 — one event, the next tick's swap, no breach
{
  const run = bringDown(false, 30);
  assert.deepEqual(run.stages.map((e) => e.stage), ['damaged', 'breached', 'collapsed'], 'every stage crossed, in order');
  assert.ok(run.stages.every((e) => e.tick === 1), 'all at the first step');
  assert.equal(run.swapAt, 1, 'the swap at once');
  assert.equal(run.breaches.length, 0, 'no section falls without sections');
}

// ---- a collapse restored mid-fall (a late joiner's log, a resumed host) ends the cascade once
{
  const run = bringDown(true, 300, (tick, table) => { if (tick === 60) assert.ok(table.restoreStage(0, 'collapsed')); });
  const late = run.breaches.filter((b) => b.tick > 60);
  assert.equal(late.length, 0, 'no fall after the restore');
  assert.equal(run.stages.filter((e) => e.stage === 'collapsed').length, 0, 'and no second collapse event (the restore lays it down silently)');
  assert.equal(run.swapAt, 60, 'swapped by the restore');
}

console.log(`collapseCascade: with sections on a house comes down top first (the roof, then each storey ${COLLAPSE_STOREY_TICKS} ticks apart, each `
  + `with one storeyDown), its swap and 'collapsed' once the ground storey has landed (${COLLAPSE_STOREY_TICKS} + ${COLLAPSE_SETTLE_TICKS} ticks); shells meet what still stands; `
  + 'a ramming hull drives through while it falls; sections off it is P1\'s single event; a restore mid-fall ends it once PASS');
