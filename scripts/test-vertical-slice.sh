#!/bin/bash
# 垂直切片集成测试
# 场景：创建任务 → 发送消息 → AI 执行 → 流式事件 → 任务完成
set -e

cd "$(dirname "$0")/.."

echo "════════════════════════════════════════"
echo "  垂直切片测试：task → AI → events"
echo "════════════════════════════════════════"

# 启动 runtime，通过 coprocess 保持 stdin 打开
exec 3<> >(cargo run -p soma-runtime -- --stdio 2>/dev/null)
RTPID=$!
sleep 1

send_rpc() {
  echo "$1" >&3
  sleep 0.3
}

echo ""
echo "1/5 创建任务..."
send_rpc '{"jsonrpc":"2.0","id":1,"method":"task/create","params":{"project_root":".","title":"切片测试"}}'
read -t 1 line <&3
echo "  ← $line"

echo ""
echo "2/5 列出任务..."
send_rpc '{"jsonrpc":"2.0","id":2,"method":"task/list","params":{}}'
read -t 1 line <&3
echo "  ← $line"

echo ""
echo "3/5 发送消息（触发 AI 执行）..."
send_rpc '{"jsonrpc":"2.0","id":3,"method":"task/send_message","params":{"task_id":"task-1","text":"Just say hello and respond with exactly: Hello from SomaOS!"}}'
read -t 2 line <&3
echo "  ← $line"

echo ""
echo "4/5 读取流式事件（最多 30 秒）..."
EVENT_COUNT=0
TURN_COMPLETED=0
TIMEOUT=30
while [ $TIMEOUT -gt 0 ] && [ $TURN_COMPLETED -eq 0 ]; do
  if read -t 1 line <&3; then
    EVENT_COUNT=$((EVENT_COUNT + 1))
    KIND=$(echo "$line" | grep -o '"kind":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "response")
    if echo "$line" | grep -q '"method":"task/event"'; then
      echo "  event[$EVENT_COUNT]: $KIND"
      if [ "$KIND" = "TurnCompleted" ] || [ "$KIND" = "TurnFailed" ]; then
        TURN_COMPLETED=1
        echo "  → Turn 结束"
      fi
    fi
  else
    TIMEOUT=$((TIMEOUT - 1))
  fi
done

echo ""
echo "5/5 验证任务状态..."
send_rpc '{"jsonrpc":"2.0","id":4,"method":"task/get","params":{"task_id":"task-1"}}'
read -t 1 line <&3
echo "  ← $line"

echo ""
echo "════════════════════════════════════════"
echo "  测试完成"
echo "  事件数: $EVENT_COUNT"
echo "  Turn 结束: $([ $TURN_COMPLETED -eq 1 ] && echo '✅' || echo '❌ 超时')"
echo "════════════════════════════════════════"

# 清理
kill $RTPID 2>/dev/null || true
wait $RTPID 2>/dev/null || true
exec 3>&-
