"""隔空御剑 · 万剑归宗 —— 主程序

运行：.venv/Scripts/python.exe -m yujian.main
退出：Esc / Q；全屏：F；截图：S；镜像开关：M（调试）
"""

import math
import sys
import time

import pygame

from . import audio, config
from .effects import Background, Flash, Rings, Shake, SparkField, SwordField
from .lock import HandLock
from .swipe import SwipeDetector
from .tracker import HandTracker


class App:
    def __init__(self, headless=False, inject=None):
        pygame.init()
        audio.init()
        if headless or not config.FULLSCREEN:
            self.screen = pygame.display.set_mode((config.WIDTH, config.HEIGHT))
        else:
            self.screen = pygame.display.set_mode(
                (config.WIDTH, config.HEIGHT), pygame.FULLSCREEN)
        pygame.display.set_caption("隔空御剑 · 万剑归宗")

        self.bg = Background()
        self.field = SwordField()
        self.sparks = SparkField()
        self.rings = Rings()
        self.flash = Flash()
        self.shake = Shake()
        self.clock = pygame.time.Clock()
        self.detector = SwipeDetector()

        try:
            self.font = pygame.font.SysFont("microsoftyahei,simhei", 20)
            self.font_title = pygame.font.SysFont("microsoftyahei,simhei", 34, bold=True)
        except Exception:
            self.font = self.font_title = pygame.font.Font(None, 26)

        self.tracker = None if headless else HandTracker()
        self.inject = inject            # headless 注入：(present, hx, hy)
        # 无头路径在 App 层挂同一套会话锁（真机路径的锁在 tracker 线程内）
        self._app_lock = HandLock() if headless else None
        self._lock_token = (0, 0)       # (会话号, 空档重置序号)，变化即重建挥舞检测器
        self.running = True
        self.t0 = time.time()
        self._sweep_last = -10.0
        self._hand_screen = None

        if self.tracker is not None:
            self.tracker.start()

    # ---------------- 输入：摄像头/注入 → 屏幕归一化 ----------------
    def _read_hand(self, t):
        if self.tracker is not None:
            p = self.tracker.hand_present
            hx, hy = self.tracker.hand_x, self.tracker.hand_y
        else:
            inj = self.inject(t) if callable(self.inject) else self.inject
            p, hx, hy = (inj or (False, 0.5, 0.5))[:3]
        return p, (1 - hx) if config.MIRROR else hx, hy

    # ---------------- 主循环 ----------------
    def run(self, max_seconds=None):
        while self.running:
            dt = min(self.clock.tick(config.FPS) / 1000.0, 0.05)
            t = time.time() - self.t0
            for ev in pygame.event.get():
                if ev.type == pygame.QUIT:
                    self.running = False
                elif ev.type == pygame.KEYDOWN:
                    if ev.key in (pygame.K_ESCAPE, pygame.K_q):
                        self.running = False
                    elif ev.key == pygame.K_f:
                        pygame.display.toggle_fullscreen()
                    elif ev.key == pygame.K_s:
                        pygame.image.save(self.screen, "screenshot.png")
                    elif ev.key == pygame.K_m:
                        config.MIRROR = not config.MIRROR
                        # 镜像翻转改变坐标系：清速度历史，防一次假齐发
                        if self._app_lock is not None:
                            self._app_lock.reset()
                        self.detector = SwipeDetector()

            self.update(dt, t)
            self.draw(t)
            pygame.display.flip()
            if max_seconds is not None and t >= max_seconds:
                break
        return self

    def update(self, dt, t):
        p, nx, ny = self._read_hand(t)

        # 会话锁：无头路径在此锁定；真机路径消费 tracker 的锁定结果。
        # 新会话或遮挡空档恢复时重建挥舞检测器，换人/重现跳变无法伪造速度。
        if self._app_lock is not None:
            out = self._app_lock.update(t, p, nx, ny, None)
            p, nx, ny = out["present"], out["x"] if out["present"] else nx, \
                out["y"] if out["present"] else ny
            resets = self._lock_token[1] + (1 if out["reset"] else 0)
            token = (out["session"], resets)
        else:
            token = (self.tracker.session_id, self.tracker.vel_reset_seq)
        if token != self._lock_token:
            self._lock_token = token
            self.detector = SwipeDetector()

        sx, sy = nx * config.WIDTH, ny * config.HEIGHT

        swipe = self.detector.update(t, p, nx, ny)
        if swipe is not None:                      # 一记万剑齐发
            dx, dy, peak = swipe
            self.field.burst(sx, sy, dx, dy, peak)
            self.sparks.burst(sx, sy, dx, dy)
            self.rings.add(sx, sy)
            self.flash.pop(peak)
            self.shake.pop(peak)
            audio.whoosh()

        if p:
            self._hand_screen = (sx, sy)
        else:
            self._hand_screen = None
            self.field.idle_trickle(dt, t)
            if t - self._sweep_last > config.SWEEP_PERIOD:
                self._sweep_last = t
                self.field.idle_sweep(t)

        self.field.update(dt)
        self.sparks.update(dt)
        self.rings.update(dt)
        self.flash.update(dt)
        self.shake.update(dt)

    def draw(self, t):
        self.bg.draw(self.screen, 1 / config.FPS, t)

        ox, oy = self.shake.offset()
        canvas = pygame.Surface((config.WIDTH, config.HEIGHT), pygame.SRCALPHA)
        self.field.draw(canvas)
        self.sparks.draw(canvas)
        self.rings.draw(canvas)

        if self._hand_screen:
            sx, sy = self._hand_screen
            pulse = 18 + 5 * math.sin(t * 6)
            pygame.draw.circle(canvas, (120, 200, 255, 70),
                               (int(sx), int(sy)), int(pulse), 2)
            pygame.draw.circle(canvas, (255, 255, 255, 210),
                               (int(sx), int(sy)), 3)

        self.screen.blit(canvas, (ox, oy))
        self.flash.draw(self.screen)
        self._draw_hud(t, self._hand_screen is not None)

    def _draw_hud(self, t, present):
        shadow = self.font_title.render("隔空御剑 · 万剑归宗", True, (0, 0, 0))
        shadow.set_alpha(170)
        title = self.font_title.render("隔空御剑 · 万剑归宗", True, (232, 188, 96))
        self.screen.blit(shadow, (26, 22))
        self.screen.blit(title, (24, 20))
        sep = pygame.Surface((256, 2), pygame.SRCALPHA)
        pygame.draw.line(sep, (232, 188, 96, 130), (0, 0), (256, 0), 1)
        self.screen.blit(sep, (24, 64))

        if not present:
            a = int(130 + 90 * (0.5 + 0.5 * math.sin(t * 2.2)))
            hint = self.font.render("站到屏幕前，挥手 —— 万剑齐飞", True, (228, 236, 255))
            hint.set_alpha(a)
            self.screen.blit(hint, (24, config.HEIGHT - 44))
        else:
            hint = self.font.render("挥手方向 = 剑光方向", True, (180, 200, 235))
            hint.set_alpha(130)
            self.screen.blit(hint, (24, config.HEIGHT - 44))

        if self.tracker is not None:
            stat = (f"FPS {self.clock.get_fps():4.0f}  摄像头 {self.tracker.fps_cam:4.0f}  "
                    f"剑光 {len(self.field.swords):3d}")
            s = self.font.render(stat, True, (150, 165, 200))
            s.set_alpha(110)
            self.screen.blit(s, (24, config.HEIGHT - 78))

    def shutdown(self):
        if self.tracker is not None:
            self.tracker.stop()
        pygame.quit()


def main():
    app = App()
    try:
        app.run()
    finally:
        app.shutdown()


if __name__ == "__main__":
    sys.exit(main())
