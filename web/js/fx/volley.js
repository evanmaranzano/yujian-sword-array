// 万剑阵：300 把程序化能量光剑三层 InstancedMesh（内核青/光晕蓝/外层青蓝，共享矩阵）。
// 有人时阵型中心跟手（不再画锁定光圈）；无人 IDLE 仍为漫天飞剑。
// 阵型：IDLE 漫天飞剑 / FIST 三层剑球 / TWO_FINGERS 小剑云团拼成剑形（互不共点）/
// OPEN_PALM 瀑布齐发 / THUMB_UP 冲天剑柱 / SHAKA 六芒星 / ROCK 双龙螺旋 /
// PALM_DOWN 剑雨 / CROSSED_HANDS 8字环 / HANDS_PUSH 爆裂波 / HANDS_CUP 聚能球 /
// DOUBLE_FIST 八卦八门。齐发 burst：抽 132 剑雁行集结分波飞越（本仓库自有，保留）。
// 帧率无关化：原版 per-frame lerp/速度统一换算为 per-second（60fps 基准）。
import * as THREE from 'three';
import { FX } from '../fx.config.js';
import { TrailRenderer } from './trail.js';
import { buildEnergySword } from './hero.js';

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _side = new THREE.Vector3();
const _out = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _col = new THREE.Color();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

const SPHERE = 0, GATHER = 1, FIRE = 2, RETURN = 3;
// 手势 → 阵型（sword-control 映射；IDLE=漫天飞剑）
const FORMATION = {
  IDLE: 'IDLE', FIST: 'SPHERE', TWO_FINGERS: 'BIG_SWORD', OPEN_PALM: 'WATERFALL',
  THUMB_UP: 'PILLAR', SHAKA: 'HEXAGRAM', ROCK: 'DRAGON', PALM_DOWN: 'RAIN',
  CROSSED_HANDS: 'INFINITY', HANDS_PUSH: 'EXPLODE', HANDS_CUP: 'ENERGY_BALL',
  DOUBLE_FIST: 'TAICHI',
};
const GOLDEN = (1 + Math.sqrt(5)) / 2;

export class Volley {
  constructor(scene) {
    this.scene = scene;
    this.max = FX.volley.max;
    const E = FX.energySword;
    const mkLayer = (rT, rB, color, opacity) => {
      const mesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(rT, rB, E.bladeLength, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }), this.max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      return mesh;
    };
    // 三层能量剑刃（内核/光晕/外层共享同一组实例矩阵）
    this.mesh = mkLayer(E.coreRadiusTop, E.coreRadiusBottom, E.coreColor, E.coreOpacity);
    this.meshMid = mkLayer(E.coreRadiusTop * E.midScale, E.coreRadiusBottom * E.midScale, E.midColor, E.midOpacity);
    this.meshOuter = mkLayer(E.coreRadiusTop * E.outerScale, E.coreRadiusBottom * E.outerScale, E.outerColor, E.outerOpacity);
    this.mesh.renderOrder = 4;

    const N = this.max;
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N); this.vz = new Float32Array(N);
    this.mode = new Uint8Array(N);
    this.age = new Float32Array(N); this.life = new Float32Array(N);
    this.sx = new Float32Array(N); this.sy = new Float32Array(N); this.sz = new Float32Array(N);   // 集结位
    this.bx = new Float32Array(N); this.by = new Float32Array(N); this.bz = new Float32Array(N);   // 漫天飞剑锚点
    this.dirx = new Float32Array(N); this.diry = new Float32Array(N);
    this.sdx = new Float32Array(N); this.sdy = new Float32Array(N); this.sdz = new Float32Array(N);
    this.rainDelay = new Float32Array(N);
    for (let i = 0; i < N; i++) this.sdy[i] = 1;   // 平滑朝向初值 = +Y
    this.scale = new Float32Array(N);
    this._cursor = 0;
    this.counts = { form: 0, fire: 0, gather: 0, ret: 0 };

    // 三层球面槽位（sword-control sphereLayers：60/100/140，斐波那契分布）
    const layers = FX.volley.sphereLayers;
    this.layerIdx = new Uint8Array(N);
    this.layerTheta = new Float32Array(N);
    this.layerPhi = new Float32Array(N);
    this._layerOf = [];
    this._layTmp = { idx: 0, radius: 0, speed: 0, scale: 1, theta: 0, phi: 0 };
    let slotId = 0;
    for (let r = 0; r < layers.length && slotId < N; r++) {
      const L = layers[r];
      for (let k = 0; k < L.count && slotId < N; k++) {
        const i = slotId++;
        this.layerIdx[i] = r;
        this.layerTheta[i] = 2 * Math.PI * k / GOLDEN;
        this.layerPhi[i] = Math.acos(1 - 2 * (k + 0.5) / L.count);
        this.scale[i] = L.scale;
      }
      this._layerOf.push({ idx: r, radius: L.radius, speed: L.rotationSpeed, scale: L.scale });
    }
    this.swordTotal = slotId;
    this.swx = new Float32Array(N);
    this.swy = new Float32Array(N);
    this.swz = new Float32Array(N);
    this.sws = new Float32Array(N);
    this.stx = new Float32Array(N);
    this.stz = new Float32Array(N);
    this.fscale = new Float32Array(N).fill(0.85);   // FIRE 中的实例尺度（剑云发射时保持剑形小尺度）
    this.cloudN = this.swordTotal - 96;             // 剑指：204 把拼剑形，96 把留作背景万剑
    this._packSwordCloud();

    for (let i = this.swordTotal; i < N; i++) this.scale[i] = 0;

    // 手势阵型状态
    this.formation = 'IDLE';
    this.formationAge = 0;
    // 手势上下文（tracking 经 director 注入，世界坐标）
    this.handX = 0; this.handY = 0;
    this.hand2X = 0; this.hand2Y = 0;
    this.handsCX = 0; this.handsCY = 0; this.handsDist = 0.3;
    this.dirX = 0; this.dirY = 1; this.dirZ = 0;         // 指向方向（镜像坐标系）
    this.palmNX = 0; this.palmNY = 0; this.palmNZ = 1;   // 掌法向
    this.formCX = 0; this.formCY = 2.2;
    this._followIdle = false;
    this._bRight = new THREE.Vector3(1, 0, 0);
    this._bUp = new THREE.Vector3(0, 1, 0);
    this._bOut = new THREE.Vector3(0, 0, 1);


    // 初始：漫天飞剑（体积散布，确定性伪随机）
    for (let i = 0; i < N; i++) {
      if (i < this.swordTotal) {
        this.bx[i] = (Math.sin(i * 12.9898) * 0.5 + 0.5) * 2 - 1;   // -1..1
        this.by[i] = ((i * 0.6180339) % 1);
        this.bz[i] = (Math.sin(i * 78.233) * 0.5 + 0.5) * 2 - 1;
        this.px[i] = this._idleX(i);
        this.py[i] = this._idleY(i);
        this.pz[i] = this._idleZ(i);
        this.rainDelay[i] = Math.random() * 0.5;
      } else {
        this.mesh.setMatrixAt(i, _zero);
      }
    }

    // ---- 合并大剑（TWO_FINGERS）：单把独立网格，替代 300 剑叠加 ----
    // buildEnergySword 的剑刃沿内组 +Z（朝相机，hero 的"剑来"用法），
    // 内组预转 -π/2 立正（+Z→+Y），外组负责跟手位置/朝向/缩放。
    this.bigSword = new THREE.Group();
    const bigInner = buildEnergySword();
    bigInner.rotation.x = -Math.PI / 2;
    this.bigSword.add(bigInner);
    this.bigSword.traverse(o => { if (o.isMesh) o.renderOrder = 5; });
    this.bigSword.visible = false;
    scene.add(this.bigSword);
    this.bigFade = 0;
    this.bigX = 0; this.bigY = 2;
    this.bigDir = new THREE.Vector3(0, 1, 0);

    // ---- 六芒星能量连线（sword-control createHexagramLines：6 外框 + 3 内叉） ----
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.hexLines = [];
    for (let k = 0; k < 9; k++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, k < 6 ? lineMat : lineMat.clone());
      if (k >= 6) line.material.opacity = 0.4;
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.hexLines.push(line);
    }
    this._hexV = [];
    for (let k = 0; k < 6; k++) this._hexV.push(new THREE.Vector3());

    // ---- ribbon 拖尾池（领头剑剑气，sword-control 青色） ----
    this.trails = [];
    this.trailFree = [];
    for (let k = 0; k < FX.volley.trailLeads; k++) {
      const mat = TrailRenderer.createGlowMaterial(
        new THREE.Color(0.4, 0.85, 1.0), new THREE.Color(0.0, 0.4, 1.0));
      mat.uniforms.headColor.value.set(0.4, 0.85, 1.0, 0.5);
      const tr = new TrailRenderer(scene, false);
      tr.initialize(mat, 20, false, 0.55, null, null);
      tr.user = { idx: -1 };
      scene.add(tr.mesh);
      tr.deactivate();
      this.trails.push(tr);
      this.trailFree.push(tr);
    }
  }

  // ---- 漫天飞剑散布（屏幕体积内，VIEW_H≈13 / 半宽≈11.6@16:9） ----
  _idleX(i) { return this.bx[i] * 19; }
  _idleY(i) { return -4.2 + this.by[i] * 8.2; }
  _idleZ(i) { return this.bz[i] * 4 - 1.2; }

  _lay(i) {
    const L = this._layerOf[this.layerIdx[i]];
    this._layTmp.idx = L.idx; this._layTmp.radius = L.radius;
    this._layTmp.speed = L.speed; this._layTmp.scale = L.scale;
    this._layTmp.theta = this.layerTheta[i]; this._layTmp.phi = this.layerPhi[i];
    return this._layTmp;
  }

  // 剑指：把前 cloudN 把小剑装进剑形体积（柄/护手/刃），斐波那契圆盘保证互不共点；
  // 其余 96 把是背景万剑（IDLE 跟手云团，发射时同向跟随）。
  _packSwordCloud() {
    const N = this.cloudN;
    const nHandle = Math.floor(N * 0.10);
    const nGuard = Math.floor(N * 0.14);
    const nBlade = N - nHandle - nGuard;
    const fill = (start, count, yA, yB, rFn, tFn) => {
      for (let k = 0; k < count; k++) {
        const i = start + k;
        const u = (k + 0.5) / count;
        const theta = 2 * Math.PI * i / GOLDEN;
        const rad = Math.sqrt((k * GOLDEN) % 1);
        this.swx[i] = Math.cos(theta) * rFn(u) * rad;
        this.swz[i] = Math.sin(theta) * tFn(u) * rad;
        this.swy[i] = yA + (yB - yA) * u;
        this.sws[i] = 0.27 + ((i * 0.6180339) % 1) * 0.11;
        this.stx[i] = Math.sin(i * 3.883) * 0.16;
        this.stz[i] = Math.cos(i * 2.399) * 0.16;
      }
    };
    fill(0, nHandle, -1.2, 0.10, () => 0.26, () => 0.26);
    fill(nHandle, nGuard, 0.10, 0.48, () => 1.18, () => 0.34);
    fill(nHandle + nGuard, nBlade, 0.48, 4.55,
      (u) => 0.70 * (1 - u) * (1 - u) + 0.10,
      (u) => 0.40 * (1 - u) + 0.08);
  }

  _updateFormCenter(dt) {
    const k = 1 - Math.exp(-8 * dt);
    this.formCX += (this.handX - this.formCX) * k;
    this.formCY += (this.handY - this.formCY) * k;
  }


  // 手势 → 阵型切换（即时生效，sword-control 同款；重复设置不重置计时）。
  setMode(gesture, handPos) {
    const f = FORMATION[gesture] || 'IDLE';
    if (handPos) { this.handX = handPos.x; this.handY = handPos.y; }
    if (f === this.formation) return;
    this.formation = f;
    this.formationAge = 0;
    // 入场动作（sword-control onGestureChange）
    if (f === 'RAIN') this._seedRain();
    if (f === 'EXPLODE') this._seedExplode();
    if (f === 'WATERFALL') {
      for (let i = 0; i < this.swordTotal; i++) { this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0; }
    }
  }

  // director 每帧注入手势上下文（世界坐标）
  setHands(hand, hand2, handsCenter, handsDist, dir, palmN) {
    this.handX = hand.x; this.handY = hand.y;
    if (hand2) { this.hand2X = hand2.x; this.hand2Y = hand2.y; }
    if (handsCenter) { this.handsCX = handsCenter.x; this.handsCY = handsCenter.y; }
    this.handsDist = handsDist || 0.3;
    if (dir) { this.dirX = dir.x; this.dirY = dir.y; this.dirZ = dir.z; }
    if (palmN) { this.palmNX = palmN.x; this.palmNY = palmN.y; this.palmNZ = palmN.z; }
  }

  // 剑雨入场：撒到顶部随机延迟下落（sword-control PALM_DOWN 入场）
  _seedRain() {
    for (let i = 0; i < this.swordTotal; i++) {
      this.px[i] = this.handX + (Math.random() - 0.5) * 12;
      this.py[i] = 15 + Math.random() * 8;
      this.pz[i] = (Math.random() - 0.5) * 6;
      this.vx[i] = (Math.random() - 0.5) * 3;
      this.vy[i] = -6 - Math.random() * 12;
      this.vz[i] = (Math.random() - 0.5) * 3;
      this.rainDelay[i] = Math.random() * 0.5;
    }
  }

  // 爆裂：以双手中心为心，沿斐波那契球面方向赋予径向初速（sword-control HANDS_PUSH）
  _seedExplode() {
    for (let i = 0; i < this.swordTotal; i++) {
      const theta = 2 * Math.PI * i / GOLDEN;
      const phi = Math.acos(1 - 2 * (i + 0.5) / this.swordTotal);
      const sp = 24 + Math.random() * 14;
      this.vx[i] = Math.sin(phi) * Math.cos(theta) * sp;
      this.vy[i] = Math.cos(phi) * sp;
      this.vz[i] = Math.sin(phi) * Math.sin(theta) * sp * 0.6;
    }
  }

  // 一记齐发：从当前阵型调剑（本仓库自有通道；瀑布阵型由 director 屏蔽）
  burst(ox, oy, dx, dy, peak) {
    const C = FX.volley;
    const M = Math.min(C.burstCount, this.swordTotal);
    const perpx = -dy, perpy = dx;
    for (let k = 0; k < M; k++) {
      const i = this._nextFormationSword();
      if (i < 0) break;
      this.mode[i] = GATHER;
      this.age[i] = 0;
      const u = (k / (M - 1) || 0) - 0.5;
      const rank = (k % 3);
      this.sx[i] = ox - dx * (2.0 + rank * 0.9) + perpx * u * 9.5;
      this.sy[i] = oy - dy * (2.0 + rank * 0.9) + perpy * u * 9.5;
      this.sz[i] = 0.6 - rank * 0.8;
      this.dirx[i] = dx; this.diry[i] = dy;
      this.vx[i] *= 0.3; this.vy[i] *= 0.3;
    }
    for (const tr of this.trails) {
      tr.reset(); tr.deactivate();
    }
    this.trailFree = [...this.trails];
  }

  _nextFormationSword() {
    for (let n = 0; n < this.swordTotal; n++) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % this.swordTotal;
      if (this.mode[i] === SPHERE) return i;
    }
    return -1;
  }

  // 剑指发射（指哪飞哪）：拼成剑形的剑云保持队形整体射出，背景万剑同向跟随；
  // 飞出屏幕后走 RETURN 自动回到手上重新聚成剑形。
  launchCloud(dx, dy) {
    const sp = 30 + Math.random() * 6;
    let trails = 0;
    for (let i = 0; i < this.swordTotal; i++) {
      if (this.mode[i] !== SPHERE) continue;
      this.mode[i] = FIRE;
      this.age[i] = 0;
      this.life[i] = 1.3 + Math.random() * 0.7;
      const w = (Math.random() - 0.5) * 0.1;   // 轻微散开角，避免一根直线
      this.vx[i] = (dx - dy * w) * sp;
      this.vy[i] = (dy + dx * w) * sp;
      this.vz[i] = 0;
      if (i < this.cloudN) this.fscale[i] = this.sws[i];   // 剑云保持剑形小尺度
      else this.fscale[i] = this.scale[i];
      // 剑云前几把 + 背景零星挂剑气拖尾
      const wantTrail = i < 4 || (i >= this.cloudN && (i - this.cloudN) % 24 === 0);
      if (wantTrail && this.trailFree.length) {
        const tr = this.trailFree.pop();
        tr.user.idx = i; tr.age = 0; tr.reset(); tr.activate();
      }
      trails++;
    }
    return trails;
  }

  _seek(i, tx, ty, tz, speed, dt) {
    const dxx = tx - this.px[i], dyy = ty - this.py[i], dzz = tz - this.pz[i];
    const d = Math.hypot(dxx, dyy, dzz) + 1e-6;
    const dvx = dxx / d * speed - this.vx[i];
    const dvy = dyy / d * speed - this.vy[i];
    const dvz = dzz / d * speed - this.vz[i];
    const f = Math.min(1, 9 * dt);
    this.vx[i] += dvx * f; this.vy[i] += dvy * f; this.vz[i] += dvz * f;
  }

  update(dt, t, personPresent) {
    this._followIdle = !!personPresent;
    this._updateFormCenter(dt);
    this._updateBigSword(dt, t);
    const F = FX.formations;
    this.formationAge += dt;
    this.counts.form = 0; this.counts.fire = 0; this.counts.gather = 0; this.counts.ret = 0;

    const form = this.formation;
    // 帧率无关吸附（≈sword-control lerp 0.085@60fps）
    const lerp = 1 - Math.exp(-F.lerpK * dt);
    const pose = this._pose || (this._pose = new Float64Array(9));
    const vK = Math.min(1, 3.1 * dt);   // 速度型 lerp（≈0.05/frame）

    for (let i = 0; i < this.max; i++) {
      const m = this.mode[i];
      let bright = 0;
      let colorMode = 0;
      switch (m) {
        case SPHERE: {
          this.counts.form++;
          this._poseOf(i, t, dt, form, pose);
          if (form === 'WATERFALL' || form === 'RAIN' || form === 'EXPLODE') {
            // 速度型：pose 只提供朝向，位移在本 case 内积分（见下）
          } else {
            this.px[i] += (pose[0] - this.px[i]) * lerp;
            this.py[i] += (pose[1] - this.py[i]) * lerp;
            this.pz[i] += (pose[2] - this.pz[i]) * lerp;
          }
          this.sdx[i] += (pose[3] - this.sdx[i]) * lerp;
          this.sdy[i] += (pose[4] - this.sdy[i]) * lerp;
          this.sdz[i] += (pose[5] - this.sdz[i]) * lerp;
          _v2.set(this.sdx[i], this.sdy[i], this.sdz[i]);
          if (_v2.lengthSq() < 1e-6) _v2.set(0, 1, 0); else _v2.normalize();
          this.scale[i] += (pose[6] - this.scale[i]) * lerp;
          bright = pose[7];
          colorMode = pose[8];
          break;
        }
        case GATHER: {
          this.counts.gather++;
          this.age[i] += dt;
          this._seek(i, this.sx[i], this.sy[i], this.sz[i], 64, dt);
          const arrived = Math.hypot(this.sx[i] - this.px[i], this.sy[i] - this.py[i]) < 0.8;
          bright = 0.55 + 0.45 * Math.min(1, this.age[i] / FX.volley.gatherTime);
          if (arrived || this.age[i] >= FX.volley.gatherTime) {
            this.mode[i] = FIRE; this.age[i] = 0;
            this.life[i] = FX.volley.fireLife[0] + Math.random() * (FX.volley.fireLife[1] - FX.volley.fireLife[0]);
            const u = (Math.random() - 0.5);
            const sp = FX.volley.fireSpeed[0] + Math.random() * (FX.volley.fireSpeed[1] - FX.volley.fireSpeed[0]);
            this.vx[i] = (this.dirx[i] + -this.diry[i] * u * 0.22) * sp;
            this.vy[i] = (this.diry[i] + this.dirx[i] * u * 0.22) * sp;
            this.vz[i] = (Math.random() - 0.5) * 2.2;
            this.scale[i] = 0.85;
            this.fscale[i] = 0.85;
            if (this.trailFree.length) {
              const tr = this.trailFree.pop();
              tr.user.idx = i; tr.age = 0; tr.reset(); tr.activate();
            }
          }
          break;
        }
        case FIRE: {
          this.counts.fire++;
          this.age[i] += dt;
          const wob = Math.sin(this.age[i] * 9 + i) * 6 * dt;
          this.vx[i] += -this.diry[i] * wob;
          this.vy[i] += this.dirx[i] * wob;
          this.vz[i] *= 1 - 0.6 * dt;
          this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
          if (this.age[i] > this.life[i] || Math.abs(this.px[i]) > 42 || this.py[i] > 30 || this.py[i] < -14) {
            this.mode[i] = RETURN; this.age[i] = 0;
          }
          bright = 1.0;
          break;
        }
        case RETURN: {
          this.counts.ret++;
          this.age[i] += dt;
          this._poseOf(i, t, dt, this.formation, pose);
          this._seek(i, pose[0], pose[1], pose[2], 18, dt);
          if (Math.hypot(pose[0] - this.px[i], pose[1] - this.py[i], pose[2] - this.pz[i]) < 1.0 || this.age[i] > 4) {
            this.mode[i] = SPHERE; this.scale[i] = pose[6];
          }
          bright = Math.max(0.3, 0.85 - this.age[i] * 0.5);
          colorMode = pose[8];
          break;
        }
      }

      // 速度型阵型积分（WATERFALL/RAIN/EXPLODE，复刻 sword-control 速度语义）
      if (m === SPHERE && form === 'WATERFALL') {
        const ddx = this.handX - this.px[i], ddy = this.handY + 1.4 - this.py[i], ddz = 4.5 - this.pz[i];
        const dist = Math.hypot(ddx, ddy, ddz);
        if (dist < 8) {
          // 出掌方向：掌法向 + 指向折混（sword-control flyDir）
          let fx = -this.palmNX + this.dirX * 0.5;
          let fy = -this.palmNY + this.dirY * 0.5;
          let fz = this.palmNZ;
          const fl = Math.hypot(fx, fy, fz) || 1;
          const sp = FX.formations.waterfallSpeed;
          this.vx[i] += (fx / fl * sp - this.vx[i]) * vK;
          this.vy[i] += (fy / fl * sp - this.vy[i]) * vK;
          this.vz[i] += (fz / fl * sp - this.vz[i]) * vK;
        } else {
          this.vx[i] += (ddx / dist * 6 - this.vx[i]) * Math.min(1, 1.2 * dt);
          this.vy[i] += (ddy / dist * 6 - this.vy[i]) * Math.min(1, 1.2 * dt);
          this.vz[i] += (ddz / dist * 6 - this.vz[i]) * Math.min(1, 1.2 * dt);
        }
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
        // 出界回收到手边（sword-control 边界重置）
        if (Math.abs(this.px[i]) > 26 || this.py[i] > 24 || this.py[i] < -12 || Math.abs(this.pz[i]) > 26) {
          this.px[i] = this.handX + (Math.random() - 0.5) * 4;
          this.py[i] = this.handY + 1.4 + (Math.random() - 0.5) * 2;
          this.pz[i] = 4.5 + (Math.random() - 0.5) * 2;
          this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
        }
        _v.set(this.vx[i], this.vy[i], this.vz[i]);
        if (_v.lengthSq() > 0.04) _v2.copy(_v.normalize());   // 朝向速度
        bright = 0.9;
      }
      if (m === SPHERE && form === 'RAIN') {
        if (this.rainDelay[i] > 0) {
          this.rainDelay[i] -= dt;
        } else {
          this.vy[i] = Math.max(this.vy[i] - 54 * dt, -48);   // 重力（sword-control 0.015/frame²）
          this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
          // 跟手漂移（sword-control drift 0.01/frame）
          const drift = Math.min(1, 0.6 * dt);
          this.px[i] += (this.handX - this.px[i]) * drift;
          if (this.py[i] < F.rainGroundY) {
            this.px[i] = this.handX + (Math.random() - 0.5) * 12;
            this.py[i] = 15 + Math.random() * 8;
            this.pz[i] = (Math.random() - 0.5) * 6;
            this.vx[i] = (Math.random() - 0.5) * 3;
            this.vy[i] = -6 - Math.random() * 12;
            this.vz[i] = (Math.random() - 0.5) * 3;
          }
        }
        _v2.set(0, -1, 0);
        bright = 0.8;
      }
      if (m === SPHERE && form === 'EXPLODE') {
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
        const dx = this.px[i] - this.handsCX, dy = this.py[i] - (this.handsCY + 1.2), dz = this.pz[i] - 0.6;
        const r = Math.hypot(dx, dy, dz);
        if (r > F.explodeMaxR) {
          // 到边减速 + 缓慢回吸（sword-control 0.95/frame 阻尼 + 0.02/frame 回拉）
          const damp = Math.max(0, 1 - 3 * dt);
          this.vx[i] *= damp; this.vy[i] *= damp; this.vz[i] *= damp;
          this.vx[i] -= dx / r * 1.2 * dt;
          this.vy[i] -= dy / r * 1.2 * dt;
          this.vz[i] -= dz / r * 1.2 * dt;
        }
        _v.set(this.vx[i], this.vy[i], this.vz[i]);
        if (_v.lengthSq() > 0.04) _v2.copy(_v.normalize());
        bright = 0.9;
      }

      // 朝向速度（GATHER/RETURN/FIRE 由速度驱动）
      if (m !== SPHERE) {
        _v.set(this.vx[i], this.vy[i], this.vz[i]);
        const vl = _v.length();
        if (vl > 0.2) { _v.multiplyScalar(1 / vl); _q.setFromUnitVectors(Y, _v); }
        else _q.identity();
      } else {
        _q.setFromUnitVectors(Y, _v2);
      }
      let s = this.scale[i];
      if (m === GATHER || m === FIRE) s = this.fscale[i];
      if (m === RETURN) s = this.scale[i] * (1 - Math.min(0.4, this.age[i] * 0.3));
      // scale 不能与 position 共用临时向量：compose 最后才读 position（te[12..14]），
      // 共用会把位置覆盖成 scale 值，全部实例塌缩（v4 坑，见 HANDOFF 8.6 修复 2）
      _m.compose(_v2.set(this.px[i], this.py[i], this.pz[i]), _q, _scl.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
      this._swordColor(_col, bright, colorMode, i);
      this.mesh.setColorAt(i, _col);
    }

    // ---- 六芒星能量连线 ----
    this._updateHexLines(form, t);

    // ---- 拖尾跟随领头剑 ----
    for (const tr of this.trails) {
      const i = tr.user.idx;
      if (i < 0 || (this.mode[i] !== FIRE && this.mode[i] !== RETURN)) {
        if (tr.active) {
          tr.age = (tr.age || 0) + dt;
          const a = Math.max(0, 0.5 * (1 - (tr.age - 0) / 0.5));
          tr.material.uniforms.headColor.value.w = a;
          if (tr.age > 0.6) { tr.deactivate(); tr.user.idx = -1; tr.reset(); }
        }
        continue;
      }
      if (!tr.active) { tr.activate(); tr.age = 0; }
      _v.set(this.vx[i], this.vy[i], this.vz[i]);
      const vl = _v.length();
      if (vl > 0.5) {
        _v.multiplyScalar(1 / vl);
        const half = 1.1 * (this.mode[i] === FIRE ? 0.85 : 0.6);
        const tip = _v2.set(this.px[i], this.py[i], this.pz[i]).addScaledVector(_v, half);
        _side.set(-this.vy[i], this.vx[i], 0);
        if (_side.lengthSq() > 1e-6) _side.normalize().multiplyScalar(0.6);
        else _side.set(0, 0.6, 0);
        tr.advanceWorld(tip, _side);
        tr.material.uniforms.headColor.value.w = this.mode[i] === FIRE ? 0.5 : 0.2;
      }
    }

    this._syncLayers();
  }

  // 实例色：青（默认）/ 紫（双龙 B）/ 白（太极阳），通道钳 ≤1 防 HDR 叠加过曝
  _swordColor(col, bright, colorMode, i) {
    void i;
    const b = Math.max(0, Math.min(1, bright));
    if (colorMode === 1) col.setRGB(0.42 * b + 0.10, 0.16 * b + 0.04, 0.78 * b + 0.14);
    else if (colorMode === 2) col.setRGB(0.82 * b + 0.12, 0.88 * b + 0.10, 0.90 * b + 0.08);
    else col.setRGB(0.35 * b + 0.06, 0.72 * b + 0.10, 0.95 * b + 0.05);
  }

  // 阵型位形（sword-control update*State 逐项移植；pose=[tx,ty,tz,dx,dy,dz,scale,bright,colorMode]）
  _poseOf(i, t, dt, form, pose) {
    const F = FX.formations;
    const lay = this._lay(i);
    void dt;
    switch (form) {
      case 'SPHERE': {
        // 万剑聚拢旋转球：三层斐波那契球面，中心跟手
        const cx = this.formCX, cy = this.formCY, cz = 0.6;
        const rot = t * lay.speed * 60;
        let theta = lay.theta + rot;
        let phi = lay.phi;
        if (lay.idx === 0) theta += rot;
        else if (lay.idx === 1) { theta += rot * 0.8; phi += Math.sin(rot * 0.5) * 0.1; }
        else { theta += rot; phi += Math.sin(rot * 0.3) * 0.05; }
        const R = lay.radius;
        const x = cx + R * Math.sin(phi) * Math.cos(theta);
        const y = cy + R * Math.cos(phi);
        const z = cz + R * Math.sin(phi) * Math.sin(theta);
        pose[0] = x; pose[1] = y; pose[2] = z;
        const dx = cx - x, dy = cy - y, dz = cz - z;
        const l = Math.hypot(dx, dy, dz) || 1;
        pose[3] = dx / l; pose[4] = dy / l; pose[5] = dz / l;
        pose[6] = lay.scale * (1 + 0.02 * Math.sin(t * 3 + i * 0.1));
        pose[7] = 0.7 + 0.2 * Math.sin(t * 1.6 + i * 0.5);
        pose[8] = 0;
        return;
      }
      case 'PILLAR': {
        // 冲天剑柱：5 层圆柱面螺旋，能量波亮度沿柱流动（中心跟手）
        const layers = 5;
        const n = Math.ceil(this.swordTotal / layers);
        const li = Math.floor(i / n);
        const k = i % n;
        const ang = (k / n) * Math.PI * 2 + t * 0.6;
        const hr = li / layers;
        const r = F.pillarRadius + Math.sin(t * 3 + hr * Math.PI * 2) * 0.3;
        pose[0] = this.formCX + Math.cos(ang) * r;
        pose[1] = this.formCY + hr * F.pillarHeight - F.pillarHeight * 0.4;
        pose[2] = Math.sin(ang) * r;
        pose[3] = 0; pose[4] = 1; pose[5] = 0;
        pose[6] = 0.55;
        pose[7] = 0.7 + Math.sin(t * 6 - hr * Math.PI * 4) * 0.3;
        pose[8] = 0;
        return;
      }
      case 'HEXAGRAM': {
        // 六芒星：6 顶点绕手位缓转，顶点小球簇
        const cy = this.formCY;
        const rot = t * 0.48;
        const n = Math.ceil(this.swordTotal / 6);
        const vi = Math.floor(i / n) % 6;
        const ang = rot + vi * Math.PI / 3;
        const vx = this.formCX + Math.cos(ang) * F.hexRadius;
        const vy = cy + Math.sin(t * 1.2 + vi) * 0.3;
        const vz = Math.sin(ang) * F.hexRadius;
        const k = i % n;
        const sa = (k / n) * Math.PI * 2 + t * 1.8;
        const sp = (k / n) * Math.PI;
        const sr = 0.8;
        pose[0] = vx + Math.sin(sp) * Math.cos(sa) * sr;
        pose[1] = vy + Math.cos(sp) * sr;
        pose[2] = vz + Math.sin(sp) * Math.sin(sa) * sr;
        const dx = this.formCX - pose[0], dy = cy - pose[1], dz = -pose[2];
        const l = Math.hypot(dx, dy, dz) || 1;
        pose[3] = dx / l; pose[4] = dy / l; pose[5] = dz / l;
        pose[6] = 0.5;
        pose[7] = 0.7 + 0.25 * Math.sin(t * 2 + vi);
        pose[8] = 0;
        return;
      }
      case 'DRAGON': {
        // 双龙交织：两条相位差 π、旋向相反的螺旋（updateRockState）
        const half = Math.ceil(this.swordTotal / 2);
        const b = i >= half;
        const k = b ? i - half : i;
        const u = k / half;
        const rotDir = b ? -1 : 1;
        const ang = u * Math.PI * 4 + t * 1.2 * rotDir + (b ? Math.PI : 0);
        pose[0] = this.formCX + Math.cos(ang) * F.dragonRadius;
        pose[1] = this.formCY + u * F.dragonHeight - F.dragonHeight * 0.35;
        pose[2] = Math.sin(ang) * F.dragonRadius;
        const ta = ang + Math.PI / 2 * rotDir;
        const dx = -Math.sin(ta), dz = Math.cos(ta);
        const l = Math.hypot(dx, 0.5, dz) || 1;
        pose[3] = dx / l; pose[4] = 0.5 / l; pose[5] = dz / l;
        pose[6] = 0.55 * (1 + 0.1 * Math.sin(t * 4.8 + u * 12));
        pose[7] = 0.85;
        pose[8] = b ? 1 : 0;   // 双龙 B 链紫色（sword-control 0x9933ff）
        return;
      }
      case 'INFINITY': {
        // 8字环：Lissajous 曲线，中心跟手
        const ph = (i / this.swordTotal) * Math.PI * 2 + t * 0.6;
        pose[0] = this.formCX + F.infinityScaleX * Math.sin(ph);
        pose[1] = this.formCY + F.infinityScaleY * Math.sin(ph * 2) * 0.5;
        pose[2] = 2 + F.infinityScaleZ * Math.cos(ph) * 0.5;
        const p2 = ph + 0.1;
        const dx = F.infinityScaleX * (Math.sin(p2) - Math.sin(ph));
        const dy = F.infinityScaleY * 0.5 * (Math.sin(p2 * 2) - Math.sin(ph * 2));
        const dz = F.infinityScaleZ * 0.5 * (Math.cos(p2) - Math.cos(ph));
        const l = Math.hypot(dx, dy, dz) || 1;
        pose[3] = dx / l; pose[4] = dy / l; pose[5] = dz / l;
        pose[6] = 0.55 * (0.8 + 0.3 * (1 + Math.abs(Math.cos(ph))) * 0.5);
        pose[7] = 0.75 + 0.2 * Math.abs(Math.cos(ph));
        pose[8] = 0;
        return;
      }
      case 'ENERGY_BALL': {
        // 聚能球：双手间斐波那契球面，半径随双手距离
        const cx = this.handsCX, cy = this.handsCY + 1.4, cz = 0.6;
        const R = Math.max(1.5, Math.min(this.handsDist * 15 + 1, 5)) * (1 + 0.1 * Math.sin(t * 3));
        const theta = 2 * Math.PI * i / GOLDEN + t * 0.6;
        const phi = Math.acos(1 - 2 * (i + 0.5) / this.swordTotal);
        const x = cx + R * Math.sin(phi) * Math.cos(theta);
        const y = cy + R * Math.cos(phi);
        const z = cz + R * Math.sin(phi) * Math.sin(theta);
        pose[0] = x; pose[1] = y; pose[2] = z;
        const dx = cx - x, dy = cy - y, dz = cz - z;
        const l = Math.hypot(dx, dy, dz) || 1;
        pose[3] = dx / l; pose[4] = dy / l; pose[5] = dz / l;
        pose[6] = 0.45;
        pose[7] = 0.85 + 0.15 * Math.sin(t * 3);
        pose[8] = 0;
        return;
      }
      case 'TAICHI': {
        // 八卦阵：中心阴阳环 + 先天八卦 8 卦绕心排列。
        // 每卦 = 3 条直爻（初/中/上，内→外），阳爻整条、阴爻中缝断开——
        // 用剑的排布直接读出"八卦"图形；整体绕阵心缓转，中心跟手。
        const R0 = F.taichiRadius * 0.21;                          // 中心环
        const nRing = 108, perRow = 8;                              // 108 环 + 8卦×3爻×8 = 300
        const rot = t * 0.15;
        // 先天八卦圆序（乾兑离震坤艮坎巽的爻码，bit0=初爻）：每卦 3 位，1=阳爻连、0=阴爻断
        const TRIG = [7, 6, 2, 4, 0, 1, 5, 3];
        if (i < nRing) {
          const a = (i / nRing) * Math.PI * 2 + rot * 0.6;
          const r = R0 + Math.sin(t * 2 + i * 0.8) * 0.03;
          pose[0] = this.formCX + Math.cos(a) * r;
          pose[1] = this.formCY + Math.sin(a) * r * 0.94;
          pose[2] = 0.5;
          pose[3] = -Math.sin(a); pose[4] = Math.cos(a) * 0.94; pose[5] = 0.08;
          const lc = Math.hypot(pose[3], pose[4], pose[5]) || 1;
          pose[3] /= lc; pose[4] /= lc; pose[5] /= lc;
          pose[6] = 0.5;
          pose[7] = 0.85 + 0.15 * Math.sin(t * 3 + i * 0.3);
          pose[8] = 2;   // 中心环偏白
          return;
        }
        const idx = i - nRing;
        const row = idx % 24;                 // 8 卦 × 3 爻
        const k = Math.floor(idx / 24);       // 爻内序号 0..9
        const gi = Math.floor(row / 3);       // 卦 0..7
        const yao = row % 3;                  // 初/中/上爻
        const yang = (TRIG[gi] >> yao) & 1;
        // 卦心在半径 2.36 的圆周上，卦符以"直条"绘制：条向=切向，堆叠向=径向（经典八卦图标画法）
        // 卦符紧凑（0.75×0.86），卦间距 ~1.0，保证 8 个三横卦符各自独立成字
        const ga = gi * Math.PI / 4 + rot;
        const Rg = F.taichiRadius * 0.59;
        const gx = this.formCX + Math.cos(ga) * Rg;
        const gy = this.formCY + Math.sin(ga) * Rg * 0.94;
        let tx = -Math.sin(ga), ty = Math.cos(ga) * 0.94;      // 切向（条方向）
        let ux = Math.cos(ga), uy = Math.sin(ga) * 0.94;       // 径向（爻堆叠方向）
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
        const tang = (k / (perRow - 1) - 0.5) * 0.75;          // 条内切向偏移（条长 0.75，8 剑密排成实线）
        let xoff = tang, yoff = (yao - 1) * 0.4;               // 默认阳爻：整条
        if (!yang) {
          const half = k < perRow / 2 ? -1 : 1;                // 阴爻：两短条，中缝 0.18
          const kk = k % (perRow / 2);
          xoff = half * 0.24 + (kk / (perRow / 2 - 1) - 0.5) * 0.30;
        }
        const jit = Math.sin(i * 12.9898) * 0.03;              // 微抖避免死直线
        pose[0] = gx + tx * (xoff + jit) + ux * yoff;
        pose[1] = gy + ty * (xoff + jit) + uy * yoff;
        pose[2] = 0.45 + yao * 0.04;
        pose[3] = tx; pose[4] = ty; pose[5] = 0.12;            // 剑身沿条方向躺平
        const l = Math.hypot(pose[3], pose[4], pose[5]) || 1;
        pose[3] /= l; pose[4] /= l; pose[5] /= l;
        pose[6] = 0.6;
        pose[7] = 0.70 + 0.22 * Math.sin(t * 2.4 + row);
        pose[8] = 0;
        return;
      }
      case 'BIG_SWORD': {
        // 背景万剑（非剑云成员）：跟手云团缓飞，发射时同向跟随
        if (i >= this.cloudN) {
          this._poseOf(i, t, dt, 'IDLE', pose);
          return;
        }
        // 剑云：本地偏移绕指向轴，互不共点
        const R = this._bRight, U = this._bUp, O = this._bOut;
        const lx = this.swx[i], ly = this.swy[i], lz = this.swz[i];
        pose[0] = this.bigX + R.x * lx + U.x * ly + O.x * lz;
        pose[1] = this.bigY + R.y * lx + U.y * ly + O.y * lz;
        pose[2] = 0.6 + R.z * lx + U.z * ly + O.z * lz;
        _v.set(U.x + R.x * this.stx[i] + O.x * this.stz[i],
          U.y + R.y * this.stx[i] + O.y * this.stz[i],
          U.z + R.z * this.stx[i] + O.z * this.stz[i]);
        const bl = _v.length() || 1;
        pose[3] = _v.x / bl; pose[4] = _v.y / bl; pose[5] = _v.z / bl;
        pose[6] = this.sws[i];
        pose[7] = 0.62 + 0.16 * Math.sin(t * 2.4 + i * 0.4);
        pose[8] = 0;
        return;
      }
      case 'WATERFALL': case 'RAIN': case 'EXPLODE': {
        // 速度型：位置在 update 主循环积分，这里只给默认朝向/亮度占位
        pose[0] = this.px[i]; pose[1] = this.py[i]; pose[2] = this.pz[i];
        pose[3] = 0; pose[4] = 1; pose[5] = 0;
        pose[6] = 0.7;
        pose[7] = 0.9;
        pose[8] = 0;
        return;
      }
      default: {
        // IDLE：无人=漫天飞剑；有人=剑阵中心跟手的缓飞云团
        let bx, by, bz;
        if (this._followIdle) {
          bx = this.formCX + this.bx[i] * 7.5 + Math.sin(t * 0.11 + i * 1.7) * 1.2;
          by = this.formCY + (this.by[i] - 0.5) * 6.0 + Math.sin(t * 0.13 + i * 0.9) * 0.4;
          bz = this.bz[i] * 3.2;
        } else {
          bx = this._idleX(i) + Math.sin(t * 0.11 + i * 1.7) * 1.6;
          by = this._idleY(i) + Math.sin(t * 0.13 + i * 0.9) * 0.5;
          bz = this._idleZ(i);
        }
        pose[0] = bx; pose[1] = by; pose[2] = bz;
        const w = t * 0.35 + i * 2.39996;
        pose[3] = Math.sin(w);
        pose[4] = Math.sin(t * 0.23 + i) * 0.45;
        pose[5] = Math.cos(w * 0.83);
        const l = Math.hypot(pose[3], pose[4], pose[5]) || 1;
        pose[3] /= l; pose[4] /= l; pose[5] /= l;
        pose[6] = lay.scale;
        pose[7] = 0.55 + 0.2 * Math.sin(t * 0.9 + i * 0.7);
        pose[8] = 0;
        return;
      }
    }
  }

  // 六芒星能量连线位置（sword-control updateHexagramLines）
  _updateHexLines(form, t) {
    const on = form === 'HEXAGRAM';
    if (!on && !this.hexLines[0].visible) return;
    const F = FX.formations;
    for (let vi = 0; vi < 6; vi++) {
      const ang = t * 0.48 + vi * Math.PI / 3;
      this._hexV[vi].set(
        this.formCX + Math.cos(ang) * F.hexRadius,
        this.formCY + Math.sin(t * 1.2 + vi) * 0.3,
        Math.sin(ang) * F.hexRadius);
    }
    for (let k = 0; k < 9; k++) {
      const line = this.hexLines[k];
      line.visible = on;
      if (!on) continue;
      const pos = line.geometry.attributes.position.array;
      let a, bIdx;
      if (k < 6) { a = k; bIdx = (k + 1) % 6; }
      else { const j = k - 6; a = j; bIdx = (j + 3) % 6; }
      pos[0] = this._hexV[a].x; pos[1] = this._hexV[a].y; pos[2] = this._hexV[a].z;
      pos[3] = this._hexV[bIdx].x; pos[4] = this._hexV[bIdx].y; pos[5] = this._hexV[bIdx].z;
      line.geometry.attributes.position.needsUpdate = true;
    }
  }

  // 剑指朝向/原点：跟手平滑 + 指向轴正交基（云团在 _poseOf 里消费）。独立大剑网格永久隐藏。
  _updateBigSword(dt, t) {
    void t;
    this.bigSword.visible = false;
    const k = 1 - Math.exp(-6.3 * dt);
    this.bigX += (this.handX - this.bigX) * k;
    this.bigY += (this.handY - this.bigY) * k;
    _v.set(this.dirX, this.dirY + 0.55, this.dirZ * 0.6);
    if (_v.lengthSq() < 1e-6) _v.set(0, 1, 0); else _v.normalize();
    this.bigDir.lerp(_v, Math.min(1, 6 * dt)).normalize();
    this._bUp.copy(this.bigDir);
    if (Math.abs(this._bUp.z) < 0.92) this._bRight.crossVectors(this._bUp, Z);
    else this._bRight.crossVectors(this._bUp, X);
    if (this._bRight.lengthSq() < 1e-8) this._bRight.set(1, 0, 0);
    else this._bRight.normalize();
    this._bOut.crossVectors(this._bRight, this._bUp).normalize();
  }

  // 内核矩阵/颜色同步到光晕层与外层 InstancedMesh
  _syncLayers() {
    const src = this.mesh;
    src.instanceMatrix.needsUpdate = true;
    if (src.instanceColor) src.instanceColor.needsUpdate = true;
    for (const layer of [this.meshMid, this.meshOuter]) {
      layer.instanceMatrix.array.set(src.instanceMatrix.array);
      layer.instanceMatrix.needsUpdate = true;
      if (src.instanceColor) {
        if (!layer.instanceColor) {
          layer.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(src.instanceColor.array), 3);
        } else {
          layer.instanceColor.array.set(src.instanceColor.array);
        }
        layer.instanceColor.needsUpdate = true;
      }
    }
  }

  // 激活的剑总数（HUD 调试用）
  get activeCount() { return this.swordTotal; }
}
