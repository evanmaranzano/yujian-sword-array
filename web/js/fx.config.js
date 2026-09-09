// 表现层参数（重构后每条都有消费点；交互参数在 config.js，与 Python config.py 对位）
// 美术方向：sword-control 星空光剑——深蓝黑背景 + 白色星空 + 青色光剑
export const FX = {
  // 色彩（sRGB hex；instanceColor/材质统一从这里取）
  ink: {
    bg: 0x000011,           // 深蓝黑背景（sword-control）
    swordCore: 0x00ffff,    // 青色剑芯
    swordGlow: 0x0066ff,    // 蓝色光晕
    swordTrail: 0x00aaff,   // 拖尾颜色
    starfield: 0xffffff,    // 白色星星
  },

  // 星空
  stars: {
    count: 2000,
    radiusMin: 50,
    radiusMax: 150,
    size: 0.5,
    opacity: 0.8,
    rotationSpeed: 0.002,
  },

  // 万剑阵（sword-control 三层球面）
  volley: {
    max: 300,
    sphereLayers: [
      { radius: 1.5, count: 60, rotationSpeed: 0.025, scale: 0.7 },
      { radius: 2.5, count: 100, rotationSpeed: 0.015, scale: 0.9 },
      { radius: 3.5, count: 140, rotationSpeed: 0.008, scale: 1.1 },
    ],
    burstCount: 132,
    gatherTime: 0.32,
    fireSpeed: [15, 23],
    fireLife: [1.7, 2.5],
    trailLeads: 10,
  },

  // 能量光剑（sword-control 三层圆柱：青内核+蓝光晕+白剑尖）
  energySword: {
    coreColor: 0x00ffff,      // 青内核
    midColor: 0x0066ff,       // 蓝光晕
    outerColor: 0x00aaff,     // 外层青蓝
    coreOpacity: 0.9,
    midOpacity: 0.3,
    outerOpacity: 0.15,
    coreRadiusTop: 0.0045,
    coreRadiusBottom: 0.015,
    midScale: 2.0,
    outerScale: 3.0,
    bladeLength: 1.2,
    tipRadius: 0.0225,
    tipOpacity: 0.8,
  },

  // 低画质（bloom 关闭时）光晕补偿：加厚光晕壳不透明度，补回泛光损失
  energySwordLow: { midOpacity: 0.44, outerOpacity: 0.30 },

  // 手势阵型（volley.js；有人时中心跟手）
  formations: {
    lerpK: 5.2,          // 位置吸附速率（≈原版 lerp 0.085@60fps，帧率无关 exp 阻尼）
    bigSwordScale: 0.32, // 剑指云团里单把小剑缩放（不再合并成一把）
    bigSwordOffset: 0,   // 剑云原点即手位
    pillarRadius: 1.5,   // PILLAR 剑柱半径（原版 1.5）
    pillarHeight: 15,    // PILLAR 剑柱高度（原版 15）
    hexRadius: 4,        // HEXAGRAM 六芒星外接圆半径（原版 4）
    dragonRadius: 2.5,   // DRAGON 双螺旋半径（原版 2.5）
    dragonHeight: 12,    // DRAGON 双螺旋高度（原版 12）
    rainGroundY: -6,     // RAIN 落地回顶阈值
    infinityScaleX: 6,   // INFINITY 8字水平半径（原版 6）
    infinityScaleY: 4,   // INFINITY 8字垂直幅度（原版 4）
    infinityScaleZ: 3,   // INFINITY 8字纵深幅度（原版 3）
    explodeMaxR: 15,     // EXPLODE 最大扩散半径（原版 15）
    taichiRadius: 4,     // TAICHI 双鱼半径（原版 4）
    taichiTilt: Math.PI / 5,  // TAICHI 盘面倾角（面向观众；原版 π/1.5）
    waterfallSpeed: 42,  // WATERFALL 出掌飞剑速度（≈原版 0.8/frame）
  },

  // 手势识别稳定性：同一手势连续保持该时长后才切换阵型（原版即时切换；
  // 250ms 折中——近实时手感，又滤掉单帧误检）
  gestureStableMs: 180,      // 手势→手势切换稳定窗
  gestureEnterMs: 130,       // IDLE→手势：快速进入（手感跟手）
  gestureIdleMs: 350,        // 手势→IDLE：慢释放（阵型不闪跳）

  // 本命剑
  hero: {
    scale: 1.35,
    follow: 14.0,
    maxSpeed: 26,
    arriveDur: 0.6,
    arriveFromZ: -26,
    trailLength: 26,
    trailWidth: 0.34,
  },

  // 粒子/环
  sparksPerBurst: 46,
  ringMaxRadius: 3.4,
  ringLife: 0.4,

  // 后处理（选择性辉光：只让剑/法阵发光，山月不入 bloom）。
  // v6 再治过曝：阈值 0.18→0.45（叠层加色不再整体泛白），强度 0.75→0.6
  bloom: { intensity: 1.8, luminanceThreshold: 0.15, luminanceSmoothing: 0.4, radius: 0.6 },
  vignette: { offset: 0.35, darkness: 0.72 },
  grain: 0.04,
  exposure: 0.72,

  // 自适应画质（CPU-only 笔记本兜底，main.js 消费）：
  // 连续低于 downFps 先降渲染分辨率，降到 resScaleMin 仍低则关 bloom（低画质下加厚光晕层补偿）
  quality: {
    resScaleMax: 1.0,
    resScaleMin: 0.55,
    resStep: 0.12,
    downFps: 45,
    upFps: 57,
    holdDownMs: 2000,   // 低于 downFps 持续此时长才降级
    holdUpMs: 8000,     // 高于 upFps 持续此时长才升级
    sampleMs: 500,      // FPS 采样窗口
  },

  // 相机
  cameraBreath: 0.12,
  fovKick: 3.5,

  // 像素预算：设备像素长边硬封顶（dpr cap 对 100% 缩放 TV 无效，见 docs/03 H5）
  maxDeviceLongEdge: 3200,
  maxDpr: 1.75,
};
