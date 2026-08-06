# TEMP (gun-run re-cert critic): zoom-crop strips for the 10 changed views
# per tank. For each view: [BASELINE(boxy) | FRESH(collar) | REF-print]
# side-by-side at 3x from the diff bbox (+pad), plus a lone 4x fresh crop.
# Output: scratchpad crops dir (session-local diagnosis; verdicts are reads
# of the official shots/critic-* renders these are cut from).
import sys
from PIL import Image

BBOX = {
    'merkava3b': {
        'close-front': (866, 947, 315, 354), 'view-front': (937, 982, 290, 337),
        'view-frontleft': (1007, 1060, 301, 323), 'view-frontright': (859, 912, 301, 323),
        'view-left': (1036, 1092, 298, 319), 'view-right': (827, 883, 298, 319),
        'view-top': (949, 970, 409, 451), 'hero-frontleft': (1019, 1090, 316, 357),
        'hero-toptilt': (866, 901, 206, 257), 'close-roof': (760, 875, 407, 468),
        'view-rearleft': (1031, 1060, 293, 315), 'view-rearright': (859, 888, 293, 313),
        'hero-rearright': (851, 891, 266, 302),
    },
    'merkava3c': {
        'close-front': (866, 947, 333, 372), 'view-front': (939, 981, 311, 355),
        'view-frontleft': (1007, 1060, 311, 333), 'view-frontright': (859, 912, 311, 333),
        'view-left': (1036, 1093, 307, 329), 'view-right': (827, 883, 307, 329),
        'view-top': (949, 970, 410, 451), 'hero-frontleft': (1018, 1090, 329, 369),
        'hero-toptilt': (867, 901, 213, 260), 'close-roof': (760, 875, 434, 495),
        'view-rearleft': (1031, 1060, 303, 325), 'view-rearright': (859, 886, 303, 323),
        'hero-rearright': (852, 892, 276, 312),
    },
}
PAD = 34

def crop(im, bx, zoom):
    x0, x1, y0, y1 = bx
    x0, y0 = max(0, x0 - PAD), max(0, y0 - PAD)
    x1, y1 = min(im.size[0], x1 + PAD), min(im.size[1], y1 + PAD)
    c = im.crop((x0, y0, x1, y1))
    return c.resize((c.size[0] * zoom, c.size[1] * zoom), Image.NEAREST)

def main(tid, fresh_dir, base_dir, out_dir):
    for view, bx in BBOX[tid].items():
        fr = Image.open(f'{fresh_dir}/{view}.png').convert('RGB')
        ba = Image.open(f'{base_dir}/{view}.png').convert('RGB')
        # ref half: same bbox mirrored into ref half (x-640)
        rbx = (bx[0] - 640, bx[1] - 640, bx[2], bx[3])
        c_ba = crop(ba, bx, 3)
        c_fr = crop(fr, bx, 3)
        c_rf = crop(fr, rbx, 3)
        w = c_ba.size[0] + c_fr.size[0] + c_rf.size[0] + 20
        h = max(c_ba.size[1], c_fr.size[1], c_rf.size[1])
        strip = Image.new('RGB', (w, h), (40, 40, 40))
        strip.paste(c_ba, (0, 0))
        strip.paste(c_fr, (c_ba.size[0] + 10, 0))
        strip.paste(c_rf, (c_ba.size[0] + c_fr.size[0] + 20, 0))
        strip.save(f'{out_dir}/{tid}-{view}-strip3x.png')
        crop(fr, bx, 4).save(f'{out_dir}/{tid}-{view}-fresh4x.png')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
