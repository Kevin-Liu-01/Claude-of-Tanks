// No opener offers an in-page retry of a lazy chunk (loading states 264, Main's ruling on the garage lane's probe; the
// kit's src/ui/components/loadFailure.ts). A chunk that failed is never asked for again in its document (Chrome 151 keeps
// the failure, Chrome 156 does not, a failed chunk stylesheet never applies in either: tools/offline-import-probe.mjs),
// so a failed import's handler never runs the import again: not when the browser comes back online, not from the next
// press or focus, not from a notice's Retry, and it never forgets the import's promise so that a later call asks again.
// Its trigger keeps the kit's error state, and the next press reloads the page once online. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OPEN = { '(': ')', '[': ']', '{': '}' };

/** `source` with its comments blanked and its strings' insides kept (same length, so every index holds). */
export function blankComments(source) {
  const out = source.split('');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
      const end = source[i + 1] === '/' ? (source.indexOf('\n', i) + 1 || source.length) - 1 : source.indexOf('*/', i) + 2;
      for (let j = i; j < end; j++) if (out[j] !== '\n') out[j] = ' ';
      i = end - 1;
    } else if (c === "'" || c === '"' || c === '`') {
      for (i++; i < source.length && source[i] !== c; i++) if (source[i] === '\\') i++;
    }
  }
  return out.join('');
}

/** The index just past the bracket that closes the one opening at `open` (in a comment-blanked source). */
export function closeOf(source, open) {
  const stack = [OPEN[source[open]]];
  for (let i = open + 1; i < source.length; i++) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < source.length && source[i] !== c; i++) {
        if (source[i] === '\\') i++;
        else if (c === '`' && source[i] === '$' && source[i + 1] === '{') i = closeOf(source, i + 1) - 1;
      }
      continue;
    }
    if (OPEN[c]) stack.push(OPEN[c]);
    else if (c === stack.at(-1)) { stack.pop(); if (!stack.length) return i + 1; }
  }
  return source.length;
}

/** The expression statement around `at`: out through the calls and arrays that hold it, to its chain's last call. */
function statementAround(source, at) {
  let start = at;
  for (let depth = 0; start > 0; start--) {
    const c = source[start - 1];
    if (c === ')' || c === ']' || c === '}') depth++;
    else if (c === '(' || c === '[') { if (depth > 0) depth--; }
    else if (c === '{') { if (depth === 0) break; depth--; }
    else if (c === ';' && depth === 0) break;
  }
  while (start < at && /\s/.test(source[start])) start++;
  return { start, end: expressionEnd(source, start) };
}

/** Where the expression that starts at `from` ends: its chain's last call. */
function expressionEnd(source, from) {
  let end = from;
  while (end < source.length) {
    const c = source[end];
    if (OPEN[c]) { end = closeOf(source, end); continue; }
    if (c === "'" || c === '"' || c === '`') { const close = source.indexOf(c, end + 1); end = close < 0 ? source.length : close + 1; continue; }
    if (c === ')' || c === ']' || c === '}' || c === ';') break;
    // a newline ends it unless the next line continues the chain
    if (c === '\n' && !/^\s*[.?:]/.test(source.slice(end + 1, end + 200)) && !/[,(=+|&?:>]\s*$/.test(source.slice(Math.max(0, end - 80), end))) break;
    end++;
  }
  return end;
}

/** One source's functions ({ name, params, start, end }: the body's span) and try blocks ({ start, end, handler }). */
function shapes(source) {
  const functions = [];
  const defs = /\bfunction\s+(\w+)\s*\(|\b(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|(\w+)\s*=>)/g;
  for (const match of source.matchAll(defs)) {
    const name = match[1] ?? match[2];
    let params = match[3] ? [match[3]] : [];
    let cursor = match.index + match[0].length;
    if (!match[3]) {
      const open = cursor - 1;
      if (source[open] !== '(') continue;
      const close = closeOf(source, open);
      params = source.slice(open + 1, close - 1).split(',').map((p) => /^\s*(\w+)/.exec(p)?.[1]).filter(Boolean);
      cursor = close;
      if (match[2]) {
        const arrow = /^\s*(?::[^=;{]+)?=>\s*/.exec(source.slice(cursor));
        if (!arrow) continue;
        cursor += arrow[0].length;
      }
    }
    if (match[1] || source[cursor] === '{') {
      const body = source.indexOf('{', cursor);
      if (body < 0) continue;
      functions.push({ name, params, def: match.index, start: body, end: closeOf(source, body) });
    } else functions.push({ name, params, def: match.index, start: cursor, end: expressionEnd(source, cursor) });
  }
  const tries = [];
  for (const match of source.matchAll(/\btry\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    const close = closeOf(source, open);
    const after = /^\s*catch\s*(?:\([^)]*\))?\s*\{/.exec(source.slice(close));
    if (!after) continue;
    const body = close + after[0].length - 1;
    tries.push({ start: open, end: close, handler: source.slice(body + 1, closeOf(source, body) - 1) });
  }
  return { functions, tries };
}

/** The ways one source offers an in-page retry of a lazy chunk: [{ line, rule }]. */
export function inPageRetries(raw) {
  const source = blankComments(raw);
  const { functions, tries } = shapes(source);
  const innermost = (at) => functions.filter((f) => f.start <= at && at < f.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
  // the sites that fetch a chunk, each with the loaders it goes through: an import(), a call of a local function that
  // holds one (a loader), and a call of a function's parameter where some caller hands that function an import
  const sites = [...source.matchAll(/(?<!typeof\s)\bimport\((?=\s*['"`.])/g)].map((m) => ({ at: m.index, via: new Set() }));
  const loaders = new Set();
  const add = (at, via) => {
    if (sites.some((site) => site.at === at)) return false;
    sites.push({ at, via });
    return true;
  };
  for (let grew = true; grew;) {
    grew = false;
    for (const f of functions) {
      if (loaders.has(f.name)) continue;
      const inner = sites.filter((site) => f.start <= site.at && site.at < f.end);
      if (!inner.length) continue;
      loaders.add(f.name);
      grew = true;
      const via = new Set([f.name, ...inner.flatMap((site) => [...site.via])]);
      for (const call of source.matchAll(new RegExp(`(?<![.\\w])${f.name}\\(`, 'g'))) if (!(f.def <= call.index && call.index < f.end)) add(call.index, via);
    }
    for (const f of functions) {
      for (const param of f.params) {
        const handed = [...source.matchAll(new RegExp(`(?<![.\\w])${f.name}\\(`, 'g'))].some((call) => {
          const open = call.index + call[0].length - 1;
          const args = source.slice(open, closeOf(source, open));
          return /\bimport\(/.test(args) || [...loaders].some((name) => new RegExp(`(?<![.\\w])${name}\\b`).test(args));
        });
        if (!handed) continue;
        for (const call of source.slice(f.start, f.end).matchAll(new RegExp(`(?<![.\\w])${param}\\(`, 'g'))) {
          if (add(f.start + call.index, new Set([f.name]))) grew = true;
        }
      }
    }
  }
  const memo = new Set([...source.matchAll(/\b(\w+)\s*\?\?=\s*(?:Promise\.all\(\[\s*)?import\(/g)].map((m) => m[1]));
  const found = new Map();
  for (const { at, via } of sites) {
    const owner = innermost(at)?.name;
    const handlers = [];
    const { start, end } = statementAround(source, at);
    for (const match of source.slice(start, end).matchAll(/\.catch\(/g)) {
      const open = start + match.index + match[0].length - 1;
      handlers.push(source.slice(open + 1, closeOf(source, open) - 1));
    }
    // (a try's catch hears the chunk only when the try awaits it)
    const held = tries.filter((t) => t.start < at && at < t.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    if (held && /\bawait\b/.test(source.slice(start, end))) handlers.push(held.handler);
    const line = source.slice(0, at).split('\n').length;
    for (const body of handlers) {
      const rules = [];
      if (/addEventListener\(\s*'online'/.test(body)) rules.push('runs again once online');
      if (/\bretry\s*:|notice\.retry/.test(body)) rules.push('offers a Retry');
      if (owner && new RegExp(`(?<![.\\w])${owner}\\s*[(,)]`).test(body)) rules.push(`runs ${owner} again`);
      for (const name of via) if (name !== owner && new RegExp(`(?<![.\\w])${name}\\s*[(,)]`).test(body)) rules.push(`runs ${name} again`);
      for (const name of memo) if (new RegExp(`(?<![.\\w])${name}\\s*=\\s*null\\b`).test(body)) rules.push(`forgets ${name} so a later call asks again`);
      for (const rule of rules) found.set(`${line} ${rule}`, { line, rule });
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line);
}

/** The game's and the site's sources: [path, text]. */
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push([relative(ROOT, path), readFileSync(path, 'utf8')]);
    }
  };
  walk(join(ROOT, 'src'));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // ---- the scanner on known shapes
  const flagged = (source) => inPageRetries(source).map((f) => f.rule);
  assert.deepEqual(flagged("const mount = (): void => void import('./a.ts').catch(() => addEventListener('online', mount, { once: true }));"),
    ['runs again once online', 'runs mount again']);
  assert.deepEqual(flagged("function open() {\n  void import('./a.ts').then((m) => m.go()).catch(() => input.addEventListener('focus', open, { once: true }));\n}"),
    ['runs open again']);
  assert.deepEqual(flagged("const players = (): void => void Promise.all([import('./a.ts'), import('./a.css')]).then(([m]) => {\n  m.go();\n}).catch(() => addEventListener('online', players, { once: true }));"),
    ['runs again once online', 'runs players again'], 'an import inside the array a chain starts from');
  assert.deepEqual(flagged("async function show() {\n  try {\n    const m = await (memo ??= import('./a.ts'));\n  } catch {\n    memo = null;\n  }\n}"),
    ['forgets memo so a later call asks again']);
  assert.deepEqual(flagged("async function open() {\n  try { await access.open(import('./a.ts')); } catch (e) {\n    notify({ severity: 'error', retry: () => access.open() });\n  }\n}"),
    ['offers a Retry']);
  assert.deepEqual(flagged("function body() { return import('./a.ts'); }\nconst load = () => body();\nbutton.onclick = () => { void load().catch(() => failed(load)); };"),
    ['runs load again'], 'a loader one call away');
  assert.deepEqual(flagged("const whenOnline = (load) => { void load().catch(() => addEventListener('online', () => whenOnline(load), { once: true })); };\nwhenOnline(() => import('./a.ts'));"),
    ['runs again once online', 'runs whenOnline again'], 'a loader handed in');
  assert.deepEqual(flagged("const load = (): void => void import('./a.ts').then((m) => m.go()).catch(() => markLoadFailed([trigger], text)); // load again online"), [],
    'a failure that marks its trigger offers no retry (and a comment is no code)');
  assert.deepEqual(flagged("type K = typeof import('./a.ts');"), [], 'a type is no import');
  assert.deepEqual(flagged("function toast(text) { void import('./n.ts').then((n) => n.notify(text)); }\nasync function copy() {\n  try { await clip(); toast('ok'); } catch { toast('no'); }\n}"), [],
    'a try that does not await the chunk does not hear its failure');
  assert.deepEqual(flagged("importWhenOnline(() => import('./a.ts').then((m) => m.go()));"), [], 'an import that waits for the network asks once');

  // ---- every source
  const offenders = [];
  for (const [file, source] of sources()) {
    if (!/\bimport\(/.test(source)) continue;
    for (const finding of inPageRetries(source)) offenders.push(`${file}:${finding.line} ${finding.rule}`);
  }
  // the openers whose loader is handed in (the scan follows a file's own functions only): each stops at its trigger's
  // error state when pressed again, and marks its trigger when its load fails
  const OPENERS = [
    ['src/ui/garage.ts', 'the custom camo studio', /reloadsForFailure\(option, /, /customCamoStudioFailed = true;\s+reportLoadFailure\(/],
    ['src/ui/garage.ts', 'the tech tree', /reloadsForFailure\(techTreeTrigger, /, /reportLoadFailure\('cot-techtree-load'/],
    ['src/ui/garage.ts', 'the Service Record', /reloadsForFailure\(recordTrigger, /, /reportLoadFailure\('cot-record-load'/],
    ['src/ui/garage.ts', 'a battle (every launch)', /if \(pressFailed\(battleBtn\)\) return;/, /markLoadFailed\(\[battleBtn\]/],
    ['src/main.ts', "a battle's entry", /if \(reload\) garage\.noteBattleLoadFailed\(\);/, /showSoloEntryFailure\(error, reload \? null : retry\)/],
    ['src/ui/settingsAccess.ts', 'Settings', /if \(pressFailed\(gear\) \|\| !canOpen\(\)\) return;/, /markLoadFailed\(\[gear\]\)/],
    ['src/ui/settings.ts', 'the HUD editor', /if \(pressFailed\(editHud\)\) return;/, /markLoadFailed\(\[editHud\]/],
    ['src/gallery/gallery.ts', "the Gallery's anatomy layers", /if \(!pressFailed\(modeButtons\.find/, /markLoadFailed\(modeButtons\.filter/],
    ['src/main.ts', 'the Studio (its links and F8)', /pressFailed: \(\) => pressFailed\(\.\.\.studioLinks\(\)\)/, /markLoadFailed\(studioLinks\(\)\)/],
  ];
  for (const [file, name, press, mark] of OPENERS) {
    const source = blankComments(readFileSync(join(ROOT, file), 'utf8'));
    if (!press.test(source)) offenders.push(`${file} ${name}: its next press does not reload once it failed`);
    if (!mark.test(source)) offenders.push(`${file} ${name}: its failure does not mark its trigger`);
  }
  // and no notice offers a Retry: the kit's retry option runs the same load again
  for (const [file, raw] of sources()) {
    const source = blankComments(raw);
    for (const call of source.matchAll(/\b(?:notify|notifyLater|showToast)\(/g)) {
      const open = call.index + call[0].length - 1;
      if (/\bretry\s*:/.test(source.slice(open, closeOf(source, open)))) offenders.push(`${file}:${source.slice(0, call.index).split('\n').length} a notice offers a Retry`);
    }
  }
  if (process.argv.includes('--list')) console.log(offenders.join('\n') || '(none)');
  assert.deepEqual(offenders, [], `an opener offers an in-page retry of a lazy chunk (a failed chunk is not asked for again in its document: mark its trigger with markLoadFailed and let the next press reload, src/ui/components/loadFailure.ts):\n  ${offenders.join('\n  ')}`);
  console.log('loadFailure.selftest: no failed import runs again in its document (online, on a press, from a Retry, or by forgetting its promise)');
}
