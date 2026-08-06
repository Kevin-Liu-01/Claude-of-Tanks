#!/usr/bin/env python3
# TEMP (b1b3 re-cert critic): §H.4 four-up — stack the PROCEDURAL halves of
# one view across the four merkava graduates into a labeled 2x2 board.
# usage: tmp-b1b3recert-fourup.py <view> [outname]
import sys, os
from PIL import Image, ImageDraw

SCR = os.environ.get('B1B3_OUT', '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad')
view = sys.argv[1]
ids = ['merkava1b', 'merkava3b', 'merkava3c', 'merkava3d']
tiles = []
for tid in ids:
    im = Image.open(f'shots/critic-{tid}/{view}.png')
    w, h = im.size
    tiles.append(im.crop((w // 2, 0, w, h)))
tw, th = tiles[0].size
board = Image.new('RGB', (tw * 2, th * 2), (21, 27, 32))
dr = ImageDraw.Draw(board)
for i, (tid, t) in enumerate(zip(ids, tiles)):
    x, y = (i % 2) * tw, (i // 2) * th
    board.paste(t, (x, y))
    dr.rectangle([x + 8, y + 30, x + 150, y + 50], fill=(21, 27, 32))
    dr.text((x + 12, y + 34), tid, fill=(231, 237, 240))
out = f'{SCR}/{sys.argv[2] if len(sys.argv) > 2 else f"fourup-{view}"}.png'
board.save(out)
print(out)
