# 隔空御剑 · 万剑归宗（Web 版，v4 表现层重构）

Three.js + MediaPipe Tasks Vision (JS)。摄像头空手御剑：手即剑，剑随手动。
视觉方向「墨韵金辉」：墨黑穹顶、雾融远山、云海明月、天幕剑阵；疾挥则雁行集结、万剑齐射而归阵。

## 交互（会话锁 + 三通道）

| 阶段 | 触发 | 反馈 |
|---|---|---|
| idle | 无人 | 三层天幕剑阵远空缓转，9s 一次脱阵横扫；底部站位光区 + 挥手剪影 |
| candidate | 手入中心交互区 | 金色环向指尖收敛（驻留进度可视化） |
| locked | 区内连续驻留 `lockDwell=0.20s` | 本命剑 z 向纵深飞入手中（"劍來"法阵 + 清音），金点锁定 |
| 跟手 | 锁定后移动 | 本命剑弹簧跟手（刃尖 ribbon 剑气），快速移动沿途迸鎏金星火 |
| 齐发 | 手速上穿 `swipeHi`（上升沿，0.35s 冷却） | 环中调剑雁行集结 → 三排分波飞越屏幕（留屏 1.7–2.5s）→ 转向归阵；金色剑意环 + FOV punch + 剑鸣 |

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
│   ├── core/bus.js       # 事件总线（交互层 ↔ 表现层）
│   └── fx/
│       ├── director.js     # FX 导演：三态编排、宽高比校正、镜头语言
│       ├── environment.js  # shader 墨空/雾融多层山/云海/月相/星尘/远雾诗句
│       ├── volley.js       # 天幕剑阵 + 集结/齐射/归阵 + 10 种手势阵型（三层 InstancedMesh 能量剑刃 + steering）
│       ├── hero.js         # 本命剑能量光剑（三层加法混合 + 纵深飞入/弹簧跟手/限速/leaveAge）
│       ├── trail.js        # ribbon 拖尾（移植自 SlashSaber，CC-BY-4.0，见文件头）
│       ├── reticle.js      # 金环收敛/指尖金点/"劍來"法阵
│       ├── particles.js    # 鎏金星火 + 克制的剑意环
│       ├── postfx.js       # pmndrs/postprocessing：选择性辉光/暗角/颗粒/ACES
│       └── audio.js        # 启动即建 AudioContext（kiosk 无声修复）
├── test/                 # node --test：lock 8 项 + swipe 4 项 + gesture 12 项
└── vendor/               # three r185、postprocessing 6.39.4（Zlib）、
                          # MediaPipe 1.0.1、LICENSES/（六个许可证全文）——全部本地，无 CDN
```

第三方许可与署名见仓库根 `THIRD-PARTY-LICENSES.md` 与 `vendor/LICENSES/`。

## 运行

双击 `run_web.bat`（普通浏览器窗口；正式 kiosk 见下），或手动：

```bash
cd web
python -m http.server 8000 --bind 127.0.0.1
# 打开 http://127.0.0.1:8000/
```

- `?demo=1`：无摄像头脚本化演示；`?demo=1&t=1.9`：预滚到 1.9s 并冻结（确定性截图/A-B）
- `?debug=1`：FPS/追踪/剑阵读数、摄像头预览、S 截图、M 镜像
- `?kiosk=1`：始终隐藏鼠标指针
- `F` 全屏（任何模式）

测试：

```bash
node --test test/lock.test.mjs test/swipe.test.mjs
```

## 展厅部署（后续，待 kiosk 启动器落地）

- Edge/Chrome kiosk：`msedge.exe --kiosk http://127.0.0.1:8000/ --autoplay-policy=no-user-gesture-required
  --no-first-run --start-fullscreen`（Chrome 同名参数；自动探测浏览器）
- 免摄像头弹窗：注册表 `VideoCaptureAllowedUrls` 加 `http://127.0.0.1:8000/`
- 音频在启动时即创建 AudioContext 并在 kiosk autoplay 策略下自动 resume
- 像素预算：设备像素长边硬封顶 3200（`fx.config.js maxDeviceLongEdge`），后处理 MSAA 关闭
