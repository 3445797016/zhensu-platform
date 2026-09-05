# 轸宿智汇平台 · 架构差距分析与演进路线

> 目的:对照主流主机管理面板(宝塔等,闭源商业软件)的**架构思路与功能设计**,
> 规划本平台(原创 MIT 开源)的架构优化与功能补齐。
> 合规声明:本文只参考外部产品的**思路/模式**,所有落地实现均为本项目原创代码,不复刻任何闭源源码。

## 1. 现状架构(已具备)

```
浏览器 SPA(React18 + AntD5 + Vite)
        │ REST / SSE / WebSocket
Fastify 单进程(:7799) ── 注册各业务路由(routes/*.ts)
   ├─ lib/: llm(多厂商) · host(exec/ssh2) · code(在线运行器,可执行临时目录) · store(JSON 存储)
   ├─ modules/: tools(中间件注册+一键 Docker) · kb(本地 RAG 倒排索引)
   ├─ problems/: 题库静态资源(可扩展)
   └─ data/: 运行时 JSON/缓存(已 .gitignore)
开机自启:opshub.service + k3s.service
```

优势:零数据库部署、单文件进程、SSH/exec 双执行器统一(`lib/host.ts`)、静态资源化扩展(problems)、AI+RAG 一体化。
短板:单用户无鉴权;写操作无审计;无通用任务中心(监控调度为特例);能力分散在各 route 里。

## 2. 差距矩阵

| 能力 | 状态 | 价值 | 计划 |
|---|---|---|---|
| 多主机管理 + WebSocket 终端 | ✅ | - | 迭代优化 |
| Docker / K8s 管理 | ✅ | - | 迭代 |
| 中间件一键部署(30+) | ✅ | - | 迭代 |
| Linux 运维抽屉(systemd/进程/cron/端口) | ✅ | - | - |
| 监控告警 + 主机指标可视化 | ✅ | - | 指标历史化 |
| AI 智能运维 + RAG + 在线编程/题库 | ✅ | - | - |
| 网络安全工具箱(本机工具 API 化) | ✅ | - | 沙箱化 |
| 文件管理器(浏览/编辑/上传/下载/打包) | ❌ | ★★★ | P0 |
| 全站操作审计 | ❌ | ★★★ | P0 |
| 集中任务中心(后台长任务/计划任务/历史) | ◐ | ★★★ | P0 |
| 网站管理(nginx vhost/反代/伪静态) | ❌ | ★★★ | P1 |
| SSL 证书(Let's Encrypt/自签) | ❌ | ★★ | P1 |
| 防火墙规则操作页 | ◐(只读巡检) | ★★ | P2 |
| 备份/恢复中心 | ❌ | ★★ | P2 |
| 访问日志统计(topIP/URL/UA) | ❌ | ★ | P2 |
| 开放 API + 密钥管理 | ❌ | ★★ | P2 |
| 登录/多用户/二次验证/防爆破 | ❌ | ★★★ | P3 |

## 3. 架构优化点

1. **统一任务层 `modules/tasks.ts`(原创)**
   - 任务模型:id/type/target/status(running|ok|fail|cancel)/log[]/created/finished
   - 统一 `runTask(type, fn)` 注册式:监控采集、tools 部署、sec 扫描、备份等全部走任务层
   - 页面:任务中心看实时进度/日志/重跑;状态落盘 `data/tasks.json`
2. **审计层 `lib/audit.ts`(原创)**
   - `audit(action, target, detail, user='web')` 落盘 `data/audit.json`(环形 2000 条)
   - 所有 route 写操作接入;页面「操作日志」可检索导出
3. **能力扩展目录化**
   - 已有先例:problems/(题库)、module tools(工具模板)
   - 新增能力(文件/网站/备份)各自 = routes + modules + 前端页,数据/模板独立,便于单模块随仓库演进
4. **配置集中化**
   - `DATA_DIR`/`KB_PATH`/`OPSHUB_TMP` 环境变量化(迁移友好、不写死绝对路径)
5. **鉴权预留(下一阶段)**
   - 单用户口令 + 会话 cookie;危险接口二次确认(sec/运维已带 ack 模式可复用)

## 4. 落地批次

- P0:文件管理器、操作审计、任务中心
- P1:网站管理(nginx vhost/反代)、SSL 证书
- P2:防火墙操作页、备份中心、日志统计、开放 API
- P3:登录/多用户/二次验证

> 每一批都遵循:后端路由/模块 → 前端页面 → 构建重启 → 提交 Git。
