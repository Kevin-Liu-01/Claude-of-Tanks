import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entrypoints = [
  'index.html',
  'home.html',
  'docs.html',
  'docs-topic.html',
  'docs-simulation.html',
  'docs-vehicles.html',
  'docs-rendering.html',
  'docs-worlds.html',
  'docs-multiplayer.html',
  'docs-interface.html',
  'docs-studio.html',
  'gallery.html',
];

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(
  packageJson.dependencies?.['@vercel/analytics'],
  '^2.0.1',
  'Vercel Analytics must remain a production dependency',
);

const analyticsSource = await readFile('src/analytics.js', 'utf8');
assert.match(analyticsSource, /import\(['"]@vercel\/analytics['"]\)/, 'analytics module lazily imports the Vercel client');
assert.match(analyticsSource, /\binject\s*\(/, 'analytics module injects the Vercel client');
assert.match(analyticsSource, /import\.meta\.env\.PROD/, 'analytics mode follows the Vite production environment');
assert.match(analyticsSource, /requestIdleCallback/, 'analytics stays outside the page critical path');

for (const entrypoint of entrypoints) {
  const html = await readFile(entrypoint, 'utf8');
  const references = html.match(/src=["']\/src\/analytics\.js["']/g) ?? [];
  assert.equal(references.length, 1, `${entrypoint} must load analytics exactly once`);
}

console.log(`analytics selftest passed (${entrypoints.length} HTML entrypoints)`);

// The production test chain invokes this file directly, so keep the public
// discovery/metadata contract coupled to every analytics entrypoint check.
await import('./seoMetadata.selftest.mjs');
