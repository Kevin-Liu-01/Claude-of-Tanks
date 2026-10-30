# Lane tool (envelope-honesty-264): splice the after-run pairs (rr-after.mjs --ids=<changed>) into the balance lane's
# before shards and write one shard file rr-merge.py reads; then compare the merged before and after.
#   python3 rr-splice.py <before-dir> <after-dir> <changed-ids-file> <out-dir> [<deferred,ids>]
# A deferred id went back to its 263 build after the after-run: every pair with it keeps its before result.
import json, glob, sys, subprocess, os
before_dir, after_dir, ids_file, out = sys.argv[1:5]
deferred = set(sys.argv[5].split(',')) if len(sys.argv) > 5 else set()
ids = set(l.split('\t')[0].strip() for l in open(ids_file) if l.strip())
key = lambda p: (p['tier'], p['a'], p['b'], p.get('row'), p.get('extra'))
load = lambda d: [p for f in sorted(glob.glob(f'{d}/shard-*.json')) for p in json.load(open(f))['pairs']]
before, after = load(before_dir), load(after_dir)
amap = {key(p): p for p in after}
want = [key(p) for p in before if p['a'] in ids or p['b'] in ids]
missing = [k for k in want if k not in amap]
extra = [k for k in amap if k not in set(want)]
if missing or extra:
    sys.exit(f'after set does not match: {len(missing)} missing (e.g. {missing[:3]}), {len(extra)} extra (e.g. {extra[:3]})')
spliced = [p if (p['a'] in deferred or p['b'] in deferred) else amap.get(key(p), p) for p in before]
ids -= deferred
os.makedirs(out, exist_ok=True)
json.dump({'pairs': spliced}, open(f'{out}/shard-0.json', 'w'))
here = os.path.dirname(os.path.abspath(__file__))
merge = os.path.expanduser('~/cot-lanes/balance-263-evidence/rr-merge.py')
subprocess.run(['python3', merge, f'{out}/merged.json', f'{out}/shard-0.json'], check=True)
B = json.load(open(f'{before_dir}/merged-mine.json')); A = json.load(open(f'{out}/merged.json'))
print('\ntier | MBTs | fair before -> after | shutouts before -> after | strength range before -> after')
for t in sorted(B['tiers'], key=int):
    b, a = B['tiers'][t], A['tiers'][t]
    print(f"{t} | {b['n']} | {b['fair']}/{b['pairs']} -> {a['fair']}/{a['pairs']} | {b['shutouts']} -> {a['shutouts']} | "
          f"{b['min']}-{b['max']} -> {a['min']}-{a['max']}")
print('\nrows:')
for r in sorted(B['rows']):
    print(f"{r}@{B['rows'][r]['tier']}: {B['rows'][r]['fair']}/{B['rows'][r]['of']} mean {B['rows'][r]['mean']} -> "
          f"{A['rows'][r]['fair']}/{A['rows'][r]['of']} mean {A['rows'][r]['mean']}")
print('\nids whose strength moved more than 0.1:')
moved = 0
for t in sorted(B['tiers'], key=int):
    for i, s in B['tiers'][t]['strength'].items():
        s2 = A['tiers'][t]['strength'][i]
        if abs(s2 - s) > 0.1:
            moved += 1
            print(f"  tier {t} {i}{' (changed)' if i in ids else ''}: {s} -> {s2}")
print(f'{moved} id(s)')
