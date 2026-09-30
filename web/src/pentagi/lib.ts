// ═══════════════════════════════════════════════════════════════════════════
// PentAGI 集成 · 展示层工具（可迁移，纯函数、无依赖）
// ═══════════════════════════════════════════════════════════════════════════

/** 状态 → AntD Tag 颜色 */
export const STATUS_COLOR: Record<string, string> = {
  created: 'default',
  running: 'processing',
  waiting: 'warning',
  finished: 'success',
  failed: 'error',
  stopped: 'default',
};

/** 状态 → 中文文案 */
export const STATUS_TEXT: Record<string, string> = {
  created: '已创建',
  running: '运行中',
  waiting: '等待中',
  finished: '已完成',
  failed: '失败',
  stopped: '已停止',
};

export const statusColor = (s?: string) => STATUS_COLOR[s || ''] || 'default';
export const statusText = (s?: string) => STATUS_TEXT[s || ''] || s || '-';
/** 是否处于"进行中"（需要轮询） */
export const isActive = (s?: string) => s === 'running' || s === 'created' || s === 'waiting';

/** 消息类型 → 展示元信息（图标在组件内映射） */
export const MSG_TYPE: Record<string, { color: string; label: string }> = {
  thoughts: { color: 'purple', label: '思考' },
  terminal: { color: 'geekblue', label: '执行' },
  report: { color: 'green', label: '汇报' },
  done: { color: 'cyan', label: '完成' },
  file: { color: 'orange', label: '文件' },
  input: { color: 'default', label: '输入' },
};

const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const URL_RE = /https?:\/\/[^\s)'"，,]+/g;
const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;
const PORT_RE = /\b(\d{1,5})\/(tcp|udp)\b(?=[^\n]{0,12}\bopen\b)/gi;
const PORT_LINE_RE = /^\s*(\d{1,5}\/(?:tcp|udp))\s+open\b/gim;

/** 从任意文本里尽力提取目标（优先显式 Target:，其次 URL，最后 IPv4） */
export function extractTarget(...texts: (string | undefined | null)[]): string {
  const blob = texts.filter(Boolean).join('\n');
  const explicit = blob.match(/(?:Target|目标|host)\s*[:：]\s*([^\s,，)）]+)/i);
  if (explicit?.[1] && !/^\w+$/.test(explicit[1])) return explicit[1];
  const url = blob.match(URL_RE);
  if (url?.[0]) return url[0];
  const ip = blob.match(IP_RE);
  if (ip?.[0]) return ip[0];
  return '';
}

/** 提取端口列表（如 445/tcp） */
export function extractPorts(...texts: (string | undefined | null)[]): string[] {
  const blob = texts.filter(Boolean).join('\n');
  const set = new Set<string>();
  for (const m of blob.matchAll(PORT_LINE_RE)) set.add(m[1].toLowerCase());
  for (const m of blob.matchAll(PORT_RE)) set.add(`${m[1]}/${m[2].toLowerCase()}`);
  return [...set].sort((a, b) => parseInt(a) - parseInt(b));
}

/** 已知 CVE 的友好名与危险级别 */
export const CVE_META: Record<string, { name: string; severity: 'critical' | 'high' | 'medium' }> = {
  'CVE-2017-0143': { name: 'MS17-010 EternalBlue', severity: 'critical' },
  'CVE-2017-0144': { name: 'MS17-010 EternalBlue', severity: 'critical' },
  'CVE-2017-0145': { name: 'MS17-010 EternalBlue', severity: 'critical' },
  'CVE-2017-0146': { name: 'MS17-010 EternalBlue', severity: 'critical' },
  'CVE-2017-0147': { name: 'MS17-010 EternalBlue', severity: 'critical' },
  'CVE-2017-0148': { name: 'MS17-010 EternalBlue', severity: 'critical' },
  'CVE-2019-0708': { name: 'BlueKeep (RDP)', severity: 'critical' },
  'CVE-2020-0796': { name: 'SMBGhost (SMBv3)', severity: 'critical' },
  'CVE-2014-6271': { name: 'Shellshock', severity: 'high' },
  'CVE-2021-44228': { name: 'Log4Shell', severity: 'critical' },
  'CVE-2017-5638': { name: 'Struts2 S2-045', severity: 'high' },
};

export const cveMeta = (cve: string) => CVE_META[cve.toUpperCase()] || { name: '待确认漏洞', severity: 'high' as const };

/** 提取去重后的 CVE 列表 */
export function extractCVEs(...texts: (string | undefined | null)[]): string[] {
  const blob = texts.filter(Boolean).join('\n');
  const set = new Set<string>();
  for (const m of blob.matchAll(CVE_RE)) set.add(m[0].toUpperCase());
  return [...set];
}

/** 毫秒/时间戳 → 可读时长 */
export function formatDuration(start?: string, end?: string): string {
  if (!start) return '-';
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  if (isNaN(a) || isNaN(b) || b < a) return '-';
  let s = Math.floor((b - a) / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  if (d) return `${d}天${h}小时`;
  if (h) return `${h}小时${m}分`;
  if (m) return `${m}分${s}秒`;
  return `${s}秒`;
}

/** 相对时间（刚刚 / x分钟前 / x小时前 / 日期） */
export function relTime(t?: string): string {
  if (!t) return '-';
  const ts = new Date(t).getTime();
  if (isNaN(ts)) return '-';
  const diff = Date.now() - ts;
  if (diff < 0) return '刚刚';
  const s = Math.floor(diff / 1000);
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}天前`;
  return new Date(t).toLocaleDateString('zh-CN');
}

export function fmtTime(t?: string): string {
  if (!t) return '-';
  const d = new Date(t);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString('zh-CN', { hour12: false });
}

/** 从任务输入里解析靶机画像 */
export interface HostFacts { target?: string; hostname?: string; os?: string; workgroup?: string; services?: string; }
export function parseHostFacts(input?: string): HostFacts {
  if (!input) return {};
  const facts: HostFacts = {};
  facts.target = extractTarget(input) || undefined;
  const hn = input.match(/hostname\s+([\w.-]+)/i);
  if (hn) facts.hostname = hn[1];
  const os = input.match(/\b((?:Windows|Linux|Ubuntu|CentOS|Debian|macOS)[^\n,，)）]{0,40})/i);
  if (os) facts.os = os[1].trim().replace(/\s+/g, ' ');
  const wg = input.match(/workgroup\s+([\w.-]+)/i);
  if (wg) facts.workgroup = wg[1];
  const svc = input.match(/known open services\s*[:：]\s*([^\n]+)/i) || input.match(/open services?\s*[:：]\s*([^\n]+)/i);
  if (svc) facts.services = svc[1].trim();
  return facts;
}

/** 子任务完成进度 */
export function subtaskProgress(subtasks: any[]): { total: number; done: number; percent: number } {
  const total = subtasks?.length || 0;
  const done = (subtasks || []).filter((s) => s.status === 'finished').length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}
