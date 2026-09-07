// 手势分类器：11 种静态手势的几何规则检测（移植自 sword-control, MIT）。
// 输入：MediaPipe HandLandmarker 输出的 21 个 landmark（归一化坐标，y 向下为正）。
// 输出：手势枚举字符串。纯函数，无副作用，node 可测。

const G = {
  IDLE: 'IDLE',
  FIST: 'FIST',               // 握拳 → 剑球
  TWO_FINGERS: 'TWO_FINGERS', // 剑指 → 大剑
  OPEN_PALM: 'OPEN_PALM',     // 出掌 → 万剑齐发
  THUMB_UP: 'THUMB_UP',       // 点赞 → 剑柱
  SHAKA: 'SHAKA',             // 六字诀 → 六芒星
  ROCK: 'ROCK',               // Rock → 双龙
  PALM_DOWN: 'PALM_DOWN',     // 下压 → 剑雨
  // 双手
  CROSSED_HANDS: 'CROSSED_HANDS', // 交叉 → 8字环
  HANDS_PUSH: 'HANDS_PUSH',       // 推开 → 爆裂
  HANDS_CUP: 'HANDS_CUP',         // 捧起 → 聚能球
  DOUBLE_FIST: 'DOUBLE_FIST',     // 双拳 → 太极
};

function d3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 指尖到腕距离 < 指根到腕距离 × 1.2 → 该指弯曲
function curled(h, tip, base) {
  return d3(h[tip], h[0]) < d3(h[base], h[0]) * 1.2;
}

function isFist(h) {
  let n = 0;
  const tips = [8, 12, 16, 20], bases = [5, 9, 13, 17];
  for (let i = 0; i < 4; i++) if (curled(h, tips[i], bases[i])) n++;
  // 拇指也必须弯曲（贴食指根或握入掌心），否则是 THUMB_UP
  if (d3(h[4], h[5]) < 0.1 || h[4].y > h[2].y) n++;
  return n >= 5; // 四指 + 拇指全部弯曲
}

function isTwoFingers(h) {
  const idx = h[8].y < h[7].y && h[7].y < h[6].y;
  const mid = h[12].y < h[11].y && h[11].y < h[10].y;
  const ring = h[16].y > h[14].y;
  const pinky = h[20].y > h[18].y;
  return idx && mid && ring && pinky;
}

function isOpenPalm(h) {
  let n = 0;
  const f = [[8,7,6],[12,11,10],[16,15,14],[20,19,18]];
  for (const [t,m,b] of f) if (h[t].y < h[m].y && h[m].y < h[b].y) n++;
  return n >= 3 && d3(h[4], h[5]) > 0.1;
}

function isThumbUp(h) {
  // 拇指伸直且朝上（图像坐标 y 向下为正，朝上 = y 递减）
  const thumb = h[4].y < h[3].y && h[3].y < h[2].y;
  // 其他四指弯曲：指尖在指根下方（y 更大）
  const others = h[8].y > h[5].y && h[12].y > h[9].y && h[16].y > h[13].y && h[20].y > h[17].y;
  // 拇指尖必须明显远离食指根（向上伸出）
  const thumbOut = d3(h[4], h[5]) > 0.08;
  return thumb && others && thumbOut;
}

function isShaka(h) {
  const thumbOut = d3(h[4], h[9]) > 0.12;
  const pinky = h[20].y < h[19].y && h[19].y < h[18].y;
  const mid3 = h[8].y > h[6].y && h[12].y > h[10].y && h[16].y > h[14].y;
  return thumbOut && pinky && mid3;
}

function isRock(h) {
  const idx = h[8].y < h[7].y && h[7].y < h[6].y;
  const pinky = h[20].y < h[19].y && h[19].y < h[18].y;
  const mid = h[12].y > h[10].y;
  const ring = h[16].y > h[14].y;
  return idx && pinky && mid && ring;
}

function isPalmDown(h) {
  // 四指伸直：指尖到腕距离 > 中关节到腕距离（与朝向无关）
  let n = 0;
  const tips = [8,12,16,20], mids = [6,10,14,18];
  for (let i = 0; i < 4; i++) if (d3(h[tips[i]], h[0]) > d3(h[mids[i]], h[0])) n++;
  // 掌心向下：腕在指尖上方（图像坐标 y 向下为正，腕 y < 指尖平均 y）
  const avgY = (h[8].y + h[12].y + h[16].y + h[20].y) / 4;
  return n >= 3 && h[0].y < avgY - 0.05;
}

// 双手：h1/h2 各 21 landmark
function isCrossed(h1, h2) {
  const yClose = Math.abs(h1[0].y - h2[0].y) < 0.18;
  const x1 = (h1[0].x + h1[9].x) / 2, x2 = (h2[0].x + h2[9].x) / 2;
  // 交叉 = 双手 x 中心几乎重叠（<0.15），区别于 CUP 的平行分开（0.1~0.5）
  return yClose && Math.abs(x1 - x2) < 0.15;
}

function isPush(h1, h2) {
  const open = (h) => {
    let n = 0;
    const tips = [8,12,16,20], mids = [6,10,14,18];
    for (let i = 0; i < 4; i++) if (h[tips[i]].y < h[mids[i]].y) n++;
    return n >= 3;
  };
  return open(h1) && open(h2) && Math.abs(h1[9].x - h2[9].x) > 0.45;
}

function isCup(h1, h2) {
  const up1 = h1[0].y > h1[12].y, up2 = h2[0].y > h2[12].y;
  const yClose = Math.abs(h1[9].y - h2[9].y) < 0.18;
  const d = Math.abs(h1[9].x - h2[9].x);
  return up1 && up2 && yClose && d > 0.1 && d < 0.5;
}

function isDoubleFist(h1, h2) {
  const fist = (h) => {
    let n = 0;
    const tips = [8,12,16,20], bases = [5,9,13,17];
    for (let i = 0; i < 4; i++) if (curled(h, tips[i], bases[i])) n++;
    return n >= 3;
  };
  return fist(h1) && fist(h2);
}

/**
 * 检测手势。
 * @param {Array|null} landmarks 单手 21 landmark（归一化坐标）
 * @param {Array|null} allHands 所有手 [[21], [21], ...]
 * @returns {string} G 枚举
 */
export function detectGesture(landmarks, allHands) {
  if (allHands && allHands.length >= 2) {
    const [h1, h2] = allHands;
    if (isDoubleFist(h1, h2)) return G.DOUBLE_FIST;
    if (isCrossed(h1, h2)) return G.CROSSED_HANDS;
    if (isCup(h1, h2)) return G.HANDS_CUP;
    if (isPush(h1, h2)) return G.HANDS_PUSH;
  }
  if (!landmarks) return G.IDLE;
  // PALM_DOWN 先查：掌心方向明确（腕在指尖上方），避免与 THUMB_UP 混淆
  if (isPalmDown(landmarks)) return G.PALM_DOWN;
  if (isFist(landmarks)) return G.FIST;
  if (isTwoFingers(landmarks)) return G.TWO_FINGERS;
  if (isThumbUp(landmarks)) return G.THUMB_UP;
  if (isShaka(landmarks)) return G.SHAKA;
  if (isRock(landmarks)) return G.ROCK;
  if (isOpenPalm(landmarks)) return G.OPEN_PALM;
  return G.IDLE;
}

export const GESTURE = G;
