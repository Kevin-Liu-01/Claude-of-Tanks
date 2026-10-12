#!/usr/bin/env python3
"""physics lane: the turret-pop check for the engine change 879f22cc9 (311ca3743 is bit-exact to it for turret pops) that
rides with the fracture package in 219+. One strip root with its manifest, and review sheets. usage: python3 pack-218.py

Sources (2026-10-11 21:45): pop1-f218 filmed only its A arm (B lost port 5461 to another process) and pop2-f218 only its
B arm (A's page detached). The A arm (7420887e2) is deterministic across runs: pop1-f218's fresh A frames are
byte-identical to wave 369's 7420887e2 arm (pop1-b4/B, 61/61 frames per case), so pop2's A comes from wave 369's
pop2-b4/B; pop1's B was re-filmed alone (physics-pop1-f218b, roots/f218, the runner's slot port)."""
import json, os, subprocess, sys
from PIL import Image
SP = '/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad'
W = f'{SP}/physics/wave/strips'
OUT = f'{W}/pop-218'
SOURCES = {
  'A': {'pop-t90-side': 'pop1-f218/A', 'pop-m1-near': 'pop1-f218/A', 'pop-kv2': 'pop2-b4/B', 'shot-m1': 'pop2-b4/B', 'pop-m1-rest': 'pop2-b4/B'},
  'B': {'pop-t90-side': 'pop1-f218b/B', 'pop-m1-near': 'pop1-f218b/B', 'pop-kv2': 'pop2-f218/B', 'shot-m1': 'pop2-f218/B', 'pop-m1-rest': 'pop2-f218/B'},
}
os.makedirs(f'{OUT}/A', exist_ok=True); os.makedirs(f'{OUT}/B', exist_ok=True)
problems = []
for label, cases in SOURCES.items():
    for case, part in cases.items():
        src = f'{W}/{part}/{case}'
        if not os.path.isfile(f'{src}/frames.json'): problems.append(f'missing {src}'); continue
        fj = json.load(open(f'{src}/frames.json'))
        if fj.get('void') or fj.get('streamedDuring', 0) != 0: problems.append(f'{label}/{case}: void {fj.get("void")} streamed {fj.get("streamedDuring")}')
        dst = f'{OUT}/{label}/{case}'
        if not os.path.isdir(dst):
            subprocess.run(['cp', '-cR', src, dst], check=True)
            # the packet's arm, whatever arm the source run called it (APFS clone: the source stays as filmed)
            fj['label'] = label; fj['source'] = f'physics/wave/strips/{part}/{case}'
            json.dump(fj, open(f'{dst}/frames.json', 'w'), indent=1)
if problems:
    print('NOT packed:', problems); sys.exit(1)
manifest = {
  'lane': 'physics',
  'owner_row': 'owner 2026-10-10 00:40: "make turret popping a lot better bc it blows up nicely but then the turret snaps into a pre-ordained resting position. same with building destruction, just let physics work for these kinds of things" (the turret part; buildings follow with dcore)',
  'kind': 'studio motion strips on the pinned harness (fx clock pinned, lens flare off, clouds frozen), the same scenes, cameras and harness as wave 369; fifo2 jobs physics-pop1-f218 (A), physics-pop1-f218b (B), physics-pop2-f218 (B) and wave 369\'s physics-pop2-b4 (A: its 7420887e2 arm; a fresh run of that arm is byte-identical, 122/122 frames checked)',
  'before': {'label': 'A', 'sha': '7420887e2', 'branch': 'physics/rigid-body', 'dist': 'physics/roots/b4 (a clean build of 7420887e2: the turret-pop landing cleared by wave 369)'},
  'after': {'label': 'B', 'sha': '1b587928a', 'branch': 'land/fracture-218', 'dist': 'physics/roots/f218 (a clean build of 1b587928a: the fracture head with box-manifold 879f22cc9; physics/box-manifold 311ca3743, the engine in dcore\'s package, pops turrets bit-exactly as 879f22cc9)'},
  'scene': 'Verdant duel stage, one target tank at (190, 391) killed at 0 ms (tank_kill; ammunition cook-off with turret pop, except shot-m1); a fixed camera per case; every case streamedDuring 0, void false',
  'cases': {
    'pop-t90-side': 'T-90M cook-off seen side-on from 50 m (6 s)',
    'pop-m1-near': 'M1A2 cook-off, three-quarter front from 34 m (6 s)',
    'pop-kv2': 'KV-2 cook-off (its tall box turret), front quarter from 36 m (6 s)',
    'shot-m1': 'M1A2 plain kill by a shot, no pop: the turret only unseats on its deck (close, 22 m, 4 s; a control)',
    'pop-m1-rest': 'the same M1A2 cook-off as pop-m1-near, stills from 8.0 to 10.0 s (400 ms steps) from a wide high camera: where the turret lies',
  },
  'frames': '<label>/<case>/f000.png .. f060.png (frame k = k*100 ms); shot-m1 has f000..f040; pop-m1-rest has f000..f005 at 8.0, 8.4, 8.8, 9.2, 9.6, 10.0 s',
  'criteria': [
    'a cook-off throws the turret visibly high, clear of the fireball, tumbling, and it comes down beside or off its hull',
    'the flight reads as physical: no hang at the top, no snap, jump or teleport between frames',
    'once down it settles by itself (bounce, slide, roll, topple) within a second or two; it never stands balanced on an edge, its rim or its end',
    'the rest pose looks natural: on the ground at whatever angle the fall left it; never floating, sunk, passing through the hull, or sitting level on its own ring as if intact',
    'the gun stays fixed to the turret and moves with it',
    'no regression in the explosion: fireball, smoke column, fire, sparks and dust read the same or better',
    'the plain kill (shot-m1) has no new artefacts: the turret stays on its hull',
  ],
  'note_for_critics': 'A and B are the same scenes with the same pinned effects clock; only the turret after the blast changes. Judge the motion across the frames, not one still.',
  'purpose': 'the turret-pop no-regression check for the physics engine change that rides with the fracture package in 219+ (no longer a 218 gate): the same turret-pop cases as wave 369 (same scenes, cameras and pinned clock), A = the cleared turret-pop landing 7420887e2, B = a build carrying the engine change 879f22cc9 (box contact manifold, bounce measured before warm starts, thin-inertia floor). B should be no worse than A on any criterion.',
}
json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), indent=2)
# review sheets: B over A at 0.2 .. 6 s for the motion cases
os.makedirs(f'{W}/sheets-218', exist_ok=True)
for case, frames in {'pop-t90-side': [2, 5, 10, 15, 20, 25, 30, 40, 50, 60], 'pop-m1-near': [2, 5, 10, 15, 20, 25, 30, 40, 50, 60],
                     'pop-kv2': [2, 5, 10, 15, 20, 25, 30, 40, 50, 60], 'shot-m1': [0, 5, 10, 20, 30, 40], 'pop-m1-rest': [0, 1, 2, 3, 4, 5]}.items():
    rows = []
    for label in 'AB':
        ims = []
        for f in frames:
            p = f'{OUT}/{label}/{case}/f{f:03d}.png'
            if os.path.exists(p): ims.append(Image.open(p).convert('RGB').resize((320, 180), Image.LANCZOS))
        rows.append(ims)
    if not rows[0]: continue
    S = Image.new('RGB', (320 * len(rows[0]), 360))
    for r, ims in enumerate(rows):
        for i, im in enumerate(ims): S.paste(im, (i * 320, r * 180))
    S.save(f'{W}/sheets-218/{case}.png')
print('packed', OUT, 'problems:', problems or 'none')
