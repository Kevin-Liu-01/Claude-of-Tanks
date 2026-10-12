import re,sys
# resolve.py <file> <mode per hunk: ours|theirs|union|union-theirs-first|@<pyfile>:<name>> ...
f=sys.argv[1]; modes=sys.argv[2:]
src=open(f).read()
pat=re.compile(r'<<<<<<< [^\n]*\n(.*?)(?:\|\|\|\|\|\|\| [^\n]*\n.*?)?=======\n(.*?)>>>>>>> [^\n]*\n',re.S)
hunks=list(pat.finditer(src))
assert len(hunks)==len(modes),(len(hunks),len(modes))
out=[];pos=0
for m,mode in zip(hunks,modes):
    ours,theirs=m.group(1),m.group(2)
    if mode=='ours': r=ours
    elif mode=='theirs': r=theirs
    elif mode=='union': r=ours+theirs
    elif mode=='union-theirs-first': r=theirs+ours
    elif mode.startswith('@'):
        r=open(mode[1:]).read()
    else: raise SystemExit('bad mode '+mode)
    out.append(src[pos:m.start()]); out.append(r); pos=m.end()
out.append(src[pos:])
open(f,'w').write(''.join(out))
print(f, len(hunks), 'resolved')
