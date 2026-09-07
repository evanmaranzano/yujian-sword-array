# -*- coding: utf-8 -*-
"""把当前项目完整代码与产出汇编成单文件交付文档。
用法: .venv/Scripts/python.exe tools/build_delivery.py
注意：二进制 vendor（postprocessing/three addon/glTF/woff2/wasm/模型）不内嵌，
仅在第五章列清单；新增/删除 js 文件后必须更新本脚本的 WEB_FILES。
"""
import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "隔空御剑-完整交付.md"
TODAY = datetime.date.today().isoformat()

WEB_FILES = [
    ("web/index.html", "html"),
    ("web/run_web.bat", "bat"),
    ("web/js/config.js", "js"),
    ("web/js/fx.config.js", "js"),
    ("web/js/lock.js", "js"),
    ("web/js/tracking.js", "js"),
    ("web/js/fx/volley.js", "js"),
    ("web/js/gesture.js", "js"),
    ("web/js/main.js", "js"),
    ("web/js/core/bus.js", "js"),
    ("web/js/fx/audio.js", "js"),
    ("web/js/fx/director.js", "js"),
    ("web/js/fx/environment.js", "js"),
    ("web/js/fx/hero.js", "js"),
    ("web/js/fx/particles.js", "js"),
    ("web/js/fx/postfx.js", "js"),
    ("web/js/fx/reticle.js", "js"),
    ("web/js/fx/trail.js", "js"),
    ("web/test/lock.test.mjs", "js"),
    ("web/test/swipe.test.mjs", "js"),
    ("web/test/gesture.test.mjs", "js"),
]
PY_FILES = [
    ("yujian/__init__.py", "py"),
    ("yujian/config.py", "py"),
    ("yujian/lock.py", "py"),
    ("yujian/swipe.py", "py"),
    ("yujian/tracker.py", "py"),
    ("yujian/effects.py", "py"),
    ("yujian/audio.py", "py"),
    ("yujian/main.py", "py"),
    ("tests/smoke.py", "py"),
    ("tests/lock_check.py", "py"),
    ("tests/camera_check.py", "py"),
    ("tests/soak.py", "py"),
]


def code_block(path, lang):
    text = (ROOT / path).read_text(encoding="utf-8")
    return f"### `{path}`\n\n```{lang}\n{text}\n```\n"


parts = []
parts.append(f"""# 隔空御剑 · 万剑归宗 — 完整交付文档

> 生成日期：{TODAY}
> 项目：展厅实时手势御剑系统（纯本地离线、无外网依赖）
> 本文档为单文件代码交付：包含 Web 主版本与 Python 参考/回归版全部源码、vendor/素材清单、
> 验证方法与第一轮审查报告。**二进制依赖（vendor/模型/字体/wasm）随仓随包，不在此内嵌**。

---

## 一、项目概览

**目标**：观众无穿戴设备，空手挥手实时驱动大屏御剑特效；公共展厅多人轮流体验、7×24 无人值守。

| 版本 | 技术栈 | 定位 |
|---|---|---|
| **Web 版（主版本，v4 表现层重构）** | Three.js r185 + MediaPipe Tasks Vision 1.0.1；CC0 glTF 剑模 InstancedMesh；pmndrs/postprocessing 选择性辉光；SlashSaber CC-BY-4.0 ribbon 拖尾；OFL 霞鹜文楷子集 | 展厅部署形态 |
| Python 版 | pygame + MediaPipe Python + 状态机 | v1 参考实现 + 无头回归/标定载体（视觉冻结，不再跟进重构） |

**视觉（墨韵金辉）**：墨黑穹顶/多层雾融远山/底部云海/月相明月/远雾竖排诗句；
平时三层「天幕剑阵」在远空缓转（不聚中心球）；锁定时本命剑 z 向纵深飞入手中，
疾挥则环中调剑 → 雁行集结 → 分波飞越屏幕 → 转向归阵，领头剑带 ribbon 剑气。

**交互脑（两版同一算法，lock.js / lock.py）**：手在中心交互区驻留 0.2s 锁定第一个人；
锁定后帧间位移连续性关联，围观/凑近/交接跳变帧一律拒绝，丢失 0.5s 才释放；
挥舞检测器只吃已接受帧，且 reset 后需 4 点重新武装（防恢复期抖动假齐发）。
锁三态（idle/candidate/locked）透出给表现层做金环收敛与"劍來"法阵反馈。

**第三方许可**：见仓内 `THIRD-PARTY-LICENSES.md` 与 `web/vendor/LICENSES/`（three=MIT、
postprocessing=Zlib、SlashSaber TrailRenderer=CC-BY-4.0、MediaPipe=Apache-2.0、
霞鹜文楷=OFL-1.1）。剑体为程序化能量光剑（无外部模型资产）。

---

## 二、快速运行

### Web 版

```bash
cd web
python -m http.server 8000 --bind 127.0.0.1
# 浏览器打开 http://127.0.0.1:8000/ ，允许摄像头权限（localhost 只问一次）
```

- `?demo=1` 无摄像头演示（脚本化挥手）；`?demo=1&t=1.9` 预滚并冻结在 1.9s（确定性截图）
- `?debug=1` 显示 FPS/追踪读数、摄像头预览，启用 S 截图/M 镜像；`?kiosk=1` 隐藏指针
- `F` 全屏；普通观众界面无任何调试元素

### 验证（无需摄像头）

```bash
# Web：锁/挥舞检测器常驻测试（node 内置 test runner）
node --test web/test/lock.test.mjs web/test/swipe.test.mjs

# Python：会话锁 19 项断言
python -m tests.lock_check
# 固定虚拟时钟烟雾测试（方向断言 + 截图）
SDL_VIDEODRIVER=dummy python -m tests.smoke
# 无头烤机（观众循环：会话/齐发计数/内存）
SDL_VIDEODRIVER=dummy python -m tests.soak --seconds 20
# 标定管线自检
python -m tests.camera_check --selftest
```

### 真机现场标定（Python 3.12 venv + mediapipe + 摄像头）

3/4/5m × 成人/儿童逐站位采集，指标追加 tests/calib_log.csv，退出码 0/1/2：

```bash
python -m tests.camera_check --label 4m-adult --duration 30 --require-hand
```

---

## 三、Web 版完整代码（主版本）
""")

for f, lang in WEB_FILES:
    parts.append(code_block(f, lang))

parts.append("""---

## 四、Python 版完整代码（v1 参考实现 / 无头回归与标定载体）
""")

for f, lang in PY_FILES:
    parts.append(code_block(f, lang))

parts.append("""---

## 五、第三方依赖与素材清单（全部随仓 vendor，纯离线）

```
web/vendor/three/three.module.js, three.core.js     # three r185（MIT）
web/vendor/three/jsm/utils/                        # BufferGeometryUtils、SkeletonUtils（MIT）
web/vendor/three/jsm/postprocessing/, shaders/      # 旧 EffectComposer 链保留（新链改用 pmndrs）
web/vendor/postprocessing/index.js                  # pmndrs/postprocessing v6.39.4 预构建 ESM（Zlib，零依赖）
web/vendor/mediapipe/vision_bundle.mjs + wasm/      # @mediapipe/tasks-vision 1.0.1（Apache-2.0）
web/vendor/mediapipe/hand_landmarker.task
web/vendor/LICENSES/                                # 六个许可证全文 + KayKit CC0 + OFL
web/assets/fonts/yujian-kai-Regular.woff2, -Medium.woff2                        # 霞鹜文楷子集（OFL，~40KB/字重）
```

重新获取（仅联网备查；交付包内已齐）：

```bash
# three r185 addons（MIT）：examples/jsm/utils/{BufferGeometryUtils,SkeletonUtils}.js
# postprocessing（Zlib）：npm postprocessing@6.39.4 的 build/index.js（peer three>=0.168 <0.186）
# SlashSaber（CC-BY-4.0）：src/game/libs/TrailRenderer.ts（移植见 web/js/fx/trail.js 文件头署名）
# 霞鹜文楷 Lite（OFL-1.1）：pyftsubset 按实际用字子集化
```

Python 依赖：`pip install mediapipe==1.0.1 opencv-python pygame-ce numpy`（Python 3.9–3.12；3.14 无 wheel）。

---

## 六、调参速查（现场联调）

| 需求 | 改哪里 |
|---|---|
| 挥手太难/太易触发 | `web/js/config.js` 的 `swipeHi`（0.75）/`swipeLo`（0.30）；改后与 `yujian/config.py` 同步并重跑测试 |
| 齐发剑数/留屏时间 | `web/js/fx.config.js` → `volley.burstCount`（132）、`fireLife`（1.7–2.5s）、`fireSpeed` |
| 天幕剑阵规模/颜色 | `fx.config.js` → `volley.ringCounts/ringRadius/ringScale` 与 `volley.js` 实例色 |
| 辉光强度 | `fx.config.js` → `bloom.intensity/luminanceThreshold`（选择性辉光只作用于剑/法阵） |
| 拖尾宽度/长度 | `fx.config.js` → `hero.trailWidth/trailLength`、`volley.trailLeads` |
| 锁定灵敏度 | `config.js` 的 `lockDwell/lockMaxJump/lockRoi`（须与 config.py 同步，参数依赖真机标定） |
| 4K 显存预算 | `fx.config.js` → `maxDeviceLongEdge`（默认 3200 设备像素）、`maxDpr`（1.75），后处理 MSAA 已关 |
| 展厅全屏/静音 | kiosk 启动器（Edge/Chrome `--kiosk --autoplay-policy=no-user-gesture-required`），音频启动即建 |

---

## 七、产出一：现状审查报告（第一轮只读审查，全文）

""")

parts.append((ROOT / "docs/01-现状审查与待确认清单.md").read_text(encoding="utf-8"))

parts.append("""

---

## 八、说明

- 后续审查报告（docs/02–04）、HANDOFF.md 在仓内随附，不嵌入本单文件；
- 视觉与交互的已知现场待办（3–5m 标定、部署 kiosk、追踪自愈）以 docs/04 路线图为准；
- 改任何源码后重跑本脚本，保证内嵌快照与磁盘一致；新增 js/py 文件必须登记上方清单。
""")

OUT.write_text("".join(parts), encoding="utf-8")
print(f"written: {OUT}  ({OUT.stat().st_size} bytes)")
