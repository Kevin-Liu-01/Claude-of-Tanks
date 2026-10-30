# Lane tool (envelope-honesty-264): put the parts drawn by given BASE builder lines back in their base bucket.
# Each site is <file>:<line> on the base (a77e60e26b); the lane's line is found by content (the base line with only its
# bucket word changed) and replaced by the base line, plus an end-of-line note why it stays. Multi-line calls (MUDGUARDS.add)
# are matched on the first `bucket:` line within the next 12 base lines.
#   python3 revert-sites.py <reason> <file:line> [...] [--write]
import re, subprocess, sys, os
lane = os.path.expanduser('~/cot-lanes/envelope-honesty-264')
reason = sys.argv[1]; sites = [a for a in sys.argv[2:] if not a.startswith('--')]; write = '--write' in sys.argv
BUCKETS = r"(hull|turret|hullEquipment|turretEquipment|hullExternalArmor|turretExternalArmor|hullFixedPaintedBodywork)"
def rel(f): return f'src/vehicles/profiles/{f}' if os.path.exists(f'{lane}/src/vehicles/profiles/{f}') else f'src/vehicles/{f}'
def base(f): return subprocess.run(['git', '-C', lane, 'show', f'a77e60e26b:{rel(f)}'], capture_output=True, text=True, check=True).stdout.split('\n')
cur = {}
for s in sites:
    f, l = s.rsplit(':', 1); l = int(l)
    B = base(f)
    if f not in cur: cur[f] = open(f'{lane}/{rel(f)}').read().split('\n')
    C = cur[f]
    idx = l - 1
    if 'MUDGUARDS.add(' in B[idx] or not re.search(r"'(hull|turret)'", B[idx]):
        idx = next((k for k in range(l - 1, min(len(B), l + 12)) if re.search(r"bucket:\s*'(hull|turret)'|'(hull|turret)'", B[k])), None)
        if idx is None: print(f'{s}: no bucket on the base line or the next 12: {B[l-1].strip()[:90]}'); continue
    bl = B[idx]
    pat = re.escape(bl)
    pat = re.sub(r"'(hull|turret)'", lambda m: "'" + BUCKETS + "'", pat, count=1)
    alt = re.escape(bl).replace(r"P\.add\('hull',", r"P\.add(?:External|Equipment)?\('hull',").replace(r"P\.add\('turret',", r"P\.add(?:External|Equipment)?\('turret',")
    # P.add('hull', x) may have become P.addExternalArmor('hull', x) / P.addEquipment('hull', x)
    alt = re.escape(bl).replace(r"P\.add\(", r"P\.add(?:ExternalArmor|Equipment)?\(")
    hits = [k for k, line in enumerate(C) if (re.fullmatch(pat, line.split(' // 264:')[0]) or re.fullmatch(alt, line.split(' // 264:')[0])) and line != bl]
    same = [k for k, line in enumerate(C) if line.split(' // 264:')[0] == bl]
    if len(hits) == 1:
        k = hits[0]; print(f'{s} -> line {k+1}:\n   was {C[k].strip()[:140]}\n   now {bl.strip()[:140]}')
        C[k] = bl
    elif same: print(f'{s}: already as base (line {same[0]+1})')
    else: print(f'{s}: {len(hits)} candidate lines for {bl.strip()[:100]}')
if write:
    for f, C in cur.items(): open(f'{lane}/{rel(f)}', 'w').write('\n'.join(C))
