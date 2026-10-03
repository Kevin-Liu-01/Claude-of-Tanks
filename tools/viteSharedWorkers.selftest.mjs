import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { build } from 'vite';
import config from '../vite.config.ts';
import { guardPreloadHelper, PRELOAD_HELPER_ID, rewriteWorkerSites, sharedWorkerChunks } from './viteSharedWorkers.ts';

// Shared worker chunks (2026-10-02, tools/viteSharedWorkers.ts): listed module workers become entries of the page
// build and import the page's own chunks. A real Vite build of a small fixture proves the shape (one copy of every
// shared module, the worker URL names the emitted entry, a private copy leaves the page chunk alone), and the built
// worker runs in a document-less realm through a dynamic import whose preload list is not empty — the case Vite's
// unguarded preload helper fails with "document is not defined" (the negative control below).

const ROOT = resolve(new URL('..', import.meta.url).pathname);

// the URL rewrite touches only listed workers and keeps the constructor options
{
  const code = "const a = new Worker(new URL('./aWorker.ts', import.meta.url), { type: 'module', name: 'a' });\n"
    + 'const b = new Worker(new URL("./bWorker.ts", import.meta.url), { type: "module" });\n'
    + "const c = new URL('./aWorker.ts', import.meta.url);\n";
  const emitted = [];
  const out = rewriteWorkerSites(code, '/p/src/x/host.ts', (file) => file === '/p/src/x/aWorker.ts', (file) => emitted.push(file) - 1);
  assert.deepEqual(emitted, ['/p/src/x/aWorker.ts']);
  assert.match(out, /new Worker\(new URL\(\/\* @vite-ignore \*\/ "__COT_SHARED_WORKER_0__", import\.meta\.url\), \{ type: 'module', name: 'a' \}\)/);
  assert.ok(out.includes('new Worker(new URL("./bWorker.ts", import.meta.url)'), 'an unlisted worker keeps Vite\'s own bundle');
  assert.ok(out.includes("const c = new URL('./aWorker.ts', import.meta.url);"), 'a bare URL is not a worker construction');
  assert.equal(rewriteWorkerSites('new Worker(url)', '/p/a.ts', () => true, () => 0), null);
}

// the guard refuses a helper it does not recognise instead of shipping an unguarded one
assert.throws(() => guardPreloadHelper('export const __vitePreload = () => {}'), /preload helper changed shape/);
assert.equal(PRELOAD_HELPER_ID, '\0vite/preload-helper.js');

function fixture() {
  // A real path: Vite's HTML entry naming refuses a root behind a symlink (/var -> /private/var on macOS).
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cot-shared-workers-')));
  const files = {
    'index.html': '<!doctype html><html><head></head><body><script type="module" src="/src/main.js"></script></body></html>',
    // the page: a group chunk (pure + other), the shared module, a lazy module and the worker construction
    'src/main.js': "import { shared } from './shared.js';\nimport { group } from './group.js';\n"
      + "globalThis.__start = () => new Worker(new URL('./compute.worker.js', import.meta.url), { type: 'module', name: 'compute' });\n"
      + "globalThis.__lazy = () => import('./lazy.js');\nglobalThis.__page = [shared(1), group(1)];\n",
    'src/group.js': "import { pure } from './pure.js';\nimport { other } from './other.js';\nexport const group = (x) => pure(x) + other(x);\n",
    'src/pure.js': 'export const pure = (x) => x + 1;\n',
    'src/other.js': 'export const other = (x) => x * 10;\n',
    'src/shared.js': 'export const evaluations = (globalThis.__sharedEvaluations = (globalThis.__sharedEvaluations ?? 0) + 1);\n'
      + 'export const shared = (x) => x * 2;\n',
    'src/lazyDep.js': "import { shared } from './shared.js';\nexport const lazyDep = (x) => shared(x) + 100;\n",
    'src/lazy.js': "import { lazyDep } from './lazyDep.js';\nimport { shared } from './shared.js';\nexport const value = (x) => lazyDep(x) + shared(x);\n",
    // the worker: shared statically, pure through its private copy, lazy through the page's preload-wrapped import
    'src/idle.worker.js': 'self.onmessage = () => {};\n',
    'src/compute.worker.js': "import { shared, evaluations } from './shared.js';\nimport { pure } from './pure.js';\n"
      + 'self.onmessage = async ({ data }) => {\n'
      + "  try { const lazy = await import('./lazy.js'); self.postMessage({ ok: true, shared: shared(data), pure: pure(data), lazy: lazy.value(data), evaluations }); }\n"
      + '  catch (error) { self.postMessage({ ok: false, message: String(error?.message ?? error) }); }\n};\n',
  };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

async function buildFixture(dir, workers, { outDir = join(dir, 'dist') } = {}) {
  const output = await build({ root: dir, configFile: false, logLevel: 'silent', publicDir: false,
    plugins: sharedWorkerChunks({ workers }),
    build: { outDir, emptyOutDir: true, minify: false, write: true, rollupOptions: { output: { hashCharacters: 'base36' } } } });
  const chunks = (Array.isArray(output) ? output : [output]).flatMap((result) => result.output).filter((item) => item.type === 'chunk');
  return { outDir, chunks };
}

function runWorker(file, data) {
  const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(`
    import { parentPort } from 'node:worker_threads';
    globalThis.self = { set onmessage(handler) { parentPort.on('message', (data) => handler({ data })); },
      postMessage(reply) { parentPort.postMessage(reply); } };
    await import(${JSON.stringify(new URL(`file://${file}`).href)});
    parentPort.postMessage('ready');
  `)));
  return new Promise((resolveRun, rejectRun) => {
    const timer = setTimeout(() => rejectRun(new Error('worker timeout')), 20_000);
    worker.on('error', (error) => { clearTimeout(timer); rejectRun(error); });
    worker.on('message', (message) => {
      if (message === 'ready') { worker.postMessage(data); return; }
      clearTimeout(timer);
      void worker.terminate();
      resolveRun(message);
    });
  });
}

const dir = fixture();
try {
  const { outDir, chunks } = await buildFixture(dir, {
    'src/compute.worker.js': { privateCopies: ['src/pure.js'] },
  });
  const byModule = (suffix) => chunks.filter((chunk) => chunk.moduleIds.some((id) => id.split('?', 1)[0].endsWith(suffix)));
  const workerChunk = chunks.find((chunk) => chunk.name === 'compute.worker');
  assert.ok(workerChunk, 'the worker is an emitted chunk of the page build');
  assert.equal(byModule('/src/shared.js').length, 1, 'one copy of the shared module serves the page and the worker');
  assert.ok(workerChunk.imports.includes(byModule('/src/shared.js')[0].fileName), 'the worker imports the page\'s shared chunk');
  const mainChunk = chunks.find((chunk) => chunk.moduleIds.some((id) => id.endsWith('/src/main.js')));
  const workerUrl = /new Worker\(new URL\(\s*(?:\/\*[^*]*\*\/\s*)?"([^"]+)"\s*,\s*import\.meta\.url\s*\)/.exec(mainChunk.code)?.[1];
  assert.equal(workerUrl, `./${workerChunk.fileName.split('/').pop()}`, 'the page constructs the worker from the emitted entry\'s final name');
  assert.ok(existsSync(join(outDir, 'assets', workerUrl.slice(2))));
  assert.ok(workerChunk.moduleIds.some((id) => id.endsWith('/src/pure.js?cot-worker-copy')), 'the private copy lives in the worker\'s chunk');
  const pageGroup = byModule('/src/group.js')[0];
  assert.ok(pageGroup.moduleIds.some((id) => id.endsWith('/src/pure.js')), 'the page keeps its pure.js inside the group chunk');
  assert.equal(chunks.filter((chunk) => chunk.moduleIds.length === 1 && chunk.moduleIds[0].endsWith('/src/pure.js')).length, 0,
    'no lone pure.js chunk splits the page group');
  const helper = chunks.find((chunk) => chunk.moduleIds.includes(PRELOAD_HELPER_ID));
  assert.ok(helper?.code.includes('typeof document !== "undefined"') && helper.code.includes('if (typeof window === "undefined") throw err;'),
    'the page build ships the guarded preload helper');
  assert.match(workerChunk.code, /__vite__mapDeps\(\[\d+(?:,\d+)*\]\)/, 'the worker\'s dynamic import carries a non-empty preload list');

  const reply = await runWorker(join(outDir, workerChunk.fileName), 4);
  assert.deepEqual(reply, { ok: true, shared: 8, pure: 5, lazy: 116, evaluations: 1 },
    'the built worker computes through the page chunks in a realm without document or window');

  // negative control: Vite's unguarded helper fails in the same realm
  const helperFile = join(outDir, helper.fileName);
  writeFileSync(helperFile, readFileSync(helperFile, 'utf8').replace(' && typeof document !== "undefined"', ''));
  const unguarded = await runWorker(join(outDir, workerChunk.fileName), 4);
  assert.equal(unguarded.ok, false);
  assert.match(unguarded.message, /document is not defined/, 'without the guard the worker\'s preloaded import throws');

  // a listed worker that nothing constructs, or a private copy it never imports, fails the build
  await assert.rejects(buildFixture(dir, { 'src/idle.worker.js': {} }, { outDir: join(dir, 'dist-idle') }),
    /no `new Worker\(new URL\('\.\/…', import\.meta\.url\)\)` constructs src\/idle\.worker\.js/);
  await assert.rejects(buildFixture(dir, { 'src/missing.worker.js': {} }, { outDir: join(dir, 'dist-missing') }),
    /src\/missing\.worker\.js does not exist/);
  await assert.rejects(buildFixture(dir, { 'src/compute.worker.js': { privateCopies: ['src/other.js'] } }, { outDir: join(dir, 'dist-copy') }),
    /private copies no listed worker imports: src\/other\.js/);
  // without the plugin the worker is Vite's own bundle with its own copy of shared.js (the duplication this removes)
  const plain = await build({ root: dir, configFile: false, logLevel: 'silent', publicDir: false,
    build: { outDir: join(dir, 'dist-plain'), emptyOutDir: true, minify: false } });
  const plainChunks = (Array.isArray(plain) ? plain : [plain]).flatMap((result) => result.output).filter((item) => item.type === 'chunk');
  assert.ok(plainChunks.every((chunk) => !chunk.name.includes('compute.worker')), 'Vite emits the worker as a separate build\'s asset');
  const plainWorker = readdirSync(join(dir, 'dist-plain', 'assets')).find((name) => name.startsWith('compute.worker'));
  assert.ok(plainWorker && readFileSync(join(dir, 'dist-plain', 'assets', plainWorker), 'utf8').includes('x * 2'),
    'the plain worker bundle inlines its own copy of the shared module');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// the repository's configuration: exactly the two fleet workers, each constructed with the literal pattern
{
  const plugin = config.plugins.flat().find((entry) => entry?.name === 'cot-shared-worker-chunks');
  assert.ok(plugin, 'vite.config.ts registers the shared worker plugin');
  assert.equal(plugin.apply, 'build', 'dev keeps serving workers from source');
  assert.equal(plugin.enforce, 'pre');
  const source = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
  assert.match(source, /sharedWorkerChunks\(\{ workers: \{\n\s+'src\/world\/wreckBakeWorker\.ts': \{\},\n\s+'src\/game\/garageWorkshopGeometryWorker\.ts': \{ privateCopies: \['src\/vehicles\/profileBuilderAdapter\.ts'\] \},\n\s+\} \}\)/);
  for (const [client, worker] of [['src/world/wreckBakeClient.ts', './wreckBakeWorker.ts'], ['src/game/garageWorkshopTransfer.ts', './garageWorkshopGeometryWorker.ts']]) {
    const text = readFileSync(join(ROOT, client), 'utf8');
    assert.ok(text.includes(`new Worker(new URL('${worker}', import.meta.url)`), `${client} constructs ${worker} with the literal pattern`);
  }
  const adapter = readFileSync(join(ROOT, 'src/vehicles/profileBuilderAdapter.ts'), 'utf8');
  assert.doesNotMatch(adapter.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /^(?:let|var)\s|^\s*(?:const|let|var)\s+\w+\s*=\s*new\s+(?:Map|Set|WeakMap)/m,
    'the private copy stays a stateless module (no module-level mutable state)');
  assert.ok(readFileSync(join(ROOT, 'src/game/garageWorkshopGeometryWorker.ts'), 'utf8').includes("from '../vehicles/profileBuilderAdapter.ts'"));
}

console.log('viteSharedWorkers.selftest: one copy of shared modules, the worker URL names its emitted entry, a private copy keeps the '
  + 'page chunk whole, the built worker computes through page chunks without document/window (unguarded control fails), misconfiguration fails the build');
