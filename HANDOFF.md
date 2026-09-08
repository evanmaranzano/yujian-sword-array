# 交接文档（HANDOFF）

> 写给一个完全没有上下文的新会话。读完本文件即可继续工作。
> 最后更新：2026-09-08（v6c：跟手阵心、剑指小剑云团、摄像头骨骼 HUD、八卦八门、捧起判定，见 9.7）

---

## 0. 当前状态速览（2026-09-08，以本节为准，历史章节仅备查）

- **是什么**：展厅实时手势御剑「隔空御剑 · 万剑归宗」Web 版（Three.js + MediaPipe，纯本地离线），Python v1 备用版仅作无头回归/标定载体。
- **在哪**：`C:\Users\Administrator\Desktop\yujian-v6-work`（git = GitHub `evanmaranzano/yujian-sword-array`）。
- **版本**：v6c。底座仍是 sword-control 手势/阵型 + 三件自有增强（会话锁、挥手齐发、自适应画质）。相对 v6b 的用户向改动：有人时阵型中心跟手（无锁定光圈）；剑指=300 把小剑拼剑形（互不共点）；左上角摄像头+骨骼、底部手势名、左下角手势表（`?kiosk=1` / `?demo=1` 隐藏）；双拳=八卦八门；双手捧起改为张开+指尖内扣（不再被「交叉」抢走）。无人待机仍是漫天飞剑。
- **怎么跑**：`web\run_web.bat`（必须 `tools/serve.py`，Chrome 优先全屏）。勿用 `python -m http.server`（.mjs MIME 拒载 MediaPipe）。本机摄像头 Logi C270。
- **怎么验**：`node --test web/test/*.mjs`（手势 13 + 锁 8 + 挥舞 4）；Python `.venv`：`lock_check` / `smoke` / `camera_check --selftest`；阵型截图 `?demo=1&t=11&gesture=<名>`。`bash tools/verify_v6.sh` 一键（含无头截图）。
- **机器**：Win11 / Administrator；Python 一律项目根 `.venv`（勿用 Anaconda）；node v22.23.2；浏览器优先 Chrome。
- **等什么**：现场标定（H4/H8，venv 尚未装 mediapipe）→ kiosk 部署（H3）→ 72h 烤机。

---

## 1. 我们在做什么任务

**项目**：展厅实时手势交互御剑系统「隔空御剑 · 万剑归宗」。
观众空手挥手（无穿戴），实时驱动大屏 3D 御剑特效。甲方已确认的硬约束：

- 展厅大屏电脑投屏全屏即可；观众距屏 **3–5m**；普通展厅灯光；**无外网、纯本地**
- **7×24 无人值守**；单次单人，**"以第一个锁定的人为准"，肯定会有围观群众**
- "人类都可以"（含儿童、身高跨度大）；**往哪挥手剑光往哪飞**；纯特效无玩法
- 仙侠"万剑归宗"风格；版权归甲方公司

**工作方式**：

- 当前工作区：`C:\Users\Administrator\Desktop\yujian-v6-work`（2026-09-08 起；GitHub `evanmaranzano/yujian-sword-array` 的 git clone，**是 git 仓库**）。历史工作区 `Desktop\yujian44.5new\隔空御剑`（v4 旧副本）与 `Desktop\gaze\隔空御剑`（v4 时代路径，已不存在）均勿再用。
- **改动暂未 commit/push**（用户验收后推 GitHub）；参考仓 `Desktop\_ref-sword-control`（WoyouWoyou/sword-control MIT，只读参考，勿改）。
- 历史工作方式（Autocase 平台本地任务）：产物由用户本人在评测页上传，勿用 curl/TOS 上传、勿读平台凭据。

**任务阶段**：
1. 第一轮：纯文档现状审查（`docs/01-现状审查与待确认清单.md`，含甲方口头答复）→
2. 已完成 demo 实现（Web 主版本 + Python 备用版）→
3. 第二轮：多代理深度只读审查（`docs/02-多代理深度只读审查报告.md`）→ C1（会话锁）修复完成 →
4. 第三轮：**C1 修复后复评的多代理深度只读审查**（10 代理/418 次工具调用，`docs/03-第三轮多代理深度只读审查报告.md`，已完成）→
5. 按 docs/03 路线图修复：C1（会话锁）已完成、**H1 已完成（camera_check 重写为现场标定工具 + 新增 tests/soak.py 烤机脚本）**；
6. **用户演示评审（2026-09-04，方向变更，见第 7 节）**：用户看完 Web demo 后明确反馈——**"太丑了，整个前端都需要重构"**；指示**下一轮审查的重点改为：用多代理 workflow 系统调研相关开源项目，直接借鉴别人成熟的前端代码**来重构前端。本轮仅记录、不处理。

---

## 2. 代码库地图（v6b 现状）

两套实现，**语义不等价**；交互阈值（config.js/config.py）两版同值，表现层 Web 独走：

| 部分 | 文件 | 说明 |
|---|---|---|
| Web 主版本（部署形态，v6b） | `web/index.html`、`web/js/{config,fx.config,gesture,lock,tracking,main}.js`、`web/js/fx/{audio,director,environment,hero,particles,postfx,reticle,trail,volley}.js` | Three.js r185 + MediaPipe tasks-vision（双手）+ postprocessing 选择性辉光，全本地 `web/vendor/`；表现层动画复刻 sword-control（见 §9.6） |
| Python 备用版（v1） | `yujian/{config,lock,tracker,swipe,effects,audio,main}.py` | pygame+mediapipe+opencv；收手后位移触发；无头回归/标定载体（视觉冻结） |
| 测试 | `web/test/{gesture,lock,swipe}.test.mjs`（node 单测 12+8+4）、`tests/smoke.py`、`tests/lock_check.py`（19 断言）、`tests/camera_check.py`（现场标定工具+--selftest）、`tests/soak.py`（无头烤机） |
| 文档 | `HANDOFF.md`（本文件，权威入口）、`docs/01-05`（历史审查报告）、`隔空御剑-完整交付.md`（build_delivery.py 生成物）、README |
| 工具 | `tools/serve.py`（**启动必须用它**，http.server 的 .mjs MIME 会拒载 MediaPipe）、`tools/build_delivery.py`（改源码后重跑交付 md）、`tools/verify_v6.sh`（一键全量验证） |

运行/验证：

```bash
web\run_web.bat            # 一键启动（serve.py + Chrome 优先全屏）
# 无头截图（位形阵 t≥11 等齐发剑群归阵；动态阵中途冻结）：
#   http://127.0.0.1:8000/?demo=1&t=11&gesture=TWO_FINGERS
bash tools/verify_v6.sh    # 语法 + node 单测 + Python 回归 + 13 张无头截图
# Python 无头回归（.venv 已含 pygame-ce/opencv/numpy）：
.venv/Scripts/python.exe -m tests.lock_check
SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy .venv/Scripts/python.exe -m tests.smoke
# 真机现场标定（需摄像头；指标写 tests/calib_log.csv）：
.venv/Scripts/python.exe -m tests.camera_check --label 4m-adult --duration 30 --require-hand
```

---

## 3. 已完成什么

### 3.1 第二轮多代理只读审查（全部结论已核实）

12 个代理（6 维度审查 + 6 个对抗验证，319 次源码工具调用），60 条发现 0 条被证伪。
**完整结论在 `docs/02-多代理深度只读审查报告.md`**，分级摘要：

- 🔴 **C1（critical，已修复）**："第一个锁定的人"未实现，围观可夺控且诱发假齐发
- 🔴 **H1–H7（high，均未修）**：
  - H1 `tests/camera_check.py` 访问不存在的 `tr.speed/tr.swipe`，见手即 AttributeError，且无 assert（无人手时假通过）；全项目无任何量化验收工具
  - H2 追踪无自愈：推理抛错 rAF 链永久死亡；相机冻结时 present 永久锁 true；HUD 仍显"追踪中"；Python 线程同样无异常防护
  - H3 7×24 部署套件零实物（kiosk/看门狗/自启/免弹窗/重启只有文档承诺，`web/run_web.bat` 只是普通浏览器窗口）
  - H4 3–5m 可行性零验证（640×480 掌宽估算仅 10–12px；README 建议"换广角"方向是**错的**，应长焦/1080p+ROI 裁剪）
  - H5 4K+Windows 缩放下 HalfFloat+MSAA4 后处理显存粗算 1.9–3.4GB，无设备像素封顶（`main.js:23,43-51`；`samples=4` 的 try/catch 是假保护）
  - H6 kiosk 纯挥手时音效**必然无声**：AudioContext 只在 pointerdown/keydown 创建（`main.js:77-101`）
  - H7 初始化失败只有一行英文小字，无重试无中文遮罩；模块加载失败永久"启动中…"
- 🟡 中优先级（报告第四节，未修）：本命剑 `age` 累积导致离开停留恒不生效（`swords.js:287-297`，**确定 bug**）、斜挥方向偏约 16°（`main.js:72-74,168` 未做宽高比换算）、冷却吞手势、遮挡/冻结帧伪齐发三来源、6 个死配置（`bloomStrength/bloomRadius/bloomThreshold/swordLife/emitSpeed/swipeMinDist` 无消费，调参表却教调它们）、30/60fps 喂点污染、预览窗常驻、截图键大概率黑图、afterimage damp 不随 dt、无 Worker、两版漂移、引导字号 3–5m 不可读、LICENSE 缺失、无 requirements 锁定等。

### 3.2 C1 修复（本次会话完成，已验证）

新增**手部会话锁**，两版同算法同参数：

- 新文件 `web/js/lock.js`、`yujian/lock.py`：状态机 `empty→candidate（中心 ROI 驻留 0.2s）→locked`；
  锁定后按帧间跳变 ≤0.22 做连续性关联，大跳变（换人/误检）拒绝；掌尺度 >0.40（凑近镜头）拒绝；
  0.5s 无可接受帧才释放；短遮挡原位重现保持锁定、他处重现拒绝；新会话/遮挡空档清空挥舞速度历史。
- 集成：`tracking.js` 只把"已接受帧"喂 SwipeDetector（换人跳变无法再伪造齐发）；`tracker.py` 线程内挂锁、暴露 `session_id/vel_reset_seq`；`main.py` 两路径（无头 App 层锁 / 真机消费 tracker 锁）按 token 重建 SwipeDetector；两版 M 翻镜像都释放会话。
- 参数：`config.js` 的 `lock*` 与 `config.py` 的 `LOCK_*`（含 `lockEnabled=False` 调试旁路）。
- 文档/交付：两级 README、`build_delivery.py` 清单已更新，《隔空御剑-完整交付.md》已重新生成（132501 字节，含全部新代码）。
- tracker.py:50 原虚假注释"num_hands=1，第一个锁定的人（围观不干扰）"已更正。

**验证结果**：
- `python -m tests.lock_check.py` 19/19 通过（驻留/区外/跳变拒绝/0.2s 不夺控/0.5s 释放+新会话/遮挡保持/远处重现拒绝/大掌/30fps 快挥/reset/齐发联动）
- `tests.smoke` 回归 PASSED（镜像方向断言仍成立）
- JS：node 单测 14/14（临时文件已删）；6 个模块 `node --check` 通过
- Edge swiftshader 无头截图：t=0.5 待机 / t=1.3 锁定后"剑来" / t=1.9 齐发 250 剑光 / t=5.8 释放回待机（截图临时目录已删）

### 3.3 第三轮审查（docs/03）与 H1 修复（本次会话完成，已验证）

第三轮 10 代理复评结论在 `docs/03-第三轮多代理深度只读审查报告.md`（C1 复评 + 三处翻案：H5 像素前提、斜挥角度 53.1°/36.9°/分裂 16.3°、Rings 掐环不可达；锁残余盲区 L1–L12）。随后完成 P0-1（H1）：

- **`tests/camera_check.py` 重写**为现场标定工具（旧版见手即 AttributeError、二次开相机、空转假通过，已全部修掉）：
  - 单路采集（截图取追踪线程帧，不再二次 `VideoCapture`）；自建 `CalibAnalyzer` 按 main.py 同款 token 重建 SwipeDetector 数齐发事件；try/finally 释放相机；
  - 指标：原始检测率、锁定率/会话数/首次获锁耗时、掌宽像素 min/p50/p95/max、掌心 y 分布、手速 p50/p95/max、最长连续丢失段；`--label` 打标签、指标追加 `tests/calib_log.csv`；
  - 退出码 0=达标 / 1=指标未达（`--require-hand` 见手率、`--min-fps`）/ 2=环境不可用（无 mediapipe/相机）；`--selftest` 合成数据自检（本机 3.14 可跑，**已验证 8/8 通过**）。
- **`tests/soak.py` 新增**：无头烤机，脚本化观众循环（7s 周期复用 smoke 脚本）长跑；断言齐发计数/会话切换与脚本时刻严格一致、异常即失败、内存（tracemalloc + 可选 psutil RSS）增长门限；`--seconds/--minutes/--hours/--csv/--draw-every`；期望计数按事件时刻上限算（部分周期也正确）。
- **`yujian/tracker.py`** 暴露 `raw_seen/raw_palm/raw_x/raw_y/last_frame/frame_w/frame_h`（标定单路取数用，纯新增）。
- 文档：根 README 验证段/结构表/参数名/相机方向（广角→窄角长焦）已修正；`build_delivery.py` 补 soak.py、`yujian/__init__.py` 进清单、日期改动态 `date.today()`、验证段重写；《隔空御剑-完整交付.md》已重生成（**155611 字节**，含全部新代码，日期 2026-09-04）。

**验证结果**：`camera_check --selftest` 8/8 PASS；无 mediapipe 下真机模式退出码 2（旧版为 0 假通过）；`soak --seconds 16` PASSED（齐发 5=期望 5、会话 3=期望 3、内存增长 0.0–0.3%）；回归 `lock_check` 19/19、`smoke` PASSED（镜像方向断言仍成立）。

---

## 4. 当前卡在哪 / 状态

## 4. 当前卡在哪 / 状态（2026-09-08）

**不卡，等用户真机复验。** v6b 已完成：剑指过曝/光柱修复、手势判定与阵型逐项复刻 sword-control、
待机漫天飞剑、自适应画质（CPU-only 兜底）、demo/无头模式与 .mjs MIME 两个历史阻断修复；
node 24/24、lock_check 19、smoke、camera_check selftest、soak、13 张阵型截图全部通过。

**已具备但未验证**：本机有摄像头（Logi C270 HD WebCam，09-08 核实——旧记录"无摄像头使用条件"
作废；浏览器端 MediaPipe 可直接真机试）。用户已在 Edge/Chrome 各体验过一轮并给出两轮反馈。

**下一步排序**：
1. 用户真机复验 v6b 手势手感与观感（Chrome 全屏，`web\run_web.bat`）；按反馈微调。
2. 现场标定（3–5m 成人/儿童、双人入画）：`.venv` 装 mediapipe 后跑 `tests/camera_check --label ...`
   （本机 venv 目前只有 pygame-ce/opencv/numpy，未装 mediapipe），据数据收窄
   lockMaxJump/swipeHi/lockRoi（docs/03 H4/H8）。
3. CPU-only 笔记本实测帧率（`?debug=1` 看 FPS 与 Q 档位），确认自适应降级链路。
4. 验收后 commit + push GitHub；展厅 kiosk 部署实物（docs/03 H3：任务计划/看门狗/电源策略）。
5. 72h 烤机（tests/soak）与 docs/03 验收基线（≥55fps、误触≤1次/5min、双人 0 误夺控）。

---

## 5. 踩过的坑（绝对不要再踩）

1. **本机环境（2026-09-08 核实）**：Windows 11。**Administrator 新机**（26566 旧机已弃用）：PATH 默认 python=Anaconda 3.11（有坑 14，不可用），Python 统一走项目根 `.venv`（uv CPython 3.14.3 + pygame-ce 2.5.8 + opencv-python 5.0.0.93 + numpy 2.5.3，自包含）；Python 版 mediapipe 未装（`import mediapipe` 走 `_MP_OK=False` 静默降级，现场标定时装进 .venv，别装进 Anaconda）；node v22.23.2；**摄像头：Logi C270 HD WebCam（可用，旧记录"无摄像头"作废）**；**浏览器：用户两次确认（2026-09-07/09-08）一律优先 Chrome，Edge 兜底**。Chrome 在 `C:\Program Files\Google\Chrome\Application\chrome.exe`（此前记录『新机只有 Edge』已过时，曾导致误用 Edge 启动）。run_web.bat 探测链 Chrome(x64/x86/用户) → Edge → 系统默认。无头测试用 dummy SDL 驱动即可。
2. **`tests/camera_check.py` 已重写（H1 已修，2026-09-04）**：旧版引用不存在的 `tr.speed/tr.swipe` 见手即崩、二次开相机、空转假通过，全部修掉；现在是现场标定工具（检测率/掌宽像素/手速/掌心 y/丢失段/齐发数，CSV 输出，退出码 0/1/2），另有 `--selftest` 合成自检（本机可跑）。真机标定用法见 README 验证段与 docs/03 P0。注意：它仍需 Python 3.12 venv + mediapipe + 摄像头，本机 3.14 只能跑 `--selftest`。
3. **smoke.py 的时间是墙钟不是虚拟时钟**：`t = time.time()-t0`，截图时刻会抖动；但断言基于 update 计数、确定性可复现。写新无头测试请像 `lock_check.py` 一样用固定步长 `i/60` 驱动。
4. **Edge 无头截图的正确姿势**（Chrome 同理）：
   - 必须用 `timeout 50 edge ...` 外包，否则 swiftshader 下进程可能不退出，会把整条 Bash 调用拖到超时被杀；
   - 每次调用给独立 `--user-data-dir=/tmp/edge-prof-$t`；
   - flags：`--headless=new --enable-unsafe-swiftshader --use-angle=swiftshader --window-size=1280,720 --virtual-time-budget=4000`；
   - `--screenshot=` 要给 **Windows 路径**；
   - http.server 用 run_in_background 方式启动（命令里 `&` 后台 + 超时会连服务器一起被杀）。
5. **驻留时间不能长**：lock 初版 `lockDwell=0.30` 会吃掉 demo 挥手（0.5s 段）前 0.3s，Python v1 剩余位移 0.064 < `SWIPE_MIN_DIST=0.07` 导致 smoke 失败。已定为 **0.20s**（30fps 6 帧），改它必须两版同步并重跑 smoke + lock_check。
6. **两版挥舞语义不同，别互相套用**：Web 上升沿瞬时方向触发、无位移门槛（`swipeMinDist` 在 Web 是死配置）；Python 收手结算、有 0.07 位移门槛。齐发时刻在 demo 脚本里约为 1.6s / 2.75s（停手后一个速度窗口），不是挥手进行中。
7. **MediaPipe `numHands=1` 不是身份锁**：VIDEO 模式内部跟踪片段内有粘性，只在丢跟踪/重检测边界可能换人——表述机制时用这个准确说法；真正的锁定必须应用层做（已由 lock.js/lock.py 实现，勿回退到"设了 numHands=1 就行"）。
8. **死配置陷阱**：改 `config.js` 的 bloom/emitSpeed/swordLife/swipeMinDist 不会有任何效果（main.js 硬编码）；报告 M2-1 未修，调参前先 grep 消费点。同理根 README 里的 `SWIPE_SPEED_THRESHOLD` 参数名是错的（实为 SWIPE_HI/SWIPE_LO）。
9. **改任何源码后重跑** `python tools/build_delivery.py`，否则《隔空御剑-完整交付.md》里的代码快照是旧的（审查时就发现过内嵌 main.js 与磁盘不一致）。该构建器用显式文件清单，新增文件记得加进 WEB_FILES/PY_FILES。
10. **临时文件用完即删**：node 测 ESM 可把 .js 复制成 /tmp/x.mjs 再 `node --check`；测试脚本/截图不要留在 `web/js/`、工作区根（交付构建器虽是白名单，但保持干净）。
11. 审查阶段是严格只读的；现在是修复阶段，可以改代码，但每改一处跑对应回归（lock_check + smoke + JS node 检查 + 无头截图）。
12. `?demo=1&t=x` 预滚模式时钟会回跳、输入冻结（已知 low 级问题），只供截图，不要当挂机演示页用。
13. **IDM 劫持 .bin**：本机（Administrator）装有 IDM，其 Edge 浏览器集成按扩展名劫持 .bin 请求
    （204 Intercepted），GLTFLoader 报「Failed to load buffer」而服务端日志是 200。已改单文件
    .glb 规避（见 8.6）；排查同类问题用 `--enable-logging=stderr` 抓 console，报错文案会写
    "Intercepted by the IDM Advanced Integration"。
14. **默认 python 不可用于本仓库测试**：PATH 上 `python`=Anaconda 3.11，其用户 site-packages
    有第三方顶层 `tests` 包遮蔽本地 tests/（命名空间包输给 site-packages 常规包）；
    用项目根 `.venv/Scripts/python.exe`（3.14.3 + pygame-ce/opencv/numpy），verify_v4.sh 已自动探测。

---

## 7. 用户评审反馈与下一轮方向（2026-09-04，最高优先级，覆盖原路线排序）

### 7.1 用户原话与决定

- 演示 Web demo（`http://127.0.0.1:8000/?demo=1`）后反馈：**"太丑了，整个前端都需要重构"**。
- 指示：**下一次审查的重点 = 多代理 workflow 调研相关开源项目，直接借鉴别人的前端代码**。
- 用户明确"你无需处理"——本节只做交接记录，代码不在本轮动。

### 7.2 关于"没有启动摄像头"的说明（非 bug，下次演示注意）

- `?demo=1` 是**无摄像头脚本化演示模式**（设计如此，供无头截图/无设备演示），不会请求摄像头。
- 要看真摄像头：浏览器直接开 `http://127.0.0.1:8000/`（不带参数），Edge 会弹摄像头权限，允许后即真机追踪（Web 版 MediaPipe 是浏览器内 wasm，**不依赖 Python 侧 mediapipe**，本机 Edge 可直接跑）。
- 演示启动坑（本次踩过）：8000 端口可能有历史残留 python http.server 半死进程绑 0.0.0.0/IPv6，Edge 访问 localhost（优先 IPv6）会 ERR_EMPTY_RESPONSE；起服务前先 `netstat -ano | findstr :8000` 清掉旧进程；URL 用 `127.0.0.1` 比 `localhost` 稳。

### 7.3 下一轮任务定义：多代理开源调研 → 前端重构

**形态**：第四轮审查 = 多代理并行调研 workflow（不是继续逐行审现有代码；docs/03 的 P0 后端/部署项仍然有效但排序让位于前端重构）。

调研目标：为"整个前端重构"找到可直接借鉴（许可证允许商用）的成熟开源前端实现，产出对比评估与借鉴方案。建议调研维度（每个代理一个方向）：

1. **同类手势御剑/剑阵项目**：GitHub 上 three.js/WebGL + MediaPipe 手部追踪的剑阵/光剑/挥砍特效项目（已知起点：`sunG91/wjgz`（three+InstancedMesh+MediaPipe Worker，无 LICENSE 仅参考架构）、`WoyouWoyou/sword-control`（MIT，本项目光剑思路来源）、`honzaap/SlashSaber`（**CC-BY-4.0 可商用署名**，生产级挥砍拖尾）；CSDN「web手势剑阵」400 剑方案）——找更多：搜 "mediapipe hand three.js sword / slash / blade / gesture particle"、"手势 剑阵/剑气/万剑" 等。
2. **光剑/拖尾/刀光特效**：Shader 火焰刀光、GPU 粒子拖尾、ribbon/trail mesh、后处理链（bloom/glow/chromatic）的高质量参考（Fiery Slash Shader Godot MIT、Shadertoy 仅学算法**默认 CC BY-NC-SA 不可商用**）。
3. **3D 剑模/仙侠素材**：CC0 低模武器包（KayKit Fantasy Weapons、Quaternius）、Kenney 粒子/光效贴图 CC0；glTF 剑模替换程序化圆柱剑的方案。
4. **MediaPipe 手部交互工程范本**：Worker 化推理、多手/手部光标、UI 引导（站位/锁定反馈）的成熟 demo（Kazuhito00 系列 Apache-2.0、MediaPipe 官方 hand landmark 范例）。
5. **大屏 kiosk 视觉/UI 范式**：暗场仙侠/能量体视觉、4K 大字引导、全屏 shader 背景的 awwwards 级开源范本（注意授权）。
6. **性能架构**：GPU 粒子（GPGPU）、InstancedMesh 上限实战、后处理显存控制（对接 docs/03 H5 的 4K 预算）。

**许可证红线（沿用 docs/02 7.3，调研时必须逐项核实）**：无 LICENSE 文件 = 默认 All rights reserved 不可抄代码；CC BY-NC-SA（Shadertoy 默认）不可商用；可借鉴代码优先 MIT / Apache-2.0 / CC0 / CC-BY（署名）；每个候选记录：仓库、星数/活跃度、许可证、技术栈、可借鉴点、可直接搬用的模块、与本项目（纯本地 vendor 化、无外网）的适配成本。

**调研产物建议**：`docs/04-前端重构开源调研报告.md`——候选清单对比表（视觉效果截图/链接、许可证、技术匹配度、借鉴方式：直接移植/参考改写/仅学思路）、推荐的重构技术方案（保留现有 lock.js/tracking 锁逻辑与 MediaPipe 链路？还是连交互层一起换——注意会话锁 C1 成果与 H1 标定工具是已验证资产，重构时应保留逻辑、替换表现层）、分阶段重构计划。

**重构边界提示**（给下一轮）：
- 已验证、重构时应**保留逻辑**的资产：`web/js/lock.js` 会话锁（19 项测试守护）、`tracking.js` 的锁接线与视频帧门控、`config.js` 参数体系、`tests/lock_check.py` 与新 `camera_check.py`/`soak.py` 工具链；
- 重构对象主要是**表现层**：`scene.js`（夜景）、`swords.js`（剑形/粒子/拖尾/齐发观感）、`main.js` 后处理与 UI/引导（index.html HUD），以及整体美术风格（用户核心不满点）；
- 约束不变：纯本地 vendor（无外网 CDN）、4K 大屏、暗场、3–5m 距离可读性（字号/引导见 docs/03 M3-1）。

### 7.4 暂缓但仍有效的技术债（docs/03 P0，前端重构后/并行继续）

L1 锁墙钟化、H2 追踪自愈、H7 故障遮罩、H3 部署件、H6 kiosk 音频、H5 显存封顶、H4 现场标定（工具已就绪待真机数据）——前端重构落地后这些仍要做；若重构引入新架构（Worker/GPU 粒子），H2/H5 的实现方式需随新架构调整。

## 8. v4 表现层深度重构（2026-09-04，按 docs/04 路线落地，最大化复用开源）

> 用户指令："深度重构表现层，尽可能借鉴开源项目，不要自行重复造轮子"。已获用户显式批准下列外部来源（全部本地化）。

### 8.1 已 vendor 的开源资产（许可全文 web/vendor/LICENSES，根目录 THIRD-PARTY-LICENSES.md）

- pmndrs/postprocessing **v6.39.4**（Zlib，peer 兼容 r185）→ `web/vendor/postprocessing/index.js`：选择性辉光/暗角/颗粒/ACES
- three r185 addons（MIT）：`jsm/loaders/GLTFLoader.js` + `jsm/utils/{BufferGeometryUtils,SkeletonUtils}.js`
- KayKit Adventurers（**CC0**）：`web/assets/models/sword_1handed.*`、`sword_2handed_color.*`、`knight_texture.png`
- 霞鹜文楷 Lite（**OFL-1.1**）子集 woff2（~40KB/字重）→ `web/assets/fonts/`
- SlashSaber TrailRenderer（**CC-BY-4.0**，原算法 © Mark Kellogg）移植 → `web/js/fx/trail.js`（文件头有署名/改动说明）
- MediaPipe 补 Apache-2.0 LICENSE 文本

### 8.2 新架构（旧 scene.js/swords.js 已弃用，待删——新链验证后 rm）

- 交互脑保留并增强：`lock.js` 输出新增 `phase:'idle'|'candidate'|'locked'` 与 `cand` 驻留进度；
  `tracking.js` 新增 SwipeDetector reset 后 4 点武装（治 docs/04 N-LOCK-2 恢复期抖动假齐发，Python swipe.py 同步）、
  相机墙钟帧龄看门狗（stalled）、track ended/devicechange 监听 + restart()、健康回调 onHealth、
  getUserMedia 改 1280x720 ideal、被拒帧速度发布归零。
- 表现层：`js/fx/`（assets 加载/导演 director/墨韵环境 environment/万剑阵 volley/本命剑 hero/
  ribbon trail/锁定光标 reticle/鎏金粒子 particles/选择性辉光 postfx/音频 audio），`js/fx.config.js`
  表现参数（每条都有消费点，旧死配置已从 config.js 删除）。
- 视觉：天幕三层 252 剑缓转（不聚中心球，治 V1）；齐发=环中调剑→雁行集结→分波齐射（留屏 1.7–2.5s）
  →steering 归阵；本命剑 z 纵深飞入、全程限速、独立 leaveAge（治 N6/M-AGE）；金环收敛/劍來法阵；
  无 Afterimage、无全屏白闪、无跨屏肥皂泡；墨黑/鎏金/青釭蓝三色板；OFL 大字引导+站位剪影；
  像素长边封顶 3200、MSAA 关闭。
- 测试：`web/test/{lock,swipe}.test.mjs`（node --test，12 断言，含 N-LOCK-2 回归）。
  **运行**：`node --test test/lock.test.mjs test/swipe.test.mjs`（web/ 目录）。
- tests/smoke.py 已改固定虚拟时钟（治 N-TEST-1 flaky）。

### 8.3 验证状态（重要）

- 代码完成时恰逢沙箱权限分类器长时间不可用（所有非只读 Bash 被挡约 1.5h）。
- **已验证**：环境层截图 2 张（墨空/月/山/云海/诗句/引导气质正确，见会话记录）；
  字体子集初版覆盖 169 字（UI/demo 全覆盖；故障遮罩部分生僻字需最终子集 g2.txt 覆盖——
  重新子集命令用 /tmp/vend/dl/g2.txt，字体源 TTF 在 /tmp/vend/dl/LXGWWenKaiLite-*.ttf）。
- **恢复后必做（按序）**：
  1. 最终字体子集：`pyftsubset LXGWWenKaiLite-{Regular,Medium}.ttf --text-file=g2.txt --unicodes=U+0020-007E --flavor=woff2` 装到 web/assets/fonts/
  2. `node --test web/test/*.mjs`；`node --check` 全 js
  3. Python：`tests.lock_check`、`tests.smoke`（×3 确定性）、`tests.camera_check --selftest`、`tests.soak --seconds 12`
  4. `rm web/js/scene.js web/js/swords.js`（已无 import；旧 main.js 已替换）
  5. 起 `http.server --bind 127.0.0.1`，Edge swiftshader 冻结截图
     `?demo=1&t=0.4/1.35/1.6/1.8/1.95/2.4/4.0/5.8` + 1920/超宽，逐张调 fx.config 与 volley 编排
     （重点看：天幕剑阵可见度、集结/分波/归阵、ribbon、本命剑纵深、bloom 不过曝、云海）
  6. `python tools/build_delivery.py` 重生成（清单已更新为新文件，旧 scene/swords 已移出清单）
  7. 清理 /tmp/vend、截图临时目录、后台 http.server

### 8.4 代码完成后追加的静态修复（分类器长时间故障期间完成，待运行验证）

- trail.js：新 `advanceWorld(center,side)`（相机对向 ribbon，修复 orientation 模式宽度塌到运动线）；
  GLOW fragment 横截面透明度改为 sin 中脊实/两缘虚（原先写反）；GLOW vertex 用 modelViewMatrix。
- volley.js：SWEEP 剑补速度（朝向速度）；领头拖尾改调 advanceWorld，宽度取屏幕平面垂直向量；
  删未用变量；初始环阵矩阵/颜色即时写入（避免首帧原点鬼剑）。
- director.js：bloomTargets 改为遍历 Group 收集叶级 Mesh/Sprite/Points（postprocessing selection
  图层不向 Group 子节点传播，只加 group 会漏剑本体）。
- reticle.js：seal 法阵改用 group 本地坐标（原先世界坐标挂在移动 group 下会错位），「劍來」→「剑来」。
- postfx.js：SelectiveBloom 独立 EffectPass（DEPTH 属性与暗角/颗粒合并会冲突）。
- environment.js：诗句恢复五言（御劍乘風去/萬劍歸一宗/星垂闌干靜/月明海天闊）。
- fx.config.js：删未消费字段（blade/bladeDim/vermilion/idleSwordCount）。
- main.js/index.html/tracking.js：故障文案全部改用现有字体子集覆盖字（最终仍建议重建 g2 全量子集）。
- 17:22 的截图已证明新链可在无头 Edge 完整启动（glTF/postprocessing/选择性辉光均加载成功），
  上述追加修复在那之后，需重新截图确认。
- 集结参数：gatherTime 0.22→0.32、seek 增益 4dt→9dt、集结速度 46→64；万剑阵材质关雾并微染淡蓝；
  旧 scene.js/swords.js 已替换为弃用桩（零引用，可物理删除）。

### 8.5 一键验证（2026-09-05）

`tools/verify_v4.sh`（Git Bash；或双击 `tools/verify_v4.bat`）：JS 语法 → node:test 12 项
→ Python lock_check/smoke/camera_check selftest/soak → 字体全量子集（仅当 /tmp/vend 全量 TTF 还在）
→ Edge swiftshader 冻结截图 8 时刻+超宽 → build_delivery 重生成。
分类器恢复后第一步即跑此脚本；截图重点：天幕剑阵可见度、集结/分波/归阵、ribbon、本命剑纵深、
bloom 不过曝、云海与超宽不露底。

### 8.6 v4 验证完成 + 两个关键修复（2026-09-05， Administrator 新机）

verify_v4.sh 已跑出 **ALL VERIFIED**（node 12/12、lock_check 19、smoke、camera_check selftest 8、
soak 12s、9 张截图、交付文档重建）。跑通过程发现并修复两个阻断性问题：

**修复 1：模型资产改单文件 GLB（tools/pack_glb.py 新增）**。
本机 Administrator 装有 IDM（Internet Download Manager），其 Edge「高级浏览器集成」扩展
**按扩展名劫持 .bin 请求**（返回 204 Intercepted by IDM），GLTFLoader 加载外部 buffer 必挂，
boot 失败进「唤剑失败」遮罩（服务端日志仍是 200，极具迷惑性）。gltf+bin+png 已用
`tools/pack_glb.py` 打包成 sword_1handed.glb / sword_2handed_color.glb，旧 gltf/bin/png 已删，
assets.js 指向 .glb。**展厅部署机如也装 IDM，.glb 不在默认劫持名单，安全**；音频是
AudioContext 合成无文件，不受影响。

**修复 2：volley.js `Matrix4.compose` position/scale 共用同一临时向量 `_v2`**。
three 的 compose 最后才读 position（te[12..14]），scale 先覆写 `_v2` 会把位置覆盖成 scale 值，
252 把实例剑全部塌缩到 (s,s,s)——屏幕中央一坨"剑束海胆团"（旧截图全可证）。
已改专用 `_scl` 向量（两处调用点），修复后天幕剑阵三层椭圆铺满夜空、齐发/归阵编排完整成立
（截图 /tmp/v4shots/，视觉逐张检查过：待机/剑来/集结/分波/归阵/超宽全部正常）。

**本机环境差异（Administrator 新机，工作区已拷贝至此）**：
- 原 26566 工作区不在本机；系统默认 `python`=F:\Anaconda\python 3.11.5，其用户 site-packages
  装了某个第三方工具附带的**顶层 `tests` 包**，遮蔽本地 tests/（命名空间包输给 site-packages
  常规包）→ `python -m tests.*` 全挂「No module named tests.lock_check」。
- 解决：项目根新建 `.venv`（uv 基于 uv 管理的 CPython 3.14.3，装 pygame-ce 2.5.8 +
  opencv-python 5.0.0.93 + numpy）；verify_v4.sh 已改为自动探测可用 Python
  （$YUJIAN_PY → .venv → PATH python，探测标准=能 `import tests.lock_check`）。
- mediapipe 本机仍不可用（预期内，tracker 静默降级）；Python 跑测试用 `.venv/Scripts/python.exe`。
- Edge 无头截图抓 console 用 `--enable-logging=stderr`，报错行 grep "CONSOLE" 即得（本次定位利器）。

---

## 6. 建议的下一步顺序（原 P0 路线，已让位于第 7 节前端重构调研，保留备查）

1. ~~**H1**：修 `camera_check.py` 并升级为标定工具 + 烤机脚本。~~ **已完成（2026-09-04，见 3.3）**。
2. （现场，需真机）用标定工具跑 3/4/5m × 成人/儿童 + 双人干扰，据数据做 **H4**：相机选型（1080p 窄角/长焦而非广角）、安装标定、`lockRoi/lockCandidateTtl/lockMaxJump/swipeHi` 重定参。
3. **L1+H2+H7（代码侧，本机可做）**：锁超时改墙钟帧龄驱动（相机冻结/同帧卡死两版共 3 条路径都能释放报故障）；追踪链 try/catch + rAF 首行续期、冻结看门狗、track ended/devicechange 退避重连、contextlost 兜底 reload、CPU/软件渲染告警、中文故障遮罩、权限请求超时；Python 线程防护 + monotonic 时钟。
4. **H8 锁残余盲区**：据双人真机数据收窄 lockMaxJump、宽限重现多帧确认、计数式驻留抗闪烁、ROI 按掌心 y 分布放宽；两人入画回归脚本。
5. **H3+H6**：deploy/ 实物（kiosk 启动器/注册表免弹窗/任务计划/三层看门狗/电源策略/--bind 127.0.0.1）；AudioContext 启动即创建+resume；预览窗与调试键收敛。
6. **H5**：目标机实测帧率/显存，设备像素封顶、MSAA samples=0 A/B、全屏 pass RT 关 depthBuffer。
7. P1：M-AGE 停留 bug、16.3° 斜挥分裂（齐发宽高比换算）、冷却补发/位移闸门、死配置接线、引导 UI（docs/03 第四/五节有完整清单与 file:line）。

---

## 9. v6 前端优化（2026-09-08，深度借鉴 WoyouWoyou/sword-control）

GitHub 仓库 evanmaranzano/yujian-sword-array（v5 快照）clone 到 `Desktop\yujian-v6-work` 做（本机 v4 旧副本在 `Desktop\yujian44.5new\隔空御剑`，仅供取 GLB/venv，勿再开发）。用户目标：光剑更丝滑、CPU-only 笔记本可用、手势识别更稳、**修剑指严重过曝+巨粗光柱**。

### 9.1 修复的 bug（按严重度）

1. **剑指过曝+巨粗光柱（用户报告）**：volley.js `FORM_POSE.BIG_SWORD` 把 300 把加色混合的剑叠在同一点（scale 6.5、bright 1.0），加色叠加 HDR 爆表 + bloom 阈值 0.18 几乎全屏泛光 → 纯白粗柱。**改法=sword-control 原方案**：volley 新增独立单把大剑网格（`buildEnergySword` 内组预转 -π/2 立正 + 外组跟手/侧倾/缩放，`_updateBigSword`），阵型切 BIG_SWORD 时万剑缩没（pose scale→0）、本命剑退场（director `heroHere`），切换双向淡入淡出。`bigSwordScale` 6.5→5.5。
2. **demo/无头模式全坏（v5 起就坏，旧截图一直带 ENGINE FAILED 遮罩）**：HandTracker 构造函数漏 `this.demo = demo` 赋值 → demo 永远走真相机路径 → 无头下 import 失败报 ENGINE FAILED。
3. **`python -m http.server` 启动时 MediaPipe 必挂**：Python<3.13 的 mimetypes 把 .mjs 服成 text/plain，浏览器严格 MIME 拒载 ES 模块 → 真机主线 ENGINE FAILED。**修复=tools/serve.py**（.mjs/.wasm/.task 正确 MIME），run_web.bat 已切。**展厅部署必须用 serve.py 或其它认 .mjs 的服务器**。
4. `environment.js` 引用不存在的 `FX.stars.color`（靠默认白色侥幸工作）→ 改 `FX.ink.starfield`。
5. 实例色蓝通道 1.18>1（加色推高 HDR）→ 钳到 ≤1；bloom 阈值 0.18→0.45、强度 0.75→0.6（叠层不再泛白，辉光壳还在）。

### 9.2 丝滑与性能（CPU-only 笔记本）

- **手势朝向平滑**：volley 实例新增 sdx/sdy/sdz 朝向向量逐帧指数平滑（原逐帧硬切，阵型旋转抖动）；`?probe=1` 可 dump 阵型状态。
- **手位 One-Euro 滤波**（tracking.js `OneEuro2D`，Casiez 2012）：慢速强滤波杀 landmark 抖动、快速自动放宽带宽；只作用于显示路径（published nx/ny），挥舞检测仍吃原始已接受帧，速度不失真。CFG.smoothAlpha（lock 内）未动，符合两版同值约定。
- **自适应画质**（main.js `AdaptiveQuality`）：采样 500ms FPS，<45 持续 2s 降渲染分辨率（1.0→0.55 步进 0.12），到底仍低则关 bloom pass + `director.applyLowGlow` 加厚光晕壳补偿（FX.energySwordLow）；>57 持续 8s 逐级恢复。`?q=high/low` 强制。相机请求 1280×720→640×480（MediaPipe 内部会缩到模型分辨率，高请求白烧采集，sword-control 实证）。debug HUD 显示 Q 档位（#quality）。

### 9.3 手势识别重写（gesture.js，方向不变）

原判定用 y 轴上下比较（要求手正立）——**剑指横指向屏幕瞄准时误判回 IDLE，阵型闪跳**。重写为：伸/弯=指尖-腕/中关节-腕距离比（伸 >1.16，弯 <0.97，任意朝向成立）；拇指=2-3-4 关节点角 + 掌宽归一外张距；掌向/拇指向=方向向量比。判定优先级与双手手势不变。web/test/gesture.test.mjs 新增 5 组图像平面旋转用例（旋转 45°~90° 后分类必须不变），**17/17 过**。稳定计时 gestureStableMs=500 未动。

### 9.4 验证

`bash tools/verify_v6.sh`（YUJIAN_PY 指向可用 venv）：node 29/29、lock_check 19、smoke。无头截图 `?demo=1&t=8.0&gesture=<名>`（**t=8 是关键**：demo 脚本在 t≈1.5-2.6 触发两次齐发，264 剑约 t7 才归阵+拖尾淡出完，早冻会拍到半空阵/楔形拖尾残影，非 bug）。六阵型+低画质档已逐张目检：大剑=单把青色能量剑无过曝、剑柱/六芒星/双龙/剑球/待机全正常。Python 版未改，回归绿。

### 9.5 遗留 / 下一步

- 真机（笔记本 iGPU / CPU-only）实测帧率未做——自适应画质即为此设计，现场看 #quality 档位即可判断瓶颈。
- 领头剑 ribbon 剑气在齐发归阵交叉瞬间偶发扫过手锚点（视觉暂态，live 下自然）；如嫌乱可减 trailLeads。
- v5 的 `web/shots/*.png` 是旧版产物未更新；deploy/kiosk 实物（docs/03 H3）仍未做。
- 改动未 commit（在 yujian-v6-work 工作区），用户验收后再推 GitHub。

### 9.6 v6b：按用户反馈完全复刻 sword-control（2026-09-08 第二轮）

用户真机验收 v6 后反馈：手势识别"完全有问题"、剑指时仍有剑球阵、不喜欢默认球型阵。第二轮把
表现层与手势判定改为**逐项复刻 WoyouWoyou/sword-control**（可优化不能更差）：

- **gesture.js**：判定器逐行移植原版（y 轴比较原样、双手优先、FIST→TWO→THUMB_UP→SHAKA→
  ROCK→PALM_DOWN→OPEN_PALM 优先级原样）。两处保留仓库修正（原版真缺陷）：①原版 isFist
  只要求 4 项卷曲，点赞手势永远进不了 THUMB_UP 分支 → 恢复"拇指必须也弯曲"；②原版
  isPalmDown 的 y 轴伸直判定对手指朝下恒为假 → 恢复距离比判定。numHands 1→2（双手手势
  此前从未可能触发），锁定手优选（双手时取离上一接受位置最近者排第一，保会话锁连续性），
  landmark 统一先镜像再判（位置/手势/方向同坐标系）。gestureStableMs 500→250（原版即时
  切换，250ms 折中滤单帧误检）。tracking 新增输出：指向方向（腕→中指尖，原版取反语义）、
  掌法向（食指根×小指根）、双手中心/间距（中指根中点）。旋转不变性测试用例已删（与原版
  y 轴判定不兼容），测试恢复 v5 用例 12/12。
- **volley.js 重写**：阵型数学逐项移植原版 update*State——剑球/剑柱/六芒星/双龙/8字环/
  太极/聚能球全部**固定中心**（原版如此；v6 跟手锚点是"动画有问题"的观感来源之一）；
  瀑布(OPEN_PALM)/剑雨(PALM_DOWN)/爆裂(HANDS_PUSH)为速度积分型（含重力、出界回收、
  跟手漂移，per-frame 语义统一换算 per-second）；六芒星能量连线（6 外框+3 内叉 Line）；
  双龙 B 链紫、太极阳链白（实例色 colorMode，通道钳 ≤1）；待机=**漫天飞剑**（原版地面
  散落按正视角相机改为全屏体积散布+缓浮+慢翻滚，用户点名要的效果）；聚能球半径随双手
  距离（原版公式）；大剑朝向=手势方向混 up 向量（防指向相机时剑刃消失）。齐发 burst 保留
  但瀑布阵型下整段屏蔽（director.onSwipe）。位形吸附 lerpK 7→5.2（≈原版 0.085/frame）。
- **验收**：node 24/24、lock_check 19、smoke 全绿；12 阵型无头截图逐张目检通过
  （位形阵截图用 t=11——demo 脚本两次齐发 ~t9 才全部归阵；动态阵中途冻结）。
  真机手势手感待用户复验。

### 9.7 v6c（2026-09-08 第三轮，用户真机反馈）

- 不要锁定光圈；默认剑阵中心跟手（`formCX/formCY`，IDLE 有人时收成跟手云团）。
- 剑指不要合成一把：`_packSwordCloud` 把 300 实例装进柄/护手/刃，独立大剑网格永久隐藏。
- HUD 复刻 sword-control：左上角摄像头+未镜像骨骼（画布 CSS `scaleX(-1)` 与视频同向）、底部手势名、左下角 11 条小字表。
- 双手捧起：交叉改为腕/指尖 x 次序相反；捧起=两手张开+指尖内扣+间距 0.08–0.55。聚能球中心改为双手上方 1.4。
- 双拳阵型改为八卦八门径向剑臂（青/紫阴阳门），不再用太极双鱼。
- 启动残留：8000 端口若被旧 `serve.py` 占用，先杀再 `run_web.bat`。
