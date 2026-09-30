// ═══════════════════════════════════════════════════════════════════════════
// PentAGI 集成 · REST 客户端（可迁移，零第三方依赖）
// ---------------------------------------------------------------------------
// 基于 node:http / node:https 直接请求 PentAGI 的 REST API（/api/v1/*）。
//  - 认证：优先 API Token（Authorization: Bearer），否则账号密码登录并复用会话 Cookie
//  - 自签名证书：配置 insecure=true 时放开校验
//  - 401 自动重新登录一次
// 依赖：./config.js（同级，可整体搬迁）
// ═══════════════════════════════════════════════════════════════════════════
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { URL } from 'node:url';
import type { IncomingHttpHeaders } from 'node:http';
import { getConfig } from './config.js';

interface RawResponse { status: number; headers: IncomingHttpHeaders; text: string; }

let sessionCookie = ''; // 账号登录后缓存的会话 Cookie

function doRequest(
  method: string, urlStr: string, body?: any,
  headers: Record<string, string> = {}, timeout = 120000,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const cfg = getConfig();
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const opt: any = {
      method,
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      headers: { Accept: 'application/json', ...headers },
      timeout,
    };
    if (payload) {
      opt.headers['Content-Type'] = 'application/json';
      opt.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (isHttps && cfg.insecure) opt.rejectUnauthorized = false;

    const req = (isHttps ? httpsRequest : httpRequest)(opt, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('timeout', () => req.destroy(new Error(`PentAGI 请求超时（${timeout}ms）`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** 账号密码登录，缓存会话 Cookie */
export async function login(force = false): Promise<string> {
  const cfg = getConfig();
  if (sessionCookie && !force) return sessionCookie;
  if (!cfg.email || !cfg.password) throw new Error('未配置 PentAGI API Token，且缺少账号/口令');
  const r = await doRequest('POST', `${cfg.baseUrl}/api/v1/auth/login`, { mail: cfg.email, password: cfg.password }, {}, cfg.timeout);
  if (r.status !== 200) throw new Error(`PentAGI 登录失败（HTTP ${r.status}）：${r.text.slice(0, 200)}`);
  const sc = r.headers['set-cookie'];
  sessionCookie = Array.isArray(sc)
    ? sc.map((c) => String(c).split(';')[0]).join('; ')
    : String(sc || '').split(';')[0];
  if (!sessionCookie) throw new Error('PentAGI 登录成功但未返回会话 Cookie');
  return sessionCookie;
}

async function authHeaders(): Promise<Record<string, string>> {
  const cfg = getConfig();
  if (cfg.token) return { Authorization: `Bearer ${cfg.token}` };
  if (cfg.email && cfg.password) return { Cookie: await login() };
  throw new Error('PentAGI 未配置认证信息（API Token 或账号口令）');
}

function qs(query?: Record<string, any>): string {
  if (!query) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** 通用请求（自动认证 + 401 重登 + 统一解包错误） */
export async function request<T = any>(
  method: string, path: string, body?: any, query?: Record<string, any>,
): Promise<T> {
  const cfg = getConfig();
  if (!cfg.baseUrl) throw new Error('未配置 PentAGI 服务地址');
  const url = `${cfg.baseUrl}/api/v1${path}${qs(query)}`;

  let r = await doRequest(method, url, body, await authHeaders(), cfg.timeout);
  if (r.status === 401 && !cfg.token && cfg.email) {
    sessionCookie = '';
    await login(true);
    r = await doRequest(method, url, body, await authHeaders(), cfg.timeout);
  }

  let json: any = null;
  try { json = r.text ? JSON.parse(r.text) : null; } catch { /* 非 JSON */ }
  if (r.status < 200 || r.status >= 300) {
    throw new Error(json?.msg || json?.error || `PentAGI HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  }
  return json;
}

// PentAGI 列表接口统一使用 rdb.TableQuery：page/pageSize/type
const page = (size: number) => ({ page: 1, pageSize: size, type: 'init' });

/** PentAGI 常用接口封装 */
export const Pentagi = {
  /** 连通性测试：拉取 1 条 flow */
  async test() {
    const r: any = await request('GET', '/flows/', undefined, page(1));
    return { ok: true, total: r?.data?.total ?? 0 };
  },
  async listFlows() {
    const r: any = await request('GET', '/flows/', undefined, page(200));
    return (r?.data?.flows || []) as any[];
  },
  async getFlow(id: number | string) {
    const r: any = await request('GET', `/flows/${id}`);
    return r?.data as any;
  },
  async createFlow(input: string, provider: string) {
    const r: any = await request('POST', '/flows/', { input, provider });
    return r?.data as any;
  },
  /** action: stop | finish | input | rename */
  async patchFlow(id: number | string, action: string, extra: Record<string, any> = {}) {
    const r: any = await request('PUT', `/flows/${id}`, { action, ...extra });
    return r?.data ?? r;
  },
  async deleteFlow(id: number | string) {
    return request('DELETE', `/flows/${id}`);
  },
  async tasks(id: number | string) {
    const r: any = await request('GET', `/flows/${id}/tasks/`, undefined, page(200));
    return (r?.data?.tasks || []) as any[];
  },
  async subtasks(id: number | string) {
    const r: any = await request('GET', `/flows/${id}/subtasks/`, undefined, page(500));
    return (r?.data?.subtasks || []) as any[];
  },
  async msglogs(id: number | string) {
    const r: any = await request('GET', `/flows/${id}/msglogs/`, undefined, page(500));
    return (r?.data?.msglogs || []) as any[];
  },
  async termlogs(id: number | string) {
    const r: any = await request('GET', `/flows/${id}/termlogs/`, undefined, page(500));
    return (r?.data?.termlogs || []) as any[];
  },
  async agentlogs(id: number | string) {
    const r: any = await request('GET', `/flows/${id}/agentlogs/`, undefined, page(500));
    return (r?.data?.agentlogs || []) as any[];
  },
};

/** 清空内存中缓存的登录会话（改配置后调用） */
export function resetSession() { sessionCookie = ''; }
