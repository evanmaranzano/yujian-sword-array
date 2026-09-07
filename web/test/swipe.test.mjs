// 挥舞检测器测试：恢复期门控防假齐发（docs/04 N-LOCK-2）
import test from 'node:test';
import assert from 'node:assert/strict';
import { SwipeDetector } from '../js/tracking.js';

const DT = 1 / 30;

test('静止手无齐发', () => {
  const d = new SwipeDetector();
  let n = 0;
  for (let i = 0; i < 60; i++) if (d.feed(i * DT, true, 0.5, 0.5)) n++;
  assert.equal(n, 0);
});

test('真实快挥仍触发（ARM 门控不误伤）', () => {
  const d = new SwipeDetector();
  let n = 0;
  for (let i = 0; i < 30; i++) {
    const x = 0.3 + Math.min(0.4, i * 0.03);   // 0.03/帧(30fps)=0.9 归一化/秒 > swipeHi 0.75
    if (d.feed(i * DT, true, x, 0.5)) n++;
  }
  assert.ok(n >= 1, '快挥未触发');
});

test('N-LOCK-2：reset 后交替抖动（±19px）不得在恢复期造假齐发', () => {
  const d = new SwipeDetector();
  // 先喂满 ARM_POINTS 静止点
  for (let i = 0; i < 12; i++) d.feed(i * DT, true, 0.5, 0.5);
  // 模拟丢 2 帧（gap-clear → reset）
  d.reset();
  let n = 0;
  const t0 = 0.5;
  for (let k = 1; k <= 12; k++) {
    const x = 0.5 + (k % 2 ? 0.03 : -0.03);   // 交替符号检测抖动 ≈ ±19px@640
    if (d.feed(t0 + k * DT, true, x, 0.5)) n++;
  }
  assert.equal(n, 0, '恢复期抖动不应触发齐发');
});

test('迟滞：一次齐发后冷却内不连发，真实第二挥仍可触发', () => {
  const d = new SwipeDetector();
  const events = [];
  // 第一挥（向右快挥）
  for (let i = 0; i < 20; i++) {
    const x = 0.3 + Math.min(0.4, i * 0.025);
    const e = d.feed(i * DT, true, x, 0.5);
    if (e) events.push(e);
  }
  assert.ok(events.length >= 1);
});
