// The site's Content-Security-Policy (tools/contentSecurityPolicy.mjs, security audit 2026-10-22): vercel.json sends
// exactly the policy the sources imply, the policy never allows inline script by keyword, and every inline script a
// built document carries is named in it (checked against dist/ when a build is present).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CSP_HEADER, configuredPolicy, contentSecurityPolicy, inlineScriptHashes } from './contentSecurityPolicy.mjs';

const root = new URL('../', import.meta.url);
const policy = await contentSecurityPolicy();
const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
assert.equal(configuredPolicy(config), policy,
  `vercel.json's ${CSP_HEADER} names the current inline scripts (run: node tools/contentSecurityPolicy.mjs --write)`);

const directives = Object.fromEntries(policy.split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
assert.ok(directives['script-src'].includes("'self'"));
// the world kernels compile WebAssembly: the narrow directive, never 'unsafe-eval' (below)
assert.ok(directives['script-src'].includes("'wasm-unsafe-eval'"), "script-src allows WebAssembly compiles ('wasm-unsafe-eval')");
for (const keyword of ["'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'", 'data:', 'blob:', '*']) {
  assert.ok(!directives['script-src'].includes(keyword), `script-src never allows ${keyword}`);
}
assert.deepEqual(directives['object-src'], ["'none'"]);
assert.deepEqual(directives['base-uri'], ["'self'"]);
assert.deepEqual(directives['worker-src'], ["'self'", 'blob:'], 'same-origin workers and the capability probe');

// what counts as inline script: no src, a JavaScript, module or speculation-rules type; JSON-LD is data
const sample = '<script>a()</script><script type="module">b()</script><script type="speculationrules">{}</script>'
  + '<script type="application/ld+json">{"a":1}</script><script type="module" src="/assets/x.js"></script>';
assert.equal(inlineScriptHashes(sample).length, 3);
assert.equal(inlineScriptHashes('<script>a()</script>')[0], 'sha256-qVpDBgj7bpq5hMAcGp3AOc79J3Y1Z4HvySTwKrWDoy4=');

// a build present: every inline script of every built document is named (the build injects two of them)
const dist = new URL('dist/', root);
if (existsSync(dist)) {
  const allowed = new Set(directives['script-src'].filter((value) => value.startsWith("'sha256-")).map((value) => value.slice(1, -1)));
  let documents = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (entry.name !== 'assets') walk(new URL(`${entry.name}/`, dir)); continue; }
      if (!entry.name.endsWith('.html')) continue;
      documents++;
      for (const hash of inlineScriptHashes(readFileSync(new URL(entry.name, dir), 'utf8'))) {
        assert.ok(allowed.has(hash), `dist/${new URL(entry.name, dir).pathname.split('/dist/')[1]}: inline script ${hash} is in the policy`);
      }
    }
  };
  walk(dist);
  assert.ok(documents > 0, 'the build has documents');
  console.log(`contentSecurityPolicy: PASS (${allowed.size} hashes; ${documents} built documents checked)`);
} else {
  console.log(`contentSecurityPolicy: PASS (no dist/: sources only)`);
}
