# 轸宿智汇平台 · 工作进度日志

> 此文件用于记录开发会话之间的上下文桥接。每次开始新会话前，先读此文件。
> 每次完成一个阶段性工作后，更新此文件并提交 Git。

---

## 当前工作目标

<!-- 从这里开始，记录当前正在做什么 -->

**全站 UI 升级** — 建立全局设计系统(主题/token + global.css + 共享组件)，让 29 个路由统一获得品牌化横幅与精致表格/卡片质感；并分批把各页裸 `Statistic` 升级为渐变 KPI 卡

---

### 2026-09-11 — 全功能测试 + Bug 修复 → VPN 模块集成

- **目标**：全面测试所有功能模块 API，寻找并修复 Bug
- **测试结果**：28/28 API endpoints 全部正常响应
- **已修复 Bug**：
  - **BUG-1 (中)**：端口探测误报 — harbor/gitlab/dvwa 因 nginx 占用端口 80 被误判为 detected
    - 修复：在探测命令中加入进程名检查（`ss -tlnp`），对比进程名与工具 ID
    - 文件：`server/src/modules/tools.ts` — `probeTool()` 函数
    - 并发现 prometheus 之前也是误报（端口 9090 上实际是 clash 进程），现已修正
  - **BUG-2 (中)**：`Hosts.tsx` 多处 API 调用缺少 try/catch — 修复 load/save/showMetrics/testConn/runCmd
  - **BUG-3 (中)**：`Agents.tsx` load() 中 API 调用缺少 try/catch — 添加错误处理和错误提示
  - **BUG-4 (中)**：`KnowledgeBase.tsx` 多处 API 调用缺少 try/catch — 修复 load/rebuild/toggle/doSearch
- **确认无 Bug**：
  - MongoDB 探测已正确显示 detected=True, running=True ✅
  - Dashboard 前端聚合 6 个 API 工作正常 ✅
  - AI 对话 SSE 流式输出正常 ✅
  - 所有模块返回正确状态码和数据 ✅
- **下一步**：决定是否修复 BUG-1 级别的其他遗漏，或切换至 MinIO 高可用部署

---

## 会话历史

### 2026-09-22 — 全站 UI 升级（全局设计系统 + 分批页面改造）

- **背景**：用户反馈「每个界面都很简陋」
- **全局层（一次性提升全部 29 个路由）**：
  - `web/src/main.tsx`：antd 主题 token 全面升级（圆角 10、控件高度 34、字号、组件级 token：Layout/Card/Table/Button/Input/Select/Menu/Tabs）
  - `web/src/styles/global.css`（新）：卡片悬浮阴影、表头/行悬浮、表单聚焦环、滚动条、进入动画；`.ui-banner` 分区横幅、`.ui-stat` 渐变统计卡样式
  - `web/src/components/ui.tsx`（新）：共享组件 `StatCard` / `Toolbar` / `SectionTitle` / `EmptyHint`
  - `web/src/App.tsx`：侧边栏由 29 条平铺改为 **7 大分区分组**（总览/基础设施/应用与数据/安全/自动化与交付/开发与 AI/系统）；除自带 Hero 或需全屏工作区的路由（`/`、`/net`、`/pentagi`、`/code`、`/notebook`、`/ai`）外，**自动注入分区渐变色页面横幅**（图标+标题+描述+分区胶囊）；路由切换加入进入动画
- **页面深度升级（13 个）**：Firewall / Hosts / K8sBoard / WebLogs / Tools / LinuxManage / MinIO / SecurityPage / VPN / Docker / Websites / FilesPage / TaskCenter
  - 顶部裸 `Statistic` 卡 → 渐变 `StatCard`（图标、左侧色条、进度条、悬浮抬升）
  - 新增 KPI 概览：Docker（容器/运行中/镜像/版本）、Websites（站点/启用/HTTPS/反代）、Files（目录项/子目录/文件/总大小）、Hosts（纳管/本机/SSH/探活）、Firewall（策略/规则/流量等 6 项）
- **验证**：
  - `web tsc --noEmit` 通过；`vite build` 通过
  - Chromium 无头逐路由冒烟：29 个路由全部渲染成功，横幅按预期出现/隐藏，**0 个 JS 异常**
- **文件**：见 Git `c5c4198`
- **后续批次（本次会话继续完成）**：
  - 批次2/3（`446f40e`）：BackupCenter / BuildTools / Agents / NotifyChannels / ReportPage / ProblemsPage / DevOps / Tunnels / SystemCenter / DatabaseCenter / JenkinsBuild — 均新增渐变 StatCard KPI 概览
  - 批次4（`66a2c87`）：Ansible（Playbook/执行/定时/环境）、知识库（文档/块/词条/AI检索）
  - 累计 **26 个页面**完成内容级升级；每批均 `tsc` + `vite build` + Chromium 无头冒烟（0 JS 异常）后提交
- **保持原样（已属工作区/自定义视觉，仅受全局主题影响）**：Code（编辑器）、Solve（力扣式）、AIChat（对话）、Notebook（交互脚本）、Monitoring（已有图表仪表）、DevOpsCI（卡片密集）
- **下一步**：可继续把上面这些工作区页的顶部工具条/空态统一；或补充全局深色模式

### 2026-09-22 — 网络工具箱 v2（功能 + 界面全面重构）

- **背景**：用户反馈「网络工具箱功能和界面都太简陋」
- **后端** `server/src/routes/net.ts` 重写：
  - **安全**：全部改用 `spawnSync(argv 数组)`，不再拼接 shell；输入统一校验(域名/IP/端口/URL)，拒绝以 `-` 开头的参数 → 消除命令注入
  - **接口 8 → 14**：`capabilities`、`info`(网卡/路由)、`dns`、`dns-propagation`(7 解析器对比)、`reverse`、`nslookup`、`ping`、`tcp-ping`(纯 Node net.Socket)、`port-scan`(nmap，缺失时内置扫描降级)、`traceroute`、`mtr`(缺失时 traceroute 降级)、`whois`、`http`(计时/头/体重定向链)、`headers`、`tls`(openssl 证书解析)、`subnet`(纯计算)；保留旧 `dig/curl` 别名
  - **结构化返回**：records/byType、ping stat+每包时延、hops、open ports、cert(剩余天数/SAN/链)、子网二进制等，前端直接渲染
  - 所有 handler 经 `guard()` 捕获异常 → 返回 `{ok:false,error}`，前端提示友好
- **前端** `web/src/pages/NetTools.tsx` + `net-tools.css` 重做：
  - Hero 横幅(可用命令能力胶囊 + 可用工具计数 + 历史抽屉)
  - 左侧分组工具导航(缺失依赖自动置灰)，右侧「参数表单 → 运行 → 可视化结果」
  - 每类工具定制可视化：DNS 记录表 / 解析器对比网格 / Ping 统计+每包时延柱 / 端口表 / 路由逐跳时延条 / MTR 丢包表 / HTTP 计时瀑布+响应头+响应体 / 证书剩余天数+SAN / 子网二进制 / 网卡路由表
  - 通用能力：可视化↔原始切换、复制、下载、执行历史(localStorage 30 条，可回填重跑)
- **修复**：
  - nmap 输出解析跨行吞行 bug（`\s*` 匹配换行 → 改 `[ \t]`）
  - DNS 默认 `+noall +answer` 去掉 authority/additional 噪音
  - TLS 成功时不再把 openssl 的 verify 日志当作 error
- **验证**：
  - `server` / `web` 双双 `tsc --noEmit` 通过；`vite build` 通过
  - 全部接口 curl 实测通过（含超时/非法输入防护）
  - Chromium 无头 + CDP 端到端：12 个工具全部「选择→填参→运行→可视化渲染」成功，**0 个 JS 异常**
- **文件**：`server/src/routes/net.ts`、`web/src/pages/NetTools.tsx`、`web/src/pages/net-tools.css`
- **部署**：`web/dist` 已重新构建，`opshub.service` 正常
- **下一步**：可按需把 tcp-ping 结果做多轮趋势、或给端口扫描加常用服务指纹库

### 2026-09-19 — PentAGI AI 渗透集成落地（可迁移模块）

- **目标**：把已部署的 PentAGI（AI 自动化渗透测试引擎）深度融合进运维平台，且新增代码独立可迁移
- **方案**：不对 PentAGI 的 38.6 万行源码做抽取（耦合过深），改为在其 **REST API 之上做适配层**
- **产出（自包含、可整体搬迁）**：
  - 后端 `server/src/pentagi/`：`config.ts` / `client.ts` / `index.ts` / `README.md`
  - 前端 `web/src/pentagi/`：`api.ts` / `PentagiPage.tsx` / `README.md`
- **注册接线（仅 2 处）**：`server/src/index.ts` 注册路由、`web/src/App.tsx` 加菜单+路由
- **验证**：
  - `tsc --noEmit` server / web 双双通过；`vite build` 通过
  - 连接 PentAGI（`https://127.0.0.1:8443`，账号模式）→ 配置加密落盘 → 连通测试 OK
  - 实拉 Flow 2「Windows Host Pentest Lab」详情：1 task / 12 subtasks / 31 msglogs / 32 termlogs / 6 agentlogs
- **顺带修复的既有类型错误**（与 pentagi 无关）：`notebook.ts`、`notify-channels.ts`(`fastify.del`→`delete`)、`tunnels.ts`(缺 `join` 导入)、`Markdown.tsx`(react-markdown v10 移除 `inline`)、`Docker.tsx`、`Tunnels.tsx`(无效图标)、`VPN.tsx`
- **下一步**：前端页面联调走查；按需补充从靶机库一键下发任务的联动

### 2026-09-19 — PentAGI 前端界面重做（告别“简陋”）

- **背景**：初版页面只有表格 + 基础弹窗，观感单薄
- **产出**：
  - `web/src/pentagi/lib.ts` — 展示层纯函数（目标/端口/CVE 提取、CVE 名称与危害级别、时长/相对时间、靶机画像解析）
  - `web/src/pentagi/MissionDrawer.tsx` — 「任务控制台」抽屉
  - `web/src/pentagi/pentagi.css` — Hero 渐变 / 统计卡 / 状态脉冲 / 终端外观 / 风险卡
  - `PentagiPage.tsx` 重写：Hero 横幅 + 概览统计 + 状态筛选/搜索 + 增强任务列表
- **亮点**：
  - **风险发现**：自动提取 CVE 并匹配 MS17-010/BlueKeep 等，标注“已验证可利用” + 证据片段
  - **靶机画像**：解析主机名/OS/工作组/开放端口
  - **执行时间线**：思考/执行/汇报分色可视化，可展开思考与结果
  - **终端控制台**：stdout/stderr/stdin 过滤、自动滚动、复制、下载
  - **阶段报告**：Markdown 渲染，逐条展开
  - **深链接**：`?flow=<id>&tab=<overview|timeline|subtasks|agents|console|raw>`
- **验证**：`tsc` + `vite build` 通过；用 Chromium 无头渲染逐页面（主页 + 6 个标签）确认无运行时错误
- **下一步**：—

### 2026-09-19 — 总览 Dashboard 界面升级

- **背景**：首页为普通卡片 + Statistic，观感平实
- **产出**：`web/src/pages/dashboard.css` + `Dashboard.tsx` 重写
- **亮点**：
  - **Hero 问候横幅**：按时段问候 + 实时时钟 + 一键刷新 + 状态胶囊（健康度/主机/容器/Pod/告警）
  - **6 张 KPI 卡**：左侧色条 + 渐变图标 + 进度条（Agent/Docker/K8s/安全扫描/告警）
  - **平台健康度**：圆环渐变进度 + 4 项服务状态 + 24 次趋势面积图
  - **资源态势**：Docker 运行/暂停/停止堆叠条 + K8s 命名空间 Pod 条形图
  - **进行中告警**：按 类型+主机+数值 去重聚合，标注重复次数与处理状态
  - **最近活动**（审计流水）、**最近任务**、**巡检报告**、**快捷入口**（8 个模块）
- **性能优化**：`load()` 改为“每个接口先到先渲染”，避免被 `k8s/summary`（~7s）阻塞首屏
- **验证**：`tsc` + `vite build` 通过；Chromium 无头渲染确认 4s 内首屏完整、k8s 数据后补、无运行时错误

### 2026-09-19 — 告警一键已读 + 全局界面优化

- **告警一键已读**：
  - 后端 `POST /monitor/alerts/ack` 扩展：支持 `{id}` 单条 / `{ids:[...]}` 批量 / `{all:true}` 全部，返回 `count`
  - 顶部铃铛弹层重做：未读统计、全部/未读切换、类型图标与颜色、相对时间、单条已读、**一键已读**、打开即刷新
  - 告警中心页：KPI 标题、状态筛选、一键已读、类型图标、数值列
  - 两个入口都做了 **乐观更新**，点击立即反馈
  - 修复旧接口在 `id` 缺失时会插入脏记录的 bug（已清理历史脏数据）
- **顶部栏**：改为“当前模块图标 + 名称 + 平台副标题”的面包屑样式，全局统一
- **任务中心**：KPI 卡 + 状态筛选/搜索 + 状态圆点/耗时/相对时间 + 日志控制台（复制/下载）
- **知识库**：KPI 卡 + 索引进度 + 文档筛选 + 检索结果评分进度条与关键词高亮
- **性能**：铃铛 `refresh()` 改为并行请求，避免被慢接口拖住
- **踩坑**：JSX 子表达式中的 `>`（如 `{arr.length > 0 && ...}`）会触发 TS1005，改用三元表达式
- **验证**：`tsc` + `vite build` 通过；CDP 实测铃铛“一键已读”点击后服务端 `未读=0`、UI 即时更新

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