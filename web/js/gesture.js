// 手势分类器：11 种静态手势的几何规则检测。
// 针对真机实测痛点深度调优：
// 1. 点赞 (THUMB_UP) 优先于剑指裁决，杜绝大拇指竖起被误当剑指；
// 2. 剑指 (TWO_FINGERS) 确保食中二指真正伸展，环指小指卷曲，拇指绝不竖起；
// 3. 双手交叉 (CROSSED_HANDS) 判定双手腕/指掌 X 交叉反序，搭腕与小臂交叠均可顺畅识别；
// 4. 下压 (PALM_DOWN) 放宽严格仰角限制，平掌下沉即可快速触发；
// 5. 双拳 (DOUBLE_FIST) 与金属礼 (ROCK) 均对应大庚剑阵。
import { CFG } from './config.js';

const G = {
  IDLE: 'IDLE',
  FIST: 'FIST',               // 握拳 → 剑盾护体
  TWO_FINGERS: 'TWO_FINGERS', // 剑指 → 游龙随行 / 疾挥破空
  OPEN_PALM: 'OPEN_PALM',     // 出掌 → 莲花现世
  THUMB_UP: 'THUMB_UP',       // 点赞 → 冲天剑柱
  SHAKA: 'SHAKA',             // 六字诀 → 六芒星阵
  ROCK: 'ROCK',               // Rock → 大庚剑阵
  PALM_DOWN: 'PALM_DOWN',     // 下压 → 剑雨倾盆
  // 双手
  CROSSED_HANDS: 'CROSSED_HANDS', // 交叉 → 8字环
  HANDS_PUSH: 'HANDS_PUSH',       // 推开 → 爆裂波
  HANDS_CUP: 'HANDS_CUP',         // 捧起 → 聚能球
  DOUBLE_FIST: 'DOUBLE_FIST',     // 双拳 → 八卦阵
  THREE_FINGERS: 'THREE_FINGERS', // 三指（隐藏）→ Molispark 字阵
};

function distance3D(p1, p2) {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow((p1.z || 0) - (p2.z || 0), 2)
  );
}

// PIP 关节角：p2 处 p1-p2-p3 的夹角（度）。伸直 ≈180°，弯曲显著变小。
// 亮光抖动下单通道判据会跳变，角度与距离比互为冗余：伸直取或、弯曲取或。
function jointAngle(p1, p2, p3) {
  const v1x = p1.x - p2.x, v1y = p1.y - p2.y, v1z = (p1.z || 0) - (p2.z || 0);
  const v2x = p3.x - p2.x, v2y = p3.y - p2.y, v2z = (p3.z || 0) - (p2.z || 0);
  const dot = v1x * v2x + v1y * v2y + v1z * v2z;
  const m1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z) || 1e-6;
  const m2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z) || 1e-6;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))))) * 180 / Math.PI;
}

const FINGERS = [
  { mcp: 5, pip: 6, dip: 7, tip: 8 },     // 食指
  { mcp: 9, pip: 10, dip: 11, tip: 12 },  // 中指
  { mcp: 13, pip: 14, dip: 15, tip: 16 }, // 无名指
  { mcp: 17, pip: 18, dip: 19, tip: 20 }, // 小指
];

// 手指伸直：指尖不能比指根靠近手腕；关节角 >148° 或 距离比 >1.13（方向不变）
//（前指姿态 z 深度噪声大，门限 09-11 放宽：1.05→1.02 / 150→148 / 1.16→1.13）
function fingerExt(h, f) {
  const F = FINGERS[f];
  if (distance3D(h[F.tip], h[0]) < distance3D(h[F.mcp], h[0]) * 1.02) return false;
  if (jointAngle(h[F.mcp], h[F.pip], h[F.dip]) > 148) return true;
  return distance3D(h[F.tip], h[0]) > distance3D(h[F.pip], h[0]) * 1.13;
}
// 手指弯曲：关节角 <110° 或 距离比 <0.97
function fingerCurl(h, f) {
  const F = FINGERS[f];
  if (jointAngle(h[F.mcp], h[F.pip], h[F.dip]) < 110) return true;
  return distance3D(h[F.tip], h[0]) < distance3D(h[F.pip], h[0]) * 0.97;
}

// ---- 单手判定 ----

function isFist(landmarks) {
  // 食指或中指若有伸展，绝非握拳（杜绝任何倾斜剑指被误判为握拳）
  if (fingerExt(landmarks, 0) || fingerExt(landmarks, 1)) return false;
  const wrist = landmarks[0];
  const fingerTips = [8, 12, 16, 20];
  const fingerBases = [5, 9, 13, 17];
  let curledCount = 0;
  for (let i = 0; i < fingerTips.length; i++) {
    const tipToWrist = distance3D(landmarks[fingerTips[i]], wrist);
    const baseToWrist = distance3D(landmarks[fingerBases[i]], wrist);
    if (tipToWrist < baseToWrist * 1.25) curledCount++;
  }
  const thumbCurled = distance3D(landmarks[4], landmarks[5]) < 0.11 ||
    distance3D(landmarks[4], landmarks[9]) < 0.15 ||
    landmarks[4].y > landmarks[2].y;
  if (thumbCurled) curledCount++;
  return curledCount >= 5;
}

function isThumbUp(landmarks) {
  // 食指或中指若有伸展，绝非点赞（杜绝剑指水平/微倾时被抢跑）
  if (fingerExt(landmarks, 0) || fingerExt(landmarks, 1)) return false;
  // 大拇指伸直向上
  const thumbExtended = (landmarks[4].y < landmarks[3].y && landmarks[3].y < landmarks[2].y) ||
    (distance3D(landmarks[4], landmarks[0]) > distance3D(landmarks[2], landmarks[0]) * 1.15 && landmarks[4].y < landmarks[2].y);
  // 其它四指必须真正弯曲收拢（结合角度与距离，不依赖易受手位影响的单向 y 轴判断）
  const indexCurled = fingerCurl(landmarks, 0) || distance3D(landmarks[8], landmarks[0]) < distance3D(landmarks[5], landmarks[0]) * 1.30;
  const middleCurled = fingerCurl(landmarks, 1) || distance3D(landmarks[12], landmarks[0]) < distance3D(landmarks[9], landmarks[0]) * 1.30;
  const ringCurled = fingerCurl(landmarks, 2) || distance3D(landmarks[16], landmarks[0]) < distance3D(landmarks[13], landmarks[0]) * 1.30;
  const pinkyCurled = fingerCurl(landmarks, 3) || distance3D(landmarks[20], landmarks[0]) < distance3D(landmarks[17], landmarks[0]) * 1.30;
  return thumbExtended && indexCurled && middleCurled && ringCurled && pinkyCurled;
}

function isTwoFingers(landmarks) {
  const indexExtended = fingerExt(landmarks, 0);
  const middleExtended = fingerExt(landmarks, 1);
  if (!indexExtended || !middleExtended) return false;

  // 无名指/小指收拢：严格卷曲判定，或相对中指尖明显回缩（<80%）。
  // 相对判定与手朝向无关——前指屏幕的剑指深度噪声大，绝对距离比常失灵
  //（2026-09-11 实测：剑指前指漏检后落进 PALM_DOWN，"一直都是剑雨倾盆"）。
  const wrist = landmarks[0];
  const midTipDist = distance3D(landmarks[12], wrist);
  const pinkyTucked = fingerCurl(landmarks, 3) ||
    distance3D(landmarks[20], wrist) < distance3D(landmarks[18], wrist) * 0.98 ||
    distance3D(landmarks[20], wrist) < midTipDist * 0.80;
  if (!pinkyTucked) return false;
  const ringTucked = fingerCurl(landmarks, 2) ||
    distance3D(landmarks[16], wrist) < distance3D(landmarks[14], wrist) * 1.05 ||
    distance3D(landmarks[16], wrist) < midTipDist * 0.80;
  return ringTucked;
}

// 掌法向（腕→食指根 × 腕→小指根），只取分量比例：|y| 主导 = 掌面放平。
// 与左右手/镜像无关（取绝对值），追踪链同款叉积。
function palmFlatness(landmarks) {
  const w = landmarks[0], ib = landmarks[5], pb = landmarks[17];
  const v1x = ib.x - w.x, v1y = ib.y - w.y, v1z = (ib.z || 0) - (w.z || 0);
  const v2x = pb.x - w.x, v2y = pb.y - w.y, v2z = (pb.z || 0) - (w.z || 0);
  const nx = v1y * v2z - v1z * v2y;
  const ny = v1z * v2x - v1x * v2z;
  const nz = v1x * v2y - v1y * v2x;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6;
  return Math.abs(ny / l);
}

function isPalmDown(landmarks) {
  // 下压 = 掌面放平的按压（掌心朝下/微扣）或整手倒转指尖朝下。
  // 旧判据「指尖均 y > 食指根 y - 0.02」命中一切前伸/非竖直向上的手：
  // 出掌莲花、前指剑指全被抢成剑雨（09-11 用户实测"别的手势识别无效"）。
  let extendedCount = 0;
  const tips = [8, 12, 16, 20], mids = [6, 10, 14, 18];
  for (let i = 0; i < 4; i++) {
    if (distance3D(landmarks[tips[i]], landmarks[0]) > distance3D(landmarks[mids[i]], landmarks[0])) extendedCount++;
  }
  if (extendedCount < 3) return false;
  // 食中伸展而无名/小指收拢 = 指点姿态，绝非按压（isTwoFingers 漏检时的兜底否决）
  if (fingerExt(landmarks, 0) && fingerExt(landmarks, 1) &&
      !fingerExt(landmarks, 2) && !fingerExt(landmarks, 3)) return false;
  const avgTipY = (landmarks[8].y + landmarks[12].y + landmarks[16].y + landmarks[20].y) / 4;
  // 整手倒转：腕明显高过指尖（指尖朝下按压）
  if (landmarks[0].y < avgTipY - 0.05) return true;
  // 掌面放平：法向 y 分量主导（掌面与竖直夹角 > ~47°；竖掌出掌 z 主导不会命中）
  return palmFlatness(landmarks) > 0.68;
}

function isOpenPalm(landmarks) {
  let extendedCount = 0;
  for (let f = 0; f < 4; f++) if (fingerExt(landmarks, f)) extendedCount++;
  const thumbExtended = distance3D(landmarks[4], landmarks[5]) > 0.1;
  return extendedCount >= 3 && thumbExtended;
}

function isShaka(landmarks) {
  const thumbOut = distance3D(landmarks[4], landmarks[9]) > 0.12;
  const pinkyExtended = fingerExt(landmarks, 3);
  const indexCurled = fingerCurl(landmarks, 0);
  const middleCurled = fingerCurl(landmarks, 1);
  const ringCurled = fingerCurl(landmarks, 2);
  return thumbOut && pinkyExtended && indexCurled && middleCurled && ringCurled;
}

function isRock(landmarks) {
  const indexExtended = fingerExt(landmarks, 0);
  const pinkyExtended = fingerExt(landmarks, 3);
  const middleCurled = fingerCurl(landmarks, 1);
  const ringCurled = fingerCurl(landmarks, 2);
  return indexExtended && pinkyExtended && middleCurled && ringCurled;
}

// ---- 双手判定 ----

function fingersExtended(h) {
  let n = 0;
  const tips = [8, 12, 16, 20], mids = [6, 10, 14, 18];
  for (let i = 0; i < 4; i++) {
    if (distance3D(h[tips[i]], h[0]) > distance3D(h[mids[i]], h[0]) * 1.08) n++;
  }
  return n >= 3;
}

function isCrossedHands(h1, h2) {
  const yClose = Math.abs(h1[0].y - h2[0].y) < 0.32 || Math.abs(h1[9].y - h2[9].y) < 0.32;
  const wx = h1[0].x - h2[0].x;
  const kx = h1[9].x - h2[9].x;
  const fx = h1[8].x - h2[8].x;
  const crossed = (wx * fx < 0) || (wx * kx < 0);
  const wristsStacked = Math.hypot(wx, h1[0].y - h2[0].y) < 0.16 && Math.abs(fx) > 0.08;
  return yClose && (crossed || wristsStacked);
}

function isHandsPush(h1, h2) {
  const checkOpen = (h) => {
    let extended = 0;
    const tips = [8, 12, 16, 20], mids = [6, 10, 14, 18];
    for (let i = 0; i < 4; i++) {
      if (h[tips[i]].y < h[mids[i]].y) extended++;
    }
    return extended >= 3;
  };
  const bothOpen = checkOpen(h1) && checkOpen(h2);
  const pushedApart = Math.abs(h1[9].x - h2[9].x) > 0.45;
  return bothOpen && pushedApart;
}

function isHandsCup(h1, h2) {
  if (!fingersExtended(h1) || !fingersExtended(h2)) return false;
  // 双手交叉时手腕与指尖反序，绝不判为捧起
  if ((h1[0].x - h2[0].x) * (h1[8].x - h2[8].x) < 0) return false;
  const yClose = Math.abs(h1[9].y - h2[9].y) < 0.22;
  const distance = Math.abs(h1[9].x - h2[9].x);
  const properDistance = distance > 0.08 && distance < 0.55;
  const left = h1[9].x <= h2[9].x ? h1 : h2;
  const right = h1[9].x <= h2[9].x ? h2 : h1;
  const inward = left[12].x > left[0].x - 0.02 && right[12].x < right[0].x + 0.02;
  return yClose && properDistance && inward;
}
function isDoubleFist(h1, h2) {
  const checkFist = (h) => {
    const wrist = h[0];
    const fingerTips = [8, 12, 16, 20];
    const fingerBases = [5, 9, 13, 17];
    let curledCount = 0;
    for (let i = 0; i < fingerTips.length; i++) {
      const tipDist = distance3D(h[fingerTips[i]], wrist);
      const baseDist = distance3D(h[fingerBases[i]], wrist);
      if (tipDist < baseDist * 1.25) curledCount++;
    }
    return curledCount >= 3;
  };
  return checkFist(h1) && checkFist(h2);
}

// 三指：食中无名伸直、小指弯曲。单手、比合十好做。
// 排在剑指之后、开掌/下压之前——否则 3 指伸展会被 OPEN_PALM 抢走。
function isThreeFingers(landmarks) {
  if (!fingerExt(landmarks, 0) || !fingerExt(landmarks, 1) || !fingerExt(landmarks, 2)) return false;
  const pinkyCurled = fingerCurl(landmarks, 3) ||
    distance3D(landmarks[20], landmarks[0]) < distance3D(landmarks[18], landmarks[0]) * 0.98;
  return pinkyCurled;
}

/**
 * 手势检测入口（严格优先级：双手优先，点赞优先于剑指，下压优先于开掌）
 */
export function detectGesture(landmarks, allHands) {
  let newGesture = G.IDLE;
  if (allHands && allHands.length >= 2) {
    const [h1, h2] = allHands;
    if (isDoubleFist(h1, h2)) newGesture = G.DOUBLE_FIST;
    else if (isCrossedHands(h1, h2)) newGesture = G.CROSSED_HANDS;
    else if (isHandsCup(h1, h2)) newGesture = G.HANDS_CUP;
    else if (isHandsPush(h1, h2)) newGesture = G.HANDS_PUSH;
  }
  if (newGesture === G.IDLE && landmarks) {
    if (isFist(landmarks)) newGesture = G.FIST;
    else if (isThumbUp(landmarks)) newGesture = G.THUMB_UP;
    else if (isTwoFingers(landmarks)) newGesture = G.TWO_FINGERS;
    else if (isThreeFingers(landmarks)) newGesture = G.THREE_FINGERS;
    else if (isShaka(landmarks)) newGesture = G.SHAKA;
    else if (isRock(landmarks)) newGesture = G.ROCK;
    else if (isPalmDown(landmarks)) newGesture = G.PALM_DOWN;
    else if (isOpenPalm(landmarks)) newGesture = G.OPEN_PALM;
  }
  return newGesture;
}

export const GESTURE = G;
