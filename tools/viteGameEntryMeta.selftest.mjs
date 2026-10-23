// viteGameEntryMeta.selftest.mjs — the public pages name the game's entry chunk for the Play button's hover prefetch
// (tools/viteGameEntryMeta.ts; brand-ui SPEC 8.3, BUI-F7); the game's own documents gain nothing.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { GAME_ENTRY_META, gameEntryChunk, gameEntryMeta, withGameEntryMeta } from './viteGameEntryMeta.ts';

const root = '/repo';
const bundle = {
  'assets/main-abc12345.js': { type: 'chunk', isEntry: true, name: 'main', fileName: 'assets/main-abc12345.js', facadeModuleId: resolve(root, 'index.html') },
  'assets/home-def67890.js': { type: 'chunk', isEntry: true, name: 'home', fileName: 'assets/home-def67890.js', facadeModuleId: resolve(root, 'site/home.html') },
  'assets/garage-1.js': { type: 'chunk', isEntry: false, name: 'garage', fileName: 'assets/garage-1.js', facadeModuleId: resolve(root, 'src/ui/garage.ts') },
  'assets/main.css': { type: 'asset', fileName: 'assets/main.css' },
};
assert.equal(GAME_ENTRY_META, 'cot-game-entry');
assert.equal(gameEntryChunk(bundle, resolve(root, 'index.html')), '/assets/main-abc12345.js', 'the game document\'s entry chunk');
assert.equal(gameEntryChunk({}, resolve(root, 'index.html')), null, 'none in an empty bundle');
const page = '<html><head><title>x</title></head><body></body></html>';
const named = withGameEntryMeta(page, '/assets/main-abc12345.js');
assert.equal(named, '<html><head><title>x</title><meta name="cot-game-entry" content="/assets/main-abc12345.js">\n</head><body></body></html>');
assert.equal(withGameEntryMeta(named, '/assets/main-other.js'), named, 'written once');

const plugin = gameEntryMeta(root);
assert.equal(plugin.apply, 'build', 'the dev server writes no meta');
const { handler, order } = plugin.transformIndexHtml;
assert.equal(order, 'post', 'after the bundle exists');
assert.equal(handler(page, { filename: resolve(root, 'index.html'), bundle }), page, 'the game document is left byte for byte');
assert.match(handler(page, { filename: resolve(root, 'site/home.html'), bundle }), /<meta name="cot-game-entry" content="\/assets\/main-abc12345\.js">/);
assert.equal(handler(page, { filename: resolve(root, 'site/home.html') }), page, 'no bundle (the dev server): nothing');
console.log('viteGameEntryMeta.selftest: public pages name the game entry chunk; the game document is untouched');
