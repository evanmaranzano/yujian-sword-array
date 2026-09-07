// 全局交互参数（与 yujian/config.py 逐项对位、同值；表现参数在 fx.config.js）。
// 任何阈值改动必须两版同步并重跑 tests/lock_check 与 web/test。
export const CFG = {
  // 追踪（识别手感）
  smoothAlpha: 0.55,          // 手掌位置指数平滑
  velocityWindow: 0.12,       // 速度窗口（秒）

  // 挥舞状态机（Web 版为上升沿瞬时触发）
  swipeHi: 0.75,              // 速度上穿 → 立即齐发
  swipeLo: 0.30,              // 迟滞下线
  swipeMaxDur: 0.70,          // 挥舞最长持续（秒）
  burstCooldown: 0.35,        // 两次齐发最小间隔（秒）
  swipeMinDist: 0.07,         // 最小位移闸门（归一化画面宽；Python v1 在用，Web 预留）

  handLostTimeout: 0.5,

  // 会话锁（"以第一个锁定的人为准，围观不干扰"）
  lockEnabled: true,          // false 时退回见手即跟（仅调试用，见 tests）
  lockRoi: [0.12, 0.10, 0.88, 0.90], // 驻留确认区 [x0,y0,x1,y1]（镜像后归一化坐标）
  lockDwell: 0.20,            // 在区内连续驻留多久才获得锁定（秒）
  lockCandidateTtl: 0.15,     // 候选驻留中断多久作废（秒）
  lockMaxJump: 0.22,          // 相邻检测帧掌心跳变 > 此值判换人/误检，拒绝
  lockMaxPalm: 0.40,          // 掌尺度（4:3 校正后归一化画面宽）超此值=凑近镜头，拒绝
  lockGapClear: 0.07,         // 接受帧间隔 > 此值视为遮挡空档，清空速度历史

  mirror: true,               // 镜像映射（照镜子式直觉）
};
