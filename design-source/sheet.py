# python3 -I sheet.py refs_dir out.jpg name1 name2 ...  (tiles name-0..5.png)
import sys
from PIL import Image, ImageDraw
d, dst, names = sys.argv[1], sys.argv[2], sys.argv[3:]
w, h = 480, 300
sheet = Image.new("RGB", (w * 6, (h + 24) * len(names)), "white")
dr = ImageDraw.Draw(sheet)
for r, n in enumerate(names):
    dr.text((6, r * (h + 24) + 4), n, fill="black")
    for c in range(6):
        try:
            im = Image.open(f"{d}/{n}-{c}.png").convert("RGB").resize((w, h))
            sheet.paste(im, (c * w, r * (h + 24) + 24))
        except FileNotFoundError:
            pass
sheet.save(dst, quality=78)
