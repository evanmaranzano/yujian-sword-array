// 本命剑（华夏仙道神剑）：四面双刃菱形剑身、起棱带脊、云纹飞翼剑格、配重剑首
// 内核天青 0x80f8ff / 光晕湛蓝 0x0088ff / 外层幽蓝 0x0044dd，保留青蓝仙道色系。
// 弹簧跟手、全程限速，刃尖挂青色 ribbon 剑气（0x00aaff）。
import * as THREE from 'three';
import { FX } from '../fx.config.js';
import { TrailRenderer } from './trail.js';
import { buildChineseSwordGeometry } from './swordModel.js';

// 程序化华夏仙剑：四面双刃剑体 + 双层剑气光晕壳
// 几何体沿 +Y 轴自然立起，剑尖朝向 +Y。
export function buildEnergySword(E = FX.energySword) {
  const g = new THREE.Group();

  // 1. 实体剑身核心（四面双刃、剑脊起棱、飞翼剑格、配重剑首）
  const coreGeo = buildChineseSwordGeometry({ isAura: false, scale: 0.95 });
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x80f8ff,
    transparent: true,
    opacity: E.coreOpacity || 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.userData.layer = 'core';
  g.add(coreMesh);

  // 2. 中层剑气光晕（微包裹刃身与剑格）
  const midGeo = buildChineseSwordGeometry({ isAura: true, scale: 1.02 });
  const midMat = new THREE.MeshBasicMaterial({
    color: E.midColor || 0x0088ff,
    transparent: true,
    opacity: E.midOpacity || 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const midMesh = new THREE.Mesh(midGeo, midMat);
  midMesh.userData.layer = 'mid';
  g.add(midMesh);

  // 3. 外层浩瀚剑气光晕
  const outerGeo = buildChineseSwordGeometry({ isAura: true, scale: 1.18 });
  const outerMat = new THREE.MeshBasicMaterial({
    color: E.outerColor || 0x0044dd,
    transparent: true,
    opacity: E.outerOpacity || 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  outerMesh.userData.layer = 'outer';
  g.add(outerMesh);

  // 4. 剑尖灵珠聚光
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: E.tipOpacity || 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  tip.position.y = 2.45 * 0.95;
  g.add(tip);
  return g;
}

export class HeroSword {
  constructor(scene) {
    this.scene = scene;
    this.group = buildEnergySword();
    this.group.traverse(o => { if (o.isMesh) o.renderOrder = 4; });
    this.group.visible = false;
    scene.add(this.group);

    // 刃尖挂点（跟随剑本体的世界矩阵）：剑长 1.2 的一半
    // 刃尖挂点（跟随剑本体世界矩阵）：剑长约 2.33
    this.tip = new THREE.Object3D();
    this.tip.position.set(0, 2.35, 0);
    this.group.add(this.tip);
    // 青色拖尾（sword-control 0x00aaff）
    const mat = TrailRenderer.createGlowMaterial(
      new THREE.Color(0.5, 0.85, 1.0), new THREE.Color(0.0, 0.4, 1.0));
    mat.uniforms.headColor.value.set(0.5, 0.85, 1.0, 0.7);
    this.trail = new TrailRenderer(scene, false);
    this.trail.initialize(mat, FX.hero.trailLength, false, FX.hero.trailWidth, null, this.tip);
    scene.add(this.trail.mesh);
    this.trail.deactivate();
    this._trailFade = 0;

    this.state = 'gone';
    this.leaveAge = 0;
    this.fade = 0;
    this.x = 0; this.y = 0; this.z = 1.2;
    this.vx = 0; this.vy = 0;
    this.px = 0; this.py = 0;
    this.roll = 0;
    this.from = { x: 0, y: 0, z: FX.hero.arriveFromZ };
    this.target = { x: 0, y: 0 };
    this.orientQ = new THREE.Quaternion();
    this.speed = 0;
  }

  // acquired 事件驱动（不再靠 present 上升沿）
  summon(tx, ty) {
    this.state = 'arrive';
    this.leaveAge = 0;
    this._arriveAge = 0;
    this.from = { x: tx + 7, y: ty + 5, z: FX.hero.arriveFromZ };
    this.x = this.from.x; this.y = this.from.y; this.z = this.from.z;
    this.px = this.x; this.py = this.y;
    this.vx = 0; this.vy = 0;
  }

  release() {
    this.trail.deactivate();
    this.trail.reset();
    this._trailFade = 0;
  }

  update(dt, t, hand) {
    if (hand.present) {
      this.target.x = hand.x; this.target.y = hand.y;
      this.leaveAge = 0;
      if (this.state === 'gone') this.summon(hand.x, hand.y);
    } else if (this.state !== 'gone') {
      this.leaveAge += dt;   // 独立停留计时（修 M-AGE）
      if (this.leaveAge > 0.6) { this.state = 'gone'; this.release(); }
    }

    const maxV = FX.hero.maxSpeed;
    if (this.state === 'gone') {
      this.fade = Math.max(0, this.fade - dt * 4);
    } else {
      this.fade = Math.min(1, this.fade + dt * 4);
      this.px = this.x; this.py = this.y;

      if (this.state === 'arrive') {
        const prog = Math.min(this.age01(dt), 1);
        const ease = 1 - Math.pow(1 - prog, 3);   // easeOutCubic
        const nx = this.from.x + (this.target.x - this.from.x) * ease;
        const ny = this.from.y + (this.target.y - this.from.y) * ease;
        const nz = this.from.z + (1.2 - this.from.z) * ease;
        this._stepTo(nx, ny, nz, dt, maxV);
        if (prog >= 1) this.state = 'follow';
      } else {
        const stiff = FX.hero.follow;
        this.vx += (this.target.x - this.x) * stiff * dt;
        this.vy += (this.target.y - this.y) * stiff * dt;
        const damp = Math.exp(-7.5 * dt);
        this.vx *= damp; this.vy *= damp;
        this._stepTo(this.x + this.vx * dt, this.y + this.vy * dt, 1.2, dt, maxV);
      }
    }

    this.speed = Math.hypot(this.vx, this.vy);
    this.roll += this.speed * dt * 0.6 + dt * 0.8;

    if (this.speed > 0.9) {
      _v.set(this.vx / this.speed, this.vy / this.speed, 0);
      this.orientQ.setFromUnitVectors(_Y, _v);
      _qs.setFromAxisAngle(_v, this.roll);
      this.orientQ.multiply(_qs);
    } else {
      _v.set(Math.sin(t * 0.8) * 0.12, 1, Math.cos(t * 0.62) * 0.08).normalize();
      this.orientQ.setFromUnitVectors(_Y, _v);
    }

    const sc = FX.hero.scale * (0.55 + 0.45 * this.fade) * (1 + 0.02 * Math.sin(t * 3));
    this.group.visible = this.fade > 0.01;
    if (this.group.visible) {
      this.group.position.set(this.x, this.y, this.z);
      this.group.quaternion.copy(this.orientQ);
      this.group.scale.setScalar(sc);

      this.group.updateWorldMatrix(true, false);
      if (this.state !== 'gone') {
        if (this.speed > 1.2 || this.state === 'arrive') {
          this.trail.activate();
          this.trail.advance();
          this._trailFade = 1;
        } else {
          this._trailFade = Math.max(0, this._trailFade - dt * 3);
          this.trail.material.uniforms.headColor.value.w = 0.7 * this._trailFade;
          if (this._trailFade <= 0) this.trail.deactivate();
        }
      }
    }
  }

  // arrive 进度（内部计时，独立于墙钟）
  age01(dt) {
    this._arriveAge = (this._arriveAge ?? 0) + dt;
    return this._arriveAge / FX.hero.arriveDur;
  }

  // 限速位移（arrive/follow 共用，docs/04 N6）
  _stepTo(nx, ny, nz, dt, maxV) {
    let dx = nx - this.x, dy = ny - this.y, dz = nz - this.z;
    const d = Math.hypot(dx, dy, dz);
    const maxD = maxV * dt;
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; dz *= maxD / d; }
    this.vx = dx / Math.max(dt, 1e-4); this.vy = dy / Math.max(dt, 1e-4);
    this.x += dx; this.y += dy; this.z += dz;
  }

  segment() { return [this.px, this.py, this.x, this.y]; }
}

const _v = new THREE.Vector3();
const _qs = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0);
