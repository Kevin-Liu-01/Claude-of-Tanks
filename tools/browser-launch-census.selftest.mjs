// Every browser goes through the guard (2026-10-26, item 244): no module of this checkout calls puppeteer's or
// playwright's launch, launchServer or launchPersistentContext itself; tools/browser-launch.mjs launchGuardedBrowser is
// the one caller, so every capture, probe, critic pair and receipt runs with the heap cap and the RSS watchdog. The
// census lists the sources (tracked and new) and names each direct call; its negative controls prove the pattern.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNER = 'tools/browser-launch.mjs';
// built from parts so this file is not its own finding
const LAUNCH = new RegExp(['\\b(?:puppeteer|chromium|firefox|webkit|default)', '\\s*\\.\\s*', 'launch(?:Server|PersistentContext)?\\s*\\('].join(''));

/** The direct launches in one source text: [{ line, text }]. */
function directLaunches(text) {
  return text.split('\n').flatMap((line, index) => (LAUNCH.test(line) ? [{ line: index + 1, text: line.trim().slice(0, 160) }] : []));
}

const call = (who, method = 'launch') => `${who}.${method}(`;
assert.equal(directLaunches(`const browser = await ${call('puppeteer')}{ headless: true });`).length, 1);
assert.equal(directLaunches(`browser=await ${call('chromium')}{channel:'chrome'})`).length, 1);
assert.equal(directLaunches(`owner = await ${call('chromium', 'launchServer')}{})`).length, 1);
assert.equal(directLaunches(`ctx = await ${call('chromium', 'launchPersistentContext')}dir, {})`).length, 1);
assert.equal(directLaunches(`await (await import('puppeteer')).${call('default')}{})`).length, 1, 'a dynamic import\'s default too');
assert.equal(directLaunches(`const browser = await launchGuardedBrowser(puppeteer, { headless: true });`).length, 0);
assert.equal(directLaunches(`game._wreckTurrets?.launch(entity, cause, tick);`).length, 0, 'other launch() methods are not browsers');

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'api', 'scripts', 'server', 'src', 'tools'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter((file) => /\.(?:[cm]?js|[cm]?ts|tsx)$/.test(file) && file !== OWNER);
assert.ok(files.length > 500, `the census lists the sources (${files.length})`);
const findings = [];
for (const file of files) {
  let text;
  try { text = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; } // deleted in the working tree
  for (const hit of directLaunches(text)) findings.push(`${file}:${hit.line}: ${hit.text}`);
}
assert.deepEqual(findings, [], `launch every browser through ${OWNER} launchGuardedBrowser (the heap cap and the RSS watchdog):\n  `
  + findings.join('\n  '));
console.log(`browser-launch-census.selftest: ${files.length} sources, every browser launch through ${OWNER}`);
