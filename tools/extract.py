"""Step 1: pull one screenshot per page out of the 驾考精简500题 PDF and classify
the text-layer spans as sitting above (= previous question's overflow) or below
(= this question's tip/解析) the screenshot.  Output: shots/pNNN.jpeg + spans.json

usage: python3 extract.py <pdf> <workdir>
"""
import json
import os
import sys

import fitz

pdf, root = sys.argv[1], sys.argv[2]
os.makedirs(f"{root}/shots", exist_ok=True)
doc = fitz.open(pdf)
records = []
for pno in range(len(doc)):
    page = doc[pno]
    shots = [i for i in page.get_image_info(xrefs=True) if i["width"] >= 500]
    img_rect = None
    if len(shots) == 1:
        s = shots[0]
        img_rect = fitz.Rect(s["bbox"])
        data = doc.extract_image(s["xref"])
        with open(f"{root}/shots/p{pno + 1:03d}.{data['ext']}", "wb") as f:
            f.write(data["image"])
    spans = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            for sp in l["spans"]:
                if sp["text"].strip() and round(sp["size"]) == 20:   # 20pt = tip/解析 body text
                    spans.append((sp["bbox"][1], f"{sp['color']:06x}", sp["text"]))
    spans.sort()
    above = [(c, t) for y, c, t in spans if img_rect is not None and y < img_rect.y0]
    below = [(c, t) for y, c, t in spans if img_rect is None or y >= img_rect.y0]
    records.append({"page": pno + 1, "img_rect": list(img_rect) if img_rect else None,
                    "above": above, "below": below})
json.dump(records, open(f"{root}/spans.json", "w"), ensure_ascii=False, indent=1)
print("pages:", len(doc), "shots:", len(os.listdir(f"{root}/shots")))
