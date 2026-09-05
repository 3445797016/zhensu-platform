// 系统管理:审计日志查询 + 开放 API 密钥管理(/api/open/v1/* 用 X-API-Key)。
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { listAudit, auditStat } from '../lib/audit.js';
import { audit } from '../lib/audit.js';
import type { Host } from '../lib/host.js';
import { listTasks } from '../modules/tasks.js';

const apikey = () => store.read('apikey', { enabled: false, key: '' });

export async function register(fastify: FastifyInstance) {
  // ---- 审计
  fastify.get('/audit', (req) => {
    const q = req.query as any;
    return { list: listAudit(Math.min(Number(q.limit) || 300, 1000), String(q.kw || ''), String(q.action || '')), stat: auditStat() };
  });

  // ---- 开放 API 密钥
  fastify.get('/apikey', () => { const k = apikey(); return { enabled: k.enabled, key: k.key ? k.key.slice(0, 8) + '…' + k.key.slice(-4) : '', hint: k.key ? k.key : '' }; });
  fastify.post('/apikey', (req) => {
    const b = (req.body || {}) as any;
    const k = apikey();
    if (b.enabled !== undefined) k.enabled = !!b.enabled;
    if (b.rotate) k.key = 'zh_' + randomBytes(24).toString('hex');
    if (!k.key) k.key = 'zh_' + randomBytes(24).toString('hex');
    store.write('apikey', k);
    audit('apikey', '开放API', `启用=${k.enabled} ${b.rotate ? '(已轮换密钥)' : ''}`);
    return { enabled: k.enabled, key: k.key };
  });

  // ---- OpenAPI(v1):需要 X-API-Key
  const open = async (req: any, reply: any, fn: () => any) => {
    const k = apikey();
    if (!k.enabled) return reply.code(403).send({ error: '未启用开放 API(系统→开放API 中开启)' });
    const key = req.headers['x-api-key'] || req.query?.key || '';
    if (!k.key || key !== k.key) return reply.code(401).send({ error: 'API Key 无效' });
    try { return fn(); } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  };
  fastify.get('/open/v1/meta', (req, reply) => open(req, reply, () => ({ name: '轸宿智汇平台', version: '1.0', api: 'v1', time: new Date().toISOString() })));
  fastify.get('/open/v1/health', (req, reply) => open(req, reply, () => store.read('metrics-latest', []).length ? { healthy: true, monitored: store.read('metrics-latest', []) } : { healthy: true }));
  fastify.get('/open/v1/hosts', (req, reply) => open(req, reply, () => store.list<Host>('hosts').map((h) => ({ id: h.id, name: h.name, kind: h.kind, host: h.host, port: h.port, user: h.user, os: h.os }))));
  fastify.get('/open/v1/audit', (req, reply) => open(req, reply, () => { const q = req.query as any; return listAudit(Math.min(Number(q.limit) || 100, 500), String(q.kw || '')); }));
  fastify.get('/open/v1/tasks', (req, reply) => open(req, reply, () => listTasks()));
}
