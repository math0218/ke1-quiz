# 题库提取流水线（已跑完，留档备查 / 复用到科四等同格式 PDF）

工作目录默认 `/tmp/ke1`（脚本里写死，复用时改 ROOT）。

1. `extract.py <pdf> /tmp/ke1` — PyMuPDF 抽每页 600×620 题目截图 + 文字层(蓝 #165dff=技巧口诀, 黑 #303133=解析)，按“截图上方/下方”切分跨页溢出。
2. `analyze.py` — 像素分析：左侧圆圈列定位选项行、蓝色实心✓盘定位正确答案、题干与首个选项之间的高带区裁剪题图。
3. `swiftc -O -o ocr ocr.swift` → `build_data.py` — 涂白圆圈列/题型标签/题图后用 macOS Vision OCR 识题干与选项，按选项行 y 坐标归并，组装 questions_raw.json。
4. 10 个子代理逐题对照截图复核 → `review/fixes_*.json`（本次 32 处修正，答案/题型零错误）。
5. `finalize.py` — 应用修正 + OpenCC 繁→简 + 两张截断页(PDF 第 420/451 页)人工补 D 选项 + 重编号 → 生成 `../data.js` 与 `../img/`。
6. `test_site.py` — Playwright 端到端冒烟测试。

依赖：pymupdf、Pillow、numpy、opencc-python-reimplemented、playwright；OCR 需要 macOS + Swift 工具链。
