// Runs one command under a `render` capture hold (tools/capture-lock.mjs) and releases it when the command ends.
//   cd <tree with tools> && node lockrun.mjs --place=<key> -- <command...>
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sep = process.argv.indexOf('--');
const place = process.argv.find((a) => a.startsWith('--place='))?.slice(8) ?? 'envelope-264-lockrun';
const command = process.argv.slice(sep + 1);
const { createCaptureLock } = await import(pathToFileURL(resolve(process.cwd(), 'tools/capture-lock.mjs')).href);
const lock = createCaptureLock();
let child = null;
const stop = (signal) => { try { child?.kill(signal); } catch {} try { lock.release(); } catch {} process.exit(1); };
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGALRM']) process.on(signal, () => stop('SIGTERM'));
await lock.acquire(4 * 3600 * 1000, { place, lockClass: 'render', command: command.join(' ') });
const refresher = setInterval(() => lock.refresh(), 30_000);
child = spawn(command[0], command.slice(1), { stdio: 'inherit' });
const code = await new Promise((done) => child.on('exit', (c) => done(c ?? 1)));
clearInterval(refresher);
lock.release();
process.exit(code);
