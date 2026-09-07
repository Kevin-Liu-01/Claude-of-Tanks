// Documentation integrity only; this does not run or certify tank quality gates.
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const handbook = dirname(fileURLToPath(import.meta.url));
const repo = resolve(handbook, '../..');

function prose(markdown) {
  return markdown.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
}

function localLinks(markdown) {
  const matches = prose(markdown).matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g);
  return [...matches].map(match => match[1].replace(/^<|>$/g, ''))
    .filter(target => !/^[a-z][a-z\d+.-]*:/i.test(target));
}

async function markdownFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await markdownFiles(path));
    else if (entry.isFile() && extname(path) === '.md') result.push(path);
  }
  return result.sort();
}

function checkTemplate(text, required, label, errors) {
  for (const field of required) {
    if (!text.includes(field)) errors.push(`${label}: missing required field ${JSON.stringify(field)}`);
  }
}

if (process.argv.includes('--selftest')) {
  assert.deepEqual(localLinks('[local](workflow.md) [web](https://example.com) [space](<a b.md>)'),
    ['workflow.md', 'a b.md']);
  assert.deepEqual(localLinks('```md\n[x](missing.md)\n```\n[real](README.md)'), ['README.md']);
  const errors = [];
  checkTemplate('Qualification status', ['Qualification status', 'Publication status'], 'fixture', errors);
  assert.equal(errors.length, 1);
  console.log('tank-generation docs checker selftest: PASS');
} else {
  const errors = [];
  const files = await markdownFiles(handbook);
  const linksByFile = new Map();
  let checkedLinks = 0;
  for (const file of files) {
    const links = localLinks(await readFile(file, 'utf8'));
    const paths = [];
    for (const link of links) {
      const [pathname] = link.split('#');
      if (!pathname) continue;
      const target = resolve(dirname(file), decodeURIComponent(pathname));
      const inRepo = relative(repo, target);
      if (inRepo.startsWith('..') || pathname.startsWith('/')) {
        errors.push(`${relative(repo, file)}: nonportable local link ${link}`);
        continue;
      }
      try {
        await stat(target);
        checkedLinks++;
        paths.push(target);
      } catch {
        errors.push(`${relative(repo, file)}: missing link target ${link}`);
      }
    }
    linksByFile.set(file, paths);
  }
  const reached = new Set();
  const queue = [resolve(handbook, 'README.md')];
  while (queue.length) {
    const file = queue.pop();
    if (reached.has(file)) continue;
    reached.add(file);
    queue.push(...(linksByFile.get(file) ?? []).filter(path => linksByFile.has(path)));
  }
  for (const file of files) {
    if (!reached.has(file)) errors.push(`Unreachable from README: ${relative(handbook, file)}`);
  }
  checkTemplate(await readFile(resolve(handbook, 'templates/run-packet.md'), 'utf8'), [
    'Implementation status', 'Qualification status', 'Publication status',
    'Raw SHA-256', 'Canonical oracle', 'uniform scale',
  ], 'run packet', errors);
  checkTemplate(await readFile(resolve(handbook, 'templates/run-packet.md'), 'utf8'), [
    'Intentional negative spaces', 'Original-model/record preservation',
    'Independent 14-view critic', 'NOT RUN', 'Publication receipt',
  ], 'run packet', errors);
  checkTemplate(await readFile(resolve(handbook, 'templates/handoff.md'), 'utf8'), [
    'Exact next command', 'Dirty files', 'Source hashes', 'Failed checks',
    'NOT RUN', 'Stale results', 'Publication authority', 'Process hygiene',
  ], 'handoff', errors);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Tank-generation docs: PASS (${files.length} Markdown files, ${checkedLinks} local links, all pages reachable, required template fields present).`);
    console.log('Not checked: external URLs, Markdown fragments, CLI execution, geometry, visual quality or release readiness.');
  }
}
