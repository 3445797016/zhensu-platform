#!/usr/bin/env bash
# Ops Hub 启动/停止/状态脚本（systemd 单元 opshub.service）
set -e
case "$1" in
  start)
    systemctl daemon-reload 2>/dev/null || true
    systemctl enable opshub.service >/dev/null 2>&1 || true
    systemctl restart opshub.service
    echo "已启动 opshub.service。日志: tail -f /tmp/opshub.log";;
  stop)   systemctl stop opshub.service && echo 已停止 || echo 未运行;;
  restart) systemctl restart opshub.service && echo 已重启;;
  logs)   tail -40 /tmp/opshub.log;;
  status) systemctl is-active opshub.service; curl -s http://localhost:7799/api/health; echo;;
  *) echo "用法: $0 {start|stop|restart|logs|status}";;
esac
