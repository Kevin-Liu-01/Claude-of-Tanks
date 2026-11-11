// code-text.mjs — a source file's code with its comments blanked, for the censuses that read tools as text
// (2026-11-02 audit S3).
//
// The censuses used a regex stripper that took `/*` inside a string for a comment: vite's `watch: { ignored: ['**/*'] }`
// erased everything up to the next `*/`, and the waits behind it fell out of the census. This one asks TypeScript's
// parser where the tokens are: every leaf token's leading trivia (the text between its full start and its start) is
// whitespace and comments only, so blanking it removes every comment and nothing else. Strings, template literals and
// regular expression literals are tokens and stay whole. Comments become spaces (newlines kept), so line numbers and
// offsets match the source.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/** `text` with every comment replaced by spaces (newlines kept). `fileName` picks the dialect (.ts is TypeScript). */
export function codeText(text, fileName = 'source.mjs') {
  const kind = /\.[cm]?tsx?$/.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, kind);
  const out = text.split('');
  const blank = (from, to) => { for (let i = from; i < to; i += 1) if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' '; };
  const visit = (node) => {
    // a JSDoc node is a comment the next real token's trivia also covers
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(source);
    if (!children.length) { blank(node.pos, node.getStart(source)); return; }
    for (const child of children) visit(child);
  };
  visit(source);
  return out.join('');
}

/**
 * The tools the censuses read (paths relative to `root`): every source under tools/ except node_modules and dot
 * folders, and of the selftests only those that drive a page (they launch a browser), as a harness does.
 */
export function toolCensusFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(root, dir))) {
      const file = `${dir}/${name}`;
      if (statSync(join(root, file)).isDirectory()) { if (name !== 'node_modules' && !name.startsWith('.')) walk(file); continue; }
      if (!/\.(?:mjs|js|cjs|ts)$/.test(name) || /\.test-support\.mjs$/.test(name)) continue;
      if (/\.selftest\.mjs$/.test(name) && !/\blaunchGuardedBrowser\s*\(/.test(readFileSync(join(root, file), 'utf8'))) continue;
      files.push(file);
    }
  };
  walk('tools');
  return files.sort();
}
