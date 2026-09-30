// ═══════════════════════════════════════════════════════════════════════════
// PentAGI 集成 · 配置层（可迁移）
// ---------------------------------------------------------------------------
// 配置统一存于 ops-hub 的 JSON store（命名空间 `pentagi`），敏感字段
// （API Token / 账号口令）用 lib/secure 的 AES-256-GCM 加密后落盘。
// 本文件不依赖其它业务模块，可随 pentagi/ 目录整体搬迁。
// ═══════════════════════════════════════════════════════════════════════════
import { store } from '../lib/store.js';
import { enc, dec } from '../lib/secure.js';

export interface PentagiConfig {
  /** 是否启用该集成（关闭后仅前端隐藏，接口仍可用） */
  enabled: boolean;
  /** PentAGI 服务地址，如 https://192.168.147.129:8443 */
  baseUrl: string;
  /** API Token（Bearer），优先使用；在 PentAGI → Settings → PentAGI API 生成 */
  token: string;
  /** 备用认证：PentAGI 账号邮箱 */
  email: string;
  /** 备用认证：PentAGI 账号口令（加密存储） */
  password: string;
  /** 默认 LLM Provider（deepseek / openai / anthropic / ollama ...） */
  provider: string;
  /** 是否接受自签名证书（PentAGI 默认自签，内网建议 true） */
  insecure: boolean;
  /** 请求超时（毫秒） */
  timeout: number;
}

const NS = 'pentagi';

const DEFAULTS: PentagiConfig = {
  enabled: false,
  baseUrl: '',
  token: '',
  email: '',
  password: '',
  provider: 'deepseek',
  insecure: true,
  timeout: 120000,
};

/** 读取完整配置（敏感字段已解密） */
export function getConfig(): PentagiConfig {
  const raw = store.read<Record<string, any>>(NS, {});
  return {
    ...DEFAULTS,
    ...raw,
    enabled: raw.enabled ?? DEFAULTS.enabled,
    provider: raw.provider || DEFAULTS.provider,
    insecure: raw.insecure ?? DEFAULTS.insecure,
    timeout: Number(raw.timeout) > 0 ? Number(raw.timeout) : DEFAULTS.timeout,
    // 敏感字段解密（兼容明文旧数据）
    token: dec(raw.token),
    password: dec(raw.password),
  };
}

/** 保存部分配置，返回保存后的完整配置 */
export function saveConfig(patch: Partial<PentagiConfig>): PentagiConfig {
  const cur = store.read<Record<string, any>>(NS, {});
  const next: Record<string, any> = { ...cur };

  if (patch.enabled !== undefined) next.enabled = !!patch.enabled;
  if (patch.baseUrl !== undefined) next.baseUrl = String(patch.baseUrl || '').trim().replace(/\/+$/, '');
  if (patch.provider !== undefined) next.provider = String(patch.provider || 'deepseek').trim() || 'deepseek';
  if (patch.insecure !== undefined) next.insecure = !!patch.insecure;
  if (patch.timeout !== undefined) next.timeout = Number(patch.timeout) || DEFAULTS.timeout;
  if (patch.email !== undefined) next.email = String(patch.email || '').trim();
  if (patch.token !== undefined) next.token = patch.token ? enc(String(patch.token).trim()) : '';
  // 口令传空字符串表示“清空”，传 undefined 表示“不改动”
  if (patch.password !== undefined) next.password = patch.password ? enc(String(patch.password)) : '';

  store.write(NS, next);
  return getConfig();
}

/** 前端可见的安全状态（绝不返回明文凭据） */
export function publicState() {
  const c = getConfig();
  return {
    enabled: c.enabled,
    baseUrl: c.baseUrl,
    provider: c.provider,
    insecure: c.insecure,
    timeout: c.timeout,
    email: c.email,
    auth: c.token ? 'token' : c.email ? 'account' : 'none',
    hasToken: !!c.token,
    hasPassword: !!c.password,
  };
}
