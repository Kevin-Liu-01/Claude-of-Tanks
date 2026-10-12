import json,sys,glob,os,statistics as st
# usage: passes.py <dir> <tagprefix> <map>
d,tag,mp=sys.argv[1:4]
files=sorted(glob.glob(f'{d}/{tag}*-{mp}-s*-*.json'))
rows={}
for f in files:
    j=json.load(open(f))
    for s in j['samples']:
        pp=s['summary'].get('prefixPasses') or {}
        key=(os.path.basename(f).split('-')[0], s['view'], j['label'])
        r={k:(v.get('p25') if isinstance(v,dict) else v) for k,v in pp.items()}
        r['_frame_p25']=s['summary']['gpuFrame']['p25']
        r['_pfx_p25']=s['prefixSummary']['gpuFrame']['p25']
        rows.setdefault(key,[]).append(r)
        if len(sys.argv)>4: print(os.path.basename(f), s['view'], json.dumps(pp)[:600])
passes=None
for key in sorted(rows):
    rs=rows[key]
    if passes is None: passes=list(rs[0].keys())
    print(key, ' '.join(f"{p[:6]}={st.mean([r.get(p) or 0 for r in rs]):.2f}" for p in passes))
