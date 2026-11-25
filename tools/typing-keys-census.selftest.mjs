// Every global key listener asks src/ui/keyboardOwnership.ts isTypingTarget before it acts (typing-keys-277; Kevin, 276:
// "i cant write spaces in the tank filter in garage because it gets detected by teh game itself"). The game's input
// layer heard the Garage search's space as the handbrake and prevented its default; Watch, the death view's spectate
// keys, the tutorial and the photo mode had the same hole. A listener on the window or the document (a keydown, keyup
// or keypress, by a literal or through an array of event types) consults the predicate in its handler, or carries a
// `// typing-keys: <reason>` line just above it (or above its event list) that says why it acts on no typed key: a
// release, a wake, a chord no field types. Its negative controls prove the scan.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNER = 'src/ui/keyboardOwnership.ts';
const KEY_TYPE = /['"]key(?:down|up|press)['"]/;
// the receivers that reach the whole page: the window and the document, and the names this checkout gives them (the
// hover tip's doc, the ending camera's win, the Studio access's keyTarget, the frame loop's inputTarget)
const GLOBAL_ADD = /\b(window|document|doc|win|globalThis|self|keyTarget|inputTarget)\s*\.\s*addEventListener\s*\(/g;
const GLOBAL_PROPERTY = /\b(?:window|document)\s*\.\s*onkey(?:down|up|press)\s*=/;
const PREDICATE = /\bisTypingTarget\s*\(/;
const MARKER = /\/\/ typing-keys: (.{12,})/;

/** The index of the bracket that closes the one at `open` (strings are not parsed: the sources are code). */
function closing(text, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  for (let at = open; at < text.length; at++) {
    const char = text[at];
    if (pairs[char]) stack.push(pairs[char]);
    else if (char === stack.at(-1)) { stack.pop(); if (!stack.length) return at; }
  }
  return text.length;
}

/** The comma-separated top-level arguments of the call whose `(` is at `open`. */
function callArgs(text, open) {
  const end = closing(text, open);
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let at = open + 1; at < end; at++) {
    const char = text[at];
    if ('({['.includes(char)) depth++;
    else if (')}]'.includes(char)) depth--;
    else if (char === ',' && depth === 0) { args.push(text.slice(start, at).trim()); start = at + 1; }
  }
  args.push(text.slice(start, end).trim());
  return args;
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length;
const linesAbove = (lines, line, count = 3) => lines.slice(Math.max(0, line - 1 - count), line - 1);
const marked = (lines, line) => linesAbove(lines, line).some((above) => MARKER.test(above));

/** Where the event-type identifier `name` gets its list: a `for (const name of …)` above, or a const array. */
function typeList(text, name, before) {
  const loops = [...text.slice(0, before).matchAll(new RegExp(`for\\s*\\(\\s*const\\s+${name}\\s+of\\s+`, 'g'))];
  const loop = loops.at(-1);
  if (loop) {
    const from = loop.index + loop[0].length;
    if (text[from] === '[') return { index: loop.index, list: text.slice(from, closing(text, from) + 1) };
    const listName = /^[\w$]+/.exec(text.slice(from))?.[0];
    if (listName) {
      const found = typeList(text, listName, before);
      return found && { ...found, via: loop.index };
    }
  }
  const declared = new RegExp(`const\\s+${name}\\s*=\\s*(?:Object\\.freeze\\(\\s*)?\\[`).exec(text);
  if (!declared) return null;
  const open = declared.index + declared[0].length - 1;
  return { index: declared.index, list: text.slice(open, closing(text, open) + 1) };
}

/** The source text of the handler `arg`: an inline function, or the named function or const nearest above `at`. */
function handlerBody(text, arg, at) {
  if (!/^[\w$]+$/.test(arg)) return arg;
  const defs = [...text.matchAll(new RegExp(`(?:function\\s+${arg}\\s*\\(|(?:const|let)\\s+${arg}\\b[^=\\n]*=)`, 'g'))];
  const def = defs.filter((match) => match.index < at).at(-1) ?? defs[0];
  if (!def) return '';
  const after = def.index + def[0].length;
  const arrow = text.indexOf('=>', after);
  const brace = text.indexOf('{', after);
  if (def[0].startsWith('function') || (brace >= 0 && (arrow < 0 || brace < arrow))) return text.slice(def.index, closing(text, brace) + 1);
  const bodyStart = arrow + 2;
  const first = text.slice(bodyStart).search(/\S/) + bodyStart;
  return text[first] === '{' ? text.slice(def.index, closing(text, first) + 1) : text.slice(def.index, text.indexOf('\n', first));
}

/** The global key listeners in one source that neither consult the predicate nor say why: [{ line, text }]. */
export function unguardedKeyListeners(text) {
  const lines = text.split('\n');
  const out = [];
  for (const match of text.matchAll(GLOBAL_ADD)) {
    const open = match.index + match[0].length - 1;
    const [type, handler] = callArgs(text, open);
    const line = lineAt(text, match.index);
    let listLine = null;
    if (!KEY_TYPE.test(type)) {
      if (!/^[\w$]+$/.test(type ?? '')) continue;
      const found = typeList(text, type, match.index);
      if (!found || !KEY_TYPE.test(found.list)) continue;
      listLine = [lineAt(text, found.index), found.via === undefined ? null : lineAt(text, found.via)];
    }
    if (marked(lines, line) || listLine?.some((at) => at && marked(lines, at))) continue;
    if (PREDICATE.test(handlerBody(text, handler ?? '', match.index))) continue;
    out.push({ line, text: lines[line - 1].trim().slice(0, 160) });
  }
  lines.forEach((source, index) => {
    if (GLOBAL_PROPERTY.test(source) && !PREDICATE.test(source) && !marked(lines, index + 1)) out.push({ line: index + 1, text: source.trim() });
  });
  return out;
}

// negative controls: the scan finds an unguarded global listener in each form, and passes the guarded and the element ones
const count = (source) => unguardedKeyListeners(source).length;
const ADD = 'addEventListener';
assert.equal(count(`window.${ADD}('keydown', (e) => { if (e.code === 'Space') brake(); });`), 1, 'an inline handler');
assert.equal(count(`const onKey = (e) => { step(e); };\nwindow.${ADD}('keydown', onKey, true);`), 1, 'a named const');
assert.equal(count(`function onKey(e) { step(e); }\ndocument.${ADD}("keyup", onKey);`), 1, 'a named function on the document');
assert.equal(count(`const onUp = (e) => release(e.code);\nwindow.${ADD}('keyup', onUp);`), 1, 'an expression-bodied arrow');
assert.equal(count(`const EVENTS = ['pointerdown', 'keydown'];\nfor (const type of EVENTS) win.${ADD}(type, skip, true);`), 1,
  'an event list through a const');
assert.equal(count(`for (const type of ['wheel', 'keypress']) window.${ADD}(type, wake);`), 1, 'an inline event list');
assert.equal(count(`window.onkeydown = (e) => step(e);`), 1, 'a handler property');
assert.equal(count(`window.${ADD}('keydown', (e) => { if (isTypingTarget(e)) return; step(e); });`), 0, 'a guarded inline handler');
assert.equal(count(`function onKey(e) { if (isTypingTarget(e)) return; step(e); }\nwindow.${ADD}('keydown', onKey);`), 0,
  'a guarded named handler');
assert.equal(count(`// typing-keys: a release only lets go of a held key\nwindow.${ADD}('keyup', onUp);`), 0, 'a marked exception');
assert.equal(count(`// typing-keys: ok\nwindow.${ADD}('keyup', onUp);`), 1, 'an exception names its reason');
assert.equal(count(`// typing-keys: wake only: any input resumes the loop\nconst EVENTS = ['keydown'];\n\n\n\n`
  + `for (const type of EVENTS) window.${ADD}(type, wake);`), 0, 'a marked event list');
assert.equal(count(`panel.${ADD}('keydown', (e) => step(e));`), 0, 'an element listener is its element\'s');
assert.equal(count(`window.${ADD}('pointerdown', (e) => step(e));`), 0, 'not a key listener');
assert.equal(count(`for (const type of ['pointerdown', 'wheel']) window.${ADD}(type, wake);`), 0, 'a list with no key');

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter((file) => /\.(?:[cm]?js|[cm]?ts|tsx)$/.test(file) && !/\.selftest\.mjs$/.test(file) && file !== OWNER);
assert.ok(files.length > 500, `the census lists the sources (${files.length})`);
const findings = [];
let listeners = 0;
for (const file of files) {
  let text;
  try { text = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; } // deleted in the working tree
  if (!KEY_TYPE.test(text) && !GLOBAL_PROPERTY.test(text)) continue;
  listeners += [...text.matchAll(GLOBAL_ADD)].length;
  for (const hit of unguardedKeyListeners(text)) findings.push(`${file}:${hit.line}: ${hit.text}`);
}
assert.deepEqual(findings, [], `a global key listener asks ${OWNER} isTypingTarget before it acts (or says why with `
  + `"// typing-keys: <reason>" above it):\n  ${findings.join('\n  ')}`);
console.log(`typing-keys-census.selftest: ${files.length} sources, ${listeners} global listeners in key-listening files, `
  + 'every key one consults isTypingTarget or names its exception');
