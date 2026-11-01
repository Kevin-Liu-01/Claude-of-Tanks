// The icons page's public inputs (2026-11-01, item 266; tools/icons-page-public.mjs).
// Pins: (1) a server with the guard serves a public file under ICONS_PAGE_PUBLIC and anything outside public/, refuses
// every other public file (403, reported by its repository path, at its root path, its full path and /@fs/), answers the
// browser's favicon request empty and leaves a missing path to Vite; control: without the guard the same files are
// served; (2) genIcons and presentation-centering --update pass the guard to their server, and their changed-only steps
// key exactly ICONS_PAGE_PUBLIC (tools/changed-only/fleet-partition.selftest.mjs pins the keys).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { ICONS_PAGE_PUBLIC, iconsPagePublicOnly } from './icons-page-public.mjs';
import { boundOrigin, toolServerOptions } from './tool-page-load.mjs';
import { STEPS } from './changed-only/steps.mjs';

assert.deepEqual(ICONS_PAGE_PUBLIC, ['fonts'], 'the measured list: only the material painter\'s font directory');

// (1) the guard on a real Vite server over a scratch root
const root = mkdtempSync(join(tmpdir(), 'icons-page-public-'));
const files = {
  'public/fonts/face.woff2': 'font', 'public/llms.txt': '276 vehicles', 'public/site.webmanifest': '{}',
  'public/textures/a.webp': 'texture', 'public/favicon.ico': 'icon', 'src/module.js': 'export default 1;\n',
  'index.html': '<!doctype html><title>page</title>',
};
for (const [file, text] of Object.entries(files)) {
  mkdirSync(join(root, file, '..'), { recursive: true });
  writeFileSync(join(root, file), text);
}
async function serve(plugins, run) {
  const server = await createServer({ root, configFile: false, logLevel: 'silent', cacheDir: join(root, '.vite'),
    optimizeDeps: { noDiscovery: true }, server: toolServerOptions(7800), plugins });
  try {
    await server.listen();
    const origin = boundOrigin(server);
    return await run(async (path) => {
      const response = await fetch(`${origin}${path}`);
      return { status: response.status, text: await response.text() };
    });
  } finally {
    await server.close();
  }
}
try {
  const refused = [];
  await serve([iconsPagePublicOnly((file) => refused.push(file))], async (get) => {
    assert.deepEqual(await get('/fonts/face.woff2'), { status: 200, text: 'font' }, 'a file under ICONS_PAGE_PUBLIC is served');
    assert.equal((await get('/src/module.js')).status, 200, 'a module outside public/ passes');
    assert.equal((await get('/index.html')).status, 200, 'a page outside public/ passes');
    assert.equal(refused.length, 0, 'nothing refused yet');
    for (const path of ['/llms.txt', '/site.webmanifest', '/textures/a.webp', '/public/llms.txt', `/@fs${root}/public/llms.txt`]) {
      const response = await get(path);
      assert.equal(response.status, 403, `${path}: a public file outside ICONS_PAGE_PUBLIC is refused`);
      assert.match(response.text, /not an input of the icons page/);
    }
    assert.deepEqual(refused, ['public/llms.txt', 'public/site.webmanifest', 'public/textures/a.webp', 'public/llms.txt', 'public/llms.txt'],
      'each refusal is reported by its repository path');
    assert.deepEqual(await get('/favicon.ico'), { status: 204, text: '' }, 'the browser\'s favicon request is answered empty, unread');
    assert.notEqual((await get('/missing.txt')).status, 403, 'a missing path is left to Vite');
    assert.equal(refused.length, 5, 'favicon and missing paths are not refusals');
  });
  // control: Vite alone serves every public file, so the guard is what refuses them
  await serve([], async (get) => {
    for (const path of ['/llms.txt', '/textures/a.webp', '/favicon.ico']) {
      assert.equal((await get(path)).status, 200, `control: without the guard ${path} is served`);
    }
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

// (2) wiring: both chain tools pass the guard to their server and fail the run on a refusal, and their steps key exactly
// the guard's directories
for (const tool of ['genIcons', 'presentation-centering']) {
  const source = readFileSync(`tools/${tool}.mjs`, 'utf8');
  assert.match(source, /import \{ iconsPagePublicOnly \} from '\.\/icons-page-public\.mjs';/, `${tool}: imports the guard`);
  assert.match(source, /plugins: (?:update \? )?\[iconsPagePublicOnly\(\(file\) => pageErrors\.push\(/,
    `${tool}: its server refuses other public files, and a refusal is a page error (the run fails)`);
}
for (const name of ['centering', 'icons']) {
  const step = STEPS.find((entry) => entry.name === name);
  assert.deepEqual(step.reads, ICONS_PAGE_PUBLIC.map((dir) => `public/${dir}/**`), `${name}: keys exactly the served public directories`);
  assert.equal(step.excludeReads, undefined, `${name}: nothing to exclude from reads that name only served directories`);
}

console.log(`icons-page-public.selftest: PASS (serves public/${ICONS_PAGE_PUBLIC.join(', public/')}; refuses the rest)`);
