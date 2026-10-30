# Lane tool (envelope-honesty-264): which ids' mission attachment / dock seat rows moved anything but their hashes
# between two commits. python3 seat-moves.py <baseRev> <rev>
import json, re, subprocess, sys
base, rev = sys.argv[1:3]
HASH = re.compile(r'(signature|hash|Hash|digest|fingerprint)', re.I)
def rows(r, f):
    t = subprocess.run(['git', 'show', f'{r}:{f}'], capture_output=True, text=True, check=True).stdout
    out = {}
    for line in t.split('\n'):
        m = re.match(r'\s*"([^"]+)":\s*(\{.*\}),?\s*$', line)
        if m: out[m[1]] = json.loads(m[2])
    return out
def strip(v):
    if isinstance(v, dict): return {k: strip(x) for k, x in v.items() if not HASH.search(k)}
    if isinstance(v, list): return [strip(x) for x in v]
    return v
for f in ['src/sim/missionAttachmentSeats.generated.ts', 'src/sim/missionDockSeats.generated.ts']:
    a, b = rows(base, f), rows(rev, f)
    changed = [i for i in b if a.get(i) != b[i]]
    moved = [i for i in changed if strip(a.get(i)) != strip(b[i])]
    print(f'{f}: {len(changed)} rows changed, {len(moved)} moved beyond hashes: {moved}')
    for i in moved[:20]:
        sa, sb = strip(a.get(i) or {}), strip(b[i])
        print('  ', i, {k: (sa.get(k), sb.get(k)) for k in set(sa) | set(sb) if sa.get(k) != sb.get(k)})
