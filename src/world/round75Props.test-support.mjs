// Round 75 (2026-09-26, structures and props): whiteout.ts gained two props keys — the industrial cladding law
// (`industrialCladding: 'steel'`) and the yard-dressing budget (`yardDressing: 60`). Props authoring never feeds the
// playable relief or the splat, so the byte receipt that holds a map's authoring against its historical source
// (badlandsRelief.selftest) projects the two lines away before comparing, the way rounds 47, 66, 70, 71, 72 and 76
// project their blocks. A later edit to either line must update this pair (the receipt fails loudly on a line it no
// longer finds exactly once).
import assert from 'node:assert/strict';

const ROUND75_WHITEOUT_PROPS = [
  "    industrialCladding: 'steel', // round 75: a polar station's halls are corrugated sheet, not brick\n"
  + '    yardDressing: 60, // round 75: a snowed-in station keeps its yards sparse\n',
  '',
];

export function historicalRound75PropsSource(source, file) {
  if (file !== 'whiteout.ts') return source;
  const [current, historical] = ROUND75_WHITEOUT_PROPS;
  assert.equal(source.split(current).length, 2, `${file}: one exact round-75 props block`);
  return source.replace(current, historical);
}
