// Shader text in a fleet module (274): GLSL a material's compile hook splices into its program. Node never compiles a
// WebGL program, so no hook body runs in a CPU step or a world step, and the text reaches no row they write; a page
// (the GPU steps) compiles it. steps.mjs SHADER_TEXT names the constants; this module proves each one is only that, and
// gives the file with their declarations masked, which the CPU and world keys hash instead of its bytes
// (tools/changed-only/fingerprint.mjs). 274.0: an armour-paint GLSL edit in materials.ts was in the fleet core, so every
// step on every id (3.5-4 h) and every map became due though no geometry tool runs the shader. First-party tooling:
// Kevin B. Liu.
//
// A declared constant holds when it is:
//   - a top-level `const NAME = <string or untagged template>` alone in its statement, never exported (no other module
//     can name it), whose interpolations are identifiers, literals and arithmetic of them (no call, property read or
//     assignment: nothing runs when the text is built);
//   - named only inside the body of a function assigned to `<material>.onBeforeCompile`, inside another declared
//     constant's text or a shader region (below), or inside a declared hook (SHADER_TEXT `hooks`) where its text flows only
//     into the hook's shader text (the name counted however it is scoped, so a shadowing local counts against it).
// Anything else is a problem, and the file is keyed by its bytes (the fleet core as before 274): never a skipped input.
// The masked span is the whole declaration with its leading comments (274.0 edited the constant's doc comment too).
//
// Shader regions (279, SHADER_TEXT `regions`): the text between `// shader-text:begin <name>` and
// `// shader-text:end <name>` lines, each its own line. 277: the rubber's tile (t80-skirts-274) was a define switch, a
// splice in the family hook (vehicleAmbientFloorHook, a named function every vehicle program compiles) and a define on
// the rubber, none of it maskable as a constant, so the fix keyed every step on every id. A region holds whole
// statements (or whole array elements) of one container, and what it may hold depends on that container:
//   - top level (text): constants as above, or `const NAME = ['a', 'b'] as const` arrays of string literals; each name
//     is held to the constant's rule.
//   - a declared hook's body (splice): statements that change only the hook's shader text. They read the hook's
//     parameter only as `<p>.fragmentShader`, `<p>.vertexShader` and `<p>.defines?.<SWITCH>`, assign only to their own
//     locals and those two fields, call only `.replace`/`.replaceAll`, name only their locals and masked constants, and
//     hold no return, throw, break, loop but `for...of`, function, `new` or update.
//   - a declared switch list's elements (switch): `'COT_...'` string literals. The list is a reviewed define-copy list
//     (cloneVehicleMaterial copies a define its source holds); its uses outside the regions are pinned.
//   - any other function body (define): `<material>.defines.<SWITCH> = <literal>` statements.
// Every switch a region names (COT_[A-Z0-9_]+) must be named nowhere else that Node runs for a CPU or world step (the
// fleet's executed modules, the CPU and world tools; comments aside): fingerprint.mjs checks it, so a define a masked
// region sets can steer only the shader compiler. A declared hook's own code outside its regions may read its shader text
// only into its shader text, so a splice cannot steer the code after it. Every declared region must be found; a region
// marker that is not declared, unpaired or nested is a problem.
// tools/changed-only/closure-trace.mjs --shaders moves the text and removes every splice, switch and define region at
// run time and proves no geometry follows them.
import { createHash } from 'node:crypto';
import ts from 'typescript-compiler-api';

const SAFE_OPERATORS = new Set([ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken]);
const SHADER_FIELDS = new Set(['fragmentShader', 'vertexShader']);
const TEXT_CALLS = new Set(['replace', 'replaceAll']);
const SWITCH = /^COT_[A-Z0-9_]+$/;
const MARKER = /^[ \t]*\/\/ shader-text:(begin|end)(?: ([\w-]+))?[ \t]*$/gm;
// graph.mjs h16 (not imported: graph.mjs lists files, and every receipt this module reaches would have to declare it)
const h16 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** An interpolation that runs nothing: identifiers, literals, unary and binary arithmetic, parentheses. */
function inert(node) {
  if (ts.isIdentifier(node) || ts.isNumericLiteral(node) || ts.isStringLiteralLike(node)) return true;
  if (ts.isParenthesizedExpression(node)) return inert(node.expression);
  if (ts.isPrefixUnaryExpression(node)) return [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(node.operator) && inert(node.operand);
  if (ts.isBinaryExpression(node)) return SAFE_OPERATORS.has(node.operatorToken.kind) && inert(node.left) && inert(node.right);
  // a number formatted for GLSL (`${ZONE_FACING_MIN.toFixed(4)}`): the one call allowed, with a literal precision
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'toFixed') {
    return inert(node.expression.expression) && node.arguments.length === 1 && ts.isNumericLiteral(node.arguments[0]);
  }
  return false;
}

/** The function assigned to `<x>.onBeforeCompile` that `node` lies in, if any. */
function inCompileHook(node) {
  for (let at = node.parent; at; at = at.parent) {
    if (!(ts.isFunctionExpression(at) || ts.isArrowFunction(at))) continue;
    const assignment = at.parent;
    if (assignment && ts.isBinaryExpression(assignment) && assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && assignment.right === at && ts.isPropertyAccessExpression(assignment.left) && assignment.left.name.text === 'onBeforeCompile') return true;
  }
  return false;
}

const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
const isAssignment = (node) => ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken].includes(node.operatorToken.kind);
/** `<param>.fragmentShader` or `<param>.vertexShader`. */
const shaderField = (node, param) => ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
  && node.expression.text === param && SHADER_FIELDS.has(node.name.text);
/** A string array literal (`['a', 'b']`, `as const` allowed): its elements, or null. */
function stringArray(value) {
  const array = value && ts.isAsExpression(value) ? value.expression : value;
  if (!array || !ts.isArrayLiteralExpression(array)) return null;
  return array.elements.every((element) => ts.isStringLiteral(element)) ? array.elements.map((element) => element.text) : null;
}

/**
 * Whether `node` (inside a declared hook whose parameter is `param`) reaches only the hook's shader text: up to the
 * right side of an assignment to `<param>.fragmentShader`/`.vertexShader` through templates, `+`, parentheses and
 * `.replace`/`.replaceAll` (as receiver or argument). The text then reaches nothing but the program a page compiles.
 */
function flowsToShaderText(node, param) {
  for (let at = node; at.parent; at = at.parent) {
    const up = at.parent;
    if (isAssignment(up)) return up.right === at && up.operatorToken.kind === ts.SyntaxKind.EqualsToken && shaderField(up.left, param);
    if (ts.isTemplateSpan(up) || ts.isTemplateExpression(up) || ts.isParenthesizedExpression(up)) continue;
    if (ts.isBinaryExpression(up) && up.operatorToken.kind === ts.SyntaxKind.PlusToken) continue;
    if (ts.isPropertyAccessExpression(up) && up.expression === at && TEXT_CALLS.has(up.name.text)
      && ts.isCallExpression(up.parent) && up.parent.expression === up) continue;
    if (ts.isCallExpression(up) && (up.arguments.includes(at) || up.expression === at) && ts.isPropertyAccessExpression(up.expression)
      && TEXT_CALLS.has(up.expression.name.text)) continue;
    return false;
  }
  return false;
}

/** The marked regions of `text`: [{ name, start, end }] (offsets of the begin line's start and the end line's end). */
export function shaderRegionSpans(text) {
  const spans = [], problems = [];
  let open = null;
  for (const match of text.matchAll(MARKER)) {
    const [, edge, name] = match, line = text.slice(0, match.index).split('\n').length;
    if (!name) { problems.push(`a shader-text:${edge} marker without a name (line ${line})`); continue; }
    if (edge === 'begin') {
      if (open) problems.push(`region ${name} begins inside region ${open.name} (line ${line})`);
      else open = { name, start: match.index };
    } else if (!open || open.name !== name) problems.push(`region ${name} ends where it did not begin (line ${line})`);
    else { spans.push({ ...open, end: match.index + match[0].length }); open = null; }
  }
  if (open) problems.push(`region ${open.name} never ends`);
  return { spans, problems };
}

/** The deepest node that holds the whole span, and the children of it the span covers (whole ones, or a problem). */
function regionContainer(source, span) {
  let container = source;
  for (;;) {
    let inner = null;
    ts.forEachChild(container, (child) => {
      if (!inner && child.getStart(source) < span.start && child.end > span.end) inner = child;
    });
    if (!inner) break;
    container = inner;
  }
  const children = ts.isSourceFile(container) || ts.isBlock(container) ? container.statements
    : ts.isArrayLiteralExpression(container) ? container.elements : null;
  if (!children) return { container, covered: null, problem: `lies inside a ${ts.SyntaxKind[container.kind]}, not a block, the top level or an array` };
  const covered = children.filter((child) => child.getStart(source) < span.end && child.end > span.start);
  const partial = covered.find((child) => child.getStart(source) < span.start || child.end > span.end);
  if (partial) return { container, covered: null, problem: `cuts through the statement at line ${lineOf(source, partial)}` };
  return { container, covered, problem: null };
}

/** The function declaration whose body is `block`, if any. */
const functionOf = (block) => (block.parent && (ts.isFunctionDeclaration(block.parent) || ts.isFunctionExpression(block.parent)
  || ts.isArrowFunction(block.parent) || ts.isMethodDeclaration(block.parent)) ? block.parent : null);
const enclosingFunction = (node) => {
  for (let at = node.parent; at; at = at.parent) if (ts.isFunctionLike(at)) return at;
  return null;
};

/** A splice's statements (a declared hook's body): problems, the switches they read, their local names. */
function checkSplice(statements, param, maskedNames, source, label) {
  const problems = [], switches = [], locals = new Set();
  const refuse = (node, why) => problems.push(`${label}: ${why} (line ${lineOf(source, node)})`);
  const declare = (list) => { for (const declaration of list.declarations) if (ts.isIdentifier(declaration.name)) locals.add(declaration.name.text); };
  const collect = (node) => { if (ts.isVariableDeclarationList(node)) declare(node); ts.forEachChild(node, collect); };
  statements.forEach(collect);
  const visit = (node) => {
    const K = ts.SyntaxKind;
    switch (node.kind) {
      case K.IfStatement: case K.Block: case K.VariableStatement: case K.ExpressionStatement: case K.ForOfStatement:
      case K.ParenthesizedExpression: case K.ConditionalExpression: case K.TemplateExpression: case K.TemplateSpan:
      case K.TemplateHead: case K.TemplateMiddle: case K.TemplateTail: case K.StringLiteral: case K.NumericLiteral:
      case K.NoSubstitutionTemplateLiteral: case K.TrueKeyword: case K.FalseKeyword: case K.NullKeyword:
      case K.QuestionToken: case K.ColonToken:
        break;
      case K.VariableDeclarationList:
        if (ts.isVariableStatement(node.parent) || ts.isForOfStatement(node.parent)) break;
        refuse(node, 'a declaration list outside a statement'); return;
      case K.VariableDeclaration:
        if (!ts.isIdentifier(node.name)) { refuse(node, 'a destructuring declaration'); return; }
        if (node.type) { refuse(node, 'a typed declaration'); return; }
        if (node.initializer) visit(node.initializer);
        return;
      case K.PrefixUnaryExpression:
        if ([K.ExclamationToken, K.MinusToken].includes(node.operator)) break;
        refuse(node, 'an update'); return;
      case K.BinaryExpression: {
        const op = node.operatorToken.kind;
        if (isAssignment(node)) {
          const left = node.left;
          if (!(ts.isIdentifier(left) && locals.has(left.text)) && !shaderField(left, param)) { refuse(node, `an assignment to ${left.getText(source)}`); return; }
          visit(node.right); return;
        }
        if ([K.EqualsEqualsEqualsToken, K.ExclamationEqualsEqualsToken, K.AmpersandAmpersandToken, K.BarBarToken,
          K.QuestionQuestionToken, K.PlusToken, K.MinusToken, K.AsteriskToken, K.SlashToken, K.LessThanToken,
          K.GreaterThanToken, K.LessThanEqualsToken, K.GreaterThanEqualsToken].includes(op)) { visit(node.left); visit(node.right); return; }
        refuse(node, `the operator ${node.operatorToken.getText(source)}`); return;
      }
      case K.CallExpression:
        if (ts.isPropertyAccessExpression(node.expression) && TEXT_CALLS.has(node.expression.name.text) && !node.questionDotToken) {
          visit(node.expression.expression);
          node.arguments.forEach(visit);
          return;
        }
        refuse(node, `a call of ${node.expression.getText(source)}`); return;
      case K.PropertyAccessExpression: {
        const base = node.expression;
        if (shaderField(node, param)) return;
        if (ts.isPropertyAccessExpression(base) && ts.isIdentifier(base.expression) && base.expression.text === param
          && base.name.text === 'defines' && !base.questionDotToken) {
          if (!SWITCH.test(node.name.text)) { refuse(node, `the define ${node.name.text} is no COT_ switch`); return; }
          switches.push(node.name.text);
          return;
        }
        refuse(node, `the property read ${node.getText(source)}`); return;
      }
      case K.Identifier:
        if (node.text === 'undefined' || locals.has(node.text) || maskedNames.has(node.text)) return;
        refuse(node, node.text === param ? `${param} read whole` : `${node.text}, neither its own local nor masked text`); return;
      default:
        refuse(node, `a ${K[node.kind]}`); return;
    }
    ts.forEachChild(node, visit);
  };
  statements.forEach(visit);
  return { problems, switches, locals };
}

/** The parts of the file the declaration masks, or the problems that keep it whole. */
function analyze(text, filename, declaration) {
  const { consts = [], regions = [], hooks = [], switchLists = {} } = declaration;
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const problems = [], declarations = new Map(), switches = [];
  const { spans, problems: markerProblems } = shaderRegionSpans(text);
  problems.push(...markerProblems);
  for (const name of regions) if (!spans.some((span) => span.name === name)) problems.push(`region ${name} is not marked`);
  for (const span of spans) if (!regions.includes(span.name)) problems.push(`region ${span.name} is not declared`);
  const inSpan = (node) => spans.some((span) => node.getStart(source) >= span.start && node.end <= span.end);

  // A constant (declared, or in a text region) held to the constant's rule.
  const holdConstant = (statement, declaration, label, { arrays }) => {
    const name = declaration.name.text;
    if (declarations.has(name)) { problems.push(`${name} is declared twice`); return; }
    declarations.set(name, { statement, declaration });
    if (statement.declarationList.declarations.length !== 1) problems.push(`${name} shares its statement`);
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) problems.push(`${name} is not a const`);
    if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) problems.push(`${name} is exported`);
    const value = declaration.initializer;
    if (arrays && stringArray(value)) return;
    if (!value || !(ts.isStringLiteralLike(value) || ts.isTemplateExpression(value))) problems.push(`${name} is not a string or an untagged template${arrays ? ' or a string array' : ''}${label}`);
    else if (ts.isTemplateExpression(value)) {
      for (const templateSpan of value.templateSpans) if (!inert(templateSpan.expression)) problems.push(`${name} interpolates ${templateSpan.expression.getText(source)}`);
    }
  };
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || inSpan(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && consts.includes(declaration.name.text)) holdConstant(statement, declaration, '', { arrays: false });
    }
  }

  // The declared hooks: top-level functions; their parameter, and their code outside the regions reads shader text only
  // into shader text.
  const hookParams = new Map();
  for (const name of hooks) {
    const found = source.statements.filter((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    if (found.length !== 1) { problems.push(`hook ${name} is not one top-level function`); continue; }
    const [hook] = found, [first] = hook.parameters;
    if (!first || !ts.isIdentifier(first.name)) { problems.push(`hook ${name} has no named shader parameter`); continue; }
    hookParams.set(hook, first.name.text);
  }
  const hookOf = (node) => {
    for (let at = node.parent; at; at = at.parent) if (hookParams.has(at)) return at;
    return null;
  };

  // The regions, by container.
  const kinds = [], splices = [];
  for (const span of spans) {
    const label = `region ${span.name}`;
    const { container, covered, problem } = regionContainer(source, span);
    if (problem) { problems.push(`${label} ${problem}`); continue; }
    if (!covered.length) { problems.push(`${label} holds nothing`); continue; }
    if (ts.isSourceFile(container)) {
      kinds.push({ span, kind: 'text' });
      for (const statement of covered) {
        if (!ts.isVariableStatement(statement)) { problems.push(`${label}: a ${ts.SyntaxKind[statement.kind]} at the top level (line ${lineOf(source, statement)})`); continue; }
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) { problems.push(`${label}: a destructuring declaration (line ${lineOf(source, statement)})`); continue; }
          holdConstant(statement, declaration, ` (${label})`, { arrays: true });
        }
      }
    } else if (ts.isArrayLiteralExpression(container)) {
      kinds.push({ span, kind: 'switch' });
      const holder = container.parent && ts.isAsExpression(container.parent) ? container.parent.parent : container.parent;
      const list = holder && ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name) ? holder.name.text : null;
      if (!list || !Object.hasOwn(switchLists, list) || holder.parent.parent.parent !== source) {
        problems.push(`${label}: elements of an array that is not a declared switch list`); continue;
      }
      for (const element of covered) {
        if (ts.isStringLiteral(element) && SWITCH.test(element.text)) switches.push(element.text);
        else problems.push(`${label}: ${element.getText(source)} is no 'COT_' switch`);
      }
    } else {
      const fn = functionOf(container) ?? enclosingFunction(container);
      const hook = fn && hookParams.has(fn) ? fn : null;
      if (hook && functionOf(container) === hook) {
        kinds.push({ span, kind: 'splice' });
        splices.push({ span, statements: covered, param: hookParams.get(hook), label });
        continue;
      }
      kinds.push({ span, kind: 'define' });
      for (const statement of covered) {
        const assignment = ts.isExpressionStatement(statement) ? statement.expression : null;
        const left = assignment && ts.isBinaryExpression(assignment) && assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken ? assignment.left : null;
        const ok = left && ts.isPropertyAccessExpression(left) && ts.isPropertyAccessExpression(left.expression)
          && left.expression.name.text === 'defines' && ts.isIdentifier(left.expression.expression)
          && SWITCH.test(left.name.text) && (ts.isNumericLiteral(assignment.right) || ts.isStringLiteral(assignment.right));
        if (ok) switches.push(left.name.text);
        else problems.push(`${label}: not \`<material>.defines.COT_<SWITCH> = <literal>\` (line ${lineOf(source, statement)})`);
      }
    }
  }
  for (const name of consts) if (!declarations.has(name)) problems.push(`${name} is not a top-level declaration`);
  // the splices name masked constants (declared or a text region's) and their own locals
  const maskedNames = new Set(declarations.keys());
  for (const splice of splices) {
    const checked = checkSplice(splice.statements, splice.param, maskedNames, source, splice.label);
    problems.push(...checked.problems);
    switches.push(...checked.switches);
  }

  // A switch list's uses outside the regions are pinned (steps.mjs SHADER_TEXT switchLists): what it does with an element.
  for (const [list, { pin }] of Object.entries(switchLists)) {
    const uses = [];
    const visit = (node) => {
      if (ts.isIdentifier(node) && node.text === list && !(ts.isVariableDeclaration(node.parent) && node.parent.name === node)) {
        let statement = node;
        while (statement.parent && !ts.isBlock(statement.parent) && !ts.isSourceFile(statement.parent)) statement = statement.parent;
        uses.push(statement.getText(source).replace(/\s+/g, ' '));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    const now = h16(uses.join('\n'));
    if (now !== pin) problems.push(`switch list ${list}: its uses changed; review that it only copies defines and set pin: '${now}'`);
  }

  // Each masked constant is named only where its text reaches nothing but a program.
  const initializers = [...declarations.values()].map(({ declaration }) => declaration.initializer).filter(Boolean);
  const insideText = (node) => initializers.some((value) => node.pos >= value.pos && node.end <= value.end);
  const visit = (node) => {
    if (ts.isIdentifier(node) && declarations.has(node.text) && declarations.get(node.text).declaration.name !== node
      && !insideText(node) && !inSpan(node) && !inCompileHook(node)) {
      const hook = hookOf(node);
      if (!hook || !flowsToShaderText(node, hookParams.get(hook))) {
        problems.push(`${node.text} is named outside a compile hook (line ${lineOf(source, node)})`);
      }
    }
    // a declared hook reads its shader text, outside its regions, only into its shader text
    if (ts.isPropertyAccessExpression(node) && !inSpan(node)) {
      const hook = hookOf(node), param = hook && hookParams.get(hook);
      if (param && shaderField(node, param) && !(isAssignment(node.parent) && node.parent.left === node) && !flowsToShaderText(node, param)) {
        problems.push(`hook ${hook.name.text} reads ${node.getText(source)} into more than its shader text (line ${lineOf(source, node)})`);
      }
    }
    if (ts.isIdentifier(node) && hookParams.has(hookOf(node) ?? {}) && node.text === hookParams.get(hookOf(node))
      && isAssignment(node.parent) && node.parent.left === node) problems.push(`hook ${hookOf(node).name.text} reassigns its shader`);
    if (ts.isReturnStatement(node) && node.expression && hookOf(node) && enclosingFunction(node) === hookOf(node)) {
      problems.push(`hook ${hookOf(node).name.text} returns a value (line ${lineOf(source, node)})`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { source, declarations, spans, kinds, switches: [...new Set(switches)].sort(), problems };
}

/**
 * `text` (the module `filename`) with the declared constants and regions masked, or the problems that keep it whole:
 * { masked: string | null, problems: string[], switches: string[] }. `declaration` is the file's SHADER_TEXT entry
 * ({ consts, regions, hooks, switchLists }). `switches`: the COT_ defines the masked regions name, which the caller
 * proves no CPU or world code names (switchSites).
 */
export function maskShaderText(text, filename, declaration) {
  const { declarations, spans, switches, problems } = analyze(text, filename, declaration);
  if (problems.length) return { masked: null, problems, switches };
  // Back to front, so earlier offsets hold; each declaration and region becomes one marker naming it.
  const cuts = [
    ...[...declarations].filter(([, { statement }]) => !spans.some((span) => statement.getStart() >= span.start && statement.end <= span.end))
      .map(([name, { statement }]) => ({
        // its leading comments, from after a region that ends among them (the region's own cut takes the marker)
        start: Math.max(statement.getFullStart(), ...spans.filter((span) => span.end > statement.getFullStart() && span.end <= statement.getStart()).map((span) => span.end)),
        end: statement.getEnd(), mark: `\n/* shader text: ${name} */`,
      })),
    ...spans.map((span) => ({ start: span.start, end: span.end, mark: `/* shader text: ${span.name} */` })),
  ].sort((a, b) => b.start - a.start);
  const overlap = cuts.find((cut, i) => i > 0 && cut.end > cuts[i - 1].start);
  if (overlap) return { masked: null, problems: [`a masked span overlaps another at offset ${overlap.start}`], switches };
  let masked = text;
  for (const cut of cuts) masked = `${masked.slice(0, cut.start)}${cut.mark}${masked.slice(cut.end)}`;
  return { masked, problems, switches };
}

/** The switches of `names` that `text` (the module `filename`) names in code, comments aside. */
export function switchSites(text, filename, names) {
  const present = names.filter((name) => text.includes(name));
  if (!present.length) return [];
  const kind = filename.endsWith('.tsx') ? ts.ScriptKind.TSX : filename.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, kind);
  const comments = [];
  const visit = (node) => {
    comments.push(...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []), ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []));
    ts.forEachChild(node, visit);
  };
  visit(source);
  comments.sort((a, b) => b.pos - a.pos);
  let code = text, last = Infinity;
  for (const { pos, end } of comments) {
    if (end > last) continue; // already cut (a range seen from two nodes)
    code = `${code.slice(0, pos)}${' '.repeat(end - pos)}${code.slice(end)}`;
    last = pos;
  }
  return present.filter((name) => new RegExp(`\\b${name}\\b`).test(code));
}

/** `text` with every declared constant's text changed (a GLSL comment at its end) and every splice, switch and define
 *  region removed: what closure-trace.mjs --shaders loads in place of the file, so a build that followed them would leave
 *  its ledger digest. Throws on an undeclared name or a region the checker refuses. */
export function perturbShaderText(text, filename, declaration) {
  const { declarations, kinds, problems } = analyze(text, filename, declaration);
  const declared = declaration.consts ?? [];
  if (problems.length) throw new Error(`${filename}: the shader text does not hold: ${problems.join('; ')}`);
  const cuts = [];
  for (const [name, { declaration: node }] of declarations) {
    const value = node.initializer;
    if (!ts.isStringLiteralLike(value) && !ts.isTemplateExpression(value)) continue; // a text region's string array
    const at = value.getEnd() - 1;
    cuts.push({ start: at, end: at, mark: ts.isStringLiteral(value) ? ' /* cot shader perturb */' : '\n// cot shader perturb\n', name });
  }
  if (declared.some((name) => !declarations.has(name))) throw new Error(`${filename}: a declared shader constant was not found`);
  for (const { span, kind } of kinds) if (kind !== 'text') cuts.push({ start: span.start, end: span.end, mark: `// cot shader perturb: ${span.name} removed` });
  let out = text;
  for (const cut of cuts.sort((a, b) => b.start - a.start)) out = `${out.slice(0, cut.start)}${cut.mark}${out.slice(cut.end)}`;
  return out;
}

/** Whether two texts of the module `filename` are the same code token for token (comments and whitespace aside; the
 *  text inside strings and templates counted whole): an edit that only adds region markers or comments. */
export function sameTokens(a, b, filename) {
  const leaves = (text) => {
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const out = [];
    const walk = (node) => {
      if (ts.isJSDoc(node)) return;
      const children = node.getChildren(source);
      if (!children.length) { if (node.kind !== ts.SyntaxKind.EndOfFileToken) out.push(`${node.kind}:${node.getText(source)}`); return; }
      children.forEach(walk);
    };
    walk(source);
    return out;
  };
  const left = leaves(a), right = leaves(b);
  return left.length === right.length && left.every((leaf, i) => leaf === right[i]);
}
