#!/usr/bin/env node
// Lens search for the combat round (2026-10-13): each take built with every duel lens (site50.mjs DUEL), on either
// side of the fight, holding the tanks its table row names or all of them, and judged by combat-check.mjs's frame
// check. The table's own lens is kept when it passes; otherwise the best passing candidate is printed for the table,
// ranked by what the owner asked for: every tank held, the hero's front where the lens can show it, and neither the
// hero nor its target a speck.
//   MEDIA_R5_LIGHT=1 node tools/media-r5/combat-search.mjs [ids,...]   (ids: take numbers, e.g. 228,230; ALL=1 prints
//   every candidate, not the best six)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMBAT_TABLE, DUEL, combatTake, siteScene } from './site50.mjs';
import { combatVerdict, fightFaults } from './combat-check.mjs';
import { worldModel } from './world-model.mjs';
import { SHOTS as SHOTS_DIR } from './paths.mjs';

const only = process.argv[2]?.split(',').map(Number) ?? null;
const worlds = new Map();
const worldOf = (map) => {
  if (!worlds.has(map)) {
    const f = join(process.env.MEDIA_R5_FEATURES ?? join(SHOTS_DIR, 'features'), `features-${map}.json`);
    const features = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    worlds.set(map, { features, model: features ? worldModel(features) : null });
  }
  return worlds.get(map);
};
/** The candidate's worth: passing first, then fewer faults, more of the cast held, the hero's front, sizes in range. */
const score = ({ ok, faults, metrics: m }) => (ok ? 100 : 0) - 12 * faults.length + 25 * (m.held / m.count) + 12 * Math.max(0, m.heroFront)
  + (m.hero >= 0.1 && m.hero <= 0.6 ? 8 : 0) + (m.foe0 >= 0.08 ? 5 : 0) + 6 * m.together;

// the fight's placement: the nearest anchor shift ([lat, along] m, rings of 4 m out to 20) where every hull stands
// clear and every round flies clear (combat-check.mjs fightFaults), with the table's own lens
const SHIFTS = [[0, 0]];
for (const r of [4, 8, 12, 16, 20]) for (let i = 0; i < 8; i++) SHIFTS.push([Math.round(r * Math.sin(i * Math.PI / 4)), Math.round(r * Math.cos(i * Math.PI / 4))]);
function placeFight(row) {
  const tried = [];
  for (const shift of [row[14] ?? [0, 0], ...SHIFTS]) {
    const scene = siteScene(combatTake(row, { shift }));
    const { model, features } = worldOf(scene.meta.map);
    const faults = fightFaults(scene, model, undefined, features);
    if (!faults.length) return { shift, tried };
    tried.push(`[${shift}] ${faults.slice(0, 2).join('; ')}`);
  }
  return { shift: null, tried };
}

for (const row of COMBAT_TABLE.filter((r) => !only || only.includes(r[0]))) {
  const [n, id, , , , format] = row;
  const placed = placeFight(row);
  if (!placed.shift) { console.log(`== s${n} ${id}: no clear placement within 20 m — ${placed.tried.slice(0, 4).join(' | ')}`); continue; }
  const own = { lens: row[10], k: row[11], hold: row[12], shift: placed.shift };
  console.log(`== s${n} ${id}: the fight stands at shift [${placed.shift}]${placed.tried.length ? ` (the table's ${placed.tried[0]})` : ''}`);
  const everyone = format === '1v1' ? ['hero', 'foe0'] : format === '1v2' ? ['hero', 'foe0', 'foe1'] : ['hero', 'ally1', 'foe0', 'foe1'];
  const holds = [own.hold, everyone].filter((h, i, all) => all.findIndex((x) => x.join() === h.join()) === i);
  const tried = [];
  for (const lens of Object.keys(DUEL)) for (const k of [1, -1]) for (const hold of holds) {
    const scene = siteScene(combatTake(row, { lens, k, hold, shift: own.shift }));
    const { model, features } = worldOf(scene.meta.map);
    const verdict = combatVerdict(scene, model, features);
    tried.push({ lens, k, hold, ...verdict, fix: scene.meta.cameraFix ?? null, value: score(verdict) });
  }
  const mine = tried.find((t) => t.lens === own.lens && t.k === own.k && t.hold.join() === own.hold.join());
  tried.sort((a, b) => b.value - a.value);
  console.log(`== s${n} ${id} (${format}): the table's ${own.lens} k${own.k} ${mine?.ok ? 'PASSES' : `fails (${mine?.faults.join('; ')})`}`);
  for (const t of tried.slice(0, process.env.ALL ? tried.length : 6)) {
    const m = t.metrics;
    console.log(`  ${t.ok ? 'PASS' : 'fail'} ${String(t.value.toFixed(0)).padStart(4)} ${t.lens.padEnd(9)} k${t.k > 0 ? '+1' : '-1'} hold ${t.hold.join('+').padEnd(24)} `
      + `holds ${m.held.toFixed(2)}/${m.count} together ${Math.round(m.together * 100)} % front ${m.heroFront.toFixed(2)} hero ${(m.hero * 100).toFixed(0)} % foe0 ${(m.foe0 * 100).toFixed(0)} %`
      + `${t.fix ? ` (${t.fix})` : ''}${t.ok ? '' : ` — ${t.faults.join('; ')}`}`);
  }
}
