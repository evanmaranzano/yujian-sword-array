"""手势追踪：摄像头采集 + MediaPipe HandLandmarker，独立线程。

改进点（识别手感）：
- 手掌中心 = 腕/食指根/中指根/无名指根/小指根 五点均值（比单点稳）
- 手部会话锁 lock.HandLock：中心区驻留确认后锁定第一个人，帧间位移连续性
  关联，围观者/凑近镜头/交接跳变一律拒绝（"第一个锁定的人"由应用层保证，
  num_hands=1 本身并不锁定身份）
- 掉帧自动重开摄像头（7×24 鲁棒性）
挥舞判定在 swipe.SwipeDetector（与无头测试共用同一代码路径）。
"""

import math
import time

import cv2

from . import config
from .lock import HandLock

try:
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision
    _MP_OK = True
except Exception:  # pragma: no cover
    _MP_OK = False

# 手掌中心关键点：腕、食指根、中指根、无名指根、小指根
_PALM_IDS = (0, 5, 9, 13, 17)


def _palm_size(lm):
    """掌尺度：腕(0)→中指根(9)，y 按 4:3 像素校正，输出画面宽归一化尺度。"""
    dx = lm[9].x - lm[0].x
    dy = (lm[9].y - lm[0].y) * 0.75
    return math.hypot(dx, dy)


class HandTracker:
    def __init__(self, camera_index=0):
        self._idx = camera_index
        self.cap = None
        self._open_camera()

        self._detector = None
        if _MP_OK:
            opts = vision.HandLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(config.MODEL_PATH)),
                running_mode=vision.RunningMode.VIDEO,
                num_hands=1,                       # 只输出一只；"锁定第一个人"由应用层 HandLock 保证
                min_hand_detection_confidence=0.5,
                min_tracking_confidence=0.7,
            )
            self._detector = vision.HandLandmarker.create_from_options(opts)

        # ---- 会话锁 ----
        self._lock = HandLock()
        self.session_id = 0          # 每锁定一个新人 +1（主线程据此重置挥舞检测）
        self.vel_reset_seq = 0       # 遮挡空档恢复时 +1（主线程据此清空速度历史）

        # ---- 状态（主线程读，本线程写）----
        self.hand_present = False
        self.hand_x = 0.5
        self.hand_y = 0.5
        self.fps_cam = 0.0
        self.alive = False
        self.error = None

        # ---- 原始检测（未经会话锁，供现场标定工具 tests/camera_check.py 使用）----
        self.raw_seen = False       # 本帧 MediaPipe 是否检到手（未经锁）
        self.raw_palm = 0.0         # 掌尺度（画面宽归一化，乘 frame_w 得像素掌宽）
        self.raw_x = 0.5            # 原始掌心（未镜像、未平滑）
        self.raw_y = 0.5
        self.last_frame = None      # 最近一帧 BGR（单路采集截图用，勿再二次开相机）
        self.frame_w = 0
        self.frame_h = 0

    # ------------------------------------------------------------------
    def start(self):
        import threading
        self.alive = True
        threading.Thread(target=self._loop, daemon=True).start()
        return self

    def stop(self):
        self.alive = False
        time.sleep(0.15)
        try:
            self.cap.release()
        except Exception:
            pass

    def _open_camera(self):
        self.cap = cv2.VideoCapture(self._idx, cv2.CAP_DSHOW)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)

    def _reopen_camera(self):
        try:
            self.cap.release()
        except Exception:
            pass
        time.sleep(0.2)
        self._open_camera()

    # ------------------------------------------------------------------
    def _loop(self):
        last_fps_t = time.time()
        frames = 0
        while self.alive:
            ok, frame = self.cap.read()
            if not ok:
                self._reopen_camera()
                ok, frame = self.cap.read()
                if not ok:
                    self.error = "摄像头读取失败"
                    time.sleep(0.05)
                    continue
            self.error = None

            now = time.time()
            frames += 1
            if now - last_fps_t >= 1.0:
                self.fps_cam = frames / (now - last_fps_t)
                frames = 0
                last_fps_t = now

            if self._detector is not None:
                self._process(frame, now)

    def _process(self, frame_bgr, now):
        self.last_frame = frame_bgr
        self.frame_h, self.frame_w = frame_bgr.shape[:2]
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        result = self._detector.detect_for_video(mp_img, int(now * 1000))

        if result.hand_landmarks:
            lm = result.hand_landmarks[0]
            x = sum(lm[i].x for i in _PALM_IDS) / len(_PALM_IDS)
            y = sum(lm[i].y for i in _PALM_IDS) / len(_PALM_IDS)
            palm = _palm_size(lm)
            self.raw_seen = True
            self.raw_palm = palm
            self.raw_x, self.raw_y = x, y
            out = self._lock.update(now, True, x, y, palm)
        else:
            self.raw_seen = False
            out = self._lock.update(now, False, 0.0, 0.0, None)

        # 只对外暴露"已锁定的人"（含丢失宽限）；锁定/释放时推进会话号
        self.hand_present = out["present"]
        self.session_id = out["session"]
        if out["reset"]:
            self.vel_reset_seq += 1
        if out["present"]:
            self.hand_x, self.hand_y = out["x"], out["y"]
