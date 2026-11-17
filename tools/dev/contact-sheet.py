#!/usr/bin/env python3
"""Tile evidence frames into one review image (used for every visual review).

  python3 tools/dev/contact-sheet.py <dir> <glob> <out.jpg> [cols] [crop x0,y0,x1,y1] [tile WxH]

Example: python3 tools/dev/contact-sheet.py docs/evidence/vfx/after 'keeper*' /tmp/keeper.jpg 2 140,60,820,520
Requires Pillow (pip install pillow).
"""
import sys, glob, os
from PIL import Image
d, pat, out = sys.argv[1], sys.argv[2], sys.argv[3]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 2
crop = tuple(int(v) for v in sys.argv[5].split(',')) if len(sys.argv) > 5 else None
tile = tuple(int(v) for v in sys.argv[6].split('x')) if len(sys.argv) > 6 else None
files = sorted(glob.glob(os.path.join(d, pat if pat.endswith(('.jpg', '.png')) else pat + '.jpg')))
if not files: sys.exit('no files match')
ims = [Image.open(f).convert('RGB') for f in files]
if crop: ims = [im.crop(crop) for im in ims]
if tile: ims = [im.resize(tile) for im in ims]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows))
for i, im in enumerate(ims): sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(out, quality=88)
print('\n'.join(os.path.basename(f) for f in files))
