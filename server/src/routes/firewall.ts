// 防火墙(参考主流面板交互,原创实现):总览统计 + INPUT 规则(计数/策略/目标) + 端口放行/IP 封禁 + 监听服务 + 默认策略调整。
// 引擎:优先 ufw(状态化),规则层用 iptables。所有动作都审计;策略改 DROP 需要显式确认且后端先确保 SSH(22)已放行。
import type { FastifyInstance } from 'fastify';
import { execSync } from 'node:child_process';
import { audit } from '../lib/audit.js';

const sh = (cmd: string) => { try { const r = execSync(cmd, { timeout: 25000, shell: '/bin/bash', encoding: 'utf-8' }); return { code: 0, stdout: String(r), stderr: '' }; } catch (e: any) { return { code: e.status ?? 1, stdout: String(e.stdout || ''), stderr: String(e.stderr || e.message) }; } };
const hasUfw = () => { const r = sh('ufw status 2>/dev/null | head -1'); return /Status: active/i.test(r.stdout); };
const ufwActive = hasUfw;

function chainInfo(): { policy: string; pkts: number; bytes: number } {
  const r = sh("iptables -L INPUT -n -v -x 2>/dev/null | head -1");
  const m = r.stdout.match(/policy\s+(\w+)\s+([\d.]+\w?)\s+packets,\s*([\d.]+\w?)\s+bytes/i);
  const num = (s: string) => { const k = String(s).toLowerCase(); const v = parseFloat(k); if (k.endsWith('k')) return v * 1024; if (k.endsWith('m')) return v * 1048576; if (k.endsWith('g')) return v * 1073741824; return isNaN(v) ? 0 : v; };
  return { policy: m ? m[1].toUpperCase() : '?', pkts: m ? Math.round(num(m[2])) : 0, bytes: m ? Math.round(num(m[3])) : 0 };
}

function listRules() {
  const specR = sh('iptables -S INPUT 2>/dev/null').stdout.split('\n').filter((l) => l.startsWith('-A INPUT'));
  const nv = sh('iptables -L INPUT -n -v --line-numbers 2>/dev/null').stdout.split('\n').filter((l) => /^\s*\d+\s+\d+\s+\d+/.test(l));
  // -nv 行字段: num pkts bytes target prot opt in out source destination ...
  const detail = nv.map((l) => {
    const p = l.trim().split(/\s+/);
    const [num, pkts, bytes, target, prot, opt, inn, out, source, destination] = p;
    return { num: parseInt(num), pkts: parseInt(pkts || '0') || 0, bytes: parseInt(bytes || '0') || 0, target, prot, inn: inn || '-', out: out || '-', source: source || '0.0.0.0/0', destination: destination || '0.0.0.0/0' };
  });
  const rows = specR.map((spec, i) => {
    const d: any = detail[i] || {};
    const src = (spec.match(/-s\s+(\S+)/) || [])[1] || '0.0.0.0/0';
    const dst = (spec.match(/-d\s+(\S+)/) || [])[1] || '0.0.0.0/0';
    const prot = (spec.match(/-p\s+(\S+)/) || [])[1] || 'all';
    const port = (spec.match(/--dport\s+(\S+)/) || [])[1] || '';
    const comment = (spec.match(/--comment\s+"([^"]+)"/) || [])[1] || '';
    const target = (spec.match(/-j\s+(\S+)/) || [])[1] || '';
    return { id: i, spec, comment, prot, port, src, dst, target, pkts: d.pkts || 0, bytes: d.bytes || 0 };
  });
  return rows;
}

function listListening() {
  const r = sh("ss -ltnp 2>/dev/null | tail -n +2");
  return r.stdout.split('\n').filter(Boolean).map((l) => {
    const proto = l.startsWith('udp') ? 'udp' : 'tcp';
    const pm = l.match(/(?:[0-9*.a-fA-F:\]]+):(\d+)\s+/);
    const um = l.match(/users:\(\("([^"]+)",pid=(\d+)/);
    if (!pm) return null;
    return { proto, port: parseInt(pm[1]), addr: (l.match(/^\S+\s+\S+\s+\S+\s+(\S+):\d+/) || [])[1] || '*', proc: um ? um[1] : '-', pid: um ? um[2] : '-' };
  }).filter(Boolean);
}

function addRule(opt: { action: 'ACCEPT' | 'DROP'; proto: string; port?: string; source?: string }) {
  const spec = `-p ${opt.proto === 'any' ? 'all' : opt.proto} ${opt.port ? '--dport ' + opt.port + ' ' : ''}${opt.source ? '-s ' + opt.source + ' ' : ''}-j ${opt.action}`;
  const exists = sh(`iptables -C INPUT ${spec} 2>/dev/null`).code === 0;
  if (!exists) { const r = sh(`iptables -I INPUT 1 ${spec}`); if (r.code !== 0) throw new Error(r.stderr); }
  return spec;
}

export async function register(fastify: FastifyInstance) {
  fastify.get('/firewall', () => {
    const ufw = hasUfw();
    const rules = listRules();
    const st = chainInfo();
    const policy = st.policy;
    const listening = listListening();
    const denied = rules.filter((r) => r.target === 'DROP').reduce((a, b) => a + b.pkts, 0);
    return {
      engine: ufw ? 'ufw' : 'iptables', ufw,
      policy, ruleCount: rules.length, pkts: st.pkts, bytes: st.bytes, deniedPkts: denied,
      rules, listening,
      commonPorts: [22, 80, 443, 3306, 6379, 8080, 9000, 9200, 15672, 19001],
    };
  });

  // 放行/拒绝端口或 IP(proto=any 表示 IP 规则)
  fastify.post('/firewall', (req, reply) => {
    const b = (req.body || {}) as any;
    const action = b.kind === 'allow' ? 'ACCEPT' : b.kind === 'deny' ? 'DROP' : '';
    if (!action) return reply.code(400).send({ error: 'kind 需为 allow/deny' });
    const proto = String(b.proto || 'tcp');
    if (!['tcp', 'udp', 'icmp', 'any'].includes(proto)) return reply.code(400).send({ error: 'proto 非法' });
    const port = String(b.port || '');
    if (port && !/^\d{1,5}(:\d{1,5})?$/.test(port)) return reply.code(400).send({ error: '端口格式非法(单端口或 8000:9000)' });
    const source = String(b.source || '').trim();
    if (source && !/^[\w.:\/-]+$/.test(source)) return reply.code(400).send({ error: '来源格式非法' });
    if (ufwActive() && b.engine === 'ufw') {
      const cmd = `ufw ${action === 'ACCEPT' ? 'allow' : 'deny'} ${port ? port + '/' + proto : proto} ${source ? 'from ' + source : ''} ${b.comment ? 'comment "' + b.comment + '"' : ''} 2>&1`;
      const r = sh(cmd);
      if (r.code !== 0) return reply.code(500).send({ error: r.stderr || r.stdout });
      audit('firewall', action === 'ACCEPT' ? 'ufw放行' : 'ufw拒绝', `${proto}/${port || '*'} from ${source || 'all'}`.trim());
      return { ok: true, engine: 'ufw' };
    }
    try {
      const spec = addRule({ action, proto, port: port || undefined, source: source || undefined });
      audit('firewall', action === 'ACCEPT' ? '放行' : '封禁', `${proto}/${port || 'any'} from ${source || 'all'} → ${spec}`.trim());
      return { ok: true, engine: 'iptables', spec };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  // 批量放行(快捷按钮组)
  fastify.post('/firewall/batch', (req, reply) => {
    const { ports, proto = 'tcp', source = '' } = (req.body || {}) as any;
    if (!Array.isArray(ports)) return reply.code(400).send({ error: 'ports 需为数组' });
    const out: string[] = [];
    try { for (const p of ports) out.push(addRule({ action: 'ACCEPT', proto, port: String(p), source: source || undefined })); }
    catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
    audit('firewall.batch', '批量放行', ports.join(','));
    return { ok: true, added: out };
  });

  // 按行号删除(前端传 id);也兼容 spec 完整删除
  fastify.post('/firewall/delete', (req, reply) => {
    const b = (req.body || {}) as any;
    if (typeof b.id === 'number') {
      const r = sh(`iptables -D INPUT ${b.id + 1} 2>&1`);
      if (r.code !== 0) return reply.code(500).send({ error: r.stderr || '删除失败(行号失效?请刷新)' });
      audit('firewall.delete', `INPUT 第 ${b.id + 1} 条`);
      return { ok: true };
    }
    const spec = String(b.spec || '');
    if (!spec.startsWith('-A INPUT ')) return reply.code(400).send({ error: 'spec 需以 -A INPUT 开头' });
    const r = sh(`iptables -D ${spec.replace(/^-A INPUT\s+/, '')} 2>&1`);
    if (r.code !== 0) return reply.code(500).send({ error: r.stderr || '删除失败(规则不存在?)' });
    audit('firewall.delete', spec);
    return { ok: true };
  });

  // 调整 INPUT 默认策略(需显式确认;DROP 前确保 22 已放行,防锁死)
  fastify.post('/firewall/policy', (req, reply) => {
    const b = (req.body || {}) as any;
    const target = String(b.target || '').toUpperCase();
    if (!['ACCEPT', 'DROP'].includes(target)) return reply.code(400).send({ error: 'target 需 ACCEPT/DROP' });
    if (b.confirm !== 'yes') return reply.code(403).send({ error: '需显式确认(confirm=yes)' });
    const cur = chainInfo().policy;
    if (cur === target) return { ok: true, unchanged: true };
    if (target === 'DROP') {
      // 确保 SSH 已放行
      const has22 = listRules().some((r) => r.target === 'ACCEPT' && /:22($|\s)/.test(r.port) || (r.port === '' && r.prot === 'all' && r.target === 'ACCEPT'));
      if (!has22) addRule({ action: 'ACCEPT', proto: 'tcp', port: '22' });
    }
    const r = sh(`iptables -P INPUT ${target}`);
    if (r.code !== 0) return reply.code(500).send({ error: r.stderr });
    audit('firewall.policy', 'INPUT 默认策略', `${cur} → ${target}`);
    return { ok: true, from: cur, to: target };
  });
}
