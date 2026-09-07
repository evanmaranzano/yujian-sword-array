// 万剑阵（sword-control 星空光剑重构）：300 把程序化能量光剑三层 InstancedMesh
// （内核青 0x00ffff / 光晕蓝 0x0066ff / 外层 0x00aaff，共享矩阵，参数见 FX.energySword）。
// 待机：三层斐波那契球面缓转（60/100/140 剑，半径 1.5/2.5/3.5，差速旋转）；
// 手势阵型（setMode，数学参考 WoyouWoyou/sword-control MIT 的 update*State 改写为 steering）：
// FIST→SPHERE 斐波那契球 / TWO_FINGERS→BIG_SWORD 合并大剑 / THUMB_UP→PILLAR 剑柱 /
// SHAKA→HEXAGRAM 六芒星 / ROCK→DRAGON 双龙螺旋 / PALM_DOWN→RAIN 剑雨 /
// CROSSED_HANDS→INFINITY 8字环 / HANDS_PUSH→EXPLODE 爆裂 / HANDS_CUP→ENERGY_BALL 聚能球 /
// DOUBLE_FIST→TAICHI 太极双鱼；OPEN_PALM/IDLE/无手 → SPHERE 待机球阵。
// 齐发 burst：从当前阵型调 132 剑 → 雁行集结 → 分波飞越屏幕 → 转向归阵；领头剑挂青色 ribbon 拖尾。
import * as THREE from 'three';
import { FX } from '../fx.config.js';
import { TrailRenderer } from './trail.js';

const Y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _side = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _col = new THREE.Color();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

// 实例运动状态：SPHERE=在阵型中，GATHER/FIRE/RETURN 为齐发弹道
const SPHERE = 0, GATHER = 1, FIRE = 2, RETURN = 3;
// 手势 → 顶层阵型（GESTURE 枚举字符串 → 阵型名）
const FORMATION = {
  IDLE: 'SPHERE', OPEN_PALM: 'SPHERE',
  FIST: 'SPHERE', TWO_FINGERS: 'BIG_SWORD', THUMB_UP: 'PILLAR',
  SHAKA: 'HEXAGRAM', ROCK: 'DRAGON', PALM_DOWN: 'RAIN',
  CROSSED_HANDS: 'INFINITY', HANDS_PUSH: 'EXPLODE',
  HANDS_CUP: 'ENERGY_BALL', DOUBLE_FIST: 'TAICHI',
};
const GOLDEN = (1 + Math.sqrt(5)) / 2;

// 手势阵型目标位形（t=演示时间秒，hand=世界坐标锚点 {x,y}，lay=层级信息）。
// 输出 out=[tx,ty,tz, dx,dy,dz, scaleMul, bright]（dir 为剑尖朝向）。
const FORM_POSE = {
  // 待机/握拳：三层斐波那契球面（sword-control updateFistState），层内差速旋转，剑尖朝球心
  SPHERE(i, N, t, hand, out, lay) {
    const cx = hand.x, cy = hand.y + 1.6, cz = 0.6;
    // 层级旋转角：rotationSpeed 为弧度/帧（60fps），乘 60 转弧度/秒
    const rot = t * lay.speed * 60;
    let theta = lay.theta + rot;
    let phi = lay.phi;
    if (lay.idx === 0) theta += rot;                                  // 内层绕 Y 加速
    else if (lay.idx === 1) { theta += rot * 0.8; phi += Math.sin(rot * 0.5) * 0.1; }
    else { theta += rot; phi += Math.sin(rot * 0.3) * 0.05; }
    const R = lay.radius;
    const x = cx + R * Math.sin(phi) * Math.cos(theta);
    const y = cy + R * Math.cos(phi);
    const z = cz + R * Math.sin(phi) * Math.sin(theta);
    out[0] = x; out[1] = y; out[2] = z;
    const dx = cx - x, dy = cy - y, dz = cz - z;
    const l = Math.hypot(dx, dy, dz) || 1;
    out[3] = dx / l; out[4] = dy / l; out[5] = dz / l;
    out[6] = lay.scale * (1 + 0.02 * Math.sin(t * 3 + i * 0.1));
    out[7] = 0.7 + 0.2 * Math.sin(t * 1.6 + i * 0.5);
  },

  // 所有剑合并为一把大剑：共享手上方锚点、抖动打散、巨型缩放、剑尖朝上
  BIG_SWORD(i, N, t, hand, out) {
    const F = FX.formations;
    out[0] = hand.x + Math.sin(i * 12.9898) * 0.5;
    out[1] = hand.y + F.bigSwordOffset + Math.sin(i * 78.233) * 0.5;
    out[2] = 0.6 + Math.sin(i * 39.425) * 0.35;
    out[3] = 0; out[4] = 1; out[5] = 0;
    out[6] = F.bigSwordScale * (1 + 0.02 * Math.sin(t * 3));
    out[7] = 1.0;
  },

  // 剑柱冲天：分层圆柱面螺旋上升，剑尖朝上，能量波亮度沿柱流动
  PILLAR(i, N, t, hand, out) {
    const F = FX.formations, layers = 6;
    const li = Math.floor(i * layers / N);
    const k = i % Math.ceil(N / layers);
    const n = Math.ceil(N / layers);
    const ang = (k / n) * Math.PI * 2 + t * 0.35 + li * 0.5;
    const hr = li / layers;
    const r = F.pillarRadius + Math.sin(t * 1.8 + hr * Math.PI * 2) * 0.3;
    out[0] = hand.x + Math.cos(ang) * r;
    out[1] = hand.y - 1.5 + hr * F.pillarHeight;
    out[2] = 0.6 + Math.sin(ang) * r;
    out[3] = 0; out[4] = 1; out[5] = 0;
    out[6] = 0.55;
    out[7] = 0.65 + 0.35 * Math.sin(t * 3 - hr * Math.PI * 4);
  },

  // 六芒星阵：6 顶点绕手心缓转，剑群在顶点小球簇内，剑尖朝阵心
  HEXAGRAM(i, N, t, hand, out) {
    const F = FX.formations;
    const cx = hand.x, cy = hand.y + 1.2, cz = 0.6;
    const rot = t * 0.28;
    const vi = Math.floor(i * 6 / N) % 6;
    const ang = rot + vi * Math.PI / 3;
    const vx = cx + Math.cos(ang) * F.hexRadius;
    const vy = cy + Math.sin(ang) * F.hexRadius * 0.72;
    const vz = cz + Math.sin(ang) * F.hexRadius * 0.28;
    const k = i % Math.ceil(N / 6);
    const n = Math.ceil(N / 6);
    const sa = (k / n) * Math.PI * 2 + t * 0.9;
    const sp = (k / n) * Math.PI;
    const sr = 0.8;
    out[0] = vx + Math.sin(sp) * Math.cos(sa) * sr;
    out[1] = vy + Math.cos(sp) * sr;
    out[2] = vz + Math.sin(sp) * Math.sin(sa) * sr;
    const dx = cx - out[0], dy = cy - out[1], dz = cz - out[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    out[3] = dx / l; out[4] = dy / l; out[5] = dz / l;
    out[6] = 0.5;
    out[7] = 0.7 + 0.25 * Math.sin(t * 2 + vi);
  },

  // 双龙螺旋：两条相位差 π、旋向相反的螺旋，剑尖沿切线
  DRAGON(i, N, t, hand, out) {
    const F = FX.formations;
    const half = Math.ceil(N / 2);
    const b = i >= half;
    const k = b ? i - half : i;
    const u = k / half;
    const rotDir = b ? -1 : 1;
    const ang = u * Math.PI * 4 + t * 0.8 * rotDir + (b ? Math.PI : 0);
    out[0] = hand.x + Math.cos(ang) * F.dragonRadius;
    out[1] = hand.y - 2 + u * F.dragonHeight;
    out[2] = 0.6 + Math.sin(ang) * F.dragonRadius;
    const ta = ang + Math.PI / 2 * rotDir;
    const dx = -Math.sin(ta), dz = Math.cos(ta);
    const l = Math.hypot(dx, 0.5, dz) || 1;
    out[3] = dx / l; out[4] = 0.5 / l; out[5] = dz / l;
    out[6] = 0.55 * (1 + 0.1 * Math.sin(t * 2.4 + u * 12));
    out[7] = 0.85;
  },

  // 剑雨：手位上方宽域落剑，剑尖朝下，落地回顶
  RAIN(i, N, t, hand, out) {
    const F = FX.formations;
    const span = F.rainFallSpeed * 3.2;                 // 一次落程高度
    const u = (t * F.rainFallSpeed + (i * span) / N) % (span * 1.6);
    out[0] = hand.x + Math.sin(i * 12.9898) * F.rainWidth * 0.5;
    out[1] = F.rainGroundY + span * 1.6 - u;
    out[2] = Math.sin(i * 78.233) * 2.2;
    out[3] = 0; out[4] = -1; out[5] = 0;
    out[6] = 0.5;
    out[7] = 0.8;
  },

  // 8字环（Lissajous）：剑尖沿轨道切线，中心交叉点加速感由亮度脉动表达
  INFINITY(i, N, t, hand, out) {
    const F = FX.formations;
    const ph = (i / N) * Math.PI * 2 + t * 0.6;
    const cy = hand.y + 1.4;
    out[0] = hand.x + F.infinityScaleX * Math.sin(ph);
    out[1] = cy + F.infinityScaleY * Math.sin(ph * 2);
    out[2] = 0.6 + F.infinityScaleZ * Math.cos(ph);
    const p2 = ph + 0.05;
    const dx = F.infinityScaleX * Math.sin(p2) - F.infinityScaleX * Math.sin(ph);
    const dy = F.infinityScaleY * Math.sin(p2 * 2) - F.infinityScaleY * Math.sin(ph * 2);
    const dz = F.infinityScaleZ * Math.cos(p2) - F.infinityScaleZ * Math.cos(ph);
    const l = Math.hypot(dx, dy, dz) || 1;
    out[3] = dx / l; out[4] = dy / l; out[5] = dz / l;
    out[6] = 0.55 * (0.9 + 0.25 * Math.abs(Math.cos(ph)));
    out[7] = 0.75 + 0.2 * Math.abs(Math.cos(ph));
  },

  // 爆裂：径向弹道外扩，出界后回吸；飞行方向为朝向
  EXPLODE(i, N, t, hand, out) {
    out[0] = 0; out[1] = 0; out[2] = 0;                 // 未用（弹道积分）
    out[3] = 0; out[4] = 1; out[5] = 0;
    out[6] = 0.6 * (1 + 0.08 * Math.sin(t * 3 + i * 0.4));
    out[7] = 0.9;
  },

  // 聚能球：斐波那契球面 + 呼吸脉动，球心在手上，剑尖朝球心
  ENERGY_BALL(i, N, t, hand, out) {
    const F = FX.formations;
    const cx = hand.x, cy = hand.y + 1.5, cz = 0.6;
    const R = F.sphereRadius * 0.62 * (1 + 0.1 * Math.sin(t * 1.4));
    const theta = 2 * Math.PI * i / GOLDEN + t * 0.35;
    const phi = Math.acos(1 - 2 * (i + 0.5) / N);
    const x = cx + R * Math.sin(phi) * Math.cos(theta);
    const y = cy + R * Math.cos(phi);
    const z = cz + R * Math.sin(phi) * Math.sin(theta);
    out[0] = x; out[1] = y; out[2] = z;
    const dx = cx - x, dy = cy - y, dz = cz - z;
    const l = Math.hypot(dx, dy, dz) || 1;
    out[3] = dx / l; out[4] = dy / l; out[5] = dz / l;
    out[6] = 0.45 * (1 + 0.08 * Math.sin(t * 1.4));
    out[7] = 0.85 + 0.15 * Math.sin(t * 1.4);
  },

  // 太极双鱼：倾斜盘面上阴阳双群互绕，剑尖沿盘面切线
  TAICHI(i, N, t, hand, out) {
    const F = FX.formations;
    const half = Math.ceil(N / 2);
    const yin = i < half;
    const u = (yin ? i : i - half) / half;
    const ang = u * Math.PI * 2 + t * 0.45 + (yin ? 0 : Math.PI);
    const sgn = yin ? 1 : -1;
    const smallA = ang * 2;
    const sr = F.taichiRadius * 0.5 * (0.3 + u * 0.4);
    const uu = Math.cos(ang) * F.taichiRadius * 0.5 + Math.cos(smallA) * sr * sgn;
    const vv = Math.sin(ang) * F.taichiRadius * 0.5 + Math.sin(smallA) * sr * sgn;
    const tilt = F.taichiTilt;
    const cy = hand.y + 1.4, cz = 0.6;
    out[0] = hand.x + uu;
    out[1] = cy + vv * Math.cos(tilt) + Math.sin(ang * 2 + t * 0.8) * 0.15;
    out[2] = cz + vv * Math.sin(tilt);
    const tu = -Math.sin(ang) * sgn, tv = Math.cos(ang) * sgn;
    const dx = tu, dy = tv * Math.cos(tilt), dz = tv * Math.sin(tilt);
    const l = Math.hypot(dx, dy, dz) || 1;
    out[3] = dx / l; out[4] = dy / l; out[5] = dz / l;
    out[6] = 0.5 * (1 + 0.06 * Math.sin(t * 1.8 + i * 0.2));
    out[7] = yin ? 0.85 : 0.6;
  },
};

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
    this.dirx = new Float32Array(N); this.diry = new Float32Array(N);
    this.scale = new Float32Array(N);
    this._cursor = 0;
    this.counts = { form: 0, fire: 0, gather: 0, ret: 0 };

    // 三层球面槽位（sword-control sphereLayers：60/100/140，斐波那契分布）
    const layers = FX.volley.sphereLayers;
    this.layerIdx = new Uint8Array(N);      // 层级 0/1/2
    this.layerTheta = new Float32Array(N);  // 层内斐波那契角 θ
    this.layerPhi = new Float32Array(N);    // 层内斐波那契角 φ
    this._layerOf = [];                     // 每级缓存 {idx,radius,speed,scale}
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
    for (let i = this.swordTotal; i < N; i++) this.scale[i] = 0;

    // 手势阵型顶层状态
    this.formation = 'SPHERE';
    this.formationAge = 0;
    this.handX = 0; this.handY = 0;

    // 初始：散落地面（sword-control spread=18, y=-3+random*0.5），种子确定性伪随机
    for (let i = 0; i < N; i++) {
      if (i < this.swordTotal) {
        this.px[i] = Math.sin(i * 12.9898) * 9;
        this.py[i] = -3 + ((i * 0.6180339) % 1) * 0.5;
        this.pz[i] = Math.sin(i * 78.233) * 9;
      } else {
        this.mesh.setMatrixAt(i, _zero);
      }
    }
    this._syncLayers();

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

  // 实例层级信息（out 复用，避免每帧分配）
  _lay(i) {
    const L = this._layerOf[this.layerIdx[i]];
    this._layTmp.idx = L.idx; this._layTmp.radius = L.radius;
    this._layTmp.speed = L.speed; this._layTmp.scale = L.scale;
    this._layTmp.theta = this.layerTheta[i]; this._layTmp.phi = this.layerPhi[i];
    return this._layTmp;
  }

  // 手势 → 阵型切换（GESTURE 枚举字符串；未知手势回退 SPHERE）。
  // handPos = 世界坐标 {x, y}；重复设置同一阵型不重置计时。
  setMode(gesture, handPos) {
    const f = FORMATION[gesture] || 'SPHERE';
    if (handPos) { this.handX = handPos.x; this.handY = handPos.y; }
    if (f === this.formation) return;
    this.formation = f;
    this.formationAge = 0;
    if (f === 'EXPLODE') this._seedExplode();
  }

  // 爆裂：以手位为心，沿斐波那契球面方向赋予径向初速
  _seedExplode() {
    const C = FX.formations;
    for (let i = 0; i < this.swordTotal; i++) {
      const theta = 2 * Math.PI * i / GOLDEN;
      const phi = Math.acos(1 - 2 * (i + 0.5) / this.swordTotal);
      const sp = C.explodeSpeed * (0.6 + 0.4 * ((i * 0.618) % 1));
      this.vx[i] = Math.sin(phi) * Math.cos(theta) * sp;
      this.vy[i] = Math.cos(phi) * sp;
      this.vz[i] = Math.sin(phi) * Math.sin(theta) * sp * 0.6;
    }
  }

  // 一记齐发：从当前阵型调剑
  burst(ox, oy, dx, dy, peak) {
    const C = FX.volley;
    const M = Math.min(C.burstCount, this.swordTotal);
    const perpx = -dy, perpy = dx;
    for (let k = 0; k < M; k++) {
      const i = this._nextFormationSword();
      if (i < 0) break;
      this.mode[i] = GATHER;
      this.age[i] = 0;
      // 雁行集结位：手后方沿垂直挥向排开
      const u = (k / (M - 1) || 0) - 0.5;
      const rank = (k % 3);                       // 三排
      this.sx[i] = ox - dx * (2.0 + rank * 0.9) + perpx * u * 9.5;
      this.sy[i] = oy - dy * (2.0 + rank * 0.9) + perpy * u * 9.5;
      this.sz[i] = 0.6 - rank * 0.8;
      this.dirx[i] = dx; this.diry[i] = dy;
      this.vx[i] *= 0.3; this.vy[i] *= 0.3;
    }
    // 领头十把挂拖尾
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
    void personPresent;
    const C = FX.volley;
    this.formationAge += dt;

    this.counts.form = 0; this.counts.fire = 0; this.counts.gather = 0; this.counts.ret = 0;

    const form = this.formation;
    const poseFn = FORM_POSE[form] || FORM_POSE.SPHERE;
    const hand = { x: this.handX, y: this.handY };
    // 帧率无关吸附系数（formation 摆位用）
    const lerp = 1 - Math.exp(-FX.formations.lerpK * dt);
    const pose = this._pose || (this._pose = new Float64Array(8));

    for (let i = 0; i < this.max; i++) {
      const m = this.mode[i];
      let bright = 0;
      switch (m) {
        case SPHERE: {
          this.counts.form++;
          poseFn(i, this.swordTotal, t, hand, pose, this._lay(i));
          if (form === 'EXPLODE') {
            // 弹道积分：初速由 setMode 播种；出界回吸阵型中心
            this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
            const dx = this.px[i] - hand.x, dy = this.py[i] - (hand.y + 1.2), dz = this.pz[i] - 0.6;
            const r = Math.hypot(dx, dy, dz);
            if (r > FX.formations.explodeMaxR) {
              this.vx[i] -= dx / r * 26 * dt; this.vy[i] -= dy / r * 26 * dt; this.vz[i] -= dz / r * 26 * dt;
            }
            _v2.set(this.vx[i], this.vy[i], this.vz[i]);
            if (_v2.lengthSq() > 0.01) _v2.normalize(); else _v2.copy(Y);
          } else {
            // 平滑吸附到阵型目标位，朝向取阵型给出的剑尖方向
            this.px[i] += (pose[0] - this.px[i]) * lerp;
            this.py[i] += (pose[1] - this.py[i]) * lerp;
            this.pz[i] += (pose[2] - this.pz[i]) * lerp;
            _v2.set(pose[3], pose[4], pose[5]);
          }
          this.scale[i] += (pose[6] - this.scale[i]) * lerp;
          this._writeInstance(i, _v2, this.scale[i], pose[7]);
          continue;
        }
        case GATHER: {
          this.counts.gather++;
          this.age[i] += dt;
          this._seek(i, this.sx[i], this.sy[i], this.sz[i], 64, dt);
          const arrived = Math.hypot(this.sx[i] - this.px[i], this.sy[i] - this.py[i]) < 0.8;
          bright = 0.55 + 0.45 * Math.min(1, this.age[i] / C.gatherTime);
          if (arrived || this.age[i] >= C.gatherTime) {
            this.mode[i] = FIRE; this.age[i] = 0;
            this.life[i] = C.fireLife[0] + Math.random() * (C.fireLife[1] - C.fireLife[0]);
            const u = (Math.random() - 0.5);
            const sp = C.fireSpeed[0] + Math.random() * (C.fireSpeed[1] - C.fireSpeed[0]);
            this.vx[i] = (this.dirx[i] + -this.diry[i] * u * 0.22) * sp;
            this.vy[i] = (this.diry[i] + this.dirx[i] * u * 0.22) * sp;
            this.vz[i] = (Math.random() - 0.5) * 2.2;
            this.scale[i] = 0.85;
            // 每记前 trailLeads 把成为领头
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
          // 轻微正弦摆，避免全是直线
          const wob = Math.sin(this.age[i] * 9 + i) * 6 * dt;
          this.vx[i] += -this.diry[i] * wob;
          this.vy[i] += this.dirx[i] * wob;
          this.vz[i] *= 1 - 0.6 * dt;
          this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
          // 出界 → 归阵
          if (this.age[i] > this.life[i] || Math.abs(this.px[i]) > 42 || this.py[i] > 30 || this.py[i] < -14) {
            this.mode[i] = RETURN; this.age[i] = 0;
          }
          bright = 1.0;
          break;
        }
        case RETURN: {
          this.counts.ret++;
          this.age[i] += dt;
          poseFn(i, this.swordTotal, t, hand, pose, this._lay(i));
          this._seek(i, pose[0], pose[1], pose[2], 18, dt);
          if (Math.hypot(pose[0] - this.px[i], pose[1] - this.py[i], pose[2] - this.pz[i]) < 1.0 || this.age[i] > 4) {
            this.mode[i] = SPHERE; this.scale[i] = pose[6];
          }
          bright = Math.max(0.3, 0.85 - this.age[i] * 0.5);
          break;
        }
      }

      // 位移积分（GATHER/RETURN 由 seek 给速度，FIRE 各自积分）
      if (m === GATHER || m === RETURN) {
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      }

      // 朝向速度
      _v.set(this.vx[i], this.vy[i], this.vz[i]);
      const vl = _v.length();
      if (vl > 0.2) { _v.multiplyScalar(1 / vl); _q.setFromUnitVectors(Y, _v); }
      else _q.identity();
      // 集结/飞行时略微放大
      let s = this.scale[i];
      if (m === GATHER || m === FIRE) s = 0.85;
      if (m === RETURN) s = this.scale[i] * (1 - Math.min(0.4, this.age[i] * 0.3));
      // scale 不能与 position 共用临时向量：Matrix4.compose 最后才读 position（te[12..14]），
      // 共用会把位置覆盖成 scale 值，全部实例塌缩到 (s,s,s)
      _m.compose(_v2.set(this.px[i], this.py[i], this.pz[i]), _q, _scl.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _col.setRGB(0.35 * bright + 0.08, 0.75 * bright + 0.12, 1.0 * bright + 0.18));
    }

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
        // 屏幕平面内垂直于运动方向的宽度向量（相机大致沿 -Z）
        _side.set(-this.vy[i], this.vx[i], 0);
        if (_side.lengthSq() > 1e-6) _side.normalize().multiplyScalar(0.6);
        else _side.set(0, 0.6, 0);
        tr.advanceWorld(tip, _side);
        tr.material.uniforms.headColor.value.w = this.mode[i] === FIRE ? 0.5 : 0.2;
      }
    }

    this._syncLayers();
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

  _writeInstance(i, dir, s, bright) {
    const q = _q.setFromUnitVectors(Y, dir.lengthSq ? dir : Y);
    _m.compose(_v2.set(this.px[i], this.py[i], this.pz[i]), q, _scl.set(s, s, s));
    this.mesh.setMatrixAt(i, _m);
    this.mesh.setColorAt(i, _col.setRGB(0.35 * bright + 0.08, 0.75 * bright + 0.12, 1.0 * bright + 0.18));
  }

  // 激活的剑总数（HUD 调试用）
  get activeCount() { return this.swordTotal; }
}
