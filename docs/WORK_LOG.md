# 轸宿智汇平台 · 工作进度日志

> 此文件用于记录开发会话之间的上下文桥接。每次开始新会话前，先读此文件。
> 每次完成一个阶段性工作后，更新此文件并提交 Git。

---

## 当前工作目标

<!-- 从这里开始，记录当前正在做什么 -->

**未设定** — 在靶机上部署 MinIO 实现高可用（来自上次会话遗留）

---

## 会话历史

### 2026-09-11 — MinIO 高可用部署讨论

- **目标**：在远程靶机上安装 MinIO 实现对象存储高可用
- **进展**：
  - 项目中已有 MinIO 工具模板（`tools.ts` 第 46 行）：单机 Docker 方式 `minio/minio server /data`
  - 已有 Docker Compose 服务定义（`tools.ts` 第 130 行）：`minio/minio:latest`，默认 admin/admin123
  - 讨论方向：如何扩展为分布式高可用模式
- **下一步**：确定方案（分布式 MinIO 集群 vs 主从 + 负载均衡）

### 2026-09-04 — 通知渠道 Email + 凭据加密

- **目标**：邮件通知渠道（SMTP）+ 密码 at-rest 加密
- **进展**：
  - `feat: 通知渠道新增邮件(SMTP)` — 零依赖客户端，支持 SSL/STARTTLS/明文，密码 at-rest 加密
  - `fix: 通知渠道 email 密码加解密与 hosts 一致` — GET 解密 / PUT 加密，修正密码框占位文案
- **产出**：`server/src/routes/notify.ts`
- **下一步**：—

### 2026-09-04 — 多用户 + RBAC

- **目标**：登录系统、角色权限控制
- **进展**：
  - `feat: 多用户 + RBAC(admin/只读) + 用户管理`
  - `feat: 凭据加密 at-rest(AES-256-GCM) + 管理员解密回退`
- **产出**：`server/src/routes/admin.ts`、`server/src/routes/auth.ts`

### 2026-09-03 — 指标历史化 + 巡检报告

- **目标**：监控数据落盘 + 定时巡检报告生成推送
- **进展**：
  - `feat: 指标历史化 + 监控历史趋势页`
  - `feat: 巡检报告(生成/预览/下载/推送/每日定时)`
- **产出**：监控趋势页、报告模块

### 2026-09-02 — Ansible 自动化 + AI 设置

- **目标**：DevOps 自动化、AI 自定义提供商
- **进展**：
  - `feat: Ansible 自动化模块(DevOps 页签) — P0+P1`
  - `feat: AI 设置支持自定义提供商与可编辑 baseURL/模型/Key`
- **产出**：Ansible Playbook 编辑器、AI 设置面板

### 2026-09-01 — 更多模块落地

- 登录与账户中心、nginx 高级功能、CI/构建工具链与安全加固
- 系统模块全面升级（安全/数据库/文件/网站/备份/审计/任务/登录）

### 2026-08-31 — 平台首版

- `feat: 轸宿智汇平台 —— 智能运维 · Agent 管理 · 在线编程一体化平台`
- 37 题题库 / 力扣式解题页 / 在线编程运行 / 主机指标可视化
- 本地 k3s / RAG 知识库 / AI 对话 + 工具调用

---

## 待办清单

<!-- 按优先级排列 -->

- [ ] **MinIO 高可用部署** — 在远程靶机上部署 MinIO 集群（分布式模式或主从），实现对象存储高可用
- [ ] 告警通知渠道补充（电话/短信）
- [ ] 在线编程沙箱化（容器隔离）
- [ ] 英文版 README / GitHub Actions CI
- [ ] 指标历史长周期趋势图
- [ ] 高危命令二次确认（已有 RBAC 基础上补充）

---

## 技术决策记录

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-09-04 | Email 密码 at-rest 加密使用 AES-256-GCM，与 hosts 凭据加密一致 | 统一加密层，避免两种加密方案 |
| 2026-09-03 | 监控指标使用 JSON 文件落盘，不引入时序数据库 | 保持零外部依赖，降低部署复杂度 |
| 2026-08-31 | 使用 Fastify 而非 Express | 性能更好，原生 TS 支持，生态兼容 |

---

## 常用命令速查

```bash
# 开发模式
cd /home/kali/ops-hub
cd server && npm run dev   # 后端热更 (端口 7799)
cd web && npm run dev      # 前端热更 (端口 5173)

# 类型检查
cd server && npx tsc --noEmit
cd web && npx tsc --noEmit

# 构建生产
cd web && npm run build
./start.sh restart

# 查看日志
tail -f /tmp/opshub.log

# Git 提交
cd /home/kali/ops-hub
git add -A
git commit -m "feat: ..."
git push
```

> **注意**：`server/src/data/` 下的运行时数据（AI Key、监控数据等）已 gitignore，不要手动提交。
> 桌面 `~/knowledge/` 的 PDF 有版权，永远不要提交。