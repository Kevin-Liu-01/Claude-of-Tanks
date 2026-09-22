import { execFileSync } from 'node:child_process';

// Read-only preflight: consult the remote without moving refs, staging, merging,
// pushing or deploying. A normal fast-forward push still arbitrates a later race.
const git = (...args) => execFileSync('git', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
const paths = (base, head) => git('diff', '--name-only', '--no-renames', '-z', base, head)
  .split('\0').filter(Boolean);
const isAncestor = (base, head) => {
  try { git('merge-base', '--is-ancestor', base, head); return true; }
  catch (error) { if (error.status === 1) return false; throw error; }
};

function argumentValues(args) {
  const values = {};
  for (const arg of args) {
    const match = /^--(base|validated-head|reviewed-main)=([0-9a-f]{7,40})$/.exec(arg);
    if (!match || values[match[1]]) throw new Error(`Invalid or repeated argument: ${arg}`);
    values[match[1]] = match[2];
  }
  if (!values.base || !values['validated-head']) {
    throw new Error('Required: --base=<starting-main-sha> --validated-head=<tested-commit-sha>');
  }
  return values;
}

function preflight(values) {
  const commit = (ref) => git('rev-parse', '--verify', `${ref}^{commit}`).trim();
  const head = commit('HEAD');
  const validatedHead = commit(values['validated-head']);
  if (head !== validatedHead) throw new Error('HEAD changed after validation; validate the current commit.');
  if (git('status', '--porcelain=v1', '--untracked-files=normal').trim()) {
    throw new Error('Working tree has uncommitted files; isolate, review and commit the intended scope first.');
  }
  const remoteLine = git('ls-remote', '--exit-code', 'origin', 'refs/heads/main').trim();
  const remote = /^([0-9a-f]{40})\s+refs\/heads\/main$/.exec(remoteLine)?.[1];
  if (!remote) throw new Error('Could not identify origin/main.');
  try { commit(remote); }
  catch { throw new Error(`Fetch origin: main advanced to ${remote}, which is not available locally.`); }
  if (!isAncestor(remote, head)) {
    throw new Error(`Current origin/main ${remote} is not included in HEAD; integrate it and validate again.`);
  }
  const base = commit(values.base);
  if (!isAncestor(base, remote)) {
    throw new Error('The starting base must be an ancestor of current origin/main. Check the recorded base.');
  }
  const incomingPaths = new Set(paths(base, remote));
  const changedPaths = paths(remote, head);
  const overlappingPaths = changedPaths.filter((path) => incomingPaths.has(path));
  const reviewedMain = values['reviewed-main'] ? commit(values['reviewed-main']) : null;
  if (reviewedMain && reviewedMain !== remote) {
    throw new Error('The overlap review names an older main; inspect the new incoming changes.');
  }
  const ok = overlappingPaths.length === 0 || reviewedMain === remote;
  return {
    ok, base, head, validatedHead, remoteMain: remote, changedPaths, overlappingPaths,
    overlapReviewAcknowledged: reviewedMain === remote,
    ...(ok ? {} : {
      error: 'Review both sides of every overlapping path, preserve unrelated edits, rerun affected checks, then pass --reviewed-main=<remoteMain>.',
    }),
    scope: 'Git freshness and file overlap only; does not certify tests, behavior, generated assets or the deployed version.',
  };
}

try {
  const result = preflight(argumentValues(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
}
