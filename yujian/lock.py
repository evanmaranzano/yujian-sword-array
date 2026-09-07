"""手部会话锁：实现"以第一个锁定的人为准，围观不干扰"。

状态机：empty（无人）→ candidate（中心区见手，驻留确认中）→ locked（已锁定）

- empty：仅当手出现在中心交互区 ROI 内才进入 candidate；区外的手（路过、
  围观伸手）不唤剑、不停止待机。
- candidate：必须在区内连续驻留 LOCK_DWELL 秒且帧间位移连续才升级 locked；
  中途出区、跳变或中断超过 LOCK_CANDIDATE_TTL 则重新开始。
- locked：后续只接受与上一接受帧位置连续（跳变 ≤ LOCK_MAX_JUMP）的同一只手；
  别人的手在 MediaPipe 重检测边界替换 landmarks[0] 时表现为大跳变 → 拒绝该帧。
  连续 HAND_LOST_TIMEOUT 没有可接受帧才释放，下一位重新走驻留确认；
  短暂遮挡后原位附近重现保持锁定。
- 掌尺度 palm > LOCK_MAX_PALM 的帧（手糊到镜头上）一律不算看见锁定者。

与 Web 版 web/js/lock.js 同一算法、同一组参数，保证两版手感一致。

update(now, seen, x, y, palm=None) 返回 dict：
  present  — 是否存在"已锁定的人"（含丢失宽限）
  x,y      — 指数平滑后的锁定者坐标；present=False 时为 None
  accepted — 本帧是否接受了新检测（False 时消费方不应向挥舞检测器喂点）
  acquired — 本帧是否刚完成锁定
  reset    — 新会话/遮挡空档后恢复：消费方应重建挥舞检测器，防跨空档伪齐发
  session  — 每锁定一个新人 +1
"""

import math

from . import config


class HandLock:
    EMPTY = "empty"
    CANDIDATE = "candidate"
    LOCKED = "locked"

    def __init__(self):
        self.reset()

    def reset(self):
        """完全释放（如坐标系改变/镜像翻转后）。"""
        self.state = self.EMPTY
        self.cand_start = -1.0
        self.last_t = -1.0           # 最近一个"连续可接受"检测帧
        self.last_x = 0.5
        self.last_y = 0.5
        self.sx = None               # 平滑输出
        self.sy = None
        self.session = 0             # 每锁定一个新人 +1
        self._now = -1.0

    def _in_roi(self, x, y):
        x0, y0, x1, y1 = config.LOCK_ROI
        return x0 <= x <= x1 and y0 <= y <= y1

    def update(self, now, seen, x, y, palm=None):
        self._now = now
        if not config.LOCK_ENABLED:
            # 调试旁路：见手即跟（旧行为）
            self.state = self.LOCKED if seen else self.EMPTY
            if seen:
                acquired = self.sx is None
                if acquired:
                    self.session = max(self.session, 1)
                    self.sx, self.sy = x, y
                else:
                    self._smooth(x, y)
                self.last_t, self.last_x, self.last_y = now, x, y
                return self._out(True, True, acquired, acquired)
            self.sx = self.sy = None
            return self._out(False, False, False, False)

        accepted = False
        acquired = False
        # 与上一接受帧间隔过大（遮挡/掉帧/连续拒绝）→ 恢复时要求速度历史清零
        reset = self.state == self.LOCKED and self.last_t >= 0 and \
            now - self.last_t > config.LOCK_GAP_CLEAR
        plausible = seen and (palm is None or palm <= config.LOCK_MAX_PALM)

        if plausible:
            if self.state == self.EMPTY:
                if self._in_roi(x, y):
                    self.state = self.CANDIDATE
                    self.cand_start = now
                    self.last_t, self.last_x, self.last_y = now, x, y
            elif self.state == self.CANDIDATE:
                if self._in_roi(x, y) and math.hypot(
                        x - self.last_x, y - self.last_y) <= config.LOCK_MAX_JUMP:
                    self.last_t, self.last_x, self.last_y = now, x, y
                    if now - self.cand_start >= config.LOCK_DWELL:
                        self._acquire(x, y)
                        accepted = acquired = reset = True
                else:
                    # 出区或跳变：本次驻留确认作废（下一帧在区内重新计时）
                    self.state = self.EMPTY
                    self.sx = self.sy = None
            else:  # LOCKED
                if math.hypot(x - self.last_x, y - self.last_y) <= config.LOCK_MAX_JUMP:
                    self.last_t, self.last_x, self.last_y = now, x, y
                    self._smooth(x, y)
                    accepted = True
                # 跳变帧：判为他人/误检，拒绝（不动 last_t/坐标）

        # 超时释放（本帧有无检测都统一在尾部处理）
        if self.state == self.CANDIDATE and now - self.last_t > config.LOCK_CANDIDATE_TTL:
            self.state = self.EMPTY
        if self.state == self.LOCKED and now - self.last_t > config.HAND_LOST_TIMEOUT:
            self.state = self.EMPTY
            self.sx = self.sy = None

        return self._out(self.state == self.LOCKED, accepted, acquired,
                         reset and accepted)

    def _out(self, present, accepted, acquired, reset):
        phase = "locked" if self.state == self.LOCKED else (
            "candidate" if self.state == self.CANDIDATE else "idle")
        cand = (max(0.0, min(1.0, (self._now - self.cand_start) / config.LOCK_DWELL))
                if self.state == self.CANDIDATE else (1.0 if present else 0.0))
        return {
            "present": present,
            "x": self.sx,
            "y": self.sy,
            "accepted": accepted,
            "acquired": acquired,
            "reset": reset,
            "session": self.session,
            "phase": phase,       # 与 web/js/lock.js 对位（表现层三态反馈）
            "cand": cand,
        }

    def _acquire(self, x, y):
        self.state = self.LOCKED
        self.session += 1
        self.sx, self.sy = x, y     # 锁定瞬间直接吸附，不从旧位置长滑

    def _smooth(self, x, y):
        if self.sx is None:
            self.sx, self.sy = x, y
        else:
            a = config.SMOOTH_ALPHA
            self.sx += a * (x - self.sx)
            self.sy += a * (y - self.sy)
