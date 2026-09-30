# PentAGI 集成 · 前端模块

PentAGI 的运维平台前端界面，**自包含、可整体搬迁**。复用 ops-hub 的 axios 实例（`../api`）与 AntD 风格。

## 文件

| 文件 | 职责 |
|------|------|
| `api.ts` | 接口封装（`pentagiApi`）、Provider 常量、`stripAnsi()` 终端输出清洗 |
| `lib.ts` | 展示层纯函数：状态映射、目标/端口/CVE 提取、CVE 名称与危害级别、时长/相对时间格式化、靶机画像解析、子任务进度 |
| `PentagiPage.tsx` | 主页面：Hero 横幅、概览统计、状态筛选 + 搜索、增强任务列表、连接配置弹窗、新建任务弹窗 |
| `MissionDrawer.tsx` | 任务控制台抽屉：总览(风险发现/靶机画像/阶段报告)、执行时间线、子任务、Agent 协作、终端控制台、原始数据 |
| `pentagi.css` | 页面样式：Hero 渐变、统计卡、状态脉冲圆点、终端控制台、风险发现卡、时间线 |

> 依赖 `../components/Markdown`（Markdown 渲染）、`react-router-dom`（深链接参数）。

## 注册接线（搬迁时唯一需要改的地方）

`web/src/App.tsx`：

```tsx
// 顶部 import
import PentagiPage from './pentagi/PentagiPage';

// 侧边菜单项
{ key: '/pentagi', icon: <ThunderboltOutlined />, label: 'AI 渗透 (PentAGI)' },

// 路由
<Route path="/pentagi" element={<PentagiPage />} />
```

## 深链接

| URL | 效果 |
|-----|------|
| `/pentagi` | 任务列表 |
| `/pentagi?flow=<id>` | 直接打开该任务的「任务控制台」 |
| `/pentagi?flow=<id>&tab=<key>` | 直接定位到指定标签页 |

`tab` 取值：`overview` | `timeline` | `subtasks` | `agents` | `console` | `raw`。

## 功能亮点

- **风险发现**：自动从任务输入、子任务结果、消息、Agent 日志、终端输出中提取 CVE，匹配已知漏洞名（MS17-010 / BlueKeep / SMBGhost …）与危害级别，并标注「已验证可利用」，附带证据片段。
- **靶机画像**：从任务提示词解析主机名、操作系统、域/工作组、开放端口。
- **执行时间线**：按类型（思考/执行/汇报/完成/文件/输入）区分颜色的可视化流水，思考过程与结果可展开。
- **终端控制台**：仿终端外观，支持 stdout/stderr/stdin 过滤、自动滚动、复制、下载日志。
- **阶段报告**：以 Markdown 渲染 Agent 的阶段汇报，可逐条展开。

## 说明

- 后端未配置连接信息时，页面顶部会提示并自动弹出「连接配置」。
- 有进行中的任务或详情打开时每 5 秒轮询；关闭抽屉即停止。
- 终端日志经 `stripAnsi()` 去除 ANSI 转义与回车符后再展示。
