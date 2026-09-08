// FX 导演：交互层只发归一化事件，导演负责全部表现编排（docs/04 §5.2）。
// 三态：idle（天幕剑阵自演）→ candidate（驻留确认）→ locked（本命剑/跟手/齐发）。
// 锁定光圈已去掉：有人时默认剑阵中心跟手。
import * as THREE from 'three';
import { FX } from '../fx.config.js';
import { Environment } from './environment.js';
import { Volley } from './volley.js';
import { HeroSword } from './hero.js';
import { SparkField, Shockwaves } from './particles.js';
import { Sfx } from './audio.js';

const CAM_Z = 14, BASE_FOV = 50;

export class Director {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.VIEW_H = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));

    this.env = new Environment(scene);
    this.volley = new Volley(scene);
    this.hero = new HeroSword(scene);
    this.sparks = new SparkField(scene);
    this.rings = new Shockwaves(scene);
    this.sfx = new Sfx();

    this.phase = 'idle';
    this.cand = 0;
    this.present = false;
    this.nx = 0.5; this.ny = 0.5;
    this.speed = 0;
    this.fovKick = 0;
    this.emitAcc = 0;
    this._lastPhase = 'idle';
  }

  // 手势 → 阵型调度（GESTURE 枚举字符串，gesture.js 输出）。
  // 手位为世界坐标锚点；无手时以画面中心为阵型中心。
  onGesture(g) {
    if (g === this._gesture) return;
    this._gesture = g;
    const [wx, wy] = this.screenToWorld(this.nx, this.ny);
    this.volley.setMode(g, { x: wx, y: wy });
  }

  screenToWorld(nx, ny) {
    return [(nx - 0.5) * this.VIEW_H * this.camera.aspect, (0.5 - ny) * this.VIEW_H];
  }

  // ---------- 交互事件（由 main 从 tracker 回调接入） ----------
  onState(s) {
    const prev = this.phase;
    this.phase = s.phase;
    this.cand = s.cand;
    this.present = s.present;
    this.nx = s.nx; this.ny = s.ny; this.speed = s.speed;
    this.s2 = s;   // 手势上下文（dir/normal/hand2/handsCenter/handDist）

    // acquired 边沿（candidate→locked）
    if (prev === 'candidate' && this.phase === 'locked') {
      const [wx, wy] = this.screenToWorld(this.nx, this.ny);
      this.hero.summon(wx, wy);
      this.sfx.chime();
    }
  }

  onSwipe(e) {
    // 瀑布（OPEN_PALM）本身就是持续的齐发，挥手触发会让剑群互相拉扯，整段屏蔽
    if (this.volley.formation === 'WATERFALL') return;
    // 宽高比校正（修 docs/04 M-ANGLE：视频 4:3 归一化 → 世界各向异性方向）
    const a = this.camera.aspect;
    let wdx = e.dx * a, wdy = -e.dy;
    const l = Math.hypot(wdx, wdy) || 1; wdx /= l; wdy /= l;
    const [ox, oy] = this.screenToWorld(this.nx, this.ny);

    this.volley.burst(ox, oy, wdx, wdy, e.peak);
    this.sparks.burst(ox, oy, 0.9, wdx, wdy);
    this.rings.add(ox, oy);
    this.fovKick = Math.min(1, 0.35 + 0.65 * Math.min(e.peak, 1.6));
    this.sfx.whoosh(e.peak);
  }

  // 选择性辉光选择集（只让剑/法阵发光，山月不入 bloom）。
  // postprocessing 的 selection 图层不向 Group 子节点传播，需收集叶级渲染体。
  bloomTargets() {
    const leaves = (o, acc) => {
      o.traverse(c => {
        if ((c.isMesh || c.isSprite || c.isPoints) && c !== o) acc.push(c);
      });
      return acc;
    };
    const out = [
      this.volley.mesh, this.volley.meshMid, this.volley.meshOuter,
      ...leaves(this.volley.bigSword, []),
      ...this.volley.hexLines,
      ...this.volley.trails.map(t => t.mesh),
      ...leaves(this.hero.group, []),
      this.hero.trail.mesh,
      this.sparks.pts,
      ...this.rings.items.map(i => i.mesh),
    ];
    return out;
  }

  // 低画质（bloom 关闭）光晕补偿：加厚三处能量剑的光晕壳不透明度，补回泛光损失
  applyLowGlow(on) {
    if (this._lowGlow === !!on) return;
    this._lowGlow = !!on;
    const E = FX.energySword, L = FX.energySwordLow;
    const mid = this._lowGlow ? L.midOpacity : E.midOpacity;
    const outer = this._lowGlow ? L.outerOpacity : E.outerOpacity;
    const apply = (group) => {
      group.traverse(o => {
        if (!o.isMesh) return;
        if (o.userData.layer === 'mid') o.material.opacity = mid;
        else if (o.userData.layer === 'outer') o.material.opacity = outer;
      });
    };
    apply(this.hero.group);
    apply(this.volley.bigSword);
    this.volley.meshMid.material.opacity = mid;
    this.volley.meshOuter.material.opacity = outer;
  }

  update(dt, t) {
    this.env.update(dt, t);

    const [wx, wy] = this.screenToWorld(this.nx, this.ny);
    // 手势上下文注入（第二只手/双手中心/指向/掌法向，世界坐标）
    let hand2w = null, hcw = null;
    if (this.s2) {
      if (this.s2.hand2) {
        const [h2x, h2y] = this.screenToWorld(this.s2.hand2.x, this.s2.hand2.y);
        hand2w = { x: h2x, y: h2y };
      }
      if (this.s2.handsCenter) {
        const [hcx, hcy] = this.screenToWorld(this.s2.handsCenter.x, this.s2.handsCenter.y);
        hcw = { x: hcx, y: hcy };
      }
    }
    this.volley.setHands({ x: wx, y: wy }, hand2w, hcw,
      this.s2?.handDist, this.s2?.dir, this.s2?.normal);

    // BIG_SWORD 时本命剑退场让位（0.6s 宽限抗手势抖动）
    const heroHere = this.present && this.volley.formation !== 'BIG_SWORD';
    this.hero.update(dt, t, { x: wx, y: wy, present: heroHere });

    this.volley.update(dt, t, this.present || this.phase === 'candidate');
    // 手势阵型切换（即时跟手；无手时保持上次锚点）
    if (this.present) this.volley.setMode(this._gesture || 'IDLE', { x: wx, y: wy });

    // 本命剑高速移动：沿轨迹迸青蓝星火（替代旧的喷射小剑）
    if (this.present && this.hero.fade > 0.4 && this.hero.speed > 3.2) {
      const [px0, py0, px1, py1] = this.hero.segment();
      this.emitAcc += Math.min(this.hero.speed / 9, 1.4) * 70 * dt;
      let n = Math.floor(this.emitAcc);
      if (n > 4) n = 4;
      for (let k = 0; k < n; k++) {
        const f = Math.random();
        this.sparks.burst(px0 + (px1 - px0) * f, py0 + (py1 - py0) * f, 1.0,
          this.hero.vx, this.hero.vy, 1);
      }
      this.emitAcc -= n;
    } else this.emitAcc = 0;

    this.sparks.update(dt);
    this.rings.update(dt);



    // 镜头：呼吸 + 齐发 FOV punch（连续缓动，不用白噪震屏）
    const breath = FX.cameraBreath;
    this.camera.position.set(
      Math.sin(t * 0.18) * breath * 0.4,
      Math.sin(t * 0.13) * breath * 0.25,
      CAM_Z);
    if (this.fovKick > 0.001) {
      this.fovKick = Math.max(0, this.fovKick - dt * 2.6);
      const fov = BASE_FOV + FX.fovKick * this.fovKick;
      if (Math.abs(this.camera.fov - fov) > 0.02) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    } else if (Math.abs(this.camera.fov - BASE_FOV) > 0.02) {
      this.camera.fov = BASE_FOV; this.camera.updateProjectionMatrix();
    }

    this.sfx.resume();
  }
}
