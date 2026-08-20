import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pageFiles = ['home.html', 'gallery.html', 'docs.html'];
const supportingFiles = [
  'README.md',
  'src/gallery/catalog.js',
  'src/presentation/mediaArchive.js',
];
const retiredPhrases = [
  'Every system. In the frame.',
  'Not a render reel.',
  'Designed as one armored machine.',
  'One result, fully explained.',
  'Sixteen maps, no empty fields.',
  'One command language.',
  'One source of truth.',
  'The game, not a promise.',
  'Clients request. Authority decides. Rooms persist.',
  'Code outranks copy',
  'Claims end in executable evidence.',
  'Contact sheets are the visual gate.',
  'Start the engine.',
  'Tanks in context.',
];

for (const file of [...pageFiles, ...supportingFiles]) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  for (const phrase of retiredPhrases) {
    assert.ok(!source.includes(phrase), `${file} reintroduced retired campaign copy: ${phrase}`);
  }
}

for (const file of pageFiles) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  assert.ok(headings.length > 0, `${file} has no public headings`);
  for (const heading of headings) {
    assert.doesNotMatch(heading, /[.!?]$/, `${file} uses a sentence fragment as a heading: ${heading}`);
  }
}

const gallerySource = readFileSync(join(ROOT, 'src/gallery/gallery.js'), 'utf8');
assert.match(gallerySource, /mountMediaArchive\([^\n]+\{ mode: 'compact', limit: 88 \}\)/);

console.log('public copy selftest passed');
