import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && fs.existsSync(file));

const forbidden = tracked.filter((file) => (
  /(?:^|\/)(?:tasks?|dev[-_]?handoff|worklog|status)(?:[-_.\/]|$)/i.test(file) ||
  /\.(?:bak|orig|rej|tmp)$/i.test(file) ||
  /^public\/media\/.*\.gif$/i.test(file) ||
  /^docs\/(?:model-quality-report|procedural-fidelity-report|perf-after|perf-trend)(?:\.|$)/i.test(file) ||
  /^docs\/(?:DEVELOPMENT-EVOLUTION|IMPROVEMENT-PROGRAM|MOBILE-QA|native-fleet-restoration)(?:[-_.]|$)/i.test(file) ||
  /(?:^|\/)(?:node_modules|dist|\.qa-dev|\.qa-device)(?:\/|$)/.test(file)
));
assert.deepEqual(forbidden, [],
  `public tree contains transient task, backup, dependency, QA, or redundant GIF artifacts:\n${forbidden.join('\n')}`);

const critiqueFiles = tracked.filter((file) => (
  file.startsWith('docs/critique/') && fs.existsSync(file)
));
let citationOwners = [];
try {
  citationOwners = execFileSync('git', [
    'grep', '-I', '-F', '-l', 'docs/critique/', '--', ':!docs/critique/**',
  ], { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch (error) {
  if (error?.status !== 1) throw error;
}
const citationText = citationOwners
  .filter((file) => fs.existsSync(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const orphanedCritiques = critiqueFiles.filter((file) => !citationText.includes(file));
assert.deepEqual(orphanedCritiques, [],
  `unreferenced iterative critique receipts belong in .qa-dev/ and Git history:\n` +
  orphanedCritiques.join('\n'));

console.log(
  `public-repo-hygiene.selftest: ${tracked.length} tracked paths; ` +
  `${critiqueFiles.length} cited visual receipts; no generated reports or transient artifacts`,
);
