# 隔空御剑 · 万剑归宗（展厅手势御剑 · Web 主版本 + Python 参考版）

空手挥手，天外飞剑。观众站在屏幕前抬手，本命剑飞入手中；向任一方向疾挥，天幕剑阵雁行集结、万剑齐飞后归阵；静态手势可唤出剑球/大剑/六芒星/剑雨等 11 种阵型。仙侠暗场"墨韵金辉"风格，纯本地离线。

> **Web 版为部署形态（v5 能量光剑重构：程序化三层圆柱光剑替代 KayKit GLB，新增手势分类器与阵型编排）；
> Python 版定位为 v1 参考实现 + 无头回归/标定载体，视觉冻结。**

## 运行

- **Web 版（展厅部署形态）**：`cd web && python -m http.server 8000 --bind 127.0.0.1` → http://127.0.0.1:8000/
  - `?demo=1` 无摄像头脚本演示；`?demo=1&t=1.9` 预滚并冻结在 1.9s（确定性截图）
  - `?debug=1` 调试读数/预览/截图；`?kiosk=1` 隐藏指针；`F` 全屏
- **Python 参考版**：`python -m yujian.main`（仅旧版 2D 形态，视觉不再跟进）

## 验证（无需摄像头）

```bash
# Web 交互测试（锁 8 项 + 挥舞 4 项 + 手势 12 项，node 内置 runner）
node --test web/test/lock.test.mjs web/test/swipe.test.mjs web/test/gesture.test.mjs
# Python 会话锁确定性测试（19 项断言）
python -m tests.lock_check
# 固定虚拟时钟烟雾测试（方向断言 + 截图）
SDL_VIDEODRIVER=dummy python -m tests.smoke
# 无头烤机（虚拟观众循环，断言齐发/会话计数与内存增长）
SDL_VIDEODRIVER=dummy python -m tests.soak --seconds 20
# 现场标定管线合成自检（8 项）
python -m tests.camera_check --selftest
```

## 结构

| 文件/目录 | 职责 |
|---|---|
| `web/index.html` | OFL 字体、加载/故障中文遮罩、大字引导与站位光区 |
| `web/js/lock.js` | 会话锁：驻留确认 + 连续性关联（锁定第一人、围观不干扰） |
| `web/js/tracking.js` | MediaPipe 追踪 + 挥舞检测器 + 锁接线 + 帧龄看门狗/重连 |
| `web/js/config.js` | 交互参数（与 `yujian/config.py` 对位） |
| `web/js/fx.config.js` | 表现参数（色板/剑阵/后处理/像素预算） |
| `web/js/fx/` | 导演层、墨韵环境、万剑阵（多阵型）、本命剑（能量光剑）、ribbon、锁定反馈、粒子、选择性辉光、音频、资源加载 |
| `web/js/gesture.js` | 手势分类器：11 种静态手势几何规则（移植自 sword-control, MIT） |
| `web/assets/` | OFL 霞鹜文楷子集（woff2）；**KayKit GLB 已弃用**（v5 改程序化能量光剑） |
| `web/vendor/` | three r185、postprocessing 6.39.4（Zlib）、MediaPipe 1.0.1、`LICENSES/` |
| `tests/` | 锁测试、无头 smoke、soak 烤机、3/4/5m 现场标定工具 |
| `tools/build_delivery.py` | 单文件交付文档构建（改源码后重跑） |
| `docs/01–04` | 四轮多代理审查报告（现状/路线图/前端重构专项） |
| `THIRD-PARTY-LICENSES.md` | 第三方代码与素材许可汇总、CC-BY 署名与改动说明 |

## 关键交互设计决策（对应审查报告）

- **会话锁**：中心 ROI 驻留 0.2s 锁定；帧间跳变 >0.22 归一化判换人拒绝；掌尺度 >0.40 拒绝凑近镜头；丢失 0.5s 释放；reset 后 4 点重新武装（防恢复期抖动假齐发）。
- **不设全屏 Afterimage**：剑气只挂在剑上（ribbon），不做全屏帧累积（消除静态背景重影与"糊白饼"）。
- **选择性辉光**：只让剑/法阵发光，远山明月不入 bloom。
- **待机天幕剑阵**：252 把剑三层倾斜椭圆缓转于远空，不在屏幕中心聚球；齐发留屏 1.7–2.5s 真正飞过屏幕再归阵。
- **像素预算**：设备像素长边封顶 3200、MSAA 关闭、后处理 pass 合并（4K 显存静态估算约 0.5GB，待真机实测）。
- **镜像映射、宽高比校正**：右挥剑向左飞；齐发方向按屏幕宽高比换算（消除斜挥 16.3° 分裂）。

## 现场标定与部署（仍待真机，见 docs/04 §七）

- 3/4/5m × 成人/儿童标签采集：`python -m tests.camera_check --label 4m-adult --duration 30 --require-hand`，数据进 `tests/calib_log.csv`；据数据定 swipeHi/lockMaxJump/lockRoi，锁曝光 AE/AF/AWB，优先 1080p 窄角长焦，勿选广角。
- kiosk 启动器/免弹窗/任务计划/电源策略/看门狗、追踪自愈（墙钟帧龄）、Web 长稳烤机仍按 docs/04 路线推进。

自有代码版权归甲方公司；第三方：three/GLTFLoader=MIT、postprocessing=Zlib、
SlashSaber TrailRenderer=CC-BY-4.0（署名见 `THIRD-PARTY-LICENSES.md`）、
sword-control 手势分类=MIT（`web/js/gesture.js` 头注释）、
MediaPipe=Apache-2.0、霞鹜文楷=OFL-1.1。
