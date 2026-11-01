"""Extract every piece of text from the design PDF so the site can draw it as
real text (SVG <text>) instead of baking it into images.

Run from the project root after build_assets.py:  python -I tools/build_texts.py
Output: src/texts.json, grouped by screen. Each item has the text, font,
size (design px), the x position of every character as placed by Canva, the
baseline, and its fill: a colour, or a linear gradient measured from the
rendered PDF.

If a text is changed by hand in texts.json, delete its "xs" list and set
"tracking" (em) instead; the site then lays the letters out itself.
"""
import json
import os
import sys

import numpy as np
import pymupdf
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_assets as B  # noqa: E402

OUT = os.path.join(B.ROOT, 'src', 'texts.json')
K = B.PT_TO_PX
S = B.SCALE
HEADER_BOTTOM = 103

FONTS = {
    'DMSans-Bold': ('dm', 700),
    'DMSans-Regular': ('dm', 400),
    'Fraunces9pt-Italic': ('fraunces', 400),
    'Garet-Bold': ('garet', 700),  # shown in Montserrat Bold (Garet isn't a free web font)
}

# screen -> page; the chat pages (9, 10) are left out: their text is the live chat.
SCREENS = {'landing': 1, 'signup': 3, 'swipe': 4, 'choose': 6, 'itsamatch-a': 7, 'hub-a': 8, 'itsamatch-b': 11, 'hub-b': 12}


def spans(pno):
    """Unique text spans on a page (Canva draws some text more than once)."""
    doc = pymupdf.open(B.PDF)
    out, seen = [], set()
    for block in doc[pno - 1].get_text('rawdict')['blocks']:
        for line in block.get('lines', []):
            for sp in line['spans']:
                chars = [c for c in sp['chars']]
                while chars and chars[-1]['c'] == ' ':
                    chars.pop()
                while chars and chars[0]['c'] == ' ':
                    chars.pop(0)
                if not chars:
                    continue
                text = ''.join('’' if c['c'] == '�' else c['c'] for c in chars)
                font = sp['font'].split('+')[-1]
                x0, y0 = chars[0]['origin']
                key = (text, round(x0, 1), round(y0, 1))
                if key in seen or font not in FONTS:
                    continue
                seen.add(key)
                fam, weight = FONTS[font]
                bx0, by0, bx1, by1 = [v * K for v in sp['bbox']]
                out.append({
                    'text': text,
                    'font': fam,
                    'weight': weight,
                    'size': round(sp['size'] * K, 2),
                    'xs': [round(c['origin'][0] * K, 2) for c in chars],
                    'y': round(y0 * K, 2),
                    'bbox': [round(bx0, 1), round(by0, 1), round(bx1, 1), round(by1, 1)],
                })
    doc.close()
    return out


def hexc(rgb):
    return '#%02x%02x%02x' % tuple(int(round(min(255, max(0, v)))) for v in rgb)


# The design's palette: sampled colours within a few steps snap to these.
PALETTE = ['#7c0a22', '#f6f1e7', '#3b3737', '#af6777', '#000000', '#ffffff']
GRADIENT = ('#7b0b23', '#af6777')  # Canva's wine -> rose text gradient


def snap(rgb):
    rgb = np.array(rgb, dtype=float)
    best = min(PALETTE, key=lambda h: np.abs(rgb - np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)])).sum())
    dist = np.abs(rgb - np.array([int(best[i:i + 2], 16) for i in (1, 3, 5)])).sum()
    return best if dist <= 12 else hexc(rgb)


def measure_fills(pno, items):
    """Sample each text's colour from the PDF render (text vs no-text) and fit
    a horizontal linear gradient where the colour changes across the text."""
    full = np.asarray(B.render(pno, keep_text=True).convert('RGB')).astype(np.float32)
    bare = np.asarray(B.render(pno).convert('RGB')).astype(np.float32)
    diff = np.abs(full - bare).sum(axis=2)
    mask = Image.fromarray(((diff > 60) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))
    core = np.asarray(mask) > 0
    for it in items:
        x0, y0, x1, y1 = [int(round(v * S)) for v in it['bbox']]
        sub = core[y0:y1, x0:x1]
        ys, xs = np.nonzero(sub)
        if len(xs) < 20:
            it['fill'] = None  # hidden; filled from a twin below
            continue
        cols = full[y0:y1, x0:x1][ys, xs]
        px = (xs + x0) / S
        A = np.stack([np.ones_like(px), px], axis=1)
        coef, *_ = np.linalg.lstsq(A, cols, rcond=None)  # 2x3: intercept, slope per channel
        left, right = it['bbox'][0], it['bbox'][2]
        c_left = coef[0] + coef[1] * left
        c_right = coef[0] + coef[1] * right
        if np.abs(c_right - c_left).max() < 12:
            it['fill'] = snap(np.median(cols, axis=0))
            continue
        # Gradient: find where the green channel (largest change) reaches Canva's
        # end colours. Close to the text's own edges -> the gradient spans the text.
        g0, g1 = int(GRADIENT[0][3:5], 16), int(GRADIENT[1][3:5], 16)
        a, b = coef[0][1], coef[1][1]
        xs0, xs1 = (g0 - a) / b, (g1 - a) / b
        tol = 0.15 * (right - left)
        if abs(xs0 - left) < tol and abs(xs1 - right) < tol:
            xs0, xs1 = left, right
        it['fill'] = {'x1': round(float(xs0), 1), 'x2': round(float(xs1), 1), 'from': GRADIENT[0], 'to': GRADIENT[1]}
    # Text hidden in the PDF (e.g. a card name behind another card) copies the
    # fill of the same text elsewhere on the page, shifted to its own position.
    for it in items:
        if it.get('fill') is None:
            twin = next((o for o in items if o is not it and o['text'] == it['text'] and o['size'] == it['size'] and o.get('fill')), None)
            if twin and isinstance(twin['fill'], dict):
                dx = it['xs'][0] - twin['xs'][0]
                it['fill'] = {**twin['fill'], 'x1': round(twin['fill']['x1'] + dx, 1), 'x2': round(twin['fill']['x2'] + dx, 1)}
            else:
                it['fill'] = twin['fill'] if twin else '#000000'
    # Lines of one text box (same left edge and size, e.g. "it's a" / "match!")
    # share one gradient across the box: use the one spanning the widest line.
    for it in items:
        if not isinstance(it['fill'], dict):
            continue
        box = [o for o in items if isinstance(o['fill'], dict) and abs(o['xs'][0] - it['xs'][0]) < 1 and o['size'] == it['size']]
        widest = max(box, key=lambda o: o['fill']['x2'] - o['fill']['x1'])
        it['fill'] = dict(widest['fill'])


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    data = {}
    header = [it for it in spans(3) if it['y'] < HEADER_BOTTOM]
    measure_fills(3, header)
    for it in header:
        it['id'] = {'it’s a match': 'logo', 'my match': 'myMatch', 'home': 'home'}.get(it['text'], it['text'])
        del it['bbox']
    data['header'] = header
    for screen, pno in SCREENS.items():
        items = [it for it in spans(pno) if it['y'] >= HEADER_BOTTOM]
        measure_fills(pno, items)
        for it in items:
            del it['bbox']
        data[screen] = items
        print(f'{screen}: ' + ' | '.join(f"{it['text']!r} {it['font']}{it['weight']} {it['size']}px fill={it['fill']}" for it in items))
    # The underline under "Privacy Policy." (a 2px bar in the PDF).
    data['landing'].append({'rect': [999.4, 930.1, 123.9, 2.0], 'fill': '#7c0a22'})
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('Wrote', OUT)


if __name__ == '__main__':
    main()
