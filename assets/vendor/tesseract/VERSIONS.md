# tesseract.js 内置文件清单（版本与来源）

本目录为「卡点」内置的本地 OCR 引擎文件，全部来自 jsdelivr 官方 CDN，随仓库提交、随 APK 打包。
重新下载/校验可用：`python tools/fetch_ocr_assets.py`

| 文件 | 来源 | 字节数 | SHA-256 (base64) |
|---|---|---|---|
| tesseract.min.js | tesseract.js@5.1.1 | 66,695 | qOKZGNCYsrBuEBK9rv+0rsBEXF1WVHCQI+C9H0QqgOg= |
| worker.min.js | tesseract.js@5.1.1 | 123,724 | rKEiljn8mQfYb5boJZVaK3xXFtF/O8Os1x+cerZhgfw= |
| tesseract.min.js.LICENSE.txt | tesseract.js@5.1.1 (Apache-2.0) | 149 | zfljztfSWg+YkBpUdke01uLb4Bl/14yHoFmoew5UL+I= |
| worker.min.js.LICENSE.txt | tesseract.js@5.1.1 (Apache-2.0) | 466 | RfVBca6qHRDAwaZvN0t7uh8CRysUh/voku7AT4QAAqw= |
| tesseract-core.LICENSE | tesseract.js-core@5.1.1 (Apache-2.0) | 11,358 | xllut76FgcGL5zbIRvuRc7aezPbvlMUTWJPsVr2Sugg= |
| core/tesseract-core-simd-lstm.wasm.js | tesseract.js-core@5.1.1 | 3,938,657 | ziDtqVM8vtHmwrQnb7rh4K3GG2dUtVEwhL5gF4e0V88= |
| core/tesseract-core-simd-lstm.wasm | tesseract.js-core@5.1.1 | 2,859,709 | ZrYBIkoMSol3vJ2S3TmEEYn5yiLMQSL81yCM2wlh7u8= |
| core/tesseract-core-lstm.wasm.js | tesseract.js-core@5.1.1（无 SIMD 兜底） | 3,938,277 | jwSqDMgee94z+A6S+gGnpmXwtIhNCYrPXenHEEoR36o= |
| core/tesseract-core-lstm.wasm | tesseract.js-core@5.1.1（无 SIMD 兜底） | 2,859,424 | XbWOpNG9Qla+geiuO0+iSsRiXfuhhQsbMwjb83AOmSk= |
| tessdata/chi_sim.traineddata | @tesseract.js-data/chi_sim@1.0.0 (4.0.0_best_int) | 2,471,033 | l4T3yRfFRkJLaQ/N5wjOH2BKQ5PQi7Ud2rFG19fHlOY= |
| tessdata/eng.traineddata | @tesseract.js-data/eng@1.0.0 (4.0.0_best_int) | 5,199,098 | XcXY1kCiEsnWGEkhuhA7GG9Q4P7Z7nFsU+azErQA10c= |
| tessdata/jpn.traineddata | @tesseract.js-data/jpn@1.0.0 (4.0.0_best_int) | 3,039,374 | GgF1KR6hRdSma+aB0QhElvEK+TiqyrJHxdQLMTWaYE4= |

合计 12 个文件，24,507,964 字节（23.4 MiB）。

- 语言包档位：best_int（v5.1.1 默认数据档，与 LSTM 核心配套）
- **语言包存放形态**：jsdelivr 源为 `.traineddata.gz`，仓库内为**解压后的 `.traineddata`**（上表哈希为解压后内容）。
  原因：AGP 的 mergeDebugAssets 会剥离 `.gz` 扩展名并自行压缩，导致 tesseract.js 请求 `.traineddata.gz` 时 404；
  存放解压后原始格式后，浏览器与 APK 两端行为一致（ocr.js 对内置语言传 `gzip:false`）。
- tesseract.js 与 core 均为 Apache-2.0；语言包数据源自 tesseract 官方 tessdata
- 公式不走本地 OCR（tesseract 不识别公式），需要公式转写时用「云端视觉模型」引擎
