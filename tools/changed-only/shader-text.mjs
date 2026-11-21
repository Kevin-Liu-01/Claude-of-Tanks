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
//   - named only inside the body of a function assigned to `<material>.onBeforeCompile` or inside another declared
//     constant's text (the name counted however it is scoped, so a shadowing local counts against it). A hook that is a
//     named function (materials.ts vehicleAmbientFloorHook and its FIELD_DUST_GLSL) does not qualify: any code may call it.
// Anything else is a problem, and the file is keyed by its bytes (the fleet core as before 274): never a skipped input.
// The masked span is the whole declaration with its leading comments (274.0 edited the constant's doc comment too).
// tools/changed-only/closure-trace.mjs --shaders moves the text at run time and proves no geometry follows it.
import ts from 'typescript-compiler-api';

const SAFE_OPERATORS = new Set([ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken]);

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

/**
 * `text` (the module `filename`) with the declarations of `names` masked, or the problems that keep it whole:
 * { masked: string | null, problems: string[] }.
 */
export function maskShaderText(text, filename, names) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const problems = [], declarations = new Map();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !names.includes(declaration.name.text)) continue;
      const name = declaration.name.text;
      if (declarations.has(name)) { problems.push(`${name} is declared twice`); continue; }
      declarations.set(name, { statement, declaration });
      if (statement.declarationList.declarations.length !== 1) problems.push(`${name} shares its statement`);
      if (!(statement.declarationList.flags & ts.NodeFlags.Const)) problems.push(`${name} is not a const`);
      if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) problems.push(`${name} is exported`);
      const value = declaration.initializer;
      if (!value || !(ts.isStringLiteralLike(value) || ts.isTemplateExpression(value))) problems.push(`${name} is not a string or an untagged template`);
      else if (ts.isTemplateExpression(value)) {
        for (const span of value.templateSpans) if (!inert(span.expression)) problems.push(`${name} interpolates ${span.expression.getText(source)}`);
      }
    }
  }
  for (const name of names) if (!declarations.has(name)) problems.push(`${name} is not a top-level declaration`);
  const initializers = [...declarations.values()].map(({ declaration }) => declaration.initializer).filter(Boolean);
  const insideText = (node) => initializers.some((value) => node.pos >= value.pos && node.end <= value.end);
  const visit = (node) => {
    if (ts.isIdentifier(node) && declarations.has(node.text) && declarations.get(node.text).declaration.name !== node
      && !insideText(node) && !inCompileHook(node)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      problems.push(`${node.text} is named outside a compile hook (line ${line + 1})`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (problems.length) return { masked: null, problems };
  // Back to front, so earlier offsets hold; each declaration becomes one marker naming it.
  let masked = text;
  for (const [name, { statement }] of [...declarations].sort((a, b) => b[1].statement.pos - a[1].statement.pos)) {
    masked = `${masked.slice(0, statement.getFullStart())}\n/* shader text: ${name} */${masked.slice(statement.getEnd())}`;
  }
  return { masked, problems };
}

/** `text` with every declared constant's text changed (a GLSL comment at its end): what closure-trace.mjs --shaders loads
 *  in place of the file, so a build that followed the text would leave its ledger digest. Throws on an undeclared name. */
export function perturbShaderText(text, filename, names) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const ends = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && names.includes(declaration.name.text) && declaration.initializer) {
        const value = declaration.initializer;
        ends.push([value.getEnd() - 1, ts.isStringLiteral(value) ? ' /* cot shader perturb */' : '\n// cot shader perturb\n']);
      }
    }
  }
  if (ends.length !== names.length) throw new Error(`${filename}: ${names.length - ends.length} declared shader constant(s) not found`);
  let out = text;
  for (const [at, insert] of ends.sort((a, b) => b[0] - a[0])) out = `${out.slice(0, at)}${insert}${out.slice(at)}`;
  return out;
}
