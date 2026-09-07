"""无头烤机脚本（无需摄像头/显示器）：脚本化模拟"观众轮流体验"长循环，
监测帧率、剑光容量、会话锁切换、齐发事件计数与内存增长，供 24/72h 验收烤机。

运行（项目根目录）：
    python -m tests.soak --seconds 20                 # 快速自检（约 20s 墙钟）
    python -m tests.soak --minutes 60                 # 1 小时烤机
    python -m tests.soak --hours 72 --csv tests/soak_log.csv

判据（任一不满足即退出码 1）：
  - 全程无异常；
  - --min-fps 显式设为 >0 时，暖机后平均墙钟帧率需达标（默认 0=仅上报不判：
    dummy SDL 的墙钟速度取决于机器，不是现场帧率指标，现场请在真机用真实窗口测）；
  - 齐发事件数与脚本时刻严格一致（每周期右挥在 7c+1.6、左上挥在 7c+2.75 结算）；
  - 会话数与脚本一致（每周期 7c+1.2 新观众获锁）；
  - 内存（tracemalloc 跟踪量；装了 psutil 则额外看 RSS）暖机后增长不超过 --mem-growth-pct。

说明：pygame/numpy 的 C 层分配 tracemalloc 不能完全覆盖，RSS（psutil）更权威；
无 psutil 时以 tracemalloc 为准并在输出中标注。墙钟可能慢于虚拟时长（dummy 软渲染），
长烤机可用 --draw-every 降低绘制频率（事件/逻辑仍逐帧推进）。
"""

import argparse
import csv
import os
import statistics
import sys
import time
import tracemalloc

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pygame  # noqa: E402

from yujian import config  # noqa: E402
from yujian.main import App  # noqa: E402
from tests.smoke import script  # noqa: E402

PERIOD = 7.0          # 一个"观众周期"：1s 待机 + 挥手两段 + 停留 + 离开，复用 smoke 脚本
WARMUP_S = PERIOD     # 第一个周期作暖机（池填充/字体光栅化等一次性分配）
DT = 1 / config.FPS

try:
    import psutil  # type: ignore
    _PROC = psutil.Process()
except Exception:
    psutil = None
    _PROC = None


def mem_sample():
    """返回 (tracemalloc 当前 MB, RSS MB 或 None)。"""
    cur = tracemalloc.get_traced_memory()[0] / (1024 * 1024)
    rss = _PROC.memory_info().rss / (1024 * 1024) if _PROC else None
    return cur, rss


def main():
    ap = argparse.ArgumentParser(description="无头烤机：长循环模拟观众，监测帧率/容量/会话/内存")
    ap.add_argument("--seconds", type=float, default=0.0)
    ap.add_argument("--minutes", type=float, default=0.0)
    ap.add_argument("--hours", type=float, default=0.0)
    ap.add_argument("--min-fps", type=float, default=0.0, help="墙钟帧率下限；0=仅上报不判（默认）")
    ap.add_argument("--mem-growth-pct", type=float, default=25.0, help="暖机后内存增长允许百分比")
    ap.add_argument("--draw-every", type=int, default=1, help="每 N 帧绘制一次（长烤机降负载，默认 1）")
    ap.add_argument("--csv", default="", help="每秒采样输出 CSV 路径（可选）")
    args = ap.parse_args()

    duration = args.seconds + args.minutes * 60 + args.hours * 3600
    if duration <= 0:
        ap.error("请用 --seconds/--minutes/--hours 指定烤机时长")

    tracemalloc.start()
    app = App(headless=True, inject=lambda t: script(t % PERIOD))

    burst_count = 0
    orig_burst = app.field.burst

    def counting_burst(*a, **k):
        nonlocal burst_count
        burst_count += 1
        return orig_burst(*a, **k)

    app.field.burst = counting_burst

    total_frames = int(duration / DT)
    samples = []          # (sim_t, fps, swords, session, tm_mb, rss_mb)
    errors = []
    wall0 = time.time()
    block_t0 = wall0
    max_swords = 0

    for i in range(total_frames):
        t = i * DT
        try:
            app.update(DT, t)
            if args.draw_every <= 1 or i % args.draw_every == 0:
                app.draw(t)
                pygame.display.flip()
        except Exception as e:  # 烤机中任何异常都记录并终止
            errors.append(f"t={t:.2f}s {type(e).__name__}: {e}")
            break
        max_swords = max(max_swords, len(app.field.swords))

        if (i + 1) % config.FPS == 0:
            now = time.time()
            fps = config.FPS / max(now - block_t0, 1e-6)
            block_t0 = now
            tm_mb, rss_mb = mem_sample()
            samples.append((t, fps, len(app.field.swords), app._app_lock.session, tm_mb, rss_mb))

    wall = time.time() - wall0
    app.shutdown()
    tracemalloc.stop()

    full_cycles = int(duration / PERIOD)
    final_session = app._app_lock.session

    # 期望计数按脚本时刻上限算（lock_check 实测：右挥事件在 u∈(1.5,1.75)、左上挥在 (2.65,2.9)、
    # 驻留获锁约 u=1.2；留余量取 1.75/2.90/1.40），部分周期内已完成的事件也计入
    def expected_events(T):
        n = 0
        c = 0
        while True:
            if PERIOD * c + 1.75 <= T:
                n += 1
            second_done = PERIOD * c + 2.90 <= T
            if second_done:
                n += 1
            if not second_done:
                break
            c += 1
        return n

    def expected_sessions(T):
        return sum(1 for c in range(int(T // PERIOD) + 2) if PERIOD * c + 1.40 <= T)

    exp_events = expected_events(duration)
    exp_sessions = expected_sessions(duration)

    # ---- 汇总 ----
    post = [s for s in samples if s[0] >= WARMUP_S]
    fps_vals = [s[1] for s in post]
    tm_vals = [s[4] for s in post]
    rss_vals = [s[5] for s in post if s[5] is not None]
    base_tm = statistics.mean([s[4] for s in samples if WARMUP_S <= s[0] < WARMUP_S * 2]) if len(tm_vals) else 0.0
    tail_n = max(1, len(post) // 10)
    tail_tm = statistics.mean([s[4] for s in post[-tail_n:]]) if post else 0.0
    tm_growth = (tail_tm - base_tm) / base_tm * 100 if base_tm > 0 else 0.0
    base_rss = statistics.mean([s[5] for s in samples if WARMUP_S <= s[0] < WARMUP_S * 2 and s[5] is not None]) if rss_vals else None
    tail_rss = statistics.mean([s[5] for s in post[-tail_n:] if s[5] is not None]) if rss_vals else None
    rss_growth = ((tail_rss - base_rss) / base_rss * 100) if base_rss else None

    print("=" * 64)
    print(f"烤机结束  虚拟时长 {duration:.0f}s（{duration/3600:.2f}h）  墙钟 {wall:.1f}s  完整周期 {full_cycles}")
    if fps_vals:
        print(f"墙钟帧率（暖机后，dummy 软渲染仅供参考）平均 {statistics.mean(fps_vals):.0f}  最低 {min(fps_vals):.0f} fps"
              + (f"（门限 {args.min_fps:.0f}）" if args.min_fps > 0 else "（未设门限）"))
    else:
        print("无暖机后采样（时长太短）")
    print(f"齐发事件 {burst_count}（期望 {exp_events}，按脚本时刻计）")
    print(f"会话锁 session = {final_session}（期望 {exp_sessions}）")
    print(f"剑光容量峰值 {max_swords} / {config.MAX_SWORDS}")
    print(f"内存 tracemalloc 暖机均值 {base_tm:.1f}MB → 尾部均值 {tail_tm:.1f}MB（增长 {tm_growth:+.1f}%）")
    if rss_vals:
        print(f"内存 RSS(psutil) 暖机均值 {base_rss:.1f}MB → 尾部均值 {tail_rss:.1f}MB（增长 {rss_growth:+.1f}%）")
    else:
        print("内存 RSS：未安装 psutil，仅 tracemalloc（C 层分配不全覆盖）")
    print("=" * 64)

    if args.csv:
        os.makedirs(os.path.dirname(os.path.abspath(args.csv)), exist_ok=True)
        with open(args.csv, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["sim_t_s", "fps", "swords", "session", "tracemalloc_mb", "rss_mb"])
            for row in samples:
                w.writerow([f"{row[0]:.1f}", f"{row[1]:.1f}", row[2], row[3],
                            f"{row[4]:.2f}", "" if row[5] is None else f"{row[5]:.2f}"])
        print(f"每秒采样已写入 {args.csv}")

    # ---- 判据 ----
    fails = []
    if errors:
        fails.append(f"运行异常: {errors[0]}")
    if args.min_fps > 0 and fps_vals and statistics.mean(fps_vals) < args.min_fps:
        fails.append(f"平均帧率 {statistics.mean(fps_vals):.1f} < {args.min_fps}")
    if burst_count != exp_events:
        fails.append(f"齐发计数 {burst_count} != 期望 {exp_events}（按脚本事件时刻计）")
    if final_session != exp_sessions:
        fails.append(f"会话数 {final_session} != 期望 {exp_sessions}（观众轮换未正确产生新会话）")
    if abs(tm_growth) > args.mem_growth_pct and abs(tail_tm - base_tm) > 2.0:
        fails.append(f"tracemalloc 增长 {tm_growth:+.1f}% 超过门限 ±{args.mem_growth_pct}%")
    if rss_growth is not None and abs(rss_growth) > args.mem_growth_pct and abs(tail_rss - base_rss) > 5.0:
        fails.append(f"RSS 增长 {rss_growth:+.1f}% 超过门限 ±{args.mem_growth_pct}%")

    if fails:
        print("SOAK TEST FAILED")
        for msg in fails:
            print(f"  - {msg}")
        return 1
    print("SOAK TEST PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
