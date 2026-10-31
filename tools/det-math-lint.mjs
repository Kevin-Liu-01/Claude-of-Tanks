#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// The authoritative simulation computes on src/sim/detMath.ts, never on an engine's own transcendentals (the
// coordinator's 2026-10-25 ruling: Math.sin and its kin return different last bits on different engines and OSes, so a
// match re-simulated elsewhere drifted). Walks the authority's static import graph — every module reachable from the
// shared authority and the dedicated server's world — and fails on any native transcendental (called, referenced or
// destructured) and on any `**` whose exponent is not the literal 2 (fdlibm and every libm return the correctly rounded
// square; any other exponent goes to the platform's pow). Rendering, effects, audio and UI are outside the graph and
// keep Math.*.
//
//   node tools/det-math-lint.mjs            # report and exit 1 on any finding
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AUTHORITY_ENTRIES = Object.freeze(['src/sim/authoritativeMatch.ts', 'server/dedicatedWorldCollision.ts']);
const NATIVE = /\bMath\.(sin|cos|tan|asin|acos|atan2|atan|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b/;
const DESTRUCTURED = /\{[^}]*\b(sin|cos|tan|atan2|hypot|pow|exp|log)\b[^}]*\}\s*=\s*Math\b/;
const EXPONENT = /\*\*\s*(?!2\b)[^\s=]/;

/** The authority's static import graph (relative imports of src/ and server/; type-only imports are not code). */
export function authorityModules(root = ROOT, entries = AUTHORITY_ENTRIES) {
  const seen = new Set();
  const queue = entries.map((entry) => path.resolve(root, entry));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
      if (/^(import|export)\s+type\b/.test(match[0]) || !match[1].startsWith('.')) continue;
      let target = path.resolve(path.dirname(file), match[1]);
      if (!existsSync(target) && existsSync(`${target}.ts`)) target = `${target}.ts`;
      if (!target.endsWith('.json')) queue.push(target);
    }
  }
  return [...seen].sort();
}

/** The lines of one module's source that call a native transcendental or a non-square exponent: [{ line, text }]. */
export function sourceFindings(source) {
  // code only: block comments become their newlines (line numbers hold), line comments go (a comment naming
  // Math.sin, or a doc comment's opening, is not a call)
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' ')).split('\n');
  const lines = source.split('\n');
  const findings = [];
  code.forEach((raw, index) => {
    const line = raw.replace(/(^|[^:'"`])\/\/.*$/, '$1');
    if (NATIVE.test(line) || DESTRUCTURED.test(line) || EXPONENT.test(line)) findings.push({ line: index + 1, text: lines[index].trim().slice(0, 160) });
  });
  return findings;
}

// (267) Presentation stays out of the graph: the vehicle marking modules (their canvas insignia painters and the UI's
// flag codes) came in once through the spec registry's marking record, which the authority never read, and detMath
// policed their paint. A listed module, or any vehicle module that paints on a canvas, fails the lint.
export const PRESENTATION_MODULES = Object.freeze(['src/vehicles/vehicleMarkings.ts', 'src/vehicles/vehicleMarkingSeatRegistry.ts', 'src/ui/flagCodes.ts']);
const CANVAS = /\bCanvasRenderingContext2D\b|getContext\(\s*['"]2d['"]/;

/** The presentation in the graph: [{ file, reason }]. */
export function presentationFindings(root = ROOT, entries = AUTHORITY_ENTRIES) {
  return authorityModules(root, entries).map((file) => path.relative(root, file)).flatMap((file) => {
    if (PRESENTATION_MODULES.includes(file)) return [{ file, reason: 'a vehicle presentation module' }];
    if (file.startsWith('src/vehicles/') && CANVAS.test(readFileSync(path.join(root, file), 'utf8'))) return [{ file, reason: 'a vehicle canvas painter' }];
    return [];
  });
}

/** Every native transcendental and non-square exponent in the graph: [{ file, line, text }]. */
export function detMathFindings(root = ROOT) {
  const detMath = path.resolve(root, 'src/sim/detMath.ts');
  return authorityModules(root).filter((file) => file !== detMath && file.endsWith('.ts'))
    .flatMap((file) => sourceFindings(readFileSync(file, 'utf8')).map((f) => ({ file: path.relative(root, file), ...f })));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const modules = authorityModules();
  const findings = detMathFindings();
  const presentation = presentationFindings();
  for (const f of findings) console.error(`${f.file}:${f.line}: ${f.text}`);
  for (const f of presentation) console.error(`${f.file}: ${f.reason} in the authority graph`);
  console.log(`det-math-lint: ${modules.length} authority modules, ${findings.length} native transcendental(s) or non-square exponent(s), ${presentation.length} presentation module(s)`);
  process.exitCode = findings.length || presentation.length ? 1 : 0;
}
