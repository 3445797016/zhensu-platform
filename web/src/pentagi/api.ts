// ═══════════════════════════════════════════════════════════════════════════
// PentAGI 集成 · 前端 API 封装（可迁移）
// 复用 ops-hub 的 web/src/api.ts（axios 实例，baseURL=/api）
// ═══════════════════════════════════════════════════════════════════════════
import { api } from '../api';

export const pentagiApi = {
  /** 读取配置状态（不含明文凭据） */
  state: () => api.get('/pentagi/state'),
  /** 保存配置（增量） */
  saveConfig: (body: any) => api.post('/pentagi/config', body),
  /** 连通性测试（可携带未保存的配置） */
  test: (body?: any) => api.post('/pentagi/test', body || {}),
  /** 靶机来源（纳管主机 + Docker 靶机） */
  targets: () => api.get('/pentagi/targets'),

  flows: () => api.get('/pentagi/flows'),
  create: (body: { input?: string; target?: string; requirement?: string; provider?: string }) => api.post('/pentagi/flows', body),
  detail: (id: number | string) => api.get(`/pentagi/flows/${id}`),
  stop: (id: number | string) => api.post(`/pentagi/flows/${id}/stop`),
  input: (id: number | string, input: string) => api.post(`/pentagi/flows/${id}/input`, { input }),
  remove: (id: number | string) => api.del(`/pentagi/flows/${id}`),
};

export const PROVIDERS = ['deepseek', 'openai', 'anthropic', 'gemini', 'bedrock', 'ollama', 'glm', 'kimi', 'qwen', 'minimax', 'custom'];

/** 去除终端输出里的 ANSI 转义序列 */
export function stripAnsi(s: string): string {
  return String(s || '').replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '');
}
