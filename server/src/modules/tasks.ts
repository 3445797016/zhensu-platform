// 通用后台任务中心:注册式 runTask + 状态/日志落盘;供备份/扫描/部署等统一调用。
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { audit } from '../lib/audit.js';
import { Host, run } from '../lib/host.js';

export interface Task {
  id: string; type: string; title: string; host: string;
  status: 'pending' | 'running' | 'ok' | 'fail' | 'cancelled';
  created: string; started?: string; finished?: string;
  log: string[]; result?: string;
}

const KEY = 'tasks';

const tasks = () => store.list<Task>(KEY);
const persist = (t: Task) => { store.upsert(KEY, t); };

export function listTasks() { return tasks().sort((a, b) => b.created.localeCompare(a.created)).slice(0, 200); }
export function getTask(id: string) { return tasks().find((t) => t.id === id) || null; }

export function runTask(type: string, title: string, fn: (log: (s: string) => void, isCancelled: () => boolean) => Promise<string>, opts: { host?: string; persist?: boolean } = {}): Task {
  const t: Task = {
    id: randomUUID().slice(0, 12), type, title, host: opts.host || 'local',
    status: 'pending', created: new Date().toISOString(), log: [],
  };
  const log = (s: string) => { t.log.push(`[${new Date().toTimeString().slice(0, 8)}] ${s}`); if (t.log.length > 400) t.log.shift(); };
  let cancelled = false;
  persist(t);
  setImmediate(async () => {
    t.status = 'running'; t.started = new Date().toISOString(); persist(t);
    try {
      const r = await fn(log, () => cancelled);
      t.status = r.startsWith('CANCEL') ? 'cancelled' : 'ok';
      t.result = r.slice(0, 2000); t.finished = new Date().toISOString();
      audit('task', title, `状态 ${t.status}`, 'task');
    } catch (e: any) {
      t.status = 'fail'; t.result = String(e?.message || e).slice(0, 2000); t.finished = new Date().toISOString();
      log('✗ ' + (e?.message || e));
      audit('task', title, `失败 ${t.result}`, 'task');
    }
    persist(t);
  });
  return t;
}

export function cancelTask(id: string) {
  const t = getTask(id);
  if (t && t.status === 'running') { t.status = 'cancelled'; t.finished = new Date().toISOString(); persist(t); return true; }
  return false;
}

// 简单"脚本任务":在指定主机执行一条 shell,结果存任务日志(前端可直接在任务中心新建)
export async function register(fastify: FastifyInstance) {
  fastify.get('/tasks', () => ({ tasks: listTasks() }));
  fastify.get('/tasks/:id', (req) => getTask(String((req.params as any).id)));
  fastify.post('/tasks', (req, reply) => {
    const { type, title, hostId, script } = req.body as any;
    if (type === 'script') {
      if (!script || typeof script !== 'string') return reply.code(400).send({ error: '缺少 script' });
      const hosts = store.list<Host>('hosts');
      const host = hosts.find((h) => h.id === hostId) || { id: 'local', kind: 'local', name: '本机' } as Host;
      const t = runTask('script', title || 'Shell 脚本任务', async (log, isCancelled) => {
        const step = script.length > 60000 ? script.slice(0, 60000) : script;
        // 边执行边回读:分块输出模拟(长任务可用间隔心跳)
        log('开始执行,命令片段: ' + step.slice(0, 120).replace(/\n/g, ' '));
        const r = await run(host, step, 600000);
        (r.stdout || '').split('\n').filter(Boolean).slice(0, 200).forEach((l) => log('  ' + l));
        if (r.stderr) (r.stderr || '').split('\n').filter(Boolean).slice(0, 80).forEach((l) => log('! ' + l));
        return isCancelled() ? 'CANCEL' : r.code === 0 ? `执行完成(exit 0,${r.stdout.length}B)` : `执行失败 exit ${r.code}`;
      }, { host: host.name });
      audit('task.create', title, `host=${host.name}`);
      return t;
    }
    return reply.code(400).send({ error: '未知任务类型' });
  });
  fastify.post('/tasks/:id/cancel', (req) => ({ ok: cancelTask(String((req.params as any).id)) }));
}
