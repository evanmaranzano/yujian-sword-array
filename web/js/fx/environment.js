// 星空夜景（sword-control 风格）：深蓝黑背景 + 2000 白点球面星空。
// 删除原墨韵金辉环境（墨空/月/山/云海/雾/尘/流星/诗句）。
import * as THREE from 'three';
import { FX } from '../fx.config.js';

function softDotTexture(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Environment {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.moving = [];

    // ---- 深蓝黑背景（sword-control 0x000011） ----
    scene.background = new THREE.Color(FX.ink.bg);
    scene.fog = null; // 无雾

    // ---- 星空：2000 白点球面分布 ----
    const starCount = FX.stars.count;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const radius = FX.stars.radiusMin + Math.random() * (FX.stars.radiusMax - FX.stars.radiusMin);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = radius * Math.cos(phi);
      sizes[i] = Math.random() * 2 + 0.5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: FX.ink.starfield,   // v6 修复：原引用 FX.stars.color 未定义（靠默认白色侥幸工作）
      size: FX.stars.size,
      map: softDotTexture(),
      transparent: true,
      opacity: FX.stars.opacity,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.starField = new THREE.Points(geo, mat);
    this.starField.frustumCulled = false;
    this.group.add(this.starField);

    // 缓慢旋转星空（极慢，避免晕眩）
    this.rotationSpeed = FX.stars.rotationSpeed;
  }

  update(dt, t) {
    // 星空极慢旋转
    this.starField.rotation.y += this.rotationSpeed * dt;
    this.starField.rotation.x += this.rotationSpeed * 0.3 * dt;
  }
}
