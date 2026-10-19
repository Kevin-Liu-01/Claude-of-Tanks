#!/usr/bin/env python3
"""Round 3 deliverables from the cinema stills (remake/renders-v/<id>/stills/*.png): each 1440p PNG copied to
remake/deliver-v/<id>.png with a 1920 px webp beside it, and a contact sheet of all of them (versus-sheet.jpg), plus
the remakes' old-vs-new sheet (each original left, its round-3 remake right; no labels). Everything it reads and
writes stays in the git-ignored shots/media-r5 (remake/ there). The public stills are made by versus-media.mjs from
the delivered 1440p masters.
  python3 tools/media-r5/versus/deliver-v.py"""
import glob, os, shutil
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, '..', '..', '..', 'shots', 'media-r5')
REMAKE = os.path.join(SHOTS, 'remake')
OLD = os.path.join(SHOTS, 'tmp', 'compare', 'old')
renders, deliver = os.path.join(REMAKE, 'renders-v'), os.path.join(REMAKE, 'deliver-v')
os.makedirs(deliver, exist_ok=True)
done = []
# the round-5 remakes (2026-10-15: "zoom into those a lil more ... use the actual t-90m") stand in for their round-3
# scenes on the contact sheet once filmed; the round-3 files stay in deliver-v and old-vs-new.jpg keeps their pairs
# (round 6) generally: each scene group (f6, f7, vs01..vs10: the id's first word) shows its newest filmed round, an id's
# round being its -rN suffix (unsuffixed: f6/f7 round 3, the versus round 4)
import re
def group_round(sid):
    m = re.search(r'-r(\d+)$', sid)
    return sid.split('-')[0], int(m.group(1)) if m else (3 if sid.startswith(('f6', 'f7')) else 4)
filmed = [os.path.basename(d) for d in glob.glob(os.path.join(renders, '*')) if glob.glob(os.path.join(d, 'stills', '*.png'))]
newest = {}
for sid in filmed:
    g, r = group_round(sid)
    if g not in newest or r > group_round(newest[g])[1]: newest[g] = sid
for d in sorted(glob.glob(os.path.join(renders, '*'))):
    sid = os.path.basename(d)
    if sid in filmed and newest[group_round(sid)[0]] != sid:
        print(f'{sid}: superseded by {newest[group_round(sid)[0]]}'); continue
    stills = sorted(glob.glob(os.path.join(d, 'stills', '*.png')))
    if not stills:
        print(f'{sid}: no still'); continue
    png = os.path.join(deliver, f'{sid}.png'); shutil.copyfile(stills[-1], png)
    im = Image.open(png).convert('RGB')
    im.resize((1920, round(im.height * 1920 / im.width)), Image.LANCZOS).save(os.path.join(deliver, f'{sid}-1920.webp'), 'WEBP', quality=90, method=6)
    print(f'{sid}: {im.width}x{im.height} -> deliver-v/{sid}.png + {sid}-1920.webp')
    done.append((sid, im))
if done:
    cols, tw = 3, 800
    th, lab = tw * 9 // 16, 26
    try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 17)
    except Exception: font = ImageFont.load_default()
    rows = (len(done) + cols - 1) // cols
    import json
    lf = os.path.join(HERE, 'versus-labels.json')
    names = json.load(open(lf))['scenes'] if os.path.exists(lf) else {}
    sheet = Image.new('RGB', (cols * tw, rows * (th + lab)), (12, 14, 17)); dr = ImageDraw.Draw(sheet)
    for i, (sid, im) in enumerate(done):
        x, y = (i % cols) * tw, (i // cols) * (th + lab)
        sheet.paste(im.resize((tw - 6, th), Image.LANCZOS), (x, y)); dr.text((x + 8, y + th + 4), names.get(sid, sid), fill=(255, 210, 122), font=font)
    sheet.save(os.path.join(REMAKE, 'versus-sheet.jpg'), quality=88); print('versus-sheet.jpg', sheet.size)
    pairs = [('f7-t90sm-column', 'f7_studio_t90_column_fire.webp'), ('f6-leo2a6-steinburg', 'f6_studio_strv_steinburg_duel.webp')]
    rows2 = [(Image.open(os.path.join(OLD, old)).convert('RGB'), dict(done)[sid]) for sid, old in pairs if sid in dict(done)]
    if rows2:
        H, gap = 720, 12
        scaled = [[t.resize((round(t.width * H / t.height), H), Image.LANCZOS) for t in row] for row in rows2]
        W = max(sum(t.width for t in row) + gap for row in scaled)
        s2 = Image.new('RGB', (W, len(scaled) * H + (len(scaled) - 1) * gap), (16, 16, 16))
        for i, row in enumerate(scaled):
            x = 0
            for t in row: s2.paste(t, (x, i * (H + gap))); x += t.width + gap
        s2.save(os.path.join(REMAKE, 'old-vs-new.jpg'), quality=88); print('old-vs-new.jpg', s2.size)
