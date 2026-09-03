import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entrypoints = [
  'home.html',
  'docs.html',
  'docs-topic.html',
  'docs-build.html',
  'docs-models.html',
  'docs-simulation.html',
  'docs-vehicles.html',
  'docs-rendering.html',
  'docs-performance.html',
  'docs-worlds.html',
  'docs-ai.html',
  'docs-multiplayer.html',
  'docs-audio.html',
  'docs-interface.html',
  'docs-studio.html',
  'gallery.html',
];

const gameEntry = await readFile('index.html', 'utf8');
assert.doesNotMatch(
  gameEntry,
  /src=["']\/src\/analytics\.ts["']/,
  'the latency-sensitive game entry must not schedule third-party analytics',
);

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(
  packageJson.dependencies?.['@vercel/analytics'],
  '^2.0.1',
  'Vercel Analytics must remain a production dependency',
);

const analyticsSource = await readFile('src/analytics.ts', 'utf8');
assert.match(analyticsSource, /import\(['"]@vercel\/analytics['"]\)/,
  'analytics module lazily imports the Vercel client');
assert.match(analyticsSource, /\binject\s*\(/,
  'analytics module injects the Vercel client');
assert.match(analyticsSource, /import\.meta\.env\.PROD/,
  'analytics mode follows the Vite production environment');
assert.match(analyticsSource, /requestIdleCallback/,
  'analytics stays outside the page critical path');
assert.match(analyticsSource, /VITE_SELF_HOSTED\s*===\s*['"]1['"]/,
  'self-hosted builds can compile out hosted telemetry');

const dockerfile = await readFile('Dockerfile.selfhost', 'utf8');
assert.match(dockerfile, /VITE_SELF_HOSTED=1/,
  'the self-hosted image disables Vercel Analytics at build time');

for (const entrypoint of entrypoints) {
  const html = await readFile(entrypoint, 'utf8');
  const references = html.match(/src=["']\/src\/analytics\.ts["']/g) ?? [];
  assert.equal(references.length, 1, `${entrypoint} must load analytics exactly once`);
  assert.doesNotMatch(html,
    /<(?:script|img|audio|video|source)\b[^>]*\bsrc=["']https?:\/\//i,
    `${entrypoint} must package every automatic subresource locally`);
}

console.log(`analytics selftest passed (${entrypoints.length} public entrypoints; self-host image opted out)`);

// The production test chain invokes this file directly, so keep the public
// discovery/metadata contract coupled to every analytics entrypoint check.
await import('./seoMetadata.selftest.mjs');
await import('./publicLoading.selftest.mjs');
