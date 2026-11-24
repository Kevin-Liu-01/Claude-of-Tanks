// token-references.mjs — which shared design tokens anything reads (paused-dot-276, Main 11-24: tokens.css over its
// 4 KB boot budget on tokens nothing used). Copyright © 2026 Kevin B. Liu.
//
// A token in src/ui/tokens/tokens.css is used when a tracked text file outside the token pipeline names it: a CSS
// var(--name), a TS key ('name' in tokenValue, liveToken, TOKENS, TOKEN_PX and the rest), any word that is exactly the
// name. A family a file builds its name from at runtime (`--hud-${key}`, `--fs-${size}`) counts as used whole. Then
// every token a used token's value (or a preset's override of it) reads is used too, to a fixed point.
//   node tools/token-references.mjs        list the unused tokens with the bytes each one's declarations take
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOKEN_FILES = new Set(['src/ui/tokens/tokens.json', 'src/ui/tokens/tokens.css', 'src/ui/tokens/tokens.ts',
  'src/ui/tokens/tokenSelection.ts', 'tools/gen-tokens.mjs', 'tools/token-references.mjs']);
const TEXT = /\.(?:ts|tsx|js|mjs|cjs|css|html|json|svg)$/;
const WORD = /--?[A-Za-z0-9_-]+|[A-Za-z0-9_][A-Za-z0-9_-]*/g;
const DYNAMIC = /--([a-z][a-z0-9-]*-)\$\{/g;

/** Every `--name:value` declaration in tokens.css (the root block and every preset's), as [name, value] in file order. */
export function tokenDeclarations(css) {
  const out = [];
  for (const m of css.matchAll(/--([a-z][a-z0-9-]*):([^;{}]*)/g)) out.push([m[1], m[2]]);
  return out;
}

/** { used: Set, unused: string[] } of tokens.css's tokens, from the files `git ls-files` tracks under root. */
export function tokenReferences(root = ROOT) {
  const css = readFileSync(join(root, 'src/ui/tokens/tokens.css'), 'utf8');
  const declarations = tokenDeclarations(css);
  const names = [...new Set(declarations.map(([name]) => name))];
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0')
    .filter((file) => TEXT.test(file) && !TOKEN_FILES.has(file) && !file.startsWith('docs/') && !file.startsWith('release/')
      && !file.includes('/fixtures/') && !file.startsWith('public/') && !file.startsWith('assets/'));
  const words = new Set(), prefixes = new Set();
  for (const file of files) {
    let text;
    try { text = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    if (text.length > 4_000_000) continue; // generated data (catalogues, manifests) names no token
    for (const [word] of text.matchAll(WORD)) words.add(word.replace(/^--?/, ''));
    for (const [, prefix] of text.matchAll(DYNAMIC)) prefixes.add(prefix);
  }
  const used = new Set(names.filter((name) => words.has(name) || [...prefixes].some((p) => name.startsWith(p))));
  const reads = new Map(names.map((name) => [name, new Set()]));
  for (const [name, value] of declarations) for (const m of value.matchAll(/var\(--([a-z][a-z0-9-]*)/g)) reads.get(name)?.add(m[1]);
  for (let grew = true; grew;) {
    grew = false;
    for (const name of [...used]) for (const read of reads.get(name) ?? []) if (!used.has(read)) { used.add(read); grew = true; }
  }
  return { used, unused: names.filter((name) => !used.has(name)), declarations };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { unused, declarations } = tokenReferences();
  let total = 0;
  for (const name of unused) {
    const bytes = declarations.filter(([n]) => n === name).reduce((sum, [n, v]) => sum + n.length + v.length + 4, 0);
    total += bytes;
    console.log(`${String(bytes).padStart(5)}  --${name}`);
  }
  console.log(`${unused.length} unused tokens, ${total} B of declarations`);
}
