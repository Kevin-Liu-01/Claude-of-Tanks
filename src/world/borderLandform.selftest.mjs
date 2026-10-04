// The map-borders lane (2026-10-03, gauntlet wave 30): the land past the playable edge — its relief and its cover — is
// built from the terrain seed and the map's border settings, never from the map id. Wave 3 seeded the outland by the
// map id (so that Verdant Fields, Amberford, Ironworks and Saltmere Bay would not show one patchwork); the relief that
// the rings and the far country were authored over moved with it by up to 136 m, and the cover reshuffled the critics'
// views: Frosthollow's north rose as a smeared wall over a hamlet now under a wood, Glacier Pass's southern range
// folded into a spike, a flat-topped slab stood in Sirocco Wadi's far range, and a stubble field lay as a bare sand
// patch across the middle of Amberford's north view.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// every landform the height field builds, with what it was built from (a spy round the module's one constructor)
const landformURL = new URL('./borderLandform.ts', import.meta.url);
const landformSource = readFileSync(landformURL, 'utf8');
const constructorHead = 'export function createBorderLandform(';
assert.equal(landformSource.split(constructorHead).length, 2, 'one landform constructor');
const hooks = registerHooks({ load(url, context, next) {
  if (url !== landformURL.href) return next(url, context);
  return { format: 'module-typescript', shortCircuit: true, source: landformSource.replace(constructorHead, 'export function createBorderLandformBuilt(')
    + '\nexport function createBorderLandform(seed: number, ...rest: any[]): BorderLandform {\n'
    + '  const built = (createBorderLandformBuilt as any)(seed, ...rest);\n'
    + '  (globalThis as any).__borderLandforms?.push({ seed, rest, built });\n  return built;\n}\n' };
} });
const built = [];
globalThis.__borderLandforms = built;
let createHeightField, getMapConfig, createBorderLandformBuilt;
try {
  ({ createHeightField } = await import('./terrain.ts'));
  ({ getMapConfig } = await import('./maps/index.ts'));
  ({ createBorderLandformBuilt } = await import(landformURL.href));
} finally { hooks.deregister(); }

// each map's landform is the one its terrain seed, rim, settings and exit valleys make — rebuilt from those alone, it
// answers the same at every point past the edge, so no map-dependent seed reached its relief (the hills, the
// foothills, the hand-over to the ranges) or its cover (the woods, the fields and their crops)
const fields = {};
let points = 0;
for (const id of ['winter', 'alpine', 'desert', 'autumn', 'foundry', 'verdant']) {
  built.length = 0;
  fields[id] = createHeightField(1337, getMapConfig(id));
  assert.equal(built.length, 1, `${id}: the height field builds one border landform`);
  const [{ seed, rest, built: landform }] = built;
  assert.equal(seed, 1337, `${id}: the landform is the terrain seed's (built from ${seed})`);
  const fresh = createBorderLandformBuilt(seed, rest[0], rest[1], rest[2]);
  const a = [0, 0, 0, 1], b = [0, 0, 0, 1];
  for (let r = 470; r <= 1430; r += 80) {
    for (let s = -r; s < r; s += 53) {
      for (const [x, z] of [[s, r], [r, -s], [-s, -r], [-r, s]]) {
        points++;
        const radius = Math.max(Math.abs(x), Math.abs(z));
        assert.equal(landform.liftAt(x, z, radius), fresh.liftAt(x, z, radius), `${id}: the relief at (${x}, ${z}) is the seed's`);
        assert.equal(landform.handOverAt(x, z), fresh.handOverAt(x, z), `${id}: the hand-over at (${x}, ${z}) is the seed's`);
        assert.equal(landform.woodsAt(x, z), fresh.woodsAt(x, z), `${id}: the woods at (${x}, ${z}) are the seed's`);
        landform.parcelTintAt(x, z, a); fresh.parcelTintAt(x, z, b);
        assert.deepEqual(a, b, `${id}: the fields at (${x}, ${z}) are the seed's`);
      }
    }
  }
}

// Amberford's north view (the border census's edge-n, from (0, 442) looking north): the middle of its middle distance,
// 40-200 m past the edge within 25 degrees of the view's axis, is grass and green crops, not a straw field (wave 30's
// stubble patch covered most of it)
const field = fields.autumn, tint = [0, 0, 0, 1];
let straw = 0, samples = 0;
for (let z = 552; z <= 712; z += 8) {
  for (let x = -260; x <= 260; x += 8) {
    if (Math.abs(Math.atan2(x, z - 442)) > 25 * Math.PI / 180) continue;
    samples++;
    field._borderParcelAt(x, z, tint);
    const w = 1 - tint[3];
    if (w > 0.05 && tint[0] / w > 2.2 && tint[0] / Math.max(1e-6, tint[1]) > 1.15) straw++;
  }
}
assert.ok(samples > 200, 'the view wedge is sampled');
assert.ok(straw / samples < 0.08, `Amberford's north view keeps its grass (straw ${(100 * straw / samples).toFixed(1)} %)`);
console.log(`borderLandform.selftest: six maps' land past the edge is their terrain seed's (${points} points); Amberford's north view straw ${(100 * straw / samples).toFixed(1)} %`);
