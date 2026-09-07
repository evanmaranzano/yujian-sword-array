// 锁定光标反馈（消费会话锁三态 + acquired 事件，补 docs/03 L9）：
// idle 隐藏；candidate 青环向指尖收敛（驻留进度可见）；locked 指尖青点 + 细环；
// acquired 瞬间浮现青色篆文「劍來」。取代旧靶心双环。
import * as THREE from 'three';
import { FX } from '../fx.config.js';

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(210,245,255,1)');
  g.addColorStop(0.35, 'rgba(90,200,255,0.5)');
  g.addColorStop(1, 'rgba(0,110,200,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sealTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(210,245,255,0.9)');
  g.addColorStop(0.5, 'rgba(90,200,255,0.4)');
  g.addColorStop(1, 'rgba(0,110,200,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Reticle {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    // 收敛青环（candidate）
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.52, 64),
      new THREE.MeshBasicMaterial({ color: FX.ink.swordCore, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending }));
    // locked 细环
    this.ringThin = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.35, 64),
      new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dot = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.dot.scale.set(0.9, 0.9, 1);
    this.seal = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sealTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.seal.position.set(0, 1.6, 0.1);
    this.seal.scale.set(3.4, 1.7, 1); this.seal.userData = { age: 9 };
    this.group.add(this.ring, this.ringThin, this.dot, this.seal);
    this._pulse = 0;
  }

  acquire() { this.seal.userData.age = 0; }

  update(dt, t, phase, cand, x, y) {
    void x; void y;
    this.seal.userData.age += dt;
    const sa = this.seal.userData.age;
    if (sa < 0.9) {
      this.seal.visible = true;
      const k = sa / 0.9;
      this.seal.position.y = 1.6 + k * 1.2;
      this.seal.material.opacity = Math.sin(k * Math.PI) * 0.95;
      const s = 2.8 + k * 0.8; this.seal.scale.set(s, s * 0.5, 1);
    } else this.seal.visible = false;

    if (phase === 'idle') { this.group.visible = false; return; }
    this.group.visible = true;
    this.group.position.set(x, y, 1.3);
    this._pulse += dt * 6;

    if (phase === 'candidate') {
      // 由大向指尖收敛：1-cand 决定半径
      const r = 1.35 - cand * 0.85;
      this.ring.scale.setScalar(Math.max(0.5, r));
      this.ring.material.opacity = 0.35 + cand * 0.55;
      this.ring.rotation.z = t * 1.4;
      this.ringThin.material.opacity = 0;
      this.dot.material.opacity = 0;
    } else {
      this.ring.material.opacity = 0;
      const breathe = 1 + 0.12 * Math.sin(this._pulse);
      this.ringThin.scale.setScalar(breathe);
      this.ringThin.material.opacity = 0.5;
      this.dot.material.opacity = 0.9;
    }
  }
}
