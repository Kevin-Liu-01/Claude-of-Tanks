#!/usr/bin/env node
// Object3D-assert lint (test-speed PLAN R10 / quick win 9, 2026-10-16). In the 226 gate the T-72 X receipts reached
// 28-40 GB and were killed 16 times: `assert.equal(group.parent, tank.root.getObjectByName('rig_turret'))` failed after
// VH.14 moved the AA gun under a pitch node, and node's AssertionError inspected both scene graphs whole (depth 1000,
// every typed array element, sorted keys) and diffed the two dumps line by line. The message cap does not help: a
// supplied message still builds the diff, and util.inspect.defaultOptions is ignored (measured on node 24.13: two
// 200-mesh scenes took 15 s and 27.5 GB RSS under a 4 GB heap cap; two small differing meshes 6.1 GB; the pre-fix
// t72b3XGeometry receipt on today's tanks passed 12 GB in 65 s, where its --fix rewrite fails in 21 s at 620 MB).
//
// The lint fails on node:assert equality calls (equal, strictEqual, deepEqual, deepStrictEqual, partialDeepStrictEqual
// and their not* forms) whose actual or expected operand is a three.js graph object: an Object3D (and lists of them), a
// BufferGeometry or BufferAttribute, a Material or a Texture. Assert a boolean (`assert.ok(a === b, ...)`) or compare
// graphLabels(...) from tools/receipt-kit.test-support.mjs (identity labels such as `Mesh "hull" #12`), uuids or names.
// It reads syntax plus local data flow (a variable's initializer and assignments, destructured tuples, for-of and
// traverse/forEach callback items, local helpers' return values); `--types` asks the TypeScript checker for every
// operand's type across the whole import graph, the slower audit for what crosses module boundaries (about 50 s and
// 4 GB: run it when touching many receipts, not as a suite step). A file's result depends on its bytes alone, so results
// are cached by content and only changed files are parsed again (COT_SELFTEST_CACHE=0 re-lints every file).
//
// Allowlist: a comment `// object3d-assert-ok: <reason>` on the call's first line or the line above it accepts that
// one call. The reason is required, and a marker that no longer sits on a flagged call fails as stale.
//   node tools/object3d-assert-lint.mjs                # all receipts (*.selftest.mjs, *.test-support.mjs)
//   node tools/object3d-assert-lint.mjs a.selftest.mjs # only these files
//   node tools/object3d-assert-lint.mjs --fix          # equal(a, b) -> ok(a === b); deepEqual(a, b) -> deepEqual(graphLabels(a), ...)
//   node tools/object3d-assert-lint.mjs --types        # the checker audit; with --fix it rewrites what the checker types too
//   node tools/object3d-assert-lint.mjs --json
import ts from 'typescript-compiler-api';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOW_MARK = 'object3d-assert-ok';
const ALLOW_RE = /^(?:\/\/|\/\*)\s*object3d-assert-ok\b([^]*?)(?:\*\/)?$/;
const ASSERT_MODULES = new Map([['node:assert', false], ['assert', false], ['node:assert/strict', true], ['assert/strict', true]]);
const EQUALITY = new Set(['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual', 'partialDeepStrictEqual',
  'notEqual', 'notStrictEqual', 'notDeepEqual', 'notDeepStrictEqual']);
const NEGATED = new Set(['notEqual', 'notStrictEqual', 'notDeepEqual', 'notDeepStrictEqual']);
// Graph-valued whatever the receiver: an object's tree links, a mesh's buffers and materials.
const STRONG_PROPS = new Set(['parent', 'children', 'material', 'materials', 'geometry', 'customDepthMaterial',
  'customDistanceMaterial', 'overrideMaterial', 'depthTexture', 'instanceMatrix', 'instanceColor', 'skeleton', 'bones',
  'mesh', 'meshes', 'scene', 'camera', 'root', 'group', 'lights']);
// Graph-valued when read from a graph object (or a renderer/scene holder): a material's maps, a geometry's index.
const RECEIVER_PROPS = new Set(['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap',
  'bumpMap', 'envMap', 'lightMap', 'displacementMap', 'specularMap', 'gradientMap', 'matcap', 'clearcoatMap',
  'clearcoatNormalMap', 'sheenColorMap', 'transmissionMap', 'thicknessMap', 'texture', 'textures', 'index', 'attributes',
  'environment', 'object', 'target', 'shadow']);
// Conventional names: kit.hullMesh, fx.smokeMaterial, world.groundGeometry, rig.turretGroup, scene, camera.
const GRAPH_NAME = /^(?:(?!(?:is|has|use|uses|should|can|needs|with|no|num|count|max|min|create|delete|dispose|get|set|make|build|visit|load|bind|update|apply|ensure|release|retain|acquire|on|to|from|for|warm|compile|render|draw|install|clone|copy)[A-Z])[a-z]\w*(?:Mesh|Meshes|Group|Groups|Material|Materials|Texture|Textures|Geometry|Geometries|Scene|Camera|Object3D|Object3Ds|Rig|Node|Nodes)|scene|camera|object3d|object3D)$/;
// Short conventional receivers of a material's maps or a geometry's index: g.index, geo.attributes, mat.map.
const GRAPH_RECEIVER = /^(?:g|geo|geom|geometry|mat|mtl|material|tex|texture)$/;
const receiverName = node => { const value = unwrap(node); return propName(value) ?? (ts.isIdentifier(value) ? value.text : ''); };
// Reasons that name a list or record of graph objects rather than one object.
const LIST_REASON = /^(?:\.(?:children|materials|material|meshes|lights|bones|textures|attributes|morphAttributes)\b|\.\w*(?:Meshes|Groups|Materials|Textures|Geometries|Nodes|Object3Ds)\b|array of|element of (?:array of|\.children|\.attributes)|getObjectsByProperty|(?:filter|slice|concat|flat|sort|toSorted|toReversed|reverse|values)\(\))/;
const GRAPH_METHODS = new Set(['getObjectByName', 'getObjectById', 'getObjectByProperty', 'getObjectsByProperty']);
// BufferGeometry readers share names with the DOM's getAttribute: graph-valued only on a graph or *geo* receiver.
const GEOMETRY_METHODS = new Set(['getAttribute', 'getIndex', 'getMorphAttribute']);
const CHAIN_METHODS = new Set(['clone', 'add', 'remove', 'at', 'find', 'findLast', 'filter', 'slice', 'concat', 'reverse',
  'sort', 'toSorted', 'toReversed', 'flat', 'deref', 'values', 'get', 'pop', 'shift']);
const ITEM_CALLBACKS = new Set(['traverse', 'traverseVisible', 'traverseAncestors', 'forEach', 'map', 'filter', 'find',
  'findLast', 'some', 'every', 'flatMap', 'findIndex']);
const GRAPH_CLASS = /^(?:Object3D|Group|Scene|Mesh|InstancedMesh|SkinnedMesh|BatchedMesh|Line|LineSegments|LineLoop|Points|Sprite|LOD|Bone|Skeleton|\w*Camera|\w*Light|\w*Geometry|\w*Material|\w*Texture|\w*BufferAttribute|InterleavedBuffer\w*)$/;
const LOW_PRECEDENCE = new Set([ts.SyntaxKind.BinaryExpression, ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.YieldExpression, ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.CommaListExpression]);

const unwrap = node => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression?.(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node;
};
const propName = node => ts.isPropertyAccessExpression(node) ? node.name.text
  : ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null;

/** Every receipt file the suite can run: tracked or new (untracked, not ignored). */
function listReceiptFiles(root = REPO_ROOT) {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
    '*.selftest.mjs', '*.test-support.mjs'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  return [...new Set(out.split('\0').filter(Boolean))].sort();
}

function createProgram(sources) {
  const files = [...sources.keys()];
  const options = { allowJs: true, checkJs: false, noEmit: true, noResolve: true, noLib: true, types: [],
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext };
  const host = ts.createCompilerHost(options, true);
  const cache = new Map();
  host.getSourceFile = (name, version) => {
    if (cache.has(name)) return cache.get(name);
    const text = sources.get(name);
    const file = text === undefined ? undefined
      : ts.createSourceFile(name, text, version ?? ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    cache.set(name, file);
    return file;
  };
  host.fileExists = name => sources.has(name);
  host.readFile = name => sources.get(name);
  host.getDefaultLibFileName = () => 'lib.d.ts';
  host.writeFile = () => {};
  return ts.createProgram({ rootNames: files, options, host });
}

/** Assert bindings of one file: namespaces (assert, strict) and directly imported functions (equal, deepEqual). */
function assertBindings(source) {
  const namespaces = new Map(), functions = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) continue;
    const strict = ASSERT_MODULES.get(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (strict === undefined || !clause) continue;
    if (clause.name) namespaces.set(clause.name.text, strict);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.set(bindings.name.text, strict);
    else if (bindings) for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text, local = element.name.text;
      if (imported === 'strict') namespaces.set(local, true);
      else if (imported === 'default') namespaces.set(local, strict);
      else if (EQUALITY.has(imported)) functions.set(local, { op: imported, strict });
    }
  }
  return { namespaces, functions };
}

function equalityCall(node, { namespaces, functions }) {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  if (ts.isIdentifier(callee) && functions.has(callee.text)) return { ...functions.get(callee.text), nameNode: callee };
  if (!ts.isPropertyAccessExpression(callee) || !EQUALITY.has(callee.name.text)) return null;
  let base = callee.expression, strict;
  if (ts.isPropertyAccessExpression(base) && base.name.text === 'strict') { base = base.expression; strict = true; }
  if (!ts.isIdentifier(base)) return null;
  if (namespaces.has(base.text)) strict ??= namespaces.get(base.text);
  // A helper that receives assert as a parameter (or a test-support re-export) still names it `assert`.
  else if (base.text === 'assert') strict ??= null;
  else return null;
  return { op: callee.name.text, strict, nameNode: callee.name };
}

/** Syntax plus local data flow: why `expr` evaluates to a three.js graph object (or an array of them), else null. */
function makeClassifier(checker, source) {
  const assignments = new Map();
  const visit = node => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      const symbol = checker.getSymbolAtLocation(node.left);
      if (symbol) { if (!assignments.has(symbol)) assignments.set(symbol, []); assignments.get(symbol).push(node.right); }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const memo = new Map();
  const ofSymbol = (symbol, seen) => {
    if (!symbol) return null;
    if (memo.has(symbol)) return memo.get(symbol);
    if (seen.has(symbol)) return null;
    seen.add(symbol);
    let reason = null;
    for (const declaration of symbol.declarations ?? []) {
      reason = ofDeclaration(declaration, seen);
      if (reason) break;
    }
    if (!reason) for (const right of assignments.get(symbol) ?? []) { reason = classify(right, seen); if (reason) break; }
    seen.delete(symbol);
    if (reason) memo.set(symbol, reason); // a null may only mean a cycle was cut on this path
    return reason;
  };
  const iterated = (declaration, seen) => {
    // for (const child of root.children)
    const list = declaration.parent;
    if (!ts.isVariableDeclarationList(list) || !ts.isForOfStatement(list.parent)) return null;
    const reason = classify(list.parent.expression, seen);
    return reason ? `item of ${reason}` : null;
  };
  const elementOf = (expr, index, seen) => {
    const node = unwrap(expr);
    if (!ts.isArrayLiteralExpression(node)) return classify(node, seen); // an unknown shape counts as a whole
    const element = node.elements[index];
    return !element ? null : ts.isSpreadElement(element) ? classify(element.expression, seen) : classify(element, seen);
  };
  const callbackItem = (parameter, seen) => {
    // root.traverse(o => ...), group.children.forEach(child => ...): the first parameter is a graph item.
    const fn = parameter.parent;
    if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) || fn.parameters[0] !== parameter) return null;
    const call = fn.parent;
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return null;
    const method = call.expression.name.text;
    if (!ITEM_CALLBACKS.has(method)) return null;
    if (method.startsWith('traverse')) return `item of ${method}()`;
    const list = classify(call.expression.expression, seen);
    return list ? `item of ${list}` : null;
  };
  const ofDeclaration = (declaration, seen) => {
    if (ts.isVariableDeclaration(declaration)) {
      if (declaration.initializer) return classify(declaration.initializer, seen);
      return iterated(declaration, seen);
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent, holder = pattern.parent;
      const init = ts.isVariableDeclaration(holder) ? holder.initializer ?? null : null;
      if (ts.isObjectBindingPattern(pattern)) {
        const key = declaration.propertyName && (ts.isIdentifier(declaration.propertyName) || ts.isStringLiteralLike(declaration.propertyName))
          ? declaration.propertyName.text : ts.isIdentifier(declaration.name) ? declaration.name.text : null;
        if (key && (STRONG_PROPS.has(key) || GRAPH_NAME.test(key))) return `.${key}`;
        if (key && RECEIVER_PROPS.has(key) && init && classify(init, seen)) return `.${key} of a graph object`;
        return null;
      }
      // const [a, b] = pair; for (const [kind, mesh] of [['lamp', lamp]]); for (const [i, child] of list.entries())
      const index = pattern.elements.indexOf(declaration);
      if (init) return elementOf(init, index, seen);
      const list = ts.isVariableDeclaration(holder) && ts.isVariableDeclarationList(holder.parent)
        && ts.isForOfStatement(holder.parent.parent) ? unwrap(holder.parent.parent.expression) : null;
      if (!list) return null;
      if (ts.isArrayLiteralExpression(list)) {
        for (const item of list.elements) { const reason = elementOf(item, index, seen); if (reason) return `item of ${reason}`; }
        return null;
      }
      if (ts.isCallExpression(list) && ts.isPropertyAccessExpression(list.expression) && list.expression.name.text === 'entries') {
        if (index !== 1) return null;
        const reason = classify(list.expression.expression, seen);
        return reason ? `item of ${reason}` : null;
      }
      return iterated(holder, seen);
    }
    if (ts.isParameter(declaration)) {
      if (declaration.initializer) { const reason = classify(declaration.initializer, seen); if (reason) return reason; }
      const item = callbackItem(declaration, seen);
      if (item) return item;
      return ts.isIdentifier(declaration.name) && GRAPH_NAME.test(declaration.name.text) ? `parameter ${declaration.name.text}` : null;
    }
    return null;
  };
  const returns = (fn, seen) => {
    if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return classify(fn.body, seen);
    let reason = null;
    const walk = node => {
      if (reason || node !== fn && ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression) reason = classify(node.expression, seen);
      else ts.forEachChild(node, walk);
    };
    if (fn.body) walk(fn.body);
    return reason;
  };
  const localFunction = (identifier, seen) => {
    const symbol = checker.getSymbolAtLocation(identifier);
    if (!symbol || seen.has(symbol)) return null;
    seen.add(symbol);
    try {
      for (const declaration of symbol.declarations ?? []) {
        if (ts.isFunctionDeclaration(declaration)) { const reason = returns(declaration, seen); if (reason) return reason; }
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          const init = unwrap(declaration.initializer);
          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) { const reason = returns(init, seen); if (reason) return reason; }
        }
      }
      return null;
    } finally { seen.delete(symbol); }
  };
  const classify = (input, seen = new Set()) => {
    const node = unwrap(input);
    if (!node) return null;
    if (ts.isAwaitExpression(node)) return classify(node.expression, seen);
    if (ts.isConditionalExpression(node)) return classify(node.whenTrue, seen) ?? classify(node.whenFalse, seen);
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return classify(node.left, seen) ?? classify(node.right, seen);
      if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.EqualsToken || op === ts.SyntaxKind.CommaToken) return classify(node.right, seen);
      return null;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const name = propName(node);
      if (name !== null) {
        if (VALUE_HOLDERS.has(propName(unwrap(node.expression)) ?? '')) return null; // el.dataset.group, process.env.scene
        if (STRONG_PROPS.has(name)) return `.${name}`;
        if (GRAPH_NAME.test(name)) return `.${name}`;
        if (RECEIVER_PROPS.has(name) && (GRAPH_RECEIVER.test(receiverName(node.expression)) || classify(node.expression, seen))) {
          return `.${name} of a graph object`;
        }
        return null;
      }
      // An element of a graph list (children[0], material[1], meshes[i], attributes[name]); a dynamic key on one object
      // reads a property (texture[key], mesh[flag]), which the lint cannot type.
      const list = classify(node.expression, seen);
      if (!list) return null;
      return ts.isNumericLiteral(node.argumentExpression) || LIST_REASON.test(list) ? `element of ${list}` : null;
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (ts.isPropertyAccessExpression(callee)) {
        const method = callee.name.text;
        if (GRAPH_METHODS.has(method)) return `${method}()`;
        if (GEOMETRY_METHODS.has(method)) {
          const receiver = unwrap(callee.expression);
          if (/geo/i.test(propName(receiver) ?? (ts.isIdentifier(receiver) ? receiver.text : ''))) return `${method}()`;
          const of = classify(receiver, seen);
          return of ? `${method}() of ${of}` : null;
        }
        if (CHAIN_METHODS.has(method)) { const of = classify(callee.expression, seen); return of ? `${method}() of ${of}` : null; }
        if (method === 'from' && ts.isIdentifier(callee.expression) && callee.expression.text === 'Array' && node.arguments[0]) return classify(node.arguments[0], seen);
        return null;
      }
      if (ts.isIdentifier(callee)) { const reason = localFunction(callee, seen); return reason ? `${callee.text}() returns ${reason}` : null; }
      return null;
    }
    if (ts.isNewExpression(node)) {
      const callee = unwrap(node.expression);
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      return GRAPH_CLASS.test(name) ? `new ${name}()` : null;
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        const reason = classify(ts.isSpreadElement(element) ? element.expression : element, seen);
        if (reason) return `array of ${reason}`;
      }
      return null;
    }
    if (ts.isIdentifier(node)) return node.text === 'undefined' ? null : ofSymbol(checker.getSymbolAtLocation(node), seen);
    return null;
  };
  return expr => classify(expr);
}

/** Allow markers by 0-based line, read from real comments only (fixture strings that mention the marker do not count). */
function allowMarks(source) {
  const text = source.text, seen = new Set(), marks = new Map();
  const read = ranges => {
    for (const range of ranges ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const match = ALLOW_RE.exec(text.slice(range.pos, range.end));
      if (match) marks.set(source.getLineAndCharacterOfPosition(range.pos).line,
        { reason: match[1].replace(/^\s*:?\s*/, '').trim(), used: false });
    }
  };
  const visit = node => {
    read(ts.getLeadingCommentRanges(text, node.getFullStart()));
    read(ts.getTrailingCommentRanges(text, node.getEnd()));
    ts.forEachChild(node, visit);
  };
  visit(source);
  read(ts.getLeadingCommentRanges(text, source.endOfFileToken.getFullStart()));
  return marks;
}

// The other operand is a value, not an object: `assert.equal(sound.material, 'brick')`, `(stats.materials, n - 1)`.
const VALUE_PROPS = new Set(['length', 'size', 'count', 'name', 'uuid', 'id', 'type', 'version', 'byteLength']);
const VALUE_HOLDERS = new Set(['dataset', 'style', 'env', 'searchParams']);
const VALUE_CALLS = new Set(['resolve', 'join', 'relative', 'basename', 'dirname', 'cwd', 'String', 'Number', 'Boolean',
  'stringify', 'toFixed', 'toString', 'trim', 'toLowerCase', 'toUpperCase', 'padStart', 'padEnd', 'replace',
  'replaceAll', 'slugify', 'digest', 'hex', 'round', 'floor', 'ceil', 'abs', 'min', 'max', 'sqrt', 'hypot']);
const ARITHMETIC = new Set([ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken, ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.AsteriskAsteriskToken, ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.BarToken, ts.SyntaxKind.AmpersandToken, ts.SyntaxKind.CaretToken,
  ts.SyntaxKind.LessThanLessThanToken, ts.SyntaxKind.GreaterThanGreaterThanToken, ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.InKeyword]);
const isValue = input => {
  const node = unwrap(input);
  if (!node) return false;
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) || ts.isBigIntLiteral(node) || ts.isTemplateExpression(node)
    || ts.isRegularExpressionLiteral(node) || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword
    || ts.isTypeOfExpression(node)) return true;
  if (ts.isPrefixUnaryExpression(node)) return true;
  if (ts.isBinaryExpression(node)) return ARITHMETIC.has(node.operatorToken.kind);
  // An empty literal is no evidence: `assert.deepEqual(scene.children, [])` dumps the children it finds.
  if (ts.isArrayLiteralExpression(node)) return node.elements.length > 0 && node.elements.every(element => isValue(element));
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.length > 0 && node.properties.every(p => ts.isPropertyAssignment(p) && isValue(p.initializer));
  }
  if (ts.isPropertyAccessExpression(node)) return VALUE_PROPS.has(node.name.text);
  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
    return VALUE_CALLS.has(name);
  }
  return false;
};

const isNullish = node => {
  const value = unwrap(node);
  return value && (value.kind === ts.SyntaxKind.NullKeyword || ts.isIdentifier(value) && value.text === 'undefined'
    || ts.isVoidExpression(value));
};

/**
 * Lint in-memory sources: Map<file, text>. Returns { findings, allowed, stale, badAllow } with 1-based lines.
 * A finding: { file, line, column, op, operand (0 actual, 1 expected), text, reason, fix } where fix is the rewrite.
 */
export function lintSources(sources, { force = new Map() } = {}) {
  const program = createProgram(sources), checker = program.getTypeChecker();
  const findings = [], allowed = [], stale = [], badAllow = [];
  for (const file of sources.keys()) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    const bindings = assertBindings(source);
    const classify = makeClassifier(checker, source);
    const marks = allowMarks(source);
    let plan;
    const visit = node => {
      const call = equalityCall(node, bindings);
      if (call) {
        const args = node.arguments;
        if (args.some(arg => ts.isSpreadElement(arg))) { ts.forEachChild(node, visit); return; }
        const flagged = [];
        for (const index of [0, 1]) {
          if (!args[index]) continue;
          // notEqual(x, null) fails only when x is nullish: the dump is of `null`, not of a graph.
          if (NEGATED.has(call.op) && isNullish(args[1 - index])) continue;
          if (args[1 - index] && isValue(args[1 - index])) continue;
          const reason = classify(args[index]);
          if (reason) flagged.push({ operand: index, reason });
        }
        const start = source.getLineAndCharacterOfPosition(node.getStart(source));
        const forced = force.get(`${file}:${start.line + 1}:${start.character + 1}`);
        if (!flagged.length && forced) flagged.push({ operand: forced.operand, reason: `typed ${forced.type}` });
        if (flagged.length) {
          // A marker accepts one call: a second flagged call on its line or the next is a finding (229, critic r1).
          const near = marks.get(start.line) ?? marks.get(start.line - 1);
          const mark = near?.used ? null : near;
          const row = { file, line: start.line + 1, column: start.character + 1, op: call.op,
            operand: flagged[0].operand, reason: flagged.map(f => `${f.operand ? 'expected' : 'actual'} ${f.reason}`).join('; '),
            text: node.getText(source).replace(/\s+/g, ' ').slice(0, 160) };
          row.fix = rewrite(node, call, source, row.reason, plan ??= kitImportPlan(source, file));
          if (mark && mark.reason) { mark.used = true; allowed.push({ ...row, allow: mark.reason }); }
          else if (mark) { mark.used = true; badAllow.push({ ...row, problem: 'allow marker without a reason' }); }
          else findings.push(row);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const [index, mark] of marks) if (!mark.used) stale.push({ file, line: index + 1, reason: mark.reason });
  }
  return { findings, allowed, stale, badAllow };
}

// Deep comparisons are rewritten through the receipt kit's graphLabels (identity labels), except where a BufferAttribute
// may be compared by value: an attribute has no uuid, so deepEqual on two of them compares contents.
const ATTRIBUTE_REASON = /getAttribute|getIndex|getMorphAttribute|\.index\b|\.attributes\b|instanceMatrix|instanceColor|BufferAttribute|typed isInterleaved/;
const KIT = resolve(REPO_ROOT, 'tools/receipt-kit.test-support.mjs');

/** Where `graphLabels` comes from in this file: an existing kit import to extend, or a new import after the last one. */
function kitImportPlan(source, file) {
  let spec = relative(dirname(file), KIT).split('\\').join('/');
  if (!spec.startsWith('.')) spec = `./${spec}`;
  let named = null, last = null, bound = false;
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    last = statement;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings) && bindings.elements.some(e => e.name.text === 'graphLabels')) bound = true;
    if (ts.isStringLiteralLike(statement.moduleSpecifier) && resolve(dirname(file), statement.moduleSpecifier.text) === KIT
      && bindings && ts.isNamedImports(bindings) && bindings.elements.length) named ??= bindings.elements.at(-1).getEnd();
  }
  if (bound || file === KIT) return { edit: null };
  if (named !== null) return { edit: { start: named, end: named, text: ', graphLabels' } };
  const at = last ? last.getEnd() : 0;
  return { edit: { start: at, end: at, text: `${last ? '\n' : ''}import { graphLabels } from '${spec}';${last ? '' : '\n'}` } };
}

/**
 * The rewrite of one flagged call as minimal text edits, or null when it needs a hand edit:
 *   assert.equal(a, b, m)     -> assert.ok(a === b, m)        (notEqual: !==; legacy loose assert: == and !=)
 *   assert.deepEqual(a, b, m) -> assert.deepEqual(graphLabels(a), graphLabels(b), m)
 */
function rewrite(node, call, source, reason, plan) {
  const args = node.arguments;
  if (args.length < 2) return null;
  const [a, b] = args, aStart = a.getStart(source), aEnd = a.getEnd(), bStart = b.getStart(source), bEnd = b.getEnd();
  const wrap = (arg, open, close) => [{ start: arg.getStart(source), end: arg.getStart(source), text: open },
    { start: arg.getEnd(), end: arg.getEnd(), text: close }];
  const identity = { equal: '===', strictEqual: '===', notEqual: '!==', notStrictEqual: '!==' }[call.op];
  if (identity) {
    // A directly imported equal() has no `ok` beside it, and an assert of unknown origin has unknown strictness.
    if (ts.isIdentifier(node.expression) || call.strict === null) return null;
    if (source.text.slice(aEnd, bStart).trim() !== ',') return null; // a comment between the operands: by hand
    const operator = call.strict ? identity : identity === '===' ? '==' : '!=';
    const edits = [{ start: call.nameNode.getStart(source), end: call.nameNode.getEnd(), text: 'ok' },
      { start: aEnd, end: bStart, text: ` ${operator} ` }];
    for (const arg of [a, b]) if (LOW_PRECEDENCE.has(unwrap(arg) === arg ? arg.kind : -1)) edits.push(...wrap(arg, '(', ')'));
    return { kind: 'identity', edits };
  }
  if (ATTRIBUTE_REASON.test(reason)) return null;
  return { kind: 'labels', edits: [...wrap(a, 'graphLabels(', ')'), ...wrap(b, 'graphLabels(', ')')], importEdit: plan.edit };
}

/** Apply the rewrites of one file's findings to its text; findings without a rewrite are left for a hand edit. */
export function applyFixes(text, findings) {
  const fixable = findings.filter(f => f.fix);
  const edits = fixable.flatMap((f, call) => f.fix.edits.map((edit, order) => ({ ...edit, call, order })));
  const importEdit = fixable.find(f => f.fix.kind === 'labels' && f.fix.importEdit)?.fix.importEdit;
  if (importEdit) edits.push({ ...importEdit, call: -1, order: 0 });
  // Bottom-up so earlier offsets stay valid; at one offset the outer call's closing text goes after an inner one's.
  edits.sort((x, y) => y.start - x.start || y.end - x.end || y.call - x.call || y.order - x.order);
  let out = text, floor = Infinity;
  for (const edit of edits) {
    if (edit.end > floor) throw new Error(`object3d-assert-lint: overlapping rewrites at offset ${edit.start}`);
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    floor = edit.start;
  }
  return { text: out, applied: fixable.length, skipped: findings.length - fixable.length };
}

/** Read and lint receipt files under root (all receipts when `files` is omitted). */
// The analysis reads one file at a time (no imports are resolved), so a file's result is a function of its bytes, this
// linter's bytes and the TypeScript version alone: a run re-parses only files whose bytes changed (COT_SELFTEST_CACHE=0
// or { cache: false } recomputes every file, as the first full gate of a release does).
const LINT_SALT = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).update(`\0${ts.version}\0`).digest('hex');
const RESULT_KEYS = ['findings', 'allowed', 'stale', 'badAllow'];
const lintCachePath = (env = process.env) => env.COT_OBJECT3D_LINT_CACHE
  ?? join(tmpdir(), `cot-object3d-assert-lint-${process.getuid?.() ?? 'user'}`, 'results-v1.json');

/** Read and lint receipt files under root (all receipts when `files` is omitted). */
export function lintRepo({ root = REPO_ROOT, files, force, cache = !force && process.env.COT_SELFTEST_CACHE !== '0',
  cachePath = lintCachePath() } = {}) {
  const list = files ?? listReceiptFiles(root);
  let store = {};
  if (cache) try { store = JSON.parse(readFileSync(cachePath, 'utf8')).entries ?? {}; } catch {}
  const sources = new Map(), keys = new Map(), result = { findings: [], allowed: [], stale: [], badAllow: [] };
  let reused = 0;
  for (const file of list) {
    const path = resolve(root, file);
    // A sparse checkout omits files: lint the index copy rather than skip a receipt.
    const text = existsSync(path) ? readFileSync(path, 'utf8')
      : execFileSync('git', ['show', `:${relative(root, path)}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
    const key = createHash('sha256').update(LINT_SALT).update(text).digest('hex');
    keys.set(path, key);
    const hit = cache ? store[key] : undefined;
    if (hit) { reused++; for (const name of RESULT_KEYS) for (const row of hit[name]) result[name].push({ ...row, file: relative(root, path) }); }
    else sources.set(path, text);
  }
  const fresh = lintSources(sources, { force });
  // One entry per file path, stored under its content key: two files with the same bytes share one result, not two.
  const byPath = new Map([...sources.keys()].map(path => [path, Object.fromEntries(RESULT_KEYS.map(name => [name, []]))]));
  for (const name of RESULT_KEYS) for (const row of fresh[name]) {
    const { file, fix, ...stored } = row;
    byPath.get(file)[name].push(stored);
    result[name].push({ ...row, file: relative(root, file) });
  }
  const entries = new Map([...byPath].map(([path, entry]) => [keys.get(path), entry]));
  if (cache && entries.size) {
    try {
      // Merge into the shared store (other worktrees lint other bytes); keep the newest 20,000 file results.
      const merged = Object.entries({ ...store, ...Object.fromEntries(entries) }).slice(-20000);
      mkdirSync(dirname(cachePath), { recursive: true });
      const temporary = `${cachePath}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify({ salt: 'v1', entries: Object.fromEntries(merged) }));
      renameSync(temporary, cachePath);
    } catch {}
  }
  const at = row => `${row.file}:${String(row.line).padStart(6, '0')}`;
  for (const name of RESULT_KEYS) result[name].sort((a, b) => at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0);
  return { ...result, files: list.length, reused };
}

/** The checker audit: the TypeScript checker types every operand over the whole import graph (slow; not a suite step). */
function typeAudit({ root = REPO_ROOT, files } = {}) {
  const list = (files ?? listReceiptFiles(root)).map(file => resolve(root, file));
  const program = ts.createProgram(list, { allowJs: true, checkJs: false, noEmit: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
    resolveJsonModule: true, skipLibCheck: true, types: ['node'], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], maxNodeModuleJsDepth: 0 });
  const checker = program.getTypeChecker();
  const MARKS = ['isObject3D', 'isBufferGeometry', 'isMaterial', 'isBufferAttribute', 'isInterleavedBuffer', 'isTexture'];
  // A union counts only when every non-nullish member is a graph object: the element type of a heterogeneous tuple,
  // [material, color, version], is Material | Color | number, and its number is no graph.
  const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
  const mark = (type, depth = 0) => {
    if (!type || depth > 3 || type.flags & ts.TypeFlags.Any) return null;
    if (type.isUnion()) {
      const members = type.types.filter(t => !(t.flags & NULLISH)), marks = members.map(t => mark(t, depth + 1));
      return members.length && marks.every(Boolean) ? marks[0] : null;
    }
    for (const name of MARKS) if (checker.getPropertyOfType(type, name)) return name;
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      for (const t of checker.getTypeArguments(type)) { const m = mark(t, depth + 1); if (m) return `${m}[]`; }
    }
    return null;
  };
  const hits = [];
  for (const path of list) {
    const source = program.getSourceFile(path);
    if (!source) continue;
    const bindings = assertBindings(source);
    const visit = node => {
      const call = equalityCall(node, bindings);
      if (call) node.arguments.slice(0, 2).forEach((arg, operand) => {
        if (ts.isSpreadElement(arg)) return;
        if (NEGATED.has(call.op) && isNullish(node.arguments[1 - operand])) return;
        const m = mark(checker.getTypeAtLocation(arg));
        const at = source.getLineAndCharacterOfPosition(node.getStart(source));
        if (m) hits.push({ file: relative(root, path), line: at.line + 1, column: at.character + 1,
          op: call.op, operand, type: m, text: arg.getText(source).replace(/\s+/g, ' ').slice(0, 120) });
      });
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return hits;
}

function main(argv) {
  const json = argv.includes('--json'), fix = argv.includes('--fix'), types = argv.includes('--types');
  const files = argv.filter(arg => !arg.startsWith('--'));
  let force;
  if (types && fix) {
    // The periodic pass: rewrite what the checker types as graph objects as well as what the syntax shows.
    force = new Map(typeAudit({ files: files.length ? files : undefined })
      .map(hit => [`${resolve(REPO_ROOT, hit.file)}:${hit.line}:${hit.column}`, hit]));
  } else if (types) {
    const hits = typeAudit({ files: files.length ? files : undefined });
    if (json) console.log(JSON.stringify(hits, null, 1));
    else for (const hit of hits) console.log(`${hit.file}:${hit.line}:${hit.column}\t${hit.op}\t${hit.operand ? 'expected' : 'actual'}\t${hit.type}\t${hit.text}`);
    console.error(`object3d-assert-lint --types: ${hits.length} typed graph operands`);
    return 0;
  }
  const result = lintRepo({ files: files.length ? files : undefined, force, cache: fix ? false : undefined });
  if (fix) {
    const byFile = Map.groupBy(result.findings, row => row.file);
    let applied = 0, skipped = 0;
    for (const [file, rows] of byFile) {
      const path = resolve(REPO_ROOT, file);
      const out = applyFixes(readFileSync(path, 'utf8'), rows);
      if (out.applied) writeFileSync(path, out.text);
      applied += out.applied; skipped += out.skipped;
    }
    console.error(`object3d-assert-lint --fix: ${applied} calls rewritten (identity as assert.ok booleans, deep comparisons `
      + `through graphLabels); ${skipped} need a hand edit (re-run to list them)`);
    return 0;
  }
  if (json) console.log(JSON.stringify(result, null, 1));
  else {
    for (const row of result.findings) console.log(`${row.file}:${row.line}:${row.column}\tassert.${row.op} on a three.js graph object (${row.reason})\t${row.text}`);
    for (const row of result.badAllow) console.log(`${row.file}:${row.line}\t${ALLOW_MARK} needs a reason\t${row.text}`);
    for (const row of result.stale) console.log(`${row.file}:${row.line}\tstale ${ALLOW_MARK} marker (no flagged assert on this or the next line)`);
  }
  const bad = result.findings.length + result.badAllow.length + result.stale.length;
  console.error(`object3d-assert-lint: ${result.files} receipt files (${result.reused} unchanged since a cached lint), ${result.findings.length} graph-object equality asserts, `
    + `${result.allowed.length} allowlisted, ${result.stale.length} stale and ${result.badAllow.length} reasonless markers`);
  if (bad) console.error('Compare booleans, uuids, names or ids: a failing equality assert on a scene graph dumps and diffs both graphs (the 226 T-72 receipts reached 40 GB).');
  return bad ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
