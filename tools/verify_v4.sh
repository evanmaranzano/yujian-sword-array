#!/usr/bin/env bash
# v4 表现层重构一键验证（在仓库根目录执行：bash tools/verify_v4.sh）
# 内容：JS 语法 → Web 单测 → Python 回归 → 无头截图 → 交付文档重建
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
SHOT_DIR="/tmp/v4shots"
PORT=8161
FAIL=0
ok(){ printf '\033[32m[OK]\033[0m %s\n' "$1"; }
bad(){ printf '\033[31m[FAIL]\033[0m %s\n' "$1"; FAIL=1; }

# ---- 选一个能跑 tests 的 Python ----
# 本机坑（HANDOFF 坑13/14）：Anaconda 3.11 的用户 site-packages 装了同名 tests 包，
# 会遮蔽本地 tests/（无 __init__.py 的命名空间包会输给 site-packages 常规包）；
# 且系统 python 未必有 pygame/cv2。探测顺序：$YUJIAN_PY → .venv → python/py -3。
pick_python(){
  local cands=("${YUJIAN_PY:-}" "$ROOT/.venv/Scripts/python.exe" "$(command -v python || true)")
  local p probe
  for p in "${cands[@]}"; do
    [ -n "$p" ] || continue
    probe="$(cd "$ROOT" && "$p" -c "import tests.lock_check" 2>&1)" && { echo "$p"; return 0; }
  done
  return 1
}
PY="$(pick_python)" || { echo "未找到可用 Python（需可 import tests.lock_check，即有 pygame/cv2 且不被 site-packages tests 遮蔽）"; exit 2; }
echo "Python: $PY"

echo "== 1. JS 语法检查 =="
while IFS= read -r f; do
  if node --check "$f"; then :; else bad "$f"; fi
done < <(find web/js web/test -name '*.js' -o -name '*.mjs' | sort)
ok "syntax"

echo "== 2. Web 单测（lock 8 + swipe 4）=="
node --test web/test/lock.test.mjs web/test/swipe.test.mjs && ok "node tests" || bad "node tests"

echo "== 3. Python 回归 =="
"$PY" -m tests.lock_check >/tmp/lc.log 2>&1 && ok "lock_check(19)" || { bad "lock_check"; tail -5 /tmp/lc.log; }
SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy "$PY" -m tests.smoke >/tmp/sm.log 2>&1 && ok "smoke" || { bad "smoke"; tail -8 /tmp/sm.log; }
SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy "$PY" -m tests.camera_check --selftest >/tmp/cc.log 2>&1 && ok "camera_check selftest(8)" || { bad "camera_check"; tail -8 /tmp/cc.log; }
SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy "$PY" -m tests.soak --seconds 12 >/tmp/so.log 2>&1 && ok "soak 12s" || { bad "soak"; tail -8 /tmp/so.log; }

echo "== 4. 字体子集（仅当存在全量 TTF：/tmp/vend/dl/LXGWWenKaiLite-*.ttf）=="
if [ -f /tmp/vend/dl/LXGWWenKaiLite-Regular.ttf ] && [ -f /tmp/vend/dl/g2.txt ]; then
  for w in Regular Medium; do
    "$PY" -m fontTools.subset /tmp/vend/dl/LXGWWenKaiLite-$w.ttf \
      --text-file=/tmp/vend/dl/g2.txt --unicodes="U+0020-007E" --flavor=woff2 \
      --output-file="web/assets/fonts/yujian-kai-$w.woff2" && ok "font $w" || bad "font $w"
  done
else
  echo "  跳过（现有子集覆盖全部 UI/demo 用字；远雾繁体诗句回退系统 STKaiti）"
fi

echo "== 5. 无头冻结截图 =="
if [ -x "$EDGE" ]; then
  mkdir -p "$SHOT_DIR"
  (cd web && python -m http.server $PORT --bind 127.0.0.1 >/tmp/v4http.log 2>&1 &)
  sleep 1.5
  for t in 0.4 1.35 1.6 1.8 1.95 2.4 4.0 5.8; do
    timeout 60 "$EDGE" --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader \
      --window-size=1280,720 --virtual-time-budget=7000 --user-data-dir=/tmp/edge-v4-$RANDOM \
      --screenshot="$(cygpath -w "$SHOT_DIR/t$t.png" 2>/dev/null || echo "$SHOT_DIR/t$t.png")" \
      "http://127.0.0.1:$PORT/?demo=1&t=$t" 2>/dev/null
    ok "shot t=$t"
  done
  timeout 60 "$EDGE" --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader \
    --window-size=3440,1440 --virtual-time-budget=7000 --user-data-dir=/tmp/edge-v4-wide-$RANDOM \
    --screenshot="$(cygpath -w "$SHOT_DIR/ultrawide.png" 2>/dev/null || echo "$SHOT_DIR/ultrawide.png")" \
    "http://127.0.0.1:$PORT/?demo=1&t=0.4" 2>/dev/null
  ok "shot ultrawide"
  # 停掉本脚本起的服务
  netstat -ano | grep ":$PORT .*LISTENING" | awk '{print $5}' | sort -u | xargs -r taskkill //F //PID >/dev/null 2>&1 || true
  echo "  截图目录: $SHOT_DIR"
else
  echo "  跳过（未找到 Edge）"
fi

echo "== 6. 重建交付文档 =="
"$PY" tools/build_delivery.py && ok "delivery md" || bad "delivery md"

echo
if [ "$FAIL" = 0 ]; then printf '\033[32m=== ALL VERIFIED ===\033[0m\n'; else printf '\033[31m=== HAS FAILURES ===\033[0m\n'; fi
exit $FAIL
