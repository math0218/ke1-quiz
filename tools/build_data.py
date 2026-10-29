"""Assemble questions.json from: pixel.json (layout/answers), spans.json (tips/解析),
masked-image OCR (stem/options) and badge OCR (question type)."""
import json
import os
import re
import subprocess

from PIL import Image, ImageDraw

ROOT = "/tmp/ke1"
SHOTS = f"{ROOT}/shots"
MASKED = f"{ROOT}/masked"
BADGE = f"{ROOT}/badge"
CROPS = f"{ROOT}/crops"
for d in (MASKED, BADGE, CROPS):
    os.makedirs(d, exist_ok=True)

pixel = {int(k): v for k, v in json.load(open(f"{ROOT}/pixel.json")).items()}
spans = {r["page"]: r for r in json.load(open(f"{ROOT}/spans.json"))}
pages = sorted(pixel)

# ---------- 1. masked images + badge crops + illustration crops ----------
masked_paths, badge_paths = [], []
for p in pages:
    info = pixel[p]
    im = Image.open(f"{SHOTS}/{info['file']}").convert("RGB")
    im.crop((10, 8, 95, 50)).resize((85 * 3, 42 * 3), Image.LANCZOS).save(f"{BADGE}/p{p:03d}.png")
    badge_paths.append(f"{BADGE}/p{p:03d}.png")
    if info["illus"]:
        x0, y0, x1, y1 = info["illus"]
        im.crop((x0, y0, x1, y1)).save(f"{CROPS}/q{p - 1:03d}.jpg", quality=90)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 87, 48), fill="white")        # badge
    d.rectangle((0, 48, 58, im.height), fill="white")  # ring/disc column
    if info["illus"]:
        x0, y0, x1, y1 = info["illus"]
        d.rectangle((x0, y0, x1, y1), fill="white")    # picture (OCR noise)
    # upscale 2x helps Vision with the 20px glyphs
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    im.save(f"{MASKED}/p{p:03d}.png")
    masked_paths.append(f"{MASKED}/p{p:03d}.png")

# ---------- 2. OCR ----------
def run_ocr(out, paths):
    if not os.path.exists(out):
        subprocess.run([f"{ROOT}/ocr", out] + paths, check=True)
    res = {}
    for line in open(out):
        o = json.loads(line)
        res[int(o["file"][1:4])] = o
    return res

ocr_main = run_ocr(f"{ROOT}/ocr_masked.jsonl", masked_paths)
ocr_badge = run_ocr(f"{ROOT}/ocr_badge.jsonl", badge_paths)

# ---------- 3. assemble ----------
CAPTION = re.compile(r"^[点击查看大图\s]+$")
TYPE_RE = re.compile(r"(单选|判断|多选)")

def clean(t):
    t = t.replace(" ", "")
    # normalise ascii punctuation adjacent to CJK
    t = t.replace(",", "，").replace("?", "？").replace(":", "：").replace(";", "；")
    t = re.sub(r"\(", "（", t)
    t = re.sub(r"\)", "）", t)
    return t.strip()

questions = []
issues = []
for p in pages:
    info = pixel[p]
    qid = p - 1
    opts = info["options"]
    lines = ocr_main[p]["lines"]
    # back to original pixel coordinates (image was upscaled 2x)
    L = [dict(text=l["text"], conf=l["conf"], x=l["x"] / 2, y=l["y"] / 2,
              w=l["w"] / 2, h=l["h"] / 2) for l in lines]
    L = [l for l in L if not CAPTION.match(l["text"].strip()) and l["text"].strip()]
    first_opt_top = opts[0][0] - 10 if opts else 10 ** 9
    stem_lines = [l for l in L if l["y"] + l["h"] / 2 < first_opt_top]
    stem = clean("".join(l["text"] for l in sorted(stem_lines, key=lambda l: l["y"])))
    option_texts = []
    for i, (y0, y1) in enumerate(opts):
        top = y0 - 10
        bottom = opts[i + 1][0] - 10 if i + 1 < len(opts) else 10 ** 9
        ls = [l for l in L if top <= l["y"] + l["h"] / 2 < bottom]
        option_texts.append(clean("".join(l["text"] for l in sorted(ls, key=lambda l: l["y"]))))
    # type
    btxt = "".join(l["text"] for l in ocr_badge[p]["lines"]) if p in ocr_badge else ""
    m = TYPE_RE.search(btxt)
    badge_type = (m.group(1) + "题") if m else ""
    if len(opts) == 2:
        qtype = "判断题"
    elif len(info["correct_idx"]) > 1:
        qtype = "多选题"
    else:
        qtype = "单选题"
    if badge_type and badge_type != qtype:
        issues.append((qid, f"badge says {badge_type} but layout says {qtype}"))
    # tips / explanation
    seq = list(spans[p]["below"]) + (list(spans[p + 1]["above"]) if p + 1 in spans else [])
    tip = "".join(t for c, t in seq if c == "165dff").strip()
    exp = "".join(t for c, t in seq if c == "303133").strip()
    other = [(c, t) for c, t in seq if c not in ("165dff", "303133")]
    if other:
        issues.append((qid, f"unexpected colours {other[:2]}"))
    exp = re.sub(r"^解析[：:]\s*", "", exp)
    if not exp:
        issues.append((qid, "no explanation"))
    if not stem:
        issues.append((qid, "empty stem"))
    if any(not o for o in option_texts):
        issues.append((qid, f"empty option {option_texts}"))
    if not info["correct_idx"]:
        issues.append((qid, "no answer detected"))
    q = {
        "id": qid,
        "type": qtype,
        "question": stem,
        "options": option_texts,
        "answer": info["correct_idx"],
        "image": f"img/q{qid:03d}.jpg" if info["illus"] else None,
        "tip": tip,
        "explanation": exp,
        "page": p,
    }
    questions.append(q)

json.dump(questions, open(f"{ROOT}/questions_raw.json", "w"), ensure_ascii=False, indent=1)
print("questions:", len(questions))
print("issues:", len(issues))
for i in issues[:60]:
    print("  ", i)
