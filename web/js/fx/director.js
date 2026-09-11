// FX 导演：大庚剑阵全景重构版
// 负责：大庚自适应广角摄像机 (CameraController) + 宏大星空灵气环境 + 500把万剑阵编排 + 齐发与特效联动
import * as THREE from 'three';
import { FX } from '../fx.config.js';
import { Environment } from './environment.js';
import { Volley } from './volley.js';
import { SparkField, Shockwaves } from './particles.js';
import { Sfx } from './audio.js';
import { OneEuro2D } from '../tracking.js';

// screenToWorld 热路径复用向量（每帧多次调用，禁止逐帧 new/clone）
const _sv = new THREE.Vector3();

// 展厅无人 attract 轮播：无人操作时按序循环阵型（驻留秒），
// steering 动力学自然聚散过渡——每次切换都是一次"万剑归宗"。
// 短暂误检只暂停不重置；连续在场 >2.5s 才算真人互动，人走后从剑莲重启。
//（09-11 用户反馈：①待机单调 ②误检导致后排阵型不出现 ③大庚不入轮播）
const ATTRACT_SEQ = [
  { g: 'IDLE', dwell: 8 },           // 剑莲
  { g: 'THUMB_UP', dwell: 12 },      // 冲天剑柱
  { g: 'DOUBLE_FIST', dwell: 18 },   // 八卦阵
  { g: 'SHAKA', dwell: 14 },         // 六芒星阵
  { g: 'HANDS_CUP', dwell: 14 },     // 聚能球
  { g: 'CROSSED_HANDS', dwell: 14 }, // 8字环
  { g: 'FIST', dwell: 12 },          // 剑盾护体
  { g: 'PALM_DOWN', dwell: 8 },      // 剑雨短过场
];

export class Director {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.env = new Environment(scene);
    this.volley = new Volley(scene);
    this.sparks = new SparkField(scene);
    this.rings = new Shockwaves(scene);
    this.sfx = new Sfx();

    // 交互状态
    this.phase = 'idle';
    this.cand = 0;
    this.present = false;
    this.nx = 0.5; this.ny = 0.5;
    this.speed = 0;
    this.fovKick = 0;
    this.handWorldPos = new THREE.Vector3(0, 0, 0);

    // 剑指（DRAGON）指尖/指根追踪专用 One-Euro 滤波：
    // 慢速强滤波杀 landmark 抖动（龙头不颤），快速自动放宽带宽（挥指零迟滞）
    this._tipOE = new OneEuro2D(2.4, 1.2, 1.0);
    this._baseOE = new OneEuro2D(1.6, 0.6, 1.0);

    // 大庚原版自适应摄像机状态
    this.smoothTarget = new THREE.Vector3(0, 0, 0);
    this.smoothCamPos = new THREE.Vector3(0, 5, 45);
    this.smoothLookAt = new THREE.Vector3(0, 0, 0);
    this.smoothZoom = 45;
    this.camera.position.set(0, 5, 45);
  }

  // 手势调度
  onGesture(g) {
    if (g === this._gesture) return;
    this._gesture = g;
    const [wx, wy, wz] = this.screenToWorld(this.nx, this.ny);
    this.volley.setMode(g, { x: wx, y: wy, z: wz });
  }

  // 透视反投影：从屏幕归一化坐标反投影到 Z=0 平面（大庚原版视角映射）
  screenToWorld(nx, ny) {
    const ndcX = (1 - nx) * 2 - 1;
    const ndcY = -(ny * 2 - 1);
    _sv.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const dist = -this.camera.position.z / (_sv.z || -1e-4);
    _sv.multiplyScalar(dist).add(this.camera.position);
    return [_sv.x, _sv.y, _sv.z || 0];
  }
  // 交互状态同步（由 tracker / main 回调传入）
  onState(s) {
    const prev = this.phase;
    this.phase = s.phase;
    this.cand = s.cand;
    this.present = s.present;
    this.nx = s.nx; this.ny = s.ny; this.speed = s.speed;
    this.vx = s.vx || 0; this.vy = s.vy || 0;
    this.handDist = s.handDist;
    this.palmDir = s.dir;
    this.palmN = s.normal;
    this.lm = s.landmarks;

    if (prev === 'candidate' && this.phase === 'locked') {
      this.sfx.chime();
    }
  }

  // 疾挥齐发（自研特色：调剑破空齐发）
  onSwipe(e) {
    // LETTERS（Molispark 隐藏字阵）不参与齐发——合十的微动/轻拍会撕碎字
    if (this.volley.formation === 'WATERFALL' || this.volley.formation === 'LETTERS') return;

    const a = this.camera.aspect;
    let wdx = e.dx * a, wdy = -e.dy;
    const l = Math.hypot(wdx, wdy) || 1; wdx /= l; wdy /= l;
    const [ox, oy] = this.screenToWorld(this.nx, this.ny);

    if (this.volley.formation === 'DRAGON' || this.volley.formation === 'TWO_FINGERS') {
      this.volley.launchCloud(wdx, wdy);
    } else {
      this.volley.burst(ox, oy, wdx, wdy, e.peak);
    }

    this.sparks.burst(ox, oy, 1.2, wdx, wdy);
    this.rings.add(ox, oy);
    this.fovKick = Math.min(1.0, 0.35 + 0.65 * Math.min(e.peak, 1.6));
    this.sfx.whoosh(e.peak);
  }

  // 选择性辉光选择集
  bloomTargets() {
    return [
      this.volley.mesh,
      this.volley.aura,

      this.volley.magicCircle.mesh,
      this.volley.divineLightning.mesh,
      ...this.volley.trails.map((t) => t.mesh),
      ...this.volley.hexLines,
      this.sparks.pts,
      ...this.rings.items.map((i) => i.mesh),
    ];
  }

  applyLowGlow(on) {
    if (this._lowGlow === !!on) return;
    this._lowGlow = !!on;
    const opacity = on ? 0.85 : 0.6;
    this.volley.auraMaterial.opacity = opacity;
  }

  update(dt, t) {
    // 1. 星空与灵气环境更新
    this.env.update(dt, t);

    // 2. 手部坐标反投影计算（大庚原版精确定位：护盾/莲花跟掌心，游龙/大庚跟食指尖）
    let targetPoint;
    let pointDir = null;
    const currentForm = this.volley.formation;
    if (this.lm && this.lm.length >= 21) {
      if (currentForm === 'DRAGON') {
        // 剑指：食中两指尖中心作为靶心，指尖方向作为朝向向量。
        // 09-11 动作追踪增强：靶心/指根各过一路 One-Euro——raw landmark 直接
        // 驱动时龙头随亮光抖动乱颤；慢速强滤波杀抖、挥动时带宽自动放宽不拖手。
        const tipX = (this.lm[8].x + this.lm[12].x) * 0.5;
        const tipY = (this.lm[8].y + this.lm[12].y) * 0.5;
        const baseX = (this.lm[5].x + this.lm[9].x) * 0.5;
        const baseY = (this.lm[5].y + this.lm[9].y) * 0.5;
        const [fTx, fTy] = this._tipOE.filter(tipX, tipY, t);
        const [fBx, fBy] = this._baseOE.filter(baseX, baseY, t);
        const [tx, ty] = this.screenToWorld(fTx, fTy);
        const [bx, by] = this.screenToWorld(fBx, fBy);
        const pdx = tx - bx, pdy = ty - by;
        const pdl = Math.hypot(pdx, pdy) || 1;
        pointDir = { x: pdx / pdl, y: pdy / pdl, z: 0 };
        targetPoint = { x: fTx, y: fTy };
      } else if (currentForm === 'SHIELD' || currentForm === 'LOTUS') {
        this._tipOE.reset(); this._baseOE.reset();
        targetPoint = {
          x: (this.lm[0].x + this.lm[9].x) * 0.5,
          y: (this.lm[0].y + this.lm[9].y) * 0.5,
        };
      } else {
        this._tipOE.reset(); this._baseOE.reset();
        targetPoint = this.lm[8];
      }
    } else {
      this._tipOE.reset(); this._baseOE.reset();
      targetPoint = { x: this.nx, y: this.ny };
    }

    const [wx, wy, wz] = this.screenToWorld(targetPoint.x, targetPoint.y);
    this.handWorldPos.set(wx, wy, wz);
    this.volley.setHands(
      { x: wx, y: wy, z: wz },
      null,
      null,
      this.handDist,
      this.palmDir,
      this.palmN,
      pointDir,
      { vx: this.vx, vy: this.vy, speed: this.speed || 0 }
    );
    if (this.present && currentForm === 'DRAGON') {
      this.volley.updatePath(this.handWorldPos);
    }
    if (this.forceGesture) {
      this.present = true;
      this._gesture = this.forceGesture;
      this.volley.setMode(this.forceGesture, { x: wx, y: wy, z: wz });
    } else if (this.present) {
      this.volley.setMode(this._gesture || 'IDLE', { x: wx, y: wy, z: wz });
      // 连续在场计时；误检闪帧只暂停轮播，不清进度（否则后排阵型永不出现）
      if (this._presentSince == null) this._presentSince = t;
      if (this._attract) this._attract.paused = true;
    } else if (this.phase !== 'candidate') {
      const longVisit = this._presentSince != null && (t - this._presentSince) > 2.5;
      this._presentSince = null;
      if (!this._attract || longVisit) {
        // 首次进入无人态 / 真人互动结束：从剑莲重新开播
        this._attract = { idx: 0, since: t, paused: false };
        this.volley.setMode(ATTRACT_SEQ[0].g, { x: 0, y: 0, z: 0 });
      } else {
        if (this._attract.paused) { this._attract.since = t; this._attract.paused = false; }
        if (t - this._attract.since >= ATTRACT_SEQ[this._attract.idx].dwell) {
          this._attract.idx = (this._attract.idx + 1) % ATTRACT_SEQ.length;
          this._attract.since = t;
          this.volley.setMode(ATTRACT_SEQ[this._attract.idx].g, { x: 0, y: 0, z: 0 });
        }
      }
    }
    this.volley.update(dt, t, this.present || this.phase === 'candidate');

    // 4. 粒子与音效
    this.sparks.update(dt);
    this.rings.update(dt);
    this.sfx.resume();

    // 5. 大庚原版 CameraController 自适应广角摄像机
    const bounds = this.volley.getFormationBounds();
    const gestureMode = this.volley.formation;

    // 动态缩放距离（大庚原版 22 ~ 55/75）
    const targetZoom = THREE.MathUtils.clamp(
      bounds.size * 1.2 + 18.0,
      22.0,
      gestureMode === 'DAGENG' ? 55.0 : 75.0
    );
    this.smoothZoom = THREE.MathUtils.lerp(this.smoothZoom, targetZoom, 0.025);

    // 摄像机跟随目标（大庚原版：跟踪时 0.7 衰减跟随）
    let followPoint;
    if (this.volley.formation === 'LETTERS') {
      // 隐藏字阵固定居中：相机看原点，不追手（字在画面正中）
      followPoint = new THREE.Vector3(
        Math.sin(t * 0.5) * 5.0,
        Math.cos(t * 0.3) * 3.0,
        0
      );
    } else if (this.present) {
      followPoint = new THREE.Vector3(
        this.handWorldPos.x * 0.7,
        this.handWorldPos.y * 0.7,
        0
      );
    } else {
      followPoint = new THREE.Vector3(
        Math.sin(t * 0.5) * 5.0,
        Math.cos(t * 0.3) * 3.0,
        0
      );
    }
    this.smoothTarget.lerp(followPoint, 0.025);

    // 计算摄像机位置与注视点（大庚原版精算）
    const desiredCamPos = new THREE.Vector3(
      this.smoothTarget.x * 0.25,
      this.smoothTarget.y * 0.15 + 3.0,
      this.smoothZoom
    );
    this.smoothCamPos.lerp(desiredCamPos, 0.025);
    this.camera.position.copy(this.smoothCamPos);

    const desiredLookAt = new THREE.Vector3(
      this.smoothTarget.x * 0.4,
      this.smoothTarget.y * 0.25,
      4.0
    );
    this.smoothLookAt.lerp(desiredLookAt, 0.025);
    this.camera.lookAt(this.smoothLookAt);

    // 齐发 FOV punch
    if (this.fovKick > 0.001) {
      this.fovKick = Math.max(0, this.fovKick - dt * 2.5);
      const fov = 50 + FX.fovKick * this.fovKick;
      if (Math.abs(this.camera.fov - fov) > 0.02) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
    } else if (Math.abs(this.camera.fov - 50) > 0.02) {
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    }
  }
}
