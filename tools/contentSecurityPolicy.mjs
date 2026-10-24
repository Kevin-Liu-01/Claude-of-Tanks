// The site's Content-Security-Policy (security audit 2026-10-22: NV-1, NV-2, NV-15). Peer, host and translated strings
// reach innerHTML in several places; a script-src without 'unsafe-inline' keeps any markup that slips through from
// running. Every inline script a built document carries is named by its SHA-256: the documents' own (viewport seed,
// accessibility choices, chunk recovery, base title, Gallery recovery), the speculation rules and the responsive seed
// the build inlines (tools/viteSpeculationRules.ts, tools/viteResponsiveSeed.ts). Same-origin modules and workers load
// from 'self'; gtag.js from Google Tag Manager on the public pages (src/googleAnalytics.ts); blob: workers for the
// capability probe (src/engine/capabilityGate.ts). JSON-LD blocks are data, not script, and need no hash.
//
// vercel.json sends it report-only for one round (deploy 243), then enforced. When an inline script changes:
//   node tools/contentSecurityPolicy.mjs --write     rewrites the header value in vercel.json
// tools/contentSecurityPolicy.selftest.mjs fails until it matches, and checks a built dist/ when one exists.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPECULATION_RULES } from './viteSpeculationRules.ts';
import { bundleSeed } from './viteResponsiveSeed.ts';

export const CSP_HEADER = 'Content-Security-Policy-Report-Only';
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** The HTML entries the build emits (vite.config.ts build.rollupOptions.input). */
export function documentSources(root = ROOT) {
  return ['index.html', '404.html', ...readdirSync(`${root}site`).filter((name) => name.endsWith('.html')).map((name) => `site/${name}`)];
}

/** `sha256-…` of each inline script the browser would execute (no src; JSON data blocks excluded). */
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1];
    if (/\bsrc\s*=/i.test(attributes)) continue;
    const type = /\btype\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1]?.trim().toLowerCase() ?? '';
    if (type && !['module', 'text/javascript', 'application/javascript', 'speculationrules'].includes(type)) continue;
    hashes.push(`sha256-${createHash('sha256').update(match[2], 'utf8').digest('base64')}`);
  }
  return hashes;
}

/** The policy, from the sources: every document's inline scripts plus the two the build injects. */
export async function contentSecurityPolicy(root = ROOT) {
  const hashes = new Set();
  for (const file of documentSources(root)) for (const hash of inlineScriptHashes(readFileSync(`${root}${file}`, 'utf8'))) hashes.add(hash);
  hashes.add(inlineScriptHashes(`<script type="speculationrules">${JSON.stringify(SPECULATION_RULES)}</script>`)[0]);
  hashes.add(inlineScriptHashes(`<script>${await bundleSeed(root)}</script>`)[0]);
  const scriptSrc = ["'self'", 'https://www.googletagmanager.com', ...[...hashes].sort().map((hash) => `'${hash}'`)];
  return [`script-src ${scriptSrc.join(' ')}`, "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'"].join('; ');
}

/** The policy vercel.json sends today (the site-wide rule), or null. */
export function configuredPolicy(config) {
  for (const rule of config.headers ?? []) {
    for (const { key, value } of rule.headers) if (key === CSP_HEADER) return value;
  }
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const policy = await contentSecurityPolicy();
  if (process.argv.includes('--write')) {
    const path = `${ROOT}vercel.json`;
    const text = readFileSync(path, 'utf8');
    const current = configuredPolicy(JSON.parse(text));
    if (current === null) throw new Error(`vercel.json has no ${CSP_HEADER} header to update`);
    writeFileSync(path, text.replace(JSON.stringify(current), JSON.stringify(policy)));
    process.stdout.write(current === policy ? 'vercel.json: policy unchanged\n' : 'vercel.json: policy updated\n');
  } else {
    process.stdout.write(`${policy}\n`);
  }
}
