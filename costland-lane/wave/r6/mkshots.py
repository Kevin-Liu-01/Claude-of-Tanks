#!/usr/bin/env python3
"""mkshots.py: the costland contact round-6 wave — round 6.1 (with rounds 4 + 5) against production's round 3. Every pair is one
build (visual/contact-shadows-r6 @ 62410905e, rH) on one frame: before = its levers off (round 3 = production 213: the round-4 terms off,
the joint cap 0.55, the round-5 terms off), after = as shipped. THE OWNER'S CASE FIRST (their recovered screenshot's camera: an
elevated rear quarter over grass, the slab under the rear overhang), then Verdant close views (the running gear's grass, the
track's foot), then winter (snow under the hull, packed snow at the foot). The hull's grass press stamped as live play does."""
import json, os
W = os.path.dirname(os.path.abspath(__file__))
REFS = {'winter': ['real:Estonia February 2026, side in snow'], 'verdant': ['real:Iron Defender-25', 'real:Salisbury Plain, in long grass']}
shots, missing = [], []
def pair(tag, job, spec, mp, view):
    fb, fa = f'{W}/{job}/h/{spec}/{mp}/{view}-r3eq.png', f'{W}/{job}/h/{spec}/{mp}/{view}-full.png'
    if not (os.path.exists(fb) and os.path.exists(fa)): missing.append(fb if not os.path.exists(fb) else fa); return
    for side, f in (('before', fb), ('after', fa)):
        shots.append({'id': f'r6-{tag}-{side}', 'file': f, 'map': mp, 'view': tag, 'refs': REFS[mp]})
for spec, views in (('leo2a6_ua', ('rearq', 'rearqhi', 'chase')), ('ua_m1a1_x', ('rearq', 'chase'))):
    for v in views: pair(f'owner-{spec}-verdant-{v}', 'owner61', spec, 'verdant', v)
for spec, views in (('leo2a6_ua', ('bay', 'side')), ('m1a2', ('bay', 'side', 'low')), ('m1a2_tusk', ('bay',)), ('challenger2e', ('bay', 'low')),
                    ('spz_puma', ('side', 'low'))):
    for v in views: pair(f'battle-{spec}-verdant-{v}', 'verdant61', spec, 'verdant', v)
for spec, views in (('m1a2', ('side', 'bay', 'low')), ('leo2a6_ua', ('side', 'rearq'))):
    for v in views: pair(f'battle-{spec}-winter-{v}', 'winter61', spec, 'winter', v)
json.dump(shots, open(f'{W}/shots.json', 'w'), indent=1)
print(len(shots), 'shots;', len(missing), 'missing', missing[:3])
