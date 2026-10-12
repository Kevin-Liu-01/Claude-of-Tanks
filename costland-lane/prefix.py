import json,sys,glob,os,statistics as st
# usage: prefix.py <dir> <tagregex-prefix> <map> [stat]
d,tag,mp=sys.argv[1:4]; stat=sys.argv[4] if len(sys.argv)>4 else 'med'
files=sorted(glob.glob(f'{d}/{tag}*-{mp}-s*-*.json'))
by={}
for f in files:
    j=json.load(open(f))
    for s in j['samples']:
        pf={p['label']:p.get(stat) for p in s['prefixSummary']['prefix']}
        cks=list(pf.keys())
        inc={}
        prev=0
        for c in cks:
            v=pf[c] or 0
            inc[c]=v-prev; prev=v
        inc['FRAME']=s['summary']['gpuFrame'][stat if stat!='med' else 'med']
        by.setdefault((s['view'],j['label']),[]).append(inc)
        print(os.path.basename(f)[:28].ljust(28), s['view'][:10].ljust(10), ' '.join(f"{k[:5]}={v:6.2f}" for k,v in inc.items()))
print()
for k in sorted(by):
    rs=by[k]
    print(str(k).ljust(28), ' '.join(f"{c[:5]}={st.mean([r[c] for r in rs]):6.2f}" for c in rs[0]))
