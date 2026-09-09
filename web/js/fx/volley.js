// 万剑阵 · 大庚剑阵 1:1 原版动力学与形态驱动（深度融合蓝色仙道美学与挥剑齐发）
// 1. 500 把大庚原版飞剑精密几何体与双 InstancedMesh 网格
// 2. 原版世界坐标系（R_shield=18, R_lotus=24, R_dageng=30, Z_cam=35~75）
// 3. 原版 Boids 到达减速动力学 + 分离力 + 300点历史路径延展 (extendPath)
// 4. 四大手势绝阵 1:1 动态还原（剑盾护体/莲花现世/大庚剑阵/游龙随行）
// 5. 保留自研特性：疾挥万剑齐发 (Swipe Burst) + 剑气流光拖尾 + 纯正青蓝星空色系
import * as THREE from 'three';
import { FX } from '../fx.config.js';
import { TrailRenderer } from './trail.js';
import { buildDagengSwordGeometry, buildDagengAuraGeometry } from './swordModel.js';
import { MagicCircle } from './magicCircle.js';
import { DivineLightning } from './divineLightning.js';

const simplex = {
  noise3D: (x, y, z) =>
    Math.sin(x * 1.2 + y * 0.8) *
    Math.cos(y * 1.1 + z * 0.9) *
    Math.sin(z * 0.7 + x * 1.3),
};

// 热循环共享临时向量（999 剑 × 60fps 下逐剑 new 会造成 GC 抖动 = "手感不够实时"）
const _tgt = new THREE.Vector3();
const _look = new THREE.Vector3();
const _des = new THREE.Vector3();
const _steer = new THREE.Vector3();
const _sep = new THREE.Vector3();

const MOBILE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || window.innerWidth < 768;

export const CONFIG = {
  swordCount: MOBILE ? 400 : 999,
  pathHistoryLength: 300,
  maxSpeed: 25,
  sprintSpeed: 50,
  steerForce: 28,
  separationDist: 3,
  separationForce: 10,
  noiseScale: 0.3,
  noiseStrength: 1,
  shieldRadius: 18,
  shieldOrbitSpeed: 2.5,
  lotusRadius: 24,
  lotusRotateSpeed: 2.5,
  dagengRadius: 30,
  dagengHeight: 20,
  dagengRotateSpeed: 0.2,
};

const FORMATION = {
  IDLE: 'LOTUS',
  FIST: 'SHIELD',
  TWO_FINGERS: 'DRAGON',
  OPEN_PALM: 'LOTUS',
  THUMB_UP: 'PILLAR',
  SHAKA: 'HEXAGRAM',
  ROCK: 'DAGENG',
  PALM_DOWN: 'RAIN',
  DOUBLE_FIST: 'BAGUA',   // v7 恢复自研八卦卦符阵（v6d），大庚剑阵归 ROCK
  CROSSED_HANDS: 'INFINITY',
  HANDS_PUSH: 'EXPLODE',
  HANDS_CUP: 'ENERGY_BALL',
};

export class Volley {
  constructor(scene) {
    this.scene = scene;
    this.swordTotal = CONFIG.swordCount;
    this.max = this.swordTotal;

    // 1. 大庚原版飞剑几何体与光环
    const geometry = buildDagengSwordGeometry();
    const auraGeometry = buildDagengAuraGeometry();

    // 纯正青蓝仙道色板
    this.material = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.9,
    });

    this.auraMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.InstancedMesh(geometry, this.material, this.swordTotal);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.aura = new THREE.InstancedMesh(auraGeometry, this.auraMaterial, this.swordTotal);
    this.aura.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.aura.frustumCulled = false;
    scene.add(this.aura);

    this.meshMid = this.aura;
    this.meshOuter = this.aura;

    // 2. 特效子系统
    this.magicCircle = new MagicCircle(scene);
    this.divineLightning = new DivineLightning(scene, 100);

    // 3. 物理状态（大庚原版 Vector3 阵列）
    this.positions = [];
    this.velocities = [];
    this.dummy = new THREE.Object3D();

    for (let i = 0; i < this.swordTotal; i++) {
      this.positions.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 10 - 5
        )
      );
      this.velocities.push(new THREE.Vector3());
    }

    // 4. 历史路径
    this.pathHistory = [];
    for (let k = 0; k < CONFIG.pathHistoryLength; k++) {
      this.pathHistory.push(new THREE.Vector3(0, 0, 0));
    }
    this.lastDirection = new THREE.Vector3(0, 0, 0);
    this._origin = new THREE.Vector3(0, 0, 0);

    // 5. 交互状态
    this.formation = 'LOTUS';
    this.handPos = new THREE.Vector3(0, 0, 0);
    this.isTracking = false;

    // 6. 齐发爆发系统（自研优势保留）
    this.burstMode = new Uint8Array(this.swordTotal);
    this.burstAge = new Float32Array(this.swordTotal);
    this.burstLife = new Float32Array(this.swordTotal);
    this.scl = new Float32Array(this.swordTotal).fill(1);   // 按剑尺度（八卦/大庚主剑等非均匀缩放）
    this._cursor = 0;

    // 8. 双手上下文（聚能球/双手阵型用）
    this.handsCX = 0; this.handsCY = 0; this.handsDist = 0.3;

    // 7. 剑气拖尾（SlashSaber）
    this.trails = [];
    this.trailFree = [];
    for (let k = 0; k < 12; k++) {
      const mat = TrailRenderer.createGlowMaterial(
        new THREE.Color(0.4, 0.9, 1.0),
        new THREE.Color(0.0, 0.45, 1.0)
      );
      mat.uniforms.headColor.value.set(0.4, 0.9, 1.0, 0.6);
      const tr = new TrailRenderer(scene, false);
      tr.initialize(mat, 22, false, 0.9, null, null);
      tr.user = { idx: -1 };
      scene.add(tr.mesh);
      tr.deactivate();
      this.trails.push(tr);
      this.trailFree.push(tr);
    }

    // 兼容对象
    this.bigSword = new THREE.Group();
    this.bigSword.visible = false;
    scene.add(this.bigSword);
    this.hexLines = [];
  }

  setMode(gesture, handPos) {
    const f = FORMATION[gesture] || 'LOTUS';
    if (handPos) {
      this.handPos.set(handPos.x, handPos.y, handPos.z || 0);
    }
    if (f === this.formation) return;
    this.formation = f;
    // 入场动作：爆裂波沿斐波那契球面赋予径向初速（steering 会把剑群收回手位）
    if (f === 'EXPLODE') {
      const N = this.swordTotal;
      for (let i = 0; i < N; i++) {
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const phi = Math.acos(1 - (2 * (i + 0.5)) / N);
        const sp = 30 + Math.random() * 18;
        this.velocities[i].set(
          Math.sin(phi) * Math.cos(theta) * sp,
          Math.cos(phi) * sp,
          Math.sin(phi) * Math.sin(theta) * sp * 0.6
        );
      }
    }
  }

  setHands(hand, hand2, handsCenter, handsDist, dir, palmN) {
    if (hand) {
      this.handPos.set(hand.x, hand.y, hand.z || 0);
    }
    if (handsCenter) { this.handsCX = handsCenter.x; this.handsCY = handsCenter.y; }
    this.handsDist = handsDist || 0.3;
  }

  // 大庚原版历史路径延展
  extendPath() {
    if (this.lastDirection.length() < 0.01) return;
    const last = this.pathHistory[0];
    const newPoint = last.clone().add(this.lastDirection.clone().multiplyScalar(0.3));
    this.pathHistory.pop();
    this.pathHistory.unshift(newPoint);
  }

  // 大庚原版历史路径更新
  updatePath(pos) {
    const last = this.pathHistory[0];
    const diff = pos.clone().sub(last);
    const dist = diff.length();
    if (dist > 0.1) {
      this.lastDirection.copy(diff.normalize());
      this.pathHistory.pop();
      this.pathHistory.unshift(pos.clone());
    }
  }

  // 疾挥齐发（本仓库自研优势：从阵中抽 120 剑疾射飞掠长空再归阵）
  burst(ox, oy, dx, dy, peak) {
    const count = Math.min(120, this.swordTotal);
    const perpx = -dy, perpy = dx;
    for (let k = 0; k < count; k++) {
      const i = (this._cursor++) % this.swordTotal;
      this.burstMode[i] = 1;
      this.burstAge[i] = 0;
      this.burstLife[i] = 1.6 + Math.random() * 0.8;
      const sp = 75.0 + Math.random() * 25.0;
      const u = (k / (count - 1) || 0) - 0.5;
      this.velocities[i].set((dx + perpx * u * 0.25) * sp, (dy + perpy * u * 0.25) * sp, (Math.random() - 0.5) * 6.0);

      if (k < 8 && this.trailFree.length) {
        const tr = this.trailFree.pop();
        tr.user.idx = i;
        tr.age = 0;
        tr.reset();
        tr.activate();
      }
    }
  }

  launchCloud(dx, dy) {
    const sp = 70.0 + Math.random() * 15.0;
    let trails = 0;
    for (let i = 0; i < this.swordTotal; i++) {
      this.burstMode[i] = 1;
      this.burstAge[i] = 0;
      this.burstLife[i] = 1.5 + Math.random() * 0.8;
      const w = (Math.random() - 0.5) * 0.15;
      this.velocities[i].set((dx - dy * w) * sp, (dy + dx * w) * sp, (Math.random() - 0.5) * 6.0);
      if (i < 8 && this.trailFree.length) {
        const tr = this.trailFree.pop();
        tr.user.idx = i;
        tr.age = 0;
        tr.reset();
        tr.activate();
        trails++;
      }
    }
    return trails;
  }

  // 供 CameraController 计算自适应包围圈
  getFormationBounds() {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < this.swordTotal; i++) {
      const p = this.positions[i];
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }

    const center = new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 0.5;
    return { center, size: Math.max(8.0, Math.min(size, 45.0)) };
  }

  update(dt, t, personPresent) {
    this.isTracking = !!personPresent;
    const time = t;
    const delta = 1 / 60; // 大庚原版固定 60fps 积分步长，手感最平稳丝滑

    // 1. 无手势时自动盘旋（默认 LOTUS）
    let currentTarget = this.handPos;
    if (!this.isTracking) {
      currentTarget = this._origin;
      this.pathHistory.pop();
      this.pathHistory.unshift(this._origin.clone());
    } else if (this.formation === 'DRAGON') {
      this.extendPath();
    }

    const gestureMode = this.formation;
    const dummy = this.dummy;

    // 2. 逐剑更新（大庚原版 1:1 精密物理与阵型数学）
    for (let i = 0; i < this.swordTotal; i++) {
      const pos = this.positions[i];
      const vel = this.velocities[i];
      const target = _tgt.set(0, 0, 0);

      // 齐发爆发飞行中的飞剑处理
      if (this.burstMode[i] === 1) {
        this.burstAge[i] += dt;
        pos.addScaledVector(vel, dt);
        if (this.burstAge[i] >= this.burstLife[i]) {
          this.burstMode[i] = 2; // 归阵
        }
        dummy.position.copy(pos);
        dummy.lookAt(pos.clone().add(vel));
        dummy.scale.set(1.0, 1.0, 1.0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        this.aura.setMatrixAt(i, dummy.matrix);
        continue;
      } else if (this.burstMode[i] === 2) {
        const dxx = currentTarget.x - pos.x, dyy = currentTarget.y - pos.y, dzz = currentTarget.z - pos.z;
        const d = Math.hypot(dxx, dyy, dzz) + 1e-4;
        vel.x += (dxx / d * 45.0 - vel.x) * Math.min(1, 6 * dt);
        vel.y += (dyy / d * 45.0 - vel.y) * Math.min(1, 6 * dt);
        vel.z += (dzz / d * 45.0 - vel.z) * Math.min(1, 6 * dt);
        pos.addScaledVector(vel, dt);
        if (d < 5.0) {
          this.burstMode[i] = 0;
        }
        dummy.position.copy(pos);
        dummy.lookAt(pos.clone().add(vel));
        dummy.scale.set(1.0, 1.0, 1.0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        this.aura.setMatrixAt(i, dummy.matrix);
        continue;
      }

      // ============ 大庚四大绝阵数学 ============
      if (gestureMode === 'SHIELD' && this.isTracking) {
        // ---- 护盾模式：R=18 斐波那契球高速公转 ----
        const phi = Math.acos(1 - (2 * (i + 0.5)) / CONFIG.swordCount);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;

        const orbitX =
          CONFIG.shieldRadius *
          Math.sin(phi) *
          Math.cos(theta + time * CONFIG.shieldOrbitSpeed);
        const orbitY =
          CONFIG.shieldRadius *
          Math.sin(phi) *
          Math.sin(theta + time * CONFIG.shieldOrbitSpeed);
        const orbitZ = CONFIG.shieldRadius * Math.cos(phi);

        const rotatedX =
          orbitX * Math.cos(time * 0.3) - orbitZ * Math.sin(time * 0.3);
        const rotatedZ =
          orbitX * Math.sin(time * 0.3) + orbitZ * Math.cos(time * 0.3);

        target.set(
          currentTarget.x + rotatedX,
          currentTarget.y + orbitY,
          currentTarget.z + rotatedZ
        );
        target.x += Math.sin(time * 3 + i) * 0.2;
        target.y += Math.cos(time * 3 + i * 0.7) * 0.2;
      } else if (
        gestureMode === 'LOTUS' ||
        (gestureMode === 'LOTUS' && !this.isTracking)
      ) {
        // ---- 莲花模式：斐波那契黄金角螺旋，中心镂空 ----
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const maxRadius = CONFIG.lotusRadius;
        const minRadius = 6;

        const tr = i / (CONFIG.swordCount - 1);
        const rRatio = Math.sqrt(tr);
        const r = minRadius + (maxRadius - minRadius) * rRatio;

        const theta = i * goldenAngle + time * CONFIG.lotusRotateSpeed;
        const breathe = 1 + Math.sin(time * 2) * 0.05;
        const currentR = r * breathe;

        const x = currentR * Math.cos(theta);
        const y = currentR * Math.sin(theta);
        const z = Math.sin(time * 2 + i * 0.1) * 0.2;

        target.set(
          currentTarget.x + x,
          currentTarget.y + y,
          currentTarget.z + z
        );
      } else if (gestureMode === 'BAGUA') {
        // ---- 八卦阵（自研 v6d 卦符阵，v7 回归）：中心阴阳环 + 8 卦×3 直爻 ----
        const nRing = 183, perRow = 34;
        const rot = time * 0.15;
        const TRIG = [7, 6, 2, 4, 0, 1, 5, 3];
        const sq = 0.94;
        if (i < nRing) {
          const a = (i / nRing) * Math.PI * 2 + rot * 0.6;
          const r = 1.3;
          target.set(
            currentTarget.x + Math.cos(a) * r,
            currentTarget.y + Math.sin(a) * r * sq,
            currentTarget.z + 0.5
          );
          _look.set(
            target.x - Math.sin(a),
            target.y + Math.cos(a) * sq,
            target.z + 0.1
          );
        } else {
          const idx = i - nRing;
          const row = idx % 24;
          const k = Math.floor(idx / 24);
          const gi = Math.floor(row / 3);
          const yao = row % 3;
          const yang = (TRIG[gi] >> yao) & 1;
          const ga = gi * Math.PI / 4 + rot;
          const Rg = 6.5;
          const gx = currentTarget.x + Math.cos(ga) * Rg;
          const gy = currentTarget.y + Math.sin(ga) * Rg * sq;
          let tx = -Math.sin(ga), ty = Math.cos(ga) * sq;
          const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          let ux = Math.cos(ga), uy = Math.sin(ga) * sq;
          const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
          const tang = (k / (perRow - 1) - 0.5) * 1.5;
          let xoff = tang, yoff = (yao - 1) * 1.4;
          if (!yang) {
            const half = k < perRow / 2 ? -1 : 1;
            const kk = k % (perRow / 2);
            xoff = half * 1.0 + (kk / (perRow / 2 - 1) - 0.5) * 1.2;
          }
          const jit = Math.sin(i * 12.9898) * 0.025;
          target.set(
            gx + tx * (xoff + jit) + ux * yoff,
            gy + ty * (xoff + jit) + uy * yoff,
            currentTarget.z + 0.45 + yao * 0.02
          );
          _look.set(target.x + tx, target.y + ty, target.z + 0.12);
        }
      } else if (gestureMode === 'PILLAR') {
        // ---- 冲天剑柱：5 层圆柱面螺旋，能量波沿柱流动 ----
        const layers = 5;
        const n = Math.ceil(this.swordTotal / layers);
        const li = Math.floor(i / n);
        const k2 = i % n;
        const ang = (k2 / n) * Math.PI * 2 + time * 0.6;
        const hr = li / layers;
        const r = 3.5 + Math.sin(time * 3 + hr * Math.PI * 2) * 0.6;
        target.set(
          currentTarget.x + Math.cos(ang) * r,
          currentTarget.y + hr * 18 - 6,
          currentTarget.z + Math.sin(ang) * r
        );
        _look.set(target.x, target.y + 5, target.z);
      } else if (gestureMode === 'HEXAGRAM') {
        // ---- 六芒星：6 顶点星芒簇 ----
        const n = Math.ceil(this.swordTotal / 6);
        const vi = Math.floor(i / n) % 6;
        const k3 = i % n;
        const ang = time * 0.48 + vi * Math.PI / 3;
        const vx = currentTarget.x + Math.cos(ang) * 8.5;
        const vy = currentTarget.y + Math.sin(ang) * 8.5 * 0.8;
        const vz = currentTarget.z + Math.sin(ang) * 4;
        const sa = (k3 / n) * Math.PI * 2 + time * 1.8;
        const sp2 = (k3 / n) * Math.PI;
        const sr = 1.4;
        target.set(
          vx + Math.sin(sp2) * Math.cos(sa) * sr,
          vy + Math.cos(sp2) * sr,
          vz + Math.sin(sp2) * Math.sin(sa) * sr
        );
        _look.set(currentTarget.x, currentTarget.y, currentTarget.z);
      } else if (gestureMode === 'RAIN') {
        // ---- 剑雨：目标恒在下方 30 单位追坠，落底回顶 ----
        target.set(
          pos.x + Math.sin(i * 7.3) * 0.8,
          pos.y - 30,
          pos.z + Math.cos(i * 3.1) * 0.8
        );
        if (pos.y < -24) {
          pos.y = 24 + Math.random() * 8;
          pos.x = currentTarget.x + (Math.random() - 0.5) * 26;
          pos.z = (Math.random() - 0.5) * 8;
        }
        _look.set(pos.x, pos.y - 5, pos.z);
      } else if (gestureMode === 'INFINITY') {
        // ---- 8 字环：Lissajous 轨道 ----
        const ph = (i / this.swordTotal) * Math.PI * 2 + time * 0.6;
        target.set(
          currentTarget.x + 11 * Math.sin(ph),
          currentTarget.y + 5 * Math.sin(ph * 2),
          currentTarget.z + 3 * Math.cos(ph)
        );
        const p2 = ph + 0.08;
        _look.set(
          currentTarget.x + 11 * Math.sin(p2),
          currentTarget.y + 5 * Math.sin(p2 * 2),
          currentTarget.z + 3 * Math.cos(p2)
        );
      } else if (gestureMode === 'ENERGY_BALL') {
        // ---- 聚能球：双手间斐波那契球面，半径随双手间距 ----
        const R = Math.max(3, Math.min(this.handsDist * 26 + 2, 11));
        const theta = Math.PI * (1 + Math.sqrt(5)) * i + time * 0.9;
        const phi = Math.acos(1 - (2 * (i + 0.5)) / this.swordTotal);
        target.set(
          this.handsCX + R * Math.sin(phi) * Math.cos(theta),
          this.handsCY + 1.4 + R * Math.cos(phi),
          currentTarget.z + R * Math.sin(phi) * Math.sin(theta) * 0.5
        );
        _look.set(this.handsCX, this.handsCY + 1.4, currentTarget.z);
      } else if (gestureMode === 'EXPLODE') {
        // ---- 爆裂波：setMode 已播种径向初速，目标=手位（steering 拉回）----
        target.copy(currentTarget);
        _look.set(
          pos.x + this.velocities[i].x,
          pos.y + this.velocities[i].y,
          pos.z + this.velocities[i].z
        );
      } else if (gestureMode === 'DAGENG' && this.isTracking) {
        // ---- 大庚剑阵：0号主剑巨大化6x，其余10层同心圆柱倒悬 ----
        if (i === 0) {
          const centralHeight = currentTarget.y + 5;
          target.set(currentTarget.x, centralHeight, currentTarget.z);
        } else {
          const effectiveI = i - 1;
          const effectiveCount = CONFIG.swordCount - 1;

          const layerCount = 10;
          const perLayer = Math.max(1, Math.floor(effectiveCount / layerCount));
          const layerIdx = Math.floor(effectiveI / perLayer);
          const idxInLayer = effectiveI % perLayer;

          const radius = CONFIG.dagengRadius + layerIdx * 1.5 + 2;
          const dir = layerIdx % 2 === 0 ? 1 : -1;
          const theta =
            (idxInLayer / perLayer) * Math.PI * 2 +
            time * CONFIG.dagengRotateSpeed * dir;

          const hCenter = currentTarget.y - 10;
          const hRange = CONFIG.dagengHeight;
          const hRand = Math.sin(effectiveI * 13.1) * 0.5 + 0.5;
          const height = hCenter + (hRand - 0.5) * hRange;

          target.set(
            currentTarget.x + Math.cos(theta) * radius,
            height,
            currentTarget.z + Math.sin(theta) * radius
          );
        }
      } else {
        // ---- 游龙模式：沿历史轨迹滑动 + 3D Simplex 噪声 ----
        if (i < 5) {
          target.copy(currentTarget);
          target.x += Math.sin(time * 8 + i) * 0.3;
          target.y += Math.cos(time * 8 + i) * 0.3;
        } else {
          const pathIdx = i * 0.8;
          const idxA = Math.min(Math.floor(pathIdx), this.pathHistory.length - 1);
          const idxB = Math.min(idxA + 1, this.pathHistory.length - 1);
          const alpha = pathIdx - Math.floor(pathIdx);

          if (this.pathHistory[idxA] && this.pathHistory[idxB]) {
            target.lerpVectors(this.pathHistory[idxA], this.pathHistory[idxB], alpha);
          } else if (this.pathHistory[idxA]) {
            target.copy(this.pathHistory[idxA]);
          } else {
            target.copy(currentTarget);
          }

          target.x += Math.sin(time * 10 + i * 0.5) * 0.2;
          target.y += Math.cos(time * 10 + i * 0.5) * 0.2;

          const ns = CONFIG.noiseScale;
          const na =
            CONFIG.noiseStrength * (0.8 + Math.sin(time * 2 + i * 0.05) * 0.4);
          target.x += simplex.noise3D(pos.x * ns, pos.y * ns, time) * na;
          target.y += simplex.noise3D(pos.y * ns, pos.z * ns, time + 100) * na;
          target.z += simplex.noise3D(pos.z * ns, pos.x * ns, time + 200) * na;
        }
      }

      // ============ 大庚原版 Boids 到达减速动力学 ============
      // 自研密集图形阵（八卦/剑柱/六芒/剑雨/8字/爆裂/聚能球）用"低速 18 + 高转向力 4x +
      // 近距 6 减速"：原版冲刺 50 + 转向上限 28/s 会对静态目标产生 ±10 级永久过冲振荡，
      // 图形散架成横带（v7 实测）。
      const ours =
        gestureMode === 'BAGUA' || gestureMode === 'PILLAR' ||
        gestureMode === 'HEXAGRAM' || gestureMode === 'RAIN' ||
        gestureMode === 'INFINITY' || gestureMode === 'ENERGY_BALL' ||
        gestureMode === 'EXPLODE';
      const arriveR = ours ? 6 : 10;
      let speed = ours
        ? 18
        : (gestureMode === 'SHIELD' ? CONFIG.sprintSpeed : CONFIG.maxSpeed);
      const distT = target.distanceTo(pos);
      if (distT > 4) speed = ours ? 18 : CONFIG.sprintSpeed;
      else if (distT < 1) speed = distT * CONFIG.maxSpeed;

      const desired = _des.copy(target).sub(pos);
      const d = desired.length();

      if (d > 0) {
        desired.normalize();
        if (d < arriveR) {
          desired.multiplyScalar(speed * (d / arriveR));
        } else {
          desired.multiplyScalar(speed);
        }
      }

      const steer = _steer.copy(desired).sub(vel);
      const steerFactor = ours
        ? 4
        : (gestureMode === 'SHIELD' || gestureMode === 'LOTUS' ? 3 : 1);
      steer.clampLength(0, CONFIG.steerForce * delta * steerFactor);

      vel.add(steer);

      // 分离力：只用于大庚四绝阵的疏阵列（DRAGON 龙身/DAGENG 柱阵/未跟手的莲花散布）。
      // 八卦爻线、剑柱、8 字环等自研阵型是密集实线排布（剑距 <0.1），分离力会把图形推散。
      const sepOn =
        gestureMode === 'DRAGON' || gestureMode === 'DAGENG' ||
        (gestureMode === 'LOTUS' && !this.isTracking);
      if (i > 0 && sepOn) {
        const prev = this.positions[i - 1];
        const diff = _sep.copy(pos).sub(prev);
        const dDiff = diff.length();
        if (dDiff < CONFIG.separationDist && dDiff > 0.01) {
          diff.normalize().multiplyScalar(CONFIG.separationForce * delta);
          vel.add(diff);
        }
      }

      pos.addScaledVector(vel, delta);

      dummy.position.copy(pos);

      // 朝向计算
      let lookTarget;
      if (
        gestureMode === 'BAGUA' || gestureMode === 'PILLAR' ||
        gestureMode === 'HEXAGRAM' || gestureMode === 'RAIN' ||
        gestureMode === 'INFINITY' || gestureMode === 'ENERGY_BALL' ||
        gestureMode === 'EXPLODE'
      ) {
        lookTarget = _look;   // 自研阵型在目标计算分支里已写入期望朝向点
      } else if (gestureMode === 'SHIELD' && this.isTracking) {
        if (vel.length() > 0.1) {
          lookTarget = pos.clone().add(vel.clone().normalize());
        } else {
          const relPos = pos.clone().sub(currentTarget);
          const tangent = new THREE.Vector3(-relPos.z, 0, relPos.x).normalize();
          lookTarget = pos.clone().add(tangent);
        }
      } else if (gestureMode === 'LOTUS') {
        const outward = pos.clone().sub(currentTarget).normalize();
        lookTarget = pos.clone().add(outward);
      } else if (gestureMode === 'DAGENG' && this.isTracking) {
        lookTarget = pos.clone().add(new THREE.Vector3(0, -1, 0));
      } else {
        lookTarget = pos
          .clone()
          .add(vel.length() > 0.1 ? vel : new THREE.Vector3(0, 0, -1));
      }
      dummy.lookAt(lookTarget);

      // 按剑尺度平滑过渡（大庚主剑 6x/阵剑 1.5x；八卦环细剑）
      let targetScale = 1;
      if (gestureMode === 'DAGENG' && this.isTracking) {
        targetScale = i === 0 ? 6 : 1.5;
      } else if (gestureMode === 'BAGUA') {
        targetScale = i < 183 ? 0.45 : 0.5;
      }

      const lerpSpeed = i === 0 && gestureMode === 'DAGENG' ? 0.6 : 2.0;
      this.scl[i] += (targetScale - this.scl[i]) * Math.min(1, lerpSpeed * dt);
      const newScale = this.scl[i];

      dummy.scale.set(newScale, newScale, newScale);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);

      // 辟邪神雷光环（护盾模式与主剑常驻，其余高频闪烁）
      const isActive =
        gestureMode === 'SHIELD'
          ? Math.sin(time * 30 + i * 0.5) > 0.0
          : Math.sin(time * 20 + i * 0.7) > 0.3;

      const auraScale = newScale * (isActive ? 1.3 : 1.0);

      if (!isActive && !(i === 0 && gestureMode === 'DAGENG')) {
        dummy.scale.set(0, 0, 0);
      } else {
        dummy.scale.set(auraScale, auraScale, auraScale);
      }

      dummy.updateMatrix();
      this.aura.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(newScale, newScale, newScale);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.aura.instanceMatrix.needsUpdate = true;

    // 3. 特效子系统随动
    this.magicCircle.setMode(gestureMode === 'DAGENG' && this.isTracking);
    this.magicCircle.update(dt, t, currentTarget);

    this.divineLightning.setMode(gestureMode === 'DAGENG' && this.isTracking);
    this.divineLightning.update(dt, t, this.positions, this.swordTotal);

    // 4. 拖尾跟随
    for (const tr of this.trails) {
      const i = tr.user.idx;
      if (i < 0 || this.burstMode[i] === 0) {
        if (tr.active) {
          tr.age = (tr.age || 0) + dt;
          const a = Math.max(0, 0.6 * (1 - (tr.age - 0) / 0.5));
          tr.material.uniforms.headColor.value.w = a;
          if (tr.age > 0.6) { tr.deactivate(); tr.user.idx = -1; tr.reset(); }
        }
        continue;
      }
      if (!tr.active) { tr.activate(); tr.age = 0; }
      const vel = this.velocities[i];
      if (vel.length() > 0.5) {
        const p = this.positions[i];
        const vNorm = vel.clone().normalize();
        const tip = p.clone().addScaledVector(vNorm, 1.5);
        const side = new THREE.Vector3(-vNorm.y, vNorm.x, 0).normalize().multiplyScalar(0.8);
        tr.advanceWorld(tip, side);
      }
    }
  }

  get activeCount() { return this.swordTotal; }
}
