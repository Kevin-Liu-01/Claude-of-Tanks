// The physics lane's turret-pop wave capture: one split unit, two parts, both arms per part on the pinned harness.
//   A = destruction/strike/roots/sa (main 62b2d2455 + Studio strike fidelity: the scripted arc and the settle table)
//   B = physics/roots/<b> (physics/rigid-body: the turret a rigid body)
//   node submit-pop.mjs [--dry] [--b=b1]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const SP = '/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad';
const W = `${SP}/physics/wave`;
// A: --a=<roots name under physics/roots> (main built in the lane), else the destruction lane's strike/roots/sa
const aName = process.argv.find((x) => x.startsWith('--a='))?.slice(4);
const A = aName ? `${SP}/physics/roots/${aName}` : `${SP}/destruction/strike/roots/sa`;
const b = process.argv.find((a) => a.startsWith('--b='))?.slice(4) ?? 'b1';
const B = `${SP}/physics/roots/${b}`;
const dry = process.argv.includes('--dry');
// the coordinator's priority-band place (2026-10-10): one split unit 'pop-wave' at this stamp
const stamp = process.argv.find((a) => a.startsWith('--stamp='))?.slice(8);
const shaA = readFileSync(`${A}/COMMIT`, 'utf8').trim(), shaB = readFileSync(`${B}/COMMIT`, 'utf8').trim();
const parts = [['pop1', 'pop-t90-side,pop-m1-near', 15], ['pop2', 'pop-kv2,shot-m1,pop-m1-rest', 13]];
const now = Date.now();
parts.forEach(([id, cases, budgetMin], k) => {
  const job = { lane: 'physics', splitOf: stamp ? 'pop-wave' : `pop-wave-${b}`, kind: 'picture', id: `${id}-${b}`, queueArrived: now + k, budgetMin,
    ...(stamp ? { queueStamp: Number(stamp), priority: true } : {}),
    cwd: `${SP}/physics/wt`, cloudFreeze: true, gauntlet: true, clock: 'offline', needs: [`${A}/dist`, `${B}/dist`],
    check: ['sh', '-c', `grep -q ${shaA} ${A}/COMMIT && grep -q ${shaB} ${B}/COMMIT`],
    mutex: ['physics', 'port:5460', 'port:5461', 'port:5462'],
    cmd: ['zsh', `${W}/pop-part.zsh`, A, B, cases, `${W}/strips/${id}-${b}`, `${W}/strips/${id}-${b}.done`] };
  const file = `${W}/jobs/${id}-${b}.json`;
  writeFileSync(file, JSON.stringify(job, null, 1));
  if (!dry) execFileSync('node', [`${SP}/fifo2/bin/submit.mjs`, file], { stdio: 'pipe' });
  console.log(dry ? 'wrote' : 'submitted', `physics-${id}-${b}`, cases, `${budgetMin} min`, 'A', shaA.slice(0, 9), 'B', shaB.slice(0, 9));
});
