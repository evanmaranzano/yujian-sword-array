// 星空与灵气环境（融合大庚剑阵全景星宿与灵气粒子）
// 深邃夜空 + 2000 颗球面星辰 + 200 颗浮动灵气光点，纯正天青湛蓝仙道画风。
import * as THREE from 'three';

export class Environment {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // 1. 深邃夜空背景
    scene.background = new THREE.Color(0x030810);
    scene.fog = new THREE.Fog(0x030810, 50, 160);

    // 2. 微弱天青环境光
    this.ambientLight = new THREE.AmbientLight(0x4488ff, 0.25);
    scene.add(this.ambientLight);

    // 3. 星空：2000 颗天球星辰（大庚原版 R=80~120 球面分布）
    const starCount = 2000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 85 + Math.random() * 45;

      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);

      // 白色至淡蓝渐变
      const b = 0.55 + Math.random() * 0.45;
      starCol[i * 3] = b * 0.85;
      starCol[i * 3 + 1] = b * 0.95;
      starCol[i * 3 + 2] = b + Math.random() * 0.15;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.45,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this.starField = new THREE.Points(starGeo, starMat);
    this.group.add(this.starField);

    // 4. 灵气粒子（大庚原版 200 颗向上缓缓流动的灵光微粒）
    const pCount = 200;
    this.particleGeo = new THREE.BufferGeometry();
    this.particlePos = new Float32Array(pCount * 3);

    for (let i = 0; i < pCount; i++) {
      this.particlePos[i * 3] = (Math.random() - 0.5) * 80;
      this.particlePos[i * 3 + 1] = (Math.random() - 0.5) * 50;
      this.particlePos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }

    this.particleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePos, 3)
    );

    const pMat = new THREE.PointsMaterial({
      size: 0.28,
      color: 0x70f0ff,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.spiritParticles = new THREE.Points(this.particleGeo, pMat);
    this.group.add(this.spiritParticles);
  }

  update(dt, t) {
    // 星空缓慢自转
    this.starField.rotation.y = t * 0.01;

    // 灵气粒子向上漂移巡回
    const posArr = this.particleGeo.attributes.position.array;
    for (let i = 0; i < posArr.length / 3; i++) {
      posArr[i * 3 + 1] += (Math.sin(t * 1.5 + i) * 0.02 + 0.05) * 60 * dt;
      if (posArr[i * 3 + 1] > 26) {
        posArr[i * 3 + 1] = -26;
      }
    }
    this.particleGeo.attributes.position.needsUpdate = true;
  }
}
