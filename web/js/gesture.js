// 手势分类器：11 种静态手势的几何规则检测。
// v6b：逐行复刻 WoyouWoyou/sword-control（MIT）app.js 的判定逻辑——
// 上一个自研"方向不变"版在真机上被用户判定为不可用，本版以原项目行为为准，
// 只保留与原版无行为差异的整理（阈值/优先级/双手优先全部原样）。
// 输入：MediaPipe HandLandmarker 输出的 21 个 landmark（归一化坐标，y 向下为正）。
// 输出：手势枚举字符串。纯函数，无副作用，node 可测。

const G = {
  IDLE: 'IDLE',
  FIST: 'FIST',               // 握拳 → 万剑聚拢旋转球
  TWO_FINGERS: 'TWO_FINGERS', // 剑指 → 合并大剑跟手
  OPEN_PALM: 'OPEN_PALM',     // 出掌 → 万剑齐发瀑布
  THUMB_UP: 'THUMB_UP',       // 点赞 → 冲天剑柱
  SHAKA: 'SHAKA',             // 六字诀 → 六芒星阵
  ROCK: 'ROCK',               // Rock → 双龙交织
  PALM_DOWN: 'PALM_DOWN',     // 下压 → 剑雨
  // 双手
  CROSSED_HANDS: 'CROSSED_HANDS', // 交叉 → 8字环
  HANDS_PUSH: 'HANDS_PUSH',       // 推开 → 爆裂波
  HANDS_CUP: 'HANDS_CUP',         // 捧起 → 聚能球
  DOUBLE_FIST: 'DOUBLE_FIST',     // 双拳 → 八卦阵
};

function distance3D(p1, p2) {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow((p1.z || 0) - (p2.z || 0), 2));
}

// ---- 单手（sword-control 原版逻辑原样移植） ----

function isFist(landmarks) {
  const wrist = landmarks[0];
  const fingerTips = [8, 12, 16, 20];
  const fingerBases = [5, 9, 13, 17];
  let curledCount = 0;
  for (let i = 0; i < fingerTips.length; i++) {
    const tipToWrist = distance3D(landmarks[fingerTips[i]], wrist);
    const baseToWrist = distance3D(landmarks[fingerBases[i]], wrist);
    if (tipToWrist < baseToWrist * 1.2) curledCount++;
  }
  // 拇指必须也弯曲（贴食指根/搭中指根/垂下），否则握拳会抢走 THUMB_UP——
  // 原版只要求 4 项卷曲，实测点赞手势永远先进不了 THUMB_UP 分支（不能更差修正）
  const thumbCurled = distance3D(landmarks[4], landmarks[5]) < 0.1
    || distance3D(landmarks[4], landmarks[9]) < 0.14
    || landmarks[4].y > landmarks[2].y;
  if (thumbCurled) curledCount++;
  return curledCount >= 5;
}

function isTwoFingers(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[7].y && landmarks[7].y < landmarks[6].y;
  const middleExtended = landmarks[12].y < landmarks[11].y && landmarks[11].y < landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  return indexExtended && middleExtended && ringCurled && pinkyCurled;
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

function isThumbUp(landmarks) {
  const thumbExtended = landmarks[4].y < landmarks[3].y && landmarks[3].y < landmarks[2].y;
  const indexCurled = landmarks[8].y > landmarks[6].y;
  const middleCurled = landmarks[12].y > landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  return thumbExtended && indexCurled && middleCurled && ringCurled && pinkyCurled;
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

function isPalmDown(landmarks) {
  // 四指伸直用距离比判定（原版 y 轴比较在手指朝下时恒为假，不能更差修正）；
  // 掌向沿原版：腕在指尖上方（图像坐标 y 向下为正）
  let extendedCount = 0;
  const tips = [8, 12, 16, 20], mids = [6, 10, 14, 18];
  for (let i = 0; i < 4; i++) {
    if (distance3D(landmarks[tips[i]], landmarks[0]) > distance3D(landmarks[mids[i]], landmarks[0])) extendedCount++;
  }
  const avgFingerTipY = (landmarks[8].y + landmarks[12].y + landmarks[16].y + landmarks[20].y) / 4;
  const palmFacingDown = landmarks[0].y < avgFingerTipY - 0.05;
  return extendedCount >= 3 && palmFacingDown;
}

// ---- 双手 ----
// 捧起：原版用腕 y>指尖 y 当「掌心向上」，真机捧碗手指横指，该式恒假；
// 且交叉只看两手靠近，会把捧碗判成交叉。交叉改为腕/指尖 x 次序相反；
// 捧起改为两手张开 + 指尖内扣 + 间距适中。

function fingersExtended(h) {
  let n = 0;
  const tips = [8, 12, 16, 20], mids = [6, 10, 14, 18];
  for (let i = 0; i < 4; i++) {
    if (distance3D(h[tips[i]], h[0]) > distance3D(h[mids[i]], h[0]) * 1.08) n++;
  }
  return n >= 3;
}

function isCrossedHands(h1, h2) {
  const yClose = Math.abs(h1[0].y - h2[0].y) < 0.22;
  const wx = h1[0].x - h2[0].x;
  const fx = h1[8].x - h2[8].x;
  return yClose && wx * fx < 0 && Math.abs(wx) > 0.04;
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
      if (tipDist < baseDist * 1.2) curledCount++;
    }
    return curledCount >= 3;
  };
  return checkFist(h1) && checkFist(h2);
}

/**
 * 检测手势（sword-control detectGesture 原版优先级：双手优先，单手按
 * FIST → TWO_FINGERS → THUMB_UP → SHAKA → ROCK → PALM_DOWN → OPEN_PALM）。
 * @param {Array|null} landmarks 单手 21 landmark（归一化坐标）
 * @param {Array|null} allHands 所有手 [[21], [21], ...]
 * @returns {string} G 枚举
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
    else if (isTwoFingers(landmarks)) newGesture = G.TWO_FINGERS;
    else if (isThumbUp(landmarks)) newGesture = G.THUMB_UP;
    else if (isShaka(landmarks)) newGesture = G.SHAKA;
    else if (isRock(landmarks)) newGesture = G.ROCK;
    else if (isPalmDown(landmarks)) newGesture = G.PALM_DOWN;
    else if (isOpenPalm(landmarks)) newGesture = G.OPEN_PALM;
  }
  return newGesture;
}

export const GESTURE = G;
