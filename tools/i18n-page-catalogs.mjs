#!/usr/bin/env node
// i18n-page-catalogs.mjs — the translation keys each public page can show, read from its own code and markup.
//
// Every HTML entry declares the catalog it loads: `<meta name="cot-i18n-catalog" content="home">`. The game
// (index.html) declares `game`, the full catalogs. Pages that declare the same page catalog share it (the twelve
// manual topics and their fallback run one module graph). A page catalog holds every catalog key that its
// pages' module scripts, and everything those import statically, can reach, plus the pages' data-i18n markup. A
// literal import() whose target the page does not reach statically is a lazy boundary (2026-10-08, the perf lane):
// the keys only the lazy graphs reach are the page's lazy chunk, which the build loads before the module at every
// import() of a lazy boundary (src/ui/i18nDictionaries.ts loadLazyCatalog), so the page's boot catalog carries only
// what its boot graph can show. tools/viteI18nPageCatalogs.ts builds a boot and a lazy chunk per page catalog and
// locale from this scan, and the i18n runtime loads the chunks its document names.
//
// A use is an over-approximation; any key the code may hand to t() stays in the catalog:
//   - a string literal equal to a key, anywhere in a reached module (key tables, conditionals, defaults);
//   - a literal ending in '.' that prefixes keys ('docs.topic.' + slug);
//   - a template literal whose leading text is a key namespace (`docs.guide.${slug}.${i}.t`);
//   - a data-i18n attribute in a page's HTML or inside a string or template literal;
//   - a string value equal to a key in an imported JSON module.
// An issue is a way for a page to show a raw key; it fails the build and tools/i18n-page-catalogs.selftest.mjs:
//   - a t() or catalogText() key that is a template or concatenation without a leading key namespace;
//   - a literal key, data-i18n key or key pattern that the catalog does not hold;
//   - an import() with a computed specifier, or import.meta.glob, in a page's graph (the scan cannot follow it);
//   - a module re-exporting t or catalogText (calls through the re-export could not be audited);
//   - an HTML entry without a catalog, a malformed catalog name, or `game` on a page other than the game.
// Keys handed to t() as plain values (`t(row.labelKey)`, a translate callback) must be spelled as literals
// somewhere in the page's graph, which the first rule then keeps.
//
//   node tools/i18n-page-catalogs.mjs           keys and English bytes per catalog
//   node tools/i18n-page-catalogs.mjs --check   exit 1 on any issue
//   node tools/i18n-page-catalogs.mjs --json    the full scan
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAst } from 'rolldown/parseAst';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The meta naming the catalog an HTML document loads. */
export const PAGE_CATALOG_META = 'cot-i18n-catalog';
/** The catalog name of the full catalogs (the game). */
export const FULL_CATALOG = 'game';
const CATALOG_NAME_RE = /^[a-z][A-Za-z0-9]*$/;
// Runtime modules whose `t` / `catalogText` take a key; catalogText takes the locale first.
const I18N_MODULES = new Set(['src/ui/i18n.ts', 'src/ui/i18nDictionaries.ts', 'src/ui/i18nCatalog.ts']);
const KEY_ARGUMENT = Object.freeze({ t: 0, catalogText: 1 });
// The catalogs themselves: data, not consumers. The scan neither reads nor follows them, and the registry's
// import of the chunk a document names (a computed specifier) loads one of them.
const CATALOG_MODULE_RE = /^src\/ui\/i18nCatalog(?:\.[a-zA-Z-]+\.json|EnUS\.ts|ZhCN\.ts)$/;
const CATALOG_LOADER = 'src/ui/i18nDictionaries.ts';
const SCRIPT_RE = /\.(?:[cm]?[jt]s)$/;
const NAMESPACE_RE = /^[A-Za-z][\w-]*\./;
const PREFIX_LITERAL_RE = /^[A-Za-z][\w-]*(?:\.[\w-]+)*\.$/;
const DATA_I18N_RE = /\bdata-i18n(?:-[a-z-]+)?\s*=\s*(["'])([^"'<>{}$`\s]+)\1/g;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toPosix = (path) => path.split(sep).join('/');
const withoutComments = (html) => String(html).replace(/<!--[\s\S]*?-->/g, '');

function htmlAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)) {
    attributes[match[1].toLowerCase()] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
  return attributes;
}

/** The catalog an HTML document declares, or null. */
export function documentCatalog(html) {
  for (const [tag] of withoutComments(html).matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = htmlAttributes(tag);
    if (attributes.name === PAGE_CATALOG_META) return attributes.content ?? '';
  }
  return null;
}

/** The project modules a source HTML document runs as module scripts (`/src/x.ts` -> `src/x.ts`). */
export function htmlModuleScripts(html) {
  const scripts = [];
  for (const [tag] of withoutComments(html).matchAll(/<script\b[^>]*>/gi)) {
    const attributes = htmlAttributes(tag);
    const src = attributes.type === 'module' ? String(attributes.src || '').split(/[?#]/, 1)[0] : '';
    if (src.startsWith('/') && !src.startsWith('//')) scripts.push(src.slice(1));
  }
  return scripts;
}

/** Every data-i18n key of a markup string, in order. */
export function markupKeys(text) {
  return [...String(text).matchAll(DATA_I18N_RE)].map((match) => match[2]);
}

function walk(node, enter, leave) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, enter, leave);
    return;
  }
  if (typeof node.type !== 'string') return;
  enter(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (value && typeof value === 'object') walk(value, enter, leave);
  }
  leave(node);
}

function patternNames(pattern, out = []) {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.push(pattern.name);
  else if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, out);
  else if (pattern.type === 'RestElement') patternNames(pattern.argument, out);
  else if (pattern.type === 'ArrayPattern') for (const element of pattern.elements) patternNames(element, out);
  else if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) patternNames(property.type === 'RestElement' ? property : property.value, out);
  } else if (pattern.type === 'TSParameterProperty') patternNames(pattern.parameter, out);
  return out;
}

/** Names a scope-opening node declares for its own body: enough to see a local `t` shadow the import. */
function scopeDeclarations(node) {
  const names = [];
  const declareStatements = (statements) => {
    for (const statement of statements ?? []) {
      const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
      if (declaration?.type === 'VariableDeclaration') {
        for (const declarator of declaration.declarations) patternNames(declarator.id, names);
      } else if ((declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') && declaration.id) {
        names.push(declaration.id.name);
      }
    }
  };
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    for (const param of node.params) patternNames(param, names);
    if (node.type === 'FunctionExpression' && node.id) names.push(node.id.name);
    if (node.body?.type === 'BlockStatement') declareStatements(node.body.body);
  } else if (node.type === 'BlockStatement' || node.type === 'StaticBlock') {
    declareStatements(node.body);
  } else if (node.type === 'CatchClause') {
    patternNames(node.param, names);
  } else if (node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
    const init = node.type === 'ForStatement' ? node.init : node.left;
    if (init?.type === 'VariableDeclaration') for (const declarator of init.declarations) patternNames(declarator.id, names);
  }
  return names;
}

function lineOf(source, offset) {
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index++) if (source.charCodeAt(index) === 10) line++;
  return line;
}

/** Whether an analysed module also imports a specifier statically (it counts once in `imports` per occurrence). */
function staticallyImports(result, specifier) {
  let all = 0, dynamic = 0;
  for (const s of result.imports) if (s === specifier) all++;
  for (const s of result.dynamicImports) if (s === specifier) dynamic++;
  return all > dynamic;
}

function resolveSpecifier(fromFile, specifier) {
  const path = resolve(dirname(fromFile), specifier.split(/[?#]/, 1)[0]);
  if (existsSync(path)) return path;
  if (path.endsWith('.js') && existsSync(`${path.slice(0, -3)}.ts`)) return `${path.slice(0, -3)}.ts`;
  for (const candidate of [`${path}.ts`, resolve(path, 'index.ts')]) if (existsSync(candidate)) return candidate;
  return null;
}

const keySets = new WeakMap();
function keyIndex(keys) {
  let index = keySets.get(keys);
  if (!index) {
    index = { list: keys, set: new Set(keys) };
    keySets.set(keys, index);
  }
  return index;
}

/**
 * One source module's relative imports (static and literal import() targets), key uses and issues.
 * `file` is project-relative to `root`; `keys` the English catalog keys (an array, reused across calls).
 * Returns { imports, dynamicImports, exact: Set, prefixes: Set, patterns: RegExp[], issues: string[] }: `imports` every
 * relative specifier, `dynamicImports` those of them a literal import() names.
 */
export function analyzeModuleSource(source, file, { root = ROOT, keys }) {
  const { list: keyList, set: keySet } = keyIndex(keys);
  const result = { imports: [], dynamicImports: [], exact: new Set(), prefixes: new Set(), patterns: [], issues: [] };
  const at = (node) => `${file}:${lineOf(source, node.start)}`;
  const snippet = (node) => source.slice(node.start, node.end).replace(/\s+/g, ' ').slice(0, 96);
  const matchesAny = (regex) => keyList.some((key) => regex.test(key));
  const program = parseAst(String(source), { lang: file.endsWith('.ts') ? 'ts' : 'js' }, file);
  const moduleDir = dirname(resolve(root, file));
  const isI18nSpecifier = (specifier) => typeof specifier === 'string' && specifier.startsWith('.')
    && I18N_MODULES.has(toPosix(relative(root, resolve(moduleDir, specifier.split(/[?#]/, 1)[0]))).replace(/\.js$/, '.ts'));
  const addImport = (specifier) => {
    if (typeof specifier === 'string' && (specifier.startsWith('./') || specifier.startsWith('../'))) result.imports.push(specifier);
  };

  // Local names of the runtime's key-taking functions, and namespace imports of the runtime.
  const bound = new Map();
  const namespaces = new Set();
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration' && node.importKind !== 'type') {
      addImport(node.source.value);
      if (!isI18nSpecifier(node.source.value)) continue;
      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') namespaces.add(specifier.local.name);
        else if (specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type') {
          const imported = specifier.imported.name ?? specifier.imported.value;
          if (Object.hasOwn(KEY_ARGUMENT, imported)) bound.set(specifier.local.name, KEY_ARGUMENT[imported]);
        }
      }
    } else if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration')
      && node.source && node.exportKind !== 'type') {
      addImport(node.source.value);
      if (isI18nSpecifier(node.source.value) && (node.type === 'ExportAllDeclaration'
        || node.specifiers.some((specifier) => Object.hasOwn(KEY_ARGUMENT, specifier.local.name ?? specifier.local.value)))) {
        result.issues.push(`${at(node)}: re-exports the i18n runtime's key functions (${snippet(node)}); import t from src/ui/i18n.ts instead`);
      }
    }
  }

  const useMarkup = (text, node) => {
    for (const key of markupKeys(text)) {
      if (keySet.has(key)) result.exact.add(key);
      else result.issues.push(`${at(node)}: markup names data-i18n="${key}", which the catalog does not hold`);
    }
  };
  const templatePattern = (quasis) => (NAMESPACE_RE.test(quasis[0])
    ? new RegExp(`^${quasis.map(escapeRegExp).join('.+')}$`) : null);

  // The key specs of a t() argument: exact keys, patterns, unbounded builds, or indirect values (spelled elsewhere).
  const keySpecs = (node) => {
    switch (node.type) {
      case 'Literal':
        return typeof node.value === 'string' ? [{ kind: 'exact', value: node.value }] : [];
      case 'TemplateLiteral': {
        const quasis = node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw);
        if (!node.expressions.length) return [{ kind: 'exact', value: quasis[0] }];
        const regex = templatePattern(quasis);
        return [regex ? { kind: 'pattern', regex } : { kind: 'unbounded' }];
      }
      case 'BinaryExpression': {
        if (node.operator !== '+') return [];
        const parts = [];
        const flatten = (part) => {
          if (part.type === 'BinaryExpression' && part.operator === '+') {
            flatten(part.left);
            flatten(part.right);
          } else parts.push(part);
        };
        flatten(node);
        const text = (part) => (part.type === 'Literal' && typeof part.value === 'string' ? part.value
          : part.type === 'TemplateLiteral' && !part.expressions.length ? part.quasis[0].value.cooked : null);
        const lead = text(parts[0]);
        if (lead === null || !NAMESPACE_RE.test(lead)) return [{ kind: 'unbounded' }];
        return [{ kind: 'pattern', regex: new RegExp(`^${parts.map((part) => {
          const literal = text(part);
          return literal === null ? '.+' : escapeRegExp(literal);
        }).join('')}$`) }];
      }
      case 'ConditionalExpression':
        return [...keySpecs(node.consequent), ...keySpecs(node.alternate)];
      case 'LogicalExpression':
        return [...keySpecs(node.left), ...keySpecs(node.right)];
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
        return keySpecs(node.expression);
      default:
        return [{ kind: 'indirect' }];
    }
  };

  const keyArgument = (callee, shadowed) => {
    if (callee.type === 'Identifier' && bound.has(callee.name) && !shadowed(callee.name)) return bound.get(callee.name);
    if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier'
      && namespaces.has(callee.object.name) && !shadowed(callee.object.name)
      && Object.hasOwn(KEY_ARGUMENT, callee.property.name)) return KEY_ARGUMENT[callee.property.name];
    return null;
  };

  const scopes = [];
  const shadowed = (name) => scopes.some((names) => names.includes(name));
  walk(program, (node) => {
    scopes.push(node === program ? [] : scopeDeclarations(node));
    if (node.type === 'Literal' && typeof node.value === 'string') {
      if (keySet.has(node.value)) result.exact.add(node.value);
      else if (PREFIX_LITERAL_RE.test(node.value) && keyList.some((key) => key.startsWith(node.value))) result.prefixes.add(node.value);
      useMarkup(node.value, node);
    } else if (node.type === 'TemplateLiteral') {
      const quasis = node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? '');
      for (const quasi of quasis) useMarkup(quasi, node);
      if (!node.expressions.length) {
        if (keySet.has(quasis[0])) result.exact.add(quasis[0]);
      } else {
        const regex = templatePattern(quasis);
        if (regex && matchesAny(regex)) result.patterns.push(regex);
      }
    } else if (node.type === 'ImportExpression') {
      const specifier = node.source;
      const literal = specifier.type === 'Literal' && typeof specifier.value === 'string' ? specifier.value
        : specifier.type === 'TemplateLiteral' && !specifier.expressions.length ? specifier.quasis[0].value.cooked : null;
      if (literal !== null) {
        addImport(literal);
        if (literal.startsWith('./') || literal.startsWith('../')) result.dynamicImports.push(literal);
      } else if (file !== CATALOG_LOADER) {
        result.issues.push(`${at(node)}: import() with a computed specifier (${snippet(node)}); the key scan cannot follow it`);
      }
    } else if (node.type === 'MemberExpression' && node.object?.type === 'MetaProperty'
      && node.object.meta?.name === 'import' && node.property?.name === 'glob') {
      result.issues.push(`${at(node)}: import.meta.glob in a page graph; the key scan cannot follow it`);
    } else if (node.type === 'CallExpression') {
      const argument = keyArgument(node.callee, shadowed);
      const keyNode = argument === null ? null : node.arguments[argument];
      if (keyNode && keyNode.type !== 'SpreadElement') {
        for (const spec of keySpecs(keyNode)) {
          if (spec.kind === 'exact' && !keySet.has(spec.value)) {
            result.issues.push(`${at(node)}: ${snippet(node)} names "${spec.value}", which the catalog does not hold`);
          } else if (spec.kind === 'pattern') {
            if (matchesAny(spec.regex)) result.patterns.push(spec.regex);
            else result.issues.push(`${at(node)}: ${snippet(node)} matches no catalog key`);
          } else if (spec.kind === 'unbounded') {
            result.issues.push(`${at(node)}: ${snippet(node)} builds its key without a leading namespace; `
              + 'start the template or concatenation with the key namespace (`area.section.${id}`)');
          }
        }
      }
    }
  }, () => { scopes.pop(); });
  return result;
}

/** String values of a JSON document equal to a catalog key. */
function jsonKeys(text, keySet) {
  const found = new Set();
  const visit = (value) => {
    if (typeof value === 'string') {
      if (keySet.has(value)) found.add(value);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(JSON.parse(text));
  return found;
}

/** The HTML entries of a Vite config (`build.rolldownOptions.input`, or its `rollupOptions` alias), project-relative. */
export function htmlInputs(config, { root = ROOT } = {}) {
  const input = config?.build?.rolldownOptions?.input ?? config?.build?.rollupOptions?.input ?? {};
  const files = typeof input === 'string' ? [input] : Array.isArray(input) ? input : Object.values(input);
  return files.filter((file) => String(file).endsWith('.html')).map((file) => toPosix(relative(resolve(root), resolve(root, file))));
}

/**
 * Group HTML entries by the catalog they declare and scan each page catalog's module graph.
 * `cache` (a Map, optional) keeps module analyses across scans of the same `english` object; a module is
 * re-read every scan and re-analysed only when its text changed. Returns { catalogs: { [name]: { pages, modules, keys,
 * lazyKeys, lazy } }, lazySites: { [module]: specifiers }, issues }: a page catalog's `keys` are its boot graph's (the
 * scripts and their static imports) and its markup's, `lazyKeys` the further keys its lazy graphs reach, `lazy` its lazy
 * boundaries (literal import() targets outside its boot graph, and theirs in turn), `modules` everything it reaches;
 * `lazySites` names, per module, the import() specifiers of lazy boundaries whose own graphs can show a key of their
 * page's lazy chunk (the sites the build rewrites to load it first). The full catalog lists its pages and every key.
 */
export function scanPageCatalogs({ root = ROOT, pages, english, cache = new Map() }) {
  const rootDir = resolve(root);
  const catalog = english ?? JSON.parse(readFileSync(resolve(rootDir, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
  const keyList = Object.keys(catalog);
  const keySet = new Set(keyList);
  const issues = [];
  const groups = new Map();
  for (const page of pages) {
    const html = readFileSync(resolve(rootDir, page), 'utf8');
    const name = documentCatalog(html);
    if (name === null) {
      issues.push(`${page}: declares no catalog; add <meta name="${PAGE_CATALOG_META}" content="…"> (\`${FULL_CATALOG}\` loads the full catalogs)`);
      continue;
    }
    if (!CATALOG_NAME_RE.test(name)) {
      issues.push(`${page}: catalog "${name}" is not a camelCase name`);
      continue;
    }
    if (!groups.has(name)) groups.set(name, { pages: [], scripts: [], markup: new Set() });
    const group = groups.get(name);
    group.pages.push(page);
    group.scripts.push(...htmlModuleScripts(html));
    for (const key of markupKeys(html)) {
      if (keySet.has(key)) group.markup.add(key);
      else issues.push(`${page}: data-i18n="${key}" is not a catalog key`);
    }
  }

  const analysis = (module) => {
    const source = readFileSync(resolve(rootDir, module), 'utf8');
    const cached = cache.get(module);
    if (cached?.source === source && cached.catalog === catalog) return cached.result;
    const result = module.endsWith('.json')
      ? { imports: [], dynamicImports: [], exact: jsonKeys(source, keySet), prefixes: new Set(), patterns: [], issues: [] }
      : analyzeModuleSource(source, module, { root: rootDir, keys: keyList });
    cache.set(module, { source, catalog, result });
    return result;
  };

  // A module graph walked from its roots through static imports; a literal import() target is not walked into but
  // recorded as a boundary. A module's analysis issues count once it is reached.
  const resolved = (module, specifier) => {
    const target = resolveSpecifier(resolve(rootDir, module), specifier);
    if (!target) {
      issues.push(`${module}: unresolved import ${specifier}`);
      return null;
    }
    const next = toPosix(relative(rootDir, target));
    return CATALOG_MODULE_RE.test(next) ? null : next;
  };
  // every literal import() of a lazy boundary, by importing module: the sites the build rewrites (lazySites)
  const boundarySites = new Map();
  const staticGraph = (roots) => {
    const modules = new Set(roots), boundaries = [], queue = [...roots];
    while (queue.length) {
      const module = queue.shift();
      if (!SCRIPT_RE.test(module) && !module.endsWith('.json')) continue;
      const result = analysis(module);
      issues.push(...result.issues);
      const dynamic = new Set(result.dynamicImports);
      for (const specifier of result.imports) {
        const next = resolved(module, specifier);
        if (!next) continue;
        // (a specifier imported both ways is a static edge)
        if (dynamic.has(specifier) && !staticallyImports(result, specifier)) {
          boundaries.push(next);
          if (!boundarySites.has(module)) boundarySites.set(module, new Map());
          boundarySites.get(module).set(specifier, next);
          continue;
        }
        if (modules.has(next)) continue;
        modules.add(next);
        queue.push(next);
      }
    }
    return { modules, boundaries };
  };
  const lazyGraphs = new Map();
  /** A lazy boundary's own static graph. */
  const lazyGraph = (boundary) => {
    let graph = lazyGraphs.get(boundary);
    if (!graph) lazyGraphs.set(boundary, graph = staticGraph([boundary]));
    return graph;
  };
  /** The catalog keys a set of modules (and some markup keys) can show. */
  const keysOf = (modules, markup) => {
    const used = new Set(markup);
    const prefixes = new Set();
    const patterns = [];
    for (const module of modules) {
      if (!SCRIPT_RE.test(module) && !module.endsWith('.json')) continue;
      const result = analysis(module);
      for (const key of result.exact) used.add(key);
      for (const prefix of result.prefixes) prefixes.add(prefix);
      patterns.push(...result.patterns);
    }
    const prefixList = [...prefixes];
    return keyList.filter((key) => used.has(key)
      || prefixList.some((prefix) => key.startsWith(prefix))
      || patterns.some((regex) => regex.test(key)));
  };

  const catalogs = {};
  for (const [name, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (name === FULL_CATALOG) {
      const others = group.pages.filter((page) => page !== 'index.html');
      if (others.length) issues.push(`${others.join(', ')}: only the game (index.html) loads the full catalogs`);
      catalogs[name] = { pages: group.pages, modules: [], keys: keyList, lazyKeys: [], lazy: [] };
      continue;
    }
    const missing = group.scripts.filter((script) => !existsSync(resolve(rootDir, script)));
    for (const script of missing) issues.push(`${group.pages.join(', ')}: module script ${script} does not exist`);
    const boot = staticGraph(group.scripts.filter((script) => !missing.includes(script)));
    const reached = new Set(boot.modules);
    const lazy = new Set();
    const pendingBoundaries = boot.boundaries.filter((boundary) => !boot.modules.has(boundary));
    while (pendingBoundaries.length) {
      const boundary = pendingBoundaries.shift();
      if (lazy.has(boundary)) continue;
      lazy.add(boundary);
      const graph = lazyGraph(boundary);
      for (const module of graph.modules) reached.add(module);
      for (const next of graph.boundaries) if (!boot.modules.has(next) && !lazy.has(next)) pendingBoundaries.push(next);
    }
    const keys = keysOf(boot.modules, group.markup);
    const bootKeys = new Set(keys);
    const lazyKeys = lazy.size ? keysOf(reached, []).filter((key) => !bootKeys.has(key)) : [];
    catalogs[name] = { pages: group.pages, modules: [...reached].sort(), keys, lazyKeys, lazy: [...lazy].sort() };
  }
  // the sites to rewrite: an import() of a module that some page reaches only through import() and whose own graph can
  // show a key of that page's lazy chunk (a boundary whose keys the boot catalog already holds — a builder, a stylesheet,
  // a data module — needs no chunk before it)
  const lazyBoundaries = new Set();
  for (const catalog of Object.values(catalogs)) {
    if (!catalog.lazyKeys.length) continue;
    const lazyKeys = new Set(catalog.lazyKeys);
    for (const boundary of catalog.lazy) {
      if (!lazyBoundaries.has(boundary) && keysOf(lazyGraph(boundary).modules, []).some((key) => lazyKeys.has(key))) {
        lazyBoundaries.add(boundary);
      }
    }
  }
  const lazySites = {};
  for (const [module, sites] of [...boundarySites].sort(([a], [b]) => a.localeCompare(b))) {
    const specifiers = [...sites].filter(([, target]) => lazyBoundaries.has(target)).map(([specifier]) => specifier).sort();
    if (specifiers.length) lazySites[module] = specifiers;
  }
  return { catalogs, lazySites, issues: [...new Set(issues)] };
}

/** One locale's dictionary restricted to a page catalog's keys (a key the locale lacks falls back to English). */
export function catalogSubset(dictionary, keys) {
  const subset = {};
  for (const key of keys) if (typeof dictionary[key] === 'string') subset[key] = dictionary[key];
  return subset;
}

async function main(argv) {
  process.chdir(ROOT); // vite.config.ts resolves its inputs from the working directory
  const { default: config } = await import(pathToFileURL(resolve(ROOT, 'vite.config.ts')).href);
  const english = JSON.parse(readFileSync(resolve(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
  const scan = scanPageCatalogs({ root: ROOT, pages: htmlInputs(config), english });
  if (argv.includes('--json')) console.log(JSON.stringify(scan, null, 2));
  else {
    const total = Buffer.byteLength(JSON.stringify(english));
    for (const [name, { pages, modules, keys, lazyKeys, lazy }] of Object.entries(scan.catalogs)) {
      const bytes = Buffer.byteLength(JSON.stringify(catalogSubset(english, keys)));
      const lazyBytes = Buffer.byteLength(JSON.stringify(catalogSubset(english, lazyKeys)));
      console.log(`${name.padEnd(10)} ${String(keys.length).padStart(5)} keys ${String(bytes).padStart(7)} B of ${total} `
        + `(${modules.length} modules; ${pages.length === 1 ? pages[0] : `${pages.length} pages`})`
        + `${lazyKeys.length ? ` + lazy ${lazyKeys.length} keys ${lazyBytes} B behind ${lazy.length} import() boundar${lazy.length === 1 ? 'y' : 'ies'}` : ''}`);
    }
    for (const issue of scan.issues) console.error(`issue: ${issue}`);
  }
  if (!argv.includes('--check')) return;
  if (scan.issues.length) {
    console.error(`i18n-page-catalogs: FAIL (${scan.issues.length} issue${scan.issues.length === 1 ? '' : 's'})`);
    process.exitCode = 1;
  } else console.log('i18n-page-catalogs: PASS');
}

// No top-level await: vite.config.ts imports the plugin, which imports this module, so main() must not hold this module's
// evaluation open while it imports the config.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
