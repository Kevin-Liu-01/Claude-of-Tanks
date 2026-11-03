// The capture-hold census (2026-11-02 audit S4): the rules every tool that holds the GPU follows, read from the sources.
// - Retired machine gates: the memory guard's ~/cot-launch-state/memguard/{PAUSE,WARN} files are retired (no memory
//   gates; `headroom can-start` always passes). A tool that still reads them stops on a leftover PAUSE and waits hours on a
//   leftover WARN, so no source of this checkout names the memguard directory in code.
// - Release after teardown: a finally that releases the capture lock and closes a browser closes the browser first, so the
//   next holder's GPU work never overlaps a live Chrome (solo-kernels-probe released first).
// The census lists the sources (tracked and new) and reads code only (comments removed); its controls prove the pattern.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = 'tools/capture-hold-census.selftest.mjs';
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
// built from parts so this file is not its own finding
const MEMGUARD = new RegExp(['[\'"`/]mem', 'guard\\b'].join(''));

/** The lines of one source's code that name the retired memory-guard directory. */
const memguardReads = (text) => code(text).split('\n').flatMap((line, index) => (MEMGUARD.test(line) ? [`${index + 1}: ${line.trim().slice(0, 140)}`] : []));
assert.equal(memguardReads(`const MEMGUARD = join(homedir(), 'cot-launch-state', '${'mem'}guard');`).length, 1, 'a joined path');
assert.equal(memguardReads(`if (existsSync(\`\${home}/cot-launch-state/${'mem'}guard/PAUSE\`)) stop();`).length, 1, 'a template path');
assert.equal(memguardReads(`// the ${'mem'}guard files are retired`).length, 0, 'a comment is not a read');
assert.equal(memguardReads('const QUIET = join(homedir(), \'cot-launch-state\', \'QUIET\');').length, 0, 'the quiet window is not the memory guard');

// a finally block's code (its own line on, at most 10 lines, to where its braces close)
function finallyBlocks(text) {
  const lines = code(text).split('\n'), blocks = [];
  lines.forEach((line, index) => {
    const at = line.search(/\bfinally\s*\{/);
    if (at < 0) return;
    let depth = 0, body = '';
    for (let j = index; j < Math.min(lines.length, index + 10); j++) {
      const part = j === index ? line.slice(at) : lines[j];
      body += `${part}\n`;
      depth += (part.match(/\{/g) ?? []).length - (part.match(/\}/g) ?? []).length;
      if (depth <= 0) break;
    }
    blocks.push({ line: index + 1, body });
  });
  return blocks;
}
const RELEASE = /\b(?:lock|capture|fifo|locks|captureLock|holdLock)\??\.release\(\)/;
const CLOSE = /\bbrowser\??\.close\(\)/;
/** The finally blocks of one source that release the capture lock before they close a browser. */
const releaseBeforeClose = (text) => finallyBlocks(text).filter(({ body }) => {
  const released = body.search(RELEASE), closed = body.search(CLOSE);
  return released >= 0 && closed > released;
}).map(({ line }) => line);
assert.deepEqual(releaseBeforeClose('try { go(); } finally {\n  lock.release();\n  await browser.close();\n}'), [1], 'a release before the close');
assert.deepEqual(releaseBeforeClose('try { go(); } finally { await browser?.close(); await server?.close(); lock.release(); }'), [], 'a close, then the release');
assert.deepEqual(releaseBeforeClose('try { go(); } finally { lock.release(); }\nawait browser.close();'), [], 'another block\'s close');

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'api', 'scripts', 'server', 'src', 'tools'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter((file) => /\.(?:[cm]?js|[cm]?ts|tsx|zsh|sh)$/.test(file) && file !== SELF);
assert.ok(files.length > 500, `the census lists the sources (${files.length})`);
const sources = new Map();
for (const file of files) {
  try { sources.set(file, readFileSync(join(ROOT, file), 'utf8')); } catch { /* deleted in the working tree */ }
}

const gates = [...sources].flatMap(([file, text]) => memguardReads(text).map((hit) => `${file}:${hit}`));
assert.deepEqual(gates, [], `the memory guard is retired: nothing reads its PAUSE or WARN files\n  ${gates.join('\n  ')}`);

const early = [...sources].flatMap(([file, text]) => releaseBeforeClose(text).map((line) => `${file}:${line}`));
assert.deepEqual(early, [], `close the browser before the capture lock is released (the next holder's GPU work would overlap it)\n  ${early.join('\n  ')}`);

console.log(`capture-hold-census.selftest: ${sources.size} sources; no retired memory-guard gate; every browser closes before its lock goes`);
