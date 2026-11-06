// The phone's page carries only the phone's half (Main, 2026-11-04: "Desktop-only code riding to phones is a class
// problem"). A pad module both the phone's page and the desktop import lands in a chunk the phone downloads whole, so an
// export only the desktop imports rides to every phone: on 269 the cue mapper, the guide's decoder, the input mapper, the
// axes decoder and the pairing page's address all did. Each lives in a module the phone never imports (padDesk.ts,
// padCues.ts). Scope: the pad modules the phone's page loads; the site's shared UI runtime (i18n, icons, dom) is
// budgeted with every page (tools/bundle-budget.json). A name its own module also uses is kept for that use.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rolldown/parseAst';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PHONE_PAGE = 'src/pad/padPage.ts';
/** The rooms Worker's pairing actor (cloudflare/rooms, server/rooms): no page imports it, so what it uses rides nowhere. */
const SERVER_ONLY = new Set(['src/pad/padActor.ts']);
/** A module that may import a pad module: its source names one (`./padX.ts`, `../pad/padX.ts`). */
const NAMES_PAD = /\/pad[A-Z]\w*\.ts['"]/;
/** Type positions: erased, so a name there is no runtime use. */
const TYPE_NODES = new Set(['TSTypeAnnotation', 'TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'TSTypeParameterInstantiation',
  'TSTypeParameterDeclaration']);

const repoPath = (path) => relative(ROOT, path).split('\\').join('/');
const SRC_MODULES = readdirSync(join(ROOT, 'src'), { recursive: true }).map((name) => `src/${String(name).split('\\').join('/')}`)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'));
const checkout = (file) => readFileSync(join(ROOT, file), 'utf8');

function resolveImport(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const path = repoPath(resolve(ROOT, dirname(from), specifier));
  return /\.(?:ts|mjs|js)$/.test(path) && existsSync(join(ROOT, path)) ? path : null;
}

/** One module's runtime imports, each { to, names } ('*' for a namespace), and how often each name is used outside types. */
function analyse(file, source) {
  const program = parseAst(source, { lang: 'ts' }, file);
  const imports = [];
  for (const node of program.body) {
    const to = node.source && resolveImport(file, node.source.value);
    if (!to) continue;
    if (node.type === 'ImportDeclaration' && node.importKind !== 'type') {
      imports.push({ to, names: node.specifiers.filter((spec) => spec.importKind !== 'type').map((spec) =>
        spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.imported.name ?? spec.imported.value) });
    } else if (node.type === 'ExportNamedDeclaration' && node.exportKind !== 'type') {
      imports.push({ to, names: node.specifiers.filter((spec) => spec.exportKind !== 'type').map((spec) => spec.local.name ?? spec.local.value) });
    } else if (node.type === 'ExportAllDeclaration' && node.exportKind !== 'type') {
      imports.push({ to, names: ['*'] });
    }
  }
  const uses = new Map();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) walk(item); return; }
    if (TYPE_NODES.has(node.type)) return;
    if (node.type === 'Identifier') uses.set(node.name, (uses.get(node.name) ?? 0) + 1);
    for (const key of Object.keys(node)) if (key !== 'parent') walk(node[key]);
  };
  walk(program.body);
  return { imports, uses };
}

/** The desktop-only exports a phone downloads: `module: name <- importers`. */
function phoneRiders({ read = checkout, modules = SRC_MODULES } = {}) {
  const seen = new Map();
  const of = (file) => { if (!seen.has(file)) seen.set(file, analyse(file, read(file))); return seen.get(file); };
  const phone = new Set([PHONE_PAGE]);
  for (const queue = [PHONE_PAGE]; queue.length;) {
    for (const { to } of of(queue.shift()).imports) if (/\.ts$/.test(to) && !phone.has(to)) { phone.add(to); queue.push(to); }
  }
  const shared = [...phone].filter((file) => file.startsWith('src/pad/') && file !== PHONE_PAGE);
  const usesBy = (files) => {
    const by = new Map(shared.map((file) => [file, new Map()]));
    for (const file of files) {
      for (const { to, names } of of(file).imports) {
        if (!by.has(to)) continue;
        for (const name of names) by.get(to).set(name, [...(by.get(to).get(name) ?? []), file]);
      }
    }
    return by;
  };
  const desktop = modules.filter((file) => !phone.has(file) && !SERVER_ONLY.has(file) && NAMES_PAD.test(read(file)));
  const phoneUses = usesBy(phone);
  const deskUses = usesBy(desktop);
  const riders = [];
  for (const file of shared) {
    for (const [name, importers] of deskUses.get(file)) {
      if (phoneUses.get(file).has(name) || phoneUses.get(file).has('*')) continue;
      if (name !== '*' && (of(file).uses.get(name) ?? 0) > 1) continue;
      riders.push(`${file}: ${name} <- ${importers.join(', ')}`);
    }
  }
  return { phone, desktop, riders, serverImporters: desktop.filter((file) => of(file).imports.some(({ to }) => SERVER_ONLY.has(to))) };
}

// ---- the tree ---------------------------------------------------------------------------------------------------
const tree = phoneRiders();
assert.deepEqual(tree.riders, [], `desktop-only exports ride to the phone (move each to a module the phone's page never imports):\n${tree.riders.join('\n')}`);
assert.ok(tree.phone.has('src/pad/padBuzz.ts') && tree.phone.has('src/pad/padProtocol.ts'), "the phone's page plays the buzzes and speaks the wire");
for (const file of ['src/pad/padCues.ts', 'src/pad/padDesk.ts', 'src/pad/padReceiver.ts', 'src/pad/padTourScreen.ts']) {
  assert.ok(!tree.phone.has(file), `the phone's page never loads ${file}`);
}
assert.ok(tree.desktop.includes('src/pad/padReceiver.ts') && tree.desktop.includes('src/ui/couchLobby.ts'), 'the scan sees the desktop side');
assert.deepEqual(tree.serverImporters, [], 'no page imports the pairing actor');

// ---- seeded: a desktop-only export in a shared module is caught, and cleared once the phone uses it -------------------
{
  const extra = {
    'src/pad/padProtocol.ts': `${checkout('src/pad/padProtocol.ts')}\nexport const deskOnly = (): number => 1;\n`,
    'src/pad/padReceiver.ts': `${checkout('src/pad/padReceiver.ts')}\nimport { deskOnly } from './padProtocol.ts';\nexport const seeded = deskOnly();\n`,
  };
  const reader = (overrides) => (file) => overrides[file] ?? checkout(file);
  const caught = phoneRiders({ read: reader(extra) }).riders;
  assert.deepEqual(caught, ['src/pad/padProtocol.ts: deskOnly <- src/pad/padReceiver.ts'], 'a desktop-only export in a shared module is caught');
  const used = { ...extra, [PHONE_PAGE]: `${checkout(PHONE_PAGE)}\nimport { deskOnly } from './padProtocol.ts';\nvoid deskOnly;\n` };
  assert.deepEqual(phoneRiders({ read: reader(used) }).riders, [], 'an export the phone imports too is the phone\'s');
  const typed = { 'src/pad/padReceiver.ts': `${checkout('src/pad/padReceiver.ts')}\nimport type { PadIceServer } from './padProtocol.ts';\nexport type Seeded = PadIceServer;\n` };
  assert.deepEqual(phoneRiders({ read: reader(typed) }).riders, [], 'a type import is erased');
}

console.log(`padPhoneHalf.selftest: PASS (${tree.phone.size} phone modules, ${tree.desktop.length} desktop importers, no rider)`);
