"""挥舞检测：窗口速度 + 起停迟滞状态机。

一次完整挥手（提速→移动→减速）= 一个方向事件，方向取起点→终点，
避免旧方案"每个快帧都触发一次"的抖动问题。
"""

import math
from collections import deque

from . import config


class SwipeDetector:
    ARM_POINTS = 4     # reset 后需先积满的点数，防恢复期两三帧抖动造假齐发（docs/04 N-LOCK-2，与 Web 对位）

    def __init__(self):
        self._hist = deque()          # (t, x, y)
        self._swiping = False
        self._start = None            # (t, x, y)
        self._peak = 0.0
        self._need_arm = True

    def update(self, now, present, x, y):
        """喂入屏幕归一化坐标 (0..1)。返回 (dirx, diry, peak_speed) 或 None。"""
        if not present:
            self._hist.clear()
            self._need_arm = True
            if self._swiping:
                evt = self._end(x, y)
                self._swiping = False
                return evt
            self._start = None
            return None

        self._hist.append((now, x, y))
        cutoff = now - config.VELOCITY_WINDOW
        while self._hist and self._hist[0][0] < cutoff:
            self._hist.popleft()
        if self._need_arm:
            if len(self._hist) >= self.ARM_POINTS:
                self._need_arm = False
            else:
                return None
        if len(self._hist) < 2:
            return None

        t0, x0, y0 = self._hist[0]
        dt = max(now - t0, 1e-3)
        speed = math.hypot((x - x0) / dt, (y - y0) / dt)

        if not self._swiping:
            if speed > config.SWIPE_HI:
                self._swiping = True
                self._start = (now, x, y)
                self._peak = speed
        else:
            self._peak = max(self._peak, speed)
            if speed < config.SWIPE_LO or now - self._start[0] > config.SWIPE_MAX_DUR:
                self._swiping = False
                return self._end(x, y)
        return None

    def _end(self, x, y):
        _, sx, sy = self._start
        self._start = None
        dx, dy = x - sx, y - sy
        dist = math.hypot(dx, dy)
        if dist < config.SWIPE_MIN_DIST:
            return None
        return (dx / dist, dy / dist, self._peak)
