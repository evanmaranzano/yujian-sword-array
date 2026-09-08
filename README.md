# 隔空御剑 · 万剑归宗（展厅手势御剑 · Web 主版本 + Python 参考版）

空手挥手，天外飞剑。观众站在屏幕前抬手，剑阵中心跟手；向任一方向疾挥，万剑雁行集结、分波飞越后归阵。11 种手势阵型——漫天飞剑待机、握拳剑球、剑指小剑云团、出掌瀑布、点赞剑柱、六芒星、双龙、剑雨、8 字环、爆裂、聚能球、八卦八门。深蓝黑星空 + 青色能量光剑（阵型数学源自 [WoyouWoyou/sword-control](https://github.com/WoyouWoyou/sword-control) MIT），纯本地离线。

> **Web 版为部署形态（v6c：跟手阵心 / 剑指小剑云团 / 摄像头骨骼 HUD / 八卦八门 / 捧起判定修正）；
> Python 版定位为 v1 参考实现 + 无头回归/标定载体，视觉冻结。**

## 运行

- **Web 版（展厅部署形态）**：`web\run_web.bat` 一键启动（Chrome 优先全屏）
  - 手动：`python tools/serve.py 8000 --bind 127.0.0.1` → http://127.0.0.1:8000/
  - **勿用 `python -m http.server`**：其 .mjs MIME 会被浏览器拒载，MediaPipe 必挂
  - 默认显示左上角摄像头+手骨、底部手势名、左下角手势表
  - `?demo=1` 无摄像头脚本演示；`?demo=1&t=11&gesture=FIST` 预滚冻结+强制手势阵型（位形阵 t≥11）
  - `?debug=1` FPS/画质档/截图；`?q=high/low` 强制画质档；`?kiosk=1` 隐藏指针与摄像头 HUD；`F` 全屏
- **Python 参考版**：`python -m yujian.main`（仅旧版 2D 形态，视觉不再跟进）
## 验证（无需摄像头）

```bash
# 一键全量：语法 + node 单测 + Python 回归 + 13 张无头截图
bash tools/verify_v6.sh
# Web 交互测试（手势 12 + 锁 8 + 挥舞 4，node 内置 runner）
node --test web/test/*.mjs
# Python 会话锁确定性测试（19 项断言；Python 一律走项目根 .venv）
.venv/Scripts/python.exe -m tests.lock_check
SDL_VIDEODRIVER=dummy .venv/Scripts/python.exe -m tests.smoke
SDL_VIDEODRIVER=dummy .venv/Scripts/python.exe -m tests.soak --seconds 20
.venv/Scripts/python.exe -m tests.camera_check --selftest
```

## 结构

| 文件/目录 | 职责 |
|---|---|
| `web/index.html` | 字体、加载/故障遮罩、摄像头预览+骨骼、手势名/手势表 |
| `web/js/lock.js` | 会话锁：驻留确认 + 连续性关联（锁定第一人、围观不干扰） |
| `web/js/tracking.js` | MediaPipe 双手追踪 + One-Euro 显示平滑 + 挥舞检测 + 帧龄看门狗/重连 |
| `web/js/gesture.js` | 手势分类器：11 种静态手势（sword-control MIT；FIST/PALM_DOWN/捧起/交叉有修正） |
| `web/js/config.js` | 交互参数（与 `yujian/config.py` 对位） |
| `web/js/fx.config.js` | 表现参数（色板/阵型/后处理/自适应画质） |
| `web/js/fx/` | 导演层、星空环境、万剑阵（12 阵型+六芒星连线）、本命剑、ribbon、粒子、选择性辉光、音频 |
| `web/assets/` | OFL 霞鹜文楷子集（woff2）；剑体为程序化能量光剑，无外部模型 |
| `web/vendor/` | three r185、postprocessing 6.39.4（Zlib）、MediaPipe 1.0.1、`LICENSES/` |
| `tests/` | 手势/锁/挥舞 node 单测、无头 smoke、soak 烤机、3/4/5m 现场标定工具 |
| `tools/` | `serve.py`（**启动必用**，.mjs MIME）、`verify_v6.sh`（一键验证）、`build_delivery.py`（交付文档构建） |
| `docs/01–05` | 五轮多代理审查报告（现状/路线图/前端重构专项/v4 验收） |
| `THIRD-PARTY-LICENSES.md` | 第三方代码与素材许可汇总、CC-BY 署名与改动说明 |

## 关键交互设计决策

- **会话锁**：中心 ROI 驻留 0.2s 锁定；帧间跳变 >0.22 判换人拒绝；掌尺度 >0.40 拒绝凑近镜头；丢失 0.5s 释放；reset 后 4 点重新武装。双手模式下锁定手按"离上一接受位置最近"优选。
- **手势判定**：双手优先。FIST 须拇指也弯；PALM_DOWN 伸直用距离比；交叉=腕与指尖 x 次序相反；捧起=两手张开+指尖内扣+间距适中。250ms 稳定计时防单帧误检。
- **阵型锚点**：有人时阵型中心跟手；无人 IDLE=漫天飞剑。剑指=小剑云团拼剑形（互不共点）。双拳=八卦八门。
- **丝滑**：阵型位形 exp 吸附（≈原版 lerp 0.085/frame）+ 实例朝向向量平滑 + 手位 One-Euro 滤波（只滤显示路径，挥舞速度不失真）。
- **自适应画质**：FPS<45 持续 2s 先降渲染分辨率（至 55%），仍低则关 bloom + 加厚光晕壳补偿；>57 持续 8s 逐级恢复。
- **选择性辉光**：只让剑/法阵/能量线入 bloom（阈值 0.45），星空不泛光。
- **像素预算**：设备像素长边封顶 3200、MSAA 关闭；相机采集 640×480。

## 现场标定与部署（待真机/现场）

- 3/4/5m × 成人/儿童标签采集：`.venv` 装 mediapipe 后 `.venv/Scripts/python.exe -m tests.camera_check --label 4m-adult --duration 30 --require-hand`，数据进 `tests/calib_log.csv`；据数据定 swipeHi/lockMaxJump/lockRoi，锁曝光 AE/AF/AWB，优先 1080p 窄角长焦。
- CPU-only 笔记本实测帧率：`?debug=1` 看 FPS 与 Q 档位。
- kiosk 启动器/免弹窗/任务计划/电源策略/看门狗、72h 烤机仍按 docs/03、docs/04 路线推进。

## 交接

**权威交接文档 = `HANDOFF.md`**（当前状态速览在第 0 节，坑清单在第 5 节，v4→v6b 演进史在第 7–9 节）。
