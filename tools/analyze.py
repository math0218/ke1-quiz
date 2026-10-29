"""Pixel analysis of 驾考宝典 question screenshots (600x620 JPEG).

For each screenshot we locate:
  * option rows   - the ring/disc column at x≈17..50 (one band per option)
  * correct rows  - solid cyan-blue discs with a white check mark
  * illustration  - tall ink band between the stem and the first option
"""
import json
import os
import sys

import numpy as np
from PIL import Image

SHOTS = "/tmp/ke1/shots"
CROPS = "/tmp/ke1/crops"
os.makedirs(CROPS, exist_ok=True)


def bands_from_profile(profile, thresh, min_h=1):
    out = []
    start = None
    for y, v in enumerate(profile):
        if v > thresh and start is None:
            start = y
        if v <= thresh and start is not None:
            if y - start >= min_h:
                out.append((start, y - 1))
            start = None
    if start is not None and len(profile) - start >= min_h:
        out.append((start, len(profile) - 1))
    return out


def analyze(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    h, w = a.shape[:2]
    mn = a.min(axis=2)
    light = mn < 245            # includes light-gray rings
    ink = mn < 200              # real ink (text / pictures)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    disc = (b > 190) & (g > 130) & (r < 110)   # cyan-blue filled disc

    # --- option rows: ring column x in [12,56] ---
    col = light[:, 12:56].sum(axis=1)
    cand = bands_from_profile(col, 0)
    opts = []
    for y0, y1 in cand:
        hh = y1 - y0 + 1
        if 24 <= hh <= 46 and y0 > 50:
            opts.append((y0, y1))
    # --- blue discs ---
    dc = disc[:, 12:56].sum(axis=1)
    discs = bands_from_profile(dc, 9, min_h=18)
    correct = []
    for d0, d1 in discs:
        cy = (d0 + d1) / 2
        best = None
        for i, (y0, y1) in enumerate(opts):
            if y0 - 6 <= cy <= y1 + 6:
                best = i
        if best is not None and best not in correct:
            correct.append(best)
    # --- illustration: tall band above first option ---
    y_limit = opts[0][0] - 4 if opts else h
    prof = ink[:y_limit, 55:565].sum(axis=1)
    rows = bands_from_profile(prof, 0)
    tall = [(y0, y1) for y0, y1 in rows if y1 - y0 + 1 >= 45]
    # light pictures (grey asphalt, pale sky) carry little "ink": also accept
    # tall runs of rows that are substantially non-white
    nonwhite = mn < 245
    prof2 = nonwhite[:y_limit, 55:565].sum(axis=1)
    tall += [(y0, y1) for y0, y1 in bands_from_profile(prof2, 99) if y1 - y0 + 1 >= 45]
    illus = None
    if tall:
        y0 = min(t[0] for t in tall)
        y1 = max(t[1] for t in tall)
        # absorb small labels (图A/图B…) that sit within 14px of the picture block;
        # the stem (≈40px above) and the 点击查看大图 caption (≈30px below) stay out
        changed = True
        while changed:
            changed = False
            for b0, b1 in rows:
                if b1 < y0 and y0 - b1 <= 14:
                    y0, changed = b0, True
                elif b0 > y1 and b0 - y1 <= 14:
                    y1, changed = b1, True
        cols = np.where(nonwhite[y0:y1 + 1, :].any(axis=0))[0]
        x0, x1 = int(cols.min()), int(cols.max())
        illus = (max(x0 - 4, 0), max(y0 - 4, 0), min(x1 + 5, w), min(y1 + 5, h))
    return {
        "options": opts,
        "n_options": len(opts),
        "correct_idx": correct,
        "illus": illus,
    }


def main():
    names = sorted(f for f in os.listdir(SHOTS) if f.endswith((".jpeg", ".jpg", ".png")))
    if len(sys.argv) > 1:
        names = names[: int(sys.argv[1])]
    result = {}
    for n in names:
        page = int(n[1:4])
        res = analyze(os.path.join(SHOTS, n))
        res["file"] = n
        result[page] = res
    json.dump(result, open("/tmp/ke1/pixel.json", "w"), ensure_ascii=False, indent=1)
    from collections import Counter
    print("n_options hist:", Counter(v["n_options"] for v in result.values()))
    print("n_correct hist:", Counter(len(v["correct_idx"]) for v in result.values()))
    print("has_illus:", sum(1 for v in result.values() if v["illus"]))
    odd = [p for p, v in result.items() if v["n_options"] not in (2, 4) or len(v["correct_idx"]) == 0]
    print("odd pages:", odd)


if __name__ == "__main__":
    main()
