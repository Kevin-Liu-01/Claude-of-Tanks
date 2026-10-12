#!/usr/bin/env python3
"""physics lane: assemble the re-filmed pop wave (pop1-b3 + pop2-b3) into one strip root with its manifest, and build
review sheets. usage: python3 pack-wave2.py"""
import json, os, subprocess, sys
from PIL import Image
SP = '/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad'
W = f'{SP}/physics/wave/strips'
OUT = f'{W}/pop-218'
parts = {'pop1-f218': ['pop-t90-side', 'pop-m1-near'], 'pop2-f218': ['pop-kv2', 'shot-m1', 'pop-m1-rest']}
os.makedirs(f'{OUT}/A', exist_ok=True); os.makedirs(f'{OUT}/B', exist_ok=True)
problems = []
for part, cases in parts.items():
    for label in 'AB':
        for case in cases:
            src = f'{W}/{part}/{label}/{case}'
            if not os.path.isdir(src): problems.append(f'missing {src}'); continue
            fj = json.load(open(f'{src}/frames.json'))
            if fj.get('void') or fj.get('streamedDuring', 0) != 0: problems.append(f'{label}/{case}: void {fj.get("void")} streamed {fj.get("streamedDuring")}')
            dst = f'{OUT}/{label}/{case}'
            if not os.path.isdir(dst): subprocess.run(['cp', '-cR', src, dst], check=True)
manifest = {
  'lane': 'physics',
  'owner_row': 'owner 2026-10-10 00:40: "make turret popping a lot better bc it blows up nicely but then the turret snaps into a pre-ordained resting position. same with building destruction, just let physics work for these kinds of things" (the turret part; buildings follow with dcore)',
  'kind': 'studio motion strips, fx clock pinned (600 s), lens flare off (FX_STRIPS_NO_LENSFLARE=1), clouds frozen; fifo2 jobs physics-pop1-f218 + physics-pop2-f218 (split pop-wave, stamp 1791397983242, the 218 band)',
  'before': {'label': 'A', 'sha': '7420887e2', 'branch': 'physics/rigid-body', 'dist': 'physics/roots/b4 (a clean build of 7420887e2: the turret-pop landing cleared by wave 369)'},
  'after': {'label': 'B', 'sha': '1b587928a', 'branch': 'land/fracture-218', 'dist': 'physics/roots/f218 (a clean build of 1b587928a: the fracture head with box-manifold 879f22cc9)'},
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
  'purpose': 'a no-regression check for 218: the same turret-pop cases as wave 369 (same scenes, cameras and pinned clock), A = the cleared turret-pop landing, B = the fracture landing that carries the physics engine change 879f22cc9 (box contact manifold, bounce measured before warm starts, thin-inertia floor). B should be no worse than A on any criterion.',
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
