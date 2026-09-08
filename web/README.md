# 隔空御剑 · 万剑归宗（Web 版，v6c）

Three.js + MediaPipe Tasks Vision (JS)。摄像头空手御剑：有人时剑阵中心跟手。
视觉：深蓝黑星空 + 青色能量光剑；疾挥则雁行集结、万剑齐射而归阵。

## 交互（会话锁 + 三通道）

| 阶段 | 触发 | 反馈 |
|---|---|---|
| idle | 无人 | 漫天飞剑 |
| candidate | 手入中心交互区 | 剑阵开始向手位收拢（无锁定光圈） |
| locked | 区内连续驻留 `lockDwell=0.20s` | 本命剑飞入；阵型跟手 |
| 跟手 | 锁定后移动 | 阵型中心跟手；本命剑弹簧跟手（剑指时本命剑退场） |
| 齐发 | 手速上穿 `swipeHi`（上升沿，0.35s 冷却） | 环中调剑雁行集结 → 分波飞越 → 归阵 |

会话锁（`js/lock.js`，与 `yujian/lock.py` 同算法同参数）：区外路过/围观伸手不唤剑；
锁定后帧间跳变 > `lockMaxJump`、掌尺度过大（凑近镜头）一律拒绝；
只有"已接受帧"喂挥舞检测器；检测器 reset 后须 4 点重新武装（防恢复期抖动假齐发）。

## 结构

```
web/
├── index.html            # OFL 字体子集 @font-face、加载/故障中文遮罩、大字引导、?debug/?kiosk
├── assets/
│   └── fonts/            # 霞鹜文楷 Lite 子集 woff2（OFL，~40KB/字重，仅含实际用字）
├── js/
│   ├── config.js         # 交互参数（与 yujian/config.py 对位）
│   ├── fx.config.js      # 表现参数（每条都有消费点）
│   ├── gesture.js        # 手势分类器（11 种静态手势几何规则，移植自 sword-control MIT）
│   ├── tracking.js       # MediaPipe 追踪 + SwipeDetector + 锁接线 + 帧龄看门狗/重连
│   ├── main.js           # 薄引导：加载/事件接线/HUD/健康遮罩/像素封顶
│   └── fx/
│       ├── director.js     # FX 导演：三态编排、宽高比校正、镜头语言
│       ├── environment.js  # 星空
│       ├── volley.js       # 万剑阵（12 阵型；剑指=小剑云团；双拳=八卦八门）
│       ├── hero.js         # 本命剑能量光剑
│       ├── trail.js        # ribbon 拖尾（移植自 SlashSaber，CC-BY-4.0，见文件头）
│       ├── reticle.js      # 旧锁定光圈（v6c 不再挂到场景）
│       ├── particles.js    # 星火 + 剑意环
│       ├── postfx.js       # pmndrs/postprocessing：选择性辉光/暗角/颗粒/ACES
│       └── audio.js        # 启动即建 AudioContext（kiosk 无声修复）
├── test/                 # node --test：lock 8 项 + swipe 4 项 + gesture 12 项
└── vendor/               # three r185、postprocessing 6.39.4（Zlib）、
                          # MediaPipe 1.0.1、LICENSES/（六个许可证全文）——全部本地，无 CDN
```

第三方许可与署名见仓库根 `THIRD-PARTY-LICENSES.md` 与 `vendor/LICENSES/`。

双击 `run_web.bat`（serve.py + Chrome 优先全屏），或手动：

```bash
python tools/serve.py 8000 --bind 127.0.0.1
# 打开 http://127.0.0.1:8000/
```

**勿用 `python -m http.server`**（.mjs MIME 会拒载 MediaPipe）。

- 默认：左上角摄像头+手骨、底部手势名、左下角手势表
- `?demo=1`：无摄像头脚本化演示；`?demo=1&t=11&gesture=FIST`：预滚冻结
- `?debug=1`：FPS/追踪/剑阵读数、S 截图、M 镜像
- `?kiosk=1`：隐藏鼠标指针与摄像头 HUD
- `F` 全屏
测试：

```bash
node --test test/*.mjs
```

## 展厅部署（后续，待 kiosk 启动器落地）

- Edge/Chrome kiosk：`msedge.exe --kiosk http://127.0.0.1:8000/ --autoplay-policy=no-user-gesture-required
  --no-first-run --start-fullscreen`（Chrome 同名参数；自动探测浏览器）
- 免摄像头弹窗：注册表 `VideoCaptureAllowedUrls` 加 `http://127.0.0.1:8000/`
- 音频在启动时即创建 AudioContext 并在 kiosk autoplay 策略下自动 resume
- 像素预算：设备像素长边硬封顶 3200（`fx.config.js maxDeviceLongEdge`），后处理 MSAA 关闭
