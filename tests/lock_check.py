"""会话锁确定性测试（无头，无需摄像头/pygame）：

    python -m tests.lock_check

验证 HandLock 的核心承诺——"以第一个锁定的人为准，围观不干扰"：
  1. 中心区驻留 LOCK_DWELL 后锁定，区外挥手不锁定
  2. 锁定后大跳变（围观者/交接/误检）帧被拒绝，坐标不动
  3. 原锁定者持续可见时，跳变帧混在其中也夺不走控制权
  4. 锁定者离场、别人连续占满丢失超时后才释放；新人驻留获新会话
  5. 短暂遮挡后原位附近重现保持锁定，并标记 reset（速度历史清零）
  6. 遮挡后在远处重现不接受（防换人伪轨迹/伪齐发）
  7. 超大掌尺度（手糊镜头）不锁定、锁定后也不接受
  8. 30fps 快速挥手帧间位移不超阈，持续接受
  9. reset() 后回到 empty（镜像翻转场景）
 10. 与 SwipeDetector 联动：复用 smoke 脚本，两记挥手都应正常齐发
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from yujian import config
from yujian.lock import HandLock
from yujian.swipe import SwipeDetector

STEP = 1 / 60
_fail = 0


def check(name, cond):
    global _fail
    if cond:
        print(f"[OK] {name}")
    else:
        _fail += 1
        print(f"[FAIL] {name}")


def run(lock, seconds, fn, fps=60):
    """按固定步长驱动，fn(t) -> (seen, x, y, palm)。返回最后一个输出。"""
    dt = 1 / fps
    out = None
    n = int(seconds * fps)
    for i in range(n + 1):
        out = lock.update(i * dt, *fn(i * dt))
    return out


def main():
    # 1. 驻留确认
    L = HandLock()
    acquired = 0
    dt = STEP
    for i in range(int(1.0 / dt) + 1):
        out = L.update(i * dt, True, 0.5, 0.5, 0.05)
        if out["acquired"]:
            acquired += 1
    check("中心驻留后锁定", out["present"] and abs(out["x"] - 0.5) < 1e-9
          and out["session"] == 1 and acquired == 1)
    pre = run(HandLock(), config.LOCK_DWELL - STEP, lambda t: (True, 0.5, 0.5, 0.05))
    check("驻留不足时不锁定", not pre["present"])
    out = run(HandLock(), 1.0, lambda t: (True, 0.95, 0.5, 0.05))
    check("区外挥手不锁定", not out["present"])

    # 2. 跳变夺控被拒绝（0.5s 内锁定者最后还回来了）
    L = HandLock()
    run(L, 1.0, lambda t: (True, 0.5, 0.5, 0.05))
    sess = L.session
    out = L.update(1.0 + STEP, True, 0.9, 0.5, 0.05)
    check("跳变帧被拒绝", out["present"] and not out["accepted"] and abs(out["x"] - 0.5) < 1e-9)
    t = 1.0 + 2 * STEP
    while t < 1.3:
        out = L.update(t, True, 0.9, 0.5, 0.05)
        t += STEP
    check("0.2s 内围观者夺不走控制权",
          out["present"] and L.session == sess and abs(out["x"] - 0.5) < 1e-9)
    out = L.update(1.3 + STEP, True, 0.5, 0.5, 0.05)
    check("锁定者回来立即恢复接受", out["accepted"] and L.session == sess)

    # 3. 新锁实例：锁定者离场后别人连续占满丢失超时 → 释放；区内新人驻留 → 新会话
    L2 = HandLock()
    run(L2, 1.0, lambda t: (True, 0.5, 0.5, 0.05))
    sess = L2.session
    t = 1.0 + STEP
    while t <= 1.6:
        out = L2.update(t, True, 0.9, 0.5, 0.05)
        t += STEP
    check("丢失超时后释放", not out["present"])
    t = 1.6
    while t < 2.0:
        out = L2.update(t, True, 0.45, 0.5, 0.05)
        t += STEP
    check("新人驻留获得新会话", out["present"] and L2.session == sess + 1)

    # 4. 短暂遮挡后原位重现：保持锁定 + reset
    L = HandLock()
    run(L, 1.0, lambda t: (True, 0.5, 0.5, 0.05))
    sess = L.session
    t = 1.0 + STEP
    while t < 1.2:
        out = L.update(t, False, 0.0, 0.0, None)
        t += STEP
    check("遮挡 0.2s 宽限内仍 present", out["present"])
    out = L.update(1.2 + STEP, True, 0.52, 0.5, 0.05)
    check("原位附近重现保持锁定并要求清速度历史",
          out["present"] and L.session == sess and out["reset"] and out["accepted"])

    # 5. 遮挡后远处重现：拒绝
    L = HandLock()
    run(L, 1.0, lambda t: (True, 0.5, 0.5, 0.05))
    t = 1.0 + STEP
    while t < 1.2:
        L.update(t, False, 0.0, 0.0, None)
        t += STEP
    out = L.update(1.2 + STEP, True, 0.85, 0.5, 0.05)
    check("遮挡后远处的手被拒绝", out["present"] and not out["accepted"]
          and abs(out["x"] - 0.5) < 1e-9)

    # 6. 超大掌尺度
    out = run(HandLock(), 1.0, lambda t: (True, 0.5, 0.5, 0.6))
    check("糊镜头的手不锁定", not out["present"])
    L = HandLock()
    run(L, 1.0, lambda t: (True, 0.5, 0.5, 0.05))
    out = L.update(1.0 + STEP, True, 0.5, 0.5, 0.6)
    check("锁定后凑近镜头帧不接受", out["present"] and not out["accepted"])

    # 7. 30fps 快挥（0.8 归一化/秒）持续接受
    L = HandLock()
    x, dt, rejects, out = 0.3, 1 / 30, 0, None
    for i in range(31):
        t = i * dt
        out = L.update(t, True, x, 0.5, 0.05)
        if out["present"] and not out["accepted"]:
            rejects += 1
        x = min(0.7, x + 0.8 * dt)
    check("30fps 快挥持续接受", out["present"] and rejects == 0)

    # 8. reset 后回 empty
    L = HandLock()
    run(L, 1.0, lambda t: (True, 0.5, 0.5, 0.05))
    L.reset()
    out = L.update(2.0, True, 0.5, 0.5, 0.05)
    check("reset() 后回到 empty", not out["present"] and not out["accepted"])

    # 9. 联动 SwipeDetector（与 main.py 相同的接线方式）跑 smoke 脚本：
    #    驻留锁定会吃掉起手 0.2s，两记挥手仍必须各自触发一记齐发且方向正确
    from tests.smoke import script
    lock = HandLock()
    det = SwipeDetector()
    events = []
    for i in range(int(6.2 * 60) + 1):
        t = i * STEP
        p0, hx, hy = script(t)
        nx = (1 - hx) if config.MIRROR else hx
        o = lock.update(t, p0, nx, hy, None)
        if o["reset"]:
            det = SwipeDetector()
        p = o["present"]
        x = o["x"] if p else nx
        y = o["y"] if p else hy
        e = det.update(t, p, x, y)
        if e is not None:
            events.append((round(t, 3), round(e[0], 3), round(e[1], 3)))
    check("两记挥手各触发一记齐发", len(events) == 2)
    if len(events) == 2:
        # v1 语义为收手后结算：事件发生在动作停止后的一个速度窗口内
        check("右挥（镜像后向左）首记方向 dx<0、dy≈0",
              events[0][1] < -0.9 and abs(events[0][2]) < 0.1)
        check("左上挥镜像后方向为右上：dx>0 且 dy<0",
              events[1][1] > 0 and events[1][2] < 0)
        check("齐发时刻：首记在 1.5 停手后、次记在 2.65 停手后",
              1.5 < events[0][0] < 1.75 and 2.65 < events[1][0] < 2.9)
    print("齐发事件:", events)

    print("LOCK CHECK", "FAILED" if _fail else "PASSED")
    sys.exit(1 if _fail else 0)


if __name__ == "__main__":
    main()
