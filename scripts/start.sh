#!/usr/bin/env bash
# Cross-platform launcher for macOS / Linux.
# Uses the bundled Node runtime (./node/bin/node) if present, else falls back
# to a system node. Picks a free port if 3000 is taken, starts the server, and
# opens the browser.
set -e

# Resolve the directory this script lives in (the app root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Pick a Node binary: bundled first, then PATH.
if [ -x "$SCRIPT_DIR/node/bin/node" ]; then
  NODE_BIN="$SCRIPT_DIR/node/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  echo "未找到 Node.js 运行时。请确保包完整，或安装 Node.js。" >&2
  read -p "按回车键退出..."
  exit 1
fi

# Locate the server entry. Packaged layout: ./server/dist/server.js
SERVER_JS="$SCRIPT_DIR/server/dist/server.js"
if [ ! -f "$SERVER_JS" ]; then
  echo "找不到服务端程序: $SERVER_JS" >&2
  read -p "按回车键退出..."
  exit 1
fi

# Find a free port starting from 3000.
find_free_port() {
  local port=3000
  while [ $port -lt 3100 ]; do
    if ! command -v lsof >/dev/null 2>&1; then
      echo "$port"
      return
    fi
    if ! lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      echo "$port"
      return
    fi
    port=$((port + 1))
  done
  echo "3000"
}
PORT="$(find_free_port)"

# Point the app at this directory and open the browser once it's ready.
export CLAUDE_UI_ROOT="$SCRIPT_DIR"
export PORT

echo "正在启动 Claude Code WebUI (端口 $PORT)..."
"$NODE_BIN" "$SERVER_JS" &
SERVER_PID=$!

# Wait for the ready signal, then open the browser.
(
  for i in $(seq 1 60); do
    sleep 0.5
    if command -v curl >/dev/null 2>&1 && curl -s "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
      URL="http://localhost:$PORT"
      if command -v open >/dev/null 2>&1; then
        open "$URL"
      elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL"
      fi
      break
    fi
  done
) &

# Keep the script alive while the server runs; stop the server on exit.
trap "kill $SERVER_PID 2>/dev/null; exit 0" INT TERM
wait $SERVER_PID
