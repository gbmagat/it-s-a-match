"""Render the static artwork for the site straight from the Canva design PDF.

Each screen's static parts become a "plate" (full 1440x1024 canvas rendered at 2x),
and animated pieces become transparent "layers" cropped to their bounds.
Interactive parts (chat bubbles, inputs, reply buttons) are removed from the
plates and rebuilt in HTML.

Run from the project root:  npm run assets
Outputs: public/assets/*.webp and src/assets-manifest.json
"""
import json
import os
import re
import sys

import numpy as np
import pymupdf
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, 'it’s match.pdf')
OUT = os.path.join(ROOT, 'public', 'assets')
MANIFEST = os.path.join(ROOT, 'src', 'assets-manifest.json')

SCALE = 2                      # output pixels per design pixel
PT_TO_PX = 1440 / 1080         # PDF pages are 1080x768 pt; the design canvas is 1440x1024 px

DO = re.compile(r'/(\w+) Do')
BT = re.compile(r'\bBT\b.*?\bET\b', re.S)
TOK = re.compile(r'\(([^()\\]|\\.)*\)|<[0-9A-Fa-f\s]*>|\bq\b|\bQ\b')
MARK = re.compile(r'/\w+\s*<<.*?>>\s*BDC|/\w+\s+BDC|/\w+\s+BMC|\bEMC\b', re.S)


def top_groups(s):
    spans, depth, start = [], 0, None
    for m in TOK.finditer(s):
        t = m.group(0)
        if t == 'q':
            if depth == 0:
                start = m.start()
            depth += 1
        elif t == 'Q':
            depth -= 1
            if depth == 0 and start is not None:
                spans.append((start, m.end()))
                start = None
    return spans


def blank(s, spans):
    """Remove spans from a content stream, keeping marked-content operators balanced."""
    merged = []
    for a, b in sorted(spans):
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(b, merged[-1][1]))
        else:
            merged.append((a, b))
    out, pos = [], 0
    for a, b in merged:
        out.append(s[pos:a])
        out.append(' ' + ' '.join(MARK.findall(s[a:b])) + ' ')
        pos = b
    out.append(s[pos:])
    return ''.join(out)


def ops(s):
    """All removable operations on a page: Do calls, text blocks, path-only groups."""
    do = [(m.group(1), m.start(), m.end()) for m in DO.finditer(s)]
    text = [(m.start(), m.end()) for m in BT.finditer(s)]
    paths = [(a, b) for a, b in top_groups(s) if ' Do' not in s[a:b] and not BT.search(s[a:b])]
    return do, text, paths


# Page "chrome" shared by every screen, recognised by its drawing objects:
# logo, logo text, header bar, nav links (by form bounding box), the puzzle
# pattern, the background photos, and the page/background fills.
CHROME_BBOXES = {'[0 0 212 169]', '[0 0 650 180]', '[0 0 4500 320]', '[0 0 254 140]', '[0 0 427 140]'}


def xobjects(doc, owner):
    """{name: xref} of an object's /Resources/XObject dictionary."""
    kind, val = doc.xref_get_key(owner, 'Resources/XObject')
    if kind == 'xref':
        val = doc.xref_object(int(val.split()[0]))
    return {n: int(x) for n, x in re.findall(r'/(\w+) (\d+) 0 R', val)}


def is_photo(doc, x):
    """A form wrapping one of the large background photos (not the 4196px chat panel)."""
    for ix in xobjects(doc, x).values():
        if doc.xref_get_key(ix, 'Subtype')[1] == '/Image':
            w = int(doc.xref_get_key(ix, 'Width')[1])
            if w >= 2000 and w != 4196:
                return True
    return False


def chrome(doc, page, s):
    do_names = set()
    for name, x in xobjects(doc, page.xref).items():
        if doc.xref_get_key(x, 'Subtype')[1] != '/Form':
            continue
        bbox = doc.xref_get_key(x, 'BBox')[1]
        puzzle = bbox == '[0 0 4500 3200]' and len(doc.xref_stream(x) or b'') > 100000
        if bbox in CHROME_BBOXES or puzzle or is_photo(doc, x):
            do_names.add(name)
    _, _, paths = ops(s)
    path_idx = [i for i, (a, b) in enumerate(paths) if '0 0 1440 1024 re f' in s[a:b] or '160.77407 91.69876' in s[a:b]]
    return do_names, path_idx


def strip_form_text(doc, owner, done=None):
    """Blank every text block inside the form XObjects used by `owner` (recursively)."""
    done = set() if done is None else done
    for x in xobjects(doc, owner).values():
        if x in done or doc.xref_get_key(x, 'Subtype')[1] != '/Form':
            continue
        done.add(x)
        body = (doc.xref_stream(x) or b'').decode('latin-1')
        if BT.search(body):
            doc.update_stream(x, blank(body, [(m.start(), m.end()) for m in BT.finditer(body)]).encode('latin-1'))
        strip_form_text(doc, x, done)


def render(pno, remove_do=(), remove_text=(), remove_paths=(), keep=None, alpha=False, no_chrome=False, keep_text=False):
    """Render page `pno` (1-based) without the given operations.

    All text is removed (it is real text on the site, see tools/build_texts.py)
    unless keep_text=True.
    remove_text / remove_paths take indices, or 'all'.
    keep: dict(do=[...], text=[...], paths=[...]) renders ONLY those operations.
    no_chrome: also drop the header, logo, nav, page fill, puzzle and photo.
    """
    doc = pymupdf.open(PDF)
    page = doc[pno - 1]
    page.clean_contents()
    cx = page.get_contents()[0]
    s = doc.xref_stream(cx).decode('latin-1')
    do, text, paths = ops(s)
    if no_chrome:
        cd, cp = chrome(doc, page, s)
        remove_do = set(remove_do) | cd
        remove_paths = remove_paths if remove_paths == 'all' else set(remove_paths) | set(cp)
    spans = []
    if keep is not None:
        # do_nth: (name, i) keeps only the i-th use of an object drawn more than once.
        seen = {}
        for n, a, b in do:
            i = seen[n] = seen.get(n, -1) + 1
            if n not in keep.get('do', ()) and (n, i) not in keep.get('do_nth', ()):
                spans.append((a, b))
        spans += [t for i, t in enumerate(text) if i not in keep.get('text', ())]
        spans += [p for i, p in enumerate(paths) if i not in keep.get('paths', ())]
    else:
        spans += [(a, b) for n, a, b in do if n in remove_do]
        spans += [t for i, t in enumerate(text) if remove_text == 'all' or i in remove_text]
        spans += [p for i, p in enumerate(paths) if remove_paths == 'all' or i in remove_paths]
    if not keep_text:
        spans += text
        strip_form_text(doc, page.xref)
    doc.update_stream(cx, blank(s, spans).encode('latin-1'))
    m = pymupdf.Matrix(PT_TO_PX * SCALE, PT_TO_PX * SCALE)
    pix = page.get_pixmap(matrix=m, alpha=alpha)
    if alpha:
        # MuPDF pixmaps are premultiplied; PIL expects straight alpha.
        a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 4).astype(np.float32)
        al = a[..., 3:4]
        a[..., :3] = np.where(al > 0, np.clip(a[..., :3] * 255.0 / np.maximum(al, 1), 0, 255), 0)
        img = Image.fromarray(a.round().astype(np.uint8), 'RGBA')
    else:
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    doc.close()
    return img.resize((1440 * SCALE, 1024 * SCALE), Image.LANCZOS) if img.size != (1440 * SCALE, 1024 * SCALE) else img


manifest = {'scale': SCALE, 'plates': {}, 'layers': {}, 'colors': {}}


def save_plate(name, img, quality=90, lossless=True):
    """Lossless by default: lossy WebP leaves a light halo along hard edges
    (e.g. under the header bar)."""
    path = os.path.join(OUT, name + '.webp')
    if lossless:
        img.save(path, 'WEBP', lossless=True, quality=100, method=6)
    else:
        img.save(path, 'WEBP', quality=quality, method=6)
    manifest['plates'][name] = f'/assets/{name}.webp'
    print(f'  plate {name:16} {os.path.getsize(path) // 1024} KB')


def save_layer(name, img, quality=92, within=None, lossless=True):
    """Crop a transparent layer to its content (optionally only inside `within`,
    a design-px rect) and record its position in design px."""
    if within:
        x0, y0, x1, y1 = [round(v * SCALE) for v in within]
        img = img.crop((x0, y0, x1, y1))
        inner = img.getbbox()
        bbox = (inner[0] + x0, inner[1] + y0, inner[2] + x0, inner[3] + y0)
        crop = img.crop(inner)
    else:
        bbox = img.getbbox()
        crop = img.crop(bbox)
    path = os.path.join(OUT, name + '.webp')
    if lossless:
        crop.save(path, 'WEBP', lossless=True, quality=100, method=6)
    else:
        crop.save(path, 'WEBP', quality=quality, method=6)
    x, y, x2, y2 = [v / SCALE for v in bbox]
    manifest['layers'][name] = {'src': f'/assets/{name}.webp', 'x': x, 'y': y, 'w': x2 - x, 'h': y2 - y}
    print(f'  layer {name:16} {os.path.getsize(path) // 1024} KB at ({x:.1f}, {y:.1f}) {x2 - x:.1f}x{y2 - y:.1f}')


PHOTO_OPACITY = 0.18  # ExtGState /ca .18 on the photo backgrounds (p4-p6)


def save_photo(name, pno):
    """Save a page's background photo (its largest image) at full resolution,
    with its position on the canvas."""
    doc = pymupdf.open(PDF)
    page = doc[pno - 1]
    info = max(page.get_image_info(xrefs=True), key=lambda i: (i['bbox'][2] - i['bbox'][0]) * (i['bbox'][3] - i['bbox'][1]))
    pix = pymupdf.Pixmap(doc, info['xref'])
    if pix.colorspace and pix.colorspace.n != 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    doc.close()
    path = os.path.join(OUT, name + '.webp')
    img.save(path, 'WEBP', quality=82, method=6)
    x0, y0, x1, y1 = [v * PT_TO_PX for v in info['bbox']]
    manifest.setdefault('photos', {})[name] = {
        'src': f'/assets/{name}.webp', 'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'opacity': PHOTO_OPACITY,
    }
    print(f'  photo {name:16} {os.path.getsize(path) // 1024} KB at ({x0:.1f}, {y0:.1f}) {x1 - x0:.1f}x{y1 - y0:.1f}')


def main():
    os.makedirs(OUT, exist_ok=True)
    print('Rendering from', PDF)
    # The site is responsive: header, backgrounds and panels are drawn by the
    # site; these are the pieces of artwork it places (all text removed, see
    # build_texts.py), in design coordinates.

    # 1 Landing: the "get started" button (X6 + path group 2), animated on hover.
    save_layer('logo', render(1, keep={'do': ['X20'], 'paths': [3]}, alpha=True))  # the heart logo
    save_layer('landing-button', render(1, keep={'do': ['X6', 'X16'], 'paths': [2]}, alpha=True))

    # 3 Sign up: the card with its input boxes, and the "sign up" button (X12).
    save_layer('signup-card', render(3, remove_do=['X12'], alpha=True, no_chrome=True))
    save_layer('signup-button', render(3, keep={'do': ['X12']}, alpha=True))

    # 4 Swipe: the three cards and the glow, in the PDF's stacking order:
    # card-right -> card-left -> glow -> card-center (frame path group 5 + names).
    # Halftone dots: path group 2 is drawn *under* the photo in the PDF, so the
    # site shows it at 82% (= under the 18% photo); path group 4 is on top.
    save_layer('swipe-dots', render(4, keep={'paths': [2]}, alpha=True))
    save_layer('swipe-dots-top', render(4, keep={'paths': [4]}, alpha=True))
    save_layer('card-right', render(4, keep={'do': ['X22']}, alpha=True))
    save_layer('card-left', render(4, keep={'do': ['X37']}, alpha=True))
    save_layer('swipe-glow', render(4, keep={'do': ['X38']}, alpha=True), lossless=False)
    save_layer('card-center', render(4, keep={'do': ['X40', 'X45', 'X48'], 'paths': [5]}, alpha=True))

    # 5 "you found a match": heart badge (glow, dots, heart, curved lettering).
    heart = ['X13', 'X15', 'X17', 'X19', 'X22']
    save_layer('found-heart', render(5, keep={'do': heart, 'paths': [2, 3]}, alpha=True), lossless=False)

    # 6 Match A and Match B halves (the glow X13 and ring X20 are each drawn twice: B's glow first).
    save_layer('choose-a-art', render(6, keep={'do': ['X16', 'X18'], 'do_nth': [('X13', 1), ('X20', 0)], 'paths': [4, 5], 'text': [0]}, alpha=True))
    save_layer('choose-b-art', render(6, keep={'do': ['X22', 'X24'], 'do_nth': [('X13', 0), ('X20', 1)], 'paths': [3, 6], 'text': [1]}, alpha=True))

    # 7 / 11 "it's a match!" You + Match A / B.
    save_layer('itsamatch-a-art', render(7, alpha=True, no_chrome=True))
    save_layer('itsamatch-b-art', render(11, alpha=True, no_chrome=True))

    # 8 / 12 Match hub: avatar, and the Text Style cards (X24, X26, X28) as their
    # own layers so they can lift on hover.
    hub_cards = ['X24', 'X26', 'X28']
    save_layer('hub-a-art', render(8, remove_do=hub_cards, alpha=True, no_chrome=True))
    save_layer('hub-b-art', render(12, remove_do=hub_cards, alpha=True, no_chrome=True))
    for i, x in enumerate(hub_cards):
        save_layer(f'hub-card-{i}', render(8, keep={'do': [x]}, alpha=True))

    # 9 Chat box pieces: avatar with ring, call/video/camera/send icons
    # (cropped to their own spot: the header divider shares a drawing group with them).
    save_layer('chat-avatar', render(9, keep={'do': ['X24', 'X26'], 'paths': [8]}, alpha=True), within=(126, 182, 214, 270))
    save_layer('icon-phone', render(9, keep={'paths': [3]}, alpha=True), within=(1138, 197, 1200, 262))
    save_layer('icon-video', render(9, keep={'paths': [4]}, alpha=True), within=(1216, 184, 1299, 267))
    save_layer('icon-camera', render(9, keep={'paths': [6, 7]}, alpha=True), within=(130, 855, 197, 914))
    save_layer('icon-send', render(9, keep={'do': ['X18']}, alpha=True), within=(1230, 856, 1286, 912))

    # Backgrounds: the photos (18% over cream, as placed in the PDF) ...
    save_photo('photo-hands', 4)
    save_photo('photo-picnic', 6)
    # ... and the puzzle pattern as a seamless tile (the canvas + mirrored copies, 2x2), at 2x.
    puzzle = render(1, keep={'do': ['X5'], 'paths': [0, 1]})
    w, h = puzzle.size
    tile = Image.new('RGB', (w * 2, h * 2))
    tile.paste(puzzle, (0, 0))
    tile.paste(puzzle.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
    tile.paste(puzzle.transpose(Image.FLIP_TOP_BOTTOM), (0, h))
    tile.paste(puzzle.transpose(Image.ROTATE_180), (w, h))
    save_plate('puzzle-tile', tile, quality=80, lossless=False)

    # Header bar gradient, stretched across the header by the site.
    doc = pymupdf.open(PDF)
    bar = next(i for i in doc[0].get_image_info(xrefs=True) if round(i['width']) == 1466)
    pix = pymupdf.Pixmap(doc, bar['xref'])
    if pix.colorspace and pix.colorspace.n != 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(os.path.join(OUT, 'header-bar.webp'), 'WEBP', quality=92)
    manifest['plates']['header-bar'] = '/assets/header-bar.webp'
    doc.close()

    # Favicon: the header logo on its wine background.
    m = pymupdf.Matrix(PT_TO_PX * 4, PT_TO_PX * 4)
    doc = pymupdf.open(PDF)
    pix = doc[0].get_pixmap(matrix=m, clip=pymupdf.Rect(37 / PT_TO_PX, 10 / PT_TO_PX, 119 / PT_TO_PX, 92 / PT_TO_PX))
    icon = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    doc.close()
    icon.resize((64, 64), Image.LANCZOS).save(os.path.join(ROOT, 'public', 'favicon.png'))
    icon.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, 'public', 'apple-touch-icon.png'))

    # Files from the old fixed-canvas version.
    for old in os.listdir(OUT):
        name = old.rsplit('.', 1)[0]
        if name not in manifest['plates'] and name not in manifest['layers'] and name not in manifest.get('photos', {}):
            os.remove(os.path.join(OUT, old))
            print('  removed old', old)

    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=2)
    print('Wrote', MANIFEST)


if __name__ == '__main__':
    sys.exit(main())
