// 备份中心:把指定目录/文件打包(tar.gz)到目标主机 /var/backups/zhensu,任务走任务中心;支持列表/下载/还原/删除。
import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { store } from '../lib/store.js';
import { Host, run } from '../lib/host.js';
import { audit } from '../lib/audit.js';
import { runTask } from '../modules/tasks.js';

const shq = (s: string) => "'" + String(s).replace(/'/g, `'\\''`) + "'";
const KEY = 'backups';
const BACKUP_ROOT = '/var/backups/zhensu';
const hostOf = (id: string): Host | null => store.list<Host>('hosts').find((h) => h.id === id) || (id === 'local' ? { id: 'local', kind: 'local', name: '本机' } as Host : null);

export async function register(fastify: FastifyInstance) {
  const list = () => store.list<any>(KEY).sort((a: any, b: any) => b.created.localeCompare(a.created));

  fastify.get('/backup', (req) => {
    const host = hostOf(String((req.query as any).host || 'local'))!;
    return { list: list(), backupRoot: BACKUP_ROOT, host: host.name };
  });

  // 触发备份:src 为原主机上的路径(host 指定在哪台主机打包)
  fastify.post('/backup', async (req, reply) => {
    const b = (req.body || {}) as any;
    const host = hostOf(String(b.host || 'local'));
    const src = String(b.src || '').trim();
    if (!host) return reply.code(404).send({ error: '主机不存在' });
    if (!src) return reply.code(400).send({ error: '请填写要备份的路径' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const file = `${BACKUP_ROOT}/${id}.tar.gz`;
    const meta = { id, name: b.name || src.split('/').pop() || 'backup', src, host: host.name, hostId: host.id, path: file, status: 'running', created: new Date().toISOString(), size: 0 };
    store.upsert(KEY, meta);
    audit('backup.create', src, `host=${host.name}`);
    runTask('backup', `备份 ${src}`, async (log) => {
      const r = await run(host, `mkdir -p ${BACKUP_ROOT} && tar czf ${file} -C / $(echo ${shq(src)} | sed 's|^/||') 2>&1 | tail -5`, 900000);
      const sz = await run(host, `stat -c %s ${file} 2>/dev/null || echo 0`, 20000);
      meta.status = r.code === 0 ? 'ok' : 'fail'; meta.size = parseInt(sz.stdout) || 0;
      store.write(KEY, list().map((x: any) => (x.id === id ? meta : x)));
      return r.code === 0 ? `备份完成 ${(meta.size / 1024 / 1024).toFixed(1)}MB` : '备份失败:' + r.stderr;
    }, { host: host.name });
    return { ok: true, backup: meta };
  });

  fastify.post('/backup/:id/restore', async (req, reply) => {
    const b = (req.body || {}) as any;
    const bk = list().find((x: any) => x.id === String((req.params as any).id));
    if (!bk) return reply.code(404).send({ error: '备份不存在' });
    const host = hostOf(bk.hostId || 'local'); const to = String(b.to || '').trim();
    if (!host) return reply.code(404).send({ error: '原主机不存在' });
    if (!to) return reply.code(400).send({ error: '请填写还原目标路径' });
    audit('backup.restore', bk.src, `→ ${to}`);
    runTask('restore', `还原 ${bk.name}`, async (log) => {
      const r = await run(host, `mkdir -p ${shq(to)} && tar xzf ${bk.path} -C ${shq(to)} 2>&1 | tail -5`, 900000);
      return r.code === 0 ? '还原完成' : '还原失败:' + r.stderr;
    }, { host: host.name });
    return { ok: true };
  });

  fastify.delete('/backup/:id', async (req, reply) => {
    const id = String((req.params as any).id);
    const bk = list().find((x: any) => x.id === id);
    if (bk) { const host = hostOf(bk.hostId || 'local')!; await run(host, `rm -f ${bk.path}`, 20000); }
    store.write(KEY, list().filter((x: any) => x.id !== id));
    audit('backup.delete', id);
    return { ok: true };
  });

  fastify.get('/backup/:id/download', async (req, reply) => {
    const id = String((req.params as any).id);
    const bk = list().find((x: any) => x.id === id);
    if (!bk) return reply.code(404).send({ error: '备份不存在' });
    const host = hostOf(bk.hostId || 'local')!;
    if (host.kind === 'local') {
      const full = bk.path; if (!existsSync(full)) return reply.code(404).send({ error: '归档文件不存在' });
      const st = statSync(full); if (st.size > 200 * 1024 * 1024) return reply.code(400).send({ error: '过大,请直接到主机取文件' });
      return { name: id + '.tar.gz', size: st.size, data: readFileSync(full).toString('base64') };
    }
    const r = await run(host, `cat ${bk.path} | base64 -w0`, 60000);
    return { name: id + '.tar.gz', size: bk.size, data: r.stdout };
  });
}
