# python3 -I knockout.py in.webp out_base widths...   (cut out the edge-connected yellow ground)
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
src, out, widths = sys.argv[1], sys.argv[2], [int(w) for w in sys.argv[3:]]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(int)
bg = np.median(np.concatenate([a[:8].reshape(-1,3), a[-8:].reshape(-1,3), a[:, :8].reshape(-1,3), a[:, -8:].reshape(-1,3)]), axis=0)
d = np.sqrt(((a - bg) ** 2).sum(-1))
near = Image.fromarray(((d < 60) * 255).astype('uint8')).copy()   # yellow-ish pixels; copy() because fromarray images are read-only
W, H = near.size
for x in range(0, W, 6):
    for y in (0, H - 1):
        if near.getpixel((x, y)) == 255: ImageDraw.floodfill(near, (x, y), 128)
for y in range(0, H, 6):
    for x in (0, W - 1):
        if near.getpixel((x, y)) == 255: ImageDraw.floodfill(near, (x, y), 128)
ground = (np.asarray(near) == 128)
# soft edge: inside the ground, fade by colour distance so ink edges keep their antialiasing
alpha = np.where(ground, np.clip((d - 18) / 42, 0, 1) * 255, 255).astype('uint8')
alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6)))
rgba = np.dstack([a.astype('uint8'), alpha])
full = Image.fromarray(rgba, 'RGBA')
bbox = full.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
full = full.crop(bbox)
for w in widths:
    h = round(full.height * w / full.width)
    full.resize((w, h), Image.LANCZOS).save(f'{out}-{w}.webp', 'WEBP', quality=86, method=6)
    print(out, w, h)
