#!/usr/bin/env python3
"""physics lane: the solver-only collapse wave packet: A = dcore's frames on ae3557331 (fr-7h barn, fr-8j house),
B = my films of e9b4b8282 + physics 311ca3743 (roots/fx2). Clones both arms into one root with a manifest."""
import json, os, subprocess
SP = '/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad'
OUT = f'{SP}/physics/wave/strips/collapse-fx2'
srcA = {'fr-barn': f'{SP}/destruction/s1/strips/fr-7h/B/fr-barn', 'fr-barn-far': f'{SP}/destruction/s1/strips/fr-7h/B/fr-barn-far',
        'fr-barn-ap': f'{SP}/destruction/s1/strips/fr-7h/B/fr-barn-ap', 'fr-house': f'{SP}/destruction/s1/strips/fr-8j/A/fr-house',
        'fr-house-near': f'{SP}/destruction/s1/strips/fr-8j/A/fr-house-near'}
srcB = {c: f'{SP}/physics/wave/strips/{"barn" if "barn" in c else "house"}-fx2/B/{c}' for c in srcA}
problems = []
for label, src in (('A', srcA), ('B', srcB)):
    os.makedirs(f'{OUT}/{label}', exist_ok=True)
    for case, d in src.items():
        if not os.path.isdir(d): problems.append(f'missing {label}/{case}: {d}'); continue
        fj = json.load(open(f'{d}/frames.json'))
        if fj.get('void') or fj.get('streamedDuring', 0) != 0: problems.append(f'{label}/{case}: void {fj.get("void")} streamed {fj.get("streamedDuring")}')
        dst = f'{OUT}/{label}/{case}'
        if not os.path.isdir(dst): subprocess.run(['cp', '-cR', d, dst], check=True)
manifest = {
  'lane': 'physics',
  'owner_row': 'owner 2026-10-10 00:40: "... same with building destruction, just let physics work for these kinds of things" (the collapses dcore builds on the physics lane\'s engine)',
  'kind': 'studio motion strips on dcore\'s harness (destruction/s1/fr-strip-one.zsh: fx clock pinned, lens flare off, clouds frozen), the same scenes as waves 407/409',
  'before': {'label': 'A', 'sha': 'ae3557331', 'branch': 'land/fracture (dcore)', 'frames': 'dcore\'s films: destruction/s1/strips/fr-7h/B (barn) and fr-8j/A (house)'},
  'after': {'label': 'B', 'sha': '2d6278e5c', 'branch': 'e9b4b8282 + physics/box-manifold 311ca3743', 'dist': 'physics/roots/fx2'},
  'scene': 'dcore\'s fracture scenes (destruction/s1/fr-scenes.mjs): a Verdant brick barn shot ten times on its gable (near, far, APFSDS then HE), a Steinburg three-storey Fachwerk house shot ten times on its south face (street and near)',
  'cases': {'fr-barn': 'the barn, near', 'fr-barn-far': 'the barn from across the field', 'fr-barn-ap': 'six 120 mm APFSDS then four HE', 'fr-house': 'the house over the street', 'fr-house-near': 'the house close to its face'},
  'frames': '<label>/<case>/f000.png .. (frame k = startMs + k*stepMs per the scene)',
  'purpose': 'solver-only check: B is A\'s head with the physics lane\'s engine 311ca3743 (bit-exact to A\'s engine except that both bodies of a contact now report their landings, so a panel landing on another piece cracks) and the faster step; dcore\'s caps unchanged. B should read at least as physical as A: walls and roofs breaking and coming down into a heap, no piece frozen or hanging, nothing landing as a neat lid.',
  'criteria': [
    'the building comes down physically: walls and roof break, fall and pile into a heap; no piece hangs, stands frozen or is held in a pose for seconds',
    'roofs and panels break when they land on the heap, not only on the ground; no roof lands as one level unbroken lid',
    'the heap reads as a whole building\'s worth of broken material, not a tidy ring of stubs',
    'no regression in the strikes, breaches, dust and smoke',
  ],
}
json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), indent=2)
print('packed', OUT, 'problems:', problems or 'none')
