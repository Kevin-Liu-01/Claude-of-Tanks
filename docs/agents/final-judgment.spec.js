export const meta = {
  name: 'claude-of-tanks-final-judgment',
  description: 'Finish the interrupted process: the blind side-by-side judge that never ran, then a full independent 9-lens re-evaluation with adversarial verification',
  phases: [
    { title: 'BlindJudge', detail: 'per-view blind A/B vs real WoT — the step credits killed; runs FIRST so it survives a budget cut' },
    { title: 'Audit', detail: '9 fresh evaluators, no memory of the build' },
    { title: 'Verify', detail: 'adversarial confirm/refute of every critical+major finding' },
    { title: 'Synthesize', detail: 'final scorecard -> docs/EVALUATION-final.md' },
  ],
}

const P = '/Users/kevinliu/claude-of-tanks'
const COMMON = [
  'PROJECT ROOT: ' + P + '. Node via nvm — before ANY node command:  export PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH"',
  'Harness:  cd ' + P + ' && node tools/screenshot.mjs  (16 views to shots/). Other gates: tools/controls-probe.mjs (direction-aware controls), tools/perfprobe.mjs, tools/garage-camera-probe.mjs, src/sim/combat.selftest.mjs, src/sim/spotting.selftest.mjs. Use hmr:false in any temp puppeteer script.',
  'Temp scripts go in /private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad — never commit them.',
  'You are an EVALUATOR: read, run, measure, judge. Do NOT fix anything or edit game source. Evidence for every claim (file:line, PNG name, measured number).',
  'Your final message is consumed by an orchestration script — return exactly what is asked.',
].join('\n')

const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', description: '1-10, one decimal. 8.5+ = would genuinely pass as a modern AAA game.' },
    wouldPassAsAAA: { type: 'boolean' },
    verdict: { type: 'string' },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          evidence: { type: 'string' },
        },
        required: ['description', 'severity'],
      },
    },
  },
  required: ['score', 'wouldPassAsAAA', 'verdict', 'problems'],
}

// ------------------------------------------------------------ BLIND JUDGE
// Deliberately first: this is the step the credit exhaustion killed, and it is
// the cheapest of the four phases. If budget dies mid-run, the missing piece is
// already captured.
phase('BlindJudge')
log('Blind side-by-side judge — the step that never ran')

const VIEWS = [
  { key: 'battlefield', what: 'wide establishing shot, verdant map' },
  { key: 'battlefield_desert', what: 'wide establishing shot, desert map' },
  { key: 'battlefield_winter', what: 'wide establishing shot, winter map' },
  { key: 'battlefield_urban', what: 'wide establishing shot, urban map' },
  { key: 'player_view', what: 'third-person chase camera with full battle HUD' },
  { key: 'sniper_view', what: 'gunner scope view' },
  { key: 'tank_closeup_modern', what: 'modern MBT close orbit' },
  { key: 'tank_closeup_ww2', what: 'WWII heavy close orbit' },
  { key: 'combat_firing', what: 'tank mid-shot: muzzle flash, tracer' },
  { key: 'explosion', what: 'vehicle destruction' },
  { key: 'garage', what: 'garage / tank select screen' },
  { key: 'killcam_xray', what: 'kill cam x-ray shot analysis' },
]

const BLIND_SCHEMA = {
  type: 'object',
  properties: {
    view: { type: 'string' },
    score: { type: 'number' },
    winner: { type: 'string', enum: ['ours', 'real-wot', 'tie'] },
    wouldFoolAPlayer: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['view', 'score', 'winner', 'wouldFoolAPlayer', 'notes'],
}

const blind = await parallel(VIEWS.map((v) => () =>
  agent(COMMON + '\n\nYou are an impartial games journalist running a BLIND side-by-side comparison. Run  cd ' + P + ' && node tools/screenshot.mjs --views ' + v.key + '  (or the full harness if the single-view flag is unsupported), then Read ' + P + '/shots/' + v.key + '.png at full attention.\n\nThis view is: ' + v.what + '\n\nNow judge it as if it were pinned up next to an equivalent screenshot from real World of Tanks (1.x, post-Core-engine) with no labels: which image would a viewer pick as the better-looking game, and would a WoT player shown only this frame believe it came from a real commercial tank game? Score 1-10 where 8.5+ means it would genuinely pass. Be fair but unsparing, and be concrete about what gives it away.', {
    label: 'blind:' + v.key,
    phase: 'BlindJudge',
    schema: BLIND_SCHEMA,
    effort: 'high',
  })
))
const blindOk = blind.filter(Boolean)
const blindAvg = blindOk.length ? blindOk.reduce((a, b) => a + b.score, 0) / blindOk.length : 0
const oursWins = blindOk.filter((b) => b.winner === 'ours').length
const fooled = blindOk.filter((b) => b.wouldFoolAPlayer).length
log('Blind judge: avg ' + blindAvg.toFixed(2) + ', ours-preferred ' + oursWins + '/' + blindOk.length + ', would-fool-a-player ' + fooled + '/' + blindOk.length)

// ------------------------------------------------------------ AUDIT
phase('Audit')
log('9 fresh evaluators with no memory of the build')

const LENSES = [
  { key: 'visual_environment', prompt: 'LENS: environment visuals. Run the harness; Read all four battlefield_*.png plus player_view.png and combat_firing.png. Judge lighting, shadows, sky, fog, terrain materials, foliage, props, draw distance against real World of Tanks 1.x. Name every visual failure precisely.' },
  { key: 'visual_vehicles', prompt: 'LENS: vehicle art across the whole roster. Read the two closeups and garage.png, then write a temp puppeteer script that cycles the garage carousel and captures EVERY vehicle (~48) — Read a representative 15+ spanning sourced-GLB and procedural, WWII and modern and community. Judge recognizability against docs/research/tank-roster.md and modern-roster.md, proportions, geometry density, track-run realism (trapezoidal profile is a project hard gate), texture/material quality, camo, scale consistency. Score the WORST vehicles as heavily as the best and say which they are.' },
  { key: 'hud_ux', prompt: 'LENS: HUD/UI/UX. Read player_view.png, sniper_view.png, and garage.png. Then a temp puppeteer script: open settings, rebind a key, confirm localStorage persistence; exercise the camo picker and map picker. Judge against real WoT UI and check for dead/fake affordances (a past audit found dead consumable slots and a no-op minimap zoom — verify their current state).' },
  { key: 'playability', prompt: 'LENS: does it PLAY. Run  node tools/controls-probe.mjs  and  node tools/garage-camera-probe.mjs  and report their results. Then write your OWN independent drive-test (do not just trust the committed probes): garage -> battle, drive, aim, switch shells, sniper, fire at an enemy, take return fire, die, watch the kill cam, rematch. Assert directions are correct in screen space (D turns toward screen-right, rightward mouse swings the gun right) — an inversion here was a recent user-reported bug. Report exactly which assertions pass and fail.' },
  { key: 'sim_correctness', prompt: 'LENS: simulation math. Audit src/sim/ballistics.js, armor.js, damage.js line-by-line against docs/research/armor-penetration.md and shells-ballistics.md; run combat.selftest.mjs and spotting.selftest.mjs and report counts. Verify the hit->armor-zone mapping matches actual tank geometry on 3 vehicles. Any formula deviating from the docs without justification is a finding.' },
  { key: 'movement_correctness', prompt: 'LENS: movement physics and camera. Audit src/sim/movement.js and src/engine/cameraRig.js against docs/research/movement-physics.md: power/weight acceleration, terrain resistance, pivot vs drive turns, slope effects, hull pitch/roll support solve, recoil, traverse and elevation limits, dispersion bloom, sniper zoom steps, camera collision. Write a small node harness to check acceleration and top speed for 2 vehicles against their specs. Also judge the new garage camera behavior (per-vehicle framing, drag orbit clamps, spring-back).' },
  { key: 'performance', prompt: 'LENS: measured performance. Run  node tools/perfprobe.mjs  yourself in BOTH garage and battle and at BOTH deviceScaleFactor 1 and 2 (this Mac is retina — dsf2 is the real default). Budget: >=60fps median and >=45fps p5 at 1080p, <=900 draw calls, <=7.0M triangles, <=512MB textures, load-to-ready <=8s, stable heap. A performance overhaul just landed claiming a dormant battle world in the garage — verify that claim independently. Compare against docs/perf-baseline*.json, perf-after*.json and perf-trend.jsonl. Score 8.5+ ONLY if all budgets pass with measured numbers as evidence, and say if the machine was contended.' },
  { key: 'code_architecture', prompt: 'LENS: code quality and architecture. Read docs/ARCHITECTURE.md then review src/ (~63k LOC): module boundary violations, dead code, duplicated logic, error isolation around the update loop, memory leaks (geometry/material/texture disposal on garage swap and battle teardown, listener removal), main.js god-object risk, magic numbers, unit consistency, and drift between ARCHITECTURE.md and reality. Cite file:line.' },
  { key: 'completeness', prompt: 'LENS: completeness vs the current commission. The user asked for: a World-of-Tanks-level game in Three.js at AAA quality; deep research reflected in systems; modern tanks (20+) alongside WWII; hit/armor/shell/movement systems; HD models with real sourced assets where possible; editable controls; firing at enemies; multiple maps; flags; Switzer typography; kill cams and shot info with armor diagrams; a camo system; and strong performance. The owner explicitly removed the tech tree, so do not treat its absence as a defect. Check EVERY current item: present / partial / missing, with evidence. Also audit docs/ATTRIBUTION.md against the files actually in public/ (every asset attributed? quarantine section accurate?) and list what a real WoT player would still immediately miss.' },
]

const audits = await parallel(LENSES.map((l) => () =>
  agent(COMMON + '\n\nYou are a senior evaluator hired to be exhaustive and harsh, with no prior involvement in building this. ' + l.prompt + '\n\nScore 1-10 (8.5+ = AAA / fully delivers). Never award points for effort; when uncertain score lower and say why.', {
    label: 'audit:' + l.key,
    phase: 'Audit',
    schema: CRITIC_SCHEMA,
    effort: 'high',
  })
))
const done = audits.filter(Boolean)
log('Audits: ' + done.map((a, i) => LENSES[i].key + '=' + (a ? a.score : 'x')).join(' '))

// Barrier justified: the verification set is a dedup across ALL lenses.
const majors = []
done.forEach((a, i) => {
  for (const p of (a.problems || [])) {
    if (p.severity === 'critical' || p.severity === 'major') majors.push({ lens: LENSES[i].key, ...p })
  }
})
const seen = new Set()
const unique = majors.filter((f) => {
  const k = ((f.description || '') + '|' + (f.evidence || '')).toLowerCase().slice(0, 120)
  if (seen.has(k)) return false
  seen.add(k)
  return true
})
const CAP = 24
const toVerify = unique.slice(0, CAP)
if (unique.length > CAP) log('NOTE: verifying top ' + CAP + ' of ' + unique.length + ' major findings; remainder listed unverified')

// ------------------------------------------------------------ VERIFY
phase('Verify')
log('Adversarially verifying ' + toVerify.length + ' critical/major findings')
const VERIFY_SCHEMA = {
  type: 'object',
  properties: { confirmed: { type: 'boolean' }, note: { type: 'string' } },
  required: ['confirmed', 'note'],
}
const verified = await parallel(toVerify.map((f) => () =>
  agent(COMMON + '\n\nAdversarially VERIFY this finding from lens "' + f.lens + '". Your default stance is that it is WRONG or STALE. Reproduce it against the current tree or refute it:\n' + JSON.stringify(f) + '\n\nReproduce = confirmed:true. Cannot reproduce, already fixed, or the evidence does not hold = confirmed:false. Check the actual files, screenshots and probes yourself; do not trust the finding text.', {
    label: 'verify:' + String(f.description || '').slice(0, 40),
    phase: 'Verify',
    schema: VERIFY_SCHEMA,
  }).then((v) => ({ ...f, verified: v ? v.confirmed : null, verifyNote: v ? v.note : 'verifier died' }))
))
const confirmed = verified.filter(Boolean).filter((f) => f.verified === true)
const refuted = verified.filter(Boolean).filter((f) => f.verified === false)
log('Verification: ' + confirmed.length + ' confirmed, ' + refuted.length + ' refuted/stale')

// ------------------------------------------------------------ SYNTHESIZE
phase('Synthesize')
const scorecard = done.map((a, i) => ({ area: LENSES[i].key, score: a ? a.score : null, summary: a ? a.verdict : 'evaluator died' }))
const synthesis = await agent(COMMON + '\n\nYou are the evaluation editor. Write ' + P + '/docs/EVALUATION-final.md — the definitive closing evaluation of this project. Note the git HEAD you observe.\n\nCONTEXT you must state plainly: the build ran a 12-round visual-critic loop that stopped at round 7 when usage credits ran out. Through those 7 rounds the systems dimensions cleared or approached the 8.5 bar (simulation math peaked at 9.1, spotting 8.4, movement 8.4, shot intelligence 8.4, content breadth 8.5) while the art dimensions (lighting, terrain, per-vehicle model cohesion across ~48 vehicles, effects polish) plateaued in the 5-7 range. The blind side-by-side judge never ran until now. Three late fixes landed after the loop: a performance overhaul, a rebuilt garage camera, and a control-direction inversion fix.\n\nBLIND JUDGE RESULTS (the step that was missing):\n' + JSON.stringify(blindOk, null, 1) + '\n\nRE-EVALUATION SCORECARD:\n' + JSON.stringify(scorecard, null, 1) + '\n\nCONFIRMED FINDINGS (adversarially verified):\n' + JSON.stringify(confirmed, null, 1) + '\n\nREFUTED/STALE (list briefly for transparency):\n' + JSON.stringify(refuted.map((r) => ({ description: r.description, note: r.verifyNote })), null, 1) + '\n\nUNVERIFIED OVERFLOW:\n' + JSON.stringify(unique.slice(CAP), null, 1) + '\n\nStructure: (1) closing verdict paragraph with a weighted overall score and a direct answer to "does this pass as a modern AAA tank game, and where exactly does it fall short"; (2) the blind side-by-side table (per view: score, which won, would-it-fool-a-player); (3) the 9-lens scorecard table; (4) confirmed findings by severity, each with a concrete recommended fix; (5) what genuinely impressed; (6) the honest remaining gap to real World of Tanks; (7) refuted-findings appendix. Be fair and unsparing — this document is the project epitaph, not marketing.\n\nThen update the "Honest status" section of ' + P + '/README.md so it reflects these final numbers instead of the round-7 snapshot. Then: git add docs/EVALUATION-final.md README.md && git commit -m "Final evaluation: blind side-by-side judge + independent re-evaluation" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" (commit ONLY those two files). Return a <=250 word executive summary.', {
  label: 'synthesize',
  phase: 'Synthesize',
  effort: 'high',
})

return {
  blindJudge: { avg: +blindAvg.toFixed(2), oursPreferred: oursWins + '/' + blindOk.length, wouldFoolAPlayer: fooled + '/' + blindOk.length, perView: blindOk.map((b) => ({ view: b.view, score: b.score, winner: b.winner })) },
  scorecard,
  confirmedCount: confirmed.length,
  refutedCount: refuted.length,
  confirmed: confirmed.map((f) => ({ lens: f.lens, description: String(f.description || '').slice(0, 140), severity: f.severity })),
  executiveSummary: String(synthesis),
}
