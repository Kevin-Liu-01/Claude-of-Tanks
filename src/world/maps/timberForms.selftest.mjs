// timberForms.selftest.mjs — the field's fallen timber built from its members (props lane A, #19, 2026-10-15):
// every logs map has its own species; a log keeps inside its old cylinder (the seat and the grounding receipt are the
// cylinder's) but for its stubs and its root plate, which stand off the ground; a stump's roots run out over the ground
// and into it; end grain, bark and moss are vertex colour on the baked material; deterministic at a seed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { TIMBER_SPECIES, buildFallenLog, buildStump, logForm, stumpForm, timberOf } from './timberForms.ts';

// (2026-10-28, the world-reds lane: Whiteout left at 241 — maps-stalled-240's Lane B, 10-17: "no fallen logs on the ice")
const LOG_MAPS = ['winter', 'verdant', 'saltwind', 'steppe', 'reservoir', 'skybridge', 'orchard', 'monsoon',
  'railyard', 'longleaf', 'polders', 'mangrove', 'fjord', 'delta', 'frontier', 'cliffbridge', 'caldera', 'autumn', 'alpine', 'coastal'];
// the maps that lay logs are these (props: logs: true)
for (const id of LOG_MAPS) {
  const src = readFileSync(new URL(`./${id === 'skybridge' ? 'skybridge' : id}.ts`, import.meta.url), 'utf8');
  assert.match(src, /logs: true/, `${id} lays logs`);
}
const seen = new Set();
for (const id of LOG_MAPS) {
  const names = new Set();
  for (let i = 0; i < 64; i++) {
    const pick = timberOf(id, (i + 0.5) / 64, 0.99);
    assert.ok(pick.species && TIMBER_SPECIES[pick.name] === pick.species, `${id}: ${pick.name} is a species`);
    names.add(pick.name); seen.add(pick.name);
  }
  assert.ok(names.size >= 2, `${id} mixes its woods (${[...names]})`);
}
assert.ok(seen.size >= 11, `the maps between them use ${seen.size} species`);
assert.ok(timberOf('caldera', 0.5, 0.1).charred && !timberOf('caldera', 0.5, 0.9).charred, 'half of Aso\'s timber is burnt');
assert.equal(timberOf('verdant', 0.1, 0).charred, false, 'only the burnt maps char');

const tris = (g) => g.attributes.position.count / 3;
const attrs = (g) => Object.keys(g.attributes).sort().join(',');
for (const [name, species] of Object.entries(TIMBER_SPECIES)) {
  const pick = { species, name, moss: 0.5, charred: false };
  for (let seed = 1; seed <= 24; seed++) {
    // a log lying across a slope (its axis a little off level): up in its own frame
    const axis = new THREE.Vector3(Math.cos(seed), 0.08 * Math.sin(seed * 3), Math.sin(seed)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(q.clone().invert());
    const up = [upv.x, upv.y, upv.z];
    const r = 0.16 + (seed % 7) * 0.02, len = 2.2 + (seed % 5) * 0.4;
    const form = logForm(r, len, pick, up, seed * 131, seed % 4 === 0);
    const log = buildFallenLog(form);
    assert.equal(attrs(log), 'color,normal,position,uv', 'the baked bucket\'s attribute set');
    assert.ok(tris(log) <= 700, `${name}: a log within its cap (${tris(log)})`);
    const p = log.attributes.position, n = log.attributes.normal, c = log.attributes.color;
    let below = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), radial = Math.hypot(x, z);
      assert.ok([x, y, z, n.getX(i), n.getY(i), n.getZ(i), c.getX(i)].every(Number.isFinite));
      // inside the old cylinder (r at the butt, 0.85 r at the top) except the stubs and the plate, which stand off the
      // ground: a vertex outside it lies on the up side (or across), never pushed down into the ground
      const t = Math.min(1, Math.max(0, (y + len / 2) / len)), old = r + (0.85 * r - r) * t;
      if (radial > old * 1.002 && Math.abs(y) < len / 2) {
        const down = -(x * up[0] + y * up[1] + z * up[2]);
        if (down > old * 1.002) below++;
      }
    }
    assert.ok(below <= p.count * 0.04, `${name} seed ${seed}: nothing but a plate's foot reaches below the old cylinder (${below})`);
    if (form.butt === 'plate') {
      // the plate stands on its upper side: it reaches higher over the stem's axis than it sinks under it
      let lo = Infinity, hi = -Infinity, total = 0;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < -len / 2 - 0.06) {
        const u = p.getX(i) * up[0] + p.getY(i) * up[1] + p.getZ(i) * up[2];
        total++; lo = Math.min(lo, u); hi = Math.max(hi, u);
      }
      assert.ok(total > 20 && hi > 2.5 * r && hi > -lo * 1.3, `${name}: the root plate stands up (${(hi / r).toFixed(2)} r over, ${(-lo / r).toFixed(2)} r under)`);
    }
    if (seed % 4 === 0) assert.ok(form.butt === 'saw' && form.top === 'saw' && !form.stubs, 'a logging yard\'s donor is sawn timber');
    const again = buildFallenLog(logForm(r, len, pick, up, seed * 131, seed % 4 === 0));
    assert.deepEqual(again.attributes.position.array, log.attributes.position.array, 'deterministic');
    assert.deepEqual(again.attributes.color.array, log.attributes.color.array);
    log.dispose(); again.dispose();

    // a stump on a slope: its roots over the ground and into it
    const slope = 0.12 * Math.cos(seed), h = 0.35 + (seed % 4) * 0.08, sr = 0.22 + (seed % 5) * 0.03;
    const ground = (x, z) => -h / 2 + 0.06 + slope * x;
    const sf = stumpForm(sr, h, pick, seed * 17, seed % 4 === 0);
    const st = buildStump(sf, ground);
    assert.equal(attrs(st), 'color,normal,position,uv');
    assert.ok(tris(st) <= 450, `${name}: a stump within its cap (${tris(st)})`);
    const sp = st.attributes.position;
    let minY = Infinity, floating = 0;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      minY = Math.min(minY, y);
      // nothing reaches out past the stump's foot and hangs over the ground (a root's top may stand 0.1 m clear)
      if (Math.hypot(x, z) > sr * 1.9 && y > ground(x, z) + 0.12) floating++;
    }
    assert.ok(minY <= -h / 2 - 0.1, 'a buried skirt under the seat');
    assert.equal(floating, 0, `${name} seed ${seed}: the roots lie on the ground and dive into it`);
    if (seed % 4 === 0) assert.ok(sf.top === 'saw' && !sf.roots, 'a logging yard\'s donor stump is fresh-felled');
    st.dispose();
  }
}

// the char: a burnt stem is dark through its bark and its ends
{
  const pick = { species: TIMBER_SPECIES.sugi, name: 'sugi', moss: 0.3, charred: true };
  const log = buildFallenLog(logForm(0.25, 3, pick, [1, 0, 0], 77, false));
  const c = log.attributes.color;
  let sum = 0;
  for (let i = 0; i < c.count; i++) sum += c.getX(i) + c.getY(i) + c.getZ(i);
  assert.ok(sum / c.count / 3 < 0.08, `charred timber is dark (${(sum / c.count / 3).toFixed(3)})`);
}

// the wiring: the placer builds these on the baked material, its looks from each piece's own seed
const placer = readFileSync(new URL('./groundDressing.ts', import.meta.url), 'utf8');
assert.match(placer, /buckets\.baked\.push\(log\)/); assert.match(placer, /buckets\.baked\.push\(st\)/);
assert.doesNotMatch(placer, /CylinderGeometry/, 'no field timber is a bare cylinder');
console.log(`timberForms.selftest: ${LOG_MAPS.length} logs maps, ${seen.size} species, logs inside their seats but for stubs and plates, stumps rooted, char, deterministic`);
