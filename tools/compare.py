"""Compare screenshots from tools/screenshots.mjs against the design PDF.

  python -I tools/compare.py <shots-dir>

Prints the mean difference per screen and writes side-by-side images
(PDF | site | difference x4) to <shots-dir>/compare/.
"""
import os
import sys

import pymupdf
from PIL import Image, ImageChops, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, 'it’s match.pdf')
PAGES = {
    'landing': 1, 'terms': 2, 'signup': 3, 'swipe': 4, 'found': 5, 'choose': 6,
    'itsamatch-a': 7, 'hub-a': 8, 'chat-p9': 9, 'chat-p10': 10, 'itsamatch-b': 11, 'hub-b': 12,
}


def main(shots):
    doc = pymupdf.open(PDF)
    out = os.path.join(shots, 'compare')
    os.makedirs(out, exist_ok=True)
    for name, pno in PAGES.items():
        path = os.path.join(shots, name + '.png')
        if not os.path.exists(path):
            continue
        site = Image.open(path).convert('RGB')
        pix = doc[pno - 1].get_pixmap(matrix=pymupdf.Matrix(1440 / 1080, 1440 / 1080))
        ref = Image.frombytes('RGB', (pix.width, pix.height), pix.samples).resize(site.size)
        diff = ImageChops.difference(ref, site).convert('L')
        mean = ImageStat.Stat(diff).mean[0]
        hot = diff.point(lambda v: 255 if v > 40 else 0)
        print(f'{name:12} p{pno:<2} mean diff {mean:5.2f}/255   pixels off by >40: {sum(1 for v in hot.getdata() if v) / (site.width * site.height) * 100:5.2f}%   area {hot.getbbox()}')
        w, h = site.size
        sheet = Image.new('RGB', (w * 3, h))
        sheet.paste(ref, (0, 0))
        sheet.paste(site, (w, 0))
        sheet.paste(diff.point(lambda v: min(255, v * 4)).convert('RGB'), (2 * w, 0))
        sheet.resize((w * 3 // 2, h // 2)).save(os.path.join(out, name + '.png'))


if __name__ == '__main__':
    main(sys.argv[1])
