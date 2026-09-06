// 系统管理:审计日志查询 + 开放 API 密钥管理(/api/open/v1/* 用 X-API-Key)。
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { listAudit, auditStat } from '../lib/audit.js';
import { audit } from '../lib/audit.js';
import { enc, dec } from '../lib/secure.js';
import { decryptAll, masterKey } from '../lib/secure.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../lib/store.js';
import { sessionUser } from './auth.js';
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
  fastify.get('/apikey', () => { const k = apikey(); const p = k.key ? dec(k.key) : ''; return { enabled: k.enabled, key: p ? p.slice(0, 8) + '…' + p.slice(-4) : '', hint: p }; });
  fastify.post('/apikey', (req) => {
    const b = (req.body || {}) as any;
    const k = apikey();
    if (b.enabled !== undefined) k.enabled = !!b.enabled;
    if (b.rotate) k.key = enc('zh_' + randomBytes(24).toString('hex')) as string;
    if (!k.key) k.key = enc('zh_' + randomBytes(24).toString('hex')) as string;
    else if (!String(k.key).startsWith('enc:v1:')) k.key = enc(k.key) as string;
    store.write('apikey', k);
    audit('apikey', '开放API', `启用=${k.enabled} ${b.rotate ? '(已轮换密钥)' : ''}`);
    return { enabled: k.enabled, key: k.key ? dec(k.key) : '' };
  });

  // ---- OpenAPI(v1):需要 X-API-Key
  const open = async (req: any, reply: any, fn: () => any) => {
    const k = apikey();
    if (!k.enabled) return reply.code(403).send({ error: '未启用开放 API(系统→开放API 中开启)' });
    const key = req.headers['x-api-key'] || req.query?.key || '';
    if (!k.key || key !== dec(k.key)) return reply.code(401).send({ error: 'API Key 无效' });
    try { return fn(); } catch (e: any) { return reply.code(500).send({ error: String(e?.message || e) }); }
  };
  fastify.get('/open/v1/meta', (req, reply) => open(req, reply, () => ({ name: '轸宿智汇平台', version: '1.0', api: 'v1', time: new Date().toISOString() })));
  fastify.get('/open/v1/health', (req, reply) => open(req, reply, () => store.read('metrics-latest', []).length ? { healthy: true, monitored: store.read('metrics-latest', []) } : { healthy: true }));
  fastify.get('/open/v1/hosts', (req, reply) => open(req, reply, () => store.list<Host>('hosts').map((h) => ({ id: h.id, name: h.name, kind: h.kind, host: h.host, port: h.port, user: h.user, os: h.os }))));
  fastify.get('/open/v1/audit', (req, reply) => open(req, reply, () => { const q = req.query as any; return listAudit(Math.min(Number(q.limit) || 100, 500), String(q.kw || '')); }));
  fastify.get('/open/v1/tasks', (req, reply) => open(req, reply, () => listTasks()));

  // ---- 凭据加密状态 + 解密回退(仅管理员, 防锁死)
  const admin = (req: any, reply: any) => {
    const secCfg = store.read<any>('security', {});
    if (!secCfg.enabled) { reply.code(403).send({ error: '请先启用登录保护' }); return false; }
    const m = String(req.headers.cookie || '').match(/zs_sess=([^;]+)/);
    const tok = m ? decodeURIComponent(m[1]) : '';
    const u = sessionUser(secCfg, tok);
    if (!u) { reply.code(401).send({ error: '未登录' }); return false; }
    if (u.role !== 'admin') { reply.code(403).send({ error: '需要管理员权限' }); return false; }
    return true;
  };
  const countEnc = () => {
    let n = 0;
    for (const h of store.list<any>('hosts')) { if (String(h?.password || '').startsWith('enc:v1:')) n++; if (String(h?.privateKey || '').startsWith('enc:v1:')) n++; }
    for (const c of store.list<any>('dbconns')) if (String(c?.password || '').startsWith('enc:v1:')) n++;
    const ai = store.read<any>('ai', {}); for (const ov of Object.values(ai.providers || {})) { const o = ov as any; if (String(o?.apiKey || '').startsWith('enc:v1:')) n++; }
    const k = store.read<any>('apikey', {}); if (String(k?.key || '').startsWith('enc:v1:')) n++;
    return n;
  };
  fastify.get('/system/secure-status', (req, reply) => {
    if (!admin(req, reply)) return reply;
    return { masterKey: existsSync(join(DATA_DIR, '.masterkey')), encryptedFields: countEnc() };
  });
  fastify.post('/system/decrypt-store', (req, reply) => {
    if (!admin(req, reply)) return reply;
    const { confirm } = (req.body || {}) as any;
    if (confirm !== 'DECRYPT') return reply.code(400).send({ error: '需传 confirm="DECRYPT"' });
    decryptAll();
    audit('system', '凭据', '已执行解密回退(明文存储)');
    return { ok: true, msg: '已回退为明文存储。确认无误后请重新加密(重启服务自动迁移)。' };
  });
}
