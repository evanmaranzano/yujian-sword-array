"""真机摄像头联调 + 现场标定工具（3/4/5m × 成人/儿童 数据采集）。

运行（项目根目录，需 Python 3.12 venv + mediapipe + 摄像头）：

    .venv/Scripts/python.exe -m tests.camera_check                      # 默认 20s 联调
    .venv/Scripts/python.exe -m tests.camera_check --duration 30 --label 4m-adult
    .venv/Scripts/python.exe -m tests.camera_check --label 5m-child --require-hand
    .venv/Scripts/python.exe -m tests.camera_check --selftest           # 不碰摄像头，合成数据自检指标管线

退出码（不再"空转假通过"）：
    0 = 全部达标；1 = 指标未达标（见手率/FPS/--require-hand）；2 = 环境不可用（无 mediapipe/相机打不开）

采集指标（现场可行性标定表数据源，配合 --label 逐站位/逐人群跑一遍）：
  - 摄像头 FPS、追踪报错
  - 原始检测率 raw_detect_rate（未经会话锁，MediaPipe 见手帧占比）—— H4 距离可行性
  - 锁定率 lock_rate、会话数 sessions、首次获锁耗时 —— 会话锁现场表现
  - 掌宽像素 palm_px 的 min/p50/p95/max —— H4 核心数据（对照 BlazePalm 192px 输入）
  - 掌心 y 分布（p05/p50/p95）—— 校验 lockRoi y1=0.90 对儿童/机位是否合适
  - 手速分布（归一化画面宽/秒，0.12s 窗口）p50/p95/max + 齐发事件数 —— swipeHi=0.75 定标
  - 最长连续丢失帧段（采样点计）—— 驻留确认闪烁脆弱性（lockCandidateTtl）
实拍帧从追踪线程单路取帧保存（不再二次 VideoCapture）。结果追加写入 --csv（默认 tests/calib_log.csv）。
"""

import argparse
import csv
import math
import os
import sys
import time
from collections import deque
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
DEFAULT_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calib_log.csv")
SAMPLE_HZ = 30
VELOCITY_WINDOW = 0.12

EXIT_OK = 0
EXIT_METRIC_FAIL = 1
EXIT_ENV_FAIL = 2


def percentile(values, q):
    """q ∈ [0,1] 的百分位（线性插值）；空列表返回 None。"""
    if not values:
        return None
    s = sorted(values)
    pos = q * (len(s) - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return s[lo]
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


class CalibAnalyzer:
    """采样 tracker 输出，累积现场标定指标。挥舞事件计数与 main.py 同接线（token 重建检测器）。"""

    def __init__(self, mirror=True):
        self.mirror = mirror
        self.samples = 0
        self.raw_seen_n = 0
        self.lock_n = 0
        self.palm_px = []
        self.ys = []
        self.speeds = []
        self.sessions = set()
        self.first_lock_t = None
        self.max_loss_streak = 0
        self.swipes = 0
        self._loss_streak = 0
        self._hist = deque()          # (t, nx, ny) 锁定者坐标，0.12s 速度窗口
        self._detector = None
        self._token = (0, 0)

    def _detector_for(self, tr):
        # 与 yujian/main.py:107-113 相同：会话/空档 token 变化即重建挥舞检测器
        from yujian.swipe import SwipeDetector
        token = (tr.session_id, tr.vel_reset_seq)
        if token != self._token:
            self._token = token
            self._detector = SwipeDetector()
        return self._detector

    def sample(self, t, tr):
        """每采样点调用一次。tr 为 HandTracker（或 selftest 的同构假对象）。"""
        self.samples += 1
        if tr.raw_seen:
            self.raw_seen_n += 1
            frame_w = tr.frame_w or 640
            self.palm_px.append(tr.raw_palm * frame_w)

        present = bool(tr.hand_present)
        nx = (1.0 - tr.hand_x) if self.mirror else tr.hand_x
        ny = tr.hand_y

        if present:
            self.lock_n += 1
            self.sessions.add(tr.session_id)
            if self.first_lock_t is None:
                self.first_lock_t = t
            self._loss_streak = 0
            self.ys.append(ny)

            self._hist.append((t, nx, ny))
            cutoff = t - VELOCITY_WINDOW
            while self._hist and self._hist[0][0] < cutoff:
                self._hist.popleft()
            if len(self._hist) >= 2:
                t0, x0, y0 = self._hist[0]
                dt = max(t - t0, 1e-3)
                self.speeds.append(math.hypot((nx - x0) / dt, (ny - y0) / dt))

            det = self._detector_for(tr)
            if det.update(t, True, nx, ny) is not None:
                self.swipes += 1
        else:
            self._hist.clear()
            self._loss_streak += 1
            self.max_loss_streak = max(self.max_loss_streak, self._loss_streak)
            det = self._detector_for(tr)
            det.update(t, False, nx, ny)

    def summary(self, fps_cam, error):
        return {
            "samples": self.samples,
            "fps_cam": fps_cam,
            "error": error or "",
            "raw_detect_rate": self.raw_seen_n / self.samples if self.samples else 0.0,
            "lock_rate": self.lock_n / self.samples if self.samples else 0.0,
            "sessions": len(self.sessions),
            "first_lock_t": self.first_lock_t,
            "palm_px_min": percentile(self.palm_px, 0.0),
            "palm_px_p50": percentile(self.palm_px, 0.50),
            "palm_px_p95": percentile(self.palm_px, 0.95),
            "palm_px_max": percentile(self.palm_px, 1.0),
            "y_p05": percentile(self.ys, 0.05),
            "y_p50": percentile(self.ys, 0.50),
            "y_p95": percentile(self.ys, 0.95),
            "speed_p50": percentile(self.speeds, 0.50),
            "speed_p95": percentile(self.speeds, 0.95),
            "speed_max": percentile(self.speeds, 1.0),
            "swipes": self.swipes,
            "max_loss_streak": self.max_loss_streak,
        }


CSV_FIELDS = [
    "label", "wall_time", "duration_s", "fps_cam", "error",
    "raw_detect_rate", "lock_rate", "sessions", "first_lock_t",
    "palm_px_min", "palm_px_p50", "palm_px_p95", "palm_px_max",
    "y_p05", "y_p50", "y_p95",
    "speed_p50", "speed_p95", "speed_max", "swipes", "max_loss_streak",
]


def append_csv(csv_path, label, duration, s):
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    exists = os.path.exists(csv_path)
    with open(csv_path, "a", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if not exists:
            w.writeheader()
        row = {"label": label, "wall_time": time.strftime("%Y-%m-%d %H:%M:%S"),
               "duration_s": round(duration, 2)}
        row.update({k: ("" if s.get(k) is None else round(s[k], 4) if isinstance(s[k], float) else s[k])
                    for k in CSV_FIELDS if k not in ("label", "wall_time", "duration_s")})
        w.writerow(row)


def print_summary(label, s):
    def pct(v):
        return "—" if v is None else f"{v * 100:5.1f}%"
    def num(v, nd=2):
        return "—" if v is None else f"{v:.{nd}f}"
    print("=" * 64)
    print(f"标定结果  label={label or '(未标注)'}")
    print("-" * 64)
    print(f"采样点 {s['samples']}（{SAMPLE_HZ}Hz）  摄像头 FPS {num(s['fps_cam'], 1)}  报错: {s['error'] or '无'}")
    print(f"原始检测率（见手帧/总帧） : {pct(s['raw_detect_rate'])}")
    print(f"锁定率（会话锁 present）  : {pct(s['lock_rate'])}   会话数 {s['sessions']}   首次获锁 {num(s['first_lock_t'], 2)}s")
    print(f"掌宽像素 min/p50/p95/max : {num(s['palm_px_min'], 1)} / {num(s['palm_px_p50'], 1)} / "
          f"{num(s['palm_px_p95'], 1)} / {num(s['palm_px_max'], 1)} px")
    print(f"掌心 y   p05/p50/p95     : {num(s['y_p05'], 3)} / {num(s['y_p50'], 3)} / {num(s['y_p95'], 3)}（ROI y1=0.90）")
    print(f"手速     p50/p95/max     : {num(s['speed_p50'], 2)} / {num(s['speed_p95'], 2)} / "
          f"{num(s['speed_max'], 2)} 归一化/s（swipeHi=0.75）")
    print(f"齐发事件 {s['swipes']} 次   最长连续丢失 {s['max_loss_streak']} 采样点 "
          f"（≈{s['max_loss_streak'] / SAMPLE_HZ:.2f}s）")
    print("=" * 64)


# ------------------------------------------------------------------
# 真机采集
# ------------------------------------------------------------------
def run_real(args):
    try:
        from yujian.tracker import HandTracker, _MP_OK
        from yujian import config
    except ImportError as e:
        print(f"[环境失败] 无法导入 yujian 依赖: {e}")
        return EXIT_ENV_FAIL

    if not _MP_OK:
        print("[环境失败] mediapipe 不可用（本机 Python 3.14 无 wheel；请在 Python 3.12 venv 中运行）。")
        return EXIT_ENV_FAIL

    os.makedirs(SHOTS, exist_ok=True)
    tr = HandTracker()
    tr.start()
    ana = CalibAnalyzer(mirror=config.MIRROR)
    t0 = time.time()
    shot_saved = False
    try:
        while True:
            t = time.time() - t0
            if t >= args.duration:
                break
            ana.sample(t, tr)
            # 单路采集：运行 1.5s 后从追踪线程取一帧存实拍图（不再二次开相机）
            if not shot_saved and t > 1.5 and tr.last_frame is not None:
                import cv2
                cv2.imwrite(os.path.join(SHOTS, "camera_view.png"), tr.last_frame)
                shot_saved = True
            time.sleep(1.0 / SAMPLE_HZ)
    finally:
        tr.stop()

    s = ana.summary(tr.fps_cam, tr.error)
    print_summary(args.label, s)
    print(f"实拍帧已保存: {shot_saved}（tests/shots/camera_view.png）")
    if args.csv:
        append_csv(args.csv, args.label, args.duration, s)
        print(f"指标已追加到 {args.csv}")

    # ---- 达标判定（退出码）----
    fails = []
    if tr.error is not None or s["fps_cam"] < 1.0:
        print(f"[环境失败] 摄像头不可用: {tr.error or ('FPS=' + str(s['fps_cam']))}")
        return EXIT_ENV_FAIL
    if s["fps_cam"] < args.min_fps:
        fails.append(f"摄像头 FPS {s['fps_cam']:.1f} < {args.min_fps}")
    if args.require_hand and s["raw_detect_rate"] <= 0.0:
        fails.append("--require-hand 指定但全程未检测到手（raw_detect_rate=0）")
    if fails:
        print("[指标未达标]")
        for msg in fails:
            print(f"  - {msg}")
        return EXIT_METRIC_FAIL
    print("CAMERA CHECK PASSED")
    return EXIT_OK


# ------------------------------------------------------------------
# 合成数据自检（不碰摄像头；本机无 mediapipe/相机也能验证指标管线）
# ------------------------------------------------------------------
def fake_tracker(t):
    """0–0.5s 无人；0.5–1.5s 手在画面中快速右挥（0.9 归一化/s > swipeHi，掌宽 0.05→32px）；1.5–2.0s 无人。"""
    if t < 0.5 or t >= 1.5:
        return SimpleNamespace(
            raw_seen=False, raw_palm=0.0, hand_present=False, hand_x=0.5, hand_y=0.55,
            session_id=1, vel_reset_seq=0, frame_w=640, frame_h=480, fps_cam=30.0, error=None)
    # 驻留 0.2s 后锁定（与真实 HandLock 同参数），x 以 0.9/s 快速移动（越过 swipeHi=0.75）
    x = min(0.9, 0.15 + (t - 0.5) * 0.9)
    return SimpleNamespace(
        raw_seen=True, raw_palm=0.05, hand_present=(t >= 0.7), hand_x=x, hand_y=0.55,
        session_id=1, vel_reset_seq=0, frame_w=640, frame_h=480, fps_cam=30.0, error=None)


def run_selftest():
    ana = CalibAnalyzer(mirror=True)
    dt = 1.0 / SAMPLE_HZ
    n = int(2.0 / dt)
    for i in range(n + 1):
        ana.sample(i * dt, fake_tracker(i * dt))
    s = ana.summary(30.0, None)
    print("[selftest] 合成 2s 场景指标：")
    print_summary("selftest", s)

    checks = [
        ("采样点 = 61", s["samples"] == 61),
        ("原始检测率 ≈ 50%", 0.45 < s["raw_detect_rate"] < 0.55),
        ("锁定率 ≈ 40%", 0.35 < s["lock_rate"] < 0.45),
        ("掌宽像素 = 32px（0.05×640）", s["palm_px_p50"] is not None and abs(s["palm_px_p50"] - 32.0) < 0.01),
        ("快速挥手速峰值 > swipeHi 0.75", s["speed_max"] is not None and s["speed_max"] > 0.75),
        ("齐发事件 ≥ 1", s["swipes"] >= 1),
        ("存在最长丢失段统计", s["max_loss_streak"] > 0),
        ("无人场景百分位为 None（空列表安全）", percentile([], 0.5) is None),
    ]
    failed = [name for name, ok in checks if not ok]
    for name, ok in checks:
        print(f"[{'OK' if ok else 'FAIL'}] {name}")
    if failed:
        print("SELFTEST FAILED")
        return EXIT_METRIC_FAIL
    print("SELFTEST PASSED")
    return EXIT_OK


def main():
    ap = argparse.ArgumentParser(description="真机摄像头联调 + 3/4/5m 现场标定工具")
    ap.add_argument("--duration", type=float, default=20.0, help="采集时长（秒），默认 20")
    ap.add_argument("--label", default="", help="标定标签，如 4m-adult / 5m-child（写入 CSV）")
    ap.add_argument("--csv", default=DEFAULT_CSV, help="标定日志 CSV 路径，默认 tests/calib_log.csv")
    ap.add_argument("--require-hand", action="store_true", help="全程未见手则判失败（退出码 1）")
    ap.add_argument("--min-fps", type=float, default=20.0, help="摄像头 FPS 下限，默认 20")
    ap.add_argument("--selftest", action="store_true", help="合成数据自检指标管线（不用摄像头）")
    args = ap.parse_args()

    if args.selftest:
        sys.exit(run_selftest())
    sys.exit(run_real(args))


if __name__ == "__main__":
    main()
