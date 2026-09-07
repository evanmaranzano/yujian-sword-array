// Web 侧会话锁常驻测试（node --test，无 DOM 依赖；与 Python tests/lock_check.py 对位）
// 运行：node --test web/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { HandLock } from '../js/lock.js';
import { CFG } from '../js/config.js';

const DT = 1 / 30;
const feed = (lock, n, fn) => {
  let t = 0, out = null;
  for (let i = 0; i < n; i++) { t = i * DT; out = lock.update(t, ...fn(i, t)); }
  return out;
};

test('初始为 idle/present=false', () => {
  const l = new HandLock();
  const o = l.update(0, false, 0, 0, null);
  assert.equal(o.present, false);
  assert.equal(o.phase, 'idle');
});

test('区外伸手不锁定（围观不唤剑）', () => {
  const l = new HandLock();
  let o;
  for (let i = 0; i < 30; i++) o = l.update(i * DT, true, 0.02, 0.5, 0.08);
  assert.equal(o.present, false);
  assert.equal(o.phase, 'idle');
});

test('区内驻留 lockDwell 后锁定并给 acquired/reset', () => {
  const l = new HandLock();
  let acquired = false;
  for (let i = 0; i < 30; i++) {
    const o = l.update(i * DT, true, 0.5, 0.5, 0.08);
    if (o.acquired) acquired = true;
  }
  assert.equal(acquired, true);
  const o = l.update(1, true, 0.5, 0.5, 0.08);
  assert.equal(o.present, true);
  assert.equal(o.phase, 'locked');
  assert.equal(o.session, 1);
});

test('驻留不足 lockDwell（0.2s）不锁定', () => {
  const l = new HandLock();
  for (let i = 0; i < 5; i++) l.update(i * DT, true, 0.5, 0.5, 0.08);
  const o = l.update(5 * DT, false, 0, 0, null);
  assert.notEqual(o.phase, 'locked');
});

test('锁定后大跳变帧被拒绝（换人/围观夺控）', () => {
  const l = new HandLock();
  for (let i = 0; i < 30; i++) l.update(i * DT, true, 0.5, 0.5, 0.08);
  const o = l.update(1.0, true, 0.5 + CFG.lockMaxJump + 0.05, 0.5, 0.08);
  assert.equal(o.accepted, false);
  assert.equal(o.present, true);   // 宽限内仍 present，但坐标不动
  assert.equal(o.session, 1);
});

test('掌尺度超 lockMaxPalm（糊镜头）拒绝', () => {
  const l = new HandLock();
  for (let i = 0; i < 30; i++) l.update(i * DT, true, 0.5, 0.5, 0.08);
  const o = l.update(1.0, true, 0.51, 0.5, CFG.lockMaxPalm + 0.1);
  assert.equal(o.accepted, false);
});

test('连续 handLostTimeout 无接受帧后释放，新人重新驻留得新 session', () => {
  const l = new HandLock();
  for (let i = 0; i < 30; i++) l.update(i * DT, true, 0.5, 0.5, 0.08);
  assert.equal(l.update(1.0, true, 0.5, 0.5, 0.08).session, 1);
  // 丢失超过 0.5s
  for (let i = 0; i < 20; i++) l.update(1.0 + i * DT, false, 0, 0, null);
  const released = l.update(1.7, false, 0, 0, null);
  assert.equal(released.present, false);
  assert.equal(released.phase, 'idle');
  // 新人驻留
  for (let i = 0; i < 30; i++) {
    const o = l.update(2.0 + i * DT, true, 0.55, 0.55, 0.08);
    if (o.acquired) { assert.equal(o.session, 2); return; }
  }
  assert.fail('新人未获锁');
});

test('phase/cand 字段在 candidate 时递增到 [0,1]', () => {
  const l = new HandLock();
  let cand = 0;
  for (let i = 0; i < 8; i++) {
    const o = l.update(i * DT, true, 0.5, 0.5, 0.08);
    if (o.phase === 'candidate') cand = Math.max(cand, o.cand);
  }
  assert.ok(cand > 0 && cand <= 1);
});
