// 手势追踪：MediaPipe Tasks Vision (JS) + 挥舞检测（上升沿触发版）
// 交互原则：起手 <100ms 内出反馈——齐发在速度上穿阈值的瞬间触发（带冷却），
// 而不是等收手；同时每帧输出瞬时速度供"沿轨迹连续出剑"。
//
// 会话锁（lock.js）：先在中心交互区驻留确认，锁定第一个人；锁定后只接受位置连续
// 的同一只手，围观者/凑近镜头/交接跳变一律拒绝，挥舞检测器只吃"已接受帧"，
// 因此换人跳变不会再诱发伪齐发。
// demo=true 时不使用摄像头，改为脚本化输入（无头测试用）
import { CFG } from './config.js';
import { FX } from './fx.config.js';
import { detectGesture, GESTURE } from './gesture.js';
import { HandLock } from './lock.js';

const PALM_IDS = [0, 5, 9, 13, 17];

export class SwipeDetector {
  constructor() {
    this.hist = [];
    this.swiping = false;
    this.start = null;
    this.peak = 0;
    this.lastBurst = -10;
    this._needArm = true;   // reset 后需先积满 ARM_POINTS 个点才允许触发（防恢复期抖动假齐发，docs/04 N-LOCK-2）
  }
  static get ARM_POINTS() { return 4; }

  // 清速度历史但保留冷却（换会话/遮挡空档后调用，防跨空档伪齐发）
  reset() {
    this.hist.length = 0;
    this.swiping = false;
    this.start = null;
    this._needArm = true;
  }

  // 喂入屏幕归一化坐标（已镜像）。只应喂"已接受的检测帧"。
  // 返回 {dx, dy, peak} = 齐发事件（速度上穿 swipeHi 的瞬间），或 null
  feed(now, present, x, y) {
    if (!present) {
      // 手丢失：直接复位，不喂假坐标（修掉旧版消失瞬间出假方向的 bug）
      this.reset();
      return null;
    }
    this.hist.push({ t: now, x, y });
    const cutoff = now - CFG.velocityWindow;
    while (this.hist.length && this.hist[0].t < cutoff) this.hist.shift();
    // 新会话/空档恢复后先喂满 ARM_POINTS 个点：此时速度窗口只有两三个点，
    // 单步检测抖动会被放大成假齐发（docs/04 N-LOCK-2）
    if (this._needArm) {
      if (this.hist.length >= SwipeDetector.ARM_POINTS) this._needArm = false;
      return null;
    }
    if (this.hist.length < 2) return null;

    const h0 = this.hist[0];
    const dt = Math.max(now - h0.t, 1e-3);
    const vx = (x - h0.x) / dt, vy = (y - h0.y) / dt;
    const speed = Math.hypot(vx, vy);

    if (!this.swiping) {
      if (speed > CFG.swipeHi) {
        this.swiping = true;
        this.start = { t: now, x, y };
        this.peak = speed;
        // 上升沿立即齐发（冷却防连发），方向 = 当前瞬时运动方向
        if (now - this.lastBurst >= CFG.burstCooldown) {
          this.lastBurst = now;
          const d = Math.hypot(vx, vy) || 1;
          return { dx: vx / d, dy: vy / d, peak: speed };
        }
      }
    } else {
      this.peak = Math.max(this.peak, speed);
      if (speed < CFG.swipeLo || now - this.start.t > CFG.swipeMaxDur) {
        this.swiping = false;
        this.start = null;
      }
    }
    return null;
  }
}

// 掌尺度：腕(0)→中指根(9)，y 按 4:3 像素校正，输出画面宽归一化尺度
function palmSize(lm) {
  const dx = lm[9].x - lm[0].x;
  const dy = (lm[9].y - lm[0].y) * 0.75;
  return Math.hypot(dx, dy);
}

// 掌心（5 点平均，PALM_IDS）
function palmCenter(lm) {
  let x = 0, y = 0;
  for (const id of PALM_IDS) { x += lm[id].x; y += lm[id].y; }
  return [x / PALM_IDS.length, y / PALM_IDS.length];
}

// One-Euro 自适应低通（Casiez et al. 2012）：慢速时强滤波杀 landmark 抖动，
// 快速时自动放宽带宽保跟手。只作用于显示路径（published nx/ny），
// 挥舞检测仍吃原始已接受帧，速度计算不受滤波畸变影响。
export class OneEuro2D {
  constructor(minCutoff = 1.1, beta = 0.55, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.reset();
  }
  static _alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return tau / (tau + dt);
  }
  reset() {
    this._px = null; this._py = null; this._pt = 0;
    this._dx = 0; this._dy = 0;   // 滤波后的速度幅值（用于抬带宽）
  }
  filter(x, y, t) {
    if (this._px === null) {
      this._px = x; this._py = y; this._pt = t; this._dx = 0; this._dy = 0;
      return [x, y];
    }
    const dt = Math.max(t - this._pt, 1e-3);
    const fx = this._step('x', x, t, dt);
    const fy = this._step('y', y, t, dt);
    this._pt = t;
    return [fx, fy];
  }
  _step(axis, v, t, dt) {
    const prev = axis === 'x' ? this._px : this._py;
    const rawD = Math.abs((v - prev) / dt);
    const ad = OneEuro2D._alpha(this.dCutoff, dt);
    const dHat = (axis === 'x' ? this._dx : this._dy) + ad * (rawD - (axis === 'x' ? this._dx : this._dy));
    if (axis === 'x') this._dx = dHat; else this._dy = dHat;
    const cutoff = this.minCutoff + this.beta * Math.hypot(this._dx, this._dy);
    const a = OneEuro2D._alpha(cutoff, dt);
    const out = prev + a * (v - prev);
    if (axis === 'x') this._px = out; else this._py = out;
    return out;
  }
}

// 21 点 landmark 平滑器：每点一路 One-Euro，专供手势分类路径——
// 展厅亮光/逆光下 landmark 高频抖动是误判主因，先滤波再分类。
// 位置控制与挥舞检测各有自己的滤波，互不影响。
class LandmarkSmoother {
  constructor(n = 21) {
    this.f = Array.from({ length: n }, () => new OneEuro2D(1.6, 0.35, 1.0));
  }
  reset() { for (const f of this.f) f.reset(); }
  apply(lms, t) {
    return lms.map((p, k) => {
      const [x, y] = this.f[k].filter(p.x, p.y, t);
      return { x, y, z: p.z };
    });
  }
}

export class HandTracker {
  constructor({ demo = false, prerollTo = 0, onSwipe, onState, onHealth, onGesture, onBrightWarn } = {}) {
    this.demo = demo;             // v6 修复：原漏赋值，demo/无头截图一直走真相机路径然后 ENGINE FAILED
    this.onSwipe = onSwipe || (() => {});
    this.onState = onState || (() => {});
    this.onHealth = onHealth || (() => {});
    this.onGesture = onGesture || (() => {});
    this.onBrightWarn = onBrightWarn || (() => {});
    // 手势稳定计时：同一手势连续保持 gestureStableMs 才上报切换（防抖）
    this._gCandidate = GESTURE.IDLE;
    this._gSince = 0;
    this._gPublished = GESTURE.IDLE;
    this.onSwipe = onSwipe || (() => {});
    this.prerollTo = prerollTo;   // >0：演示模式确定性预滚（无头截图用）
    this.lock = new HandLock();
    this.detector = new SwipeDetector();
    this.oe = new OneEuro2D();      // 显示路径平滑（nx/ny），挥舞检测不经过它
    this._gSm = new LandmarkSmoother();  // 手势分类专用 landmark 滤波（亮光抖动主防线）
    this._gSm2 = new LandmarkSmoother(); // 第二只手同滤波：合十等双手手势相对抖动会闪判（09-11 隐藏手势）
    this._vote = [];                // 手势滑窗多数票（窗 5）
    this._lumaCv = null; this._lumaAt = 0; this.brightWarn = false;
    // 手势上下文（指向方向/掌法向/第二只手/双手中心，镜像坐标系）
    this.dirX = 0; this.dirY = 1; this.dirZ = 0;
    this.palmNX = 0; this.palmNY = 0; this.palmNZ = 1;
    this.hand2Nx = null; this.hand2Ny = null;
    this.ncx = 0.5; this.ncy = 0.5; this.handDist = 0.3;
    this.landmarker = null;
    this.video = null;
    this.stream = null;
    this.running = false;
    this._raf = 0;
    this._retries = 0;
    this.sx = null; this.sy = null;
    this.present = false;
    this.phase = this.demo ? 'idle' : 'init';
    this.cand = 0;
    this.lastSeen = 0;
    this.lastVideoTime = -1;
    this._lastFrameMs = -1;     // 最近有效视频帧的墙钟（帧龄看门狗，docs/03 L1）
    this.stalled = false;
    this.fps = 0; this._fpsCount = 0; this._fpsT = null;
    this.status = 'init';
    // 每帧输出的瞬时运动（归一化坐标/秒，已镜像）
    this.speed = 0; this.vx = 0; this.vy = 0;
    this.rawHands = [];         // 未镜像的 MediaPipe 点，专供摄像头预览骨骼

  }

  // 相机/引擎故障后重新初始化（H7 自动重试）
  async restart() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    try { this.stream?.getTracks().forEach(t => t.stop()); } catch (e) { /* 忽略 */ }
    this._retries = Math.min(this._retries + 1, 8);
    await new Promise(r => setTimeout(r, Math.min(8000, 600 * 2 ** this._retries)));
    this.lastVideoTime = -1; this._lastFrameMs = -1; this.stalled = false;
    this.lock.reset(); this.detector.reset(); this.oe.reset();
    this.present = false; this.sx = this.sy = null;
    return this.start();
  }

  // 放弃当前会话（镜像翻转后坐标系改变时由主循环调用）
  resetSession() {
    this.lock.reset();
    this.detector.reset();
    this.oe.reset();
    this.present = false;
    this.sx = this.sy = null;
    this.hand2Nx = null; this.handDist = 0.3;
    this._gSm.reset(); this._vote.length = 0;
    this._gCandidate = GESTURE.IDLE; this._gPublished = GESTURE.IDLE;
    this._gSm2.reset();
  }

  async start() {
    if (this.demo) {
      this.status = 'demo';
      this.phase = 'idle';
      this.running = true;
      this.onHealth({ state: 'ok', msg: '' });
      if (this.prerollTo > 0) return;   // 由外部用 scriptAt(t) 确定性驱动
      this._loopDemo();
      return;
    }
    this.onHealth({ state: 'starting', msg: '' });
    try {
      const { FilesetResolver, HandLandmarker } = await import('../vendor/mediapipe/vision_bundle.mjs');
      const vision = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
      const make = (delegate) => HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: './vendor/mediapipe/hand_landmarker.task', delegate },
        runningMode: 'VIDEO', numHands: 2,   // 双手手势（sword-control maxNumHands 2）
        minHandDetectionConfidence: 0.5, minHandTrackingConfidence: 0.6,
      });
      try { this.landmarker = await make('GPU'); }
      catch (e) { console.warn('GPU delegate 失败，回退 CPU', e); this.landmarker = await make('CPU'); }
      this.status = 'camera';

      // 640×480：MediaPipe 内部会把输入缩到模型分辨率，高分辨率请求只增加
      // 采集/传输开销，对精度无益；CPU-only 笔记本上 720p 采集是白烧 CPU（sword-control 实证）
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      this.video = document.createElement('video');
      this.video.srcObject = this.stream;
      this.video.muted = true; this.video.playsInline = true;
      // track 结束（USB 掉线/被占用释放）→ 走重连
      this.stream.getVideoTracks().forEach(t => t.addEventListener('ended', () => {
        this.onHealth({ state: 'reconnecting', msg: '摄像头信号中断，正在恢复…' });
        this.restart();
      }));
      navigator.mediaDevices?.addEventListener?.('devicechange', () => {
        if (!this.stream?.active) { this.onHealth({ state: 'reconnecting', msg: '摄像头变化，正在重连…' }); this.restart(); }
      });
      await this.video.play();
      this.running = true;
      this._retries = 0;
      // 展厅亮光应对：摄像头支持手动曝光就压低补偿（多数消费级摄像头会静默忽略）
      try {
        const [vtrack] = this.stream.getVideoTracks();
        const caps = vtrack.getCapabilities ? vtrack.getCapabilities() : {};
        if (caps.exposureMode && caps.exposureMode.includes('manual')) {
          const ec = caps.exposureCompensation || {};
          const comp = Math.max(ec.min ?? -2, Math.min(ec.max ?? -1, -2));
          vtrack.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureCompensation: comp }] })
            .catch(() => {});
        }
      } catch (e) { /* 能力不支持则忽略 */ }
      this.onHealth({ state: 'ok', msg: '' });
      const loop = () => {
        if (!this.running) return;
        this._tick(performance.now());
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    } catch (e) {
      this.status = 'error: ' + e.message;
      console.error(e);
      const key = /denied|permission/i.test(e.name) ? 'denied'
        : /notfound|device.*not|overconstrained/i.test(e.name) ? 'missing'
        : /notreadable|track|busy/i.test(e.name) ? 'busy' : 'engine';
      this.onHealth({ state: 'error', kind: key, msg: e.message });
    }
  }

  _tick(nowMs) {
    const now = nowMs / 1000;
    let gotFrame = false;
    if (this.video && this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      this._lastFrameMs = nowMs;
      gotFrame = true;
      this._fpsCount++;
      if (this._fpsT === null) { this._fpsT = now; this._fpsCount = 0; }
      else if (now - this._fpsT >= 1) { this.fps = this._fpsCount / (now - this._fpsT); this._fpsCount = 0; this._fpsT = now; }
      // 亮光监测：每 0.5s 采样 16×12 缩略图平均亮度，过曝（>225）时通知 HUD 提醒
      if (now - this._lumaAt > 0.5) {
        this._lumaAt = now;
        try {
          if (!this._lumaCv) {
            this._lumaCv = document.createElement('canvas');
            this._lumaCv.width = 16; this._lumaCv.height = 12;
          }
          const c2 = this._lumaCv.getContext('2d', { willReadFrequently: true });
          c2.drawImage(this.video, 0, 0, 16, 12);
          const dd = c2.getImageData(0, 0, 16, 12).data;
          let sum = 0;
          for (let k = 0; k < dd.length; k += 4) sum += 0.299 * dd[k] + 0.587 * dd[k + 1] + 0.114 * dd[k + 2];
          const mean = sum / (dd.length / 4);
          const bright = mean > 225;
          if (bright !== this.brightWarn) { this.brightWarn = bright; this.onBrightWarn(bright, Math.round(mean)); }
        } catch (e) { /* 视频未就绪 */ }
      }
      let out;
      try {
        const res = this.landmarker.detectForVideo(this.video, nowMs);
        if (res.landmarks && res.landmarks.length) {
          // 预览骨骼用原始（未镜像）点；逻辑链路仍走镜像坐标
          this.rawHands = res.landmarks.map(h => h.map(p => ({ x: p.x, y: p.y })));
          // 统一镜像坐标：位置/手势/方向共用同一坐标系（只翻 x）
          const hands = res.landmarks.map(lms =>
            lms.map(p => ({ x: CFG.mirror ? 1 - p.x : p.x, y: p.y, z: p.z })));
          // 锁定手优选：双手时取离上一接受位置最近的手排第一
          //（MediaPipe 输出顺序会在两手间跳，会话锁要求连续）
          let locked = hands[0];
          if (hands.length > 1 && this.sx !== null) {
            const d = (h) => {
              const [px, py] = palmCenter(h);
              return Math.hypot(px - this.sx, py - this.sy);
            };
            locked = d(hands[0]) <= d(hands[1]) ? hands[0] : hands[1];
          }
          const other = hands.find(h => h !== locked) || null;
          const ordered = other ? [locked, other] : [locked];
          this._updateGesture(now, ordered);
          this.lockedLandmarks = locked;
          this._updateHandContext(locked, other);
          const [px, py] = palmCenter(locked);
          out = this.lock.update(now, true, px, py, palmSize(locked));
        } else {
          this.rawHands = [];
          out = this.lock.update(now, false, 0, 0, null);
          this._updateGesture(now, null);
          this.lockedLandmarks = null;
          this.hand2Nx = null;
        }
      } catch (e) {
        // 单帧推理失败不应杀死 rAF 链（docs/02 H2）；报健康态，下帧重试
        console.error('detectForVideo 失败', e);
        this.onHealth({ state: 'reconnecting', msg: '追踪失灵，正在恢复…' });
        out = this.lock.update(now, false, 0, 0, null);
      }
      this._consumeLock(now, out);
    } else if (this.video && this._lastFrameMs > 0 && nowMs - this._lastFrameMs > 600) {
      // 墙钟帧龄看门狗（在视频帧门控之外）：相机冻结/读帧挂起时强制走释放路径（docs/03 L1）
      if (!this.stalled) {
        this.stalled = true;
        this.onHealth({ state: 'stalled', msg: '摄像头信号中断，正在恢复…' });
      }
      const out = this.lock.update(this._lastFrameMs / 1000 + 0.7, false, 0, 0, null);
      this._consumeLock(now, out);
    }
    if (this.stalled && gotFrame) { this.stalled = false; this.onHealth({ state: 'ok', msg: '' }); }
    this._publish(now);
  }

  // 手势上下文：指向方向（腕→中指尖）、掌法向（食指根×小指根）、双手中心/间距
  //（sword-control updateHandTransform 同款，坐标系已镜像）
  _updateHandContext(locked, other) {
    const w = locked[0], mt = locked[12];
    const dx = mt.x - w.x, dy = mt.y - w.y, dz = mt.z - w.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    this.dirX = -dx / dl; this.dirY = -dy / dl; this.dirZ = -dz / dl;   // 原版取反（y-up 语义）
    const ib = locked[5], pb = locked[17];
    const v1x = ib.x - w.x, v1y = ib.y - w.y, v1z = ib.z - w.z;
    const v2x = pb.x - w.x, v2y = pb.y - w.y, v2z = pb.z - w.z;
    const nx = v1y * v2z - v1z * v2y;
    const ny = v1z * v2x - v1x * v2z;
    const nz = v1x * v2y - v1y * v2x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    this.palmNX = nx / nl; this.palmNY = ny / nl; this.palmNZ = nz / nl;
    if (other) {
      this.hand2Nx = (other[0].x + other[9].x) / 2;
      this.hand2Ny = (other[0].y + other[9].y) / 2;
      this.ncx = (locked[9].x + other[9].x) / 2;
      this.ncy = (locked[9].y + other[9].y) / 2;
      this.handDist = Math.abs(locked[9].x - other[9].x);
    }
  }

  // 手势分类（gesture.js）→ 三重抗抖 → onGesture（阵型切换）：
  // ① landmark One-Euro 滤波（亮光抖动主防线）②滑窗 5 帧多数票 ③非对称稳定计时
  //   （出手势 130ms 快切换 = 手感跟手；回 IDLE 350ms 慢释放 = 阵型不闪跳）。
  // landmarks 为 detectForVideo 的 res.landmarks（[[21], ...]）或 null（无手）。
  _updateGesture(now, landmarks) {
    let g;
    if (landmarks && landmarks.length) {
      const sm0 = this._gSm.apply(landmarks[0], now);      // 主手滤波
      let ordered;
      if (landmarks.length >= 2) {
        const sm1 = this._gSm2.apply(landmarks[1], now);   // 第二只手同滤波（合十稳定）
        ordered = [sm0, sm1];
      } else {
        this._gSm2.reset();
        ordered = [sm0];
      }
      g = detectGesture(sm0, ordered);
    } else {
      this._gSm.reset(); this._gSm2.reset();
      g = GESTURE.IDLE;
    }
    // 滑窗多数票：单帧误判被历史票数压掉（亮光环境第二道防线）
    const w = this._vote;
    w.push(g);
    if (w.length > 5) w.shift();
    let voted = g, best = 0;
    for (let a = 0; a < w.length; a++) {
      let c = 0;
      for (let b = 0; b < w.length; b++) if (w[b] === w[a]) c++;
      if (c > best || (c === best && a === w.length - 1)) { best = c; voted = w[a]; }
    }
    if (voted !== this._gCandidate) { this._gCandidate = voted; this._gSince = now; }
    if (voted !== this._gPublished) {
      // 非对称稳定阈值：进入阵型快（跟手手感），退回 IDLE 慢（防阵型闪跳）
      const hold = voted === GESTURE.IDLE
        ? FX.gestureIdleMs
        : (this._gPublished === GESTURE.IDLE ? FX.gestureEnterMs : FX.gestureStableMs);
      if ((now - this._gSince) * 1000 >= hold) {
        this._gPublished = voted;
        this.onGesture(voted);
      }
    }
  }

  // 会话锁输出 → 挥舞检测器。关键：只有"已接受帧"才喂检测器，
  // 被拒绝的他人手/遮挡空档不产生任何坐标点，跳变无法伪造速度。
  _consumeLock(now, out) {
    if (out.reset) this.detector.reset();
    this.phase = out.phase;
    this.cand = out.cand;
    this.present = out.present;
    if (out.present) {
      this.sx = out.x; this.sy = out.y;
      if (out.accepted) {
        this._lastAcceptedT = now;
        const swipe = this.detector.feed(now, true, out.x, out.y);
        if (swipe) this.onSwipe(swipe);
      }
    } else {
      this.detector.feed(now, false, 0, 0);
    }
  }

  // 发布状态给主循环（真机每 rAF、脚本每次注入）
  _publish(now) {
    const rawX = this.sx ?? 0.5, rawY = this.sy ?? 0.5;
    // 显示坐标过 One-Euro：慢速强滤波（阵型锚点不抖），快速自动放宽带宽（跟手不迟滞）
    let nx, ny;
    if (this.present) { [nx, ny] = this.oe.filter(rawX, rawY, now); }
    else { this.oe.reset(); nx = rawX; ny = rawY; }
    // 瞬时速度：从已接受帧历史取最近两点差分；手不在场或被拒帧空档归零（不再发布冻结速度）
    if (this.present && this.detector.hist.length >= 2 &&
        now - (this._lastAcceptedT ?? now) <= CFG.velocityWindow) {
      const h1 = this.detector.hist[this.detector.hist.length - 1];
      const h0 = this.detector.hist[this.detector.hist.length - 2];
      const dt = Math.max(h1.t - h0.t, 1e-3);
      this.vx = (h1.x - h0.x) / dt;
      this.vy = (h1.y - h0.y) / dt;
      this.speed = Math.hypot(this.vx, this.vy);
    } else {
      this.vx = 0; this.vy = 0; this.speed = 0;
    }
    this.onState({
      present: this.present, phase: this.phase, cand: this.cand,
      nx, ny, vx: this.vx, vy: this.vy, speed: this.speed, stalled: this.stalled,
      dir: { x: this.dirX, y: this.dirY, z: this.dirZ },
      normal: { x: this.palmNX, y: this.palmNY, z: this.palmNZ },
      hand2: (this.present && this.hand2Nx !== null) ? { x: this.hand2Nx, y: this.hand2Ny } : null,
      handsCenter: { x: this.ncx, y: this.ncy },
      handDist: this.handDist,
      landmarks: this.present ? this.lockedLandmarks : null,
    });
  }

  // 脚本化输入（与 Python 版 smoke 同一脚本）。t 为演示时间（秒）
  scriptAt(t) {
    let p = false, hx = 0.5, hy = 0.55;
    if (t >= 1.0 && t < 1.5) { p = true; hx = 0.5 + (t - 1.0) * 0.8; hy = 0.55; }
    else if (t >= 1.5 && t < 2.2) { p = true; hx = 0.9; hy = 0.55; }
    else if (t >= 2.2 && t < 2.65) { p = true; hx = 0.9 - (t - 2.2) * 0.8; hy = 0.55 - (t - 2.2) * 0.44; }
    else if (t >= 2.65 && t < 5.0) { p = true; hx = 0.54; hy = 0.35; }
    else if (t >= 5.0) { p = false; }
    const mx = CFG.mirror ? 1 - hx : hx;
    this._consumeLock(t, this.lock.update(t, p, mx, hy, null));
    this._publish(t);
  }

  // 脚本化输入（与 Python 版 smoke 同一脚本）
  _loopDemo() {
    const t0 = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.scriptAt((performance.now() - t0) / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
