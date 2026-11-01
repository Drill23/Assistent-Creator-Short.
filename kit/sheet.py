import sys, glob
from PIL import Image, ImageDraw
files = sys.argv[2:]; out = sys.argv[1]
cols = 6; w, h = 270, 480; rows = (len(files) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * (h + 22)), 'black'); d = ImageDraw.Draw(S)
for i, f in enumerate(files):
    im = Image.open(f).resize((w, h)); x, y = (i % cols) * w, (i // cols) * (h + 22)
    S.paste(im, (x, y + 22)); d.text((x + 4, y + 4), f.split('f_')[-1][:-4], fill='yellow')
S.save(out, quality=85)
