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

  // 手势阵型（volley.js 状态机；手位为中心锚点，世界坐标）
  formations: {
    lerpK: 7,            // 位置吸附速率（1/s，帧率无关 exp 阻尼）
    sphereRadius: 3.4,   // SPHERE/ENERGY_BALL 斐波那契球半径
    bigSwordScale: 6.5,  // BIG_SWORD 合并大剑缩放
    bigSwordOffset: 1.6, // 大剑悬于手上方的偏移
    pillarRadius: 1.6,   // PILLAR 剑柱半径
    pillarHeight: 14,    // PILLAR 剑柱高度
    hexRadius: 4.2,      // HEXAGRAM 六芒星外接圆半径
    dragonRadius: 2.4,   // DRAGON 双螺旋半径
    dragonHeight: 12,    // DRAGON 双螺旋高度
    rainWidth: 10,       // RAIN 剑雨覆盖宽度
    rainFallSpeed: 11,   // RAIN 下落速度
    rainGroundY: -6,     // RAIN 落地回顶阈值
    infinityScaleX: 5.5, // INFINITY 8字水平半径
    infinityScaleY: 2.6, // INFINITY 8字垂直幅度
    infinityScaleZ: 1.6, // INFINITY 8字纵深幅度
    explodeSpeed: 13,    // EXPLODE 扩散速度
    explodeMaxR: 13,     // EXPLODE 最大扩散半径
    taichiRadius: 3.8,   // TAICHI 双鱼半径
    taichiTilt: Math.PI / 5,  // TAICHI 盘面倾角（面向观众）
  },

  // 手势识别稳定性：同一手势连续保持该时长后才切换阵型
  gestureStableMs: 500,

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

  // 后处理（选择性辉光：只让剑/法阵发光，山月不入 bloom；v5 降过曝）
  bloom: { intensity: 0.75, luminanceThreshold: 0.18, luminanceSmoothing: 0.15, radius: 0.6 },
  vignette: { offset: 0.35, darkness: 0.72 },
  grain: 0.04,
  exposure: 0.72,

  // 相机
  cameraBreath: 0.12,
  fovKick: 3.5,

  // 像素预算：设备像素长边硬封顶（dpr cap 对 100% 缩放 TV 无效，见 docs/03 H5）
  maxDeviceLongEdge: 3200,
  maxDpr: 1.75,
};
