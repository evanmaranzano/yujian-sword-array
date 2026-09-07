"""可选音效：挥舞时的"嗖"声（噪声扫频合成，无外部素材）。
任何一步失败都静默降级为无声，不影响画面。
"""

import math

from . import config

_snd = None
_ready = False


def init():
    global _snd, _ready
    if not config.SOUND_ENABLED:
        return
    try:
        import numpy as np
        import pygame
        pygame.mixer.pre_init(44100, -16, 1, 256)
        pygame.mixer.init()
        sr = 44100
        dur = 0.5
        t = np.arange(int(sr * dur)) / sr
        noise = np.random.uniform(-1, 1, t.shape)
        # 带通式扫频：用滑频正弦调制噪声，模拟风切声
        sweep = 300 + 2200 * (t / dur) ** 2
        tone = np.sin(2 * math.pi * np.cumsum(sweep) / sr)
        env = np.sin(math.pi * np.clip(t / dur, 0, 1)) ** 2
        wav = (0.5 * noise * tone + 0.5 * tone) * env
        wav = (wav * 32767 * config.SWOOSH_VOLUME).astype(np.int16)
        _snd = pygame.sndarray.make_sound(wav)
        _ready = True
    except Exception:
        _snd, _ready = None, False


def whoosh():
    if _ready and _snd is not None:
        try:
            _snd.play()
        except Exception:
            pass
