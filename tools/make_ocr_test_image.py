# -*- coding: utf-8 -*-
"""生成一张印刷体中文测试图，用于验证内置 tesseract OCR 链路（工具脚本，不进 APK）"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.environ.get("TEMP", "."), "kadian_ocr_test.png")
FONT = "C:/Windows/Fonts/msyh.ttc"

W, H = 1200, 560
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)
f_title = ImageFont.truetype(FONT, 44)
f_body = ImageFont.truetype(FONT, 36)
f_en = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 34)

y = 40
d.text((60, y), "物理 · 电磁感应练习", font=f_title, fill="black"); y += 80
for line in [
    "1. 如图所示，导体棒向右切割磁感线，",
    "   闭合线圈中产生的感应电流方向为（  ）",
    "A. 顺时针方向      B. 逆时针方向",
    "2. 楞次定律的核心是阻碍磁通量的变化。",
]:
    d.text((60, y), line, font=f_body, fill="black"); y += 56
d.text((60, y + 10), "OCR offline test 2026", font=f_en, fill="black")

img.save(OUT, "PNG")
print("saved:", OUT, os.path.getsize(OUT), "bytes")
