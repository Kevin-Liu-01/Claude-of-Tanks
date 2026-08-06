# TEMP (leopard §B5 DE-FUSION round): trace analysis over shots/leo-defuse/census.json
# Prints per-z-column comparisons:
#  1. refHull vs refHullNoVlo   -> the chassis_vlo pollution (what the repair removes)
#  2. refWhole vs refWholeNoVlo -> whole-row price of the repair (rest silhouette delta)
#  3. procHull vs refHullNoVlo  -> the proc hull re-lay job (post-repair targets)
#  4. procTurret vs refTurret   -> current turret parity (should be close, gate 92)
import json

d = json.load(open('shots/leo-defuse/census.json'))
C = d['partC']
T = C['traces']

def as_map(rows, step=0.05):
    # rows: [z, topY, botY]; bucket to step grid, keep max top / min bot
    m = {}
    for z, top, bot in rows:
        k = round(z / step)
        if k not in m or top > m[k][0]:
            m[k] = (top, bot if k not in m else min(bot, m[k][1]))
        else:
            t, b = m[k]
            m[k] = (t, min(b, bot))
    return m

def cmp(a_name, b_name, what='top', thresh=0.02):
    A, B = as_map(T[a_name]), as_map(T[b_name])
    print(f'\n== {a_name} vs {b_name} ({what}, |d|>{thresh}) ==')
    ks = sorted(set(A) | set(B))
    run = []
    def flush():
        if not run: return
        z0, z1 = run[0][0], run[-1][0]
        ds = [r[1] for r in run]
        av = [r[2] for r in run]
        bv = [r[3] for r in run]
        print(f'  z {z0:+.2f}..{z1:+.2f}  d {min(ds):+.3f}..{max(ds):+.3f}  {a_name} {min(av):.3f}..{max(av):.3f}  {b_name} {min(bv):.3f}..{max(bv):.3f}  ({len(run)} cols)')
        run.clear()
    for k in ks:
        z = k * 0.05
        if k in A and k in B:
            ia = 0 if what == 'top' else 1
            da = A[k][ia] - B[k][ia]
            if abs(da) > thresh:
                run.append((z, da, A[k][ia], B[k][ia]))
            else:
                flush()
        else:
            flush()
            only = a_name if k in A else b_name
            v = (A.get(k) or B.get(k))
            print(f'  z {z:+.2f}  ONLY-{only}  y {v[1]:.3f}..{v[0]:.3f}')
    flush()

cmp('refHull', 'refHullNoVlo', 'top')
cmp('refWhole', 'refWholeNoVlo', 'top')
cmp('procHull', 'refHullNoVlo', 'top')
cmp('procTurret', 'refTurret', 'top')
cmp('procTurret', 'refTurret', 'bot')
cmp('procWhole', 'refWhole', 'top', 0.04)

# print the refHullNoVlo top line coarsely (the re-lay target)
print('\n== refHullNoVlo hull top line (0.25 m bins) ==')
m = as_map(T['refHullNoVlo'], 0.25)
for k in sorted(m, reverse=True):
    print(f'  z {k*0.25:+.2f}  top {m[k][0]:.3f}  bot {m[k][1]:.3f}')
print('\n== refTurret top/bottom (0.25 m bins) ==')
m = as_map(T['refTurret'], 0.25)
for k in sorted(m, reverse=True):
    print(f'  z {k*0.25:+.2f}  top {m[k][0]:.3f}  bot {m[k][1]:.3f}')
