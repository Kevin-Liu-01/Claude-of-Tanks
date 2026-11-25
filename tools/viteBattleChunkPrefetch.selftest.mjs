// entry-cpu-278: the game document lists the solo battle's chunks (tools/viteBattleChunkPrefetch.ts). The list is each
// root's chunk and its static imports, transitively, less the game entry's own static closure; a dynamic import is never
// followed (the roster and the maps stay out); a root no chunk holds fails the build by name; the JSON goes in once, inert.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BATTLE_CHUNK_ROOTS, BATTLE_CHUNKS_ID, battleChunkFiles, withBattleChunks } from './viteBattleChunkPrefetch.ts';

const chunk = (fileName, extra = {}) => ({ type: 'chunk', fileName, imports: [], moduleIds: [], facadeModuleId: null, ...extra });
const bundle = Object.fromEntries([
  chunk('assets/main-a.js', { isEntry: true, facadeModuleId: '/r/index.html', imports: ['assets/three-b.js', 'assets/boot-c.js'] }),
  chunk('assets/three-b.js'),
  chunk('assets/boot-c.js', { imports: ['assets/three-b.js'] }),
  // a dynamic entry: its static imports include a boot chunk (left out) and a shared battle chunk
  chunk('assets/map-d.js', { facadeModuleId: '/r/src/world/map.ts', moduleIds: ['/r/src/world/map.ts', '/r/src/world/props.ts'],
    imports: ['assets/terrain-e.js', 'assets/three-b.js'] }),
  chunk('assets/terrain-e.js', { imports: ['assets/noise-f.js'] }),
  chunk('assets/noise-f.js', { imports: ['assets/terrain-e.js'] }), // (a cycle closes)
  // a root folded into a chunk it is not the facade of
  chunk('assets/hud-g.js', { moduleIds: ['/r/src/ui/hud.ts', '/r/src/ui/hudStyle.ts'], imports: ['assets/noise-f.js'] }),
  // a dynamic import of a root is never followed
  chunk('assets/fleet-h.js', { facadeModuleId: '/r/src/vehicles/profiles/x.ts' }),
  { type: 'asset', fileName: 'assets/style.css' },
].map((item) => [item.fileName, item]));
bundle['assets/map-d.js'].dynamicImports = ['assets/fleet-h.js'];

const files = battleChunkFiles(bundle, '/r/index.html', ['/r/src/world/map.ts', '/r/src/ui/hud.ts']);
assert.deepEqual(files, ['assets/hud-g.js', 'assets/map-d.js', 'assets/noise-f.js', 'assets/terrain-e.js'],
  'roots and their static closure, less the boot graph, sorted; no dynamic import followed');

assert.throws(() => battleChunkFiles(bundle, '/r/index.html', ['/r/src/world/map.ts', '/r/src/gone.ts', '/r/src/also.ts']),
  /no chunk holds \/r\/src\/gone\.ts, \/r\/src\/also\.ts/, 'every missing root is named');
assert.throws(() => battleChunkFiles(bundle, '/r/other.html', []), /no entry chunk/, 'an unknown entry fails');

const html = '<html><head><title>t</title></head><body></body></html>';
const once = withBattleChunks(html, ['/assets/map-d.js']);
assert.match(once, new RegExp(`<script type="application/json" id="${BATTLE_CHUNKS_ID}">\\["/assets/map-d.js"\\]</script>\\n</head>`));
assert.equal(withBattleChunks(once, ['/assets/other.js']), once, 'inserted once');

// the roots are source files that exist (the build fails on one no chunk holds; this catches a rename before a build)
const root = new URL('..', import.meta.url).pathname;
for (const path of BATTLE_CHUNK_ROOTS) assert.ok(readFileSync(`${root}${path}`, 'utf8').length > 0, path);
assert.equal(new Set(BATTLE_CHUNK_ROOTS).size, BATTLE_CHUNK_ROOTS.length, 'no root twice');

console.log(`viteBattleChunkPrefetch selftest: PASS (${BATTLE_CHUNK_ROOTS.length} roots)`);
