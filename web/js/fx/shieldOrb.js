// 剑盾护体 · 护体玄光灵盾（SHIELD 模式专属）
// 配合大庚剑阵世界尺度（护盾半径 18），在掌心构筑巍峨半透明天青双层护体光盾。
import * as THREE from 'three';

export class ShieldOrb {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // 内层灵气核心球 - 天青透白
    this.innerMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.innerMesh = new THREE.Mesh(
      new THREE.SphereGeometry(15.5, 32, 24),
      this.innerMat
    );
    this.group.add(this.innerMesh);

    // 外层护体光晕 - 湛蓝辉光，BackSide 渲染提供深邃轮廓光
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glowMesh = new THREE.Mesh(
      new THREE.SphereGeometry(18.0, 32, 24),
      this.glowMat
    );
    this.group.add(this.glowMesh);

    this.opacity = 0;
    this.targetOpacity = 0;
  }

  setMode(active) {
    this.targetOpacity = active ? 0.85 : 0.0;
  }

  update(dt, t, center) {
    const k = 1 - Math.exp(-9.0 * dt);
    this.opacity += (this.targetOpacity - this.opacity) * k;

    if (this.opacity < 0.01) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;
    if (center) {
      this.group.position.set(center.x, center.y, center.z || 0);
    }

    // 呼吸脉动
    const pulse = 1.0 + Math.sin(t * 3.5) * 0.03;
    this.innerMesh.scale.set(pulse, pulse, pulse);
    this.glowMesh.scale.set(pulse * 1.04, pulse * 1.04, pulse * 1.04);

    this.innerMesh.rotation.y = t * 0.35;
    this.glowMesh.rotation.y = -t * 0.25;
    this.innerMesh.rotation.x = t * 0.2;

    this.innerMat.opacity = this.opacity * 0.42;
    this.glowMat.opacity = this.opacity * 0.55;
  }
}
