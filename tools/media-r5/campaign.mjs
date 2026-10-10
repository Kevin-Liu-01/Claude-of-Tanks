// Media r5 campaign CLI: every set yields key-art stills (camera variants) and film shots.
//   node tools/media-r5/campaign.mjs stills <outDir> [setIds]
//   node tools/media-r5/campaign.mjs films  <outDir> [shotIds]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildScene, buildShot } from './setups.mjs';
import { SETS, T, pictureFor, LIGHT_READY, FILM_LENS, sunFor } from './sets.mjs';

const mode = process.argv[2], out = process.argv[3] ?? `shots/media-r5/campaign-${mode}`;
const only = process.argv[4]?.split(',');
mkdirSync(out, { recursive: true });
let n = 0;
const finish = (set, scene) => {
  if (set.autoPlace === false) scene.autoPlace = false;
  if (set.allowWater) for (const a of scene.actors) a.allowWater = true;
  return scene;
};
for (const set of SETS) {
  const base = { ...set, time: T(set.time), picture: pictureFor(set), light: set.light };
  if (mode === 'stills' && (!only || only.includes(set.id))) {
    const scene = finish(set, buildScene({ ...base, ...set.still }));
    writeFileSync(join(out, `${set.id}.json`), JSON.stringify(scene, null, 1)); n++;
  }
  if (mode === 'films') for (const f of set.films) {
    if (only && !only.includes(f.id)) continue;
    const t = f.time ?? set.time;
    const fb = { ...base, time: T(t), picture: pictureFor({ ...set, time: t }, { ...FILM_LENS, ...(f.picture ?? {}) }),
      ...(f.formation ? { formation: f.formation, count: f.count } : {}), ...(f.lineup ? { lineup: f.lineup } : {}), ...('enemies' in f ? { enemies: f.enemies } : {}),
      ...(f.anchor ? { anchor: f.anchor } : {}), ...(f.heading != null ? { heading: f.heading } : {}) };
    const scene = finish(set, buildShot(fb, f));
    const az = LIGHT_READY ? sunFor(scene, f.sun ?? set.sun, t) : null;
    if (az != null) scene.light = { ...(scene.light ?? {}), sunAzimuthDeg: az };
    scene.meta = { set: set.id, shot: f.id, requestedTime: t, sun: f.sun ?? set.sun ?? null };
    writeFileSync(join(out, `${f.id}.json`), JSON.stringify(scene, null, 1)); n++;
  }
}
console.log(`${n} ${mode} -> ${out} (light ${LIGHT_READY ? 'ready' : 'fallback'})`);
