// opaqueProgramOrder.selftest: the program-first opaque comparator keeps three's precedence (group order, render order
// ahead of the program; material, variant, depth and object after it), sorts exactly as three's painterSortStable when
// every material has one program, never creates a properties entry, reads each material's program once a render call,
// and installs on the opaque list alone (the transparent list keeps three's order); renderer.ts installs it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cachedProgramIdOf, installOpaqueProgramOrder, programFirstOpaqueSort } from './opaqueProgramOrder.ts';

// three 0.185's painterSortStable (build/three.module.js), the order the comparator must keep apart from the program
function painterSortStable(a, b) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  else if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  else if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  else if (a.materialVariant !== b.materialVariant) return a.materialVariant - b.materialVariant;
  else if (a.z !== b.z) return a.z - b.z;
  return a.id - b.id;
}

let seed = 266;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const pick = (n) => Math.floor(rand() * n);
const materials = Array.from({ length: 24 }, (_, i) => ({ id: 100 + i, version: 0 }));
const programOfMaterial = new Map(materials.map((m) => [m.id, 7000 + (m.id * 7) % 5]));
const item = (id) => ({ id, material: materials[pick(materials.length)], materialVariant: pick(4), groupOrder: pick(2),
  renderOrder: pick(3) - 1, z: rand() < 0.05 ? Number.NaN : pick(40) / 4 });
const list = (n) => Array.from({ length: n }, (_, i) => item(i + 1));
const ids = (items) => items.map((x) => x.id).join(',');

// one program for every material: three's order exactly (NaN depths included)
for (let round = 0; round < 40; round++) {
  const a = list(60), b = [...a];
  a.sort(painterSortStable);
  b.sort(programFirstOpaqueSort(() => 9));
  assert.equal(ids(b), ids(a), `round ${round}: a single program sorts as three does`);
}

// programs ahead of materials, behind group and render order
{
  const sort = programFirstOpaqueSort((m) => programOfMaterial.get(m.id));
  for (let round = 0; round < 40; round++) {
    const sorted = list(80).sort(sort);
    for (let i = 1; i < sorted.length; i++) {
      const p = sorted[i - 1], q = sorted[i];
      const key = (x) => [x.groupOrder, x.renderOrder, programOfMaterial.get(x.material.id), x.material.id, x.materialVariant];
      const [kp, kq] = [key(p), key(q)];
      const first = kp.findIndex((v, k) => v !== kq[k]);
      if (first >= 0) assert.ok(kp[first] < kq[first], `round ${round}: ${kp} before ${kq}`);
    }
    // within one group and render order, each program's draws are contiguous
    const runs = new Map();
    let last = null;
    for (const x of sorted) {
      const k = `${x.groupOrder}|${x.renderOrder}|${programOfMaterial.get(x.material.id)}`;
      if (k !== last) { runs.set(k, (runs.get(k) ?? 0) + 1); last = k; }
    }
    for (const [k, n] of runs) assert.equal(n, 1, `round ${round}: program run ${k} split`);
  }
  // fewer program switches than three's material order on the same list
  const switches = (items) => { let n = 0, lp = null; for (const x of items) { const p = programOfMaterial.get(x.material.id); if (p !== lp) { n++; lp = p; } } return n; };
  const base = list(200);
  assert.ok(switches([...base].sort(sort)) < switches([...base].sort(painterSortStable)), 'program-first switches less');
}

// the program lookup: has() before get(), one read a render call, a recompile seen from the next
{
  let frame = 1, gets = 0;
  const linked = new Map([[materials[0], { currentProgram: { id: 41 } }], [materials[1], { currentProgram: { id: 42 } }]]);
  const properties = { has: (m) => linked.has(m), get: (m) => { gets++; return linked.get(m); } };
  const programOf = cachedProgramIdOf(properties, () => frame);
  assert.equal(programOf(materials[2]), -1, 'an unlinked material reads -1');
  assert.equal(gets, 0, 'an unlinked material creates no properties entry');
  assert.equal(programOf(materials[0]), 41);
  assert.equal(programOf(materials[0]), 41);
  assert.equal(gets, 1, 'one properties read a render call');
  linked.get(materials[0]).currentProgram = { id: 77 };
  assert.equal(programOf(materials[0]), 41, 'the cached program holds within the call');
  frame++;
  assert.equal(programOf(materials[0]), 77, 'a recompile sorts by its new program from the next render');
  linked.set(materials[2], { currentProgram: { id: 43 } });
  assert.equal(programOf(materials[2]), 43, 'a material linked since reads its program');
}

// installs on the opaque list only
{
  const calls = [];
  const renderer = { properties: { has: () => false, get: () => ({}) }, info: { render: { frame: 0 } },
    setOpaqueSort: (fn) => calls.push(['opaque', typeof fn]), setTransparentSort: (fn) => calls.push(['transparent', typeof fn]) };
  installOpaqueProgramOrder(renderer);
  assert.deepEqual(calls, [['opaque', 'function']], 'only the opaque sort is replaced');
}

// the renderer installs it where it is made
{
  const source = readFileSync(new URL('./renderer.ts', import.meta.url), 'utf8');
  assert.match(source, /routeShadowOnlyLayer\(renderer\);\s*\n(?:\s*\/\/[^\n]*\n)*\s*installOpaqueProgramOrder\(renderer\);/, 'createRenderer installs the order');
}

console.log('opaqueProgramOrder.selftest: three\'s order under one program (NaN depths too); programs after group and render order, contiguous, fewer switches; one properties read a render call, none for an unlinked material; opaque list only; installed by createRenderer PASS');
