// ruinGrammar.selftest.mjs — the ruin grammar (props census #7, lane B 2026-10-14): every kit ruin built on it stands as
// its kit's own house broken — its walls recorded for the damage reading (shell.ts ruinWall: describeRuin takes them as
// built, never read back off the merged parts), its openings cut, never a dark plate on a wall — and the street rubble
// pile keeps the street stream's draws while its body is drawn from its seat.
import assert from 'node:assert/strict';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from './index.ts';
import { streamFrom } from './geometry.ts';
import { paintedOpenings } from '../../../../tools/r2-standard.mjs';
import { describeStructure } from '../../structureDamageSeam.ts';
import '../../destructionDefaultKit.ts';
import { ruinPiecesOf } from './ruin.ts';
import { rubblePileParts, makeRuin } from './ruinGrammar.ts';

// the kits whose ruin is the grammar's (andalusian's molino, ksar's ghorfa range and the timber ruins keep their own forms)
const GRAMMAR_RUINS = ['sarajevo', 'shanghai', 'franconian', 'hessian', 'eifel', 'kohima', 'navajo', 'glencanyon', 'ruhr', 'saar', 'hostomel', 'wadirum',
  'breton', 'dalmatian', 'polder', 'kyushu', 'siwa'];
let builds = 0, walls = 0;
for (const sid of GRAMMAR_RUINS) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === sid);
  assert.ok(style?.builders.ruin, `${sid}: has a ruin`);
  for (const [w, d, h] of [[8, 10, 6], [12, 14, 9]]) for (const seed of [11, 23, 37, 41]) {
    const parts = buildRegionalParts(style, { structureId: 'ruin', info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
      wallBucket: 'stone', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'ruins', snowCap: false, tier: 'desktop' }, streamFrom(seed * 3 + 5));
    const plan = regionalKitPlanOf(parts);
    const tag = `${sid}/ruin ${w}x${d} #${seed}`;
    // the kyushu and navajo ruins are a burnt timber farmstead / a fallen hogan on some plots: no walls to record
    if (!plan?.ruinWalls?.length && (sid === 'kyushu' || sid === 'navajo' || sid === 'sarajevo')) continue;
    assert.ok((plan?.ruinWalls?.length ?? 0) >= 2, `${tag}: its walls recorded for the damage reading (${plan?.ruinWalls?.length ?? 0})`);
    for (const wl of plan.ruinWalls) assert.ok(wl.hl > 0.15 && wl.top.every((y) => y >= 0.3), `${tag}: a recorded wall has a length and its head over its foot`);
    const painted = paintedOpenings(parts).filter((p) => p.kind === 'opening' && p.bucket === 'dark');
    assert.equal(painted.length, 0, `${tag}: no dark plate stands for an opening (${JSON.stringify(painted.slice(0, 2))})`);
    const a = describeStructure({ structureIdx: 3, mapId: 'ruins', builder: 'ruin', style: sid, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 }, massClass: 'house' });
    assert.ok(ruinPiecesOf(a), `${tag}: the damage reading takes its walls as built (kit ${a.kit})`);
    builds++; walls += plan.ruinWalls.length;
  }
}
// the street rubble pile: its stream's draws are the old ones (a pile drawn twice from one seed leaves the stream where
// the old pile left it: the draw count does not depend on the body), its body and its new chunks from its seat
const mul = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let s = 1; s <= 12; s++) {
  const r1 = mul(s * 977), r2 = mul(s * 977);
  const p1 = rubblePileParts(3, 1, -2, 1.6 + (s % 4) * 0.4, r1), p2 = rubblePileParts(-40, 7, 55, 1.6 + (s % 4) * 0.4, r2);
  assert.equal(r1(), r2(), `pile ${s}: its seat moves no draw of the street's stream`);
  assert.equal(p1.chunks, p2.chunks, `pile ${s}: the same chunks wherever it stands`);
  let tris = 0;
  for (const g of [...p1.stone, ...p1.wood]) tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  assert.ok(tris <= 600, `pile ${s}: ${tris} triangles, the near cap 600`);
  assert.ok(p1.stone.every((g) => g.index) && p1.wood.every((g) => g.index), `pile ${s}: every piece indexed (the bucket merges)`);
}
// the plan ruin stays the plan's (its draws feed the plan's later placements)
{
  const r = mul(4242), b = { stone: [] };
  const info = makeRuin(r, b);
  assert.ok(info.w > 6 && info.d > 8 && b.stone.length >= 2, 'the plan ruin builds');
}
console.log(`ruin grammar: ${builds} kit ruins on the grammar, ${walls} walls recorded, no dark plate for an opening; the rubble pile keeps the street's draws`);
