// 辟邪神雷 · 灵电游弧（大庚剑阵专属电光）
// 在大庚剑阵诸剑之间跳跃穿梭的青蓝高压灵电，持续闪耀与高频电弧跳变。
import * as THREE from 'three';

export class DivineLightning {
  constructor(scene, maxSegments = 160) {
    this.maxSegments = maxSegments;
    this.geometry = new THREE.BufferGeometry();
    const posArray = new Float32Array(maxSegments * 3 * 2);
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(posArray, 3)
    );

    this.material = new THREE.LineBasicMaterial({
      color: 0x67e8f9, // 高亮天青电光
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new THREE.LineSegments(this.geometry, this.material);
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.intensity = 0;
    this.targetIntensity = 0;
  }

  setMode(active) {
    this.targetIntensity = active ? 1.0 : 0.0;
  }

  update(dt, t, positions, count) {
    const k = 1 - Math.exp(-6.0 * dt);
    this.intensity += (this.targetIntensity - this.intensity) * k;

    if (this.intensity < 0.05 || !positions || count < 2) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;

    const posAttr = this.geometry.attributes.position;
    const arr = posAttr.array;
    let idx = 0;

    // 绘制 50 ~ 120 条高频跳跃的高压电弧
    const lineCount = Math.floor(40 + this.intensity * (this.maxSegments - 45));
    const maxDist = 28.0;
    const jitter = 0.35 + this.intensity * 0.45;

    let linesDrawn = 0;
    for (let i = 0; i < count && linesDrawn < lineCount; i += 3) {
      // 随机跳跃连接剑对
      const seed = Math.sin(t * 18.0 + i * 3.7);
      const step = 1 + (Math.abs(Math.floor(seed * 23)) % 19);
      const targetI = (i + step) % count;
      if (targetI === i) continue;

      const p1 = positions[i];
      const p2 = positions[targetI];
      if (!p1 || !p2) continue;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const dist = Math.hypot(dx, dy, dz);

      if (dist > 1.5 && dist < maxDist) {
        const jx = (Math.sin(t * 35.0 + i * 7.1) - 0.5) * jitter * dist * 0.08;
        const jy = (Math.cos(t * 30.0 + i * 5.3) - 0.5) * jitter * dist * 0.08;
        const jz = (Math.sin(t * 40.0 + i * 3.7) - 0.5) * jitter * dist * 0.08;

        // 起点 -> 中继拐点 -> 终点
        arr[idx++] = p1.x;
        arr[idx++] = p1.y;
        arr[idx++] = p1.z;

        arr[idx++] = (p1.x + p2.x) * 0.5 + jx;
        arr[idx++] = (p1.y + p2.y) * 0.5 + jy;
        arr[idx++] = (p1.z + p2.z) * 0.5 + jz;

        linesDrawn++;
        if (linesDrawn >= lineCount) break;

        arr[idx++] = (p1.x + p2.x) * 0.5 + jx;
        arr[idx++] = (p1.y + p2.y) * 0.5 + jy;
        arr[idx++] = (p1.z + p2.z) * 0.5 + jz;

        arr[idx++] = p2.x;
        arr[idx++] = p2.y;
        arr[idx++] = p2.z;

        linesDrawn++;
      }
    }

    while (idx < arr.length) arr[idx++] = 0;
    posAttr.needsUpdate = true;
    this.material.opacity = Math.min(1.0, 0.6 + 0.4 * Math.sin(t * 20.0)) * this.intensity;
  }
}
