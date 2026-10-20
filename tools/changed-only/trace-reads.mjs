// Runtime read trace for the changed-only proof: preload with `node --import <this file>` (or NODE_OPTIONS, which child
// processes inherit) and every file the process reads or loads is written to $COT_TRACE_READS_OUT/<pid>-<thread>.json
// on exit. tools/changed-only/trace-check.mjs runs each fleet step under it and compares the reads with what the step's
// key covers. First-party tooling: Kevin B. Liu.
import fs from 'node:fs';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadId } from 'node:worker_threads';

const outDir = process.env.COT_TRACE_READS_OUT;
if (outDir) {
  const reads = new Set(), loads = new Set(), listed = new Set(), loaderReads = new Set();
  // Node's module loaders read sources through the same public fs functions; a read made from inside them is a module
  // load (recorded by the load hook), not a read by the tool's own code.
  const MODULE_SOURCE = /\.(?:[cm]?[jt]sx?|json|node)$/;
  const self = import.meta.url;
  const fromLoader = () => {
    // The first frame outside this file is the caller: a module loader's own frames live in node:internal/modules/.
    // fs functions call each other (readFileSync opens through openSync): skip fs's own frames too.
    const caller = (new Error().stack ?? '').split('\n').slice(1)
      .find((line) => !line.includes(self) && !/\(node:(?:fs|internal\/fs\/[^:]+):\d/.test(line)) ?? '';
    return caller.includes('node:internal/modules/');
  };
  const pathOf = (value) => {
    try {
      if (typeof value === 'string') return resolve(value);
      if (value instanceof URL) return value.protocol === 'file:' ? fileURLToPath(value) : null;
      if (Buffer.isBuffer(value)) return resolve(value.toString());
    } catch {}
    return null;
  };
  const wrap = (object, name, sink) => {
    const original = object[name];
    if (typeof original !== 'function') return;
    object[name] = function traced(target, ...rest) {
      const path = pathOf(target);
      if (path) (sink === reads && MODULE_SOURCE.test(path) && fromLoader() ? loaderReads : sink).add(path);
      return original.call(this, target, ...rest);
    };
  };
  for (const name of ['readFileSync', 'readFile', 'createReadStream', 'openSync', 'open', 'existsSync', 'statSync',
    'lstatSync', 'accessSync', 'readlinkSync', 'realpathSync']) wrap(fs, name, reads);
  for (const name of ['readdirSync', 'readdir', 'opendirSync', 'opendir']) wrap(fs, name, listed);
  for (const name of ['readFile', 'open', 'stat', 'lstat', 'access', 'readlink']) wrap(fs.promises, name, reads);
  for (const name of ['readdir', 'opendir']) wrap(fs.promises, name, listed);
  syncBuiltinESMExports();
  registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith('file:')) { try { loads.add(fileURLToPath(url)); } catch {} }
      return nextLoad(url, context);
    },
  });
  process.on('exit', () => {
    try {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(join(outDir, `${process.pid}-${threadId}.json`), JSON.stringify({
        argv: process.argv.slice(1), reads: [...reads].sort(), loads: [...loads].sort(), listed: [...listed].sort(),
        loaderReads: [...loaderReads].sort(),
      }));
    } catch {}
  });
}
