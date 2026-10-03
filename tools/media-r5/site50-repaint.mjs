#!/usr/bin/env node
// Repaints lab-resolved site shots from the plan (site50.mjs PAINT) without a GPU pass: paint never moves a tank, so each
// resolved actor takes its camo and camoSeed from the planned scene by name, and meta.paint is refreshed.
//   node tools/media-r5/site50-repaint.mjs <resolvedDir> [<resolvedDir> ...]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS, siteScene } from './site50.mjs';

const byNumber = new Map(SHOTS.map(shot => [shot[0], shot]));
for (const dir of process.argv.slice(2)) {
  let repainted = 0;
  for (const f of readdirSync(dir).filter(f => /^s\d\d-.*\.resolved\.json$/.test(f)).sort()) {
    const shot = byNumber.get(Number(f.slice(1, 3)));
    if (!shot) continue;
    const plan = siteScene(shot), file = join(dir, f), scene = JSON.parse(readFileSync(file, 'utf8'));
    const planned = new Map(plan.actors.map(a => [a.name, a]));
    for (const a of scene.actors) {
      const p = planned.get(a.name);
      if (!p || p.id !== a.id) throw new Error(`${f}: ${a.name} (${a.id}) is not in the plan — resolve this shot again`);
      a.camo = p.camo; a.camoSeed = p.camoSeed;
    }
    if (scene.actors.length !== plan.actors.length) throw new Error(`${f}: ${scene.actors.length} actors resolved, ${plan.actors.length} planned`);
    scene.meta = { ...scene.meta, paint: plan.meta.paint };
    writeFileSync(file, JSON.stringify(scene, null, 1));
    repainted++;
  }
  console.log(`${repainted} resolved shots repainted in ${dir}`);
}
