#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import ts from 'typescript-compiler-api';

export const CODE_QUALITY_LIMITS = Object.freeze({
  cyclomatic: 22,
  cognitive: 22,
  halsteadDifficulty: 80,
});

export interface FunctionQualityMetric {
  file: string;
  line: number;
  name: string;
  cyclomatic: number;
  cognitive: number;
  halsteadDifficulty: number;
}

export interface ExplicitTypeMetric {
  file: string;
  line: number;
  kind: 'any' | 'unknown';
}

export interface SourceQualityReport {
  functions: FunctionQualityMetric[];
  explicitTypes: ExplicitTypeMetric[];
}

const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

const OPERAND_TOKENS = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.PrivateIdentifier,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.ThisKeyword,
  ts.SyntaxKind.SuperKeyword,
]);

const IGNORED_OPERATOR_TOKENS = new Set([
  ts.SyntaxKind.OpenBraceToken,
  ts.SyntaxKind.CloseBraceToken,
  ts.SyntaxKind.CommaToken,
  ts.SyntaxKind.SemicolonToken,
  ts.SyntaxKind.ColonToken,
]);

function scriptKind(fileName: string): ts.ScriptKind {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.(?:js|mjs)$/i.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function sourceLine(source: ts.SourceFile, position: number): number {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

function propertyName(node: ts.PropertyName | undefined): string | null {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function functionName(node: ts.FunctionLikeDeclaration): string {
  if ('name' in node) {
    const named = propertyName(node.name);
    if (named) return named;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent)) return propertyName(parent.name) ?? '<property>';
  if (ts.isCallExpression(parent)) return '<callback>';
  return '<anonymous>';
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node);
}

interface FlowMetric {
  cyclomatic: number;
  cognitive: number;
}

function flowMetric(root: ts.FunctionLikeDeclaration): FlowMetric {
  let cyclomatic = 1;
  let cognitive = 0;

  const walkChildren = (node: ts.Node, nesting: number): void => {
    node.forEachChild((child) => walk(child, nesting));
  };

  type StructuralHandler = (node: ts.Node, nesting: number) => boolean;

  const handleIf: StructuralHandler = (node, nesting) => {
    if (!ts.isIfStatement(node)) return false;
    cyclomatic += 1;
    const isElseIf = ts.isIfStatement(node.parent)
      && node.parent.elseStatement === node;
    cognitive += 1 + (isElseIf ? 0 : nesting);
    walk(node.expression, nesting);
    walk(node.thenStatement, nesting + 1);
    if (node.elseStatement) {
      if (!ts.isIfStatement(node.elseStatement)) cognitive += 1;
      walk(node.elseStatement, isElseIf ? nesting : nesting + 1);
    }
    return true;
  };

  const handleLoop: StructuralHandler = (node, nesting) => {
    const loop = ts.isForStatement(node) || ts.isForInStatement(node)
      || ts.isForOfStatement(node) || ts.isWhileStatement(node)
      || ts.isDoStatement(node);
    if (!loop) return false;
    cyclomatic += 1;
    cognitive += 1 + nesting;
    walkChildren(node, nesting + 1);
    return true;
  };

  const handleSwitch: StructuralHandler = (node, nesting) => {
    if (!ts.isSwitchStatement(node)) return false;
    cognitive += 1 + nesting;
    walk(node.expression, nesting);
    for (const clause of node.caseBlock.clauses) {
      if (ts.isCaseClause(clause)) cyclomatic += 1;
      for (const statement of clause.statements) walk(statement, nesting + 1);
    }
    return true;
  };

  const handleCatchOrConditional: StructuralHandler = (node, nesting) => {
    if (!ts.isCatchClause(node) && !ts.isConditionalExpression(node)) return false;
    cyclomatic += 1;
    cognitive += 1 + nesting;
    walkChildren(node, nesting + 1);
    return true;
  };

  const structuralHandlers = [handleIf, handleLoop, handleSwitch, handleCatchOrConditional];

  const recordLogicalBranch = (node: ts.Node): void => {
    if (!ts.isBinaryExpression(node) || !LOGICAL_OPERATORS.has(node.operatorToken.kind)) return;
    cyclomatic += 1;
    const parentIsSameSequence = ts.isBinaryExpression(node.parent)
      && node.parent.operatorToken.kind === node.operatorToken.kind;
    if (!parentIsSameSequence) cognitive += 1;
  };

  const recordLabeledJump = (node: ts.Node): void => {
    const isJump = ts.isBreakStatement(node) || ts.isContinueStatement(node);
    if (isJump && node.label) cognitive += 1;
  };

  const walk = (node: ts.Node, nesting: number): void => {
    if (node !== root && isFunctionLike(node)) return;
    for (const handleStructuralNode of structuralHandlers) {
      if (handleStructuralNode(node, nesting)) return;
    }
    recordLogicalBranch(node);
    recordLabeledJump(node);
    walkChildren(node, nesting);
  };

  if (root.body) walk(root.body, 0);
  return { cyclomatic, cognitive };
}

function containsPosition(ranges: Array<readonly [number, number]>, position: number): boolean {
  return ranges.some(([start, end]) => position >= start && position < end);
}

function ignoredHalsteadRanges(root: ts.FunctionLikeDeclaration): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  const visit = (node: ts.Node): void => {
    if (node !== root && isFunctionLike(node)) {
      ranges.push([node.getStart(), node.end]);
      return;
    }
    if (ts.isTypeNode(node)) {
      ranges.push([node.getStart(), node.end]);
      return;
    }
    node.forEachChild(visit);
  };
  visit(root);
  return ranges;
}

function halsteadDifficulty(
  source: ts.SourceFile,
  root: ts.FunctionLikeDeclaration,
): number {
  const start = root.getStart(source);
  const sourceText = source.text.slice(start, root.end);
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    scriptKind(source.fileName) === ts.ScriptKind.TSX
      ? ts.LanguageVariant.JSX
      : ts.LanguageVariant.Standard,
    sourceText,
  );
  const ignoredRanges = ignoredHalsteadRanges(root);
  const operators = new Set<string>();
  const operands = new Set<string>();
  let totalOperands = 0;

  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const absolutePosition = start + scanner.getTokenPos();
    if (containsPosition(ignoredRanges, absolutePosition)) continue;
    const tokenText = scanner.getTokenText();
    if (OPERAND_TOKENS.has(token)) {
      operands.add(tokenText);
      totalOperands += 1;
    } else if (!IGNORED_OPERATOR_TOKENS.has(token)) {
      operators.add(ts.tokenToString(token) ?? tokenText);
    }
  }

  if (operands.size === 0) return 0;
  return Number(((operators.size / 2) * (totalOperands / operands.size)).toFixed(2));
}

export function analyzeSourceText(
  fileName: string,
  text: string,
): SourceQualityReport {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(fileName),
  );
  const report: SourceQualityReport = { functions: [], explicitTypes: [] };

  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword || node.kind === ts.SyntaxKind.UnknownKeyword) {
      report.explicitTypes.push({
        file: fileName,
        line: sourceLine(source, node.getStart(source)),
        kind: node.kind === ts.SyntaxKind.AnyKeyword ? 'any' : 'unknown',
      });
    }
    if (isFunctionLike(node) && node.body) {
      const flow = flowMetric(node);
      report.functions.push({
        file: fileName,
        line: sourceLine(source, node.getStart(source)),
        name: functionName(node),
        cyclomatic: flow.cyclomatic,
        cognitive: flow.cognitive,
        halsteadDifficulty: halsteadDifficulty(source, node),
      });
    }
    node.forEachChild(visit);
  };
  visit(source);
  return report;
}

function trackedRuntimeFiles(root: string): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return output.split('\0').filter((file) => {
    if (!/^(?:src|server|api|tools)\//.test(file)) return false;
    if (!/\.(?:ts|tsx|js|mjs)$/.test(file)) return false;
    if (/\.selftest\.|(?:^|\/)generated(?:\/|$)/.test(file)) return false;
    return true;
  });
}

function isViolation(metric: FunctionQualityMetric): boolean {
  return metric.cyclomatic >= CODE_QUALITY_LIMITS.cyclomatic
    || metric.cognitive >= CODE_QUALITY_LIMITS.cognitive
    || metric.halsteadDifficulty >= CODE_QUALITY_LIMITS.halsteadDifficulty;
}

function runCli(): void {
  const root = process.cwd();
  const fileArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const files = fileArgs.length
    ? fileArgs.map((file) => relative(root, resolve(root, file)))
    : trackedRuntimeFiles(root);
  const report: SourceQualityReport = { functions: [], explicitTypes: [] };
  for (const file of files) {
    const analyzed = analyzeSourceText(file, readFileSync(resolve(root, file), 'utf8'));
    report.functions.push(...analyzed.functions);
    report.explicitTypes.push(...analyzed.explicitTypes);
  }
  const violations = report.functions.filter(isViolation).sort((a, b) =>
    Math.max(b.cyclomatic / CODE_QUALITY_LIMITS.cyclomatic,
      b.cognitive / CODE_QUALITY_LIMITS.cognitive,
      b.halsteadDifficulty / CODE_QUALITY_LIMITS.halsteadDifficulty)
    - Math.max(a.cyclomatic / CODE_QUALITY_LIMITS.cyclomatic,
      a.cognitive / CODE_QUALITY_LIMITS.cognitive,
      a.halsteadDifficulty / CODE_QUALITY_LIMITS.halsteadDifficulty));
  const explicitAny = report.explicitTypes.filter((entry) => entry.kind === 'any');
  const explicitUnknown = report.explicitTypes.filter((entry) => entry.kind === 'unknown');
  const summary = {
    files: files.length,
    functions: report.functions.length,
    violations: violations.length,
    explicitAny: explicitAny.length,
    explicitUnknown: explicitUnknown.length,
    limits: CODE_QUALITY_LIMITS,
  };

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ summary, violations, explicitAny, explicitUnknown }, null, 2)}\n`);
  } else {
    console.log(`code-quality-metrics: ${summary.files} files, ${summary.functions} functions, ${summary.violations} complexity violations, ${summary.explicitAny} any, ${summary.explicitUnknown} unknown`);
    for (const metric of violations.slice(0, 40)) {
      console.log(`${metric.file}:${metric.line} ${metric.name} — cyclomatic=${metric.cyclomatic} cognitive=${metric.cognitive} halstead=${metric.halsteadDifficulty}`);
    }
    if (violations.length > 40) console.log(`... ${violations.length - 40} more complexity violations`);
  }

  if (process.argv.includes('--gate')
    && (violations.length > 0 || explicitAny.length > 0 || explicitUnknown.length > 0)) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(new URL(import.meta.url).pathname)) runCli();
