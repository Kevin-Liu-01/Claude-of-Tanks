#!/usr/bin/env node
// Run one command with a resident-memory cap on its whole process tree (replay-system-275, 2026-11-22: an unbounded
// receipt reached 14 GiB and pushed the Mac into 43 GB of swap). --max-old-space-size bounds only the V8 heap; this
// bounds the processes, typed arrays and buffers included.
//
// (integ/278, owed from 277) The 275 version polled only its direct child's PID, so wrapped around `npm run ...` or a
// regen that forks workers it measured npm (0.07 GiB) and capped nothing: every 276/277 regen hold was in effect
// uncapped. Now the child leads its own process group, and every 500 ms one `ps -A` sample sums the resident sets of
// that group and of every descendant of a member (a grandchild that started its own group still counts). Past the cap
// the tree is stopped: SIGTERM to the group and each member, then SIGKILL 2 s later. Only the tree this tool started.
// SIGINT/SIGTERM sent to this tool are passed to the group. Receipt: tools/memory-capped.selftest.mjs (a grandchild
// allocator under an npm-like parent).
//
//   node tools/memory-capped.mjs --cap-gib=2 -- node tools/replay-verify.mjs <file>
//
// Exit: the child's code; 137 when the tree was stopped at the cap.
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

export const SAMPLE_MS = 500;

/** `ps -A -o pid=,pgid=,ppid=,rss=` text as rows ({ pid, pgid, ppid, rssKib }). */
export function psRows(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (match) rows.push({ pid: +match[1], pgid: +match[2], ppid: +match[3], rssKib: +match[4] });
  }
  return rows;
}

/** The tree of `rootPid`: its process group and every descendant of a member. Returns { pids, rssKib }. */
export function treeOf(rows, rootPid) {
  const members = new Map();
  for (const row of rows) if (row.pid === rootPid || row.pgid === rootPid) members.set(row.pid, row);
  const children = new Map();
  for (const row of rows) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row);
  }
  const stack = [...members.keys()];
  while (stack.length) {
    for (const child of children.get(stack.pop()) ?? []) {
      if (members.has(child.pid)) continue;
      members.set(child.pid, child);
      stack.push(child.pid);
    }
  }
  let rssKib = 0;
  for (const row of members.values()) rssKib += row.rssKib;
  return { pids: [...members.keys()], rssKib };
}

function sampleTree(rootPid) {
  try {
    return treeOf(psRows(execFileSync('ps', ['-A', '-o', 'pid=,pgid=,ppid=,rss='], { encoding: 'utf8' })), rootPid);
  } catch {
    return { pids: [], rssKib: 0 };
  }
}

function signalTree(rootPid, pids, signal) {
  try { process.kill(-rootPid, signal); } catch { /* the group is gone */ }
  for (const pid of pids) {
    try { process.kill(pid, signal); } catch { /* gone */ }
  }
}

function main(argv) {
  const split = argv.indexOf('--');
  const capArg = argv.slice(0, Math.max(split, 0)).find((arg) => arg.startsWith('--cap-gib='));
  const cap = Number(capArg?.slice(10));
  if (split < 0 || !capArg || !(cap > 0) || split === argv.length - 1) {
    console.error('usage: node tools/memory-capped.mjs --cap-gib=<GiB> -- <command> [args...]');
    process.exit(2);
  }
  const capKib = cap * 1024 * 1024;
  const [command, ...args] = argv.slice(split + 1);
  const child = spawn(command, args, { stdio: 'inherit', detached: true });
  const gib = (kib) => (kib / 1048576).toFixed(2);
  let peakKib = 0, peakPids = 0, stopped = false, last = { pids: [], rssKib: 0 };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => signalTree(child.pid, last.pids, signal));
  }
  const timer = setInterval(() => {
    const tree = sampleTree(child.pid);
    if (tree.pids.length) last = tree;
    if (tree.rssKib > peakKib) { peakKib = tree.rssKib; peakPids = tree.pids.length; }
    if (tree.rssKib > capKib && !stopped) {
      stopped = true;
      console.error(`[memory-capped] tree of pid ${child.pid} (${tree.pids.length} processes) at ${gib(tree.rssKib)} GiB passed the cap ${gib(capKib)} GiB: stopping it`);
      signalTree(child.pid, tree.pids, 'SIGTERM');
      setTimeout(() => signalTree(child.pid, sampleTree(child.pid).pids.concat(tree.pids), 'SIGKILL'), 2000).unref();
    }
  }, SAMPLE_MS);
  child.on('exit', (code, signal) => {
    clearInterval(timer);
    // a member that outlived the leader past the cap is stopped too
    if (stopped) signalTree(child.pid, sampleTree(child.pid).pids, 'SIGKILL');
    console.error(`[memory-capped] tree of pid ${child.pid} peak resident ${gib(peakKib)} GiB over ${peakPids} processes (cap ${gib(capKib)} GiB)${stopped ? ', stopped at the cap' : ''}`);
    process.exit(stopped ? 137 : code ?? (signal ? 1 : 0));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main(process.argv.slice(2));
