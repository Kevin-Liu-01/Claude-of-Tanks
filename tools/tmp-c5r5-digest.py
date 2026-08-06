#!/usr/bin/env python3
# TEMP r5 critic: compact per-view digest of visual-evaluator report.json
import json

r = json.load(open('shots/visual-eval-chieftain5/report.json'))
for name, v in r['views'].items():
    e = v['edges']
    matched = e.get('matched', [])
    flagged = [m for m in matched if m.get('flagged')]
    print(f"== {name} ({v.get('kind')}) ==")
    prof = v.get('profile')
    if prof:
        print(f"  profile p95 dTop {prof.get('p95Top')} dBot {prof.get('p95Bot')}")
        wc = prof.get('worstColumns') or prof.get('worst') or []
        for w in (wc[:3] if isinstance(wc, list) else []):
            print(f"   worstcol {json.dumps(w)}")
    for m in sorted(flagged, key=lambda x: -abs(x['dAngleDeg'])):
        print(f"  FLAG d{m['dAngleDeg']:+.1f}deg (noise {m['noiseDeg']}) len {m['lenM']}m ref {m['refAngleDeg']:.1f} proc {m['procAngleDeg']:.1f} @ {m['midWorld']} {m['desc']}")
    for cat in ('refOnly', 'procOnly'):
        for m in (e.get(cat) or [])[:6]:
            ln = m.get('lenM', 0)
            if ln and ln >= 0.4:
                print(f"  {cat}: {m.get('angleDeg', m.get('refAngleDeg', '?'))}deg len {ln}m @ {m.get('midWorld')} {m.get('desc', '')}")
    arcs = v.get('arcs') or {}
    for cat in ('ref', 'proc', 'paired'):
        aa = arcs.get(cat) or []
        for a in aa:
            print(f"  arc[{cat}]: r {a.get('radiusM')} span {a.get('spanDeg')} facets {a.get('facetCount', a.get('facets'))} @ {a.get('centerWorld', a.get('midWorld'))} {a.get('desc', '')} {a.get('note', '')}")
    voids = v.get('voids') or v.get('enclosedVoids') or []
    for vd in voids:
        print(f"  void: {json.dumps(vd)}")
    print()
