// 认证/登录(可开关):开启后全站 API 需要会话 cookie(防爆破:同 IP 5 次失败锁 5 分钟)。
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { audit } from '../lib/audit.js';

export interface SecCfg { enabled: boolean; salt?: string; hash?: string; sessions?: Record<string, string>; fail?: Record<string, { n: number; until: number }>; }
const sec = (): SecCfg => store.read('security', { enabled: false, sessions: {}, fail: {} });
const saveSec = (c: SecCfg) => store.write('security', c);
const sha = (salt: string, pwd: string) => createHash('sha256').update(salt + ':' + pwd).digest('hex');
const readCookie = (h: any, name: string) => { const m = String(h.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : ''; };

export function validSession(cfg: SecCfg, token: string): boolean {
  if (!cfg.enabled) return true;
  return !!token && !!cfg.sessions?.[token];
}
export function authBlocked(cfg: SecCfg, ip: string): boolean {
  const f = cfg.fail?.[ip]; return !!f && f.n >= 5 && Date.now() < f.until;
}

export async function register(fastify: FastifyInstance) {
  fastify.get('/auth/status', () => { const c = sec(); return { enabled: !!c.enabled }; });
  fastify.get('/auth/me', (req, reply) => {
    const c = sec();
    if (!c.enabled) return { enabled: false, open: true };
    if (validSession(c, readCookie(req.headers, 'zs_sess'))) return { enabled: true, user: 'admin' };
    reply.code(401).send({ error: '未登录' });
  });
  fastify.post('/auth/login', (req, reply) => {
    const c = sec(); const ip = req.ip || '?';
    if (authBlocked(c, ip)) return reply.code(429).send({ error: '尝试过多,请稍后再试(5 分钟)' });
    const pwd = String((req.body as any)?.password || '');
    if (!c.enabled || !c.salt || sha(c.salt, pwd) !== c.hash) {
      c.fail = c.fail || {}; const f = c.fail[ip] = c.fail[ip] || { n: 0, until: 0 };
      f.n++; if (f.n >= 5) f.until = Date.now() + 5 * 60000;
      saveSec(c); audit('auth.fail', ip, `第 ${f.n} 次失败`); return reply.code(401).send({ error: '密码错误' });
    }
    const token = randomBytes(24).toString('hex');
    c.sessions = c.sessions || {}; c.sessions[token] = new Date(Date.now() + 3 * 86400000).toISOString();
    const ks = Object.keys(c.sessions); if (ks.length > 50) delete c.sessions[ks[0]];
    delete c.fail?.[ip];
    saveSec(c); audit('auth.login', 'admin');
    reply.header('Set-Cookie', `zs_sess=${token}; Path=/; HttpOnly; Max-Age=259200`);
    return { ok: true, user: 'admin' };
  });
  fastify.post('/auth/logout', (req, reply) => {
    const c = sec(); const t = readCookie(req.headers, 'zs_sess');
    if (c.sessions && t) delete c.sessions[t]; saveSec(c);
    reply.header('Set-Cookie', 'zs_sess=; Path=/; HttpOnly; Max-Age=0');
    return { ok: true };
  });
  // 首次/重设口令:未开启时可任意设置;已开启需带当前密码
  fastify.post('/auth/setup', (req, reply) => {
    const c = sec(); const b = (req.body || {}) as any;
    const pwd = String(b.password || '');
    if (pwd.length < 6) return reply.code(400).send({ error: '密码至少 6 位' });
    if (c.enabled && !b.oldPassword) return reply.code(400).send({ error: '需提供当前密码' });
    if (c.enabled && (!c.salt || sha(c.salt, String(b.oldPassword)) !== c.hash)) return reply.code(401).send({ error: '当前密码错误' });
    const salt = randomBytes(12).toString('hex');
    c.salt = salt; c.hash = sha(salt, pwd); c.enabled = b.enabled !== false; c.sessions = {};
    saveSec(c); audit('auth.setup', '口令已更新', `启用=${c.enabled}`);
    return { ok: true, enabled: c.enabled };
  });
}
