"""无头烟雾测试：脚本化注入挥手轨迹，验证 状态机 + 镜像方向 + 渲染截图。

运行（项目根目录）：
    SDL_VIDEODRIVER=dummy .venv/Scripts/python.exe -m tests.smoke
"""

import os
import sys
import time

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pygame  # noqa: E402

from yujian import config  # noqa: E402
from yujian.main import App  # noqa: E402

SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(SHOTS, exist_ok=True)


def script(t):
    """模拟观众（归一化坐标，未镜像）：
    0-1.0 无人 → 1.0-1.5 快速向右挥 → 1.5-2.2 静止
    → 2.2-2.65 快速向左上挥 → 2.65-5.0 静止 → 5.0 后离开。"""
    if t < 1.0:
        return (False, 0.5, 0.55)
    if t < 1.5:
        return (True, 0.5 + (t - 1.0) * 0.80, 0.55)     # 0.8/s > SWIPE_HI
    if t < 2.2:
        return (True, 0.9, 0.55)
    if t < 2.65:
        return (True, 0.9 - (t - 2.2) * 0.80, 0.55 - (t - 2.2) * 0.44)
    if t < 5.0:
        return (True, 0.54, 0.35)
    return (False, 0.5, 0.55)


def main():
    app = App(headless=True, inject=script)

    # 固定虚拟时钟驱动（docs/04 N-TEST-1：旧版用墙钟 t，机器慢时采样点不足导致
    # 锁/挥舞时序不可复现；脚本、积分、截图全部用同一虚拟时钟，确定性可复现）
    dt = 1 / config.FPS
    total_frames = int(6.2 * config.FPS)
    shots_at = {0.5: "01_idle", 1.9: "02_swipe_right", 3.0: "03_swipe_upleft",
                4.0: "04_hold", 5.8: "05_back_to_idle"}
    taken = set()
    stats = {}
    for i in range(total_frames + 1):
        t = i * dt
        app.update(dt, t)
        app.draw(t)
        pygame.display.flip()
        for at, name in shots_at.items():
            if name not in taken and t >= at:
                pygame.image.save(app.screen, os.path.join(SHOTS, f"{name}.png"))
                taken.add(name)
                active = [s for s in app.field.swords if s.dim >= 1.0]
                stats[name] = (
                    len(app.field.swords),
                    sum(s.vx for s in active) / len(active) if active else 0.0,
                )

    # ---------------- 断言 ----------------
    # 每次挥手只应触发一记齐发（约 SWORDS_PER_SWIPE 把）
    assert stats["02_swipe_right"][0] >= 30, f"右挥后剑光不足: {stats}"
    assert stats["03_swipe_upleft"][0] >= 30, f"左上挥后剑光不足: {stats}"

    # 镜像一致性：归一化向右挥（hx 增大）→ 屏幕上剑光应向左飞（vx<0）
    assert stats["02_swipe_right"][1] < 0, \
        f"镜像方向错误: 右挥后平均vx={stats['02_swipe_right'][1]:.1f}（应<0）"

    print(f"[OK] 待机剑光   : {stats['01_idle'][0]}")
    print(f"[OK] 右挥后剑光 : {stats['02_swipe_right'][0]}  平均vx={stats['02_swipe_right'][1]:.0f}")
    print(f"[OK] 左上挥后   : {stats['03_swipe_upleft'][0]}  平均vx={stats['03_swipe_upleft'][1]:.0f}")
    print(f"[OK] 截图已保存到 {SHOTS}")
    print("SMOKE TEST PASSED")


if __name__ == "__main__":
    main()
