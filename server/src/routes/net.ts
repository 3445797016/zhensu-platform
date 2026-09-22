// 网络工具箱 v2 — DNS / 连通性 / 路由 / HTTP 调试 / 安全证书 / 子网工具
// 设计要点:
//   1) 全部通过 spawnSync(argv 数组) 执行, 不拼接 shell 字符串 → 杜绝命令注入
//   2) 结果结构化返回(records/stats/hops/headers/cert...), 前端可直接渲染图表
//   3) 通过 /net/capabilities 上报本机可用二进制, 缺失时给出友好降级/提示
import { spawnSync } from 'node:child_process';
import { networkInterfaces, hostname, tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import type { FastifyInstance } from 'fastify';

/* ─────────────────────────── 二进制探测 ─────────────────────────── */
const BINS = ['dig', 'nslookup', 'host', 'traceroute', 'ping', 'mtr', 'whois', 'curl', 'openssl', 'nmap', 'nc', 'ip'];

function which(bin: string): string | null {
  const dirs = (process.env.PATH || '').split(':').filter(Boolean);
  for (const d of dirs) {
    const f = join(d, bin);
    try { accessSync(f, constants.X_OK); return f; } catch { /* continue */ }
  }
  return null;
}
let _caps: Record<string, string | null> | null = null;
function caps(): Record<string, string | null> {
  if (!_caps) { _caps = {}; for (const b of BINS) _caps[b] = which(b); }
  return _caps;
}
function has(bin: string) { return !!caps()[bin]; }
function needBin(bin: string) { if (!has(bin)) throw new Error(`本机未安装「${bin}」, 请先 apt install ${bin}`); }

/* ─────────────────────────── 命令执行 ─────────────────────────── */
interface RunRes { ok: boolean; code: number | null; stdout: string; stderr: string; output: string; ms: number; timedOut: boolean; }

function run(bin: string, args: string[], timeoutSec = 20, input?: string): RunRes {
  const t0 = Date.now();
  const r = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    maxBuffer: 16 * 1024 * 1024,
    input: input ?? undefined,
  });
  const ms = Date.now() - t0;
  const stdout = (r.stdout as string) || '';
  const stderr = (r.stderr as string) || '';
  const errCode = (r.error as any)?.code;
  const timedOut = errCode === 'ETIMEDOUT' || r.signal === 'SIGTERM';
  let output = [stdout, stderr].filter(Boolean).join(stdout && stderr ? '\n' : '').trim();
  if (timedOut) output = (output ? output + '\n' : '') + `[命令超时 ${timeoutSec}s]`;
  if (!output && r.error) output = String((r.error as any).message || r.error);
  return { ok: r.status === 0 && !timedOut, code: r.status, stdout, stderr, output, ms, timedOut };
}

/* ─────────────────────────── 输入校验 ─────────────────────────── */
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:.]+$/;
const isIPv4 = (s: string) => IPV4.test(s);
const isIP = (s: string) => isIPv4(s) || (s.includes(':') && IPV6.test(s));
const HOSTNAME_RE = /^(?=.{1,253}$)([a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?\.)*[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?\.?$/;

function target(s: any, label = '目标'): string {
  const v = String(s ?? '').trim();
  if (!v) throw new Error(`缺少${label}`);
  if (v.startsWith('-')) throw new Error(`非法${label}`);
  if (v.length > 253) throw new Error(`${label}过长`);
  if (!isIP(v) && !HOSTNAME_RE.test(v)) throw new Error(`非法${label}: ${v}`);
  return v;
}
function portNo(s: any, label = '端口'): number {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`非法${label} (1-65535)`);
  return n;
}
function safeUrl(s: any): string {
  const v = String(s ?? '').trim();
  if (!v) throw new Error('缺少 URL');
  let u: URL;
  try { u = new URL(v); } catch { throw new Error('URL 格式错误, 需以 http:// 或 https:// 开头'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('仅支持 http / https');
  return u.toString();
}
function clamp(n: any, lo: number, hi: number, def: number) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.trunc(x))) : def;
}
const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'SRV', 'CAA', 'PTR', 'ANY'];
function dnsType(t: any): string {
  const v = String(t ?? 'A').toUpperCase();
  return DNS_TYPES.includes(v) ? v : 'A';
}

/* ─────────────────────────── 解析器 ─────────────────────────── */
interface DnsRecord { name: string; ttl: number | null; type: string; value: string; }
function parseDig(stdout: string): DnsRecord[] {
  const out: DnsRecord[] = [];
  for (const line of stdout.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith(';')) continue;
    const parts = t.split(/\s+/);
    const i = parts.indexOf('IN');
    if (i < 2) continue;
    const type = parts[i + 1];
    if (!type) continue;
    const ttl = Number(parts[i - 1]);
    out.push({ name: parts.slice(0, i - 1).join(' '), ttl: Number.isFinite(ttl) ? ttl : null, type, value: parts.slice(i + 2).join(' ') });
  }
  return out;
}
function groupRecords(records: DnsRecord[]) {
  const g: Record<string, DnsRecord[]> = {};
  for (const r of records) (g[r.type] ||= []).push(r);
  return g;
}

interface PingStat { times: number[]; loss: number | null; min: number | null; avg: number | null; max: number | null; mdev: number | null; transmitted: number | null; received: number | null; }
function parsePing(out: string): PingStat {
  const times = [...out.matchAll(/time[=<]\s*([\d.]+)\s*ms/gi)].map((m) => Number(m[1]));
  const loss = out.match(/([\d.]+)%\s*packet loss/i);
  const st = out.match(/rtt min\/avg\/max\/(?:mdev|stddev)\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/i);
  const tx = out.match(/(\d+)\s+packets transmitted/i);
  const rx = out.match(/(\d+)\s+(?:packets\s+)?received/i);
  const num = (v?: string) => (v != null && v !== '' ? Number(v) : null);
  return {
    times, loss: loss ? Number(loss[1]) : null,
    min: st ? Number(st[1]) : null, avg: st ? Number(st[2]) : null, max: st ? Number(st[3]) : null, mdev: st ? Number(st[4]) : null,
    transmitted: tx ? Number(tx[1]) : null, received: rx ? Number(rx[1]) : null,
  };
}

interface Hop { hop: number; host: string | null; rtts: number[]; avg: number | null; timeout: boolean; loss?: number | null; best?: number | null; worst?: number | null; stdev?: number | null; sent?: number | null; }
function parseTraceroute(out: string): Hop[] {
  const hops: Hop[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!m) continue;
    const hop = Number(m[1]);
    let rest = m[2];
    const rtts = [...rest.matchAll(/([\d.]+)\s*ms/g)].map((x) => Number(x[1]));
    const hostM = rest.match(/^\s*([^\s(]+)(?:\s*\(([^)]+)\))?/);
    const host = /^\s*\*/.test(rest) ? null : (hostM ? (hostM[2] || hostM[1]) : null);
    const clean = rest.replace(/[\d.]+\s*ms/g, '').trim();
    const timeout = rtts.length === 0 && /^\*/.test(clean || '*');
    hops.push({ hop, host, rtts, avg: rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : null, timeout });
  }
  return hops;
}
function parseMtr(out: string): Hop[] {
  const hops: Hop[] = [];
  const num = (v: string) => (v.startsWith('--') ? null : Number(v));
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\.\|--\s+(\S+)\s+([\d.]+)%\s+(\d+)\s+([\d.]+|--+)\s+([\d.]+|--+)\s+([\d.]+|--+)\s+([\d.]+|--+)\s+([\d.]+|--+)/);
    if (!m) continue;
    hops.push({
      hop: Number(m[1]), host: m[2], loss: Number(m[3]), sent: Number(m[4]),
      last: undefined as any, avg: num(m[6]), best: num(m[7]), worst: num(m[8]), stdev: num(m[9]),
      rtts: num(m[6]) != null ? [num(m[6]) as number] : [], timeout: num(m[6]) == null,
      // 兼容 Hop 字段
    } as any);
    (hops[hops.length - 1] as any).last = num(m[5]) ?? null;
  }
  return hops;
}

function parseWhois(out: string) {
  const get = (re: RegExp) => { const m = out.match(re); return m ? m[1].trim() : null; };
  const nameServers = [...out.matchAll(/Name Server:\s*(\S+)/gi)].map((m) => m[1].toLowerCase());
  return {
    fields: {
      registrar: get(/^\s*Registrar:\s*(.+)$/im),
      registrarUrl: get(/Registrar URL:\s*(\S+)/i),
      created: get(/Creation Date:\s*(.+)$/im),
      updated: get(/Updated Date:\s*(.+)$/im),
      expires: get(/Registry Expiry Date:\s*(.+)$/im) || get(/Expiry Date:\s*(.+)$/im),
      status: get(/Domain Status:\s*(\S+)/i),
      org: get(/Registrant Organization:\s*(.+)$/im),
      country: get(/Registrant Country:\s*(.+)$/im),
      netRange: get(/NetRange:\s*(.+)$/im),
      cidr: get(/CIDR:\s*(.+)$/im),
    },
    nameServers: [...new Set(nameServers)],
  };
}

/* HTTP 响应头(含重定向链) */
function parseHttpHeaders(raw: string) {
  const blocks = raw.replace(/\r/g, '').split(/\n\n+/);
  const chain: any[] = [];
  let headers: Record<string, string> = {};
  let status: any = null;
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length || !/^HTTP\//i.test(lines[0])) continue;
    const sm = lines[0].match(/^HTTP\/([\d.]+)\s+(\d+)\s*(.*)$/i);
    const hs: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const i = line.indexOf(':');
      if (i > 0) { const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).trim(); hs[k] = hs[k] ? `${hs[k]}, ${v}` : v; }
    }
    const item = { version: sm?.[1] ?? null, code: sm ? Number(sm[2]) : null, reason: sm?.[3] ?? '', location: hs['location'] ?? null, headers: hs };
    chain.push(item);
    headers = hs; status = { version: item.version, code: item.code, reason: item.reason };
  }
  return { chain, headers, status };
}

/* ─────────────────────────── TCP 探测(纯 Node) ─────────────────────────── */
function tcpProbe(host: string, prt: number, timeoutMs = 2000): Promise<{ ok: boolean; ms: number; error?: string }> {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const sock = new net.Socket();
    let done = false;
    const finish = (ok: boolean, error?: string) => {
      if (done) return; done = true;
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      try { sock.destroy(); } catch { /* ignore */ }
      resolve({ ok, ms: Math.round(ms * 1000) / 1000, error });
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false, '超时'));
    sock.once('error', (e: any) => finish(false, e?.code || String(e)));
    try { sock.connect(prt, host); } catch (e: any) { finish(false, String(e?.message || e)); }
  });
}

const SERVICE: Record<number, string> = {
  21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns', 80: 'http', 110: 'pop3', 111: 'rpcbind', 135: 'msrpc',
  139: 'netbios', 143: 'imap', 161: 'snmp', 389: 'ldap', 443: 'https', 445: 'smb', 465: 'smtps', 514: 'syslog',
  587: 'submission', 631: 'ipp', 873: 'rsync', 993: 'imaps', 995: 'pop3s', 1080: 'socks', 1433: 'mssql',
  1521: 'oracle', 1723: 'pptp', 2049: 'nfs', 2181: 'zookeeper', 2375: 'docker', 2376: 'docker-tls', 3000: 'grafana',
  3128: 'squid', 3306: 'mysql', 3389: 'rdp', 4444: 'metasploit', 5000: 'upnp', 5432: 'postgres', 5601: 'kibana',
  5672: 'rabbitmq', 5900: 'vnc', 5984: 'couchdb', 6379: 'redis', 6443: 'k8s-api', 7001: 'weblogic', 8000: 'http-alt',
  8008: 'http-alt', 8080: 'http-proxy', 8081: 'http-alt', 8443: 'https-alt', 8888: 'http-alt', 9000: 'php-fpm',
  9090: 'prometheus', 9200: 'elasticsearch', 9300: 'es-transport', 10000: 'webmin', 11211: 'memcached',
  15672: 'rabbitmq-mgmt', 27017: 'mongodb',
};
const COMMON_PORTS = Object.keys(SERVICE).map(Number);

function parsePortList(s: string): number[] {
  const out: number[] = []; const set = new Set<number>();
  for (const part of s.split(',')) {
    const p = part.trim(); if (!p) continue;
    const r = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (r) {
      let a = Number(r[1]); let b = Number(r[2]); if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) { if (i >= 1 && i <= 65535 && !set.has(i)) { set.add(i); out.push(i); } if (out.length >= 20000) return out; }
    } else {
      const n = Number(p);
      if (Number.isInteger(n) && n >= 1 && n <= 65535 && !set.has(n)) { set.add(n); out.push(n); }
    }
  }
  return out.sort((x, y) => x - y);
}
async function scanPorts(host: string, ports: number[], timeoutMs: number, concurrency = 200) {
  const open: any[] = []; let idx = 0;
  async function worker() {
    while (idx < ports.length) {
      const p = ports[idx++];
      const r = await tcpProbe(host, p, timeoutMs);
      if (r.ok) open.push({ port: p, proto: 'tcp', service: SERVICE[p] || '', version: '', ms: r.ms });
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, ports.length)) }, () => worker()));
  return open.sort((a, b) => a.port - b.port);
}

/* ─────────────────────────── 统一异常 → JSON ─────────────────────────── */
const guard = (fn: (req: any, reply: any) => any) => async (req: any, reply: any) => {
  try { return await fn(req, reply); }
  catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
};

/* ─────────────────────────── 路由注册 ─────────────────────────── */
export async function register(fastify: FastifyInstance) {

  // 能力探测: 前端据此禁用未安装的工具
  fastify.get('/net/capabilities', guard(async () => {
    const tools: Record<string, boolean> = {};
    for (const b of BINS) tools[b] = has(b);
    return { ok: true, hostname: hostname(), platform: `${process.platform} ${process.arch}`, tools };
  }));

  // 本机网络接口 + 路由
  fastify.get('/net/info', guard(async () => {
    const list: any[] = [];
    const ifaces = networkInterfaces();
    for (const [name, addrs] of Object.entries(ifaces)) {
      for (const a of addrs || []) {
        list.push({ name, family: a.family, address: a.address, netmask: a.netmask, mac: a.mac, internal: a.internal, cidr: (a as any).cidr || null });
      }
    }
    const routes = has('ip')
      ? run('ip', ['route', 'show'], 5).stdout.split('\n').map((s) => s.trim()).filter(Boolean)
      : [];
    return { ok: true, hostname: hostname(), interfaces: list, routes };
  }));

  /* ── DNS 查询 ── */
  fastify.post('/net/dns', guard(async (req) => {
    needBin('dig');
    const b = req.body as any;
    const domain = target(b.domain, '域名');
    const type = dnsType(b.type);
    const args = ['+noall', '+answer'];
    if (b.authority) args.push('+authority');
    if (b.additional) args.push('+additional');
    if (b.server) args.push('@' + target(b.server, 'DNS服务器'));
    args.push(domain, type);
    if (b.short) args.push('+short');
    if (b.tcp) args.push('+tcp');
    if (b.dnssec) args.push('+dnssec');
    const r = run('dig', args, 15);
    const records = b.short ? [] : parseDig(r.stdout);
    const shortAnswers = b.short ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    return { ok: r.ok, tool: 'dns', cmd: `dig ${args.join(' ')}`, output: r.output, ms: r.ms, domain, type, records, byType: groupRecords(records), shortAnswers, error: r.stderr.trim() || undefined };
  }));

  // 别名(兼容旧接口)
  fastify.post('/net/dig', guard(async (req) => {
    (req as any).body = { ...(req.body as any), _alias: true };
    const b = req.body as any; needBin('dig');
    const domain = target(b.domain, '域名');
    const type = dnsType(b.type);
    const args = ['+noall', '+answer'];
    if (b.server) args.push('@' + target(b.server, 'DNS服务器'));
    args.push(domain, type);
    const r = run('dig', args, 15);
    const records = parseDig(r.stdout);
    return { ok: r.ok, output: r.output, ms: r.ms, records, byType: groupRecords(records) };
  }));

  /* ── DNS 传播 / 多解析器对比 ── */
  const RESOLVERS = [
    { name: '系统默认', server: '' },
    { name: 'Google', server: '8.8.8.8' },
    { name: 'Cloudflare', server: '1.1.1.1' },
    { name: 'Quad9', server: '9.9.9.9' },
    { name: 'OpenDNS', server: '208.67.222.222' },
    { name: '阿里 DNS', server: '223.5.5.5' },
    { name: '114 DNS', server: '114.114.114.114' },
  ];
  fastify.post('/net/dns-propagation', guard(async (req) => {
    needBin('dig');
    const b = req.body as any;
    const domain = target(b.domain, '域名');
    const type = dnsType(b.type);
    const results = RESOLVERS.map((rv) => {
      const args = ['+short'];
      if (rv.server) args.push('@' + rv.server);
      args.push(domain, type);
      const r = run('dig', args, 8);
      const answers = r.stdout.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith(';'));
      return { ...rv, answers, ms: r.ms, ok: r.ok, error: r.stderr.trim() || undefined };
    });
    const keys = results.filter((r) => r.ok && r.answers.length).map((r) => [...r.answers].sort().join(','));
    const consistent = new Set(keys).size <= 1;
    return { ok: true, tool: 'dns-propagation', domain, type, consistent, results };
  }));

  /* ── 反向解析 ── */
  fastify.post('/net/reverse', guard(async (req) => {
    needBin('dig');
    const b = req.body as any;
    const ip = target(b.ip || b.domain, 'IP');
    const args = ['+noall', '+answer', '-x', ip];
    const r = run('dig', args, 12);
    return { ok: r.ok, tool: 'reverse', ip, cmd: `dig -x ${ip}`, output: r.output, ms: r.ms, records: parseDig(r.stdout), error: r.stderr.trim() || undefined };
  }));

  /* ── nslookup ── */
  fastify.post('/net/nslookup', guard(async (req) => {
    needBin('nslookup');
    const b = req.body as any;
    const domain = target(b.domain, '域名');
    const args = [domain];
    if (b.server) args.push(target(b.server, 'DNS服务器'));
    const r = run('nslookup', args, 12);
    return { ok: r.ok, tool: 'nslookup', cmd: `nslookup ${args.join(' ')}`, output: r.output, ms: r.ms };
  }));

  /* ── Ping ── */
  fastify.post('/net/ping', guard(async (req) => {
    needBin('ping');
    const b = req.body as any;
    const host = target(b.host);
    const count = clamp(b.count, 1, 50, 4);
    const interval = b.interval ? clamp(b.interval, 1, 5, 1) : 1;
    const args = ['-c', String(count), '-W', '2'];
    if (b.numeric !== false) args.push('-n');
    if (b.size) args.push('-s', String(clamp(b.size, 8, 65500, 56)));
    if (interval > 1) args.push('-i', String(interval));
    args.push(host);
    const r = run('ping', args, count * interval + 8);
    return { ok: r.ok, tool: 'ping', host, cmd: `ping ${args.join(' ')}`, output: r.output, ms: r.ms, stat: parsePing(r.stdout || r.output) };
  }));

  /* ── TCP 连接探测 ── */
  fastify.post('/net/tcp-ping', guard(async (req) => {
    const b = req.body as any;
    const host = target(b.host);
    const prt = portNo(b.port);
    const count = clamp(b.count, 1, 20, 4);
    const timeout = clamp(b.timeout, 200, 10000, 2000);
    const probes: any[] = [];
    for (let i = 0; i < count; i++) probes.push(await tcpProbe(host, prt, timeout));
    const oks = probes.filter((p) => p.ok);
    const rtts = oks.map((p) => p.ms);
    return {
      ok: true, tool: 'tcp-ping', host, port: prt, service: SERVICE[prt] || '', probes,
      stat: {
        transmitted: count, received: oks.length, loss: Math.round((1 - oks.length / count) * 1000) / 10,
        min: rtts.length ? Math.min(...rtts) : null, avg: rtts.length ? Math.round((rtts.reduce((a, x) => a + x, 0) / rtts.length) * 1000) / 1000 : null, max: rtts.length ? Math.max(...rtts) : null,
      },
    };
  }));

  /* ── 端口扫描 ── */
  fastify.post('/net/port-scan', guard(async (req) => {
    const b = req.body as any;
    const host = target(b.host);
    const version = !!b.version;
    const useNmap = has('nmap') && b.engine !== 'node';
    if (useNmap) {
      let args = ['-Pn', '-T4', '-n', '--open'];
      let to = 60;
      if (b.mode === 'custom') {
        const ports = String(b.ports || '').trim();
        if (!/^[\d,\-\s]+$/.test(ports)) throw new Error('端口格式错误, 例: 22,80,443 或 1-1000');
        args.push('-p', ports.replace(/\s+/g, ''));
        to = clamp(b.timeout, 10, 900, 300);
      } else {
        const top = clamp(b.topPorts, 10, 5000, 100);
        args.push('--top-ports', String(top));
        to = clamp(b.timeout, 10, 900, top <= 100 ? 60 : top <= 1000 ? 180 : 480);
      }
      if (version) args.push('-sV', '--version-light');
      args.push(host);
      const r = run('nmap', args, to);
      const open = [...(r.stdout || '').matchAll(/^(\d+)\/(tcp|udp)[ \t]+open[ \t]+(\S+)(?:[ \t]+([^\n]*))?$/gim)]
        .map((m) => ({ port: Number(m[1]), proto: m[2], service: m[3], version: (m[4] || '').trim(), ms: null }));
      const lat = (r.stdout || '').match(/Host is up \(([^)]+)\)/i);
      return { ok: r.ok, tool: 'port-scan', engine: 'nmap', host, cmd: `nmap ${args.join(' ')}`, output: r.output, ms: r.ms, open, latency: lat ? lat[1] : null, error: r.stderr.trim() || undefined };
    }
    // 无 nmap(或强制 engine=node)→ 纯 Node 扫描(仅显式端口/常见端口, 上限 20000)
    let ports: number[];
    if (b.mode === 'custom') {
      if (!/^[\d,\-\s]+$/.test(String(b.ports || ''))) throw new Error('端口格式错误, 例: 22,80,443 或 1-1000');
      ports = parsePortList(String(b.ports));
    } else {
      ports = COMMON_PORTS;
    }
    if (!ports.length) throw new Error('没有解析到有效端口');
    const timeout = clamp(b.timeout, 200, 5000, 800);
    const open = await scanPorts(host, ports, timeout);
    const output = [`[Node TCP 扫描 | 未检测到 nmap] 目标 ${host} 扫描 ${ports.length} 个 TCP 端口, 开放 ${open.length} 个`,
      ...open.map((o) => `${o.port}/tcp  open  ${o.service}  (${o.ms}ms)`)].join('\n');
    return { ok: true, tool: 'port-scan', engine: 'node', host, cmd: `tcp-scan ${host} ${ports.length} ports`, output, ms: null, open };
  }));

  /* ── traceroute ── */
  fastify.post('/net/traceroute', guard(async (req) => {
    needBin('traceroute');
    const b = req.body as any;
    const host = target(b.host);
    const maxHops = clamp(b.maxHops, 1, 64, 30);
    const queries = clamp(b.queries, 1, 5, 3);
    const args = ['-m', String(maxHops), '-q', String(queries), '-w', '2'];
    if (b.resolve !== true) args.push('-n');
    if (b.protocol === 'icmp') args.push('-I');
    else if (b.protocol === 'tcp') args.push('-T', '-p', String(clamp(b.port, 1, 65535, 80)));
    args.push(host);
    const r = run('traceroute', args, 70);
    return { ok: r.ok, tool: 'traceroute', host, cmd: `traceroute ${args.join(' ')}`, output: r.output, ms: r.ms, hops: parseTraceroute(r.stdout || r.output) };
  }));

  /* ── MTR ── */
  fastify.post('/net/mtr', guard(async (req) => {
    const b = req.body as any;
    const host = target(b.host);
    const cycles = clamp(b.cycles, 1, 50, 10);
    if (has('mtr')) {
      const args = ['-r', '-c', String(cycles), '-n'];
      if (b.mode === 'tcp') args.push('-T');
      else if (b.mode === 'udp') args.push('-u');
      args.push(host);
      const r = run('mtr', args, cycles * 2 + 15);
      return { ok: r.ok, tool: 'mtr', mode: 'mtr', host, cmd: `mtr ${args.join(' ')}`, output: r.output, ms: r.ms, hops: parseMtr(r.stdout || r.output) };
    }
    // 降级: traceroute 每跳多次探测
    needBin('traceroute');
    const args = ['-m', '30', '-q', '3', '-w', '2', '-n', host];
    const r = run('traceroute', args, 70);
    return {
      ok: r.ok, tool: 'mtr', mode: 'traceroute-fallback', fallback: true, host,
      note: '本机未安装 mtr, 已用 traceroute(每跳 3 次探测)近似替代, 缺少丢包率统计',
      cmd: `traceroute ${args.join(' ')}`, output: r.output, ms: r.ms, hops: parseTraceroute(r.stdout || r.output),
    };
  }));

  /* ── Whois ── */
  fastify.post('/net/whois', guard(async (req) => {
    needBin('whois');
    const b = req.body as any;
    const q = target(b.query, '查询内容');
    const r = run('whois', [q], 20);
    return { ok: r.ok, tool: 'whois', query: q, cmd: `whois ${q}`, output: r.output, ms: r.ms, ...parseWhois(r.stdout) };
  }));

  /* ── HTTP 请求(带计时/响应头/响应体) ── */
  fastify.post('/net/http', guard(async (req) => {
    needBin('curl');
    const b = req.body as any;
    const url = safeUrl(b.url);
    const method = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/.test(String(b.method || 'GET').toUpperCase()) ? String(b.method).toUpperCase() : 'GET';
    const follow = b.follow !== false;
    const insecure = !!b.insecure;
    const useProxy = b.useProxy !== false;
    const timeout = clamp(b.timeout, 1, 120, 15);
    const dir = mkdtempSync(join(tmpdir(), 'nt-http-'));
    const bodyFile = join(dir, 'body'); const headFile = join(dir, 'head'); const reqFile = join(dir, 'req');
    try {
      const args = ['-s', '-S', '--max-time', String(timeout), '-o', bodyFile, '-D', headFile, '-X', method, '-w', '%{json}'];
      if (follow) args.push('-L');
      if (insecure) args.push('-k');
      if (!useProxy) args.push('--noproxy', '*');
      if (b.headers && typeof b.headers === 'object') {
        for (const [k, v] of Object.entries(b.headers)) { if (/^[\w-]+$/.test(k)) args.push('-H', `${k}: ${v}`); }
      }
      if (b.body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        writeFileSync(reqFile, String(b.body));
        args.push('--data-binary', '@' + reqFile);
      }
      args.push(url);
      const r = run('curl', args, timeout + 10);
      let rawHead = '';
      try { rawHead = readFileSync(headFile, 'utf8'); } catch { /* ignore */ }
      let rawBody = '';
      try { rawBody = readFileSync(bodyFile, 'utf8'); } catch { /* ignore */ }
      const parsed = parseHttpHeaders(rawHead);
      const ctype = parsed.headers['content-type'] || '';
      const isText = /text|json|xml|javascript|html|csv|plain|x-www-form-urlencoded/i.test(ctype) || /^\s*[{[\<]/.test(rawBody);
      const LIMIT = 200000;
      const truncated = rawBody.length > LIMIT;
      const body = isText ? rawBody.slice(0, LIMIT) : null;
      let stats: any = null;
      try { stats = JSON.parse((r.stdout || '').trim().split('\n').pop() || '{}'); } catch { /* ignore */ }
      return {
        ok: r.ok, tool: 'http', url, method, cmd: `curl ${method} ${url}`, output: r.output, ms: r.ms, error: r.stderr.trim() || undefined,
        status: parsed.status, headers: parsed.headers, chain: parsed.chain, stats,
        body, bodySize: rawBody.length, isText, truncated, contentType: ctype || null,
      };
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }));

  // 别名: 旧版 curl 接口
  fastify.post('/net/curl', guard(async (req) => {
    const b = req.body as any;
    const url = safeUrl(b.url);
    const method = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/.test(String(b.method || 'GET').toUpperCase()) ? String(b.method).toUpperCase() : 'GET';
    const args = ['-s', '-S', '--max-time', String(clamp(b.timeout, 1, 120, 10)), '-i', '-X', method];
    if (b.followRedirect !== false) args.push('-L');
    if (b.headers && typeof b.headers === 'object') for (const [k, v] of Object.entries(b.headers)) { if (/^[\w-]+$/.test(k)) args.push('-H', `${k}: ${v}`); }
    args.push(url);
    const r = run('curl', args, clamp(b.timeout, 1, 120, 10) + 10);
    return { ok: r.ok, output: r.output, ms: r.ms };
  }));

  /* ── HTTP 响应头(HEAD/GET 探测) ── */
  fastify.post('/net/headers', guard(async (req) => {
    needBin('curl');
    const b = req.body as any;
    const url = safeUrl(b.url);
    const useProxy = b.useProxy !== false;
    const args = ['-s', '-S', '-I', '-L', '--max-time', '10'];
    if (!useProxy) args.push('--noproxy', '*');
    args.push(url);
    const r = run('curl', args, 15);
    const parsed = parseHttpHeaders(r.stdout || '');
    return { ok: r.ok, tool: 'headers', url, cmd: `curl -I ${url}`, output: r.output, ms: r.ms, status: parsed.status, headers: parsed.headers, chain: parsed.chain, error: r.stderr.trim() || undefined };
  }));

  /* ── TLS 证书检测 ── */
  fastify.post('/net/tls', guard(async (req) => {
    needBin('openssl');
    const b = req.body as any;
    const raw = String(b.host || b.url || '').trim();
    if (!raw) throw new Error('缺少主机或 URL');
    let host = raw; let prt = portNo(b.port || 443, '端口');
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      host = u.hostname;
      prt = u.port ? Number(u.port) : 443;
    }
    host = target(host, '主机');
    const sni = isIP(host) ? [] : ['-servername', host];
    const t0 = Date.now();
    const s = run('openssl', ['s_client', '-connect', `${host}:${prt}`, '-showcerts', ...sni], 15, '');
    const ms = Date.now() - t0;
    const pem = (s.stdout || '').match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
    if (!pem) return { ok: false, tool: 'tls', host, port: prt, output: s.output, ms, error: '无法获取证书(连接失败或目标非 TLS 服务)' };
    const x = run('openssl', ['x509', '-noout', '-text'], 10, pem[0]);
    const text = x.stdout || '';
    const get = (re: RegExp) => { const m = text.match(re); return m ? m[1].trim() : null; };
    const sanBlock = (text.split(/X509v3 Subject Alternative Name:\s*/)[1] || '').split('\n')[0].trim();
    const san = [...sanBlock.matchAll(/(DNS|IP Address|email|URI):\s*([^,]+)/g)].map((m) => ({ type: m[1], value: m[2].trim() }));
    const notAfter = get(/Not After\s*:\s*(.+)/);
    const notBefore = get(/Not Before\s*:\s*(.+)/);
    let daysLeft: number | null = null;
    if (notAfter) { const t = Date.parse(notAfter); if (!Number.isNaN(t)) daysLeft = Math.round((t - Date.now()) / 86400000); }
    const chainLen = (s.stdout.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
    return {
      ok: true, tool: 'tls', host, port: prt, ms, cmd: `openssl s_client -connect ${host}:${prt}`,
      output: text.slice(0, 12000),
      cert: {
        subject: get(/Subject:\s*(.+)/), issuer: get(/Issuer:\s*(.+)/),
        notBefore, notAfter, daysLeft,
        serial: get(/Serial Number:\s*\n?\s*([0-9a-f:]+)/i),
        sigAlg: get(/Signature Algorithm:\s*(\S+)/),
        publicKeyBits: get(/Public-Key:\s*\((\d+) bit\)/),
        publicKeyAlg: get(/Public Key Algorithm:\s*(.+)/),
        ca: /CA:TRUE/i.test(text),
        san, chainLength: chainLen,
      },
    };
  }));

  /* ── 子网计算器(纯计算, 无外部命令) ── */
  fastify.post('/net/subnet', guard(async (req) => {
    const b = req.body as any;
    const raw = String(b.cidr || '').trim();
    const m = raw.match(/^(\d+\.\d+\.\d+\.\d+)(?:\s*\/\s*(\d+))?$/);
    if (!m || !isIPv4(m[1])) throw new Error('请输入 IPv4 CIDR, 例: 192.168.1.0/24');
    const ip = m[1];
    const prefix = m[2] !== undefined ? clamp(m[2], 0, 32, 24) : 24;
    const toInt = (s: string) => s.split('.').reduce((a, o) => ((a << 8) + (Number(o) & 255)) >>> 0, 0) >>> 0;
    const toIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
    const ipInt = toInt(ip);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (ipInt & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const total = Math.pow(2, 32 - prefix);
    const usable = prefix >= 31 ? (prefix === 32 ? 1 : 2) : total - 2;
    const firstUsable = prefix >= 31 ? network : network + 1;
    const lastUsable = prefix >= 31 ? broadcast : broadcast - 1;
    const bin = (n: number) => [24, 16, 8, 0].map((s) => ((n >>> s) & 255).toString(2).padStart(8, '0')).join('.');
    return {
      ok: true, tool: 'subnet', input: raw, ip, prefix,
      netmask: toIp(mask), wildcard: toIp(~mask >>> 0), network: toIp(network), broadcast: toIp(broadcast),
      firstUsable: toIp(firstUsable), lastUsable: toIp(lastUsable),
      totalHosts: total, usableHosts: usable,
      isPrivate: /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip),
      ipClass: ipInt < 0x80000000 ? 'A' : ipInt < 0xc0000000 ? 'B' : ipInt < 0xe0000000 ? 'C' : ipInt < 0xf0000000 ? 'D' : 'E',
      binary: { ip: bin(ipInt), mask: bin(mask), network: bin(network), broadcast: bin(broadcast) },
    };
  }));
}
