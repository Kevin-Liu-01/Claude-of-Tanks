#!/usr/bin/env python3
"""mkshots.py: the costland contact round-4 wave. before = contact round 3 cda00f45e (rC: the 213 landing, on main 62b2d2455),
after = visual/contact-shadows-r4 a5a058101 (rD: round 3 + main c996f293c + round 4; the joint cap 0.35, 0.65 on snow). THE OWNER'S CASE
FIRST: their recovered screenshot's camera (an elevated rear quarter over grass; the near-black slab under the hull's rear
overhang and along the run: "super super dark rectangular shadows under tracks"), then Verdant close views of desert-camo
hulls, winter, and the Garage canonical. Every battle frame has the hull's grass press stamped as live play does. Writes
shots.json (pairs that exist)."""
import json, os
W = os.path.dirname(os.path.abspath(__file__))
REFS = {'winter': ['real:Estonia February 2026, side in snow'], 'verdant': ['real:Iron Defender-25', 'real:Salisbury Plain, in long grass'],
        'garage': ['real:T-90M Proryv (Russian MoD photo', 'real:CENTCOM 2024']}
shots, missing = [], []
def pair(tag, fb, fc, mp, view):
    if not (os.path.exists(fb) and os.path.exists(fc)): missing.append(fb if not os.path.exists(fb) else fc); return
    for side, f in (('before', fb), ('after', fc)):
        shots.append({'id': f'r4-{tag}-{side}', 'file': f, 'map': mp, 'view': view, 'refs': REFS[mp]})
# 1. the owner's case: their camera (rear quarter ~27° down, the steeper one, the chase camera), the two caged hulls
for spec, views in (('leo2a6_ua', ('rearq', 'rearqhi', 'chase')), ('ua_m1a1_x', ('rearq', 'chase'))):
    for v in views:
        pair(f'owner-{spec}-verdant-{v}', f'{W}/owner3/b/{spec}/verdant/{v}-full.png', f'{W}/final-owner/c/{spec}/verdant/{v}-full.png',
             'verdant', f'owner-{spec}-verdant-{v}')
# 2. Verdant close views (the wave-340 set and the caged hulls)
for spec, views in (('m1a2', ('side', 'low', 'bay')), ('spz_puma', ('side', 'low')), ('challenger2e', ('side', 'low')),
                    ('m1a2_tusk', ('side',)), ('leo2a6_ua', ('side', 'bay'))):
    for v in views:
        pair(f'battle-{spec}-verdant-{v}', f'{W}/battle/b/{spec}/verdant/{v}-full.png', f'{W}/battle2/c/{spec}/verdant/{v}-full.png',
             'verdant', f'battle-{spec}-verdant-{v}')
# 3. winter
for spec, views in (('m1a2', ('side', 'low', 'bay')), ('leo2a6_ua', ('side',))):
    for v in views:
        pair(f'battle-{spec}-winter-{v}', f'{W}/winter2/b/{spec}/winter/{v}-full.png', f'{W}/winter3/c/{spec}/winter/{v}-full.png',
             'winter', f'battle-{spec}-winter-{v}')
# 4. the Garage canonical
for spec in ('m1a2', 't90m', 'spz_puma', 'leo2a6_ua'):
    pair(f'garage-{spec}-canonical', f'{W}/garage2/b/garage/garage-{spec}-canonical.png', f'{W}/garage2/c/garage/garage-{spec}-canonical.png',
         'garage', f'garage-{spec}-canonical')
json.dump(shots, open(f'{W}/shots.json', 'w'), indent=1)
print(len(shots), 'shots;', len(missing), 'missing', missing[:4])
