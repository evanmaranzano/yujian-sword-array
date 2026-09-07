"""渲染特效：仙侠夜景 + 万剑齐发。

全部静态素材预渲染（渐变、月亮、远山、剑光 sprite ×24 朝向），
每帧只做 blit 与少量线段，保证 60fps。
"""

import math
import random
from collections import deque

import numpy as np
import pygame

from . import config

rng = random.Random(20260828)

GOLD = (232, 188, 96)
BLADE = (255, 255, 255)
GLOW = (120, 200, 255)
IDLE_BLADE = (150, 210, 255)


# ======================================================================
# 预渲染工具
# ======================================================================
def _radial(color, radius, hardness=2.0, peak=255, premul=False):
    """径向辉光。premul=True 时 RGB 已乘 alpha（专供 BLEND_RGB_ADD）。"""
    size = radius * 2
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.hypot(xx - radius, yy - radius) / radius
    af = np.clip(1 - d, 0, 1) ** hardness * (peak / 255.0)
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    arr[..., 3] = (af * 255).astype(np.uint8)
    if premul:
        arr[..., 0] = (color[0] * af).astype(np.uint8)
        arr[..., 1] = (color[1] * af).astype(np.uint8)
        arr[..., 2] = (color[2] * af).astype(np.uint8)
    else:
        arr[..., 0] = color[0]
        arr[..., 1] = color[1]
        arr[..., 2] = color[2]
    return pygame.image.frombuffer(arr.tobytes(), (size, size), "RGBA")


def _soft_band(w, h, color, peak=40, premul=False):
    yy = np.linspace(-1, 1, h).astype(np.float32)
    af = np.clip(1 - np.abs(yy), 0, 1) ** 2 * (peak / 255.0)
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[..., 3] = (af[:, None] * 255).astype(np.uint8)
    if premul:
        arr[..., 0] = (color[0] * af[:, None]).astype(np.uint8)
        arr[..., 1] = (color[1] * af[:, None]).astype(np.uint8)
        arr[..., 2] = (color[2] * af[:, None]).astype(np.uint8)
    else:
        arr[..., 0] = color[0]
        arr[..., 1] = color[1]
        arr[..., 2] = color[2]
    return pygame.image.frombuffer(arr.tobytes(), (w, h), "RGBA")


def _vignette(w, h, peak=130):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = (xx - w / 2) / (w / 2)
    dy = (yy - h / 2) / (h / 2)
    d = np.clip(np.hypot(dx, dy) - 0.55, 0, 1)
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[..., 3] = (d * peak).astype(np.uint8)
    return pygame.image.frombuffer(arr.tobytes(), (w, h), "RGBA")


# ---------------- 剑 sprite（指向 +x，中心 (40,20)） ----------------
SW_ROT = 24


def _sword_body(dim=1.0):
    s = pygame.Surface((84, 40), pygame.SRCALPHA)
    d = dim
    # 剑身外柔光
    pygame.draw.polygon(s, (255, 255, 255, int(34 * d)),
                        [(14, 16), (62, 16), (80, 20), (62, 24), (14, 24)])
    # 剑脊（主刃）
    pygame.draw.polygon(s, (int(255 * d), int(255 * d), int(255 * d), int(235 * d)),
                        [(14, 18), (60, 18), (78, 20), (60, 22), (14, 22)])
    # 剑尖
    pygame.draw.polygon(s, (int(200 * d), int(230 * d), 255, int(255 * d)),
                        [(60, 18), (78, 20), (60, 22)])
    # 剑格（金色）
    pygame.draw.rect(s, (int(232 * d), int(188 * d), int(96 * d), 255),
                     (10, 10, 4, 20), border_radius=2)
    # 剑柄缠绳
    pygame.draw.rect(s, (int(110 * d), int(80 * d), int(45 * d), 255), (3, 18, 7, 4))
    # 剑首
    pygame.draw.circle(s, (int(232 * d), int(188 * d), int(96 * d), 255), (3, 20), 3)
    return s


def _rot_table(sprite, rot):
    # table[i] = 顺时针视觉旋转 i*step 度
    step = 360.0 / rot
    return {i: pygame.transform.rotate(sprite, -i * step) for i in range(rot)}


def _rot_index(vx, vy):
    ang = math.degrees(math.atan2(vy, vx))
    return int(round(ang / (360.0 / SW_ROT))) % SW_ROT


# ======================================================================
# 背景
# ======================================================================
class Background:
    def __init__(self):
        W, H = config.WIDTH, config.HEIGHT
        # 夜空渐变
        grad = np.zeros((H, W, 3), dtype=np.float32)
        for y in range(H):
            t = y / H
            if t < 0.6:
                k = t / 0.6
                c = np.array((6, 9, 24)) * (1 - k) + np.array((12, 20, 44)) * k
            else:
                k = (t - 0.6) / 0.4
                c = np.array((12, 20, 44)) * (1 - k) + np.array((20, 30, 56)) * k
            grad[y, :] = c
        self.surf = pygame.surfarray.make_surface(
            np.ascontiguousarray(np.transpose(grad, (1, 0, 2))))

        # 星
        self.stars = [(rng.uniform(0, W), rng.uniform(0, H * 0.7), rng.uniform(0.4, 1.4))
                      for _ in range(260)]
        self.twinkle = [(rng.uniform(0, W), rng.uniform(0, H * 0.7),
                         rng.uniform(0, 6.28), rng.uniform(0.5, 1.6))
                        for _ in range(45)]

        # 明月 + 月华（预乘 alpha，加法混合直绘上屏）
        self.moon = _radial((245, 250, 255), 130, hardness=2.6, peak=255, premul=True)
        self.moon_halo = _radial((170, 200, 255), 260, hardness=1.4, peak=70, premul=True)
        self.mx, self.my = 0.78 * W, 0.20 * H

        # 月光柱
        ray = _soft_band(900, 90, (160, 190, 255), peak=26, premul=True)
        self.rays = [(pygame.transform.rotate(ray, a), (self.mx, self.my + 300))
                     for a in (-18, 0, 18)]

        # 远山两层
        self.mount_back = self._mountain(H, 0.62, (10, 16, 32), 90, 34)
        self.mount_front = self._mountain(H, 0.72, (6, 10, 22), 60, 46)

        # 雾带
        band = _soft_band(700, 130, (140, 170, 220), peak=30)
        self.bands = [(band, rng.uniform(0, 1), rng.uniform(0.3, 0.8), rng.uniform(6, 14))
                      for _ in range(3)]

        # 流萤/花瓣（上浮）
        self.embers = [[rng.uniform(0, W), rng.uniform(0, H), rng.uniform(1.5, 3.5),
                        rng.uniform(8, 20), rng.uniform(0, 6.28),
                        (255, 214, 150) if rng.random() < 0.25 else (170, 215, 255)]
                       for _ in range(60)]

        # 漂浮符文
        self.chars = []
        try:
            font = pygame.font.SysFont("microsoftyahei,simhei", 64)
            for ch, fx, fy, sp in zip("御劍訣陣訶靈",
                                      (0.16, 0.38, 0.60, 0.84, 0.28, 0.70),
                                      (0.30, 0.18, 0.34, 0.26, 0.48, 0.52),
                                      (3, 2, 4, 2.5, 3.5, 2.2)):
                img = font.render(ch, True, (150, 190, 240))
                img.set_alpha(24)
                self.chars.append([img, fx * W, fy * H, sp, rng.uniform(0, 6.28)])
        except Exception:
            pass

        self.vignette = _vignette(W, H)

    def _mountain(self, H, base_frac, color, amp, step):
        W = config.WIDTH
        pts = [(0, H)]
        x = 0.0
        y = base_frac * H
        while x < W + step:
            y += rng.uniform(-amp, amp)
            y = max(base_frac * H - amp * 1.6, min(base_frac * H + amp * 0.8, y))
            pts.append((x, y))
            x += step * rng.uniform(0.7, 1.4)
        pts.append((W, H))
        s = pygame.Surface((W, H), pygame.SRCALPHA)
        pygame.draw.polygon(s, (*color, 255), pts)
        return s

    def draw(self, screen, dt, t):
        W, H = config.WIDTH, config.HEIGHT
        screen.blit(self.surf, (0, 0))

        for x, y, r in self.stars:
            if rng.random() < 0.004:          # 星星缓慢明灭（静态层廉价扰动）
                continue
            screen.set_at((int(x), int(y)), (200, 220, 255))
        for x, y, ph, sp in self.twinkle:
            a = int(90 + 70 * math.sin(t * sp + ph))
            if a > 40:
                screen.set_at((int(x), int(y)), (200, 220, min(255, a + 100)))

        # 月华 → 月 → 光柱（预乘素材，加法直绘）
        screen.blit(self.moon_halo, (self.mx - 260, self.my - 260),
                    special_flags=pygame.BLEND_RGB_ADD)
        screen.blit(self.moon, (self.mx - 130, self.my - 130),
                    special_flags=pygame.BLEND_RGB_ADD)
        for ray, (rx, ry) in self.rays:
            r = ray.get_rect(center=(rx, ry))
            screen.blit(ray, r, special_flags=pygame.BLEND_RGB_ADD)

        screen.blit(self.mount_back, (0, 0))
        for band, phase, fy, sp in self.bands:
            bx = ((t * sp + phase * (W + 700)) % (W + 700)) - 350
            screen.blit(band, (bx, fy * H))
        screen.blit(self.mount_front, (0, 0))

        for e in self.embers:
            e[1] -= e[3] * dt
            if e[1] < -4:
                e[1] = H + 4
                e[0] = rng.uniform(0, W)
            a = int(70 + 50 * math.sin(t * 2 + e[4]))
            pygame.draw.circle(screen, (*e[5], a), (int(e[0]), int(e[1])), int(e[2]))

        for img, fx, fy, sp, ph in self.chars:
            y = fy + math.sin(t * 0.2 * sp + ph) * 12
            screen.blit(img, (fx, y))

        screen.blit(self.vignette, (0, 0))


# ======================================================================
# 剑光
# ======================================================================
class Sword:
    __slots__ = ("x", "y", "vx", "vy", "life", "max_life", "dim", "rot")

    def __init__(self, x, y, vx, vy, dim=1.0, life=None):
        self.x, self.y = x, y
        self.vx, self.vy = vx, vy
        self.life = life or config.SWORD_LIFE
        self.max_life = self.life
        self.dim = dim
        self.rot = _rot_index(vx, vy)


FADE_LEVELS = (0.35, 0.7, 1.0)


class SwordField:
    def __init__(self):
        self.swords = []
        # 剑体表：(明/暗, 淡入淡出档位, 朝向) 全部预渲染
        self.body = {}
        for d, dimf in ((0, 1.0), (1, 0.5)):
            for fi, f in enumerate(FADE_LEVELS):
                for i, spr in _rot_table(_sword_body(dimf), SW_ROT).items():
                    spr = spr.copy()
                    spr.set_alpha(int(255 * f))      # 与逐像素 alpha 相乘
                    self.body[(d, fi, i)] = spr
        self.glow = _radial(GLOW, 26, hardness=1.6, peak=130)
        self.glow_dim = _radial(GLOW, 26, hardness=1.6, peak=60)
        self.spark = _radial((235, 245, 255), 10, hardness=1.8, peak=220)

    # ---------------- 生成 ----------------
    def burst(self, sx, sy, dirx, diry, peak):
        """一记万剑齐发：从手的位置沿挥舞方向扇形铺开。"""
        base = 460 + 760 * min(peak, 1.6)
        spread = 0.55
        for _ in range(config.SWORDS_PER_SWIPE):
            if len(self.swords) >= config.MAX_SWORDS:
                return
            a = math.atan2(diry, dirx) + rng.uniform(-spread, spread)
            sp = base * rng.uniform(0.75, 1.35)
            self.swords.append(Sword(
                sx + rng.uniform(-14, 14), sy + rng.uniform(-14, 14),
                math.cos(a) * sp, math.sin(a) * sp))

    def idle_trickle(self, dt, t):
        """待机：万剑自天外缓缓汇聚。"""
        W, H = config.WIDTH, config.HEIGHT
        if len(self.swords) >= config.MAX_SWORDS:
            return
        for _ in range(config.SWORDS_PER_IDLE_FRAME):
            edge = rng.random()
            if edge < 0.7:
                x, y = rng.uniform(0, W), rng.uniform(-40, -10)
            elif edge < 0.85:
                x, y = rng.uniform(-40, -10), rng.uniform(0, H)
            else:
                x, y = rng.uniform(W + 10, W + 40), rng.uniform(0, H)
            tx, ty = 0.5 * W + rng.uniform(-160, 160), 0.5 * H + rng.uniform(-110, 110)
            dx, dy = tx - x, ty - y
            d = math.hypot(dx, dy) + 1e-6
            sp = rng.uniform(90, 180)
            swirl = rng.uniform(-0.5, 0.5)
            self.swords.append(Sword(
                x, y,
                (dx / d + -dy / d * swirl) * sp,
                (dy / d + dx / d * swirl) * sp,
                dim=0.5, life=rng.uniform(2.6, 3.8)))

    def idle_sweep(self, t):
        """周期性大扫荡：一排剑光横扫天际。"""
        W, H = config.WIDTH, config.HEIGHT
        ang = 2 * math.pi * (t % config.SWEEP_PERIOD) / config.SWEEP_PERIOD
        dx, dy = math.cos(ang), math.sin(ang)
        cx, cy = 0.5 * W, 0.5 * H
        R = math.hypot(W, H)
        for i in range(56):
            if len(self.swords) >= config.MAX_SWORDS:
                return
            perp = rng.uniform(-0.55 * H, 0.55 * H)
            px = cx - dx * R + -dy * perp
            py = cy - dy * R + dx * perp
            sp = rng.uniform(500, 700)
            self.swords.append(Sword(px, py, dx * sp, dy * sp, dim=0.55,
                                     life=rng.uniform(2.0, 3.0)))

    # ---------------- 更新 / 绘制 ----------------
    def update(self, dt):
        alive = []
        for s in self.swords:
            s.life -= dt
            if s.life <= 0:
                continue
            s.x += s.vx * dt
            s.y += s.vy * dt
            alive.append(s)
        self.swords = alive

    def draw(self, canvas):
        for s in self.swords:
            age = s.max_life - s.life
            a = min(age / 0.08, 1.0) * min(s.life / 0.25, 1.0)
            if a <= 0:
                continue
            # 辉光（普通合成）
            glow = self.glow if s.dim >= 1.0 else self.glow_dim
            r = glow.get_width() // 2
            canvas.blit(glow, (s.x - r, s.y - r))
            # 淡入淡出档位
            fi = 0 if a < 0.45 else (1 if a < 0.8 else 2)
            body = self.body[(0 if s.dim >= 1.0 else 1, fi, s.rot)]
            canvas.blit(body, (s.x - 40, s.y - 20))
            # 拖尾（速度越快越长）
            sp = math.hypot(s.vx, s.vy)
            tl = min(70.0, sp * 0.05)
            ux, uy = s.vx / (sp + 1e-6), s.vy / (sp + 1e-6)
            tail_col = (int(160 * a * s.dim), int(210 * a * s.dim), int(255 * a * s.dim))
            pygame.draw.line(canvas, (*tail_col, int(60 * a)),
                             (s.x, s.y), (s.x - ux * tl, s.y - uy * tl), 5)
            pygame.draw.line(canvas, (255, 255, 255, int(200 * a * s.dim)),
                             (s.x, s.y), (s.x - ux * tl * 0.6, s.y - uy * tl * 0.6), 1)


# ======================================================================
# 火花 / 冲击波 / 闪光 / 震屏
# ======================================================================
class Sparks:
    __slots__ = ("x", "y", "vx", "vy", "life", "max_life")

    def __init__(self, x, y, vx, vy, life):
        self.x, self.y, self.vx, self.vy = x, y, vx, vy
        self.life = self.max_life = life


class SparkField:
    def __init__(self):
        self.items = []
        self.img = _radial((240, 248, 255), 8, hardness=1.5, peak=235)

    def burst(self, sx, sy, dirx, diry, n=config.SPARKS_PER_BURST):
        for _ in range(n):
            a = math.atan2(diry, dirx) + rng.uniform(-1.2, 1.2)
            sp = rng.uniform(120, 620)
            self.items.append(Sparks(sx, sy, math.cos(a) * sp, math.sin(a) * sp,
                                     rng.uniform(0.2, 0.5)))

    def update(self, dt):
        for s in self.items:
            s.life -= dt
            s.x += s.vx * dt
            s.y += s.vy * dt
            s.vx *= 1 - 2.4 * dt
            s.vy *= 1 - 2.4 * dt
        self.items = [s for s in self.items if s.life > 0]

    def draw(self, canvas):
        r = 8
        for s in self.items:
            canvas.blit(self.img, (s.x - r, s.y - r))


class Rings:
    def __init__(self):
        self.items = []          # (x, y, age)

    def add(self, x, y):
        self.items.append((x, y, 0.0))

    def update(self, dt):
        self.items = [(x, y, a + dt) for x, y, a in self.items if a < 0.55]

    def draw(self, canvas):
        for x, y, age in self.items:
            k = 1 - age / 0.55
            for rr, aa in ((70 + age * 900, 90 * k), (40 + age * 620, 60 * k)):
                if aa > 2:
                    pygame.draw.circle(canvas, (150, 210, 255, int(aa)),
                                       (int(x), int(y)), int(rr), 2)


class Flash:
    def __init__(self):
        self.v = 0.0
        self.overlay = pygame.Surface((config.WIDTH, config.HEIGHT), pygame.SRCALPHA)

    def pop(self, strength):
        self.v = min(1.0, 0.5 + 0.5 * strength)

    def update(self, dt):
        self.v = max(0.0, self.v - dt * 5.5)

    def draw(self, screen):
        if self.v > 0.01:
            self.overlay.fill((170, 210, 255, int(36 * self.v)))
            screen.blit(self.overlay, (0, 0))


class Shake:
    def __init__(self):
        self.v = 0.0

    def pop(self, strength):
        self.v = min(1.0, 0.4 + 0.6 * strength)

    def update(self, dt):
        self.v = max(0.0, self.v - dt * 4.0)

    def offset(self):
        if self.v < 0.01:
            return (0, 0)
        m = 13 * self.v * self.v
        return (rng.uniform(-m, m), rng.uniform(-m, m))
