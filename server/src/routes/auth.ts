// 认证/登录(可开关):开启后全站 API 需要会话 cookie(防爆破:同 IP 5 次失败锁 5 分钟)。
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { store } from '../lib/store.js';
import { audit } from '../lib/audit.js';

export interface SecCfg { enabled: boolean; user?: string; nickname?: string; avatar?: string; salt?: string; hash?: string; sessions?: Record<string, string>; fail?: Record<string, { n: number; until: number }>; }
const sec = (): SecCfg => store.read('security', { enabled: false, sessions: {}, fail: {} });
const saveSec = (c: SecCfg) => store.write('security', c);
const sha = (salt: string, pwd: string) => createHash('sha256').update(salt + ':' + pwd).digest('hex');
const timingSafeEqualHex = (a: string, b: string) => {
  const aa = Buffer.from(a, 'hex'); const bb = Buffer.from(b, 'hex');
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const TTL = 24 * 3600 * 1000; // 会话有效期 24 小时
const profileOf = (c: SecCfg) => ({ username: c.user || 'root', nickname: c.nickname || '超级管理员', avatar: c.avatar || '#4f8cff' });
const readCookie = (h: any, name: string) => { const m = String(h.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : ''; };

export function validSession(cfg: SecCfg, token: string): boolean {
  if (!cfg.enabled) return true;
  if (!token) return false;
  const expiresAt = cfg.sessions?.[token];
  // Sessions are persisted with an ISO expiry.  The previous implementation
  // only checked that a token key existed, so an expired token remained valid
  // forever after a server restart.
  if (!expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}
export function authBlocked(cfg: SecCfg, ip: string): boolean {
  const f = cfg.fail?.[ip]; return !!f && f.n >= 5 && Date.now() < f.until;
}

export async function register(fastify: FastifyInstance) {
  fastify.get('/auth/status', () => { const c = sec(); return { enabled: !!c.enabled }; });
  fastify.get('/auth/me', (req, reply) => {
    const c = sec();
    if (!c.enabled) return { enabled: false, open: true };
    if (validSession(c, readCookie(req.headers, 'zs_sess'))) return { enabled: true, user: profileOf(c) };
    reply.code(401).send({ error: '未登录' });
  });
  fastify.post('/auth/login', (req, reply) => {
    const c = sec(); const ip = req.ip || '?';
    if (authBlocked(c, ip)) return reply.code(429).send({ error: '尝试过多,请稍后再试(5 分钟)' });
    const pwd = String((req.body as any)?.password || '');
    const user = String((req.body as any)?.username || '').trim() || 'root';
    if (user !== (c.user || 'root')) {
      c.fail = c.fail || {}; const f = c.fail[ip] = c.fail[ip] || { n: 0, until: 0 };
      f.n++; if (f.n >= 5) f.until = Date.now() + 5 * 60000;
      saveSec(c); audit('auth.fail', ip, '账号不存在'); return reply.code(401).send({ error: '账号或密码错误' });
    }
    const hashOk = !!c.salt && !!c.hash && timingSafeEqualHex(sha(c.salt, pwd), c.hash);
    if (!c.enabled || !hashOk) {
      c.fail = c.fail || {}; const f = c.fail[ip] = c.fail[ip] || { n: 0, until: 0 };
      f.n++; if (f.n >= 5) f.until = Date.now() + 5 * 60000;
      saveSec(c); audit('auth.fail', ip, `第 ${f.n} 次失败`); return reply.code(401).send({ error: '账号或密码错误' });
    }
    const token = randomBytes(24).toString('hex');
    c.sessions = c.sessions || {}; c.sessions[token] = new Date(Date.now() + TTL).toISOString();
    const ks = Object.keys(c.sessions); if (ks.length > 50) delete c.sessions[ks[0]];
    delete c.fail?.[ip];
    saveSec(c); audit('auth.login', user);
    const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
    reply.header('Set-Cookie', `zs_sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL / 1000}${secure}`);
    return { ok: true, user: profileOf(c) };
  });
  fastify.post('/auth/logout', (req, reply) => {
    const c = sec(); const t = readCookie(req.headers, 'zs_sess');
    if (c.sessions && t) delete c.sessions[t]; saveSec(c);
    const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
    reply.header('Set-Cookie', `zs_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    return { ok: true };
  });
  // 首次/重设口令:未开启时可任意设置;已开启需带当前密码
  fastify.post('/auth/setup', (req, reply) => {
    const c = sec(); const b = (req.body || {}) as any;
    const pwd = String(b.password || '');
    if (pwd.length < 6) return reply.code(400).send({ error: '密码至少 6 位' });
    if (c.enabled && !b.oldPassword) return reply.code(400).send({ error: '需提供当前密码' });
    if (c.enabled && (!c.salt || !c.hash || !timingSafeEqualHex(sha(c.salt, String(b.oldPassword)), c.hash))) return reply.code(401).send({ error: '当前密码错误' });
    const salt = randomBytes(12).toString('hex');
    c.salt = salt; c.hash = sha(salt, pwd); c.enabled = b.enabled !== false; c.sessions = {};
    saveSec(c); audit('auth.setup', '口令已更新', `启用=${c.enabled}`);
    return { ok: true, enabled: c.enabled };
  });

  // 个人资料(需已登录会话)
  fastify.get('/auth/profile', (req, reply) => {
    const c = sec();
    if (!validSession(c, readCookie(req.headers, 'zs_sess'))) return reply.code(401).send({ error: '未登录' });
    return profileOf(c);
  });
  fastify.put('/auth/profile', (req, reply) => {
    const c = sec();
    if (!validSession(c, readCookie(req.headers, 'zs_sess'))) return reply.code(401).send({ error: '未登录' });
    const b = (req.body || {}) as any;
    if (b.nickname !== undefined) c.nickname = String(b.nickname).slice(0, 30) || '超级管理员';
    if (b.avatar !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(b.avatar))) c.avatar = String(b.avatar);
    saveSec(c); audit('auth.profile', c.user || 'root', '资料已更新');
    return { ok: true, user: profileOf(c) };
  });
  // 修改密码(需旧密码)
  fastify.post('/auth/password', (req, reply) => {
    const c = sec();
    if (!validSession(c, readCookie(req.headers, 'zs_sess'))) return reply.code(401).send({ error: '未登录' });
    const b = (req.body || {}) as any;
    const pwd = String(b.newPassword || '');
    if (pwd.length < 6) return reply.code(400).send({ error: '新密码至少 6 位' });
    if (!c.salt || !c.hash || !timingSafeEqualHex(sha(c.salt, String(b.oldPassword)), c.hash)) return reply.code(401).send({ error: '当前密码错误' });
    const salt = randomBytes(12).toString('hex');
    c.salt = salt; c.hash = sha(salt, pwd);
    // 改密后其它会话全部失效
    const me = readCookie(req.headers, 'zs_sess');
    c.sessions = { [me]: new Date(Date.now() + TTL).toISOString() };
    saveSec(c); audit('auth.password', c.user || 'root', '密码已修改');
    return { ok: true };
  });
}
