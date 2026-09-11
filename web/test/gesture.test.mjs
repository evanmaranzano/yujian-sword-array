// gesture.test.mjs: 手势分类器几何规则断言（合成 landmark，不依赖 MediaPipe）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGesture, GESTURE as G } from '../js/gesture.js';

// 构造 21 landmark：默认全伸展开掌，然后按需求改
function hand(overrides = {}) {
  const h = [];
  // 手腕
  h[0] = { x: 0.5, y: 0.8, z: 0 };
  // 拇指 1-4（默认微张）
  h[1] = { x: 0.42, y: 0.72, z: 0 }; h[2] = { x: 0.38, y: 0.65, z: 0 };
  h[3] = { x: 0.35, y: 0.58, z: 0 }; h[4] = { x: 0.32, y: 0.52, z: 0 };
  // 食指 5-8（伸直向上）
  h[5] = { x: 0.46, y: 0.55, z: 0 }; h[6] = { x: 0.46, y: 0.42, z: 0 };
  h[7] = { x: 0.46, y: 0.32, z: 0 }; h[8] = { x: 0.46, y: 0.22, z: 0 };
  // 中指 9-12
  h[9]  = { x: 0.52, y: 0.53, z: 0 }; h[10] = { x: 0.52, y: 0.40, z: 0 };
  h[11] = { x: 0.52, y: 0.30, z: 0 }; h[12] = { x: 0.52, y: 0.20, z: 0 };
  // 无名指 13-16
  h[13] = { x: 0.58, y: 0.55, z: 0 }; h[14] = { x: 0.58, y: 0.42, z: 0 };
  h[15] = { x: 0.58, y: 0.32, z: 0 }; h[16] = { x: 0.58, y: 0.22, z: 0 };
  // 小指 17-20
  h[17] = { x: 0.64, y: 0.58, z: 0 }; h[18] = { x: 0.64, y: 0.48, z: 0 };
  h[19] = { x: 0.64, y: 0.40, z: 0 }; h[20] = { x: 0.64, y: 0.32, z: 0 };
  // 覆盖
  for (const [k, v] of Object.entries(overrides)) h[k] = { ...h[k], ...v };
  return h;
}

// 握拳：四指弯曲（指尖靠近手腕）+ 拇指贴食指根
function fistHand() {
  return hand({
    4:  { x: 0.44, y: 0.60, z: 0 }, // 拇指尖贴食指根
    8:  { x: 0.47, y: 0.68, z: 0 }, // 食指尖弯到腕附近
    12: { x: 0.52, y: 0.68, z: 0 },
    16: { x: 0.57, y: 0.68, z: 0 },
    20: { x: 0.62, y: 0.68, z: 0 },
  });
}

// 剑指：食指+中指伸直，无名指+小指弯曲
function twoFingersHand() {
  return hand({
    16: { x: 0.58, y: 0.50, z: 0 }, // 无名指弯（y > 中关节）
    14: { x: 0.58, y: 0.44, z: 0 },
    20: { x: 0.64, y: 0.52, z: 0 }, // 小指弯
    18: { x: 0.64, y: 0.50, z: 0 },
  });
}

test('IDLE: no landmarks', () => {
  assert.equal(detectGesture(null, null), G.IDLE);
});

test('OPEN_PALM: default hand is open palm', () => {
  assert.equal(detectGesture(hand(), [hand()]), G.OPEN_PALM);
});

test('FIST: curled fingers', () => {
  assert.equal(detectGesture(fistHand(), [fistHand()]), G.FIST);
});

test('TWO_FINGERS: index+middle extended, ring+pinky curled', () => {
  assert.equal(detectGesture(twoFingersHand(), [twoFingersHand()]), G.TWO_FINGERS);
});
test('TWO_FINGERS: horizontal/tilted sword finger must never be hijacked by THUMB_UP', () => {
  // 水平微倾斜剑指：食指尖与中指尖 y 大于关节点（绝对 y 比较曾导致抢跑点赞）
  const h = twoFingersHand();
  h[8] = { x: 0.70, y: 0.44, z: 0 }; h[7] = { x: 0.62, y: 0.43, z: 0 };
  h[6] = { x: 0.54, y: 0.42, z: 0 }; h[5] = { x: 0.46, y: 0.42, z: 0 };
  h[12] = { x: 0.70, y: 0.49, z: 0 }; h[11] = { x: 0.62, y: 0.48, z: 0 };
  h[10] = { x: 0.54, y: 0.47, z: 0 }; h[9] = { x: 0.46, y: 0.47, z: 0 };
  // 拇指微翘
  h[4] = { x: 0.38, y: 0.45, z: 0 }; h[3] = { x: 0.39, y: 0.52, z: 0 };
  assert.equal(detectGesture(h, [h]), G.TWO_FINGERS);
});

test('TWO_FINGERS: relaxed ring finger tolerance (natural sword finger)', () => {
  // 无名指微弯但未极致收拢（实测自然剑指常见形态）
  const h = twoFingersHand();
  h[16] = { x: 0.56, y: 0.46, z: 0 }; // 靠近中指关节点
  assert.equal(detectGesture(h, [h]), G.TWO_FINGERS);
});

test('THUMB_UP: thumb extended up, others curled', () => {
  const h = hand({
    8:  { x: 0.47, y: 0.68, z: 0 }, 12: { x: 0.52, y: 0.68, z: 0 },
    16: { x: 0.57, y: 0.68, z: 0 }, 20: { x: 0.62, y: 0.68, z: 0 },
    4:  { x: 0.35, y: 0.40, z: 0 }, 3: { x: 0.36, y: 0.50, z: 0 }, 2: { x: 0.38, y: 0.60, z: 0 },
  });
  assert.equal(detectGesture(h, [h]), G.THUMB_UP);
});

test('SHAKA: thumb+pinky extended, middle three curled', () => {
  const h = hand({
    8:  { x: 0.47, y: 0.68, z: 0 }, 12: { x: 0.52, y: 0.68, z: 0 }, 16: { x: 0.57, y: 0.68, z: 0 },
    4:  { x: 0.28, y: 0.55, z: 0 }, // 拇指外展
  });
  assert.equal(detectGesture(h, [h]), G.SHAKA);
});

test('ROCK: index+pinky extended, middle+ring curled', () => {
  const h = hand({
    12: { x: 0.52, y: 0.50, z: 0 }, 10: { x: 0.52, y: 0.44, z: 0 }, // 中指弯
    16: { x: 0.58, y: 0.50, z: 0 }, 14: { x: 0.58, y: 0.44, z: 0 }, // 无名指弯
  });
  assert.equal(detectGesture(h, [h]), G.ROCK);
});

test('PALM_DOWN: fingers extended, wrist above fingertips', () => {
  const h = hand();
  // 手指朝下：每指 MCP→PIP→DIP→TIP 沿 y 单调递增（解剖正确的手指链）
  h[0].y = 0.2;
  for (const [m, pp, dd, tt] of [[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]) {
    h[m].y = 0.5; h[pp].y = 0.6; h[dd].y = 0.65; h[tt].y = 0.72;
  }
  // 拇指也朝下（y 大），避免被 THUMB_UP 抢先
  h[2].y = 0.55; h[3].y = 0.62; h[4].y = 0.68;
  assert.equal(detectGesture(h, [h]), G.PALM_DOWN);
});

test('DOUBLE_FIST: two fists', () => {
  const h1 = fistHand(), h2 = fistHand();
  h2[0].x = 0.8; // 右手偏移
  assert.equal(detectGesture(h1, [h1, h2]), G.DOUBLE_FIST);
});

test('CROSSED_HANDS: wrists and fingertips reverse x-order', () => {
  const h1 = hand(), h2 = hand();
  h1[0].x = 0.62; h1[8].x = 0.38; h1[9].x = 0.55; h1[0].y = 0.55;
  h2[0].x = 0.38; h2[8].x = 0.62; h2[9].x = 0.45; h2[0].y = 0.55;
  assert.equal(detectGesture(h1, [h1, h2]), G.CROSSED_HANDS);
});

test('HANDS_PUSH: both open, far apart', () => {
  const h1 = hand(), h2 = hand();
  h1[9].x = 0.2; h2[9].x = 0.8;
  assert.equal(detectGesture(h1, [h1, h2]), G.HANDS_PUSH);
});

test('HANDS_CUP: both palms up, moderate distance', () => {
  const h1 = hand(), h2 = hand();
  h1[0].y = 0.6; h1[12].y = 0.4;
  h2[0].y = 0.6; h2[12].y = 0.4;
  h1[0].x = 0.30; h1[9].x = 0.32; h1[12].x = 0.40;
  h2[0].x = 0.70; h2[9].x = 0.68; h2[12].x = 0.60;
  h1[9].y = 0.5; h2[9].y = 0.5;
  assert.equal(detectGesture(h1, [h1, h2]), G.HANDS_CUP);
});

test('HANDS_CUP: horizontal bowl, fingers toward each other', () => {
  const h1 = hand(), h2 = hand();
  h1[0].x = 0.28; h1[0].y = 0.55; h1[9].x = 0.34; h1[9].y = 0.52;
  h1[12].x = 0.44; h1[12].y = 0.52;
  h2[0].x = 0.72; h2[0].y = 0.55; h2[9].x = 0.66; h2[9].y = 0.52;
  h2[12].x = 0.56; h2[12].y = 0.52;
  assert.equal(detectGesture(h1, [h1, h2]), G.HANDS_CUP);
});

// ---- 隐藏手势：三指（THREE_FINGERS）→ Molispark 字阵（左下角指南不展示） ----

function threeFingersHand() {
  // 默认开掌上，只把小指弯回去
  return hand({
    20: { x: 0.64, y: 0.52, z: 0 },
    18: { x: 0.64, y: 0.50, z: 0 },
  });
}

test('THREE_FINGERS: 食中无名伸直、小指弯曲', () => {
  const h = threeFingersHand();
  assert.equal(detectGesture(h, [h]), G.THREE_FINGERS);
});

test('THREE_FINGERS: 剑指（无名也弯）仍是 TWO_FINGERS', () => {
  assert.equal(detectGesture(twoFingersHand(), [twoFingersHand()]), G.TWO_FINGERS);
});

test('THREE_FINGERS: 开掌（小指也伸）仍是 OPEN_PALM', () => {
  assert.equal(detectGesture(hand(), [hand()]), G.OPEN_PALM);
});

// ---- 09-11 回归：「一直都是剑雨倾盆」——PALM_DOWN 旧判据偷走一切前伸/放松手 ----

// 前伸开掌：四指朝镜头水平前伸（-z），掌面竖直。旧判据 avgTipY > 5.y-0.02 必中。
function forwardPalmHand() {
  const h = hand();
  for (const m of [5, 9, 13, 17]) {
    h[m]     = { x: h[m].x, y: 0.55, z: 0 };
    h[m + 1] = { x: h[m].x, y: 0.55, z: -0.06 };
    h[m + 2] = { x: h[m].x, y: 0.55, z: -0.11 };
    h[m + 3] = { x: h[m].x, y: 0.55, z: -0.15 };
  }
  h[2] = { x: 0.38, y: 0.62, z: -0.03 }; h[3] = { x: 0.35, y: 0.60, z: -0.06 };
  h[4] = { x: 0.32, y: 0.58, z: -0.09 };
  return h;
}

test('regression: forward open palm is OPEN_PALM, never PALM_DOWN', () => {
  const h = forwardPalmHand();
  assert.equal(detectGesture(h, [h]), G.OPEN_PALM);
});

test('regression: relaxed half-drooped hand is not PALM_DOWN', () => {
  // 放松半垂手：手指半伸向前下方、拇指自然内收（展厅待机最常见手型）。旧判据会判剑雨。
  const h = hand();
  for (const m of [5, 9, 13, 17]) {
    h[m]     = { x: h[m].x, y: 0.55, z: 0 };
    h[m + 1] = { x: h[m].x, y: 0.48, z: -0.05 };
    h[m + 2] = { x: h[m].x, y: 0.50, z: -0.12 };
    h[m + 3] = { x: h[m].x, y: 0.54, z: -0.20 };
  }
  h[4] = { x: 0.42, y: 0.62, z: -0.04 }; h[3] = { x: 0.40, y: 0.60, z: -0.02 };
  assert.equal(detectGesture(h, [h]), G.IDLE);
});

test('regression: forward sword finger is TWO_FINGERS, never PALM_DOWN', () => {
  // 剑指前指屏幕：食中沿 -z 伸直，无名/小指收拢回掌心
  const h = forwardPalmHand();
  h[14] = { x: 0.58, y: 0.58, z: -0.05 }; h[15] = { x: 0.58, y: 0.62, z: -0.06 };
  h[16] = { x: 0.58, y: 0.66, z: -0.05 };
  h[18] = { x: 0.64, y: 0.60, z: -0.04 }; h[19] = { x: 0.64, y: 0.64, z: -0.05 };
  h[20] = { x: 0.64, y: 0.68, z: -0.04 };
  assert.equal(detectGesture(h, [h]), G.TWO_FINGERS);
});

test('PALM_DOWN: flat palm pressing down (horizontal hand) still triggers', () => {
  // 真下压：掌面放平（掌心朝地），四指向前平伸——掌法向 y 主导
  const h = forwardPalmHand();
  for (const m of [5, 9, 13, 17]) {
    h[m].z = 0; h[m].y = 0.55;
    h[m + 1] = { x: h[m].x, y: 0.56, z: -0.07 };
    h[m + 2] = { x: h[m].x, y: 0.57, z: -0.13 };
    h[m + 3] = { x: h[m].x, y: 0.58, z: -0.18 };
  }
  // 掌面绕 x 放平：腕与四指根几乎同 y，法向 ≈ ±y
  h[0] = { x: 0.5, y: 0.56, z: 0.06 };
  assert.equal(detectGesture(h, [h]), G.PALM_DOWN);
});
