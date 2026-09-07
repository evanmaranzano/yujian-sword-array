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
  // 翻转 y：腕在上方（y 小），指尖在下方（y 大）
  h[0].y = 0.2;
  for (const i of [8,12,16,20]) h[i].y = 0.7;
  for (const i of [6,10,14,18]) h[i].y = 0.6;
  // 拇指也朝下（y 大），避免被 THUMB_UP 抢先
  h[2].y = 0.55; h[3].y = 0.62; h[4].y = 0.68;
  assert.equal(detectGesture(h, [h]), G.PALM_DOWN);
});

test('DOUBLE_FIST: two fists', () => {
  const h1 = fistHand(), h2 = fistHand();
  h2[0].x = 0.8; // 右手偏移
  assert.equal(detectGesture(h1, [h1, h2]), G.DOUBLE_FIST);
});

test('CROSSED_HANDS: wrists close in y, centers close in x', () => {
  const h1 = hand(), h2 = hand();
  h1[0].x = 0.45; h2[0].x = 0.55;
  h1[9].x = 0.47; h2[9].x = 0.53;
  assert.equal(detectGesture(h1, [h1, h2]), G.CROSSED_HANDS);
});

test('HANDS_PUSH: both open, far apart', () => {
  const h1 = hand(), h2 = hand();
  h1[9].x = 0.2; h2[9].x = 0.8;
  assert.equal(detectGesture(h1, [h1, h2]), G.HANDS_PUSH);
});

test('HANDS_CUP: both palms up, moderate distance', () => {
  const h1 = hand(), h2 = hand();
  // 掌心向上：腕 y > 中指根 y（y 轴向下为正，这里反过来）
  h1[0].y = 0.6; h1[12].y = 0.4;
  h2[0].y = 0.6; h2[12].y = 0.4;
  // x 中心差 > 0.15，避免被 CROSSED 抢先
  h1[0].x = 0.30; h1[9].x = 0.32;
  h2[0].x = 0.70; h2[9].x = 0.68;
  h1[9].y = 0.5; h2[9].y = 0.5;
  assert.equal(detectGesture(h1, [h1, h2]), G.HANDS_CUP);
});
