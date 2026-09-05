// 靶机库(本地靶场):维护 IP 清单,提供 探测/快速/服务/Web/SMB 漏洞 等一键扫描并留存结果。
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { audit } from '../lib/audit.js';

const sh = (cmd: string, timeout = 60000) => { try { const r = execSync(cmd, { timeout, shell: '/bin/bash', encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }); return { code: 0, stdout: String(r), stderr: '' }; } catch (e: any) { return { code: e.status ?? 1, stdout: String(e.stdout || ''), stderr: String(e.stderr || e.message) }; } };
const ipOk = (s: string) => /^[\w.:\-/]+$/.test(s);
const target = () => store.list<any>('seclab-targets');
const scans = () => store.read<any>('seclab-scans', {});
const saveScans = (s: any) => store.write('seclab-scans', s);

function parseOpen(raw: string): Array<{ port: string; service: string; version: string }> {
  const out: any[] = [];
  for (const l of raw.split('\n')) {
    const m = l.match(/^(\d+)\/tcp\s+(\w+)\s+(.+)$/);
    if (m && m[2] === 'open') {
      const rest = m[3].split(/\s{2,}/);
      const svc = (rest[0] || '').replace(/_/g, ' ');
      const ver = rest.slice(1).join(' ') || '';
      out.push({ port: m[1], service: svc || '?', version: ver.slice(0, 120) });
    }
  }
  return out;
}

const SCANS: Record<string, { label: string; build: (ip: string) => string; timeout: number; parse?: (r: any, raw: string) => any }> = {
  ping: { label: '在线探测', timeout: 30000, build: (ip) => `nmap -sn -T4 ${ip}`, parse: (r, raw) => ({ up: /Host is up/.test(raw) || r.code === 0 }) },
  quick: { label: '快速端口(Nmap)', timeout: 90000, build: (ip) => `nmap -Pn -T4 --top-ports 300 ${ip}`, parse: (_r, raw) => ({ ports: parseOpen(raw) }) },
  service: { label: '服务版本(-sV)', timeout: 180000, build: (ip) => `nmap -Pn -sT -sV -T4 --top-ports 1000 ${ip}`, parse: (_r, raw) => ({ ports: parseOpen(raw) }) },
  web: { label: 'Web 指纹', timeout: 90000, build: (ip) => `whatweb -a 1 http://${ip} 2>&1; echo ---HTTPS---; (curl -ksI --max-time 8 https://${ip} | head -6); echo ---HTTP---; (curl -sI --max-time 8 http://${ip} | head -6)` },
  smb: { label: 'SMB 漏洞脚本', timeout: 120000, build: (ip) => `nmap -Pn --script smb-vuln-ms08-067,smb-vuln-ms17-010 -p445 ${ip}`, parse: (_r, raw) => ({ vulnerable: raw.includes('VULNERABLE'), ms: (raw.match(/State: VULNERABLE|CVE-\d+-\d+/g) || []).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6) }) },
  full: { label: '全端口+版本', timeout: 300000, build: (ip) => `nmap -Pn -sS -sV -p- -T4 --min-rate 2000 ${ip}` },
};

function doScan(ip: string, kind: string) {
  const def = SCANS[kind];
  if (!def) return null;
  const t0 = Date.now();
  const r = sh(def.build(ip), def.timeout);
  const raw = (r.stdout || r.stderr || '').slice(0, 30000);
  const parsed = def.parse ? def.parse(r, raw) : {};
  const res = { ip, kind, label: def.label, time: new Date().toISOString(), ok: r.code === 0 || r.code === 256, ms: Date.now() - t0, raw: raw.slice(0, 20000), ...parsed };
  const all = scans();
  const ipScans = all[ip] || [];
  ipScans.unshift(res);
  all[ip] = ipScans.slice(0, 20);
  saveScans(all);
  audit('seclab.scan', ip, kind);
  return res;
}

const cfg = () => store.read<any>('seclab-cfg', { auto: false, intervalMin: 10, kinds: ['quick'] });
let timer: any = null, runningAuto = false;
async function autoTick() {
  if (runningAuto) return;
  const c = cfg(); if (!c.auto) return;
  const list = store.list<any>('seclab-targets');
  if (!list.length) return;
  runningAuto = true;
  try {
    for (const t of list) {
      for (const k of c.kinds || ['quick']) {
        try { doScan(t.ip, k); } catch { /* 单点失败继续 */ }
      }
    }
  } finally { runningAuto = false; }
}
function arm() {
  if (timer) clearInterval(timer);
  const c = cfg();
  if (c.auto) { timer = setInterval(() => { void autoTick(); }, Math.max(1, Number(c.intervalMin) || 10) * 60000); void autoTick(); }
}

export async function register(fastify: FastifyInstance) {
  fastify.get('/seclab/targets', () => ({ list: target(), scans: scans(), cfg: cfg(), scanning: runningAuto }));
  fastify.get('/seclab/config', () => ({ ...cfg(), scanning: runningAuto }));
  fastify.put('/seclab/config', (req) => { const b: any = (req.body || {}) as any; store.write('seclab-cfg', { ...cfg(), ...b }); arm(); return { ...cfg(), scanning: runningAuto }; });
  fastify.post('/seclab/scanall', async () => { void autoTick(); return { started: true }; });

  fastify.post('/seclab/targets', (req, reply) => {
    const b = (req.body || {}) as any;
    const ip = String(b.ip || '').trim();
    if (!ipOk(ip)) return reply.code(400).send({ error: 'IP 格式非法' });
    const list = store.list<any>('seclab-targets');
    if (list.some((t) => t.ip === ip)) return reply.code(409).send({ error: '该 IP 已在列表' });
    const t = { ip, name: String(b.name || ip).trim() || ip, note: String(b.note || ''), created: new Date().toISOString() };
    store.write('seclab-targets', [...list, t]);
    audit('seclab.add', ip, t.name);
    return { ok: true, target: t };
  });
  fastify.put('/seclab/targets/:ip', (req, reply) => {
    const ip = String((req.params as any).ip);
    const b = (req.body || {}) as any;
    const list = target();
    const it = list.find((t) => t.ip === ip);
    if (!it) return reply.code(404).send({ error: '靶机不存在' });
    store.write('seclab-targets', list.map((t) => (t.ip === ip ? { ...t, name: b.name || t.name, note: b.note !== undefined ? b.note : t.note } : t)));
    return { ok: true };
  });
  fastify.delete('/seclab-targets/:ip', (req) => {
    const ip = String((req.params as any).ip);
    store.write('seclab-targets', target().filter((t) => t.ip !== ip));
    return { ok: true };
  });

  // 一键扫描并留存
  fastify.post('/seclab/scan', async (req, reply) => {
    const b = (req.body || {}) as any;
    const ip = String(b.ip || '').trim();
    const kind = String(b.kind || 'quick');
    const def = SCANS[kind];
    if (!ipOk(ip) || !def) return reply.code(400).send({ error: '参数非法' });
    const res = doScan(ip, kind);
    return res || { error: '扫描失败' };
  });
  arm();
}
