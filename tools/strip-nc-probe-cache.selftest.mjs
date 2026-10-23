// strip-nc-assets.mjs reuses its registry probe's result only while every file the probe loaded is byte-identical
// (2026-10-22). Any changed, missing or unreadable input, another Node, or a damaged cache probes again.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProbeCache, writeProbeCache } from './strip-nc-assets.mjs';

const root = await mkdtemp(join(tmpdir(), 'cot-strip-nc-cache-'));
try {
  const cache = join(root, 'cache', 'probe.json');
  const files = ['src/vehicles/specs.ts', 'src/vehicles/fleetFactory.ts', 'package-lock.json'];
  await mkdir(join(root, 'src/vehicles'), { recursive: true });
  for (const file of files) await writeFile(join(root, file), `// ${file}\n`);
  const registry = { allIds: ['m1a1', 't72'], sources: { t72: 'models/tanks/t72.glb' } };

  assert.equal(await readProbeCache(cache, root), null, 'no cache: probe');
  await writeProbeCache(cache, root, [...files, files[0]], registry);
  assert.deepEqual(await readProbeCache(cache, root), { registry, inputs: 3 }, 'unchanged inputs: reuse, each input once');

  await writeFile(join(root, files[1]), '// fleetFactory.ts, one byte more\n');
  assert.equal(await readProbeCache(cache, root), null, 'a changed input: probe');
  await writeProbeCache(cache, root, files, registry);
  await rm(join(root, files[2]));
  assert.equal(await readProbeCache(cache, root), null, 'a missing input: probe');
  await writeFile(join(root, files[2]), '{}\n');
  await writeProbeCache(cache, root, files, registry);

  const stored = JSON.parse(await readFile(cache, 'utf8'));
  await writeFile(cache, JSON.stringify({ ...stored, node: 'v0.0.0' }));
  assert.equal(await readProbeCache(cache, root), null, 'another Node: probe');
  await writeFile(cache, JSON.stringify({ ...stored, version: stored.version + 1 }));
  assert.equal(await readProbeCache(cache, root), null, 'another cache version: probe');
  await writeFile(cache, '{"version":');
  assert.equal(await readProbeCache(cache, root), null, 'a damaged cache: probe');
  await writeFile(cache, JSON.stringify(stored));
  assert.deepEqual(await readProbeCache(cache, root), { registry, inputs: 3 });
  console.log('strip-nc-probe-cache.selftest: reuse only for byte-identical inputs, Node and cache version');
} finally {
  await rm(root, { recursive: true, force: true });
}
