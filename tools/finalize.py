"""Finalize questions: apply reviewer fixes, traditional->simplified conversion,
manual overrides for the two truncated pages, then emit data.js + site images."""
import glob
import json
import os
import shutil

import opencc

ROOT = "/tmp/ke1"
SITE = "/Users/math/ZCodeProject/ke1-quiz"
cc = opencc.OpenCC("t2s")

Q = json.load(open(f"{ROOT}/questions_raw.json"))
by_id = {q["id"]: q for q in Q}

# ---- 1. reviewer fixes ----
fixes = []
for f in sorted(glob.glob(f"{ROOT}/review/fixes_*.json")):
    try:
        arr = json.load(open(f))
    except Exception as e:
        print("!! cannot parse", f, e)
        continue
    fixes.extend(arr)
print("reviewer fixes:", len(fixes))
apply_log = []
for fx in fixes:
    q = by_id.get(fx["id"])
    if q is None:
        print("!! fix for unknown id", fx)
        continue
    field, val = fx["field"], fx["value"]
    if field == "question":
        apply_log.append((fx["id"], "question", q["question"], val))
        q["question"] = val
    elif field == "options":
        apply_log.append((fx["id"], "options", q["options"], val))
        q["options"] = val
    elif field == "answer":
        L = "ABCDEF"
        idx = [L.index(ch) for ch in val]
        apply_log.append((fx["id"], "answer", q["answer"], idx))
        q["answer"] = idx
    elif field == "type":
        apply_log.append((fx["id"], "type", q["type"], val))
        q["type"] = val
for a in apply_log:
    print("  fix", a)

# ---- 2. manual overrides for truncated screenshots (option D cut off in the PDF) ----
overrides = {
    420: {"options": ["70", "40", "60", "50"], "answer": [0], "note": "D=50 visible at bottom edge"},
    451: {"options": ["①②③", "①②", "②③", "①③"], "answer": [2], "note": "D=①③ (standard question; screenshot cut)"},
}
for page, ov in overrides.items():
    q = next(x for x in Q if x["page"] == page)
    q["options"] = ov["options"]
    q["answer"] = ov["answer"]
    print("manual override page", page, ov["note"])

# ---- 3. systematic OCR confusions, then traditional -> simplified ----
import re
SYSTEMATIC = [
    (re.compile(r"管埋"), "管理"),
    (re.compile(r"([一二两三四五六七八九十])干(元|万)"), r"\1千\2"),
]
sys_changed = 0
def fix_sys(s):
    global sys_changed
    for pat, rep in SYSTEMATIC:
        s2 = pat.sub(rep, s)
        if s2 != s:
            sys_changed += 1
            s = s2
    return s
for q in Q:
    q["question"] = fix_sys(q["question"])
    q["options"] = [fix_sys(o) for o in q["options"]]
print("systematic fixes applied:", sys_changed)

changed = []
for q in Q:
    for field in ("question", "tip", "explanation"):
        v = q[field]
        s = cc.convert(v) if v else v
        if s != v:
            changed.append((q["id"], field, v, s))
            q[field] = s
    q["options"] = [cc.convert(o) for o in q["options"]]
print("t2s changed:", len(changed))
for c in changed:
    print("  ", c)

# ---- 3b. light normalisation: judge statements end with a full stop ----
import re
for q in Q:
    q["question"] = q["question"].strip()
    q["options"] = [o.strip() for o in q["options"]]
    if q["type"] == "判断题" and not re.search(r"[。？！）”]$", q["question"]):
        print("  add 。 to", q["id"], q["question"][-12:])
        q["question"] += "。"

# ---- 4. sanity checks ----
assert len(Q) == 497
ids = [q["id"] for q in Q]
assert len(set(ids)) == len(ids)
for q in Q:
    n = len(q["options"])
    assert n in (2, 4), (q["id"], n)
    assert all(0 <= a < n for a in q["answer"]), q["id"]
    assert q["question"] and all(o for o in q["options"]), q["id"]
    if q["type"] == "判断题":
        assert n == 2, q["id"]
    assert q["explanation"], q["id"]

# ---- 5. emit: renumber to 0-based, copy images ----
os.makedirs(f"{SITE}/img", exist_ok=True)
out = []
for i, q in enumerate(sorted(Q, key=lambda x: x["page"])):
    img = None
    if q["image"]:
        src = f"{ROOT}/crops/q{q['id']:03d}.jpg"
        img = f"img/q{i:03d}.jpg"
        shutil.copyfile(src, f"{SITE}/{img}")
    out.append({
        "id": i,
        "type": q["type"],
        "question": q["question"],
        "options": q["options"],
        "answer": q["answer"],
        "image": img,
        "tip": q["tip"],
        "explanation": q["explanation"],
    })
# strip stale crops from earlier numbering
for f in os.listdir(f"{SITE}/img"):
    if f not in {o["image"].split("/")[-1] for o in out if o["image"]}:
        os.remove(f"{SITE}/img/" + f)

with open(f"{SITE}/data.js", "w") as f:
    f.write("// 科目一精简500题 · 题库数据（由《驾考精简500题》PDF 提取）\n")
    f.write("window.QUESTIONS = ")
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
json.dump(out, open(f"{ROOT}/questions_final.json", "w"), ensure_ascii=False, indent=1)
print("emitted", len(out), "questions")
from collections import Counter
print(Counter(q["type"] for q in out), "images:", sum(1 for q in out if q["image"]), "tips:", sum(1 for q in out if q["tip"]))
