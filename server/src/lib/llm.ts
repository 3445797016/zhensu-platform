// 多厂商 LLM 客户端（OpenAI 兼容 /chat/completions，支持流式）。
// 自动读取 pi 已认证的 key 与真实模型目录(~/.pi/agent/models-store.json)，
// 页面可覆盖 baseURL / model / apiKey。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import https from 'node:https';

export interface Provider {
  id: string;
  name: string;
  baseURL: string;         // 形如 https://api.deepseek.com
  chatPath: string;        // 完整的 chat/completions 相对路径
  defaultModel: string;
  models: string[];        // 该提供商可选模型清单
  apiKey: string;
}

// 与 pi models-store 的键映射到本系统 provider id
const STORE_KEY: Record<string, { id: string; name: string }> = {
  deepseek: { id: 'deepseek', name: 'DeepSeek' },
  'kimi-coding': { id: 'kimi', name: 'Kimi Coding' },
  'zai-coding-cn': { id: 'zai', name: '智谱 GLM' },
};
// 无法从 store 拿到的兜底预置
const EXTRA: Array<Omit<Provider, 'apiKey'>> = [
  { id: 'openai', name: 'OpenAI', baseURL: 'https://api.openai.com', chatPath: '/v1/chat/completions', defaultModel: 'gpt-4o', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1'] },
  { id: 'ollama', name: 'Ollama(本地)', baseURL: 'http://localhost:11434', chatPath: '/v1/chat/completions', defaultModel: 'qwen3', models: ['qwen3', 'llama3', 'deepseek-r1'] },
];

type PiAuthEntry = string | { key?: string };

function piAuth(): Record<string, PiAuthEntry> {
  const candidates = [process.env.HOME && join(process.env.HOME, '.pi', 'agent', 'auth.json'), '/root/.pi/agent/auth.json'];
  for (const p of candidates) {
    if (p && existsSync(p)) { try { return JSON.parse(readFileSync(p, 'utf-8')); } catch {} }
  }
  return {};
}

function authKey(auth: Record<string, PiAuthEntry>, providerId: string): string {
  const entry = auth[providerId];
  return typeof entry === 'string' ? entry : entry?.key || '';
}
function piModelsStore(): any {
  const candidates = [process.env.HOME && join(process.env.HOME, '.pi', 'agent', 'models-store.json'), '/root/.pi/agent/models-store.json'];
  for (const p of candidates) if (p && existsSync(p)) { try { return JSON.parse(readFileSync(p, 'utf-8')); } catch {} }
  return null;
}
// 根据 baseURL 推断 OpenAI 兼容的 chat/completions 路径
function inferChatPath(base: string): string {
  const b = base.replace(/\/$/, '');
  if (b.endsWith('/v1') || /\/v1\/?$/.test(b)) return '/chat/completions';
  if (b.includes('/paas/v4') || b.endsWith('/coding')) return '/chat/completions';
  return '/v1/chat/completions';
}

export function defaultProviders(): Provider[] {
  const auth = piAuth();
  const store = piModelsStore();
  const list: Provider[] = [];
  if (store) {
    for (const [skey, info] of Object.entries(STORE_KEY)) {
      const s = store[skey];
      if (!s?.models?.length) continue;
      const models = s.models.map((m: any) => m.id);
      const baseURL = s.models[0].baseUrl || '';
      const key = authKey(auth, skey);
      const prefer = models.find((m: string) => /pro$/.test(m)) || models[models.length - 1] || models[0];
      list.push({ id: info.id, name: info.name, baseURL, chatPath: inferChatPath(baseURL), defaultModel: prefer, models, apiKey: key });
    }
  }
  for (const e of EXTRA) {
    if (list.some((x) => x.id === e.id)) continue;
    const mapped = STORE_KEY[e.id]; // openai/ollama 不在 store，直接用预置
    list.push({ ...e, apiKey: e.id === 'openai' ? authKey(auth, 'openai') : '' });
  }
  // deepseek：官方 API 可请求名为 deepseek-chat / deepseek-reasoner（store 里的 v4-* 为内部展示名）
  const ds = list.find((x) => x.id === 'deepseek');
  if (ds) { ds.defaultModel = 'deepseek-chat'; ds.models = ['deepseek-chat', 'deepseek-reasoner']; ds.chatPath = '/v1/chat/completions'; ds.baseURL = ds.baseURL || 'https://api.deepseek.com'; }
  // deepseek 等若 store 缺失则补默认
  if (!list.some((x) => x.id === 'deepseek')) {
    list.unshift({ id: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com', chatPath: '/v1/chat/completions', defaultModel: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'], apiKey: authKey(auth, 'deepseek') });
  }
  return list;
}

// 一次 POST 请求，返回响应对象（http/https 双支持，避开 undici 全局连接池问题）
function rawRequest(provider: Provider, body: string, signal?: AbortSignal): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const url = provider.baseURL.replace(/\/$/, '') + (provider.chatPath || inferChatPath(provider.baseURL));
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const headers: any = { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}`, 'Content-Length': Buffer.byteLength(body) };
    const req = mod.request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method: 'POST', headers,
    }, (res) => resolve(res));
    req.on('error', (e) => { if (signal?.aborted) reject(Object.assign(e, { code: 'ABORT_ERR' })); else reject(e); });
    if (signal) signal.addEventListener('abort', () => req.destroy(new Error('aborted')));
    req.write(body);
    req.end();
  });
}

// 从 SSE 响应流中提取 content（忽略 reasoning_content 与注释）
function readSSE(res: http.IncomingMessage, onDelta?: (s: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = ''; let full = '';
    res.on('error', reject);
    res.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        const l = line.trim();
        if (!l.startsWith('data:')) continue;
        const data = l.slice(5).trim();
        if (data === '[DONE]') continue;
        try { const j = JSON.parse(data); const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? ''; if (delta) { full += delta; onDelta?.(delta); } } catch {}
      }
    });
    res.on('end', () => { resolve(full); });
  });
}

function readAll(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => { let s = ''; res.on('error', reject); res.on('data', (c: Buffer) => (s += c.toString('utf8'))); res.on('end', () => resolve(s)); });
}

export async function chat(provider: Provider, messages: { role: string; content: string }[], opts: { stream?: boolean; onDelta?: (s: string) => void; signal?: AbortSignal; temperature?: number; maxTokens?: number } = {}): Promise<string> {
  const body = JSON.stringify({ model: provider.defaultModel, messages, stream: opts.stream ?? true, temperature: opts.temperature ?? 0.7, max_tokens: opts.maxTokens ?? 4096 });
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 700 * attempt));
    try {
      const res = await rawRequest(provider, body, opts.signal);
      const code = res.statusCode || 0;
      if (code >= 200 && code < 300) {
        return opts.stream ? await readSSE(res, opts.onDelta) : await readAll(res).then((t) => { try { return JSON.parse(t).choices?.[0]?.message?.content ?? ''; } catch { return t; } });
      }
      const t = await readAll(res);
      throw new Error(`LLM ${provider.name} 错误 ${code}: ${t.slice(0, 500)}`);
    } catch (e: any) {
      if (opts.signal?.aborted) throw e;
      if (/LLM .* 错误 [4]\d\d/.test(String(e?.message || ''))) throw e; // 配置/鉴权问题不重试
      lastErr = e;
    }
  }
  throw lastErr || new Error('连接失败');
}
