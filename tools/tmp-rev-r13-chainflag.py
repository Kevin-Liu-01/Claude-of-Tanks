# TEMP r13 critic — re-derive the closed flag on the hero-rr 0.742 m2 void
# (HERO-FRAME BORDER-CLIP law, r12 bank). Reads the tmp-e3-maskprobe dump,
# finds enclosed background regions NOT connected to the outer border flood,
# then reports for each region: area, bbox, and whether its contour chain
# touches the mask frame border (open chain => border-clip artifact).
import struct, zlib, sys

PATH = "/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/e3mask-herorr.png"

def read_png(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos = 8; w = h = None; idat = b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos+4])[0]
        typ = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+ln]
        if typ == b"IHDR":
            w, h, bd, ct = struct.unpack(">IIBB", chunk[:10])
            assert bd == 8 and ct in (2, 6), (bd, ct)
            nch = 3 if ct == 2 else 4
        elif typ == b"IDAT":
            idat += chunk
        pos += 12 + ln
    raw = zlib.decompress(idat)
    stride = w * nch
    img = bytearray(w * h * nch)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        if f == 1:
            for i in range(nch, stride): line[i] = (line[i] + line[i-nch]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-nch] if i >= nch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-nch] if i >= nch else 0
                c = prev[i-nch] if i >= nch else 0
                b = prev[i]
                pp = a + b - c
                pa, pb, pc = abs(pp-a), abs(pp-b), abs(pp-c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        img[y*stride:(y+1)*stride] = line
        prev = line
    return w, h, nch, img

w, h, nch, img = read_png(PATH)
print(f"mask {w}x{h} nch{nch}")

# body = non-background. maskprobe renders silhouette (body bright/colored vs dark bg).
# Sample corners for bg color.
def px(x, y):
    o = (y*w + x) * nch
    return img[o], img[o+1], img[o+2]

corners = [px(0,0), px(w-1,0), px(0,h-1), px(w-1,h-1)]
bg = corners[0]
print("corners:", corners)

def is_bg(x, y):
    r, g, b = px(x, y)
    return abs(r-bg[0]) <= 30 and abs(g-bg[1]) <= 30 and abs(b-bg[2]) <= 30

# flood from border: outside-bg
lab = bytearray(w*h)  # 0 unknown, 1 outside-bg, 2 body
stack = []
for x in range(w):
    for y in (0, h-1):
        if is_bg(x, y) and not lab[y*w+x]:
            lab[y*w+x] = 1; stack.append((x, y))
for y in range(h):
    for x in (0, w-1):
        if is_bg(x, y) and not lab[y*w+x]:
            lab[y*w+x] = 1; stack.append((x, y))
while stack:
    x, y = stack.pop()
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nx, ny = x+dx, y+dy
        if 0 <= nx < w and 0 <= ny < h and not lab[ny*w+nx] and is_bg(nx, ny):
            lab[ny*w+nx] = 1; stack.append((nx, ny))

# enclosed bg = bg pixels not labeled outside
regions = []
seen = bytearray(w*h)
for y in range(h):
    for x in range(w):
        i = y*w+x
        if is_bg(x, y) and not lab[i] and not seen[i]:
            comp = [(x, y)]; seen[i] = 1; st = [(x, y)]
            while st:
                cx, cy = st.pop()
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = cx+dx, cy+dy
                    j = ny*w+nx
                    if 0 <= nx < w and 0 <= ny < h and not seen[j] and is_bg(nx, ny) and not lab[j]:
                        seen[j] = 1; st.append((nx, ny)); comp.append((nx, ny))
            regions.append(comp)

# camera meta from the probe run (printed by the mjs)
half = 4.886989116359325
mpp = (2*half)/max(w, h)
regions.sort(key=len, reverse=True)
print(f"mPerPx {mpp:.6f}; enclosed regions: {len(regions)}")
for comp in regions[:8]:
    xs = [p[0] for p in comp]; ys = [p[1] for p in comp]
    area = len(comp)*mpp*mpp
    bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
    border = bx0 == 0 or by0 == 0 or bx1 == w-1 or by1 == h-1
    cx = sum(xs)/len(xs); cy = sum(ys)/len(ys)
    print(f"  region px{len(comp)} area {area:.3f}m2 bbox x{bx0}..{bx1} y{by0}..{by1} centroid ({cx:.0f},{cy:.0f}) TOUCHES-BORDER={border}")

# ALSO: does the BODY mask itself exit the frame (the border-clip precondition)?
body_on_border = 0
edge_cols = []
for y in range(h):
    for x in (0, w-1):
        if not is_bg(x, y):
            body_on_border += 1
            edge_cols.append((x, y))
for x in range(w):
    for y in (0, h-1):
        if not is_bg(x, y):
            body_on_border += 1
print(f"body pixels ON frame border: {body_on_border}")
if edge_cols:
    ys = [c[1] for c in edge_cols if c[0] == w-1]
    if ys: print(f"  right-edge body rows y {min(ys)}..{max(ys)}")
    ys0 = [c[1] for c in edge_cols if c[0] == 0]
    if ys0: print(f"  left-edge body rows y {min(ys0)}..{max(ys0)}")
