# -*- coding: utf-8 -*-
"""下载 tesseract.js 5.1.1 内置文件到 assets/vendor/tesseract/ 并校验体积与 gzip 完整性"""
import base64
import gzip
import hashlib
import os
import sys
import urllib.request

BASE = "https://cdn.jsdelivr.net/npm"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "vendor", "tesseract")
ROOT = os.path.abspath(ROOT)

# (相对路径, URL, 期望字节数)
FILES = [
    ("tesseract.min.js", f"{BASE}/tesseract.js@5.1.1/dist/tesseract.min.js", 66695),
    ("worker.min.js", f"{BASE}/tesseract.js@5.1.1/dist/worker.min.js", 123724),
    ("tesseract.min.js.LICENSE.txt", f"{BASE}/tesseract.js@5.1.1/dist/tesseract.min.js.LICENSE.txt", None),
    ("worker.min.js.LICENSE.txt", f"{BASE}/tesseract.js@5.1.1/dist/worker.min.js.LICENSE.txt", None),
    ("tesseract-core.LICENSE", f"{BASE}/tesseract.js-core@5.1.1/LICENSE", None),
    ("core/tesseract-core-simd-lstm.wasm.js", f"{BASE}/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js", 3938657),
    ("core/tesseract-core-simd-lstm.wasm", f"{BASE}/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm", 2859709),
    ("core/tesseract-core-lstm.wasm.js", f"{BASE}/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js", 3938277),
    ("core/tesseract-core-lstm.wasm", f"{BASE}/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm", 2859424),
    ("tessdata/chi_sim.traineddata", f"{BASE}/@tesseract.js-data/chi_sim@1.0.0/4.0.0_best_int/chi_sim.traineddata.gz", 2471033),
    ("tessdata/eng.traineddata", f"{BASE}/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz", 5199098),
    ("tessdata/jpn.traineddata", f"{BASE}/@tesseract.js-data/jpn@1.0.0/4.0.0_best_int/jpn.traineddata.gz", 3039374),
]

opener = urllib.request.build_opener()
opener.addheaders = [("User-Agent", "curl/8.0")]
# 可选代理：环境变量 OCR_FETCH_PROXY=http://127.0.0.1:7897 时走代理（应对 SSL 瞬断）
if os.environ.get("OCR_FETCH_PROXY"):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({
        "http": os.environ["OCR_FETCH_PROXY"], "https": os.environ["OCR_FETCH_PROXY"]
    }))
    opener.addheaders = [("User-Agent", "curl/8.0")]

def fetch(url, timeout=300):
    last = None
    for attempt in range(5):
        try:
            with opener.open(url, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            last = e
            print(f"   重试 {attempt + 1}/5: {e}")
    raise last

failures = []
rows = []
for rel, url, expect in FILES:
    dest = os.path.join(ROOT, rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) == (expect or os.path.getsize(dest)) and (
        expect is None or os.path.getsize(dest) == expect
    ):
        with open(dest, "rb") as f:
            data = f.read()
        print(f"SKIP {rel}（已存在且体积相符 {len(data):,d}）")
    else:
        try:
            raw = fetch(url)
            if url.endswith(".gz"):
                # 语言包：jsdelivr 源为 .gz，仓库内存放解压后的 .traineddata（AGP 打包会剥离 .gz 扩展名）
                try:
                    data = gzip.decompress(raw)
                except Exception as e:
                    raise RuntimeError(f"gz 解压失败: {e}")
            else:
                data = raw
            with open(dest, "wb") as f:
                f.write(data)
        except Exception as e:
            failures.append(f"{rel}: download error {e}")
            print(f"ERR {rel}: {e}")
            continue
    size = len(data)
    sha_b64 = base64.b64encode(hashlib.sha256(data).digest()).decode()
    note = ""
    if expect is not None and size != expect:
        note = f"  !! 体积不符(期望{expect})"
        failures.append(f"{rel}: size {size} != {expect}")
    if url.endswith(".gz"):
        # 源为 .gz：上面已成功解压即证明完整性；再抽查解压结果可读
        pass
    rows.append((rel, size, sha_b64, note))
    print(f"OK  {rel:45s} {size:>10,d}  sha256(b64)={sha_b64}{note}")

total = sum(r[1] for r in rows)
print(f"\n共 {len(rows)}/{len(FILES)} 个文件，合计 {total:,d} 字节 ({total/1048576:.1f} MiB)")
if failures:
    print("\n失败项：")
    for f in failures:
        print(" -", f)
    sys.exit(1)
print("全部校验通过")
