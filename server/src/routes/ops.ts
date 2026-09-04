// 主机系统级运维路由：systemd 服务、进程、cron 计划任务、监听端口
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { Host, run } from '../lib/host.js';

function findHost(req: any): Host | null {
  const id = (req.params as any).id;
  return store.list<Host>('hosts').find((h) => h.id === id) || null;
}

export async function register(fastify: FastifyInstance) {
  // ---- 服务(systemd)
  fastify.get('/hosts/:id/services', async (req) => {
    const h = findHost(req);
    if (!h) return { ok: false, error: '主机不存在' };
    const r = await run(h, `systemctl list-units --type=service --all --no-legend --no-pager --plain | awk '{print $1"|"$2"|"$3"|"$4}' | head -400`, 30000);
    const rows = r.stdout.split('\n').filter((l) => l.trim()).map((l) => {
      const [name, load, active, sub] = l.split('|');
      return { name, load, active, sub };
    });
    return { ok: r.code === 0, items: rows, error: r.stderr };
  });
  fastify.post('/hosts/:id/service/:action', async (req) => {
    const h = findHost(req);
    const { action } = req.params as any;
    const { unit } = req.body as any;
    if (!h || !unit) return { ok: false, error: '参数错误' };
    const allow = ['start', 'stop', 'restart', 'reload', 'enable', 'disable', 'status'];
    if (!allow.includes(action)) return { ok: false, error: '非法操作' };
    const cmd = action === 'status' ? `systemctl is-active ${unit}` : `systemctl ${action} ${unit}`;
    const r = await run(h, cmd, 60000);
    return { ok: r.code === 0, output: (r.stdout + r.stderr).trim(), error: r.stderr };
  });

  // ---- 进程
  fastify.get('/hosts/:id/processes', async (req) => {
    const h = findHost(req);
    if (!h) return { ok: false, error: '主机不存在' };
    // 含线程数 nlwp；按 CPU 排序，取前 300
    const r = await run(h, `ps -eo pid,ppid,user,nlwp,%cpu,%mem,rss,etime,comm --sort=-%cpu | awk 'NR<=300'`, 20000);
    const lines = r.stdout.split('\n');
    const head = (lines[0]?.toUpperCase() || '').split(/\s+/).filter(Boolean);
    const items = lines.slice(1).filter((l) => l.trim()).map((l) => {
      const parts = l.trim().split(/\s+/);
      const obj: any = {};
      head.forEach((name, i) => {
        if (i === head.length - 1) obj.command = parts.slice(head.length - 1).join(' ');
        else obj[name] = parts[i] ?? '';
      });
      if (!obj.command) obj.command = parts[parts.length - 1];
      return { pid: obj.PID, ppid: obj.PPID, user: obj.USER, threads: obj.NLWP, cpu: obj['%CPU'], mem: obj['%MEM'], rss: obj.RSS, etime: obj.ELAPSED ?? obj.ETIME, command: obj.command };
    });
    return { ok: true, items };
  });

  // 单进程线程列表
  fastify.get('/hosts/:id/processes/:pid/threads', async (req) => {
    const h = findHost(req);
    const pid = (req.params as any).pid;
    if (!h || !pid) return { ok: false, error: '参数错误' };
    const r = await run(h, `ps -L -p ${pid} -o pid,tid,user,%cpu,%mem,stat,comm --sort=-%cpu 2>&1 | head -300`, 15000);
    const lines = r.stdout.split('\n');
    const head = (lines[0]?.toUpperCase() || '').split(/\s+/).filter(Boolean);
    const items = lines.slice(1).filter((l) => l.trim()).map((l) => {
      const parts = l.trim().split(/\s+/);
      const obj: any = {};
      head.forEach((name, i) => { if (i === head.length - 1) obj.COMMAND = parts.slice(head.length - 1).join(' '); else obj[name] = parts[i] ?? ''; });
      return { tid: obj.TID, pid: obj.PID, user: obj.USER, cpu: obj['%CPU'], mem: obj['%MEM'], stat: obj.STAT, comm: obj.COMMAND };
    });
    return { ok: r.code === 0, pid, count: items.length, items };
  });
  fastify.post('/hosts/:id/kill', async (req) => {
    const h = findHost(req);
    const { pid, signal } = req.body as any;
    if (!h || !pid) return { ok: false, error: '参数错误' };
    const r = await run(h, `kill ${signal === 9 ? '-9' : ''} ${pid} 2>&1; echo done`, 10000);
    return { ok: r.code === 0, output: r.stdout };
  });

  // ---- 计划任务(cron)
  fastify.get('/hosts/:id/cron', async (req) => {
    const h = findHost(req);
    if (!h) return { ok: false, error: '主机不存在' };
    const r = await run(h, `crontab -l 2>&1 || echo __NO_CRONTAB__`, 15000);
    const text = r.stdout.replace(/__NO_CRONTAB__/g, '');
    const lines = text.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    return { ok: true, raw: text, lines };
  });
  fastify.post('/hosts/:id/cron', async (req) => {
    const h = findHost(req);
    const { content } = req.body as any;
    if (!h) return { ok: false, error: '主机不存在' };
    // 通过临时文件写 crontab（保留内容）
    const r = await run(h, `cat <<'EOF' | crontab -\n${content}\nEOF`, 15000);
    return { ok: r.code === 0, output: (r.stdout + r.stderr).trim() };
  });

  // ---- 监听端口
  fastify.get('/hosts/:id/ports', async (req) => {
    const h = findHost(req);
    if (!h) return { ok: false, error: '主机不存在' };
    const r = await run(h, `ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null`, 15000);
    const items = r.stdout.split('\n').slice(1).filter(Boolean).map((l) => l.trim().split(/\s+/)).map((p) => ({
      proto: p[0], local: p[3] || p[4] || '', foreign: p[4] || p[5] || '', process: p[6] || (p[5]?.split(':')[2] || '') || '',
    }));
    return { ok: true, items };
  });
}
