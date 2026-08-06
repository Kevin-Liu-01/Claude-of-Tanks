# TEMP (russia §B5 t72b3m graduate-change round): 14-view rest pixel-diff.
# For each view: byte-compare; when different, report differing-pixel count
# and bounding box (image px) so each changed view is attributed to a
# §B4-touched zone. Usage:
#   python3 tools/tmp-b5-t72b3m-diff.py <beforeDir> <afterDir>
import sys, os, hashlib
from PIL import Image, ImageChops

a_dir, b_dir = sys.argv[1], sys.argv[2]
views = sorted(f for f in os.listdir(a_dir) if f.endswith('.png'))
same = []
diff = []
for v in views:
    pa, pb = os.path.join(a_dir, v), os.path.join(b_dir, v)
    if not os.path.exists(pb):
        print(f"{v}: MISSING in after")
        continue
    ba, bb = open(pa, 'rb').read(), open(pb, 'rb').read()
    if hashlib.sha256(ba).hexdigest() == hashlib.sha256(bb).hexdigest():
        same.append(v)
        continue
    ia, ib = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
    d = ImageChops.difference(ia, ib)
    bbox = d.getbbox()
    n = sum(1 for px in d.getdata() if px != (0, 0, 0))
    diff.append((v, n, bbox))
print(f"byte-identical: {len(same)}/{len(views)}")
for v in same:
    print(f"  = {v}")
for v, n, bbox in diff:
    print(f"  != {v}: {n} px differ, bbox {bbox}")
