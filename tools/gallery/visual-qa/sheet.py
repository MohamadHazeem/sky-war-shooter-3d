"""Contact sheet of visual-QA captures, labelled with their file names.
Usage: python3 tools/gallery/visual-qa/sheet.py <out.jpg> <cols> <tile width> <img> [<img> ...]"""
import sys
from PIL import Image, ImageDraw

out, cols, W = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
ims = []
for f in sys.argv[4:]:
    im = Image.open(f).convert('RGB')
    im = im.resize((W, round(im.height * W / im.width)))
    d = ImageDraw.Draw(im)
    name = f.split('/')[-1].rsplit('.', 1)[0]
    d.rectangle([0, 0, len(name) * 7 + 6, 14], fill=(0, 0, 0))
    d.text((3, 1), name, fill=(255, 255, 0))
    ims.append(im)
H = max(i.height for i in ims)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * W + (cols - 1) * 4, rows * H + (rows - 1) * 4), (255, 0, 255))
for k, im in enumerate(ims):
    S.paste(im, ((k % cols) * (W + 4), (k // cols) * (H + 4)))
S.save(out, quality=88)
