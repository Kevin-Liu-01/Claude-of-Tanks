#!/usr/bin/env node
// Serve a built site (or the sources) for one command, then stop that server and nothing else (capture-slot-ports-277).
//   node tools/with-preview.mjs [--root=<checkout>] [--dist=dist] [--mode=preview|dev] -- <command> [args...]
// The server binds the first free port of the capture slot's preview block (capture-ports.mjs; under
// tools/with-capture-lock.mjs) or an OS-assigned port outside a hold, and the command runs with COT_PREVIEW_URL set to
// what it bound (`http://127.0.0.1:<port>/`). It replaces lane scripts' `vite preview --port 4178 --strictPort &` and
// their teardowns: the server is this process's own child, stopped through its handle once the command ends or this
// process is signalled; no port is ever looked up to find a process to stop, so another hold's server is never touched.
// Exit status: the command's; 2 for a usage error; 1 when the server never served.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startViteChild } from './capture-hold.mjs';

const USAGE = 'usage: node tools/with-preview.mjs [--root=<dir>] [--dist=dist] [--mode=preview|dev] -- <command> [args...]';

/** { root, dist, mode, command, args }; throws a usage error (`usage: true`). */
export function parsePreviewArgs(argv) {
  const split = argv.indexOf('--');
  const fail = (why) => { throw Object.assign(new Error(`${why}\n${USAGE}`), { usage: true }); };
  if (split < 0 || split === argv.length - 1) fail('with-preview: no command after --');
  const options = { root: process.cwd(), dist: 'dist', mode: 'preview', command: argv[split + 1], args: argv.slice(split + 2) };
  for (const arg of argv.slice(0, split)) {
    const [flag, ...parts] = arg.split('=');
    const value = parts.join('=');
    if (flag === '--root' && value) options.root = resolve(value);
    else if (flag === '--dist' && value) options.dist = value;
    else if (flag === '--mode' && (value === 'preview' || value === 'dev')) options.mode = value;
    else fail(`with-preview: unknown or malformed option ${arg}`);
  }
  return options;
}

/** Run `command` beside a server of `root`; resolves with the exit status this tool exits with. */
export async function runWithPreview({ root, dist, mode, command, args }, { log = (line) => console.error(line), env = process.env } = {}) {
  let server;
  try { server = await startViteChild({ root, mode, outDir: dist, env }); } catch (error) {
    log(`[with-preview] the ${mode} server of ${root} did not serve: ${error.message}`);
    return 1;
  }
  log(`[with-preview] ${mode} of ${root} at ${server.url} (pid ${server.child.pid})`);
  let child = null;
  const stop = (signal) => { if (child && child.exitCode === null && !child.signalCode) child.kill(signal); };
  process.once('SIGINT', stop).once('SIGTERM', stop);
  try {
    child = spawn(command, args, { stdio: 'inherit', env: { ...env, COT_PREVIEW_URL: server.url } });
    return await new Promise((resolveStatus) => {
      child.once('error', (error) => { log(`[with-preview] ${command}: ${error.message}`); resolveStatus(error.code === 'ENOENT' ? 127 : 1); });
      child.once('close', (code, signal) => resolveStatus(code ?? 128 + (signal === 'SIGINT' ? 2 : 15)));
    });
  } finally {
    process.removeListener('SIGINT', stop).removeListener('SIGTERM', stop);
    await server.close();
    log(`[with-preview] stopped its server (pid ${server.child.pid})`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let parsed;
  try { parsed = parsePreviewArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(2); }
  process.exit(await runWithPreview(parsed));
}
