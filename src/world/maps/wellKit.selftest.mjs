// Each place's village well and square monument (maps/wellKit.ts; the looks lane, 2026-10-13; LOOKS-BRIEF item 5): every
// well-placing map's place has a form of its own; every form builds intact and broken, member by member, within the
// destructible's reach and under its height, lower when broken, deterministic; props.ts takes them in place of the
// region-blind builds, spending the legacy builders' draws first.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MONUMENT_FORMS, TIMBER_WELLS, WELL_FORMS, buildMonument, buildWell, monumentFormFor, wellFormFor, wellStoneOf,
} from './wellKit.ts';
import { resolveRegionalArchitecture } from './regional/index.ts';
import { getMapConfig, MAP_IDS } from './index.ts';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';

let builds = 0;
const reachOf = (g) => {
  const p = g.getAttribute('position').array;
  let r = 0, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    assert.ok(Number.isFinite(p[i]) && Number.isFinite(p[i + 1]) && Number.isFinite(p[i + 2]), 'finite');
    r = Math.max(r, Math.hypot(p[i], p[i + 2])); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
  }
  return { r, y0, y1, tris: p.length / 9 };
};
const mapsWithWells = MAP_IDS.filter((id) => getMapConfig(id).props?.well);
const mapsWithMonuments = MAP_IDS.filter((id) => getMapConfig(id).props?.monument);
assert.ok(mapsWithWells.length >= 15, `the wells' maps (${mapsWithWells.length})`);
for (const mapId of mapsWithWells) {
  const arch = getMapConfig(mapId).props?.architecture ?? null;
  const form = wellFormFor(arch, mapId);
  assert.ok(form, `${mapId}: its place builds its own well (kit ${arch ?? 'none'})`);
}
for (const mapId of mapsWithMonuments) {
  const arch = getMapConfig(mapId).props?.architecture ?? null;
  assert.ok(monumentFormFor(arch, mapId), `${mapId}: its place raises its own monument (kit ${arch ?? 'none'})`);
}
const forms = new Map();
for (const [key, form] of Object.entries(WELL_FORMS)) if (!forms.has(`well:${form}`)) forms.set(`well:${form}`, key);
for (const [key, form] of Object.entries(MONUMENT_FORMS)) if (!forms.has(`monument:${form}`)) forms.set(`monument:${form}`, key);
for (const [spec, key] of forms) {
  const [what, form] = spec.split(':');
  let arch = null; try { arch = resolveRegionalArchitecture(key); } catch { arch = null; }
  const ctx = { stone: wellStoneOf(arch) };
  const meta = DESTRUCTIBLE_TYPES[what];
  const intact = what === 'well' ? buildWell(form, ctx, false) : buildMonument(form, ctx, false);
  const broken = what === 'well' ? buildWell(form, ctx, true) : buildMonument(form, ctx, true);
  for (const g of [intact, broken]) for (const name of ['position', 'normal', 'uv', 'color']) assert.ok(g.getAttribute(name), `${spec}: ${name}`);
  const a = reachOf(intact), b = reachOf(broken);
  assert.ok(a.tris >= 100 && a.tris <= 2400, `${spec}: ${a.tris} triangles, member by member and bounded`);
  // within the destructible's reach (a sweep well's post and its counterweight a little past it), and its height
  const reach = what === 'well' ? (form === 'zhuravel' ? 3.8 : 1.75) : 1.8;
  assert.ok(a.r <= reach, `${spec}: reaches ${a.r.toFixed(2)} m of the ${meta.r} m record (${reach} m allowed)`);
  assert.ok(a.y0 >= -0.35, `${spec}: footings no deeper than 0.35 m`);
  // (a draw well's wrought-iron crown and a sweep well's counterweight stand over the record's height: iron and a pole)
  assert.ok(a.y1 <= (what === 'well' ? (form === 'zhuravel' ? 5.2 : form === 'drawwell' ? 3.6 : 3.2) : 5.4), `${spec}: ${a.y1.toFixed(2)} m high`);
  // (a monument's plinth and its pedestal's stump stand when the figure, the cross or the stele is thrown down)
  // (the r2 sweep, 2026-10-16: a wreck stands a quarter of its well's height; the sweep well's soha post, a 30 cm log,
  // stands snapped at 2 m under its fallen sweep)
  assert.ok(b.y1 < a.y1 - 0.4 && b.y1 <= (what === 'well' ? (form === 'zhuravel' ? 2.2 : 1.4) : 1.7), `${spec}: broken lower than it stood (${b.y1.toFixed(2)} vs ${a.y1.toFixed(2)})`);
  const again = what === 'well' ? buildWell(form, ctx, false) : buildMonument(form, ctx, false);
  assert.deepEqual(Array.from(again.getAttribute('position').array.slice(0, 300)), Array.from(intact.getAttribute('position').array.slice(0, 300)), `${spec}: deterministic`);
  builds += 2;
}
assert.ok([...TIMBER_WELLS].every((f) => Object.values(WELL_FORMS).includes(f)), 'the timber forms are forms');
// props.ts: the place's builds in place of the region-blind ones, the legacy builders' draws spent first
const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
assert.match(props, /\.\.\.wellTypes\(\),/, 'the well and monument join the props\' local types');
assert.match(props, /DESTRUCTIBLE_TYPES\.well\.build\(rng\)\.dispose\(\); return buildWell\(wf, ctx, false\);/, 'the well spends its legacy draws');
assert.match(props, /DESTRUCTIBLE_TYPES\.monument\.build\(rng\)\.dispose\(\); return buildMonument\(mf, ctx, false\);/, 'the monument spends its legacy draws');
console.log(`wellKit: ${mapsWithWells.length} well maps and ${mapsWithMonuments.length} monument maps each their place's form; ${builds} builds of ${forms.size} forms PASS`);
