// 靶机中心:扫描并管理本地 Docker 靶机/容器(信息、实时资源 docker stats、启停/日志、双向文件传输 docker cp)。
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { audit } from '../lib/audit.js';

const sh = (cmd: string) => { try { const r = execSync(cmd, { timeout: 40000, shell: '/bin/bash', encoding: 'utf-8' }); return { code: 0, stdout: String(r), stderr: '' }; } catch (e: any) { return { code: e.status ?? 1, stdout: String(e.stdout || ''), stderr: String(e.stderr || e.message) }; } };
const q = (s: string) => "'" + String(s).replace(/'/g, `'\\''`) + "'";
const safeName = (n: string) => { if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(n)) throw new Error('容器名非法'); return n; };
const safeCp = (p: string) => { if (!p || !p.startsWith('/')) throw new Error('容器内路径需以 / 开头'); if (p.includes('\0')) throw new Error('路径非法'); return p; };
const exists = (n: string) => sh(`docker inspect ${q(n)} >/dev/null 2>&1`).code === 0;

function stats(): Record<string, any> {
  const r = sh("docker stats --no-stream --format '{{json .}}' 2>/dev/null");
  const out: Record<string, any> = {};
  for (const l of r.stdout.split('\n')) {
    if (!l.trim()) continue;
    try { const j = JSON.parse(l); out[j.Name] = { cpu: j.CPUPerc, mem: j.MemPerc, memUsage: j.MemUsage, netIO: j.NetIO, blockIO: j.BlockIO, pids: j.PIDs }; } catch { /* */ }
  }
  return out;
}

export function scanTargets(): any[] {
  const st = stats();
  const ps = sh("docker ps -a --format '{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}\\t{{.CreatedAt}}\\t{{.State}}'").stdout.split('\n').filter(Boolean);
  const out: any[] = [];
  for (const l of ps) {
    const [name, image, status, ports, created, state] = l.split('\t');
    if (!name) continue;
    const m = st[name] || {};
    out.push({ name, image, status, ports, created, state: state === 'running' ? 'running' : 'stopped', stats: m });
  }
  return out;
}

export async function register(fastify: FastifyInstance) {
  // 安全/渗透类镜像标记(用于高亮展示)
  const SEC_IMGS = ['dvwa', 'juice-shop', 'webgoat', 'zap', 'gophish', 'beef', 'metasploit', 'pentester', 'vuln', 'kali'];
  fastify.get('/targets', async () => {
    const list = scanTargets().map((c) => ({ ...c, kind: 'container', lab: SEC_IMGS.some((s) => c.image.toLowerCase().includes(s)) ? '靶场' : '容器' }));
    const running = list.filter((c) => c.state === 'running').length;
    // 纳管主机也作为“靶机资产”列出(静态信息;资源见 /targets/host/:id/info)
    const { store } = await import('../lib/store.js');
    const { run } = await import('../lib/host.js');
    const hosts = (store.list<any>('hosts') || []).map((h) => ({ id: h.id, name: h.name, kind: 'host', lab: h.kind === 'ssh' ? '远程主机' : '本机', image: h.kind === 'ssh' ? `ssh@${h.host}` : 'local', state: 'host', hostId: h.id, stats: {}, ports: '' }));
    return { list, hosts, total: list.length + hosts.length, running, docker: sh('docker --version 2>/dev/null').stdout.trim() || '未安装 docker' };
  });

  // 详情 + 实时资源
  fastify.get('/targets/:name/info', (req, reply) => {
    try {
      const name = safeName(String((req.params as any).name));
      if (!exists(name)) return reply.code(404).send({ error: `容器不存在: ${name}` });
      const inspect = sh(`docker inspect ${q(name)}`);
      const st = stats()[name] || {};
      const j = JSON.parse(inspect.stdout)[0] || {};
      const started = j.State?.StartedAt;
      const uptimeSec = started ? Math.max(0, (Date.now() - Date.parse(started)) / 1000) : 0;
      return {
        name,
        config: { image: j.Config?.Image, cmd: (j.Config?.Cmd || []).join(' '), user: j.Config?.User, workdir: j.Config?.WorkingDir, env: (j.Config?.Env || []).slice(0, 30) },
        state: j.State, network: j.NetworkSettings?.Networks || {},
        mounts: (j.Mounts || []).map((mm: any) => ({ type: mm.Type, source: mm.Source, dest: mm.Destination, rw: mm.RW, mode: mm.Mode })),
        portBindings: j.NetworkSettings?.Ports || {},
        uptimeSec,
        resource: st,
        created: j.Created,
      };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  fastify.post('/targets/:name/action', (req, reply) => {
    const act = String((req.body as any)?.action || '');
    try {
      const name = safeName(String((req.params as any).name));
      if (!['start', 'stop', 'restart', 'pause', 'unpause'].includes(act)) return reply.code(400).send({ error: 'action 非法' });
      if (!exists(name)) return reply.code(404).send({ error: '容器不存在' });
      const r = sh(`docker ${act} ${q(name)}`);
      if (r.code !== 0) return reply.code(500).send({ error: r.stderr || r.stdout });
      audit('target.action', name, act);
      return { ok: true, action: act };
    } catch (e: any) { return reply.code(400).send({ error: String(e?.message || e) }); }
  });

  fastify.get('/targets/:name/logs', (req, reply) => {
    try {
      const name = safeName(String((req.params as any).name));
      const n = Math.min(Number((req.query as any).lines) || 200, 2000);
      const r = sh(`docker logs --tail ${n} ${q(name)} 2>&1`);
      return { name, logs: r.stdout };
    } catch (e: any) { return reply.code(400).send({ error: String(e?.message || e) }); }
  });

  // 主机靶机资源(点击详情实时读取 CPU/内存/负载/磁盘/进程)
  fastify.get('/targets/host/:id/info', async (req, reply) => {
    try {
      const { store } = await import('../lib/store.js');
      const { run } = await import('../lib/host.js');
      const id = String((req.params as any).id);
      const h = store.list<any>('hosts').find((x: any) => x.id === id) || null;
      if (!h) return reply.code(404).send({ error: '主机不存在' });
      const cmd = [
        `echo LOAD=$(cut -d' ' -f1-3 /proc/loadavg)`,
        `echo CPU=$(top -bn1 2>/dev/null | grep -i 'Cpu(s)' | head -1)`,
        `echo MEM=$(free -m | awk '/Mem:/{printf "%sMB/%sMB", $3, $2}')`,
        `echo UPTIME=$(cut -d. -f1 /proc/uptime)`,
        `echo OS=$(uname -sr)`,
        `echo PROC=$(ps -e --no-headers 2>/dev/null | wc -l)`,
        `echo DISK=$(df -h / | awk 'NR==2{print $3"/"$2"("$5")"}')`,
      ].join('\n');
      const r = await run(h, cmd, 30000);
      const g = (k: string) => (r.stdout.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '';
      const idle = parseFloat((g('CPU').match(/(\d+(?:\.\d+)?)\s*id/) || [])[1] || '0');
      const cpu = idle > 0 && idle <= 100 ? Math.round(100 - idle) : null;
      return {
        type: 'host', name: h.name, addr: h.host || '本机', os: g('OS'),
        uptimeSec: parseInt(g('UPTIME')) || 0,
        resource: { cpu: cpu != null ? cpu + '%' : '-', mem: g('MEM') || '-', load: g('LOAD') || '-', proc: g('PROC') + ' 进程', disk: g('DISK') || '-' },
      };
    } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  });

  // 本机 -> 靶机:body {source(localPath 或 base64 data), containerPath, data?}
  fastify.post('/targets/:name/cp', async (req, reply) => {
    const b = (req.body || {}) as any;
    try {
      const name = safeName(String((req.params as any).name));
      if (!exists(name)) return reply.code(404).send({ error: '容器不存在' });
      const direction = b.direction === 'from' ? 'from' : 'to';
      if (direction === 'to') {
        const containerPath = safeCp(String(b.containerPath || ''));
        let src = String(b.source || '');
        if (b.data) {
          const tmp = join(tmpdir(), 'zs-cp-' + Date.now());
          writeFileSync(tmp, Buffer.from(String(b.data), 'base64'));
          src = tmp;
        }
        if (!src) return reply.code(400).send({ error: '缺少 source(本机路径)或 data(base64)' });
        if (!existsSync(src)) return reply.code(400).send({ error: '本机源文件不存在: ' + src });
        const r = sh(`docker cp ${q(src)} ${q(name + ':' + containerPath)}`);
        if (b.data) try { rmSync(src, { force: true }); } catch { /* */ }
        if (r.code !== 0) return reply.code(500).send({ error: r.stderr || r.stdout });
        audit('target.cp', name, `本机→靶机 ${containerPath}`);
        return { ok: true };
      }
      // 靶机 -> 本机:{containerPath, localPath(可选,写入本机), returnBase64(默认 true)}
      const containerPath = safeCp(String(b.containerPath || ''));
      const tmp = join(tmpdir(), 'zs-cp-' + Date.now() + Math.random().toString(36).slice(2, 6));
      const r = sh(`docker cp ${q(name + ':' + containerPath)} ${q(tmp)}`);
      if (r.code !== 0) { try { rmSync(tmp, { force: true }); } catch { /* */ } return reply.code(500).send({ error: r.stderr || '靶机内文件不存在或不可读' }); }
      const size = statSync(tmp).size;
      if (b.localPath) { writeFileSync(String(b.localPath), readFileSync(tmp)); try { rmSync(tmp, { force: true }); } catch { /* */ } audit('target.cp', name, `靶机→本机 ${containerPath} → ${b.localPath}`); return { ok: true, size }; }
      const data = readFileSync(tmp).toString('base64');
      try { rmSync(tmp, { force: true }); } catch { /* */ }
      audit('target.cp', name, `靶机→本机下载 ${containerPath} (${size}B)`);
      return { ok: true, size, name: containerPath.split('/').pop(), data };
    } catch (e: any) { return reply.code(400).send({ error: String(e?.message || e) }); }
  });
}
