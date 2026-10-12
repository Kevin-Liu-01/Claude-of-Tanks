#!/bin/zsh
# run the collapsePieces receipt with COLLAPSE_DEBUG and summarize: cracks, upper pieces' mean final height, per building
cd $1
COLLAPSE_DEBUG=1 RB_TOGGLES=$2 nice -n 5 node src/fx/collapsePieces.selftest.mjs 2>&1 | python3 -c "
import sys, re, collections
lines = sys.stdin.read().splitlines()
seen = set(); per = collections.defaultdict(list); cracks = {}
for l in lines:
    m = re.match(r'\s+(\S+/\S+) (\d+) (\w+) from y ([\d.]+) to ([\d./-]+) release', l)
    if m:
        key = (m.group(1), m.group(2))
        if key in seen: continue
        seen.add(key)
        hs = [float(x) for x in m.group(5).split('/') if x]
        per[m.group(1)].append((float(m.group(4)), sum(hs) / len(hs)))
    m2 = re.match(r'\s+(\S+/\S+): (\d+) pieces \((\d+) cracked', l)
    if m2 and m2.group(1) not in cracks: cracks[m2.group(1)] = int(m2.group(3))
out = []
for b, v in per.items():
    mean = sum(x[1] for x in v) / len(v); start = sum(x[0] for x in v) / len(v)
    out.append(f'{b.split(\"/\")[1][:7]} cr{cracks.get(b, \"?\")} up {start:.1f}->{mean:.2f}')
print('$2'.ljust(10), ' | '.join(out))
"
