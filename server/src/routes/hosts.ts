// 主机(VM/本地)管理路由：CRUD、探测、命令执行、WebSocket 终端、系统指标
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host, run, ping, openShell, describeHost } from '../lib/host.js';

function toHost(body: any): Host {
  return {
    id: body.id ?? randomUUID(),
    name: body.name || '未命名',
    kind: body.kind === 'ssh' ? 'ssh' : 'local',
    host: body.host, port: body.port || 22, user: body.user,
    authType: body.authType || 'password', password: body.password, privateKey: body.privateKey,
    sudo: !!body.sudo, sudoPassword: body.sudoPassword,
    os: body.os, tags: body.tags || [], notes: body.notes,
  };
}

export async function register(fastify: FastifyInstance) {
  const NS = 'hosts';
  const list = () => store.list<Host>(NS);
  const find = (id: string) => list().find((h) => h.id === id);

  fastify.get('/hosts', () => list());

  fastify.get('/hosts/:id', (req) => {
    const h = find((req.params as any).id);
    if (!h) return { code: 404, error: 'not found' };
    return h;
  });

  fastify.post('/hosts', (req) => {
    const h = toHost((req.body as any).data ?? req.body as any);
    store.upsert(NS, h);
    return h;
  });

  fastify.put('/hosts/:id', (req) => {
    const body = req.body as any;
    const old = find((req.params as any).id);
    if (!old) return { code: 404, error: 'not found' };
    const merged = toHost({ ...old, ...(body.data ?? body), id: old.id });
    store.upsert(NS, merged);
    return merged;
  });

  fastify.delete('/hosts/:id', (req) => {
    store.remove(NS, (req.params as any).id);
    return { ok: true };
  });

  fastify.post('/hosts/:id/test', async (req) => {
    const h = find((req.params as any).id);
    if (!h) return { code: 404 };
    try {
      const p = await ping(h);
      if (p.os !== undefined && p.os !== h.os) store.upsert(NS, p);
      return { ok: true, os: p.os, host: describeHost(h), time: new Date().toISOString() };
    } catch (e: any) { return { ok: false, error: String(e) }; }
  });

  // 执行任意命令（受控；供工具/API 复用）
  fastify.post('/hosts/:id/exec', async (req, reply) => {
    const { command, timeout } = req.body as any;
    const h = find((req.params as any).id);
    if (!h) return reply.code(404).send({ error: 'not found' });
    const r = await run(h, command, timeout ?? 120000);
    return { code: r.code, stdout: r.stdout, stderr: r.stderr };
  });

  // 系统指标（供仪表盘）
  fastify.get('/hosts/:id/metrics', async (req) => {
    const h = find((req.params as any).id);
    if (!h) return { code: 404 };
    const r = await run(h, `echo "===cpu==="; nproc; echo "===load==="; cat /proc/loadavg; echo "===mem==="; free -m; echo "===disk==="; df -h / /home 2>/dev/null | tail -n +1; echo "===up==="; uptime -p; echo "===net==="; ip -br addr | grep -v '^lo' || true`, 20000);
    return parseMetrics(r.stdout);
  });

  // WebSocket 交互终端
  fastify.get('/ws/shell/:id', { websocket: true }, (socket, req) => {
    const h = find((req.params as any).id);
    if (!h) { socket.send('\r\n[错误] 主机不存在\r\n'); socket.close(); return; }
    socket.send(`\r\n=== 已连接到 ${describeHost(h)} ===\r\n`);
    const shell = openShell(h, (d) => { try { socket.send(d); } catch {} }, () => { try { socket.close(); } catch {} });
    socket.on('message', (buf: any) => { shell.write(String(buf)); });
    socket.on('close', () => shell.close());
  });
}

function parseMetrics(raw: string): any {
  const sec = (n: string) => raw.split(n)[1]?.split('\n')[0]?.trim() ?? '';
  const load = sec('===load===').split(' ');
  const mem = sec('===mem===').split('\n');
  const memLine = (mem.find((l) => /Mem:/.test(l)) || '').split(/\s+/);
  const disk = sec('===disk===').split('\n').filter((l) => /\/$|^Filesystem/.test(l)).map((l) => l.split(/\s+/)).filter((x) => x[0] !== 'Filesystem').map((x) => ({ mount: x[5] ?? '/', size: x[1], used: x[2], avail: x[3], usePct: x[4] }));
  const up = sec('===up===');
  const net = sec('===net===');
  return {
    cores: parseInt(sec('===cpu===')) || 0,
    load1: parseFloat(load[0]) || 0, load5: parseFloat(load[1]) || 0, load15: parseFloat(load[2]) || 0,
    memTotalMb: parseInt(memLine[1]) || 0, memUsedMb: parseInt(memLine[2]) || 0, memFreeMb: parseInt(memLine[3]) || 0,
    swapLine: (mem.find((l) => /Swap:/.test(l)) || '').split(/\s+/),
    disk, up, net,
    collectedAt: new Date().toISOString(),
  };
}
