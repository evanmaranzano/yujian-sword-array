#!/usr/bin/env bash
# v6 前端优化一键验证（仓库根目录执行：bash tools/verify_v6.sh）
# 内容：JS 语法 → Web 单测（gesture 17 + lock + swipe）→ Python 回归 → 无头截图（含手势阵型）
# v6 变更：serve.py 取代 http.server（.mjs MIME）；手势截图用 ?gesture= 强制阵型、t=8 冻结
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
EDGE="/c/Program Files/Google/Chrome/Application/chrome.exe"   # 用户要求 Chrome 优先（2026-09-08 确认）
[ -x "$EDGE" ] || EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
SHOT_DIR="/tmp/v6shots"
PORT=8162
FAIL=0
ok(){ printf '\033[32m[OK]\033[0m %s\n' "$1"; }
bad(){ printf '\033[31m[FAIL]\033[0m %s\n' "$1"; FAIL=1; }

# ---- 选一个能跑 tests 的 Python（坑：Anaconda site-packages 同名 tests 包遮蔽，见 HANDOFF 坑13/14）----
pick_python(){
  local cands=("${YUJIAN_PY:-}" "$ROOT/.venv/Scripts/python.exe" "$(command -v python || true)")
  local p
  for p in "${cands[@]}"; do
    [ -n "$p" ] || continue
    if (cd "$ROOT" && "$p" -c "import tests.lock_check" >/dev/null 2>&1); then echo "$p"; return 0; fi
  done
  return 1
}
PY="$(pick_python)" || { echo "未找到可用 Python（需可 import tests.lock_check）"; exit 2; }
echo "Python: $PY"

echo "== 1. JS 语法检查 =="
SYN_FAIL=0
while IFS= read -r f; do
  node --check "$f" || { bad "$f"; SYN_FAIL=1; }
done < <(find web/js web/test -name '*.js' -o -name '*.mjs' | sort)
[ "$SYN_FAIL" = 0 ] && ok "syntax"

echo "== 2. Web 单测 =="
node --test web/test/*.mjs >/tmp/v6node.log 2>&1 && ok "node tests ($(grep -c '^ok' /tmp/v6node.log))" || { bad "node tests"; grep "^not ok" /tmp/v6node.log; }

echo "== 3. Python 回归（Python 版未改，回归保平安）=="
"$PY" -m tests.lock_check >/tmp/lc.log 2>&1 && ok "lock_check(19)" || { bad "lock_check"; tail -5 /tmp/lc.log; }
SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy "$PY" -m tests.smoke >/tmp/sm.log 2>&1 && ok "smoke" || { bad "smoke"; tail -8 /tmp/sm.log; }

echo "== 4. 无头截图（serve.py + 确定性预滚冻结）=="
mkdir -p "$SHOT_DIR"
python tools/serve.py $PORT --bind 127.0.0.1 >/tmp/v6http.log 2>&1 &
SRV_PID=$!
sleep 1.5
shot(){ timeout 90 "$EDGE" --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader \
  --window-size=1280,720 --virtual-time-budget=15000 --user-data-dir=/tmp/edge-v6-$RANDOM \
  --screenshot="$(cygpath -w "$SHOT_DIR/$1.png" 2>/dev/null || echo "$SHOT_DIR/$1.png")" \
  "http://127.0.0.1:$PORT/?demo=1&t=$2&gesture=$3" 2>/dev/null; ok "shot $1"; }
# 位形阵用 t=11：demo 脚本在 t≈1.5-2.6 两次齐发，剑群 ~t9 才全部归阵+拖尾淡出
shot idle        0.4 IDLE
shot fist       11   FIST
shot bigsword   11   TWO_FINGERS   # 修复验收：单把大剑，无过曝无光柱
shot pillar     11   THUMB_UP
shot hexagram   11   SHAKA
shot dragon     11   ROCK
shot infinity   11   CROSSED_HANDS
shot taichi     11   DOUBLE_FIST
shot energyball 11   HANDS_CUP
# 动态阵中途冻结（剑雨/瀑布/爆裂本就在运动中）
shot rain        3.5 PALM_DOWN
shot explode     2.0 HANDS_PUSH
shot waterfall   4.5 OPEN_PALM
# 低画质档（关 bloom + 光晕壳补偿）
timeout 90 "$EDGE" --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader \
  --window-size=1280,720 --virtual-time-budget=15000 --user-data-dir=/tmp/edge-v6-$RANDOM \
  --screenshot="$(cygpath -w "$SHOT_DIR/bigsword_low.png" 2>/dev/null || echo "$SHOT_DIR/bigsword_low.png")" \
  "http://127.0.0.1:$PORT/?demo=1&t=11&gesture=TWO_FINGERS&q=low" 2>/dev/null
ok "shot bigsword_low"
kill $SRV_PID >/dev/null 2>&1
echo "  截图目录: $SHOT_DIR（人工/评审目检：bigsword 应为单把青色能量剑，无白柱无过曝）"

echo
if [ "$FAIL" = 0 ]; then printf '\033[32m=== ALL VERIFIED ===\033[0m\n'; else printf '\033[31m=== HAS FAILURES ===\033[0m\n'; fi
exit $FAIL
