import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SELFTEST_SUITES } from './selftest-suites.mjs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && fs.existsSync(file));

const forbidden = tracked.filter((file) => (
  /(?:^|\/)(?:tasks?|dev[-_]?handoff|worklog|status)(?:[-_.\/]|$)/i.test(file) ||
  /\.(?:bak|orig|rej|tmp)$/i.test(file) ||
  /^public\/media\/.*\.gif$/i.test(file) ||
  /^docs\/(?:model-quality-report|procedural-fidelity-report|perf-after|perf-trend)(?:\.|$)/i.test(file) ||
  /^docs\/(?:DEVELOPMENT-EVOLUTION|IMPROVEMENT-PROGRAM|MOBILE-QA|native-fleet-restoration)(?:[-_.]|$)/i.test(file) ||
  /^docs\/decisions\//i.test(file) ||
  /(?:^|\/)(?:node_modules|dist|\.qa-dev|\.qa-device)(?:\/|$)/.test(file)
));
assert.deepEqual(forbidden, [],
  `public tree contains transient task, backup, dependency, QA, or redundant GIF artifacts:\n${forbidden.join('\n')}`);

const registeredSelftests = new Set(
  Object.values(SELFTEST_SUITES).flat().filter((file) => file.endsWith('.selftest.mjs')),
);
const trackedSelftests = tracked.filter((file) => file.endsWith('.selftest.mjs'));
const orphanedSelftests = trackedSelftests.filter((file) => !registeredSelftests.has(file));
const missingSelftests = [...registeredSelftests].filter((file) => !fs.existsSync(file));
assert.deepEqual(orphanedSelftests, [],
  `tracked self-tests must remain executable release contracts or be removed:\n${orphanedSelftests.join('\n')}`);
assert.deepEqual(missingSelftests, [],
  `self-test registry references missing public files:\n${missingSelftests.join('\n')}`);

// Standalone probe scripts are easy to abandon after one visual round. Keep
// only tools that are reachable from package/docs/another tool, or a small
// explicit set of reusable engineering rigs whose CLI surface is intentionally
// independent. Historical experiments belong in Git history, not the public
// checkout.
const maintainedStandaloneTools = new Set([
  'tools/atgm-guidance-probe.mjs',
  'tools/bot-combat-probe.mjs',
  'tools/fleet-battle-views.mjs',
  'tools/fleet-geometry-audit.mjs',
  'tools/fleet-visual-compare.mjs',
  'tools/garage-switch-probe.mjs',
  'tools/gunnery_gate.mjs',
  'tools/ifv-recoil-probe.mjs',
  'tools/mobile-dynamic-aim-probe.mjs',
  'tools/qa-evidence-manifest.mjs',
  'tools/reviveprobe.mjs',
  'tools/switch-latency-probe.mjs',
  'tools/voice-smoke.mjs',
  'tools/winding-audit.mjs',
  'tools/world-pole-visual-audit.mjs',
  'tools/world-wreck-visual-audit.mjs',
]);
const standaloneTools = tracked.filter((file) => (
  /^tools\/[^/]+\.mjs$/.test(file) && !file.endsWith('.selftest.mjs')
));
const toolReferenceFiles = tracked.filter((file) => (
  file !== 'tools/public-repo-hygiene.selftest.mjs' && (
    /\.(?:md|json|html|ts|mjs)$/.test(file)
  )
));
const toolReferenceText = new Map(toolReferenceFiles.map((file) => [
  file,
  fs.readFileSync(file, 'utf8'),
]));
const orphanedTools = standaloneTools.filter((file) => {
  if (maintainedStandaloneTools.has(file)) return false;
  const basename = file.slice('tools/'.length);
  return !toolReferenceFiles.some((owner) => (
    owner !== file && toolReferenceText.get(owner)?.includes(basename)
  ));
});
const missingMaintainedTools = [...maintainedStandaloneTools]
  .filter((file) => !tracked.includes(file));
assert.deepEqual(orphanedTools, [],
  `standalone tools must be referenced, explicitly maintained, or removed:\n${orphanedTools.join('\n')}`);
assert.deepEqual(missingMaintainedTools, [],
  `maintained standalone tool list contains missing files:\n${missingMaintainedTools.join('\n')}`);

const ownedSkillDocs = new Set([
  '.agents/skills/improve-threejs/SKILL.md',
  'SKILL.md',
  'server/SKILL.md',
  'src/audio/SKILL.md',
  'src/engine/SKILL.md',
  'src/fx/SKILL.md',
  'src/gallery/SKILL.md',
  'src/game/SKILL.md',
  'src/net/SKILL.md',
  'src/sim/SKILL.md',
  'src/ui/SKILL.md',
  'src/vehicles/SKILL.md',
  'src/world/SKILL.md',
  'tools/SKILL.md',
  'tools/marketing-shots/SKILL.md',
]);
const straySkillDocs = tracked.filter((file) => file.endsWith('/SKILL.md') || file === 'SKILL.md')
  .filter((file) => !ownedSkillDocs.has(file));
assert.deepEqual(straySkillDocs, [],
  `unindexed skill documents do not belong in the public source tree:\n${straySkillDocs.join('\n')}`);

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
  `${trackedSelftests.length} registered tests; ${ownedSkillDocs.size} owned skills; ` +
  `${standaloneTools.length} governed standalone tools; ` +
  `${critiqueFiles.length} cited visual receipts; no generated reports or transient artifacts`,
);
