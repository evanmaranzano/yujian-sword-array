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
let ready = false;
const $ = (id) => document.getElementById(id);
document.body.classList.toggle('debug', debug);
if (qs.has('kiosk')) document.body.classList.add('kiosk');

// ---------------- 渲染器（设备像素长边封顶，docs/03 H5） ----------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
(function capPixels() {
  const dpr = Math.min(devicePixelRatio || 1, FX.maxDpr);
  const scale = Math.min(1, FX.maxDeviceLongEdge / (Math.max(innerWidth, innerHeight) * dpr));
  renderer.setPixelRatio(Math.max(0.6, dpr * scale));
})();
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x04060d);
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 240);
camera.position.set(0, 0, 14);

let director, postfx, tracker;

// ---------------- HUD/遮罩 ----------------
const ui = {
  phase: 'init',
  setPhase(phase) {
    this.phase = phase;
    document.body.dataset.phase = phase;
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

    tracker = new HandTracker({
      demo, prerollTo,
      onSwipe: (e) => director.onSwipe(e),
      onState: (s) => {
        director.onState(s);
        ui.setPhase(s.phase);
      },
      onGesture: (g) => director.onGesture(g),
      onHealth: (h) => ui.health(h, tracker),
    });
    await tracker.start();
    if (!demo && debug && tracker.video) {
      $('preview').appendChild(tracker.video);
      $('preview').classList.add('on');
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
    if (!frozen) director.update(dt, t);
    postfx.render();
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
