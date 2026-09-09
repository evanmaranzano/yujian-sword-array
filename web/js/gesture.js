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
  DOUBLE_FIST: 'DOUBLE_FIST',     // 双拳 → 大庚剑阵（八卦合一）
};

function distance3D(p1, p2) {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow((p1.z || 0) - (p2.z || 0), 2)
  );
}

// ---- 单手判定 ----

function isFist(landmarks) {
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
  // 大拇指伸直向上
  const thumbExtended = (landmarks[4].y < landmarks[3].y && landmarks[3].y < landmarks[2].y) ||
    (distance3D(landmarks[4], landmarks[0]) > distance3D(landmarks[2], landmarks[0]) * 1.15 && landmarks[4].y < landmarks[2].y);
  // 其它四指必须收拢弯曲
  const indexCurled = landmarks[8].y > landmarks[6].y || distance3D(landmarks[8], landmarks[0]) < distance3D(landmarks[5], landmarks[0]) * 1.35;
  const middleCurled = landmarks[12].y > landmarks[10].y || distance3D(landmarks[12], landmarks[0]) < distance3D(landmarks[9], landmarks[0]) * 1.35;
  const ringCurled = landmarks[16].y > landmarks[14].y || distance3D(landmarks[16], landmarks[0]) < distance3D(landmarks[13], landmarks[0]) * 1.35;
  const pinkyCurled = landmarks[20].y > landmarks[18].y || distance3D(landmarks[20], landmarks[0]) < distance3D(landmarks[17], landmarks[0]) * 1.35;
  return thumbExtended && indexCurled && middleCurled && ringCurled && pinkyCurled;
}

function isTwoFingers(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[7].y && landmarks[7].y < landmarks[6].y;
  const middleExtended = landmarks[12].y < landmarks[11].y && landmarks[11].y < landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  return indexExtended && middleExtended && ringCurled && pinkyCurled;
}

function isPalmDown(landmarks) {
  let extendedCount = 0;
  const tips = [8, 12, 16, 20], mids = [6, 10, 14, 18];
  for (let i = 0; i < 4; i++) {
    if (distance3D(landmarks[tips[i]], landmarks[0]) > distance3D(landmarks[mids[i]], landmarks[0])) extendedCount++;
  }
  const avgTipY = (landmarks[8].y + landmarks[12].y + landmarks[16].y + landmarks[20].y) / 4;
  const palmFacingDown = landmarks[0].y < avgTipY - 0.02 || avgTipY > landmarks[5].y - 0.02;
  return extendedCount >= 3 && palmFacingDown;
}

function isOpenPalm(landmarks) {
  const fingers = [
    [8, 7, 6], [12, 11, 10], [16, 15, 14], [20, 19, 18],
  ];
  let extendedCount = 0;
  for (const [tip, mid, base] of fingers) {
    if (landmarks[tip].y < landmarks[mid].y && landmarks[mid].y < landmarks[base].y) extendedCount++;
  }
  const thumbExtended = distance3D(landmarks[4], landmarks[5]) > 0.1;
  return extendedCount >= 3 && thumbExtended;
}

function isShaka(landmarks) {
  const thumbOut = distance3D(landmarks[4], landmarks[9]) > 0.12;
  const pinkyExtended = landmarks[20].y < landmarks[19].y && landmarks[19].y < landmarks[18].y;
  const indexCurled = landmarks[8].y > landmarks[6].y;
  const middleCurled = landmarks[12].y > landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  return thumbOut && pinkyExtended && indexCurled && middleCurled && ringCurled;
}

function isRock(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[7].y && landmarks[7].y < landmarks[6].y;
  const pinkyExtended = landmarks[20].y < landmarks[19].y && landmarks[19].y < landmarks[18].y;
  const middleCurled = landmarks[12].y > landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
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
    else if (isThumbUp(landmarks)) newGesture = G.THUMB_UP;       // 点赞优先，绝不抢跑剑指
    else if (isTwoFingers(landmarks)) newGesture = G.TWO_FINGERS;
    else if (isShaka(landmarks)) newGesture = G.SHAKA;
    else if (isRock(landmarks)) newGesture = G.ROCK;
    else if (isPalmDown(landmarks)) newGesture = G.PALM_DOWN;     // 下压优先于向上开掌
    else if (isOpenPalm(landmarks)) newGesture = G.OPEN_PALM;
  }
  return newGesture;
}

export const GESTURE = G;
