# TEMP (isu152 r3 independent critic): diagnostic crops + sky/luma rects on the
# OFFICIAL pairs in shots/critic-isu152/. Crops are for diagnosis only — the
# verdict is scored on the untouched pair files. Deleted after the round.
import sys, json
from PIL import Image

PAIR_DIR = "shots/critic-isu152"
OUT_DIR = "/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crops"
import os
os.makedirs(OUT_DIR, exist_ok=True)

BG = (0x15, 0x1B, 0x20)

def is_bg(px, tol=13):
    return abs(px[0]-BG[0]) <= tol and abs(px[1]-BG[1]) <= tol and abs(px[2]-BG[2]) <= tol

def luma(px):
    return 0.299*px[0] + 0.587*px[1] + 0.114*px[2]

def rect_stats(img, x0, y0, x1, y1, tol=13):
    """ITU-601 luma stats over NON-BG pixels + sky share, over [x0,x1)x[y0,y1)."""
    pxs = img.load()
    lum, sky, tot = [], 0, 0
    rs, gs, bs = 0.0, 0.0, 0.0
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = pxs[x, y]
            tot += 1
            if is_bg(p, tol):
                sky += 1
            else:
                lum.append(luma(p))
                rs += p[0]; gs += p[1]; bs += p[2]
    lum.sort()
    n = len(lum)
    def q(f):
        if n == 0: return None
        return round(lum[min(n-1, int(f*n))], 1)
    out = {
        "rect": [x0, y0, x1, y1],
        "n_px": tot, "sky_pct": round(100.0*sky/tot, 1),
        "p05": q(0.05), "p25": q(0.25), "p50": q(0.50), "p75": q(0.75), "p95": q(0.95),
    }
    if n:
        out["iqr"] = round(lum[int(0.75*n)] - lum[int(0.25*n)], 1)
        out["BG_ratio"] = round(bs/gs, 3) if gs else None
        out["Gex"] = round(gs/ n - (rs/n + bs/n)/2, 1)  # green excess vs mean(R,B)
    return out

def crop(img_name, x0, y0, x1, y1, scale, out_name):
    im = Image.open(f"{PAIR_DIR}/{img_name}").convert("RGB")
    c = im.crop((x0, y0, x1, y1))
    if scale != 1:
        c = c.resize((int(c.width*scale), int(c.height*scale)), Image.LANCZOS)
    c.save(f"{OUT_DIR}/{out_name}")
    print(f"saved {out_name} {c.size}")

def bbox_nonbg(img_name, pane):  # pane 0 = ref, 1 = proc
    im = Image.open(f"{PAIR_DIR}/{img_name}").convert("RGB")
    x_off = 640*pane
    pxs = im.load()
    minx, miny, maxx, maxy = 10**9, 10**9, -1, -1
    for y in range(40, 640):  # skip label row
        for x in range(x_off, x_off+640):
            if not is_bg(pxs[x, y]):
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    print(f"{img_name} pane{pane} bbox x[{minx},{maxx}] y[{miny},{maxy}] w={maxx-minx+1} h={maxy-miny+1}")
    return minx, miny, maxx, maxy

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "crop":
        # crop <img> <x0> <y0> <x1> <y1> <scale> <out>
        crop(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]),
             int(sys.argv[6]), float(sys.argv[7]), sys.argv[8])
    elif cmd == "rect":
        im = Image.open(f"{PAIR_DIR}/{sys.argv[2]}").convert("RGB")
        st = rect_stats(im, int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]))
        print(json.dumps(st))
    elif cmd == "bbox":
        bbox_nonbg(sys.argv[2], int(sys.argv[3]))
