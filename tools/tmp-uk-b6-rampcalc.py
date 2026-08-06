# TEMP (uk §B6): measure front/rear ramp angles from the side-probe traces.
# The image-x -> world-z mapping is z = C - image_x (gun points image-left);
# C calibrates per model from its own nose extremity. Angles are computed in
# each model's own frame (shift-invariant).
import json, math, sys

tag = sys.argv[1] if len(sys.argv) > 1 else 'before'
tid = sys.argv[2] if len(sys.argv) > 2 else 'chieftain5'
tr = json.load(open(f'shots/uk-b6/{tid}-side-traces-{tag}.json'))

def analyze(name):
    cols = [c for c in tr[name] if c]
    xs = [c[0] for c in cols]
    bots = [c[2] for c in cols]
    ground = min(bots)
    # body columns: exclude the bare gun tube (top-bot < 0.45 and far image-left)
    body = [c for c in cols if (c[1] - c[2]) > 0.6]
    bxs = [c[0] for c in body]
    xmin, xmax = min(bxs), max(bxs)   # xmin = nose side (image-left), xmax = tail
    # ground run: columns whose bottom is within 2px (0.06) of ground
    g = [c for c in body if c[2] <= ground + 0.062]
    gx = sorted(c[0] for c in g)
    g0, g1 = gx[0], gx[-1]            # g0 = front end of ground run (image-left)
    print(f'\n== {name} ==')
    print(f'  body span image-x {xmin:.3f}..{xmax:.3f}  ground y {ground:.3f}')
    print(f'  ground run image-x {g0:.3f}..{g1:.3f} (len {g1-g0:.2f})')
    # FRONT ramp: bottom line from g0 toward xmin
    front = sorted([c for c in body if c[0] <= g0 + 1e-9], key=lambda c: -c[0])
    print('  front bottom line (image-x, bot):')
    for c in front:
        if c[0] > g0 - 1.3:
            print(f'    {c[0]:8.3f}  {c[2]:6.3f}')
    # fit ramp angle: consecutive run from g0 while bottom keeps rising
    seg = []
    for c in front:
        if not seg: seg.append(c); continue
        if c[2] >= seg[-1][2] - 0.02: seg.append(c)
        else: break
    if len(seg) >= 3:
        dz = seg[0][0] - seg[-1][0]
        dy = seg[-1][2] - seg[0][2]
        print(f'  FRONT rise run: dz {dz:.3f} dy {dy:.3f} angle {math.degrees(math.atan2(dy, dz)):.1f} deg '
              f'(from x {seg[0][0]:.2f} y {seg[0][2]:.3f} to x {seg[-1][0]:.2f} y {seg[-1][2]:.3f})')
    # REAR ramp: from g1 toward xmax
    rear = sorted([c for c in body if c[0] >= g1 - 1e-9], key=lambda c: c[0])
    print('  rear bottom line (image-x, bot):')
    for c in rear:
        if c[0] < g1 + 1.6:
            print(f'    {c[0]:8.3f}  {c[2]:6.3f}')
    seg = []
    for c in rear:
        if not seg: seg.append(c); continue
        if c[2] >= seg[-1][2] - 0.02: seg.append(c)
        else: break
    if len(seg) >= 3:
        dz = seg[-1][0] - seg[0][0]
        dy = seg[-1][2] - seg[0][2]
        print(f'  REAR rise run: dz {dz:.3f} dy {dy:.3f} angle {math.degrees(math.atan2(dy, dz)):.1f} deg '
              f'(from x {seg[0][0]:.2f} y {seg[0][2]:.3f} to x {seg[-1][0]:.2f} y {seg[-1][2]:.3f})')

for n in ('refWhole', 'procWhole', 'refHull', 'procHull'):
    analyze(n)
