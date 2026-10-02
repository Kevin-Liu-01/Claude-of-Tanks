import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import config from '../vite.config.ts';
import { HASHED_ASSET_RE, listHashedAssets } from './vercel-output-immutable.mjs';
import { hashedRuntimePath, RUNTIME_FILE_DIRS, runtimeFileEntries, runtimeFileManifest, runtimeFileVersions } from './viteRuntimeFiles.ts';
import { runtimeFileUrl } from '../src/runtimeFiles.ts';
import { SFX_FILES } from '../src/audio/audioPolicy.ts';

// Versioned runtime audio (2026-10-02, tools/viteRuntimeFiles.ts): the build copies public/audio to content-hashed
// names under /assets (immutable, carried forward for old tabs) and defines the map src/runtimeFiles.ts resolves
// the game's two audio fetch sites through. Proven on a fixture build and against the repository's own tables.

const ROOT = resolve(new URL('..', import.meta.url).pathname);

// names: content-addressed, the shape every hashed asset has
{
  const a = hashedRuntimePath('audio/sfx/era_pop.ogg', Buffer.from('one'));
  assert.match(a, /^assets\/audio\/sfx\/era_pop-[0-9a-z]{8}\.ogg$/);
  assert.match(a, HASHED_ASSET_RE, 'the immutable-route and carry-forward pattern accepts the name');
  assert.equal(hashedRuntimePath('audio/sfx/era_pop.ogg', Buffer.from('one')), a, 'the same bytes, the same name');
  assert.notEqual(hashedRuntimePath('audio/sfx/era_pop.ogg', Buffer.from('two')), a, 'other bytes, another name');
}

// the resolver: the build's map, else the public path (development, Node, an unlisted file)
{
  assert.equal(runtimeFileUrl('audio/sfx/a.ogg'), '/audio/sfx/a.ogg', 'Node and development fetch the public path');
  assert.equal(runtimeFileUrl('audio/sfx/a.ogg', '/base/', { 'audio/sfx/a.ogg': 'assets/audio/sfx/a-12345678.ogg' }), '/base/assets/audio/sfx/a-12345678.ogg');
  assert.equal(runtimeFileUrl('audio/sfx/b.ogg', '/', { 'audio/sfx/a.ogg': 'x' }), '/audio/sfx/b.ogg');
  assert.equal(runtimeFileUrl('toString', '/', {}), '/toString', 'only own entries count');
}

// a fixture build: hashed copies with identical bytes, originals kept, the map defined into the bundle
{
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cot-runtime-files-')));
  try {
    const files = {
      'public/audio/sfx/boom.ogg': 'OggS-boom', 'public/audio/voice/go.ogg': 'OggS-go', 'public/audio/readme.txt': 'not audio',
      'public/fonts/f/Grotesk.woff2': 'wOF2-font', 'public/textures/t.png': 'png',
      'index.html': '<!doctype html><html><head></head><body><script type="module" src="/src/main.js"></script></body></html>',
      'src/main.js': `import { runtimeFileUrl } from ${JSON.stringify(join(ROOT, 'src/runtimeFiles.ts'))};\n`
        + "globalThis.__urls = [runtimeFileUrl('audio/sfx/boom.ogg'), runtimeFileUrl('audio/voice/go.ogg'), runtimeFileUrl('textures/t.png')];\n",
    };
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    const entries = runtimeFileEntries(join(dir, 'public'));
    assert.deepEqual(entries.map((entry) => entry.path), ['audio/sfx/boom.ogg', 'audio/voice/go.ogg'], 'audio only, by extension');
    const manifest = runtimeFileManifest(entries);
    await build({ root: dir, configFile: false, logLevel: 'silent', plugins: [runtimeFileVersions()],
      build: { outDir: join(dir, 'dist'), emptyOutDir: true, minify: false, modulePreload: { polyfill: false } } });
    const dist = join(dir, 'dist');
    for (const entry of entries) {
      assert.equal(readFileSync(join(dist, entry.hashed), 'utf8'), readFileSync(entry.file, 'utf8'), `${entry.hashed} carries the original bytes`);
      assert.ok(existsSync(join(dist, entry.path)), `the original ${entry.path} stays deployed`);
    }
    assert.deepEqual(listHashedAssets(dist).filter((path) => !path.endsWith('.js')).sort(), entries.map((entry) => entry.hashed.slice('assets/'.length)).sort(),
      'the copies are hashed /assets files: the immutable routes and the release carry-forward include them');
    const chunk = readdirSync(join(dist, 'assets')).find((name) => name.endsWith('.js'));
    const code = readFileSync(join(dist, 'assets', chunk), 'utf8');
    for (const [path, hashed] of Object.entries(manifest)) assert.ok(code.includes(JSON.stringify(path)) && code.includes(JSON.stringify(hashed)), `the built map names ${path}`);
    // the built resolver, evaluated: listed files resolve to their copies, anything else keeps its public path
    const urls = await import(`data:text/javascript,${encodeURIComponent(code.replace(/^import[^;]*;/m, ''))}`).then(() => globalThis.__urls);
    assert.deepEqual(urls, [`/${manifest['audio/sfx/boom.ogg']}`, `/${manifest['audio/voice/go.ogg']}`, '/textures/t.png']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// the repository: the plugin is registered, the two fetch sites resolve through the map, every fetched file is in it
{
  const plugin = config.plugins.flat().find((entry) => entry?.name === 'cot-runtime-file-versions');
  assert.ok(plugin && plugin.apply === 'build', 'vite.config.ts registers the build-only runtime file versions');
  assert.deepEqual(Object.keys(RUNTIME_FILE_DIRS), ['audio'], 'only audio: fonts have five kinds of reference, world and vehicle files other owners');
  const entries = new Set(runtimeFileEntries(join(ROOT, 'public')).map((entry) => entry.path));
  const audio = readFileSync(join(ROOT, 'src/audio/audio.ts'), 'utf8');
  const voices = readFileSync(join(ROOT, 'src/audio/voices.ts'), 'utf8');
  assert.match(audio, /fetch\(runtimeFileUrl\(`audio\/sfx\/\$\{SFX_FILES\[name\]\}`, base\)\)/, 'combat samples resolve through the map');
  assert.match(voices, /fetch\(runtimeFileUrl\(`audio\/voice\/\$\{name\}`, base\)\)/, 'radio lines resolve through the map');
  for (const source of [audio, voices]) assert.doesNotMatch(source, /fetch\(`\$\{base\}audio\//, 'no fetch bypasses the map');
  const sfx = Object.values(SFX_FILES);
  assert.ok(sfx.length >= 20, `the combat sample table is readable (${sfx.length})`);
  for (const file of sfx) assert.ok(entries.has(`audio/sfx/${file}`), `audio/sfx/${file} is versioned`);
  const voiceFiles = [...voices.matchAll(/'([\w-]+\.ogg)'/g)].map((match) => match[1]);
  assert.ok(voiceFiles.length >= 20, `the voice table is readable (${voiceFiles.length})`);
  for (const file of voiceFiles) assert.ok(entries.has(`audio/voice/${file}`), `audio/voice/${file} is versioned`);
}

console.log('viteRuntimeFiles.selftest: content-hashed /assets copies of the runtime audio, the fetch map built in and resolved, originals kept, every fetched file covered');
