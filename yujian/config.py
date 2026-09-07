"""全局可调参数 —— 现场联调时改这里即可。"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "hand_landmarker.task"

# ---------------- 画面 ----------------
WIDTH, HEIGHT = 1280, 720
FPS = 60
FULLSCREEN = False          # 展厅部署时改 True
MIRROR = True               # 镜像映射：手往左挥，剑光往左飞（照镜子式直觉）

# ---------------- 追踪（识别手感） ----------------
SMOOTH_ALPHA = 0.55          # 手掌位置指数平滑（越小越稳但越滞后）
VELOCITY_WINDOW = 0.12       # 速度估计窗口（秒），去瞬时差分噪声
SWIPE_HI = 0.75              # 速度超过此值 → 挥舞开始
SWIPE_LO = 0.30              # 速度低于此值 → 挥舞结束（迟滞防抖）
SWIPE_MIN_DIST = 0.07        # 有效挥舞最小位移（归一化）
SWIPE_MAX_DUR = 0.70         # 挥舞最长持续（秒），超时强制结算
HAND_LOST_TIMEOUT = 0.5      # 手丢失多少秒后回到待机

# 会话锁（"以第一个锁定的人为准，围观不干扰"）
LOCK_ENABLED = True
LOCK_ROI = (0.12, 0.10, 0.88, 0.90)  # 驻留确认区 (x0,y0,x1,y1)，归一化坐标
LOCK_DWELL = 0.20            # 在区内连续驻留多久才锁定（秒）
LOCK_MAX_JUMP = 0.22         # 相邻检测帧掌心跳变 > 此值判为换人/误检
LOCK_MAX_PALM = 0.40         # 掌尺度上限（4:3 校正后归一化），防凑近镜头夺控
LOCK_CANDIDATE_TTL = 0.15    # 候选驻留中断多久作废（秒）
LOCK_GAP_CLEAR = 0.07        # 接受帧间隔超此值视为遮挡空档，速度历史应清零

# ---------------- 特效 ----------------
MAX_SWORDS = 200
SWORDS_PER_SWIPE = 46        # 每次挥舞：一记万剑齐发
SWORDS_PER_IDLE_FRAME = 1    # 待机每帧生成数
SWORD_LIFE = 1.3
SWEEP_PERIOD = 9.0           # 待机"万剑归宗"大扫荡周期（秒）
SPARKS_PER_BURST = 26        # 挥舞火花数

# ---------------- 音效（可选） ----------------
SOUND_ENABLED = True
SWOOSH_VOLUME = 0.5
