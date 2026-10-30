# Lane tool (envelope-honesty-264): main/spaced plates whose extent moved between two plates.mjs dumps (base, lane), per id.
#   python3 plate-shift.py <base.log> <lane.log> [--min=0.03]
import re, sys
from collections import defaultdict
mn = float(next((a[6:] for a in sys.argv if a.startswith('--min=')), 0.03))
R = re.compile(r'^([TH]) (\S+)\s+(\S+)\s.*?x (\S+)\.\.(\S+) y (\S+)\.\.(\S+) z (\S+)\.\.(\S+)')
def load(f):
    out, cur = defaultdict(lambda: defaultdict(list)), None
    for l in open(f):
        if l.startswith('== '): cur = l[3:].strip(); continue
        m = R.match(l)
        if m and cur and m.group(3) != 'era':
            out[cur][(m.group(1), m.group(2))].append(tuple(float(v) for v in m.groups()[3:]))
    return out
B, L = load(sys.argv[1]), load(sys.argv[2])
for id in L:
    rows = []
    for k, lv in L[id].items():
        bv = B[id].get(k)
        if not bv or len(bv) != len(lv): rows.append((9, f'{k[0]} {k[1]} count {len(bv or [])}->{len(lv)}')); continue
        for b, a in zip(bv, lv):
            d = [a[i] - b[i] for i in range(6)]
            m = max(abs(x) for x in d)
            if m >= mn: rows.append((m, f"{k[0]} {k[1]} x {b[0]}..{b[1]}->{a[0]}..{a[1]} y {b[2]}..{b[3]}->{a[2]}..{a[3]} z {b[4]}..{b[5]}->{a[4]}..{a[5]}"))
    rows.sort(reverse=True)
    print(f"{id}: {len(rows)} plate(s) moved >= {mn} m" + (f", max {rows[0][0]:.2f}" if rows else ''))
    for m, s in rows[:6]: print('   ', s)
