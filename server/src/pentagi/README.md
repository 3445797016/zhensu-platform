# PentAGI 集成 · 后端模块

把 [PentAGI](https://github.com/vxcontrol/pentagi)（AI 自动化渗透测试引擎）以 **REST 适配层** 的方式接入 ops-hub。
本目录**自包含、可整体搬迁**，除下方「注册接线」外不侵入任何现有文件。

## 文件

| 文件 | 职责 |
|------|------|
| `config.ts` | 配置读写（存于 ops-hub JSON store 的 `pentagi` 命名空间）；Token / 口令用 `lib/secure` 的 AES-256-GCM 加密落盘 |
| `client.ts` | 零第三方依赖的 REST 客户端（`node:http/https`）；支持 API Token(Bearer) 与账号密码(Cookie) 两种认证；401 自动重登；`insecure` 放开自签证书 |
| `index.ts` | Fastify 路由注册；提供任务管理 + 详情聚合 + 靶机来源聚合 |

## 注册接线（搬迁时唯一需要改的地方）

`server/src/index.ts`：

```ts
// 顶部 import
import { register as pentagi } from './pentagi/index.js';

// 现有的模块注册数组中追加 pentagi
for (const m of [/* ... */, pentagi]) await app.register(m, { prefix: '/api' });
```

## REST 接口（挂载于 `/api/pentagi`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/state` | 读取配置状态（不含明文凭据） |
| POST | `/config` | 增量保存配置（敏感字段自动加密） |
| POST | `/test` | 连通性测试（可携带未保存的配置试连） |
| POST | `/login` | 账号模式下手动登录一次 |
| GET  | `/targets` | 靶机来源：纳管主机(`store:hosts`) + Docker 靶机（可选依赖 `routes/targets.js`） |
| GET  | `/flows` | 任务(flow)列表 |
| POST | `/flows` | 创建任务（`{input}` 或 `{target, requirement}`，后者自动生成标准提示词） |
| GET  | `/flows/:id` | 详情聚合：flow + tasks + subtasks + msglogs + termlogs + agentlogs |
| POST | `/flows/:id/stop` | 停止任务 |
| POST | `/flows/:id/input` | 追加指令 |
| DELETE | `/flows/:id` | 删除任务 |

## 配置项

| 字段 | 说明 |
|------|------|
| `enabled` | 是否启用（关闭仅前端隐藏） |
| `baseUrl` | PentAGI 地址，如 `https://192.168.147.129:8443` |
| `token` | API Token（Bearer），优先使用；PentAGI → Settings → PentAGI API 生成 |
| `email` / `password` | 备用认证（账号密码，登录后复用会话 Cookie） |
| `provider` | 默认 LLM Provider（`deepseek` / `openai` / …） |
| `insecure` | 是否接受自签证书（内网自签建议 `true`） |
| `timeout` | 请求超时（毫秒） |

## 对接约定

- PentAGI 登录：`POST /api/v1/auth/login`，体 `{ mail, password }`，返回 `Set-Cookie: auth=…`（`Path=/api/v1`）。
- 列表接口统一使用 `rdb.TableQuery`：`?page=1&pageSize=N&type=init`，数据在 `data.<resource>`。
- 创建任务：`POST /api/v1/flows/`，体 `{ input, provider }`。
- 状态变更：`PUT /api/v1/flows/:id`，体 `{ action: stop|finish|input|rename, … }`。

## 依赖

- `../lib/store.js`（JSON 存储）
- `../lib/secure.js`（AES-256-GCM 加解密）
- `../lib/audit.js`（操作审计）
- 可选：`../routes/targets.js`（Docker 靶机聚合，缺失时自动忽略）
