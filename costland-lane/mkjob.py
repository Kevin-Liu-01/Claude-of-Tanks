#!/usr/bin/env python3
"""mkjob.py <kind> <id> [--stamp=N] [--arrived=N] [--submit] : write (and submit) a costland fifo2 job.
kinds: tgc (contact toggles), tgb (borders toggles), cc<k> (contact v3 cycle k), bv<k> (borders verdant v3 cycle k),
bm<k> (borders monsoon control cycle k)"""
import json, sys, subprocess, re
SP='/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad'
C=f'{SP}/costland'
kind=sys.argv[1]; args=dict(a[2:].split('=',1) if '=' in a else (a[2:],'1') for a in sys.argv[2:] if a.startswith('--'))
rA,rB,rC=f'{C}/rA',f'{C}/rB',f'{C}/rC'
def fbp(tool, roots, labels, pattern, maps, views, out, tag, frames=120, toggle=None, budget=16.0):
    cmd=['node',f'tools/{tool}',f'--roots={",".join(roots)}',f'--labels={labels}',f'--pattern={pattern}',f'--maps={maps}',
         f'--views={views}','--viewports=1600x900',f'--frames={frames}','--hide-bots',f'--budget-min={budget}','--port={PORT}',
         f'--out={out}',f'--tag={tag}']
    if toggle: cmd.append(f'--toggle={toggle}')
    return cmd
job={'lane':'costland','cwd':rA,'kind':'timing','liveLighting':'n/a','sceneGuard':'scene-pass','priority':True}
m=re.match(r'(tgc|tgb|ilc|ilb|cc|bv|bm|bc|bf|cr|cv|nv|nc|nf|ns|dr|dv|dw)(\d*)$',kind)
k=m.group(1); n=m.group(2)
if k=='tgc':
    job.update(id=f'tgc{n}',budgetMin=12,needs=[f'{rA}/dist',f'{rC}/dist'],env={'COT_LAB_TOGGLE_ROUNDS':'2'},
      cmd=fbp('frame-budget-probe-lab.mjs',[rA,rC],'main,contact','ABBA','desert','chase',f'{C}/cost/tg',f'tgc{n}',frames=300,toggle='vg-ao+lab-null',budget=11.5),
      log=f'{C}/cost/tg/tgc{n}.log')
elif k=='tgb':
    job.update(id=f'tgb{n}',budgetMin=15,needs=[f'{rA}/dist',f'{rB}/dist'],env={'COT_LAB_TOGGLE_ROUNDS':'1'},
      cmd=fbp('frame-budget-probe-lab.mjs',[rB,rA],'land,main','AB','verdant','chase,edge-n-low',f'{C}/cost/tg',f'tgb{n}',frames=240,
              toggle='face-trees+sward-edge+far-earth+horizon-ring+lab-null',budget=14.5),
      log=f'{C}/cost/tg/tgb{n}.log')
elif k=='ilc':
    job.update(id=f'ilc{n}',budgetMin=13,needs=[f'{rA}/dist',f'{rC}/dist'],
      cmd=fbp('frame-budget-probe-lab.mjs',[rA,rC],'main,contact','ABBA','desert','chase',f'{C}/cost/il',f'ilc{n}',frames=1600,budget=12.5)+['--interleave=vg-ao+lab-null'],
      log=f'{C}/cost/il/ilc{n}.log')
elif k=='ilb':
    job.update(id=f'ilb{n}',budgetMin=17,needs=[f'{rA}/dist',f'{rB}/dist'],
      cmd=fbp('frame-budget-probe-lab.mjs',[rB,rA],'land,main','AB','verdant','chase,edge-n-low',f'{C}/cost/il',f'ilb{n}',frames=960,budget=16.5)+['--interleave=face-trees+sward-edge+horizon-ring+far-earth'],
      log=f'{C}/cost/il/ilb{n}.log')
elif k=='cc':
    job.update(id=f'cc{n}',budgetMin=12,needs=[f'{rA}/dist',f'{rC}/dist'],
      cmd=fbp('frame-budget-probe.mjs',[rA,rC,rA],'head,cand,headc','ABCCBA','desert','chase',f'{C}/cost/v3',f'cc{n}',budget=11.5),
      check=['python3',f'{SP}/fifo2/bin/v3check.py','check',f'--fbp={C}/cost/v3:desert:cc'],log=f'{C}/cost/v3/cc{n}.log')
elif k=='bv':
    job.update(id=f'bv{n}',budgetMin=17,needs=[f'{rA}/dist',f'{rB}/dist'],
      cmd=fbp('frame-budget-probe.mjs',[rA,rB,rA],'head,cand,headc','ABCCBA','verdant','chase,edge-n-low',f'{C}/cost/v3',f'bv{n}',budget=16.0),
      check=['python3',f'{SP}/fifo2/bin/v3check.py','check',f'--fbp={C}/cost/v3:verdant:bv','--scene-delta-ok=5,8'],log=f'{C}/cost/v3/bv{n}.log')
elif k in ('nv','nc','nf','ns'):
    # borders r7 on main 62b (2026-10-10): A = rM (main), B = rB (main + borders, Verdant/Saltwind/coastal/fjord opted in)
    rM=f'{C}/rM'
    mp, view = {'nv':('verdant','edge-n-low'),'nc':('coastal','edge-e-low'),'nf':('fjord','edge-e-low'),'ns':('saltwind','edge-w-low')}[k]
    job.update(id=f'{k}{n}',cwd=rM,budgetMin=17,needs=[f'{rM}/dist',f'{rB}/dist'],
      cmd=fbp('frame-budget-probe.mjs',[rM,rB,rM],'head,cand,headc','ABCCBA',mp,f'chase,{view}',f'{C}/cost/v3',f'{k}{n}',budget=16.0),
      check=['python3',f'{SP}/fifo2/bin/v3check.py','check',f'--fbp={C}/cost/v3:{mp}:{k}','--scene-delta-ok=5,8'],log=f'{C}/cost/v3/{k}{n}.log')
elif k in ('cr','cv'):
    rM=f'{C}/rM'
    mp={'cr':'desert','cv':'verdant'}[k]
    job.update(id=f'{k}{n}',cwd=rM,budgetMin=12,needs=[f'{rM}/dist',f'{rC}/dist'],
      cmd=fbp('frame-budget-probe.mjs',[rM,rC,rM],'head,cand,headc','ABCCBA',mp,'chase',f'{C}/cost/v3',f'{k}{n}',budget=11.5),
      check=['python3',f'{SP}/fifo2/bin/v3check.py','check',f'--fbp={C}/cost/v3:{mp}:{k}'],log=f'{C}/cost/v3/{k}{n}.log')
elif k in ('dr','dv','dw'):
    # contact round 4 (2026-10-10): A = rE (round 3 + main c996f293c, the round's base), B = rD (round 4);
    # 2026-10-11 (coordinator): B = rG (round 4 + round 5), one v3 for both rounds
    rE, rD = f'{C}/rE', f'{C}/rG'
    mp={'dr':'desert','dv':'verdant','dw':'winter'}[k]
    job.update(id=f'{k}{n}',cwd=rE,budgetMin=12,needs=[f'{rE}/dist',f'{rD}/dist'],
      cmd=fbp('frame-budget-probe.mjs',[rE,rD,rE],'head,cand,headc','ABCCBA',mp,'chase',f'{C}/cost/v3',f'{k}{n}',budget=11.5),
      check=['python3',f'{SP}/fifo2/bin/v3check.py','check',f'--fbp={C}/cost/v3:{mp}:{k}'],log=f'{C}/cost/v3/{k}{n}.log')
elif k in ('bc','bf'):
    mp={'bc':'coastal','bf':'fjord'}[k]
    job.update(id=f'{k}{n}',budgetMin=17,needs=[f'{rA}/dist',f'{rB}/dist'],
      cmd=fbp('frame-budget-probe.mjs',[rA,rB,rA],'head,cand,headc','ABCCBA',mp,'chase,edge-e-low',f'{C}/cost/v3',f'{k}{n}',budget=16.0),
      check=['python3',f'{SP}/fifo2/bin/v3check.py','check',f'--fbp={C}/cost/v3:{mp}:{k}','--scene-delta-ok=5,8'],log=f'{C}/cost/v3/{k}{n}.log')
elif k=='bm':
    job.update(id=f'bm{n}',budgetMin=12,needs=[f'{rA}/dist',f'{rB}/dist'],
      cmd=fbp('frame-budget-probe.mjs',[rA,rB,rA],'head,cand,headc','ABCCBA','monsoon','chase',f'{C}/cost/v3',f'bm{n}',budget=11.5),
      check=['python3',f'{SP}/fifo2/bin/v3check.py','check',f'--fbp={C}/cost/v3:monsoon:bm','--scene-delta-ok=5,8'],log=f'{C}/cost/v3/bm{n}.log')
if 'stamp' in args: job['queueStamp']=int(args['stamp'])
if 'arrived' in args: job['queueArrived']=int(args['arrived'])
if 'nopri' in args: job['priority']=False
p=f'{C}/jobs/costland-{job["id"]}.json'
json.dump(job,open(p,'w'),indent=1)
print(p)
if 'submit' in args:
    r=subprocess.run(['node',f'{SP}/fifo2/bin/submit.mjs',p],capture_output=True,text=True); print(r.stdout.strip(), r.stderr.strip()[:500])
