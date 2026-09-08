// 隔空御剑 · 万剑归宗（Web 版，表现层重构后主引导）
// 主引导只负责：渲染器/资源加载/交互事件 → FX 导演/健康遮罩/HUD；
// 表现编排在 fx/director.js，交互脑在 lock.js/tracking.js（会话锁，勿绕过 accepted 帧）。
import * as THREE from 'three';
import { FX } from './fx.config.js';
import { CFG } from './config.js';
import { Director } from './fx/director.js';
import { PostFX } from './fx/postfx.js';
import { HandTracker } from './tracking.js';

const qs = new URLSearchParams(location.search);
const demo = qs.has('demo');
const prerollTo = parseFloat(qs.get('t') || '0') || 0;
const frozen = prerollTo > 0;    // 预滚后冻结在 t 时刻（确定性视觉 A/B/截图）
const debug = qs.has('debug');
const forceQ = qs.get('q');      // 'high' | 'low'：强制画质档（调试/截图）
const forceGesture = qs.get('gesture'); // 确定性截图：强制手势阵型
let ready = false;
const $ = (id) => document.getElementById(id);
document.body.classList.toggle('debug', debug);
if (debug) $('quality').classList.add('on');
if (qs.has('kiosk')) document.body.classList.add('kiosk');

const GESTURE_NAMES = {
  IDLE: '等待检测手势...',
  FIST: '握拳 - 万剑聚拢',
  TWO_FINGERS: '剑指 - 万剑成剑',
  OPEN_PALM: '出掌 - 万剑齐发',
  THUMB_UP: '点赞 - 冲天剑柱',
  SHAKA: '六字诀 - 六芒星阵',
  ROCK: 'Rock（食指+小指）- 双龙交织',
  PALM_DOWN: '下压 - 剑雨倾盆',
  CROSSED_HANDS: '双手交叉 - 8字环',
  HANDS_PUSH: '双手推开 - 爆裂波',
  HANDS_CUP: '双手捧起 - 聚能球',
  DOUBLE_FIST: '双拳 - 八卦阵',
};
const HAND_CONN = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];


// ---------------- 渲染器（设备像素长边封顶，docs/03 H5） ----------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
// 基准像素比（长边/dpr 双封顶），自适应画质在此基础上乘 quality.scale
const basePR = (() => {
  const dpr = Math.min(devicePixelRatio || 1, FX.maxDpr);
  const scale = Math.min(1, FX.maxDeviceLongEdge / (Math.max(innerWidth, innerHeight) * dpr));
  return Math.max(0.6, dpr * scale);
})();
renderer.setPixelRatio(basePR);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x04060d);
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 240);
camera.position.set(0, 0, 14);

let director, postfx, tracker, quality;

// ---------------- HUD/遮罩 ----------------
const ui = {
  phase: 'init',
  setPhase(phase) {
    this.phase = phase;
    document.body.dataset.phase = phase;
  },
  setGesture(g) {
    const el = $('gesture-text');
    if (el) el.textContent = GESTURE_NAMES[g] || g;
    const guide = $('gesture-guide');
    if (guide) for (const row of guide.querySelectorAll('.g')) row.classList.toggle('on', row.dataset.k === g);
  },
  health(h, tracker) {
    const ov = $('error');
    if (h.state === 'ok') { ov.classList.remove('on'); $('loading').classList.remove('on'); return; }
    if (h.state === 'starting') { $('loading').classList.add('on'); ov.classList.remove('on'); return; }
    const msg = {
      denied: 'CAMERA DENIED',
      missing: 'NO CAMERA',
      busy: 'CAMERA BUSY',
      stalled: 'SIGNAL LOST',
      reconnecting: 'RECONNECTING',
      engine: 'ENGINE FAILED',
    }[h.kind || h.state] || 'RETRYING';
    $('errorText').innerHTML = msg;
    ov.classList.add('on');
    $('loading').classList.remove('on');
    if (h.state === 'error' && (h.kind === 'denied' || h.kind === 'missing' || h.kind === 'engine')) {
      // 需用户介入的错误：显示手动重试
      $('retry').style.display = '';
    } else if (tracker && !this._autoTimer) {
      this._autoTimer = setTimeout(() => { this._autoTimer = 0; tracker.restart(); }, 3000);
    }
  },
};
$('retry').addEventListener('click', () => { $('error').classList.remove('on'); tracker?.restart(); });

const handCanvas = $('hand-canvas');
const handCtx = handCanvas.getContext('2d');
function drawHandOverlay(tracker) {
  const v = tracker.video;
  if (!v || v.readyState < 2) return;
  if (handCanvas.width !== v.videoWidth || handCanvas.height !== v.videoHeight) {
    handCanvas.width = v.videoWidth || 640;
    handCanvas.height = v.videoHeight || 480;
  }
  const w = handCanvas.width, h = handCanvas.height;
  handCtx.clearRect(0, 0, w, h);
  const hands = tracker.rawHands || [];
  for (let hi = 0; hi < hands.length; hi++) {
    const lms = hands[hi];
    const color = hi === 0 ? 'rgba(0,255,255,0.7)' : 'rgba(255,100,255,0.7)';
    handCtx.strokeStyle = color;
    handCtx.lineWidth = 2;
    for (const [a, b] of HAND_CONN) {
      const p1 = lms[a], p2 = lms[b];
      if (!p1 || !p2) continue;
      handCtx.beginPath();
      handCtx.moveTo(p1.x * w, p1.y * h);
      handCtx.lineTo(p2.x * w, p2.y * h);
      handCtx.stroke();
    }
    handCtx.fillStyle = hi === 0 ? '#00ffff' : '#ff66ff';
    handCtx.shadowColor = handCtx.fillStyle;
    handCtx.shadowBlur = 8;
    for (let i = 0; i < lms.length; i++) {
      const p = lms[i];
      handCtx.beginPath();
      handCtx.arc(p.x * w, p.y * h, [4, 8, 12, 16, 20].includes(i) ? 5 : 3, 0, Math.PI * 2);
      handCtx.fill();
    }
    handCtx.shadowBlur = 0;
  }
}


// ---------------- 自适应画质（CPU-only 笔记本兜底，sword-control 式零后处理退路） ----------------
// 采样窗口 FPS 低于阈值：先逐步降渲染分辨率（iGPU 填充率最贵），
// 降到下限仍不够再关 bloom pass（光晕由加色壳层补偿，director.applyLowGlow）；
// 持续流畅则逐级恢复。?q=high 锁定全效果，?q=low 直接进入低档。
class AdaptiveQuality {
  constructor(renderer, postfx, director) {
    this.renderer = renderer; this.postfx = postfx; this.director = director;
    this.q = FX.quality;
    this.scale = forceQ === 'low' ? this.q.resScaleMin : this.q.resScaleMax;
    this.bloomOff = forceQ === 'low';
    this._frames = 0; this._t = performance.now();
    this._downSince = null; this._upSince = null;
    this._apply();
  }
  _apply() {
    this.renderer.setPixelRatio(basePR * this.scale);
    this.postfx.setSize(innerWidth, innerHeight);
    this.postfx.setBloomEnabled(!this.bloomOff);
    this.director.applyLowGlow(this.bloomOff);
  }
  _stepDown(now) {
    if (this.scale > this.q.resScaleMin + 1e-3) {
      this.scale = Math.max(this.q.resScaleMin, this.scale - this.q.resStep);
    } else if (!this.bloomOff) {
      this.bloomOff = true;
    } else return;   // 已到底，不再动作
    this._apply();
    this._downSince = now;
  }
  _stepUp(now) {
    if (this.bloomOff) {
      this.bloomOff = false;
    } else if (this.scale < this.q.resScaleMax - 1e-3) {
      this.scale = Math.min(this.q.resScaleMax, this.scale + this.q.resStep);
    } else return;
    this._apply();
    this._upSince = now;
  }
  tick(now) {
    this._frames++;
    const el = now - this._t;
    if (el < this.q.sampleMs) return;
    const fps = this._frames * 1000 / el;
    this._frames = 0; this._t = now;
    if (fps < this.q.downFps) {
      this._upSince = null;
      if (this._downSince === null) this._downSince = now;
      else if (now - this._downSince >= this.q.holdDownMs) this._stepDown(now);
    } else if (fps > this.q.upFps) {
      this._downSince = null;
      if (this._upSince === null) this._upSince = now;
      else if (now - this._upSince >= this.q.holdUpMs) this._stepUp(now);
    } else {
      this._downSince = this._upSince = null;
    }
    if (debug) $('quality').textContent = `Q ${Math.round(this.scale * 100)}%${this.bloomOff ? ' 无辉光' : ''}`;
  }
}

// ---------------- 启动 ----------------
async function boot() {
  try {
    // 确保子集字体加载后再画 canvas 文字（诗句/法阵）
    if (document.fonts) {
      await Promise.all([
        document.fonts.load('16px "YujianKai"'),
        document.fonts.load('bold 150px "YujianKai"'),
      ]).catch(() => {});
      await document.fonts.ready;
    }
    director = new Director(scene, camera);
    postfx = new PostFX(renderer, scene, camera);
    postfx.add(...director.bloomTargets());
    if (forceGesture) director.onGesture(forceGesture);
    quality = new AdaptiveQuality(renderer, postfx, director);

    tracker = new HandTracker({
      demo, prerollTo,
      onSwipe: (e) => director.onSwipe(e),
      onState: (s) => {
        director.onState(s);
        ui.setPhase(s.phase);
      },
      onGesture: (g) => { director.onGesture(g); ui.setGesture(g); },
      onHealth: (h) => ui.health(h, tracker),
    });
    await tracker.start();
    if (!demo && tracker.video) {
      $('preview').insertBefore(tracker.video, handCanvas);
      $('preview').classList.add('on');
      $('gesture-status').classList.add('on');
      $('gesture-guide').classList.add('on');
    }
    $('status').textContent = demo ? '' : '追踪中';
    $('status').classList.toggle('on', !demo && debug);

    // 确定性预滚（无头截图用，固定步长、冻结在 t 时刻后再交 live）
    if (demo && prerollTo > 0) {
      const dt = 1 / 60;
      for (let t = 0; t <= prerollTo; t += dt) {
        tracker.scriptAt(t);
        director.update(dt, t);
      }
      if (qs.has('probe')) {
        const v = director.volley;
        const c = v.counts;
        let vis = 0;
        for (let i = 0; i < v.swordTotal; i++) if (v.scale[i] > 0.01) vis++;
        console.log(`PROBE formation=${v.formation} form=${c.form} fire=${c.fire} gather=${c.gather} ret=${c.ret} vis=${vis}`);
        for (let i = 0; i < 3; i++) {
          console.log(`PROBE i=${i} pos=(${v.px[i].toFixed(2)},${v.py[i].toFixed(2)},${v.pz[i].toFixed(2)}) scale=${v.scale[i].toFixed(3)}`);
        }
        console.log(`PROBE hand=(${v.handX.toFixed(2)},${v.handY.toFixed(2)}) bigFade=${v.bigFade.toFixed(2)}`);
      }
    }

    ready = true;
    $('loading').classList.remove('on');
  } catch (e) {
    console.error(e);
    $('loading').classList.remove('on');
    $('errorText').innerHTML = 'LOAD FAILED';
    $('retry').style.display = 'none';
    $('error').classList.add('on');
  }
}
boot();

// ---------------- 主循环 ----------------
let fpsT = performance.now(), fpsN = 0;
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (ready && director) {
    if (!frozen) {
      director.update(dt, t);
      // 自适应只在 auto 档生效；?q=high/low 强制档锁死
      if (quality && !forceQ && !document.hidden) quality.tick(performance.now());
    }
    postfx.render();
    if (!demo && tracker?.video) drawHandOverlay(tracker);
    if (debug) {
      fpsN++;
      const nowMs = performance.now();
      if (nowMs - fpsT > 500) {
        const fps = fpsN * 1000 / (nowMs - fpsT); fpsN = 0; fpsT = nowMs;
        $('status').textContent =
          `FPS ${fps.toFixed(0)}  追踪 ${(tracker.fps || 0).toFixed(0)}  剑阵 ${director.volley.swordTotal}  飞 ${director.volley.counts.fire}`;
      }
    }
  } else if (postfx) {
    postfx.render();
  }
}
animate();

// ---------------- resize / 按键 / 指针 ----------------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx?.setSize(innerWidth, innerHeight);
});
addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  } else if (debug && (e.key === 's' || e.key === 'S')) {
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = 'yujian.png'; a.click();
  } else if (debug && (e.key === 'm' || e.key === 'M')) {
    CFG.mirror = !CFG.mirror; tracker.resetSession();
  }
});
// kiosk 静止 2s 隐指针
let pointerTimer;
addEventListener('pointermove', () => {
  document.body.classList.remove('cursor-off');
  clearTimeout(pointerTimer);
  pointerTimer = setTimeout(() => document.body.classList.add('cursor-off'), 2000);
});
