import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import vm from 'node:vm';
import { CSMShader } from 'three/examples/jsm/csm/CSMShader.js';
import { parseAst } from 'rolldown/parseAst';
import config from '../vite.config.ts';
import { glslMinify, glslTokens, isProjectSource, isShaderProgram, looksLikeGlsl, minifyGlsl, minifyGlslLiterals } from './viteGlslMinify.ts';

// The build-time GLSL literal minifier (2026-10-02, tools/viteGlslMinify.ts): comments, line-start indentation,
// trailing whitespace and blank lines leave shader literals; lines, directives, in-line text, interpolations and the
// outer edges of every literal stay as written. Proven here on fixtures, on three.js's own shader library (every
// #include and every anchor the game patches survives, token streams unchanged) and on every shader literal of the
// repository's sources. The browser proof (every program links, frames identical) is in the commit that added it.

const ROOT = resolve(new URL('..', import.meta.url).pathname);

// the line rules
{
  const shader = '\n  // header comment\n  precision highp float;   \n  #include <common>\n\n  uniform vec3 uColor; /* tint */\n'
    + '  void main() {\n    gl_FragColor = vec4( uColor, 1.0 ); // keep the in-line spacing\n  }\n  ';
  assert.equal(minifyGlsl(shader), '\nprecision highp float;\n#include <common>\nuniform vec3 uColor;\nvoid main() {\ngl_FragColor = vec4( uColor, 1.0 );\n}\n',
    'comments, indentation, trailing spaces and blank lines go; every line break between kept lines stays');
  assert.equal(minifyGlsl('  vec3 a = b;\n  vec3 c = d;  '), '  vec3 a = b;\nvec3 c = d;  ', 'the outer edges of a literal (a concatenation piece) keep their whitespace');
  assert.equal(minifyGlsl('a/*x*/b\nc'), 'a b\nc', 'a block comment separates like whitespace');
  assert.equal(minifyGlsl('a /* one\n two */ b\nc'), 'a\nb\nc', 'a multi-line block comment keeps a line break');
  assert.equal(minifyGlsl('#define F(x) \\\n    (x * 2.0)\nfloat y = F(1.0);\n'), '#define F(x) \\\n    (x * 2.0)\nfloat y = F(1.0);\n',
    'a continued line keeps its leading whitespace');
  assert.equal(minifyGlsl('#pragma unroll_loop_start\n  for ( int i = 0; i < 4; i ++ ) {\n    s += x[ i ];\n  }\n  #pragma unroll_loop_end\n'),
    '#pragma unroll_loop_start\nfor ( int i = 0; i < 4; i ++ ) {\ns += x[ i ];\n}\n#pragma unroll_loop_end\n', 'three\'s unroll pattern keeps its line breaks');
  for (const [text, why] of [
    ['float a; // a comment that runs to the end', 'an open line comment may continue into the next concatenated piece'],
    ['float a; /* unterminated\nfloat b;', 'an unterminated block comment'],
    ['still a comment */ float a;\nfloat b;', 'a stray terminator: this piece may start inside a comment'],
    ['float a; // spliced \\\nfloat b;\n', 'a line comment spliced onto the next line'],
  ]) assert.equal(minifyGlsl(text), null, why);
}

// detection is conservative: multi-line and an unmistakable GLSL construct
{
  for (const text of ['void main() {\n  gl_Position = vec4(0.0);\n}', '#ifdef USE_MAP\n  diffuseColor *= texture2D( map, vMapUv );\n#endif\n',
    'uniform sampler2D tDiffuse;\nvarying vec2 vUv;\n', 'precision mediump float;\nfloat x;\n']) assert.equal(looksLikeGlsl(text), true, text);
  for (const text of ['void main() { gl_Position = vec4(0.0); }', '.panel { color: red; }\n.other { margin: 0; }\n',
    '<div class="x">\n  <span>main</span>\n</div>', 'function main() {\n  return 1;\n}\n', 'Use #include to share code\nacross files']) {
    assert.equal(looksLikeGlsl(text), false, text);
  }
}

// the token stream the build checks: comments and whitespace only
{
  assert.deepEqual(glslTokens('#define X 1 // c\nvoid main(){ x = a/*c*/+b; }'), ['#define X 1⏎', 'void', 'main', '(', ')', '{', 'x', '=', 'a', '+', 'b', ';', '}']);
  assert.notDeepEqual(glslTokens('float ab;'), glslTokens('float a b;'));
  assert.notDeepEqual(glslTokens('#define F(x) x\n'), glslTokens('#define F (x) x\n'), 'a directive line is compared exactly');
}

// JavaScript rewriting: string and template literals, interpolations, tags, escapes
{
  const source = [
    "const a = 'precision highp float;\\n  // note\\n  void main() {\\n    gl_FragColor = vec4( 1.0 );\\n  }\\n';",
    'const b = `uniform float uTime;\n    // a comment\n    float k = ${"1.0"};\n    void main() { gl_Position = vec4(${"0.0"}); }\n  `;',
    'const commented = `uniform float uTime;\n    // ${"inside a GLSL comment"}\n    void main() { gl_Position = vec4(0.0); }\n  `;',
    'const tagged = String.raw`void main() {\n  // tagged stays\n  gl_Position = vec4(0.0);\n}`;',
    "const css = '.a {\\n  color: red; // not glsl\\n}\\n';",
    "const escaped = `#define Q 1\\n  // backtick \\` and dollar \\${ survive\\n  void main() { gl_FragColor = vec4( 0.0 ); }\\n`;",
    "const open = 'void main() {\\n gl_Position = vec4(0.0);\\n} // open';",
  ].join('\n');
  const result = minifyGlslLiterals(source, 'fixture.js');
  assert.ok(result && result.literals >= 3);
  const sandbox = {};
  const before = {}, after = {};
  vm.runInNewContext(`${source}\nObject.assign(out, { a, b, commented, tagged, css, escaped, open });`, { out: before, ...sandbox });
  vm.runInNewContext(`${result.code}\nObject.assign(out, { a, b, commented, tagged, css, escaped, open });`, { out: after });
  assert.equal(after.a, minifyGlsl(before.a));
  assert.equal(after.b, 'uniform float uTime;\nfloat k = 1.0;\nvoid main() { gl_Position = vec4(0.0); }\n',
    'template pieces minify around their interpolations, which stay code');
  assert.ok(result.code.includes('${"1.0"}') && result.code.includes('${"0.0"}'));
  assert.equal(after.commented, before.commented, 'a GLSL comment that runs into an interpolation leaves the template as written');
  assert.equal(after.tagged, before.tagged, 'a tagged template is never touched');
  assert.equal(after.css, before.css, 'a literal that is not GLSL is never touched');
  assert.equal(after.escaped, '#define Q 1\nvoid main() { gl_FragColor = vec4( 0.0 ); }\n', 'escapes are re-emitted');
  assert.equal(after.open, before.open, 'a literal whose comment could continue is left as written');
  assert.equal(minifyGlslLiterals('const x = 1;'), null);
}

// anchors: every string the source patches shaders with (literal or const-bound arguments of replace / split /
// includes / indexOf …), so a rewrite can be checked against all of them
const ANCHOR_METHODS = new Set(['replace', 'replaceAll', 'split', 'includes', 'indexOf', 'lastIndexOf', 'startsWith', 'endsWith']);
const sources = [];
{
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.ts$/.test(entry.name) && !entry.name.endsWith('.d.ts')) sources.push(path);
    }
  };
  walk(join(ROOT, 'src'));
}
const cookedString = (node) => node?.type === 'Literal' && typeof node.value === 'string' ? node.value
  : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : null;
const anchors = new Set();
const programs = [];
for (const file of sources) {
  const code = readFileSync(file, 'utf8');
  const ast = parseAst(code, { lang: 'ts' }, file);
  const consts = new Map();
  const calls = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && cookedString(node.init) !== null) consts.set(node.id.name, cookedString(node.init));
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && ANCHOR_METHODS.has(node.callee.property?.name) && node.arguments[0]) calls.push(node.arguments[0]);
    if (node.type === 'TaggedTemplateExpression') return;
    const pieces = node.type === 'TemplateLiteral' ? node.quasis.map((q) => q.value.cooked ?? '')
      : node.type === 'Literal' && typeof node.value === 'string' ? [node.value] : null;
    if (pieces && isShaderProgram(pieces.join('\n'))) programs.push({ file: relative(ROOT, file), pieces });
    for (const key of Object.keys(node)) if (key !== 'type' && key !== 'start' && key !== 'end') visit(node[key]);
  };
  visit(ast);
  for (const argument of calls) {
    const anchor = argument.type === 'Identifier' ? consts.get(argument.name) : cookedString(argument);
    if (typeof anchor === 'string' && anchor.length >= 6 && /[;{}()]|#\w|\bgl_|\bvec[234]\b|\buniform\b|\bvarying\b|\btexture/.test(anchor)) anchors.add(anchor);
  }
}
assert.ok(anchors.size >= 30, `the anchor scan finds the game's shader patch anchors (${anchors.size})`);
assert.ok([...anchors].includes('\t\t#pragma unroll_loop_end\n\t#elif defined (USE_SHADOWMAP)'), 'the indented multi-line lighting anchor is in the scan');
assert.equal([...anchors].filter((anchor) => isShaderProgram(anchor)).length, 0, 'no anchor is a complete program, so no anchor is ever rewritten');

// every complete shader program under src/: tokens and directives unchanged, every anchor it contains survives
{
  let rewritten = 0, checkedAnchors = 0;
  const directives = (text) => text.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('#'));
  for (const { file, pieces } of programs) {
    const mins = pieces.map((piece) => minifyGlsl(piece));
    if (mins.some((min) => min === null)) continue;
    rewritten++;
    assert.deepEqual(glslTokens(mins.join(' \u0002 ')), glslTokens(pieces.join(' \u0002 ')), `${file}: tokens unchanged`);
    for (let i = 0; i < pieces.length; i++) {
      assert.deepEqual(directives(mins[i]), directives(pieces[i]), `${file}: directives intact`);
      for (const anchor of anchors) {
        if (!pieces[i].includes(anchor)) continue;
        checkedAnchors++;
        assert.ok(mins[i].includes(anchor), `${file}: the anchor ${JSON.stringify(anchor)} survives`);
      }
    }
  }
  assert.ok(programs.length >= 50 && rewritten >= programs.length - 3, `the repository's shader programs are covered (${rewritten} of ${programs.length} rewritable)`);
  assert.ok(checkedAnchors >= 1, `anchors inside game programs were checked (${checkedAnchors})`);
  console.log(`  ${rewritten} of ${programs.length} project programs rewritable; ${checkedAnchors} anchor occurrences inside them survive`);
}

// library shaders stay as written: three's chunks hold the anchors game code patches with
{
  // lighting.ts patches the CSM chunk once CSM has installed it as THREE.ShaderChunk.lights_fragment_begin
  const indented = CSMShader.lights_fragment_begin;
  assert.ok(indented.includes('\t\t#pragma unroll_loop_end\n\t#elif defined (USE_SHADOWMAP)'), 'three\'s CSM chunk still carries the indented lighting anchor');
  assert.notEqual(minifyGlsl(indented)?.includes('\t\t#pragma unroll_loop_end\n\t#elif defined (USE_SHADOWMAP)'), true,
    'stripping three\'s indentation would break it (the first cut\'s boot failure)');
  const plugin = glslMinify();
  plugin.configResolved({ root: '/repo', build: { sourcemap: false }, logger: { info() {} } });
  const program = 'const s = `void main() {\n  // c\n  gl_Position = vec4(0.0);\n}\n`;';
  for (const id of ['/repo/node_modules/three/build/three.module.js', '/repo/node_modules/postprocessing/build/index.js', '/repo/tools/x.ts', '/elsewhere/src/a.ts']) {
    assert.equal(isProjectSource(id, '/repo'), false, id);
    assert.equal(plugin.transform.handler(program, id), null, `${id} is never rewritten`);
  }
  assert.equal(isProjectSource('/repo/src/engine/post.ts', '/repo'), true);
  assert.ok(plugin.transform.handler(program, '/repo/src/engine/post.ts'), 'a project source program is rewritten');
  assert.equal(plugin.transform.handler('const s = `#ifdef A\n  // c\n  float x;\n#endif\n`;', '/repo/src/a.ts'), null, 'a fragment without main is left alone');
}

// the plugin: build-only, registered in vite.config.ts, off when the build writes source maps
{
  const plugin = config.plugins.flat().find((entry) => entry?.name === 'cot-glsl-minify');
  assert.ok(plugin, 'vite.config.ts registers the GLSL minifier');
  assert.equal(plugin.apply, 'build');
  const fresh = glslMinify();
  fresh.configResolved({ root: '/repo', build: { sourcemap: true }, logger: { info() {} } });
  assert.equal(fresh.transform.handler('const s = `void main() {\n  // c\n  gl_Position = vec4(0.0);\n}\n`;', '/repo/src/a.ts'), null, 'no rewrite when source maps are on');
  fresh.configResolved({ root: '/repo', build: { sourcemap: false }, logger: { info() {} } });
  assert.match(fresh.transform.handler('const s = `void main() {\n  // c\n  gl_Position = vec4(0.0);\n}\n`;', '/repo/src/a.ts').code, /`void main\(\) \{\ngl_Position = vec4\(0\.0\);\n\}\n`/);
}

console.log(`viteGlslMinify.selftest: line rules, conservative detection, token-stream check, JS literal rewriting (interpolations, tags, escapes), ${programs.length} project shader programs against ${anchors.size} patch anchors, library shaders and fragments untouched`);
