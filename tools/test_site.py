"""End-to-end smoke test of the quiz site with Playwright (headless Chromium)."""
import json
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

SITE = "/Users/math/ZCodeProject/ke1-quiz"
PORT = 8765
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=SITE,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
BASE = f"http://127.0.0.1:{PORT}/"
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/Users/math/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell")
        ctx = b.new_context(viewport={"width": 430, "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)

        # home
        page.goto(BASE + "#/")
        page.wait_for_selector(".stats")
        total = page.evaluate("window.QUESTIONS.length")
        print("questions loaded:", total)
        page.screenshot(path="/tmp/ke1/shot_home.png", full_page=True)

        # sequential practice, answer wrong on purpose
        page.goto(BASE + "#/practice")
        page.wait_for_selector(".opt")
        q0 = page.evaluate("window.QUESTIONS[0]")
        wrong_idx = next(i for i in range(len(q0["options"])) if i not in q0["answer"])
        page.click(f'.opt[data-i="{wrong_idx}"]')
        page.wait_for_selector(".verdict.bad")
        assert page.is_visible(".hint-box.exp"), "explanation box missing"
        print("wrong answer -> verdict.bad shown; tip box:", page.is_visible(".hint-box.tip"))
        page.screenshot(path="/tmp/ke1/shot_wrong.png", full_page=True)
        st = json.loads(page.evaluate("localStorage.getItem('ke1quiz.v1')"))
        assert "0" in st["wrong"], "q0 not in wrong set"
        assert page.inner_text("#wrong-badge").strip() == "1", "badge not 1"

        # next question: answer right, expect auto-advance
        page.click("#btn-next")
        page.wait_for_selector(".opt:not(.answered)")
        q1 = page.evaluate("window.QUESTIONS[1]")
        page.click(f'.opt[data-i="{q1["answer"][0]}"]')
        page.wait_for_selector(".verdict.ok")
        page.screenshot(path="/tmp/ke1/shot_right.png", full_page=True)
        time.sleep(1.4)
        head = page.inner_text(".q-head")
        assert "第 3 /" in head, f"auto-advance failed: {head}"
        print("auto-advance OK ->", head.replace("\n", " "))

        # keyboard: press '1'..'4' selects; ArrowLeft goes back
        page.keyboard.press("ArrowLeft")
        page.wait_for_selector(".verdict.ok")
        page.keyboard.press("ArrowRight")
        page.wait_for_selector(".opt:not(.answered)")
        page.keyboard.press("2")
        page.wait_for_selector(".verdict")
        print("keyboard answer OK")

        # a question with an image renders the picture
        img_q = next(q for q in page.evaluate("window.QUESTIONS") if q["image"])
        page.goto(BASE + f"#/q/{img_q['id']}")
        page.wait_for_selector(".q-img img")
        nat = page.evaluate("document.querySelector('.q-img img').complete && document.querySelector('.q-img img').naturalWidth")
        assert nat and nat > 0, "image did not load"
        page.screenshot(path="/tmp/ke1/shot_image_q.png", full_page=True)
        print("image question renders, naturalWidth =", nat)

        # wrong list + wrong practice + master
        page.goto(BASE + "#/wrong")
        page.wait_for_selector(".wrong-item")
        n_items = page.locator(".wrong-item").count()
        print("wrong list items:", n_items)
        page.screenshot(path="/tmp/ke1/shot_wronglist.png", full_page=True)
        page.click("text=开始错题练习")
        for k in range(n_items):
            page.wait_for_selector(".opt:not(.answered)")
            qid = page.evaluate("Number(document.querySelector('.q-head .muted').textContent.slice(1)) - 1")
            qq = page.evaluate(f"window.QUESTIONS[{qid}]")
            page.click(f'.opt[data-i="{qq["answer"][0]}"]')
            page.wait_for_selector("#btn-master")
            if k == 0:
                page.screenshot(path="/tmp/ke1/shot_wrongpractice.png", full_page=True)
            page.click("#btn-master")
        page.wait_for_selector(".empty")
        st = json.loads(page.evaluate("localStorage.getItem('ke1quiz.v1')"))
        assert not st["wrong"], "wrong set not emptied"
        print("wrong practice -> mastered -> empty state OK")

        # list grid + random
        page.goto(BASE + "#/list")
        page.wait_for_selector(".tile")
        assert page.locator(".tile").count() == total
        page.screenshot(path="/tmp/ke1/shot_list.png", full_page=False)
        page.goto(BASE + "#/random")
        page.wait_for_selector(".opt")
        print("list + random OK")

        # desktop viewport screenshot
        ctx2 = b.new_context(viewport={"width": 1100, "height": 820})
        pg2 = ctx2.new_page()
        pg2.goto(BASE + "#/q/0")
        pg2.wait_for_selector(".opt")
        pg2.click('.opt[data-i="1"]')
        pg2.wait_for_selector(".verdict")
        pg2.screenshot(path="/tmp/ke1/shot_desktop.png", full_page=True)
        b.close()
finally:
    srv.terminate()
print("console/page errors:", errors or "none")
print("ALL TESTS PASSED" if not errors else "ERRORS PRESENT")
