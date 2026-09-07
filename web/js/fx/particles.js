// 青蓝火花粒子（池化 Points，sword-control 色系）+ 克制的青色剑意环（半径封顶 3.4）
import * as THREE from 'three';
import { FX } from '../fx.config.js';

function sparkTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(220,250,255,1)');
  g.addColorStop(0.35, 'rgba(120,210,255,0.7)');
  g.addColorStop(1, 'rgba(0,120,220,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SparkField {
  constructor(scene, max = 600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x9fdcff, size: 0.3, map: sparkTexture(), transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.pts.frustumCulled = false;
    scene.add(this.pts);
    this.cursor = 0;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = 9999;
  }

  burst(x, y, z, dx, dy, n = FX.sparksPerBurst) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 2.0;
      const sp = 3 + Math.random() * 10;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z ?? 0.8;
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = Math.sin(a) * sp;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      this.life[i] = this.maxLife[i] = 0.3 + Math.random() * 0.4;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = 9999; continue; }
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 1 - 2.5 * dt;
      this.vel[i * 3 + 1] *= 1 - 2.5 * dt;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
  }
}

export class Shockwaves {
  constructor(scene) {
    this.items = [];
    this.geo = new THREE.RingGeometry(0.97, 1.0, 72);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
        color: FX.ink.swordTrail, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      m.visible = false; m.renderOrder = 6;
      scene.add(m);
      this.items.push({ mesh: m, age: 9, delay: i % 2 === 0 ? 0 : 0.08, ox: 0, oy: 0 });
    }
  }
  add(x, y) {
    const it = this.items.find(i => i.age > FX.ringLife + i.delay) || this.items[0];
    it.age = -it.delay; it.ox = x; it.oy = y;
  }
  update(dt) {
    for (const it of this.items) {
      if (it.age > FX.ringLife + it.delay) { it.mesh.visible = false; continue; }
      it.age += dt;
      if (it.age < 0) { it.mesh.visible = false; continue; }
      const k = it.age / FX.ringLife;
      const r = 0.5 + k * FX.ringMaxRadius;
      it.mesh.visible = true;
      it.mesh.position.set(it.ox, it.oy, 0.9);
      it.mesh.scale.setScalar(r);
      it.mesh.material.opacity = 0.55 * (1 - k) * (1 - k);
    }
  }
}
