// A GLSL subset for the receipts that hold a shader copy equal to its source (the mountains lane, 2026-10-05: the far
// earth's copies of the dome's deck greying, horizonPanoramaDeck.selftest.mjs, and of the cloud layer's composite,
// horizonPanoramaClouds.selftest.mjs). Both sides of a pin run through this one evaluator, so it decides nothing about
// either: it reads them. Declarations, assignments, if/else, ?:, return and calls on floats, bools and vec2-4, with
// GLSL's componentwise arithmetic and built-ins; anything outside the subset throws, so a source that grows past it fails
// its pin rather than passing unread. horizonPanoramaDeck.selftest.mjs holds the evaluator to GLSL's definitions.
// Declarations, assignments, if/else, ?:, return and calls on floats, bools and vec2-4, with GLSL's componentwise
// arithmetic and built-ins. No loops, no ints, no matrices: anything outside the subset throws, so a chunk that grows
// past it fails here rather than passing unread.
const TOKEN = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|(\d+\.\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|\d+[eE][-+]?\d+)|(\d+)|([A-Za-z_]\w*)|(&&|\|\||[<>=!]=|[-+*/]=|[-+*/(){},;.?:<>=!])/y;

function tokenize(source) {
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < source.length) {
    const at = TOKEN.lastIndex, m = TOKEN.exec(source);
    if (!m) throw new Error(`glsl: cannot read ${JSON.stringify(source.slice(at, at + 24))}`);
    if (m[1] !== undefined) out.push({ num: Number(m[1]) });
    else if (m[2] !== undefined) throw new Error(`glsl: an int literal (${m[2]}); the subset reads floats only`);
    else if (m[3] !== undefined) out.push({ id: m[3] });
    else if (m[4] !== undefined) out.push({ op: m[4] });
  }
  return out;
}

const TYPES = { float: 1, bool: 0, vec2: 2, vec3: 3, vec4: 4 };
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=']);
const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/']];

/** The chunk's statements as a tree; every if and ?: gets an id for the branch coverage. */
export function parseGlsl(source) {
  const tk = tokenize(source);
  let i = 0, ids = 0;
  const where = () => `token ${i} ${JSON.stringify(tk.slice(i, i + 6).map((t) => t.op ?? t.id ?? t.num))}`;
  const is = (op) => tk[i]?.op === op;
  const isWord = (word) => tk[i]?.id === word;
  const expect = (op) => { if (!is(op)) throw new Error(`glsl: expected '${op}' at ${where()}`); i++; };
  function statement() {
    if (is('{')) {
      i++;
      const body = [];
      while (!is('}')) { if (i >= tk.length) throw new Error('glsl: an unclosed block'); body.push(statement()); }
      i++;
      return { k: 'block', body };
    }
    if (isWord('if')) {
      i++; expect('(');
      const test = expression(); expect(')');
      const then = statement();
      let otherwise = null;
      if (isWord('else')) { i++; otherwise = statement(); }
      return { k: 'if', id: ids++, test, then, otherwise };
    }
    if (isWord('return')) { i++; const value = expression(); expect(';'); return { k: 'return', value }; }
    if (isWord('const')) i++;
    if (tk[i]?.id !== undefined && Object.hasOwn(TYPES, tk[i].id)) {
      const type = tk[i++].id, decls = [];
      for (;;) {
        const name = tk[i++]?.id;
        if (name === undefined) throw new Error(`glsl: a declaration without a name at ${where()}`);
        expect('=');
        decls.push({ name, init: assignment() });
        if (!is(',')) break;
        i++;
      }
      expect(';');
      return { k: 'decl', type, decls };
    }
    for (const word of ['for', 'while', 'do', 'switch', 'discard', 'break', 'continue']) {
      if (isWord(word)) throw new Error(`glsl: '${word}' is outside the subset`);
    }
    const e = expression(); expect(';');
    return { k: 'expr', e };
  }
  const expression = () => assignment();
  function assignment() {
    const target = ternary();
    if (tk[i]?.op === undefined || !ASSIGN.has(tk[i].op)) return target;
    const op = tk[i++].op;
    if (!(target.k === 'id' || (target.k === 'member' && target.object.k === 'id'))) throw new Error(`glsl: an assignment to an expression at ${where()}`);
    return { k: 'assign', op, target, value: assignment() };
  }
  function ternary() {
    const test = binary(0);
    if (!is('?')) return test;
    i++;
    const yes = expression(); expect(':');
    return { k: 'cond', id: ids++, test, yes, no: assignment() };
  }
  function binary(level) {
    if (level === LEVELS.length) return unary();
    let left = binary(level + 1);
    while (tk[i]?.op !== undefined && LEVELS[level].includes(tk[i].op)) {
      const op = tk[i++].op;
      left = { k: 'bin', op, left, right: binary(level + 1) };
    }
    return left;
  }
  function unary() {
    if (is('-') || is('+') || is('!')) { const op = tk[i++].op; return { k: 'unary', op, arg: unary() }; }
    let e = primary();
    for (;;) {
      if (is('.')) {
        i++;
        const name = tk[i++]?.id;
        if (name === undefined) throw new Error(`glsl: a member without a name at ${where()}`);
        e = { k: 'member', object: e, name };
      } else if (is('(')) {
        if (e.k !== 'id') throw new Error(`glsl: a call on an expression at ${where()}`);
        i++;
        const args = [];
        if (!is(')')) for (;;) { args.push(assignment()); if (!is(',')) break; i++; }
        expect(')');
        e = { k: 'call', name: e.name, args };
      } else return e;
    }
  }
  function primary() {
    const t = tk[i++];
    if (t === undefined) throw new Error('glsl: an unexpected end');
    if (t.num !== undefined) return { k: 'num', value: t.num };
    if (t.id !== undefined) return { k: 'id', name: t.id };
    if (t.op === '(') { const e = expression(); expect(')'); return e; }
    throw new Error(`glsl: an unexpected '${t.op}' at ${where()}`);
  }
  const body = [];
  while (i < tk.length) body.push(statement());
  return { body, branches: ids };
}

const SWIZZLE_SETS = ['xyzw', 'rgba', 'stpq'];
const shapeOf = (v) => (typeof v === 'boolean' ? 0 : typeof v === 'number' ? 1 : Array.isArray(v) && v.length >= 2 && v.length <= 4 ? v.length : -1);
const isVec = (v) => Array.isArray(v);
function zip(args, f) {
  const n = Math.max(...args.map((a) => (isVec(a) ? a.length : 1)));
  for (const a of args) {
    if (typeof a === 'boolean') throw new Error('glsl: arithmetic on a bool');
    if (isVec(a) && a.length !== n) throw new Error('glsl: mismatched vector sizes');
  }
  if (n === 1 && args.every((a) => !isVec(a))) return f(...args);
  return Array.from({ length: n }, (_, k) => f(...args.map((a) => (isVec(a) ? a[k] : a))));
}
const scalar = (v, what) => { if (typeof v !== 'number') throw new Error(`glsl: ${what} takes a float`); return v; };
const dot = (a, b) => {
  if (!isVec(a) && !isVec(b)) return scalar(a, 'dot') * scalar(b, 'dot');
  if (!isVec(a) || !isVec(b) || a.length !== b.length) throw new Error('glsl: dot of mismatched vectors');
  return a.reduce((s, x, k) => s + x * b[k], 0);
};
const length = (a) => (isVec(a) ? Math.sqrt(dot(a, a)) : Math.abs(scalar(a, 'length')));
function construct(n, args) {
  if (args.length === 1 && typeof args[0] === 'number') return Array(n).fill(args[0]);
  const flat = [];
  for (const a of args) {
    if (typeof a === 'boolean') throw new Error('glsl: a bool in a vector');
    if (isVec(a)) flat.push(...a); else flat.push(a);
  }
  if (flat.length === n || (args.length === 1 && flat.length > n)) return flat.slice(0, n);
  throw new Error(`glsl: vec${n} from ${flat.length} components`);
}
const BUILTINS = {
  max: (a, b) => zip([a, b], Math.max),
  min: (a, b) => zip([a, b], Math.min),
  clamp: (x, lo, hi) => zip([x, lo, hi], (v, l, h) => Math.min(Math.max(v, l), h)),
  smoothstep: (e0, e1, x) => zip([e0, e1, x], (a, b, v) => { const t = Math.min(Math.max((v - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); }),
  mix: (a, b, t) => zip([a, b, t], (x, y, s) => x * (1 - s) + y * s),
  step: (edge, x) => zip([edge, x], (e, v) => (v < e ? 0 : 1)),
  dot, length,
  normalize: (a) => { const l = length(a); return zip([a], (x) => x / l); },
  abs: (a) => zip([a], Math.abs), sqrt: (a) => zip([a], Math.sqrt), exp: (a) => zip([a], Math.exp),
  pow: (a, b) => zip([a, b], Math.pow), floor: (a) => zip([a], Math.floor), fract: (a) => zip([a], (x) => x - Math.floor(x)),
  float: (a) => scalar(a, 'float()'),
  vec2: (...a) => construct(2, a), vec3: (...a) => construct(3, a), vec4: (...a) => construct(4, a),
};

/** Runs parsed statements over the given variables (the uniforms and the inputs): a chunk's (`body` false: a return
 * throws) or a function's body (`body` true: it must return). Returns the variables as the statements left them, and the
 * returned value. */
function execute(chunk, variables, functions, taken, body) {
  const scopes = [new Map(Object.entries(variables))];
  const owner = (name) => {
    for (let s = scopes.length - 1; s >= 0; s--) if (scopes[s].has(name)) return scopes[s];
    throw new Error(`glsl: '${name}' is not defined`);
  };
  const store = (name, value) => {
    const scope = owner(name);
    if (shapeOf(value) !== shapeOf(scope.get(name))) throw new Error(`glsl: '${name}' assigned a value of another type`);
    scope.set(name, value);
  };
  const swizzle = (v, name) => {
    if (!isVec(v)) throw new Error(`glsl: .${name} on a scalar`);
    const set = SWIZZLE_SETS.find((s) => [...name].every((c) => s.includes(c)));
    if (!set || name.length > 4) throw new Error(`glsl: a bad swizzle .${name}`);
    const idx = [...name].map((c) => set.indexOf(c));
    if (idx.some((k) => k >= v.length)) throw new Error(`glsl: .${name} past a vec${v.length}`);
    return idx;
  };
  const truth = (v) => { if (typeof v !== 'boolean') throw new Error('glsl: a condition that is not a bool'); return v; };
  function evaluate(e) {
    switch (e.k) {
      case 'num': return e.value;
      case 'id': return owner(e.name).get(e.name);
      case 'unary': {
        const v = evaluate(e.arg);
        if (e.op === '!') return !truth(v);
        return e.op === '-' ? zip([v], (x) => -x) : zip([v], (x) => x);
      }
      case 'bin': {
        if (e.op === '&&') return truth(evaluate(e.left)) && truth(evaluate(e.right));
        if (e.op === '||') return truth(evaluate(e.left)) || truth(evaluate(e.right));
        const a = evaluate(e.left), b = evaluate(e.right);
        switch (e.op) {
          case '+': return zip([a, b], (x, y) => x + y);
          case '-': return zip([a, b], (x, y) => x - y);
          case '*': return zip([a, b], (x, y) => x * y);
          case '/': return zip([a, b], (x, y) => x / y);
          case '<': return scalar(a, '<') < scalar(b, '<');
          case '>': return scalar(a, '>') > scalar(b, '>');
          case '<=': return scalar(a, '<=') <= scalar(b, '<=');
          case '>=': return scalar(a, '>=') >= scalar(b, '>=');
          case '==': case '!=': {
            if (isVec(a) || isVec(b)) throw new Error('glsl: == on vectors is outside the subset');
            return (a === b) === (e.op === '==');
          }
        }
        throw new Error(`glsl: operator ${e.op}`);
      }
      case 'cond': {
        const pick = truth(evaluate(e.test));
        taken.add(`${e.id}:${pick}`);
        return evaluate(pick ? e.yes : e.no);
      }
      case 'member': {
        const v = evaluate(e.object), idx = swizzle(v, e.name);
        return idx.length === 1 ? v[idx[0]] : idx.map((k) => v[k]);
      }
      case 'call': {
        const args = e.args.map(evaluate);
        const f = Object.hasOwn(functions, e.name) ? functions[e.name] : Object.hasOwn(BUILTINS, e.name) ? BUILTINS[e.name] : null;
        if (!f) throw new Error(`glsl: no function '${e.name}'`);
        return f(...args);
      }
      case 'assign': {
        let value = evaluate(e.value);
        const name = e.target.k === 'id' ? e.target.name : e.target.object.name;
        if (e.op !== '=') {
          const f = { '+=': (x, y) => x + y, '-=': (x, y) => x - y, '*=': (x, y) => x * y, '/=': (x, y) => x / y }[e.op];
          value = zip([evaluate(e.target), value], f);
        }
        if (e.target.k === 'id') store(name, value);
        else {
          const whole = [...owner(name).get(name)], idx = swizzle(whole, e.target.name);
          if (new Set(idx).size !== idx.length) throw new Error(`glsl: an assignment to a repeated swizzle .${e.target.name}`);
          const parts = idx.length === 1 ? [value] : value;
          if (!isVec(parts) || parts.length !== idx.length) throw new Error(`glsl: .${e.target.name} assigned the wrong size`);
          idx.forEach((k, j) => { whole[k] = scalar(parts[j], 'a component'); });
          store(name, whole);
        }
        return value;
      }
    }
    throw new Error(`glsl: an expression of kind ${e.k}`);
  }
  function run(s) {
    switch (s.k) {
      case 'block': {
        scopes.push(new Map());
        try { for (const t of s.body) { const r = run(t); if (r) return r; } } finally { scopes.pop(); }
        return null;
      }
      case 'if': {
        const pick = truth(evaluate(s.test));
        taken.add(`${s.id}:${pick}`);
        return pick ? run(s.then) : s.otherwise ? run(s.otherwise) : null;
      }
      case 'decl': {
        for (const d of s.decls) {
          const value = evaluate(d.init);
          if (shapeOf(value) !== TYPES[s.type]) throw new Error(`glsl: ${s.type} ${d.name} initialised with a value of another type`);
          const scope = scopes[scopes.length - 1];
          if (scope.has(d.name)) throw new Error(`glsl: ${d.name} declared twice in one scope`);
          scope.set(d.name, value);
        }
        return null;
      }
      case 'return': return { value: evaluate(s.value) };
      case 'expr': evaluate(s.e); return null;
    }
    throw new Error(`glsl: a statement of kind ${s.k}`);
  }
  scopes.push(new Map());
  let returned;
  for (const s of chunk.body) {
    const r = run(s);
    if (!r) continue;
    if (!body) throw new Error('glsl: the chunk returned');
    returned = r.value;
    break;
  }
  if (body && returned === undefined) throw new Error('glsl: the function body did not return');
  return { vars: Object.fromEntries([...scopes[0].keys()].map((name) => [name, scopes[0].get(name)])), returned };
}

/** Runs a parsed chunk over the given variables and returns them as the chunk left them. */
export const runGlsl = (chunk, variables, functions, taken) => execute(chunk, variables, functions, taken, false).vars;

/** Runs a parsed function body on its arguments (by name) and returns what it returns. */
export const runGlslFunction = (chunk, args, functions, taken) => execute(chunk, args, functions, taken, true).returned;

/** The index of the brace closing the first block at or after `from`, past comments. */
export function closingBrace(text, from) {
  let depth = 0;
  for (let k = from; k < text.length; k++) {
    if (text.startsWith('//', k)) { k = text.indexOf('\n', k); if (k < 0) break; continue; }
    if (text.startsWith('/*', k)) { k = text.indexOf('*/', k) + 1; if (k <= 0) break; continue; }
    if (text[k] === '{') depth++;
    else if (text[k] === '}' && --depth === 0) return k;
  }
  return -1;
}
export const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
