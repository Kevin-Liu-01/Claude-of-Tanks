#!/usr/bin/env node
// tools/i18n-literal-lint.mjs — the literal-ban lint (BUI-F8, SPEC 15): player-facing English must come from the
// catalogs, never from a string literal in code.
//
// Scope: src/ui/** and src/gallery/** (TypeScript and CSS), the Studio owners (src/game/studio*.ts, whose thrown
// messages reach the player), the kill cam (src/game/killcam.ts), and every CSS `content:` string under src/.
// A literal counts when it reaches a player-facing sink and carries a Latin word outside the allowlist:
//   - DOM text: `.textContent|.innerText|.innerHTML|.outerHTML|.title|.placeholder|.ariaLabel|.alt|.label = …`
//     (through `+`, `?:`, `??`, `||` and template spans);
//   - accessible names: `setAttribute('aria-label'|'title'|'placeholder'|'alt'|'aria-description'|'aria-valuetext'|
//     'aria-roledescription', …)`;
//   - markup in any string or template: text between tags and those attributes' literal values;
//   - canvas text: `fillText(…)` / `strokeText(…)`;
//   - Studio throws: `new Error(…)` in the Studio owners;
//   - CSS: `content: '…'` in stylesheets and in CSS held in strings.
// Proper names, units, single letters and Roman numerals pass (ALLOW below); `${…}` values are data, not literals.
//
// A ratchet: tools/i18n-literal-lint.baseline.json pins each file's count. --check fails when a file rises above its
// pin (a new literal) and when a pin sits above its file (a fixed literal: lower the pin with --update, so the
// baseline only falls). --update lowers pins and never raises one.
//
//   node tools/i18n-literal-lint.mjs            report (every finding)
//   node tools/i18n-literal-lint.mjs --check    the ratchet
//   node tools/i18n-literal-lint.mjs --update   lower the baseline to the current counts
//   node tools/i18n-literal-lint.mjs --json     findings as JSON
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'tools/i18n-literal-lint.baseline.json');
const ts = createRequire(import.meta.url)('typescript');

const DOM_TEXT_PROPS = new Set(['textContent', 'innerText', 'innerHTML', 'outerHTML', 'title', 'placeholder', 'ariaLabel', 'alt', 'label']);
const USER_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'aria-valuetext', 'aria-roledescription']);
const MARKUP_ATTR = /\s(aria-label|title|placeholder|alt|aria-description|aria-valuetext|aria-roledescription)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Tokens that are not English copy: units, proper names the product keeps in every locale, numerals. */
const ALLOW = new Set([
  // units and symbols
  'mm', 'cm', 'm', 'km', 'kg', 't', 's', 'ms', 'min', 'h', 'hz', 'fps', 'px', 'db', 'rpm', 'hp', 'kw', 'kn', 'km/h', 'm/s',
  'hp/t', 'x', 'g', 'mps', 'kph', 'mph', 'eff',
  // proper names and marks kept in zh-CN as well
  'claude', 'tanks', 'github', 'three.js', 'threejs', 'webgl', 'webgpu', 'webrtc', 'vite', 'vercel', 'kevin', 'liu', 'codex',
  'reddit', 'discord', 'json', 'hud', 'gpu', 'cpu', 'ac-130', 'fpv', 'ios', 'android', 'chrome', 'safari', 'firefox',
  'url', 'id', 'png', 'jpg', 'webp', 'mp4', 'webm', 'svg', 'glb', 'b.', 'esc', 'shift', 'ctrl', 'alt', 'tab', 'enter',
  'space', 'wasd', 'lmb', 'rmb', 'mmb', 'ok', 'en',
]);
/** Brand phrases and code-shaped tokens removed before words are read. */
const NOT_COPY = [
  /claude\s+of\s+tanks/gi, /\bof\s+tanks\b/gi, // the wordmark (split across spans in the shell)
  /\bAC-130\b/g, // a mode name in every locale
  /\b[A-Za-z]*\d[A-Za-z0-9]*\b/g, // codes with digits: ABC123, G-01's 01, T-90M, 4K
];
const ROMAN = /^(?=[IVXL])L?X{0,3}(IX|IV|V?I{0,3})$/;

/** The English words in a piece of copy that the allowlist does not cover (empty when it is not English copy). */
export function englishWords(text) {
  let clean = String(text);
  for (const pattern of NOT_COPY) clean = clean.replace(pattern, ' ');
  clean = clean
    .replace(/\u0000/g, ' ')
    .replace(/&[#\w]+;/g, ' ')
    .replace(/\b[a-z0-9]+(?:[-_][a-z0-9]+)+\b/g, ' ') // kebab or snake identifiers (class names, ids)
    .replace(/\b[a-z]+[A-Z]\w*\b/g, ' '); // camelCase identifiers
  const words = clean.match(/[A-Za-z][A-Za-z'’.\/-]*[A-Za-z]|[A-Za-z]/g) ?? [];
  return words.filter((word) => {
    const lower = word.toLowerCase().replace(/[.'’]+$/, '');
    if (word.length === 1 || ALLOW.has(lower) || ROMAN.test(word)) return false;
    return true;
  });
}

const isLeak = (text) => englishWords(text).length > 0;

/** Code held in a string (CSS rules, GLSL), never copy. */
const looksLikeCode = (text) => /[{}]|;\s*[a-z-]+\s*:|#include|#ifdef|#define|\bvec[234]\b|\bgl_\w|\buniform\b/.test(text);
/** An attribute run such as ` class="x" aria-expanded="false"` (a piece of a tag split across literals). */
const ATTRIBUTE_RUN = /^\s*(?:[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?\s*)*\/?\s*$/;

/**
 * Copy inside a markup string or a fragment of one (`\u0000` marks a `${…}` hole): text between tags and the literal
 * values of user-facing attributes. A fragment may open inside a tag (`title="…">Label`) or end inside one.
 */
export function markupCopy(markup) {
  const out = [];
  for (const match of markup.matchAll(MARKUP_ATTR)) {
    const value = match[2] ?? match[3] ?? '';
    if (value.replace(/\u0000/g, '').trim()) out.push(value);
  }
  let rest = markup.replace(/<!--[\s\S]*?-->/g, '').replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '');
  const firstLt = rest.indexOf('<');
  const firstGt = rest.indexOf('>');
  if (firstGt >= 0 && (firstLt < 0 || firstGt < firstLt) && ATTRIBUTE_RUN.test(rest.slice(0, firstGt).replace(/\u0000/g, 'x'))) {
    rest = rest.slice(firstGt + 1); // opened inside a tag
  }
  const lastLt = rest.lastIndexOf('<');
  if (lastLt > rest.lastIndexOf('>')) rest = rest.slice(0, lastLt); // ends inside a tag
  if (!/[<>]/.test(rest) && ATTRIBUTE_RUN.test(rest.replace(/\u0000/g, 'x')) && /=/.test(rest)) return out;
  for (const segment of rest.split(/<[^<>]*>/)) {
    if (segment.replace(/\u0000/g, '').trim() && !looksLikeCode(segment)) out.push(segment);
  }
  return out;
}

const looksLikeMarkup = (text) => /<\/?[a-z][\w-]*(?:[\s/>]|$)/i.test(text) || /^[^<]*\s[\w-]+\s*=\s*["']/.test(text) || /^\s*[\w-]+\s*=\s*["']/.test(text);
const cssContentStrings = (css) => [...css.matchAll(/content\s*:\s*([^;}]*)/g)]
  .flatMap((match) => [...match[1].matchAll(/(['"])((?:(?!\1).)*)\1/g)].map((part) => part[2]));

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => `\u0000${span.literal.text}`).join('');
  return null;
}

/** Walk up through value-forwarding expressions to the expression whose value reaches a sink. */
function forwardedRoot(node) {
  let at = node;
  for (;;) {
    const parent = at.parent;
    if (!parent) return at;
    if (ts.isParenthesizedExpression(parent) || ts.isTemplateSpan(parent) || ts.isAsExpression(parent)) { at = parent; continue; }
    if (ts.isTemplateExpression(parent)) { at = parent; continue; }
    if (ts.isConditionalExpression(parent) && (parent.whenTrue === at || parent.whenFalse === at)) { at = parent; continue; }
    if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken]
      .includes(parent.operatorToken.kind)) { at = parent; continue; }
    return at;
  }
}

function sinkOf(node, studio) {
  const root = forwardedRoot(node);
  const parent = root.parent;
  if (!parent) return null;
  if (ts.isBinaryExpression(parent) && parent.right === root && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && ts.isPropertyAccessExpression(parent.left) && DOM_TEXT_PROPS.has(parent.left.name.text)) return `.${parent.left.name.text}`;
  if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
    const method = parent.expression.name.text;
    const args = parent.arguments;
    if (method === 'setAttribute' && args[1] === root && args[0] && ts.isStringLiteral(args[0]) && USER_ATTRS.has(args[0].text)) {
      return `setAttribute(${args[0].text})`;
    }
    if ((method === 'fillText' || method === 'strokeText') && args[0] === root) return method;
  }
  if (studio && ts.isNewExpression(parent) && ts.isIdentifier(parent.expression) && /Error$/.test(parent.expression.text)) {
    return 'new Error';
  }
  return null;
}

/**
 * Findings in one TypeScript source.
 * @param {string} file repo-relative path
 * @param {string} source
 * @param {{ studio?: boolean }} options
 */
export function lintTypeScript(file, source, { studio = false } = {}) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const findings = [];
  const add = (node, kind, text) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    findings.push({ file, line: line + 1, kind, text: text.replace(/\u0000/g, '${…}').replace(/\s+/g, ' ').trim().slice(0, 120) });
  };
  const visit = (node) => {
    const text = literalText(node);
    // a template span's literal pieces are visited through their TemplateExpression
    if (text != null && !(ts.isTemplateExpression(node.parent ?? {}) )) {
      const inImportOrType = ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)
        || ts.isLiteralTypeNode(node.parent) || ts.isExternalModuleReference(node.parent);
      if (!inImportOrType) {
        const sink = sinkOf(node, studio);
        if (looksLikeCode(text) && !sink) { /* CSS or GLSL held in a string: only its content: strings below */ }
        else if (looksLikeMarkup(text)) {
          for (const copy of markupCopy(text)) if (isLeak(copy)) add(node, 'markup', copy);
        } else if (sink && isLeak(text)) add(node, sink, text);
        for (const content of cssContentStrings(text)) if (isLeak(content)) add(node, 'css content', content);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/** Findings in one stylesheet (CSS `content:` strings). */
export function lintCss(file, css) {
  const findings = [];
  const lines = css.split('\n');
  lines.forEach((lineText, index) => {
    for (const content of cssContentStrings(lineText)) {
      if (isLeak(content)) findings.push({ file, line: index + 1, kind: 'css content', text: content.slice(0, 120) });
    }
  });
  return findings;
}

function walk(dir, accept, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, accept, out);
    else if (accept(entry.name, full)) out.push(full);
  }
  return out;
}

const isSource = (name) => name.endsWith('.ts') && !name.endsWith('.d.ts') && !/\.selftest\.|\.test\./.test(name);

/** Every file in scope with how to lint it. */
export function scopeFiles(root = ROOT) {
  const files = new Map();
  for (const dir of ['src/ui', 'src/gallery']) {
    for (const full of walk(join(root, dir), isSource)) files.set(full, { kind: 'ts' });
  }
  for (const full of walk(join(root, 'src/game'), (name) => isSource(name) && (/^studio/.test(name) || name === 'killcam.ts'))) {
    files.set(full, { kind: 'ts', studio: /^studio/.test(full.split('/').pop()) });
  }
  for (const full of walk(join(root, 'src'), (name) => name.endsWith('.css'))) files.set(full, { kind: 'css' });
  return files;
}

/** All findings across the scope, sorted by file and line. */
export function lintRepository(root = ROOT) {
  const findings = [];
  for (const [full, { kind, studio }] of scopeFiles(root)) {
    const file = relative(root, full);
    const source = readFileSync(full, 'utf8');
    findings.push(...(kind === 'css' ? lintCss(file, source) : lintTypeScript(file, source, { studio })));
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Per-file counts. */
export function countByFile(findings) {
  const counts = {};
  for (const { file } of findings) counts[file] = (counts[file] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * The ratchet: files above their pin (new literals) and pins above their file (stale: the baseline must fall).
 * @param {Record<string, number>} baseline
 * @param {Record<string, number>} counts
 */
export function ratchet(baseline, counts) {
  const rises = [];
  const stale = [];
  for (const [file, count] of Object.entries(counts)) {
    const pinned = baseline[file] ?? 0;
    if (count > pinned) rises.push(`${file}: ${count} literal(s), pinned at ${pinned}`);
  }
  for (const [file, pinned] of Object.entries(baseline)) {
    const count = counts[file] ?? 0;
    if (count < pinned) stale.push(`${file}: pinned at ${pinned}, now ${count}`);
  }
  return { rises, stale };
}

const readBaseline = () => (existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : { files: {} });

function writeBaseline(files) {
  const total = Object.values(files).reduce((sum, n) => sum + n, 0);
  writeFileSync(BASELINE_PATH, `${JSON.stringify({
    $description: 'Ratchet for tools/i18n-literal-lint.mjs (BUI-F8): player-facing English literals per file. It only falls: '
      + 'fix literals, then run node tools/i18n-literal-lint.mjs --update. --check fails on any rise and on any stale pin.',
    total,
    files,
  }, null, 2)}\n`);
  return total;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = lintRepository();
  const counts = countByFile(findings);
  const args = new Set(process.argv.slice(2));
  if (args.has('--json')) {
    console.log(JSON.stringify(findings, null, 2));
  } else if (args.has('--update')) {
    const baseline = readBaseline().files ?? {};
    const first = !existsSync(BASELINE_PATH) || args.has('--init');
    const { rises } = ratchet(baseline, counts);
    if (rises.length && !first) {
      console.error(`i18n-literal-lint: refusing to raise the baseline (it only falls):\n  ${rises.join('\n  ')}`);
      process.exit(1);
    }
    const next = first ? counts : Object.fromEntries(Object.entries(counts).map(([file, n]) => [file, Math.min(n, baseline[file] ?? n)]));
    const total = writeBaseline(Object.fromEntries(Object.entries(next).filter(([, n]) => n > 0)));
    console.log(`i18n-literal-lint: baseline ${first ? 'written' : 'lowered'}: ${total} literal(s) across ${Object.keys(next).length} file(s)`);
  } else if (args.has('--check')) {
    const baseline = readBaseline();
    const { rises, stale } = ratchet(baseline.files ?? {}, counts);
    if (rises.length) {
      const byFile = new Map();
      for (const finding of findings) if (rises.some((line) => line.startsWith(`${finding.file}:`))) {
        if (!byFile.has(finding.file)) byFile.set(finding.file, []);
        byFile.get(finding.file).push(`${finding.file}:${finding.line} ${finding.kind}: ${finding.text}`);
      }
      console.error(`i18n-literal-lint: player-facing English literals rose (move them into the catalogs and read them with t()):\n  ${rises.join('\n  ')}\n  ${[...byFile.values()].flat().join('\n  ')}`);
    }
    if (stale.length) console.error(`i18n-literal-lint: the baseline only falls; lower it with node tools/i18n-literal-lint.mjs --update:\n  ${stale.join('\n  ')}`);
    if (rises.length || stale.length) process.exit(1);
    console.log(`i18n-literal-lint: ${findings.length} literal(s) across ${Object.keys(counts).length} file(s), at the baseline (${baseline.total})`);
  } else {
    for (const finding of findings) console.log(`${finding.file}:${finding.line} ${finding.kind}: ${finding.text}`);
    console.log(`i18n-literal-lint: ${findings.length} literal(s) across ${Object.keys(counts).length} file(s)`);
  }
}
